/* =========================================================
   NEXUS CD · cena3d.js
   Galpão 3D (Three.js r128): prédio, docas, pátio, portaria,
   armazém, câmaras frias, telhado solar e caminhões ao vivo.
   Unidade: 1 = 1 metro. Prédio de 160 × 80 m.
   ========================================================= */
NX.telas = NX.telas || {};

NX.telas.galpao = (function () {
  const U = NX.util;
  let st = null; // estado da cena enquanto a tela está aberta

  /* ---------------- Medidas do site ---------------- */
  const GX = 80, GZ = 40, GH = 12, PISO = 1.2;
  const FAIXA_Z = 70;                        // corredor de manobra em frente às docas
  const PORTAO_Z = 176;
  /* Vias do pátio (mão única) */
  const VIA_ENTRA_X = -4, VIA_SAI_X = 4;     // pista de entrada (desce) e de saída (sobe)
  const BAL_Z = 160;                         // centro das balanças de entrada e saída
  const CORREDOR_Z = 115;                    // corredor entre as duas fileiras de vagas
  const DOCA_ENTRA_Z = 73, DOCA_SAI_Z = 67;  // faixas de manobra em frente às docas
  const ESTRADA_Z = 305;
  const FILA1_Z = 92, FILA2_Z = 138;         // centro das duas fileiras de vagas
  const docaX = id => (id <= 6 ? -70 + (id - 1) * 10 : 20 + (id - 7) * 10);
  const COMP = { 'VUC': 7, 'Toco': 9, 'Truck': 11, 'Carreta': 18, 'Bitrem': 22, 'Truck frigorífico': 11, 'Carreta frigorífica': 18 };
  const COR_STATUS = {
    's-livre': 0x3a4656, 's-manobra': 0xf5a524, 's-descarga': 0x4c8dff,
    's-carga': 0x2ec27e, 's-conf': 0xa78bfa, 's-nf': 0xf472b6
  };

  /* vagas do pátio: 2 fileiras, 22 vagas cada */
  const VAGAS = [];
  for (const z of [FILA1_Z, FILA2_Z]) for (let k = 0; k < 11; k++) {
    VAGAS.push({ x: -(10 + k * 6.4), z });
    VAGAS.push({ x: 10 + k * 6.4, z });
  }

  /* ---------------- Utilidades 3D ---------------- */
  let CUBO, mats;
  function mat(cor, extra) {
    const k = cor + '|' + JSON.stringify(extra || {});
    return mats[k] || (mats[k] = new THREE.MeshStandardMaterial(Object.assign({ color: cor, roughness: 0.85, metalness: 0.05 }, extra)));
  }
  function caixa(w, h, d, cor, extra) {
    const m = new THREE.Mesh(CUBO, typeof cor === 'object' ? cor : mat(cor, extra));
    m.scale.set(w, h, d);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }
  function pos(grupo, obj, x, y, z) { obj.position.set(x, y, z); grupo.add(obj); return obj; }
  function instanciado(lista, material, sombra = true) {
    const im = new THREE.InstancedMesh(CUBO, material, Math.max(1, lista.length));
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
    lista.forEach((b, i) => {
      p.set(b.x, b.y, b.z); s.set(b.w, b.h, b.d);
      q.setFromEuler(e.set(b.rx || 0, b.ry || 0, 0));
      m.compose(p, q, s); im.setMatrixAt(i, m);
      if (b.cor != null) im.setColorAt(i, new THREE.Color(b.cor));
    });
    im.count = lista.length;
    im.castShadow = sombra; im.receiveShadow = true;
    return im;
  }
  function plano(w, d, cor, x, y, z, extra) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(cor, extra));
    m.rotation.x = -Math.PI / 2; m.position.set(x, y, z);
    m.receiveShadow = true;
    return m;
  }

  /* Etiquetas (texto sempre virado para a câmera) */
  function rotulo(texto, opc = {}) {
    const cv = document.createElement('canvas');
    const ctx = cv.getContext('2d');
    const tex = new THREE.CanvasTexture(cv);
    tex.minFilter = THREE.LinearFilter;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sp.renderOrder = 10;
    const escala = opc.escala || 3;
    sp.desenhar = function (txt, fundo, cor) {
      const fs = 44, pad = 22;
      ctx.font = `700 ${fs}px Inter, system-ui, sans-serif`;
      const w = Math.ceil(ctx.measureText(txt).width) + pad * 2;
      cv.width = w; cv.height = 72;
      ctx.font = `700 ${fs}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = fundo || 'rgba(10,14,19,.82)';
      const r = 14;
      ctx.beginPath();
      ctx.moveTo(r, 0); ctx.arcTo(w, 0, w, 72, r); ctx.arcTo(w, 72, 0, 72, r); ctx.arcTo(0, 72, 0, 0, r); ctx.arcTo(0, 0, w, 0, r);
      ctx.fill();
      ctx.fillStyle = cor || '#e7edf4';
      ctx.textBaseline = 'middle';
      ctx.fillText(txt, pad, 38);
      tex.needsUpdate = true;
      sp.scale.set((w / 72) * escala, escala, 1);
      sp._txt = txt + fundo + cor;
    };
    sp.desenhar(texto, opc.fundo, opc.cor);
    return sp;
  }

  /* ---------------- Construção do cenário ---------------- */
  function construirTerreno(g) {
    g.add(plano(1400, 1400, 0x1f2b1f, 0, -0.05, 60));                 // grama
    g.add(plano(184, 140, 0x2a2e34, 0, 0.01, 107));                   // pátio
    g.add(plano(184, 14, 0x2a2e34, 0, 0.01, -48));                    // contorno de trás
    g.add(plano(18, 112, 0x262a30, 0, 0.012, 232));                   // acesso
    g.add(plano(1400, 16, 0x24282d, 0, 0.012, 290));                  // rodovia
    // faixas da rodovia e do acesso
    const tracos = [];
    for (let x = -680; x < 680; x += 12) tracos.push({ x, y: 0.03, z: 290, w: 6, h: 0.02, d: 0.3, cor: 0xe5c84a });
    for (let z = 180; z < 282; z += 10) tracos.push({ x: 0, y: 0.03, z, w: 0.3, h: 0.02, d: 5, cor: 0xe7edf4 });
    // divisória das pistas de entrada e saída dentro do pátio
    for (let z = 78; z < 172; z += 8) tracos.push({ x: 0, y: 0.03, z, w: 0.25, h: 0.02, d: 4, cor: 0xe7edf4 });
    // setas de mão única
    for (const z of [100, 130]) {
      tracos.push({ x: VIA_ENTRA_X, y: 0.03, z, w: 0.5, h: 0.02, d: 3, cor: 0xe7edf4 });
      tracos.push({ x: VIA_SAI_X, y: 0.03, z, w: 0.5, h: 0.02, d: 3, cor: 0xe7edf4 });
    }
    // vagas do pátio
    for (const v of VAGAS) {
      tracos.push({ x: v.x - 3.2, y: 0.03, z: v.z, w: 0.18, h: 0.02, d: 23, cor: 0xc9d1da });
      tracos.push({ x: v.x + 3.2, y: 0.03, z: v.z, w: 0.18, h: 0.02, d: 23, cor: 0xc9d1da });
    }
    // corredor de manobra (faixa amarela tracejada)
    for (let x = -86; x < 86; x += 6) tracos.push({ x, y: 0.03, z: FAIXA_Z, w: 3, h: 0.02, d: 0.25, cor: 0xf5a524 });
    // faixa de piso em frente às docas
    tracos.push({ x: 0, y: 0.03, z: 63, w: 172, h: 0.02, d: 0.3, cor: 0xe7edf4 });
    g.add(instanciado(tracos, new THREE.MeshBasicMaterial({ color: 0xffffff }), false));

    // cerca
    const cerca = [];
    const lado = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(x1 - x0, z1 - z0);
      cerca.push({ x: (x0 + x1) / 2, y: 1.1, z: (z0 + z1) / 2, w: 0.12, h: 2.2, d: len, ry: ang, cor: 0x56616e });
      for (let i = 0; i <= len; i += 6) cerca.push({ x: x0 + Math.sin(ang) * i, y: 1.2, z: z0 + Math.cos(ang) * i, w: 0.18, h: 2.4, d: 0.18, cor: 0x6c7886 });
    };
    lado(-92, -56, 92, -56); lado(-92, -56, -92, PORTAO_Z); lado(92, -56, 92, PORTAO_Z);
    lado(-92, PORTAO_Z, -10, PORTAO_Z); lado(10, PORTAO_Z, 92, PORTAO_Z);
    const mc = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, transparent: true, opacity: 0.55 });
    g.add(instanciado(cerca, mc, false));
  }

  function construirPredio(g) {
    // laje elevada (altura de doca)
    pos(g, caixa(160, PISO, 80, 0x6b737d), 0, PISO / 2, 0);
    const piso = plano(159, 79, 0x7a828b, 0, PISO + 0.01, 0);
    g.add(piso);

    // marcações internas: área de staging em frente às docas
    const m = [];
    m.push({ x: 0, y: PISO + 0.03, z: 28.5, w: 156, h: 0.02, d: 0.25, cor: 0xf5a524 });
    for (let id = 1; id <= 12; id++) m.push({ x: docaX(id), y: PISO + 0.03, z: 34, w: 4.2, h: 0.02, d: 11, cor: 0x5e6670 });
    m.push({ x: 0, y: PISO + 0.03, z: 2, w: 156, h: 0.02, d: 4, cor: 0x6c747e }); // corredor central
    g.add(instanciado(m, new THREE.MeshBasicMaterial({ color: 0xffffff }), false));

    // paredes: parte baixa sempre visível, parte alta só com o telhado
    const corParede = 0x4a5563;
    const baixa = new THREE.Group(), alta = new THREE.Group();
    const parede = (grupo, w, h, d, x, y, z, cor = corParede) => pos(grupo, caixa(w, h, d, cor), x, y, z);
    // fundo e laterais
    parede(baixa, 160, 5.6, 0.4, 0, PISO + 2.8, -GZ);
    parede(alta, 160, 5.2, 0.4, 0, PISO + 8.2, -GZ);
    parede(baixa, 0.4, 5.6, 80, -GX, PISO + 2.8, 0); parede(alta, 0.4, 5.2, 80, -GX, PISO + 8.2, 0);
    parede(baixa, 0.4, 5.6, 80, GX, PISO + 2.8, 0); parede(alta, 0.4, 5.2, 80, GX, PISO + 8.2, 0);
    // frente: trechos entre as portas
    const portas = NX.CD.docas.map(d => docaX(d.id)).sort((a, b) => a - b);
    let x0 = -GX;
    for (const px of portas) {
      const a = px - 1.9;
      if (a > x0) parede(baixa, a - x0, 5.6, 0.4, (a + x0) / 2, PISO + 2.8, GZ);
      parede(baixa, 3.8, 1.8, 0.4, px, PISO + 4.7, GZ); // verga acima da porta
      x0 = px + 1.9;
    }
    parede(baixa, GX - x0, 5.6, 0.4, (GX + x0) / 2, PISO + 2.8, GZ);
    parede(alta, 160, 5.2, 0.4, 0, PISO + 8.2, GZ);
    // faixa amarela da marca no topo da fachada
    pos(alta, caixa(160.2, 0.8, 0.5, 0xf5a524), 0, PISO + 10.2, GZ + 0.05);
    g.add(baixa); g.add(alta);
    st.paredesAltas = alta;

    // escritório administrativo / fiscal na frente
    const esc = new THREE.Group();
    pos(esc, caixa(24, 8, 13, 0x56606c), 0, 4, 47.5);
    const vidro = new THREE.MeshStandardMaterial({ color: 0x1a2533, emissive: 0x000000, roughness: 0.2, metalness: 0.4 });
    st.matJanelas = vidro;
    pos(esc, caixa(22, 1.6, 0.2, vidro), 0, 2.6, 54.05);
    pos(esc, caixa(22, 1.6, 0.2, vidro), 0, 6.0, 54.05);
    pos(esc, caixa(0.2, 1.6, 11, vidro), 12.05, 6.0, 47.5);
    pos(esc, caixa(0.2, 1.6, 11, vidro), -12.05, 6.0, 47.5);
    pos(esc, caixa(25, 0.5, 14, 0x3a434e), 0, 8.25, 47.5);
    g.add(esc);
    const lbEsc = rotulo('Administrativo · Fiscal', { escala: 2.6 });
    lbEsc.position.set(0, 11, 54); g.add(lbEsc);
  }

  function construirTelhado(g) {
    const t = new THREE.Group();
    pos(t, caixa(161, 0.5, 81, 0x2b323b), 0, PISO + GH - 1.0 + 0.25, 0);
    const paineis = [];
    for (let x = -76; x <= 76; x += 2.35) for (let z = -37; z <= 37; z += 1.75) {
      if (Math.abs(x) < 3) continue; // passarela de manutenção
      paineis.push({ x, y: PISO + GH - 0.45, z, w: 2.2, h: 0.08, d: 1.6, rx: -0.12 });
    }
    const mp = new THREE.MeshStandardMaterial({ color: 0x1c2f55, roughness: 0.25, metalness: 0.6, emissive: 0x0a1630 });
    t.add(instanciado(paineis, mp, false));
    st.qtdPaineis = paineis.length;
    t.visible = false;
    g.add(t);
    st.telhado = t;
  }

  function construirArmazem(g) {
    const postes = [], vigas = [];
    const pal = { seca: [], resfriada: [], congelada: [] };
    const linha = (x0, x1, z, area) => {
      const baias = Math.floor((x1 - x0) / 2.7);
      for (let b = 0; b <= baias; b++) postes.push({ x: x0 + b * 2.7, y: PISO + 3.5, z, w: 0.12, h: 7, d: 1.1 });
      for (let b = 0; b < baias; b++) for (let n = 0; n < 4; n++) {
        const y = PISO + 0.1 + n * 1.75;
        vigas.push({ x: x0 + b * 2.7 + 1.35, y, z: z + 0.55, w: 2.7, h: 0.12, d: 0.08 });
        vigas.push({ x: x0 + b * 2.7 + 1.35, y, z: z - 0.55, w: 2.7, h: 0.12, d: 0.08 });
        pal[area].push({ x: x0 + b * 2.7 + 1.35, y: y + 0.62, z, w: 2.3, h: 1.0, d: 1.05 });
      }
    };
    for (let z = -35; z <= -4; z += 3.5) linha(-77, 77, z, 'seca');
    for (let z = 9; z <= 25; z += 3.5) { linha(-77, -38, z, 'seca'); linha(38, 77, z, 'seca'); }
    for (let z = 11; z <= 32; z += 3.5) { linha(-32, -3, z, 'resfriada'); linha(3, 32, z, 'congelada'); }

    g.add(instanciado(postes, mat(0x2f6fd1, { metalness: 0.3 })));
    g.add(instanciado(vigas, mat(0xe0702a, { metalness: 0.3 }), false));

    // paletes: ordem embaralhada para a ocupação parecer real
    const R = NX.criarRNG(42);
    const coresSeca = [0xc9a46c, 0xb88d55, 0xd9c19a, 0xa97d4a, 0xd4d8de, 0x9fb0c4];
    st.paletes = {};
    for (const area of ['seca', 'resfriada', 'congelada']) {
      const lista = pal[area].map(p => ({ ...p, ord: R() }));
      lista.sort((a, b) => a.ord - b.ord);
      lista.forEach(p => p.cor = area === 'seca' ? R.item(coresSeca) : area === 'resfriada' ? R.item([0xe6f2f6, 0xcfe6ee, 0xf3e3c3]) : R.item([0xcde4f5, 0xb7d3ec, 0xe2eef8]));
      const im = instanciado(lista, mat(0xffffff));
      g.add(im);
      st.paletes[area] = { im, total: lista.length };
    }

    // câmaras frias: paredes translúcidas + contorno
    st.camaras = {};
    const camaras = [
      { k: 'resfriada', x: -17, cor: 0x38d6f0 },
      { k: 'congelada', x: 17, cor: 0x7aa8ff }
    ];
    for (const c of camaras) {
      const w = 34, d = 28, h = 8, cz = 22;
      const vidro = new THREE.Mesh(CUBO, new THREE.MeshStandardMaterial({ color: c.cor, transparent: true, opacity: 0.12, depthWrite: false, roughness: 0.1 }));
      vidro.scale.set(w, h, d); vidro.position.set(c.x, PISO + h / 2, cz);
      g.add(vidro);
      const borda = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), new THREE.LineBasicMaterial({ color: c.cor }));
      borda.position.copy(vidro.position);
      g.add(borda);
      const lb = rotulo('', { escala: 2.6 });
      lb.position.set(c.x, PISO + h + 3, cz);
      g.add(lb);
      st.camaras[c.k] = { vidro, borda, lb, cor: c.cor };
    }

    // rótulos de área
    const area = (txt, x, z) => { const l = rotulo(txt, { escala: 2.4, fundo: 'rgba(245,165,36,.92)', cor: '#0b0f14' }); l.position.set(x, PISO + 10, z); g.add(l); };
    area('Área seca · porta-paletes', 0, -20);
    area('Recebimento', -45, 33);
    area('Expedição', 45, 33);

    // luminárias do teto
    const lum = [];
    for (let x = -70; x <= 70; x += 14) for (let z = -32; z <= 32; z += 12) lum.push({ x, y: PISO + 10.4, z, w: 5, h: 0.15, d: 0.5 });
    st.matLuminaria = new THREE.MeshStandardMaterial({ color: 0x9aa4ae, emissive: 0xfff1d0, emissiveIntensity: 0 });
    g.add(instanciado(lum, st.matLuminaria, false));
  }

  function construirDocas(g) {
    st.docas = {};
    for (const d of NX.CD.docas) {
      const x = docaX(d.id);
      // vedação (preta) + porta seccional colorida pelo status
      pos(g, caixa(4.4, 4.6, 0.6, 0x15191e), x, PISO + 2.1, GZ + 0.35);
      const matPorta = new THREE.MeshStandardMaterial({ color: 0x3a4656, roughness: 0.6, metalness: 0.2, emissive: 0x000000 });
      const porta = caixa(3.4, 3.6, 0.2, matPorta);
      porta.position.set(x, PISO + 1.8, GZ + 0.7);
      porta.userData = { tipo: 'doca', id: d.id };
      g.add(porta);
      // nivelador e batentes
      pos(g, caixa(3.2, 0.3, 1.2, 0x2c3238), x, PISO - 0.15, GZ + 0.6);
      pos(g, caixa(0.4, 0.5, 0.3, 0x111111), x - 1.5, PISO - 0.6, GZ + 0.25);
      pos(g, caixa(0.4, 0.5, 0.3, 0x111111), x + 1.5, PISO - 0.6, GZ + 0.25);
      // sinaleiro
      const matLuz = new THREE.MeshStandardMaterial({ color: 0x222, emissive: 0x2ec27e, emissiveIntensity: 1.4 });
      const luz = caixa(0.5, 0.5, 0.3, matLuz);
      luz.position.set(x + 2.6, PISO + 4.2, GZ + 0.4);
      g.add(luz);
      // número
      const lb = rotulo(String(d.id).padStart(2, '0'), { escala: 2.2 });
      lb.position.set(x, PISO + 7.6, GZ + 1);
      g.add(lb);
      if (d.fria) {
        const fr = rotulo('❄', { escala: 1.6, fundo: 'rgba(56,214,240,.9)', cor: '#0b0f14' });
        fr.position.set(x, PISO + 9.4, GZ + 1); g.add(fr);
      }
      st.docas[d.id] = { porta, matPorta, matLuz, lb, x };
      st.clicaveis.push(porta);
    }
  }

  function construirPortaria(g) {
    // duas balanças rodoviárias: entrada (pista da esquerda) e saída (pista da direita)
    for (const x of [VIA_ENTRA_X, VIA_SAI_X]) {
      pos(g, caixa(4.4, 0.25, 20, 0x8a929b), x, 0.12, BAL_Z);
      pos(g, caixa(4.8, 0.12, 0.3, 0xf5a524), x, 0.2, BAL_Z - 10.1);
      pos(g, caixa(4.8, 0.12, 0.3, 0xf5a524), x, 0.2, BAL_Z + 10.1);
    }
    const lbBe = rotulo('Balança · entrada', { escala: 1.8 }); lbBe.position.set(VIA_ENTRA_X - 4, 5, BAL_Z); g.add(lbBe);
    const lbBs = rotulo('Balança · saída', { escala: 1.8 }); lbBs.position.set(VIA_SAI_X + 4, 5, BAL_Z); g.add(lbBs);
    // guarita
    pos(g, caixa(5, 3.2, 4, 0xd5dbe2), 14, 1.6, PORTAO_Z + 2);
    pos(g, caixa(6, 0.4, 5, 0x3a434e), 14, 3.4, PORTAO_Z + 2);
    const vg = new THREE.MeshStandardMaterial({ color: 0x1a2533, roughness: 0.2, metalness: 0.4 });
    pos(g, caixa(5.05, 1.2, 2.5, vg), 14, 2.1, PORTAO_Z + 2);
    // cancelas
    pos(g, caixa(8, 0.18, 0.18, 0xe5484d), -5, 1.1, PORTAO_Z);
    pos(g, caixa(8, 0.18, 0.18, 0xe5484d), 5, 1.1, PORTAO_Z);
    pos(g, caixa(0.5, 1.2, 0.5, 0x2a2e34), -9.4, 0.6, PORTAO_Z);
    pos(g, caixa(0.5, 1.2, 0.5, 0x2a2e34), 9.4, 0.6, PORTAO_Z);
    const lb = rotulo('Portaria', { escala: 2.4 });
    lb.position.set(14, 8, PORTAO_Z + 2); g.add(lb);
    const lp = rotulo('Pátio de caminhões', { escala: 2.4 });
    lp.position.set(-45, 9, CORREDOR_Z); g.add(lp);

    // postes de iluminação do pátio
    const postes = [], cabecas = [];
    for (const x of [-90, 90]) for (const z of [50, 82, 115, 148, 172]) {
      postes.push({ x, y: 6, z, w: 0.35, h: 12, d: 0.35 });
      cabecas.push({ x: x * 0.97, y: 12, z, w: 2.2, h: 0.3, d: 0.8 });
    }
    g.add(instanciado(postes, mat(0x5c6773)));
    st.matPostes = new THREE.MeshStandardMaterial({ color: 0x7c8794, emissive: 0xffe2a8, emissiveIntensity: 0 });
    g.add(instanciado(cabecas, st.matPostes, false));
  }

  /* ---------------- Empilhadeiras ---------------- */
  function construirEmpilhadeiras(g) {
    st.empilhadeiras = {};
    for (const d of NX.CD.docas) {
      const e = new THREE.Group();
      pos(e, caixa(1.2, 1.1, 2.0, 0xf2b705), 0, 0.75, 0);
      pos(e, caixa(1.1, 0.12, 1.0, 0x222), 0, 2.1, -0.2);
      pos(e, caixa(0.12, 1.6, 0.12, 0x222), -0.5, 1.5, 0.3);
      pos(e, caixa(0.12, 1.6, 0.12, 0x222), 0.5, 1.5, 0.3);
      pos(e, caixa(1.1, 2.6, 0.15, 0x333), 0, 1.4, 1.05);
      pos(e, caixa(0.15, 0.08, 1.2, 0x555), -0.35, 0.2, 1.7);
      pos(e, caixa(0.15, 0.08, 1.2, 0x555), 0.35, 0.2, 1.7);
      const carga = caixa(1.1, 1.0, 1.1, 0xc9a46c); carga.position.set(0, 0.75, 1.75); e.add(carga);
      e.userData.carga = carga;
      e.visible = false;
      e.position.y = PISO;
      g.add(e);
      st.empilhadeiras[d.id] = e;
    }
  }

  /* ---------------- Caminhões ---------------- */
  function criarCaminhao(c) {
    const gr = new THREE.Group();
    const len = COMP[c.veiculo] || 12;
    const T = NX.sim.transportadora(c.transportadora);
    const corT = new THREE.Color(T.cor).getHex();
    const cabLen = 2.6, bauLen = len - cabLen - 0.5;
    const bau = caixa(2.5, 3.3, bauLen, c.frio ? 0xeef6f9 : 0xdfe3e8);
    bau.position.set(0, 2.75, bauLen / 2); gr.add(bau);
    pos(gr, caixa(2.52, 0.35, bauLen * 0.86, corT), 0, 2.0, bauLen / 2);
    if (c.frio) pos(gr, caixa(1.9, 1.3, 0.6, 0x9aa4ae), 0, 3.2, bauLen + 0.25);
    pos(gr, caixa(2.0, 0.45, len, 0x22272d), 0, 0.85, len / 2);
    const cab = caixa(2.45, 2.6, cabLen, corT);
    cab.position.set(0, 2.2, bauLen + 0.5 + cabLen / 2); gr.add(cab);
    pos(gr, caixa(2.2, 1.0, 0.1, 0x101820, { roughness: 0.2, metalness: 0.5 }), 0, 2.8, len + 0.02);
    // rodas
    const eixos = [1.2, 2.6, bauLen * 0.5 > 6 ? bauLen - 1.5 : null, len - 1.3].filter(v => v != null);
    for (const z of eixos) for (const s of [-1, 1]) pos(gr, caixa(0.45, 1.0, 1.0, 0x111316), s * 1.1, 0.5, z);
    gr.traverse(o => { if (o.isMesh) o.userData = { tipo: 'caminhao', id: c.id }; });
    gr.userData.len = len;
    return gr;
  }

  /* ---------------- Movimento dos caminhões ----------------
     Cada caminhão segue uma rota de pontos (pelo CENTRO do veículo),
     anda em velocidade constante, gira no lugar antes de mudar de direção,
     respeita a mão das pistas, para nas balanças e não entra em outro caminhão. */
  const VEL = 16, GIRO = 2.2;                 // m/s e rad/s na velocidade 60× (tempo acelerado)
  const ATIVOS_DOCA = ['manobra', 'operando', 'conferencia', 'aguardando_nf'];
  const angulo = a => Math.atan2(Math.sin(a), Math.cos(a));
  const fator = () => Math.max(0.6, Math.min(8, NX.sim.velocidade / 60));
  const MAX_CAMINHOES = 45;
  const docadoZ = rec => GZ + 0.9 + rec.len / 2;

  function aplicarPose(rec) {
    rec.g.rotation.y = rec.r;
    rec.g.position.set(rec.cx - Math.sin(rec.r) * rec.len / 2, 0, rec.cz - Math.cos(rec.r) * rec.len / 2);
  }
  function eixo(cx, cz, r, len) {
    const h = Math.max(0, len / 2 - 1.3), sx = Math.sin(r) * h, sz = Math.cos(r) * h;
    return [cx - sx, cz - sz, cx + sx, cz + sz];
  }
  function distSeg(a, b) {
    const pt = (px, pz, s) => {
      const vx = s[2] - s[0], vz = s[3] - s[1], l2 = vx * vx + vz * vz;
      const t = l2 ? Math.max(0, Math.min(1, ((px - s[0]) * vx + (pz - s[1]) * vz) / l2)) : 0;
      return Math.hypot(px - (s[0] + t * vx), pz - (s[1] + t * vz));
    };
    return Math.min(pt(a[0], a[1], b), pt(a[2], a[3], b), pt(b[0], b[1], a), pt(b[2], b[3], a));
  }
  /* Devolve o caminhão que impede o próximo passo (andar ou girar), ou null.
     - longe (>= 3,5 m entre eixos): livre
     - nunca pode chegar mais perto de quem já está perto
     - ao andar, quem está à frente (no sentido do movimento) sempre bloqueia */
  function bloqueado(rec, nx, nz, nr) {
    const r1 = nr == null ? rec.r : nr;
    const a1 = eixo(nx, nz, r1, rec.len), a0 = eixo(rec.cx, rec.cz, rec.r, rec.len);
    const mx = nx - rec.cx, mz = nz - rec.cz, gira = nr != null;
    for (const o of st.caminhoes.values()) {
      if (o === rec) continue;
      const b = eixo(o.cx, o.cz, o.r, o.len);
      const d1 = distSeg(a1, b);
      if (d1 >= 3.5) continue;
      const d0 = distSeg(a0, b);
      if (d1 < d0 - 1e-4) return o;
      if (!gira && (o.cx - rec.cx) * mx + (o.cz - rec.cz) * mz > 0) return o;
    }
    return null;
  }
  /* espera quem está bloqueado; em impasse mútuo, um dos dois passa */
  function podePassar(rec, o, dt, gira) {
    rec.girando = !!gira;
    if (!o) { rec.bloqueadoPor = null; rec.espera = 0; return true; }
    rec.bloqueadoPor = o; rec.espera += dt;
    const ob = o.bloqueadoPor;
    const mutuo = ob === rec || (ob && ob.bloqueadoPor === rec);
    if (!mutuo || rec.espera < 1.5) return false;
    // impasse: quem está manobrando (girando no lugar) termina primeiro e sai na frente
    if (!!gira !== !!o.girando) return !!gira;
    return rec.c.id < o.c.id;
  }
  function girar(rec, alvoR, dt, F) {
    const dr = angulo(alvoR - rec.r);
    const nr = angulo(rec.r + Math.sign(dr) * Math.min(Math.abs(dr), GIRO * F * dt));
    if (podePassar(rec, bloqueado(rec, rec.cx, rec.cz, nr), dt, true)) rec.r = nr;
  }

  /* Reservas de manobra. Cada zona tem dono; quem não é dono espera FORA dela,
     num ponto que não atrapalha ninguém:
     - doca: em frente às docas, um caminhão por vez encosta de ré ou sai, num raio de 25 m
     - corredor: corredor entre as fileiras de vagas (entrar/sair de vaga e cruzar o corredor)
     - cruz: cruzamento central em frente às docas, onde a pista de entrada vira para as docas
       e as duas faixas de saída se juntam na pista que leva à balança */
  const CRUZ_X = 16, CRUZ_Z = 88;
  const TUDO = [-1e9, 1e9];
  const ZONAS = {
    doca: { x0: -1e9, x1: 1e9, z0: DOCA_SAI_Z - 5, z1: DOCA_ENTRA_Z + 5, margem: 28 },
    corredor: { x0: -1e9, x1: 1e9, z0: CORREDOR_Z - 8, z1: CORREDOR_Z + 8, margem: 1 },
    cruz: { x0: -CRUZ_X, x1: CRUZ_X, z0: DOCA_SAI_Z - 8, z1: CRUZ_Z, margem: 1e9 }
  };
  const naZona = (rec, Z) => rec.cz > Z.z0 && rec.cz < Z.z1 && rec.cx > Z.x0 && rec.cx < Z.x1;
  const cruza = (a, b, c, d) => a < d && c < b;                // intervalos [a,b] e [c,d] se encostam
  /* cada reserva é um trecho [a, b] no eixo x da zona */
  function podeReservar(rec, zona, a, b, docaLivre) {
    const Z = ZONAS[zona];
    if (rec.res[zona]) return true;
    for (const o of st.caminhoes.values()) {
      if (o === rec) continue;
      const r = o.res[zona];
      if (r && cruza(r.a, r.b, a, b)) return false;
      // ninguém passando por perto na faixa
      if (!o.naDoca && naZona(o, Z) && cruza(o.cx - o.len / 2, o.cx + o.len / 2, a - Z.margem, b + Z.margem)) return false;
      if (docaLivre && Math.abs(o.cx - (a + b) / 2) < 2 && o.cz < DOCA_SAI_Z - 2) return false;
    }
    return true;
  }
  /* w.reservas = [[zona, a, b], ...] — pega todas de uma vez ou nenhuma */
  function reservar(rec, w) {
    if (!w.reservas.every(([z, a, b]) => podeReservar(rec, z, a, b, w.docaLivre))) return false;
    for (const [z, a, b] of w.reservas) if (!rec.res[z]) rec.res[z] = { a, b, x: (a + b) / 2, saida: !!w.saida, entrou: false };
    return true;
  }
  function conferirReservas(rec) {
    for (const zona in rec.res) {
      const m = rec.res[zona];
      if (!m || !m.saida) continue;
      if (naZona(rec, ZONAS[zona])) m.entrou = true;
      else if (m.entrou) { rec.res[zona] = null; continue; }
      if (zona === 'doca' && Math.abs(rec.cx - m.x) > 14) rec.res[zona] = null;
    }
  }
  const resDoca = dx => ['doca', dx - 12.5, dx + 12.5];
  const resCruz = () => ['cruz', ...TUDO];
  const resCorredorVaga = (rec, vx) => ['corredor', Math.min(VIA_ENTRA_X, vx) - rec.len / 2 - 1, Math.max(VIA_ENTRA_X, vx) + rec.len / 2 + 1];
  const resCorredorEntra = () => ['corredor', VIA_ENTRA_X - 2, VIA_ENTRA_X + 2];
  const resCorredorSai = () => ['corredor', VIA_SAI_X - 1.5, VIA_SAI_X + 1.5];

  /* pontos de espera (pelo centro do caminhão), sempre fora da zona pedida */
  const esperaCorredorEntrada = (rec, vx) => ({ x: VIA_ENTRA_X, z: CORREDOR_Z + 9 + rec.len / 2, reservas: [vx == null ? resCorredorEntra() : resCorredorVaga(rec, vx)], saida: true });
  const esperaCruzEntrada = rec => ({ x: VIA_ENTRA_X, z: CRUZ_Z + 1 + rec.len / 2, reservas: [resCruz()], saida: true });

  /* trechos de rota */
  function rotaParaDoca(rec) {
    const dx = docaX(rec.c.doca);
    return [
      esperaCruzEntrada(rec),
      { x: VIA_ENTRA_X, z: DOCA_ENTRA_Z },
      { x: dx, z: DOCA_ENTRA_Z },
      { x: dx, z: DOCA_ENTRA_Z, r: 0, reservas: [resDoca(dx)], docaLivre: true },   // alinha de ré para a doca
      { x: dx, z: docadoZ(rec), re: true,
        chegou: r => { r.naDoca = true; r.res.doca = null; },
        ate: r => !ATIVOS_DOCA.includes(r.c.status),
        depois: planoSaida }
    ];
  }
  function planoSaida(rec) {
    rec.naDoca = false; rec.saindoPorta = true;
    const dx = rec.c.doca ? docaX(rec.c.doca) : rec.cx;
    const lado = dx < 0 ? -1 : 1;
    const ex = lado * (CRUZ_X + 2 + rec.len / 2);              // espera fora do cruzamento
    const longe = Math.abs(dx) > Math.abs(ex);
    // o caminhão só desencosta da doca quando tem a vez; se a doca é perto do cruzamento,
    // já pega também o cruzamento e o corredor (não dá para esperar no meio da faixa)
    const vez = longe ? [resDoca(dx)] : [resDoca(dx), resCruz(), resCorredorSai()];
    rec.rota = [
      { x: dx, z: DOCA_SAI_Z, reservas: vez, saida: true },
      ...(longe ? [{ x: ex, z: DOCA_SAI_Z }] : []),
      // só entra no cruzamento quando também puder cruzar o corredor das vagas
      { x: VIA_SAI_X, z: DOCA_SAI_Z, reservas: [resCruz(), resCorredorSai()], saida: true },
      { x: VIA_SAI_X, z: BAL_Z, pausa: 2.2 },                  // pesagem de saída
      { x: VIA_SAI_X, z: ESTRADA_Z, depois: remover }
    ];
  }
  function planoVaga(rec) {
    const ocupadas = new Set([...st.caminhoes.values()].map(r => r.vaga).filter(v => v != null));
    let livre = VAGAS.findIndex((_, i) => !ocupadas.has(i));
    if (livre < 0) livre = 0;
    rec.vaga = livre;
    const v = VAGAS[livre];
    rec.rota = [
      esperaCorredorEntrada(rec, v.x),
      { x: VIA_ENTRA_X, z: CORREDOR_Z },
      { x: v.x, z: CORREDOR_Z },
      { x: v.x, z: v.z, chegou: r => { r.res.corredor = null; }, ate: r => r.c.status !== 'patio', depois: planoSairVaga }
    ];
  }
  function planoSairVaga(rec) {
    const v = VAGAS[rec.vaga];
    rec.rota = [
      { x: v.x, z: CORREDOR_Z, re: true, reservas: [resCorredorVaga(rec, v.x)], saida: true, depois: r => { r.vaga = null; } },
      { x: VIA_ENTRA_X, z: CORREDOR_Z },
      ...rotaParaDoca(rec)
    ];
  }
  function aposBalanca(rec) {
    if (rec.c.status === 'patio') return planoVaga(rec);
    if (rec.c.doca && (ATIVOS_DOCA.includes(rec.c.status) || rec.c.status === 'liberado')) { rec.rota = [esperaCorredorEntrada(rec), ...rotaParaDoca(rec)]; return; }
    if (rec.c.status === 'finalizado' || rec.c.status === 'liberado') { rec.rota = [{ x: VIA_ENTRA_X, z: DOCA_SAI_Z }]; return planoSaidaDireta(rec); }
    rec.rota = [{ x: VIA_ENTRA_X, z: BAL_Z, ate: r => r.c.status !== 'portaria', depois: aposBalanca }];
  }
  function planoSaidaDireta(rec) { rec.rota.push({ x: VIA_SAI_X, z: DOCA_SAI_Z }, { x: VIA_SAI_X, z: BAL_Z, pausa: 2.2 }, { x: VIA_SAI_X, z: ESTRADA_Z, depois: remover }); }
  function planoChegada(rec) {
    rec.rota = [{ x: VIA_ENTRA_X, z: BAL_Z, pausa: 2.2, ate: r => r.c.status !== 'portaria', depois: aposBalanca }];
  }
  function remover(rec) {
    rec.res = {};
    st.grupoCaminhoes.remove(rec.g);
    st.caminhoes.delete(rec.c.id);
    if (st.selecionado && st.selecionado.tipo === 'caminhao' && st.selecionado.id === rec.c.id) mostrarDetalhe(st.selecionado);
  }

  /* posição inicial de quem já estava no CD quando a tela abriu */
  function posicionarInicial(rec) {
    const c = rec.c;
    if (c.status === 'patio') {
      planoVaga(rec);
      const v = VAGAS[rec.vaga];
      rec.cx = v.x; rec.cz = v.z; rec.r = v.z > CORREDOR_Z ? 0 : Math.PI;
      rec.rota = rec.rota.slice(-1);
    } else if (c.doca && ATIVOS_DOCA.includes(c.status) && !st.docasIniciais.has(c.doca)) {
      st.docasIniciais.add(c.doca);
      rec.cx = docaX(c.doca); rec.cz = docadoZ(rec); rec.r = 0;
      rec.rota = rotaParaDoca(rec).slice(-1);
      rec.naDoca = true;
    } else return false;                                       // entra pela portaria normalmente
    return true;
  }
  function entradaLivre() {
    for (const o of st.caminhoes.values()) if (Math.abs(o.cx - VIA_ENTRA_X) < 3 && o.cz > ESTRADA_Z - 30) return false;
    return true;
  }

  function sincronizarCaminhoes() {
    const S = NX.sim;
    const ativos = S.caminhoes.filter(c => c.status !== 'finalizado');
    st.filaPortaria = ativos.filter(c => c.status === 'portaria').map(c => c.id);
    const novo = c => {
      const g = criarCaminhao(c);
      return { g, c, len: g.userData.len, vaga: null, rota: [], res: {}, parado: 0, espera: 0, naDoca: false, cx: 0, cz: 0, r: 0 };
    };
    const incluir = rec => { aplicarPose(rec); st.grupoCaminhoes.add(rec.g); st.caminhoes.set(rec.c.id, rec); };
    for (const c of ativos) {
      const rec = st.caminhoes.get(c.id);
      if (rec) { rec.c = c; continue; }
      if (st.pendentes.has(c.id)) continue;
      if (st.primeiraCarga) {
        const r = novo(c);
        if (posicionarInicial(r)) { incluir(r); continue; }
        st.grupoCaminhoes.remove(r.g);
      }
      st.pendentes.set(c.id, c);                               // aguarda a vez de entrar pela rodovia
    }
    st.primeiraCarga = false;
    // fila da rodovia: entra um de cada vez, só quando a pista está livre
    for (const [id, c] of st.pendentes) {
      if (c.status === 'finalizado' || !ativos.includes(c)) { st.pendentes.delete(id); continue; }
    }
    // caminhões do 3D que ficaram muito atrás da simulação saem de cena (velocidades altas)
    for (const rec of [...st.caminhoes.values()]) {
      if (rec.c.status === 'finalizado' && !rec.naDoca && !rec.saindoPorta && rec.cz > DOCA_ENTRA_Z + 5 && Math.abs(rec.cx - VIA_SAI_X) > 1) remover(rec);
    }
    if (st.pendentes.size && st.caminhoes.size < MAX_CAMINHOES && entradaLivre()) {
      const [id, c] = st.pendentes.entries().next().value;
      st.pendentes.delete(id);
      const rec = novo(c);
      rec.cx = VIA_ENTRA_X; rec.cz = ESTRADA_Z; rec.r = Math.PI;
      planoChegada(rec);
      incluir(rec);
    }
  }

  function andar(rec, dt, F) {
    conferirReservas(rec);
    const w = rec.rota[0];
    if (!w) return;
    if (w.reservas && !reservar(rec, w)) return;
    const dx = w.x - rec.cx, dz = w.z - rec.cz, d = Math.hypot(dx, dz);
    if (d > 0.05) {
      const alvoR = w.re ? Math.atan2(-dx, -dz) : Math.atan2(dx, dz);
      const dr = angulo(alvoR - rec.r);
      if (Math.abs(dr) > 0.01) { girar(rec, alvoR, dt, F); return; }
      rec.r = alvoR;
      const passo = Math.min(d, VEL * F * dt * (w.re ? 0.55 : 1));
      const nx = rec.cx + dx / d * passo, nz = rec.cz + dz / d * passo;
      if (!podePassar(rec, bloqueado(rec, nx, nz), dt)) return;
      rec.cx = nx; rec.cz = nz;
      return;
    }
    rec.cx = w.x; rec.cz = w.z;
    if (w.r != null) {
      const dr = angulo(w.r - rec.r);
      if (Math.abs(dr) > 0.01) { girar(rec, w.r, dt, F); return; }
      rec.r = w.r;
    }
    if (!w._chegou) { w._chegou = true; rec.parado = 0; if (w.chegou) w.chegou(rec); }
    rec.parado += dt * F;
    if (w.pausa && rec.parado < w.pausa) return;
    if (w.ate && !w.ate(rec)) return;
    rec.rota.shift();
    if (w.depois) w.depois(rec);
  }

  function moverCaminhoes(dt) {
    if (NX.sim.pausado) return;
    const F = fator();
    for (const rec of [...st.caminhoes.values()]) {
      andar(rec, dt, F);
      if (st.caminhoes.has(rec.c.id)) aplicarPose(rec);
    }
  }

  /* ---------------- Atualizações periódicas ---------------- */
  function atualizarDocasEEmpilhadeiras() {
    const S = NX.sim;
    for (const d of S.docas) {
      const v = st.docas[d.id];
      const stt = NX.statusDoca(d);
      const cor = COR_STATUS[stt.cls];
      v.matPorta.color.setHex(d.caminhao ? 0x2a3038 : 0x55606d);
      v.matPorta.emissive.setHex(cor); v.matPorta.emissiveIntensity = d.caminhao ? 0.55 : 0.15;
      v.matLuz.emissive.setHex(d.caminhao ? 0xe5484d : 0x2ec27e);
      const hex = '#' + cor.toString(16).padStart(6, '0');
      const chave = String(d.id).padStart(2, '0') + hex;
      if (v.lb._chave !== chave) {
        v.lb.desenhar(String(d.id).padStart(2, '0'), d.caminhao ? hex : 'rgba(10,14,19,.82)', d.caminhao ? '#0b0f14' : '#e7edf4');
        v.lb._chave = chave;
      }
      const c = d.caminhao && S.caminhao(d.caminhao);
      const rc = c && st.caminhoes.get(c.id);
      st.empilhadeiras[d.id].visible = !!(c && c.status === 'operando' && rc && rc.naDoca);
      st.empilhadeiras[d.id].userData.op = c && c.operacao;
      st.empilhadeiras[d.id].userData.frio = d.fria;
    }
  }

  function moverEmpilhadeiras(tempo) {
    for (const d of NX.CD.docas) {
      const e = st.empilhadeiras[d.id];
      if (!e.visible) continue;
      const fase = (tempo / 4.5 + d.id * 0.37) % 2;          // vai e volta
      const f = fase < 1 ? fase : 2 - fase;
      const s = (1 - Math.cos(f * Math.PI)) / 2;             // suaviza
      const destino = d.fria ? 33 : 24;
      e.position.set(docaX(d.id) + 1.2, PISO, 38.5 - s * (38.5 - destino));
      const indo = fase < 1;
      e.rotation.y = indo ? Math.PI : 0;
      // entrada: leva carga para dentro; saída: leva carga para o caminhão
      e.userData.carga.visible = (e.userData.op === 'entrada') === indo;
    }
  }

  function atualizarArmazem() {
    const S = NX.sim;
    for (const area of ['seca', 'resfriada', 'congelada']) {
      const p = st.paletes[area];
      p.im.count = Math.round(p.total * (S.estoque[area] / NX.CD.posicoes[area]));
    }
    for (const k of ['resfriada', 'congelada']) {
      const c = S.camaras[k], v = st.camaras[k];
      const txt = (k === 'resfriada' ? 'Resfriada  ' : 'Congelada  ') + U.num(c.temp, 1) + ' °C';
      const fundo = c.alarme ? 'rgba(242,84,91,.95)' : 'rgba(10,14,19,.82)';
      const cor = c.alarme ? '#fff' : '#38d6f0';
      if (v.lb._txt !== txt + fundo + cor) v.lb.desenhar(txt, fundo, cor);
      v.borda.material.color.setHex(c.alarme ? 0xf2545b : v.cor);
    }
  }

  /* Dia e noite conforme o relógio da simulação */
  function atualizarCeu() {
    const h = (NX.sim.t % 1440) / 60;
    const sol = h > 6 && h < 18.5 ? Math.sin(Math.PI * (h - 6) / 12.5) : 0;
    const ang = Math.PI * (h - 6) / 12.5;
    st.sol.position.set(Math.cos(ang) * 220, Math.max(15, Math.sin(ang) * 220), 90);
    st.sol.intensity = 0.1 + 1.05 * sol;
    st.hemi.intensity = 0.28 + 0.5 * sol;
    const noite = new THREE.Color(0x070b12), dia = new THREE.Color(0x7b95ab), crep = new THREE.Color(0x3a3550);
    const cor = sol < 0.25 ? noite.clone().lerp(crep, sol / 0.25) : crep.clone().lerp(dia, Math.min(1, (sol - 0.25) / 0.45));
    st.cena.background = cor;
    st.cena.fog.color = cor;
    const escuro = sol < 0.15;
    st.luzesInternas.forEach(l => l.intensity = escuro ? 0.9 : 0.25);
    st.luzesPatio.forEach(l => l.intensity = escuro ? 1.1 : 0);
    st.matLuminaria.emissiveIntensity = escuro ? 1.2 : 0.35;
    st.matPostes.emissiveIntensity = escuro ? 1.4 : 0;
    st.matJanelas.emissive.setHex(escuro ? 0xffd89a : 0x000000);
    st.matJanelas.emissiveIntensity = escuro ? 0.55 : 0;
    st.ehNoite = escuro;
  }

  /* ---------------- HUD (camada HTML por cima do 3D) ---------------- */
  function atualizarHud() {
    const S = NX.sim, k = S.kpis(), E = S.energia;
    const chips = [
      [st.ehNoite ? 'Noite' : 'Dia', U.hora(S.t)],
      ['Pátio + portaria', k.noPatio],
      ['Docas em uso', k.emDoca + '/12'],
      ['Solar agora', U.num(E.solarKW) + ' kW'],
      ['Resfriada', U.num(S.camaras.resfriada.temp, 1) + ' °C'],
      ['Congelada', U.num(S.camaras.congelada.temp, 1) + ' °C']
    ];
    st.hudChips.innerHTML = chips.map(([r, v]) => `<div class="chip3d"><span>${r}</span><b>${v}</b></div>`).join('');
    if (st.selecionado) mostrarDetalhe(st.selecionado);
  }

  function linhaInfo(r, v) { return `<div class="det-l"><span>${r}</span><b>${v}</b></div>`; }

  function htmlCaminhao(c) {
    const S = NX.sim, T = S.transportadora(c.transportadora);
    const tempoFase = {
      portaria: c.tempos.chegada, patio: c.tempos.patio, manobra: c.tempos.chamado, operando: c.tempos.inicioOp,
      conferencia: c.tempos.fimOp, aguardando_nf: c.tempos.fimConf, liberado: c.tempos.nf || c.tempos.fimConf
    }[c.status];
    let prog = '';
    if (c.status === 'operando') {
      const p = Math.min(1, (S.t - c.tempos.inicioOp) / (c.fimFase - c.tempos.inicioOp));
      prog = `<div class="barra larga"><i style="width:${(p * 100).toFixed(0)}%"></i></div><small class="det-small">${Math.round(p * 100)}% ${c.operacao === 'entrada' ? 'descarregado' : 'carregado'}</small>`;
    }
    const etapas = [
      ['Chegada', c.tempos.chegada], ['Chamado p/ doca', c.tempos.chamado], ['Início operação', c.tempos.inicioOp],
      ['Fim operação', c.tempos.fimOp], ['Conferência ok', c.tempos.fimConf], ['NF-e emitida', c.tempos.nf]
    ].filter(([, t]) => t != null);
    return `
      <div class="det-cab"><span class="placa">${c.placa}</span>${c.frio ? NX.ICONE_FRIO : ''}<span class="op op-${c.operacao}">${c.operacao === 'entrada' ? 'ENTRADA' : 'SAÍDA'}</span></div>
      <h3>${S.FASES[c.status]}${c.doca ? ' · doca ' + String(c.doca).padStart(2, '0') : ''}</h3>
      <p class="det-sub">há ${U.duracao(S.t - tempoFase)}</p>
      ${prog}
      <div class="det-grade">
        ${linhaInfo('Motorista', c.motorista)}
        ${linhaInfo('Transportadora', T.nome)}
        ${linhaInfo('Veículo', c.veiculo)}
        ${linhaInfo(c.operacao === 'entrada' ? 'Fornecedor' : 'Destino', c.parceiro)}
        ${linhaInfo('Cidade', c.cidade + ' · ' + U.num(c.km) + ' km')}
        ${linhaInfo('Carga', c.paletes + ' paletes · ' + U.num(c.pesoKg / 1000, 1) + ' t')}
        ${linhaInfo('Valor', U.real(c.valor))}
        ${c.nf ? linhaInfo('NF', c.nf) : ''}
        ${c.divergencia ? linhaInfo('Atenção', '<span class="t-ruim">divergência na conferência</span>') : ''}
      </div>
      <ol class="det-linha">${etapas.map(([r, t]) => `<li><time>${U.hora(t)}</time>${r}</li>`).join('')}</ol>`;
  }

  function mostrarDetalhe(sel) {
    const S = NX.sim;
    let html = '';
    if (sel.tipo === 'doca') {
      const d = S.docas.find(x => x.id === sel.id);
      const stt = NX.statusDoca(d);
      const c = d.caminhao && S.caminhao(d.caminhao);
      html = `<p class="det-tit">Doca ${String(d.id).padStart(2, '0')} · ${d.tipo === 'entrada' ? 'Recebimento' : 'Expedição'}${d.fria ? ' · refrigerada' : ''}</p>
        <div class="det-status ${stt.cls}">${stt.txt}</div>
        ${linhaInfo('Ocupação hoje', U.num(d.ocupadaMin / Math.max(1, S.t - S.dia * 1440) * 100) + '%')}
        ${c ? '<hr>' + htmlCaminhao(c) : '<p class="det-vazio">Sem caminhão no momento.</p>'}`;
    } else {
      const c = S.caminhao(sel.id);
      if (!c || c.status === 'finalizado') { html = '<p class="det-vazio">Esse caminhão já saiu do CD.</p>'; }
      else html = `<p class="det-tit">Caminhão ${c.id}</p>` + htmlCaminhao(c);
    }
    st.detalhe.querySelector('.det-corpo').innerHTML = html;
    st.detalhe.hidden = false;
  }

  /* ---------------- Câmera ---------------- */
  const VISTAS = {
    geral: { pos: [128, 92, 200], alvo: [0, 0, 60] },
    docas: { pos: [-48, 30, 112], alvo: [-8, 3, 42] },
    patio: { pos: [-120, 75, 235], alvo: [0, 0, 120] },
    interno: { pos: [70, 58, 55], alvo: [0, 2, -5], semTelhado: true },
    topo: { pos: [0, 330, 80], alvo: [0, 0, 79] }
  };
  function irPara(nome) {
    const v = VISTAS[nome];
    if (v.semTelhado) definirTelhado(false);
    st.tween = {
      ini: performance.now(), dur: 1200,
      p0: st.camera.position.clone(), a0: st.controls.target.clone(),
      p1: new THREE.Vector3(...v.pos), a1: new THREE.Vector3(...v.alvo)
    };
    st.raiz.querySelectorAll('[data-vista]').forEach(b => b.classList.toggle('ativo', b.dataset.vista === nome));
  }
  function definirTelhado(on) {
    st.telhado.visible = on;
    st.paredesAltas.visible = on;
    st.raiz.querySelector('#bt-telhado').classList.toggle('ativo', on);
  }

  /* ---------------- Loop ---------------- */
  function quadro(agora) {
    if (!st) return;
    st.raf = requestAnimationFrame(quadro);
    const dt = Math.min(0.1, (agora - (st.ultimo || agora)) / 1000);
    st.ultimo = agora;
    if (st.tween) {
      const tw = st.tween, f = Math.min(1, (agora - tw.ini) / tw.dur), e = f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2;
      st.camera.position.lerpVectors(tw.p0, tw.p1, e);
      st.controls.target.lerpVectors(tw.a0, tw.a1, e);
      if (f >= 1) st.tween = null;
    }
    moverCaminhoes(dt);
    moverEmpilhadeiras(NX.sim.pausado ? st.tempoEmp : (st.tempoEmp += dt * Math.min(3, NX.sim.velocidade / 30)));
    st.controls.update();
    st.renderer.render(st.cena, st.camera);
  }

  /* ---------------- Clique / seleção ---------------- */
  function pegar(ev) {
    const r = st.renderer.domElement.getBoundingClientRect();
    const m = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    st.ray.setFromCamera(m, st.camera);
    const hits = st.ray.intersectObjects([...st.clicaveis, st.grupoCaminhoes], true);
    const h = hits.find(x => x.object.userData && x.object.userData.tipo);
    return h ? h.object.userData : null;
  }

  /* ---------------- Montagem da tela ---------------- */
  function render(el) {
    if (typeof THREE === 'undefined' || !THREE.OrbitControls) {
      el.innerHTML = `<section class="painel em-breve"><span class="etapa">Galpão 3D</span><h2>Não foi possível carregar o 3D</h2>
        <p>A biblioteca Three.js vem da internet. Verifique a conexão e recarregue a página.</p></section>`;
      return;
    }
    el.innerHTML = `
      <div class="g3d">
        <div class="g3d-canvas"></div>
        <div class="g3d-hud g3d-chips"></div>
        <div class="g3d-hud g3d-botoes">
          <div class="seg">
            <button data-vista="geral" class="ativo">Geral</button><button data-vista="docas">Docas</button>
            <button data-vista="patio">Pátio</button><button data-vista="interno">Interno</button><button data-vista="topo">Topo</button>
          </div>
          <button id="bt-telhado" class="bt3d" title="Mostrar telhado com placas solares">
            <svg viewBox="0 0 24 24"><path d="M3 12l9-7 9 7"/><path d="M6 10.5V19h12v-8.5"/><path d="M9 14h6"/></svg>Telhado solar</button>
        </div>
        <div class="g3d-hud g3d-legenda legenda">
          <span class="s-descarga">Descarregando</span><span class="s-carga">Carregando</span><span class="s-manobra">Encostando</span>
          <span class="s-conf">Conferência</span><span class="s-nf">Aguardando NF</span><span class="s-livre">Livre</span>
        </div>
        <div class="g3d-dica">Arraste para girar · role para aproximar · clique numa doca ou caminhão</div>
        <aside class="g3d-detalhe" hidden><button class="det-fechar" aria-label="Fechar">×</button><div class="det-corpo"></div></aside>
      </div>`;

    CUBO = new THREE.BoxGeometry(1, 1, 1);
    mats = {};
    const raiz = el.querySelector('.g3d');
    const alvo = raiz.querySelector('.g3d-canvas');
    st = {
      raiz, clicaveis: [], caminhoes: new Map(), pendentes: new Map(), docasIniciais: new Set(), filaPortaria: [], tempoEmp: 0, primeiraCarga: true,
      hudChips: raiz.querySelector('.g3d-chips'), detalhe: raiz.querySelector('.g3d-detalhe'), selecionado: null
    };

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    alvo.appendChild(renderer.domElement);
    st.renderer = renderer;

    const cena = new THREE.Scene();
    cena.fog = new THREE.Fog(0x070b12, 380, 900);
    st.cena = cena;
    const camera = new THREE.PerspectiveCamera(40, 1, 1, 2000);
    camera.position.set(...VISTAS.geral.pos);
    st.camera = camera;

    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(...VISTAS.geral.alvo);
    controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.maxPolarAngle = 1.48; controls.minDistance = 15; controls.maxDistance = 520;
    st.controls = controls;

    // luzes
    st.hemi = new THREE.HemisphereLight(0xcfe3ff, 0x2a2f24, 0.6); cena.add(st.hemi);
    const sol = new THREE.DirectionalLight(0xfff2dc, 1);
    sol.castShadow = true;
    sol.shadow.mapSize.set(2048, 2048);
    Object.assign(sol.shadow.camera, { left: -190, right: 190, top: 190, bottom: -190, near: 10, far: 700 });
    sol.shadow.bias = -0.0005;
    sol.target.position.set(0, 0, 45);
    cena.add(sol); cena.add(sol.target);
    st.sol = sol;
    st.luzesInternas = [[-50, -15], [0, -15], [50, -15], [-45, 25], [45, 25]].map(([x, z]) => {
      const l = new THREE.PointLight(0xfff1d6, 0.6, 85, 1.6); l.position.set(x, PISO + 9.5, z); cena.add(l); return l;
    });
    st.luzesPatio = [[-70, 70], [70, 70], [-70, 130], [70, 130], [0, 165]].map(([x, z]) => {
      const l = new THREE.PointLight(0xffd99a, 0, 80, 1.5); l.position.set(x, 12, z); cena.add(l); return l;
    });

    const mundo = new THREE.Group();
    cena.add(mundo);
    construirTerreno(mundo);
    construirPredio(mundo);
    construirTelhado(mundo);
    construirArmazem(mundo);
    construirDocas(mundo);
    construirPortaria(mundo);
    construirEmpilhadeiras(mundo);
    st.grupoCaminhoes = new THREE.Group();
    cena.add(st.grupoCaminhoes);
    st.ray = new THREE.Raycaster();
    definirTelhado(false);

    // tamanho
    st.ro = new ResizeObserver(() => {
      const w = alvo.clientWidth, h = alvo.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    st.ro.observe(alvo);

    // botões
    raiz.querySelectorAll('[data-vista]').forEach(b => b.addEventListener('click', () => irPara(b.dataset.vista)));
    raiz.querySelector('#bt-telhado').addEventListener('click', () => definirTelhado(!st.telhado.visible));
    raiz.querySelector('.det-fechar').addEventListener('click', () => { st.selecionado = null; st.detalhe.hidden = true; });

    // clique sem arrastar = selecionar
    let down = null;
    renderer.domElement.addEventListener('pointerdown', e => down = [e.clientX, e.clientY]);
    renderer.domElement.addEventListener('pointerup', e => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
      const sel = pegar(e);
      if (sel) { st.selecionado = { tipo: sel.tipo, id: sel.id }; mostrarDetalhe(st.selecionado); }
    });
    let ultimoHover = 0;
    renderer.domElement.addEventListener('pointermove', e => {
      const t = performance.now(); if (t - ultimoHover < 80) return; ultimoHover = t;
      renderer.domElement.style.cursor = pegar(e) ? 'pointer' : '';
    });

    atualizar();
    st.raf = requestAnimationFrame(quadro);
  }

  function atualizar() {
    if (!st) return;
    sincronizarCaminhoes();
    atualizarDocasEEmpilhadeiras();
    atualizarArmazem();
    atualizarCeu();
    atualizarHud();
  }

  function sair() {
    if (!st) return;
    cancelAnimationFrame(st.raf);
    st.ro.disconnect();
    st.controls.dispose();
    st.cena.traverse(o => {
      if (o.material && o.material.map) o.material.map.dispose();
      if (o.geometry && o.geometry !== CUBO) o.geometry.dispose();
    });
    Object.values(mats).forEach(m => m.dispose());
    st.renderer.dispose();
    st.renderer.forceContextLoss();
    st = null;
  }

  return {
    titulo: 'Galpão 3D',
    sub: 'Modelo do centro de distribuição em tempo real',
    render, sair,
    atualizar
  };
})();
