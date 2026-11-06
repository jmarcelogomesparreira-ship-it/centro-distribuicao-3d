/* =========================================================
   NEXUS CD · docas.js
   Tela "Docas": linha do tempo, ciclo do caminhão por etapa,
   desempenho por doca e por transportadora, fila do pátio
   ========================================================= */
NX.telas = NX.telas || {};

NX.telas.docas = (function () {
  const U = NX.util;
  let janelaH = 6;          // janela da linha do tempo (horas)
  let filtroOp = 'todas';   // todas | entrada | saida

  const ETAPAS = [
    { k: 'portaria', nome: 'Portaria', cor: '#f5a524', de: 'chegada', ate: 'patio' },
    { k: 'espera', nome: 'Espera no pátio', cor: '#f2545b', de: 'patio', ate: 'chamado' },
    { k: 'manobra', nome: 'Manobra', cor: '#fbbf24', de: 'chamado', ate: 'inicioOp' },
    { k: 'operacao', nome: 'Carga/descarga', cor: '#4c8dff', de: 'inicioOp', ate: 'fimOp' },
    { k: 'conferencia', nome: 'Conferência', cor: '#a78bfa', de: 'fimOp', ate: 'fimConf' },
    { k: 'nf', nome: 'Emissão NF', cor: '#f472b6', de: 'fimConf', ate: 'nf' },
    { k: 'saida', nome: 'Saída', cor: '#657284', de: null, ate: 'saida' }
  ];

  /* ---------- cálculos ---------- */
  function doDia() { const S = NX.sim; return S.caminhoes.filter(c => c.dia === S.dia); }

  function decomporCiclo(lista) {
    const soma = {}, n = lista.length || 1;
    ETAPAS.forEach(e => soma[e.k] = 0);
    for (const c of lista) {
      const t = c.tempos;
      for (const e of ETAPAS) {
        if (e.k === 'nf' && c.operacao === 'entrada') continue;
        const de = e.k === 'saida' ? (t.nf ?? t.fimConf) : t[e.de];
        const ate = t[e.ate];
        if (de != null && ate != null) soma[e.k] += Math.max(0, ate - de);
      }
    }
    for (const k in soma) soma[k] /= n;
    return soma;
  }

  function porDoca() {
    const S = NX.sim, lista = doDia();
    const minDia = Math.max(1, S.t - S.dia * 1440);
    return S.docas.map(d => {
      const cs = lista.filter(c => c.doca === d.id && c.tempos.fimOp != null);
      const ops = cs.map(c => c.tempos.fimOp - c.tempos.inicioOp);
      const pal = cs.reduce((s, c) => s + c.paletes, 0);
      return {
        d, n: cs.length, paletes: pal,
        ocup: d.ocupadaMin / minDia,
        opMedia: U.media(ops),
        minPalete: pal ? ops.reduce((s, x) => s + x, 0) / pal : null,
        status: NX.statusDoca(d),
        atual: d.caminhao && S.caminhao(d.caminhao)
      };
    });
  }

  function porTransportadora() {
    const fin = doDia().filter(c => c.status === 'finalizado');
    return NX.TRANSPORTADORAS.map(T => {
      const cs = fin.filter(c => c.transportadora === T.id);
      const s = cs.filter(c => c.operacao === 'saida');
      return {
        T, n: cs.length,
        espera: U.media(cs.map(c => c.tempos.chamado - c.tempos.patio)),
        ciclo: U.media(cs.map(c => c.tempos.saida - c.tempos.chegada)),
        minPalete: cs.length ? cs.reduce((a, c) => a + (c.tempos.fimOp - c.tempos.inicioOp), 0) / cs.reduce((a, c) => a + c.paletes, 0) : null,
        otif: s.length ? s.filter(c => c.noPrazo).length / s.length : null
      };
    }).filter(r => r.n > 0).sort((a, b) => a.ciclo - b.ciclo);
  }

  /* ---------- linha do tempo (Gantt) ---------- */
  function gantt() {
    const S = NX.sim;
    const W = 1000, linhaH = 26, ml = 52, mr = 12, mt = 22, H = mt + linhaH * 12 + 8;
    const fim = S.t, ini = fim - janelaH * 60;
    const X = t => ml + ((t - ini) / (fim - ini)) * (W - ml - mr);
    let svg = `<svg viewBox="0 0 ${W} ${H}" class="graf gantt">`;
    // grade de horas
    const passo = janelaH <= 6 ? 60 : janelaH <= 12 ? 120 : 180;
    for (let t = Math.ceil(ini / passo) * passo; t <= fim; t += passo) {
      svg += `<line x1="${X(t)}" x2="${X(t)}" y1="${mt - 4}" y2="${H - 6}" class="g-grade"/>`;
      svg += `<text x="${X(t)}" y="12" class="g-eixo" text-anchor="middle">${U.hora(t)}</text>`;
    }
    S.docas.forEach((d, i) => {
      const y = mt + i * linhaH;
      if (i % 2 === 0) svg += `<rect x="${ml}" y="${y}" width="${W - ml - mr}" height="${linhaH}" class="g-zebra"/>`;
      if (i === 6) svg += `<line x1="0" x2="${W}" y1="${y}" y2="${y}" class="g-divisa"/>`;
      svg += `<text x="8" y="${y + 17}" class="g-doca">${String(d.id).padStart(2, '0')}${d.fria ? ' ❄' : ''}</text>`;
    });
    for (const c of S.caminhoes) {
      if (!c.doca || c.tempos.chamado == null) continue;
      if (filtroOp !== 'todas' && c.operacao !== filtroOp) continue;
      const a = c.tempos.chamado, b = c.tempos.docaLivre ?? S.t;
      if (b < ini || a > fim) continue;
      const i = c.doca - 1, y = mt + i * linhaH + 4;
      const x0 = X(Math.max(a, ini)), x1 = X(Math.min(b, fim));
      const cor = c.operacao === 'entrada' ? 'var(--c-entrada)' : 'var(--c-saida)';
      const aberto = c.tempos.docaLivre == null;
      // manobra/conferência/NF em tom mais claro; operação sólida
      const segs = [
        [a, c.tempos.inicioOp ?? b, .35],
        [c.tempos.inicioOp, c.tempos.fimOp ?? (c.tempos.inicioOp != null ? b : null), 1],
        [c.tempos.fimOp, b, .55]
      ];
      let g = '';
      for (const [s0, s1, op] of segs) {
        if (s0 == null || s1 == null || s1 <= s0) continue;
        const xa = X(Math.max(s0, ini)), xb = X(Math.min(s1, fim));
        if (xb - xa < 0.3) continue;
        g += `<rect x="${xa}" y="${y}" width="${xb - xa}" height="${linhaH - 8}" fill="${cor}" opacity="${op}"/>`;
      }
      const tip = `${c.placa} · ${c.operacao === 'entrada' ? 'descarga' : 'carga'} · ${c.paletes} pal · ${U.hora(a)}–${aberto ? 'agora' : U.hora(b)} (${U.duracao(b - a)})${c.divergencia ? ' · divergência' : ''}`;
      svg += `<g class="g-barra${c.divergencia ? ' div' : ''}${aberto ? ' aberto' : ''}"><title>${tip}</title>${g}
        <rect x="${x0}" y="${y}" width="${Math.max(1, x1 - x0)}" height="${linhaH - 8}" rx="3" class="g-contorno"/>
        ${x1 - x0 > 62 ? `<text x="${x0 + 5}" y="${y + 12.5}" class="g-placa">${c.placa}</text>` : ''}</g>`;
    }
    svg += `<line x1="${X(fim)}" x2="${X(fim)}" y1="${mt - 6}" y2="${H - 4}" class="g-agora-linha"/>`;
    return svg + '</svg>';
  }

  /* ---------- barra empilhada do ciclo ---------- */
  function barraCiclo(nome, soma) {
    const tot = Object.values(soma).reduce((a, b) => a + b, 0) || 1;
    const partes = ETAPAS.filter(e => soma[e.k] > 0.05).map(e =>
      `<i style="flex:${soma[e.k]};background:${e.cor}" title="${e.nome}: ${U.duracao(soma[e.k])}">${soma[e.k] / tot > 0.09 ? U.duracao(soma[e.k]) : ''}</i>`).join('');
    return `<div class="ciclo"><div class="ciclo-topo"><span>${nome}</span><b>${U.duracao(tot)}</b></div><div class="ciclo-barra">${partes}</div></div>`;
  }

  /* ---------- montagem ---------- */
  function render(el) {
    el.innerHTML = `
      <div class="grade-kpi" id="dk-kpis"></div>
      <section class="painel">
        <header><h2>Linha do tempo das docas</h2>
          <div class="ctrl-linha">
            <div class="legenda"><span class="l-entrada">Descarga</span><span class="l-saida">Carga</span>
              <span class="l-claro">tom claro = manobra / conferência / NF</span></div>
            <div class="seg" data-grupo="op"><button data-v="todas" class="ativo">Todas</button><button data-v="entrada">Entradas</button><button data-v="saida">Saídas</button></div>
            <div class="seg" data-grupo="janela"><button data-v="6" class="ativo">6h</button><button data-v="12">12h</button><button data-v="24">24h</button></div>
          </div></header>
        <div class="rolagem-x"><div id="dk-gantt" class="gantt-wrap"></div></div>
      </section>
      <div class="linha-2">
        <section class="painel">
          <header><h2>Onde o tempo do caminhão vai</h2><span class="kpi-det">média dos finalizados hoje</span></header>
          <div id="dk-ciclo"></div>
          <div class="legenda" id="dk-ciclo-leg"></div>
          <p class="nota" id="dk-gargalo"></p>
        </section>
        <section class="painel">
          <header><h2>Fila do pátio</h2><span class="contador" id="dk-fila-n">0</span></header>
          <div class="rolagem-x"><table class="tabela" id="dk-fila"></table></div>
        </section>
      </div>
      <div class="linha-2 igual">
        <section class="painel">
          <header><h2>Desempenho por doca</h2><span class="kpi-det">hoje</span></header>
          <div class="rolagem-x"><table class="tabela" id="dk-docas"></table></div>
        </section>
        <section class="painel">
          <header><h2>Transportadoras</h2><span class="kpi-det">finalizados hoje · menor ciclo primeiro</span></header>
          <div class="rolagem-x"><table class="tabela" id="dk-transp"></table></div>
        </section>
      </div>`;

    el.querySelectorAll('.seg[data-grupo]').forEach(seg => seg.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      seg.querySelectorAll('button').forEach(x => x.classList.toggle('ativo', x === b));
      if (seg.dataset.grupo === 'janela') janelaH = Number(b.dataset.v); else filtroOp = b.dataset.v;
      atualizar(el);
    }));
    el.querySelector('#dk-ciclo-leg').innerHTML = ETAPAS.map(e => `<span style="--cor:${e.cor}">${e.nome}</span>`).join('');
    atualizar(el);
  }

  function atualizar(el) {
    const S = NX.sim, k = S.kpis();
    const $ = s => el.querySelector(s);
    if (!$('#dk-kpis')) return;

    /* KPIs */
    const fila = S.caminhoes.filter(c => c.status === 'patio' || c.status === 'portaria').sort((a, b) => a.tempos.chegada - b.tempos.chegada);
    const maiorEspera = fila.length ? S.t - fila[0].tempos.chegada : 0;
    const meta = (v, l) => v == null ? '' : v <= l ? 'ok' : v <= l * 1.3 ? 'atencao' : 'ruim';
    const kpi = (r, v, d, e) => `<div class="kpi ${e || ''}"><span class="kpi-rot">${r}</span><strong class="kpi-val">${v}</strong><span class="kpi-det">${d}</span></div>`;
    $('#dk-kpis').innerHTML = [
      kpi('Docas em uso agora', `${k.emDoca}<small>/12</small>`, `ocupação no dia ${U.num(k.ocupacaoDocas * 100)}%`),
      kpi('Espera no pátio', U.duracao(k.esperaMedia), 'média · meta 30 min', meta(k.esperaMedia, 30)),
      kpi('Maior espera agora', fila.length ? U.duracao(maiorEspera) : '–', fila.length ? fila[0].placa : 'pátio livre', meta(maiorEspera, 45)),
      kpi('Ciclo do caminhão', U.duracao(k.cicloMedio), 'portaria → saída · meta 2h', meta(k.cicloMedio, 120)),
      kpi('Descarga média', U.duracao(k.descargaMedia), `${U.num(k.paletesRecebidos)} paletes recebidos`),
      kpi('Carga média', U.duracao(k.cargaMedia), `${U.num(k.paletesExpedidos)} paletes expedidos`),
      kpi('Caminhões atendidos', k.finalizadosEntrada + k.finalizadosSaida, `${k.finalizadosEntrada} entradas · ${k.finalizadosSaida} saídas`),
      kpi('Na fila agora', fila.length, `${fila.filter(c => c.operacao === 'entrada').length} entrada · ${fila.filter(c => c.operacao === 'saida').length} saída`, fila.length > 10 ? 'ruim' : fila.length > 5 ? 'atencao' : 'ok')
    ].join('');

    /* Gantt */
    $('#dk-gantt').innerHTML = gantt();

    /* Ciclo por etapa */
    const fin = doDia().filter(c => c.status === 'finalizado');
    const sE = decomporCiclo(fin.filter(c => c.operacao === 'entrada'));
    const sS = decomporCiclo(fin.filter(c => c.operacao === 'saida'));
    $('#dk-ciclo').innerHTML = barraCiclo('Entrada (recebimento)', sE) + barraCiclo('Saída (expedição)', sS);
    // gargalo = maior etapa que não agrega valor (tudo menos a carga/descarga)
    const espera = ETAPAS.filter(e => e.k !== 'operacao');
    const maior = s => espera.reduce((m, e) => s[e.k] > s[m.k] ? e : m, espera[0]);
    const parado = s => espera.reduce((a, e) => a + s[e.k], 0);
    const totE = parado(sE) + sE.operacao, totS = parado(sS) + sS.operacao;
    const gE = maior(sE), gS = maior(sS);
    $('#dk-gargalo').innerHTML = fin.length
      ? `<b>Gargalo:</b> fora da carga/descarga, o caminhão de entrada perde mais tempo em <b>${gE.nome.charAt(0).toLowerCase() + gE.nome.slice(1)}</b> (${U.duracao(sE[gE.k])}) e o de saída em <b>${gS.nome.charAt(0).toLowerCase() + gS.nome.slice(1)}</b> (${U.duracao(sS[gS.k])}). ` +
        `Tempo parado: <b>${U.num(parado(sE) / (totE || 1) * 100)}%</b> do ciclo na entrada e <b>${U.num(parado(sS) / (totS || 1) * 100)}%</b> na saída.`
      : 'Sem caminhões finalizados ainda hoje.';

    /* Fila */
    $('#dk-fila-n').textContent = fila.length;
    $('#dk-fila').innerHTML = `<thead><tr><th>#</th><th>Placa</th><th>Op.</th><th>Origem / destino</th><th class="num">Pal.</th><th class="num">Espera</th></tr></thead><tbody>` +
      (fila.length ? fila.map((c, i) => {
        const esp = S.t - c.tempos.chegada;
        return `<tr class="${esp > 45 ? 'linha-ruim' : ''}"><td>${i + 1}</td><td class="mono">${c.placa}${c.frio ? NX.ICONE_FRIO : ''}</td>
          <td><span class="op op-${c.operacao}">${c.operacao === 'entrada' ? 'ENT' : 'SAÍ'}</span></td>
          <td class="corta">${c.status === 'portaria' ? '<i>na portaria</i>' : c.parceiro}</td>
          <td class="num">${c.paletes}</td><td class="num mono">${U.duracao(esp)}</td></tr>`;
      }).join('') : '<tr><td colspan="6" class="vazio">Pátio livre</td></tr>') + '</tbody>';

    /* Por doca */
    const docas = porDoca();
    $('#dk-docas').innerHTML = `<thead><tr><th>Doca</th><th>Status</th><th class="num">Caminhões</th><th class="num">Paletes</th><th class="num">Tempo médio</th><th class="num">min/palete</th><th>Ocupação</th></tr></thead><tbody>` +
      docas.map(r => `<tr><td class="mono">${String(r.d.id).padStart(2, '0')} ${r.d.fria ? NX.ICONE_FRIO : ''}<small class="tipo-doca">${r.d.tipo === 'entrada' ? 'receb.' : 'exped.'}</small></td>
        <td><span class="pilula ${r.status.cls}">${r.status.txt}</span></td>
        <td class="num">${r.n}</td><td class="num">${U.num(r.paletes)}</td>
        <td class="num mono">${U.duracao(r.opMedia)}</td><td class="num mono">${r.minPalete == null ? '–' : U.num(r.minPalete, 1)}</td>
        <td><div class="mini-barra"><i style="width:${Math.min(100, r.ocup * 100).toFixed(0)}%"></i><span>${U.num(r.ocup * 100)}%</span></div></td></tr>`).join('') + '</tbody>';

    /* Transportadoras */
    const tr = porTransportadora();
    const maxCiclo = Math.max(1, ...tr.map(r => r.ciclo || 0));
    $('#dk-transp').innerHTML = `<thead><tr><th>Transportadora</th><th class="num">Viagens</th><th class="num">Espera</th><th class="num">min/pal</th><th class="num">OTIF</th><th>Ciclo médio</th></tr></thead><tbody>` +
      (tr.length ? tr.map(r => `<tr><td><span class="ponto" style="background:${r.T.cor}"></span>${r.T.nome}${r.T.frio ? NX.ICONE_FRIO : ''}</td>
        <td class="num">${r.n}</td><td class="num mono">${U.duracao(r.espera)}</td><td class="num mono">${r.minPalete == null ? '–' : U.num(r.minPalete, 1)}</td>
        <td class="num mono ${r.otif != null && r.otif < 0.9 ? 't-ruim' : ''}">${r.otif == null ? '–' : U.num(r.otif * 100) + '%'}</td>
        <td><div class="mini-barra ciclo-b ${r.ciclo > 120 ? 'ruim' : ''}"><i style="width:${(r.ciclo / maxCiclo * 100).toFixed(0)}%"></i><span>${U.duracao(r.ciclo)}</span></div></td></tr>`).join('')
        : '<tr><td colspan="6" class="vazio">Sem viagens finalizadas hoje</td></tr>') + '</tbody>';
  }

  return { titulo: 'Docas', sub: 'Operação de carga e descarga', render, atualizar };
})();
