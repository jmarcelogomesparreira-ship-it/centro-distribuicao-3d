/* =========================================================
   NEXUS CD · armazem.js
   Tela "Armazém": ocupação por rua, câmaras frias com
   histórico, curva ABC, validade (FEFO), inventário rotativo
   e segurança do trabalho
   ========================================================= */
NX.telas = NX.telas || {};

NX.telas.armazem = (function () {
  const U = NX.util;
  const hojeData = () => { const d = new Date(); d.setDate(d.getDate() + NX.sim.dia); d.setHours(0, 0, 0, 0); return d; };

  /* ---------------- Cadastro de SKUs (fictício, com semente fixa) ---------------- */
  const CATEGORIAS = [
    { nome: 'Mercearia', area: 'seca', peso: 22, itens: ['Arroz tipo 1 5kg', 'Feijão carioca 1kg', 'Açúcar cristal 5kg', 'Café torrado 500g', 'Óleo de soja 900ml', 'Macarrão espaguete 500g', 'Farinha de trigo 1kg', 'Molho de tomate 340g'] },
    { nome: 'Bebidas', area: 'seca', peso: 14, itens: ['Refrigerante 2L', 'Água mineral 1,5L', 'Suco integral 1L', 'Energético 473ml', 'Cerveja lata 350ml', 'Chá gelado 1,5L'] },
    { nome: 'Higiene e limpeza', area: 'seca', peso: 16, itens: ['Sabão em pó 1,6kg', 'Detergente 500ml', 'Papel higiênico 12 rolos', 'Shampoo 350ml', 'Desinfetante 2L', 'Creme dental 90g', 'Amaciante 2L'] },
    { nome: 'Eletrônicos', area: 'seca', peso: 7, itens: ['Fone bluetooth', 'Carregador USB-C', 'Smart TV 50"', 'Caixa de som', 'Air fryer 4L', 'Liquidificador'] },
    { nome: 'Casa e utilidades', area: 'seca', peso: 10, itens: ['Jogo de panelas', 'Toalha de banho', 'Organizador plástico', 'Garrafa térmica', 'Jogo de copos', 'Ventilador 40cm'] },
    { nome: 'Brinquedos', area: 'seca', peso: 5, itens: ['Blocos de montar', 'Boneca', 'Carrinho controle remoto', 'Jogo de tabuleiro', 'Pelúcia'] },
    { nome: 'Pet', area: 'seca', peso: 6, itens: ['Ração cães 15kg', 'Ração gatos 10kg', 'Areia higiênica 4kg', 'Petisco 65g'] },
    { nome: 'Laticínios', area: 'resfriada', peso: 8, itens: ['Iogurte 170g', 'Queijo muçarela kg', 'Leite fermentado', 'Manteiga 200g', 'Requeijão 200g', 'Creme de leite fresco'] },
    { nome: 'Hortifruti', area: 'resfriada', peso: 4, itens: ['Folhosos higienizados', 'Tomate caixa', 'Frutas cortadas', 'Legumes embalados'] },
    { nome: 'Congelados', area: 'congelada', peso: 8, itens: ['Hambúrguer bovino', 'Frango em cortes kg', 'Pizza congelada', 'Batata pré-frita 2kg', 'Sorvete 1,5L', 'Pão de queijo 1kg', 'Peixe filé'] }
  ];

  const MARCAS = ['Bom Campo', 'Vale Real', 'Serrana', 'Prime', 'Ouro Fino', 'Nativa', 'Max', 'Lar Doce', 'Sol Nascente', 'Fiel', 'Cerrado', 'Clássica', 'Vita', 'Estrela', 'Rio Grande', 'Nova Era'];
  const PRECO = { 'Mercearia': [8, 45], 'Bebidas': [5, 40], 'Higiene e limpeza': [6, 50], 'Eletrônicos': [60, 2400], 'Casa e utilidades': [20, 260], 'Brinquedos': [25, 300], 'Pet': [15, 220], 'Laticínios': [6, 60], 'Hortifruti': [5, 30], 'Congelados': [12, 80] };
  const GIRO = { 'Eletrônicos': 0.07, 'Casa e utilidades': 0.35, 'Brinquedos': 0.3, 'Mercearia': 1.6, 'Bebidas': 1.8, 'Higiene e limpeza': 1.2 };
  CATEGORIAS.forEach(c => { c.preco = PRECO[c.nome]; c.fatorGiro = GIRO[c.nome] || 1; });

  const CAT = (() => {
    const R = NX.criarRNG(2026);
    const skus = [];
    let seq = 100200;
    for (const cat of CATEGORIAS) {
      const n = cat.peso * 56;
      for (let i = 0; i < n; i++) {
        const base = cat.itens[i % cat.itens.length];
        const giro = Math.exp(R.normal(0, 1.25)) * (cat.fatorGiro || 1);   // Pareto: poucos itens giram muito
        const preco = R.entre(cat.preco[0], cat.preco[1]);
        const marca = MARCAS[(i * 7 + cat.nome.length) % MARCAS.length];
        skus.push({
          cod: String(seq++), desc: base + ' · ' + marca,
          cat: cat.nome, area: cat.area, giro, preco,
          perecivel: cat.area !== 'seca' || cat.nome === 'Mercearia' || cat.nome === 'Bebidas'
        });
      }
    }
    // curva ABC pelo valor de saída (giro × preço)
    skus.forEach(s => s.valor = s.giro * s.preco);
    const ord = skus.slice().sort((a, b) => b.valor - a.valor);
    const tot = ord.reduce((a, s) => a + s.valor, 0);
    let acc = 0;
    for (const s of ord) { acc += s.valor; s.classe = acc / tot <= 0.8 ? 'A' : acc / tot <= 0.95 ? 'B' : 'C'; }
    return { skus, ord, tot };
  })();

  /* ---------------- Ruas do armazém (mesmas do 3D) ---------------- */
  const RUAS = (() => {
    const R = NX.criarRNG(77);
    const lista = [];
    'ABCDEFGHIJKLMN'.split('').forEach(l => lista.push({ id: l, area: 'seca' }));
    for (let i = 1; i <= 6; i++) lista.push({ id: 'R' + i, area: 'resfriada' });
    for (let i = 1; i <= 6; i++) lista.push({ id: 'C' + i, area: 'congelada' });
    for (const r of lista) {
      // ruas perto das docas (fim do alfabeto) giram mais e ficam mais vazias
      const vies = r.area === 'seca' ? (r.id.charCodeAt(0) - 65) / 13 * -0.12 + 0.06 : 0;
      r.base = Array.from({ length: 12 }, () => R.normal(vies, 0.12));
    }
    return lista;
  })();
  const media = l => l.reduce((a, b) => a + b, 0) / l.length;
  const MEDIA_BASE = { seca: media(RUAS.filter(r => r.area === 'seca').flatMap(r => r.base)), resfriada: media(RUAS.filter(r => r.area === 'resfriada').flatMap(r => r.base)), congelada: media(RUAS.filter(r => r.area === 'congelada').flatMap(r => r.base)) };

  /* ---------------- Lotes com validade (FEFO) ---------------- */
  function lotes() {
    const R = NX.criarRNG(hojeData().getTime() / 864e5 | 0);
    const pereciveis = CAT.skus.filter(s => s.perecivel);
    const lista = [];
    for (let i = 0; i < 46; i++) {
      const s = R.item(pereciveis);
      const dias = s.area === 'seca' ? R.inteiro(2, 60) : R.inteiro(0, 25);
      lista.push({
        sku: s, lote: 'L' + R.inteiro(2400, 2699) + String.fromCharCode(65 + R.inteiro(0, 5)),
        dias, caixas: R.inteiro(8, 140),
        pos: (s.area === 'seca' ? R.item('ABCDEFGHIJKLMN'.split('')) : (s.area === 'resfriada' ? 'R' : 'C') + R.inteiro(1, 6)) + '-' + String(R.inteiro(1, 12)).padStart(2, '0') + '-' + R.inteiro(1, 4)
      });
    }
    return lista.sort((a, b) => a.dias - b.dias);
  }

  /* ---------------- Inventário rotativo do dia ---------------- */
  function inventario() {
    const S = NX.sim;
    const R = NX.criarRNG((hojeData().getTime() / 864e5 | 0) + 9);
    const plano = [];
    for (let i = 0; i < 36; i++) {
      const s = R.item(CAT.skus);
      const sis = R.inteiro(20, 480);
      const div = R.chance(0.045) ? R.item([-12, -6, -3, -2, -1, 1, 2, 4]) : 0;
      plano.push({ hora: 6 * 60 + i * 28 + R.inteiro(0, 15), sku: s, sis, fis: sis + div, div,
        pos: (s.area === 'seca' ? R.item('ABCDEFGHIJKLMN'.split('')) : (s.area === 'resfriada' ? 'R' : 'C') + R.inteiro(1, 6)) + '-' + String(R.inteiro(1, 12)).padStart(2, '0') + '-' + R.inteiro(1, 4),
        conferente: R.item(['Bruna', 'Thiago', 'Jéssica', 'Lucas', 'Camila', 'Rafael']) });
    }
    const agora = S.t % 1440;
    return { plano, feitas: plano.filter(c => c.hora <= agora) };
  }

  /* ---------------- Segurança do trabalho ---------------- */
  const SEG = {
    ultimoAcidente: new Date(2026, 7, 14),       // último acidente com afastamento
    colaboradores: 214,
    hhtMes: 214 * 7.33 * 26,
    anoComAfast: 1, anoSemAfast: 3, diasPerdidos: 12,
    ocorrencias: [
      { d: '04/11', tipo: 'Quase acidente', area: 'Doca 09', txt: 'Empilhadeira e pedestre no mesmo corredor. Faixa de pedestre repintada.', status: 'Concluída' },
      { d: '01/11', tipo: 'Condição insegura', area: 'Rua F', txt: 'Palete com longarina danificada no nível 3. Posição bloqueada para troca.', status: 'Em andamento' },
      { d: '29/10', tipo: 'Quase acidente', area: 'Câmara congelada', txt: 'Piso com gelo próximo à porta. Ajuste na cortina de ar.', status: 'Concluída' },
      { d: '24/10', tipo: 'Acidente sem afastamento', area: 'Expedição', txt: 'Corte leve na mão ao abrir caixa. Reforço do uso de luva anticorte.', status: 'Concluída' },
      { d: '18/10', tipo: 'Condição insegura', area: 'Pátio', txt: 'Iluminação queimada próxima à balança. Lâmpadas trocadas.', status: 'Concluída' }
    ]
  };

  function seguranca() {
    const S = NX.sim, R = NX.criarRNG((hojeData().getTime() / 864e5 | 0) + 3);
    const dias = Math.floor((hojeData() - SEG.ultimoAcidente) / 864e5);
    const hhtAno = SEG.hhtMes * 10;
    const turnoIdx = NX.CD.turnos.indexOf(S.turno());
    const agora = S.t % 1440;
    const inicioTurno = NX.CD.turnos[turnoIdx].ini % 1440;
    const minTurno = (agora - inicioTurno + 1440) % 1440;
    // checklist das 18 empilhadeiras feito no início de cada turno
    const checklist = Math.min(18, 12 + Math.floor(minTurno / 6));
    // pausa térmica: equipe da câmara (art. 253 CLT: 20 min a cada 1h40 de trabalho contínuo)
    const equipeFrio = 14;
    const ciclo = 120, pos = minTurno % ciclo;
    const emPausa = pos >= 100 ? equipeFrio : (pos >= 95 ? Math.round(equipeFrio * 0.4) : 0);
    return {
      dias, recorde: 312, tf: SEG.anoComAfast * 1e6 / hhtAno, tg: SEG.diasPerdidos * 1e6 / hhtAno,
      quase: 7 + R.inteiro(0, 2), dds: turnoIdx + 1, checklist, equipeFrio, emPausa,
      proximaPausa: pos < 100 ? Math.ceil(100 - pos) : 0, epi: 0.96 + R.entre(0, 0.035)
    };
  }

  /* ---------------- Montagem ---------------- */
  function render(el) {
    el.innerHTML = `
      <div class="grade-kpi" id="am-kpis"></div>
      <section class="painel">
        <header><h2>Mapa de ocupação por rua</h2>
          <div class="legenda escala"><span>vazia</span><i></i><span>cheia</span></div></header>
        <div class="mapa-ruas" id="am-ruas"></div>
      </section>
      <div class="linha-2 igual">
        <section class="painel" id="am-cam-resfriada"></section>
        <section class="painel" id="am-cam-congelada"></section>
      </div>
      <div class="linha-2 igual">
        <section class="painel">
          <header><h2>Curva ABC</h2><span class="kpi-det">por valor de saída</span></header>
          <div id="am-abc"></div>
        </section>
        <section class="painel">
          <header><h2>Validade · FEFO</h2><span class="kpi-det">primeiro que vence, primeiro que sai</span></header>
          <div id="am-fefo"></div>
        </section>
      </div>
      <div class="linha-2 igual">
        <section class="painel">
          <header><h2>Inventário rotativo</h2><span class="kpi-det" id="am-inv-sub"></span></header>
          <div id="am-inv"></div>
        </section>
        <section class="painel">
          <header><h2>Segurança do trabalho</h2><span class="kpi-det">NR-11 · NR-06 · art. 253 CLT</span></header>
          <div id="am-seg"></div>
        </section>
      </div>`;
    atualizar(el);
  }

  function atualizar(el) {
    const S = NX.sim, $ = s => el.querySelector(s);
    if (!$('#am-kpis')) return;
    const P = NX.CD.posicoes;
    const totPos = P.seca + P.resfriada + P.congelada;
    const totOcup = S.estoque.seca + S.estoque.resfriada + S.estoque.congelada;
    const k = S.kpis();
    const minDia = Math.max(60, S.t % 1440);
    const expedDia = k.paletesExpedidos / minDia * 1440;
    const cobertura = expedDia ? totOcup / expedDia : null;
    const inv = inventario();
    const acur = inv.feitas.length ? inv.feitas.filter(c => !c.div).length / inv.feitas.length : null;
    const lt = lotes();
    const venc7 = lt.filter(l => l.dias <= 7);
    const seg = seguranca();
    const conf = k => { const c = S.camaras[k]; return 1 - c.minFora / minDia; };
    const kpi = (r, v, d, e) => `<div class="kpi ${e || ''}"><span class="kpi-rot">${r}</span><strong class="kpi-val">${v}</strong><span class="kpi-det">${d}</span></div>`;
    const occ = totOcup / totPos;

    $('#am-kpis').innerHTML = [
      kpi('Ocupação do armazém', U.num(occ * 100) + '%', `${U.num(totOcup)} de ${U.num(totPos)} posições`, occ > 0.9 ? 'ruim' : occ > 0.82 ? 'atencao' : 'ok'),
      kpi('Posições livres', U.num(totPos - totOcup), `seca ${U.num(P.seca - S.estoque.seca)} · frio ${U.num(P.resfriada + P.congelada - S.estoque.resfriada - S.estoque.congelada)}`),
      kpi('Cobertura de estoque', cobertura == null ? '–' : U.num(cobertura, 1) + '<small> dias</small>', 'no ritmo de expedição de hoje'),
      kpi('Acuracidade', acur == null ? '–' : U.num(acur * 100, 1) + '%', `inventário rotativo · meta 98%`, acur == null ? '' : acur >= 0.98 ? 'ok' : acur >= 0.95 ? 'atencao' : 'ruim'),
      kpi('SKUs ativos', U.num(CAT.skus.length), `${CAT.skus.filter(s => s.classe === 'A').length} classe A`),
      kpi('Vencendo em 7 dias', venc7.length + '<small> lotes</small>', `${U.num(venc7.reduce((a, l) => a + l.caixas, 0))} caixas para priorizar`, venc7.length > 6 ? 'atencao' : 'ok'),
      kpi('Câmaras na faixa', U.num(Math.min(conf('resfriada'), conf('congelada')) * 100, 1) + '%', 'do tempo hoje · pior das duas', Math.min(conf('resfriada'), conf('congelada')) >= 0.98 ? 'ok' : 'atencao'),
      kpi('Dias sem acidente', seg.dias, `com afastamento · recorde ${seg.recorde}`, 'ok')
    ].join('');

    /* Mapa de ruas */
    const bloco = (area, nome) => {
      const occA = S.estoque[area] / P[area];
      const ruas = RUAS.filter(r => r.area === area);
      return `<div class="bloco-ruas"><div class="bloco-tit"><b>${nome}</b><span>${U.num(occA * 100)}%</span></div>
        <div class="grade-ruas">${ruas.map(r => {
          const cel = r.base.map(b => Math.max(0, Math.min(1, b - MEDIA_BASE[area] + occA)));
          return `<span class="rua-id">${r.id}</span>${cel.map((v, i) => `<i style="--o:${v.toFixed(2)}" title="Rua ${r.id} · módulo ${String(i + 1).padStart(2, '0')} · ${U.num(v * 100)}%"></i>`).join('')}<span class="rua-pct">${U.num(media(cel) * 100)}%</span>`;
        }).join('')}</div></div>`;
    };
    $('#am-ruas').innerHTML = bloco('seca', 'Área seca · ruas A–N') + `<div class="ruas-frio">${bloco('resfriada', 'Câmara resfriada')}${bloco('congelada', 'Câmara congelada')}</div>`;

    /* Câmaras */
    for (const key of ['resfriada', 'congelada']) {
      const cfg = NX.CD.camaras[key], c = S.camaras[key];
      const d0 = S.dia * 1440;
      const pts = c.serie.filter(p => p.t >= d0).map(p => ({ x: (p.t - d0) / 60, y: p.v }));
      const lim = [cfg.min - 3, cfg.max + 3];
      const pctOk = conf(key);
      $('#am-cam-' + key).innerHTML = `
        <header><h2>${cfg.nome}</h2><span class="pilula ${c.alarme ? 's-nf' : 's-carga'}">${c.alarme ? 'ALARME' : 'Normal'}</span></header>
        <div class="cam-topo">
          <div><span>Agora</span><b class="${c.alarme ? 't-ruim' : 't-frio'}">${U.num(c.temp, 1)} °C</b></div>
          <div><span>Faixa</span><b>${cfg.min} a ${cfg.max} °C</b></div>
          <div><span>Mín · máx hoje</span><b>${isFinite(c.tMin) ? U.num(c.tMin, 1) + ' · ' + U.num(c.tMax, 1) : '–'}</b></div>
          <div><span>Na faixa</span><b>${U.num(pctOk * 100, 1)}%</b></div>
        </div>
        ${NX.graf.linha([{ cor: c.alarme ? 'var(--ruim)' : 'var(--c-frio)', area: false, pontos: pts }], {
          altura: 170, min: lim[0], max: lim[1], faixa: [cfg.min, cfg.max], casas: 0, xMin: 0, xMax: 24,
          xLabels: [0, 6, 12, 18, 24].map(h => ({ x: h, t: String(h).padStart(2, '0') + 'h' })) })}
        <div class="mini-kpis"><div><span>Alarmes hoje</span><b class="${c.alarmesDia ? 't-ruim' : ''}">${c.alarmesDia}</b></div>
          <div><span>Tempo fora da faixa</span><b>${U.duracao(c.minFora)}</b></div>
          <div><span>Porta de doca aberta</span><b>${U.duracao(c.portaMin)}</b></div></div>`;
    }

    /* Curva ABC (estática, mas barata) */
    if (!$('#am-abc').dataset.ok) {
      const cls = ['A', 'B', 'C'].map(x => {
        const l = CAT.skus.filter(s => s.classe === x);
        return { x, n: l.length, v: l.reduce((a, s) => a + s.valor, 0) / CAT.tot };
      });
      const top = CAT.ord.slice(0, 8);
      $('#am-abc').innerHTML = `
        <div class="abc">${cls.map(c => `<div class="abc-l abc-${c.x}"><b>${c.x}</b>
          <div class="abc-barras"><div><i style="width:${c.n / CAT.skus.length * 100}%"></i><span>${U.num(c.n / CAT.skus.length * 100)}% dos SKUs</span></div>
          <div><i class="v" style="width:${c.v * 100}%"></i><span>${U.num(c.v * 100)}% do valor</span></div></div></div>`).join('')}</div>
        <p class="nota">Poucos itens concentram a maior parte da saída. Os <b>classe A</b> ficam nas ruas mais próximas da expedição (L, M, N) e são contados com mais frequência.</p>
        <div class="rolagem-x"><table class="tabela"><thead><tr><th>SKU</th><th>Descrição</th><th>Categoria</th><th>Classe</th></tr></thead><tbody>
          ${top.map(s => `<tr><td class="mono">${s.cod}</td><td class="corta">${s.desc}</td><td>${s.cat}</td><td><span class="cls cls-${s.classe}">${s.classe}</span></td></tr>`).join('')}
        </tbody></table></div>`;
      $('#am-abc').dataset.ok = 1;
    }

    /* FEFO */
    const faixa = (a, b) => lt.filter(l => l.dias >= a && l.dias <= b).length;
    $('#am-fefo').innerHTML = `
      <div class="fefo-faixas">
        <div class="ff ruim"><b>${faixa(0, 3)}</b><span>0–3 dias</span></div>
        <div class="ff atencao"><b>${faixa(4, 7)}</b><span>4–7 dias</span></div>
        <div class="ff"><b>${faixa(8, 15)}</b><span>8–15 dias</span></div>
        <div class="ff ok"><b>${faixa(16, 999)}</b><span>16+ dias</span></div>
      </div>
      <div class="rolagem-x"><table class="tabela"><thead><tr><th>Lote</th><th>Produto</th><th>Posição</th><th class="num">Cx</th><th class="num">Vence</th><th>Ação</th></tr></thead><tbody>
        ${lt.slice(0, 8).map(l => {
          const d = new Date(hojeData()); d.setDate(d.getDate() + l.dias);
          const acao = l.dias <= 1 ? '<span class="pilula s-nf">Bloquear / avaliar</span>' : l.dias <= 7 ? '<span class="pilula s-manobra">Priorizar expedição</span>' : '<span class="pilula s-livre">Monitorar</span>';
          return `<tr><td class="mono">${l.lote}</td><td class="corta" title="${l.sku.desc}">${l.sku.desc}${l.sku.area !== 'seca' ? NX.ICONE_FRIO : ''}</td><td class="mono">${l.pos}</td>
            <td class="num">${l.caixas}</td><td class="num mono ${l.dias <= 3 ? 't-ruim' : ''}">${l.dias === 0 ? 'hoje' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</td><td>${acao}</td></tr>`;
        }).join('')}
      </tbody></table></div>`;

    /* Inventário */
    $('#am-inv-sub').textContent = `${inv.feitas.length} de ${inv.plano.length} contagens do dia`;
    const divs = inv.feitas.filter(c => c.div);
    $('#am-inv').innerHTML = `
      <div class="inv-topo2">
        <div class="arco-wrap">${NX.graf.arco(acur ?? 0, acur == null ? 'var(--borda-forte)' : acur >= 0.98 ? 'var(--ok)' : 'var(--atencao)', { texto: acur == null ? '–' : U.num(acur * 100, 1) + '%' })}<span>das posições contadas bateram com o sistema</span></div>
        <div class="inv-prog"><div class="barra larga"><i style="width:${inv.feitas.length / inv.plano.length * 100}%"></i></div><small>${U.num(inv.feitas.length / inv.plano.length * 100)}% do plano de contagem do dia</small></div>
      </div>
      <div class="rolagem-x"><table class="tabela"><thead><tr><th>Hora</th><th>Posição</th><th>Produto</th><th class="num">Sistema</th><th class="num">Físico</th><th class="num">Dif.</th><th>Conferente</th></tr></thead><tbody>
        ${inv.feitas.slice().reverse().slice(0, 8).map(c => `<tr class="${c.div ? 'linha-ruim' : ''}"><td class="mono">${U.hora(c.hora)}</td><td class="mono">${c.pos}</td><td class="corta">${c.sku.desc}</td>
          <td class="num mono">${c.sis}</td><td class="num mono">${c.fis}</td><td class="num mono ${c.div ? 't-ruim' : 't-ok'}">${c.div > 0 ? '+' + c.div : c.div || '✓'}</td><td>${c.conferente}</td></tr>`).join('') || '<tr><td colspan="7" class="vazio">As contagens começam às 06:00</td></tr>'}
      </tbody></table></div>
      ${divs.length ? `<p class="nota">${divs.length} divergência(s) hoje enviadas para recontagem e ajuste no sistema.</p>` : ''}`;

    /* Segurança */
    $('#am-seg').innerHTML = `
      <div class="seg-topo">
        <div class="seg-dias"><b>${seg.dias}</b><span>dias sem acidente com afastamento</span>
          <div class="barra larga"><i style="width:${Math.min(100, seg.dias / seg.recorde * 100)}%"></i></div><small>recorde: ${seg.recorde} dias</small></div>
        <div class="seg-grade">
          <div><span>Taxa de frequência</span><b>${U.num(seg.tf, 2)}</b><small>NBR 14280 · no ano</small></div>
          <div><span>Taxa de gravidade</span><b>${U.num(seg.tg, 0)}</b><small>dias perdidos por milhão HHT</small></div>
          <div><span>Quase acidentes</span><b>${seg.quase}</b><small>reportados no mês</small></div>
          <div><span>Uso de EPI</span><b>${U.num(seg.epi * 100, 1)}%</b><small>inspeções do mês</small></div>
        </div>
      </div>
      <div class="seg-turno">
        <div><span>Checklist de empilhadeiras (NR-11)</span><b>${seg.checklist}/18</b><div class="barra"><i style="width:${seg.checklist / 18 * 100}%"></i></div></div>
        <div><span>DDS do dia</span><b>${seg.dds}/3 turnos</b><div class="barra"><i style="width:${seg.dds / 3 * 100}%"></i></div></div>
        <div><span>Pausa térmica · equipe do frio</span><b>${seg.emPausa ? seg.emPausa + ' em pausa' : 'próxima em ' + seg.proximaPausa + ' min'}</b><div class="barra"><i style="width:${seg.emPausa / seg.equipeFrio * 100}%"></i></div></div>
      </div>
      <h3 class="sub-docas">Últimas ocorrências</h3>
      <ul class="ocorrencias">${SEG.ocorrencias.map(o => `<li><time>${o.d}</time><div><b>${o.tipo}</b> · ${o.area}<p>${o.txt}</p></div>
        <span class="pilula ${o.status === 'Concluída' ? 's-carga' : 's-manobra'}">${o.status}</span></li>`).join('')}</ul>`;
  }

  return { titulo: 'Armazém', sub: 'Estoque, câmaras frias e segurança', render, atualizar };
})();
