/* =========================================================
   NEXUS CD · transporte.js
   Tela "Transporte": mapa de rotas, caminhões em trânsito,
   frete, OTIF, transportadoras, destinos e motoristas
   ========================================================= */
NX.telas = NX.telas || {};

NX.telas.transporte = (function () {
  const U = NX.util;
  const VEL_MEDIA = 62; // km/h, já considerando paradas curtas
  const R_KM = { 'VUC': 3.2, 'Toco': 4.5, 'Truck': 5.8, 'Carreta': 7.9, 'Bitrem': 9.5, 'Truck frigorífico': 7.2, 'Carreta frigorífica': 9.9 };
  let st = null;

  /* ---------- cálculos da viagem ---------- */
  const frete = c => c.km * (R_KM[c.veiculo] || 6);
  const hash = s => [...s].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
  function viagem(c) {
    // saída: do CD até o destino; o atraso vem da pontualidade sorteada no simulador
    const dur = c.km / VEL_MEDIA * 60;
    const atraso = c.noPrazo === false ? 30 + hash(c.id) % 90 : 0;
    const previsto = c.tempos.saida + dur;
    return { dur: dur + atraso, eta: previsto + atraso, previsto, atraso };
  }
  function emTransito() {
    const S = NX.sim;
    return S.caminhoes.filter(c => c.operacao === 'saida' && c.status === 'finalizado')
      .map(c => ({ c, v: viagem(c) }))
      .filter(x => S.t < x.v.eta)
      .map(x => ({ ...x, p: (S.t - x.c.tempos.saida) / x.v.dur }));
  }
  function doDia() { const S = NX.sim; return S.caminhoes.filter(c => c.dia === S.dia); }

  /* curva entre dois pontos (para a rota não ser uma reta seca) */
  function curva(a, b, n = 24) {
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const dx = b[1] - a[1], dy = b[0] - a[0];
    const c = [mx - dx * 0.12, my + dy * 0.12];
    const pts = [];
    for (let i = 0; i <= n; i++) { const t = i / n; pts.push(ponto(a, c, b, t)); }
    return pts;
  }
  function ponto(a, c, b, t) {
    const u = 1 - t;
    return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]];
  }
  function controle(a, b) {
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    return [mx - (b[1] - a[1]) * 0.12, my + (b[0] - a[0]) * 0.12];
  }

  /* ---------- mapa ---------- */
  function criarMapa(div) {
    if (typeof L === 'undefined') {
      div.innerHTML = '<div class="mapa-off">O mapa precisa de internet para carregar.</div>';
      return null;
    }
    const mapa = L.map(div, { zoomControl: true, attributionControl: true, scrollWheelZoom: false }).setView([-20.2, -49.6], 6);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 12, subdomains: 'abcd',
      attribution: '&copy; OpenStreetMap &copy; CARTO'
    }).addTo(mapa);
    const camadas = { rotas: L.layerGroup().addTo(mapa), cidades: L.layerGroup().addTo(mapa), caminhoes: L.layerGroup().addTo(mapa) };
    L.marker(NX.CD.coord, {
      icon: L.divIcon({ className: 'mk-cd', html: '<div><svg viewBox="0 0 32 32"><path d="M6 24V13l10-6 10 6v11h-5v-7H11v7z"/></svg></div>', iconSize: [34, 34], iconAnchor: [17, 17] }),
      zIndexOffset: 1000
    }).addTo(mapa).bindTooltip('<b>Nexus CD</b><br>Iturama · MG', { direction: 'top', offset: [0, -14] });
    const todos = Object.values(NX.CIDADES);
    mapa.fitBounds(L.latLngBounds(todos).pad(0.04));
    return { mapa, camadas };
  }

  function desenharMapa() {
    if (!st.mapa) return;
    const S = NX.sim, { camadas } = st.mapa;
    const lista = doDia();
    const porCidade = {};
    for (const c of lista) {
      const k = c.cidade;
      porCidade[k] = porCidade[k] || { e: 0, s: 0 };
      porCidade[k][c.operacao === 'entrada' ? 'e' : 's']++;
    }
    camadas.rotas.clearLayers(); camadas.cidades.clearLayers(); camadas.caminhoes.clearLayers();
    for (const [cidade, n] of Object.entries(porCidade)) {
      if (cidade === 'Iturama/MG') continue;
      const p = NX.CIDADES[cidade];
      if (n.e) L.polyline(curva(p, NX.CD.coord), { color: '#4c8dff', weight: 1 + Math.min(6, n.e * 0.6), opacity: 0.55 }).addTo(camadas.rotas);
      if (n.s) L.polyline(curva(NX.CD.coord, p), { color: '#2ec27e', weight: 1 + Math.min(6, n.s * 0.6), opacity: 0.55, dashArray: '6 6' }).addTo(camadas.rotas);
    }
    for (const [cidade, p] of Object.entries(NX.CIDADES)) {
      const n = porCidade[cidade] || { e: 0, s: 0 };
      const tot = n.e + n.s;
      L.circleMarker(p, { radius: 4 + Math.sqrt(tot) * 2.2, color: '#e7edf4', weight: 1, fillColor: tot ? '#f5a524' : '#3a4656', fillOpacity: tot ? 0.85 : 0.6 })
        .bindTooltip(`<b>${cidade}</b><br>${n.e} entradas · ${n.s} saídas hoje<br>${U.num(U.distanciaKm(NX.CD.coord, p))} km do CD`, { direction: 'top' })
        .addTo(camadas.cidades);
    }
    for (const x of emTransito()) {
      const p = NX.CIDADES[x.c.cidade];
      const pos = ponto(NX.CD.coord, controle(NX.CD.coord, p), p, Math.min(1, x.p));
      const T = S.transportadora(x.c.transportadora);
      L.marker(pos, {
        icon: L.divIcon({ className: 'mk-cam', html: `<div style="--c:${T.cor}" class="${x.v.atraso ? 'atraso' : ''}"></div>`, iconSize: [14, 14], iconAnchor: [7, 7] })
      }).bindTooltip(`<b>${x.c.placa}</b> → ${x.c.parceiro}<br>${x.c.motorista} · ${T.nome}<br>chega ${U.hora(x.v.eta)}${x.v.atraso ? ' (atrasado)' : ''}`, { direction: 'top' })
        .addTo(camadas.caminhoes);
    }
  }

  /* ---------- montagem ---------- */
  function render(el) {
    el.innerHTML = `
      <div class="grade-kpi" id="tr-kpis"></div>
      <div class="linha-2">
        <section class="painel painel-mapa">
          <header><h2>Rotas do dia</h2>
            <div class="legenda"><span class="l-entrada">Entradas (fornecedor → CD)</span><span class="l-saida">Saídas (CD → loja/hub)</span><span class="l-cam">Em trânsito</span></div></header>
          <div id="tr-mapa" class="mapa"></div>
        </section>
        <section class="painel">
          <header><h2>Em trânsito agora</h2><span class="contador" id="tr-tr-n">0</span></header>
          <div id="tr-transito" class="lista-transito"></div>
        </section>
      </div>
      <div class="linha-2 igual">
        <section class="painel">
          <header><h2>Transportadoras</h2><span class="kpi-det">hoje</span></header>
          <div class="rolagem-x"><table class="tabela" id="tr-transp"></table></div>
        </section>
        <section class="painel">
          <header><h2>Destinos das saídas</h2><span class="kpi-det">hoje · por custo de frete</span></header>
          <div class="rolagem-x"><table class="tabela" id="tr-dest"></table></div>
        </section>
      </div>
      <section class="painel">
        <header><h2>Motoristas do dia</h2><span class="kpi-det" id="tr-mot-n"></span></header>
        <div class="rolagem-x"><table class="tabela" id="tr-mot"></table></div>
      </section>`;
    st = { mapa: criarMapa(el.querySelector('#tr-mapa')) };
    atualizar(el);
  }

  function atualizar(el) {
    const S = NX.sim, $ = s => el.querySelector(s);
    if (!$('#tr-kpis') || !st) return;
    const lista = doDia();
    const fin = lista.filter(c => c.status === 'finalizado');
    const finS = fin.filter(c => c.operacao === 'saida');
    const km = fin.reduce((s, c) => s + c.km, 0);
    const custo = finS.reduce((s, c) => s + frete(c), 0);
    const kmS = finS.reduce((s, c) => s + c.km, 0);
    const palS = finS.reduce((s, c) => s + c.paletes, 0);
    const transito = emTransito();
    const otif = finS.length ? finS.filter(c => c.noPrazo).length / finS.length : null;
    const motoristas = new Set(lista.map(c => c.motorista));
    const kpi = (r, v, d, e) => `<div class="kpi ${e || ''}"><span class="kpi-rot">${r}</span><strong class="kpi-val">${v}</strong><span class="kpi-det">${d}</span></div>`;

    $('#tr-kpis').innerHTML = [
      kpi('Viagens hoje', fin.length, `${fin.length - finS.length} entradas · ${finS.length} saídas`),
      kpi('Em trânsito agora', transito.length, `${transito.filter(x => x.v.atraso).length} com atraso previsto`, transito.some(x => x.v.atraso) ? 'atencao' : 'ok'),
      kpi('OTIF das entregas', otif == null ? '–' : U.num(otif * 100) + '%', 'no prazo e completas · meta 95%', otif == null ? '' : otif >= 0.95 ? 'ok' : otif >= 0.88 ? 'atencao' : 'ruim'),
      kpi('Km rodados', U.num(km), 'entradas + saídas do dia'),
      kpi('Custo de frete', U.real(custo), 'saídas do dia (CIF)'),
      kpi('Custo por km', kmS ? 'R$ ' + U.num(custo / kmS, 2) : '–', 'média ponderada da frota'),
      kpi('Frete por palete', palS ? U.real(custo / palS) : '–', `${U.num(palS)} paletes expedidos`),
      kpi('Motoristas no dia', motoristas.size, `${NX.TRANSPORTADORAS.length} transportadoras`)
    ].join('');

    const agora = performance.now();
    if (!st.ultMapa || agora - st.ultMapa > 2500) { desenharMapa(); st.ultMapa = agora; }

    /* Em trânsito */
    $('#tr-tr-n').textContent = transito.length;
    $('#tr-transito').innerHTML = transito.length ? transito.sort((a, b) => a.v.eta - b.v.eta).map(x => {
      const T = S.transportadora(x.c.transportadora);
      return `<div class="transito ${x.v.atraso ? 'atraso' : ''}">
        <div class="tr-topo"><span class="placa">${x.c.placa}</span>${x.c.frio ? NX.ICONE_FRIO : ''}<span class="tr-dest">${x.c.parceiro}</span></div>
        <div class="tr-info"><span><span class="ponto" style="background:${T.cor}"></span>${T.nome} · ${x.c.motorista}</span></div>
        <div class="tr-prog"><div class="barra"><i style="width:${Math.min(100, x.p * 100).toFixed(0)}%"></i></div>
          <span>${U.num(x.c.km * Math.min(1, x.p))}/${U.num(x.c.km)} km</span></div>
        <div class="tr-eta"><span>saiu ${U.hora(x.c.tempos.saida)}</span><b>chega ${U.hora(x.v.eta)}${x.v.atraso ? ` · +${U.duracao(x.v.atraso)}` : ''}</b></div>
      </div>`;
    }).join('') : '<p class="det-vazio">Nenhuma entrega em rota agora.</p>';

    /* Transportadoras */
    const linhasT = NX.TRANSPORTADORAS.map(T => {
      const cs = fin.filter(c => c.transportadora === T.id);
      const s = cs.filter(c => c.operacao === 'saida');
      const ckm = s.reduce((a, c) => a + c.km, 0), cc = s.reduce((a, c) => a + frete(c), 0);
      return { T, n: cs.length, km: cs.reduce((a, c) => a + c.km, 0), custo: cc, rkm: ckm ? cc / ckm : null, otif: s.length ? s.filter(c => c.noPrazo).length / s.length : null, entregas: s.length };
    }).filter(r => r.n).sort((a, b) => (b.otif ?? -1) - (a.otif ?? -1));
    $('#tr-transp').innerHTML = `<thead><tr><th>Transportadora</th><th class="num">Viagens</th><th class="num">Km</th><th class="num">Frete</th><th class="num">R$/km</th><th>OTIF</th></tr></thead><tbody>` +
      (linhasT.length ? linhasT.map(r => `<tr><td><span class="ponto" style="background:${r.T.cor}"></span>${r.T.nome}${r.T.frio ? NX.ICONE_FRIO : ''}</td>
        <td class="num">${r.n}</td><td class="num mono">${U.num(r.km)}</td><td class="num mono">${U.real(r.custo)}</td>
        <td class="num mono">${r.rkm == null ? '–' : U.num(r.rkm, 2)}</td>
        <td><div class="mini-barra prazo ${r.otif == null ? '' : r.otif < 0.88 ? 'ruim' : r.otif < 0.95 ? 'atencao' : ''}"><i style="width:${((r.otif ?? 0) * 100).toFixed(0)}%"></i><span>${r.otif == null ? 'sem entregas' : U.num(r.otif * 100) + '% de ' + r.entregas}</span></div></td></tr>`).join('')
        : '<tr><td colspan="6" class="vazio">Sem viagens hoje</td></tr>') + '</tbody>';

    /* Destinos */
    const dest = {};
    for (const c of finS) {
      const d = dest[c.parceiro] = dest[c.parceiro] || { nome: c.parceiro, cidade: c.cidade, km: c.km, n: 0, pal: 0, custo: 0 };
      d.n++; d.pal += c.paletes; d.custo += frete(c);
    }
    const ld = Object.values(dest).sort((a, b) => b.custo - a.custo);
    $('#tr-dest').innerHTML = `<thead><tr><th>Destino</th><th class="num">Km</th><th class="num">Viagens</th><th class="num">Paletes</th><th class="num">Frete</th><th class="num">R$/palete</th></tr></thead><tbody>` +
      (ld.length ? ld.map(d => `<tr><td class="corta" title="${d.cidade}">${d.nome}</td><td class="num mono">${U.num(d.km)}</td>
        <td class="num">${d.n}</td><td class="num">${d.pal}</td><td class="num mono">${U.real(d.custo)}</td><td class="num mono">${U.real(d.custo / d.pal)}</td></tr>`).join('')
        : '<tr><td colspan="6" class="vazio">Sem saídas hoje</td></tr>') + '</tbody>';

    /* Motoristas */
    const ultimos = lista.slice().sort((a, b) => b.tempos.chegada - a.tempos.chegada).slice(0, 14);
    $('#tr-mot-n').textContent = `${motoristas.size} no dia · mostrando os últimos 14`;
    $('#tr-mot').innerHTML = `<thead><tr><th>Motorista</th><th>Placa</th><th>Veículo</th><th>Transportadora</th><th>Op.</th><th>Origem / destino</th><th class="num">Chegou</th><th class="num">Tempo no CD</th><th>Situação</th></tr></thead><tbody>` +
      ultimos.map(c => {
        const fimCD = c.tempos.saida ?? S.t;
        let sit = `<span class="pilula s-conf">${S.FASES[c.status]}</span>`;
        if (c.status === 'finalizado' && c.operacao === 'saida') {
          const v = viagem(c);
          sit = S.t < v.eta ? `<span class="pilula ${v.atraso ? 's-nf' : 's-carga'}">Em rota${v.atraso ? ' · atraso' : ''}</span>` : `<span class="pilula ${c.noPrazo ? 's-carga' : 's-nf'}">Entregue${c.noPrazo ? '' : ' com atraso'}</span>`;
        } else if (c.status === 'finalizado') sit = '<span class="pilula s-livre">Liberado</span>';
        return `<tr><td>${c.motorista}</td><td class="mono">${c.placa}</td><td>${c.veiculo}</td><td class="corta">${S.transportadora(c.transportadora).nome}</td>
          <td><span class="op op-${c.operacao}">${c.operacao === 'entrada' ? 'ENT' : 'SAÍ'}</span></td><td class="corta">${c.parceiro}</td>
          <td class="num mono">${U.hora(c.tempos.chegada)}</td><td class="num mono">${U.duracao(fimCD - c.tempos.chegada)}</td><td>${sit}</td></tr>`;
      }).join('') + '</tbody>';
  }

  function sair() {
    if (st && st.mapa) st.mapa.mapa.remove();
    st = null;
  }

  return { titulo: 'Transporte', sub: 'Rotas, motoristas e transportadoras', render, atualizar, sair };
})();
