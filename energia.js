/* =========================================================
   NEXUS CD · energia.js
   Tela "Energia": geração solar x consumo, balanço com a
   rede, consumo por área, inversores e iluminação por zona
   ========================================================= */
NX.telas = NX.telas || {};

NX.telas.energia = (function () {
  const U = NX.util;
  const AREAS = [
    { k: 'camaras', nome: 'Câmaras frias (compressores)', cor: '#38d6f0' },
    { k: 'iluminacao', nome: 'Iluminação', cor: '#facc15' },
    { k: 'administrativo', nome: 'Escritório, TI e ar-condicionado', cor: '#a78bfa' },
    { k: 'empilhadeiras', nome: 'Recarga de empilhadeiras', cor: '#f5a524' },
    { k: 'docas', nome: 'Docas (niveladoras, portas, cortinas)', cor: '#4c8dff' }
  ];
  const INVERSORES = [1.0, 0.98, 1.02, 0.97, 1.01, 0.99];  // variação entre strings
  const MODULOS = 2709, W_MODULO = 335;
  // geração de um dia típico (mesma curva do simulador, com nebulosidade média de 80%)
  const DIA_TIPICO = (() => {
    let kwh = 0;
    for (let m = 0; m < 1440; m++) {
      const h = m / 60;
      const sol = h > 6 && h < 18.5 ? Math.pow(Math.sin(Math.PI * (h - 6) / 12.5), 1.25) : 0;
      kwh += NX.CD.solar_kWp * 0.82 * sol * 0.8 / 60;
    }
    return kwh;
  })();

  function zonasLuz(h) {
    const noite = h < 6 || h >= 18;
    return [
      { nome: 'Área seca', nivel: noite ? 1 : 0.3, obs: noite ? 'LED 100%' : 'dimerizada · luz natural' },
      { nome: 'Câmaras frias', nivel: 1, obs: 'LED com sensor de presença' },
      { nome: 'Docas', nivel: noite ? 1 : 0.6, obs: noite ? 'LED 100%' : 'dimerizada' },
      { nome: 'Pátio e portaria', nivel: noite ? 1 : 0, obs: noite ? 'postes ligados' : 'desligada (fotocélula)' },
      { nome: 'Escritório', nivel: h >= 7 && h < 18 ? 1 : 0.2, obs: h >= 7 && h < 18 ? 'expediente' : 'só segurança' }
    ];
  }

  function render(el) {
    el.innerHTML = `
      <div class="grade-kpi" id="en-kpis"></div>
      <section class="painel">
        <header><h2>Curva do dia</h2>
          <div class="legenda"><span class="l-solar">Geração solar</span><span class="l-consumo-forte">Consumo do CD</span><small class="kpi-det">kWh em cada hora</small></div></header>
        <div id="en-curva"></div>
      </section>
      <div class="linha-3 en-linha">
        <section class="painel">
          <header><h2>Consumo por área</h2><span class="kpi-det">acumulado hoje</span></header>
          <div id="en-areas"></div>
        </section>
        <section class="painel">
          <header><h2>Balanço com a rede</h2><span class="kpi-det">hoje</span></header>
          <div id="en-rede"></div>
        </section>
        <section class="painel">
          <header><h2>Usina solar do telhado</h2><span class="tag-sol" id="en-ceu"></span></header>
          <div id="en-usina"></div>
        </section>
      </div>
      <div class="linha-2 igual">
        <section class="painel">
          <header><h2>Inversores</h2><span class="kpi-det">6 × 150 kW</span></header>
          <div class="grade-inv" id="en-inv"></div>
        </section>
        <section class="painel">
          <header><h2>Iluminação por zona</h2><span class="kpi-det" id="en-luz-sub"></span></header>
          <div id="en-luz"></div>
        </section>
      </div>`;
    atualizar(el);
  }

  function atualizar(el) {
    const S = NX.sim, E = S.energia, $ = s => el.querySelector(s);
    if (!$('#en-kpis')) return;
    const h = (S.t % 1440) / 60, hAtual = Math.floor(h);
    const tarifa = NX.CD.tarifa_kWh;
    const auto = E.consumidoKWh ? E.geradoKWh / E.consumidoKWh : 0;
    const saldo = E.solarKW - E.consumoKW;
    const kpi = (r, v, d, e) => `<div class="kpi ${e || ''}"><span class="kpi-rot">${r}</span><strong class="kpi-val">${v}</strong><span class="kpi-det">${d}</span></div>`;

    $('#en-kpis').innerHTML = [
      kpi('Geração solar agora', U.num(E.solarKW) + '<small> kW</small>', `${U.num(E.solarKW / NX.CD.solar_kWp * 100)}% da capacidade`, E.solarKW > 1 ? 'ok' : ''),
      kpi('Consumo agora', U.num(E.consumoKW) + '<small> kW</small>', `câmaras ${U.num(E.areasKW.camaras || 0)} kW · luz ${U.num(E.areasKW.iluminacao || 0)} kW`),
      kpi(saldo >= 0 ? 'Injetando na rede' : 'Puxando da rede', U.num(Math.abs(saldo)) + '<small> kW</small>', saldo >= 0 ? 'sobra de geração vira crédito' : 'consumo maior que a geração', saldo >= 0 ? 'ok' : 'atencao'),
      kpi('Autossuficiência', U.num(auto * 100) + '%', 'energia do dia vinda do telhado', auto >= 0.5 ? 'ok' : auto >= 0.3 ? 'atencao' : ''),
      kpi('Gerado hoje', U.num(E.geradoKWh / 1000, 2) + '<small> MWh</small>', `${U.num(E.injetadoKWh / 1000, 2)} MWh injetados`),
      kpi('Consumido hoje', U.num(E.consumidoKWh / 1000, 2) + '<small> MWh</small>', `${U.num(E.importadoKWh / 1000, 2)} MWh vindos da rede`),
      kpi('Economia hoje', U.real(E.geradoKWh * tarifa), `tarifa média R$ ${U.num(tarifa, 2)}/kWh`, 'ok'),
      kpi('Custo com a rede hoje', U.real(Math.max(0, E.importadoKWh - E.injetadoKWh) * tarifa), 'líquido, já descontando créditos')
    ].join('');

    /* Curva do dia: barras de consumo + linha de geração */
    const horas = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
    const W = 1000, H = 230, ml = 44, mr = 10, mt = 12, mb = 24, iw = W - ml - mr, ih = H - mt - mb;
    const max = Math.max(800, ...E.porHora.map(p => Math.max(p.gerado, p.consumido))) * 1.08;
    const gw = iw / 24, Y = v => mt + ih - (v / max) * ih;
    let svg = `<svg viewBox="0 0 ${W} ${H}" class="graf">`;
    for (let v = 0; v <= max; v += 200) svg += `<line x1="${ml}" x2="${W - mr}" y1="${Y(v)}" y2="${Y(v)}" class="g-grade"/><text x="${ml - 6}" y="${Y(v) + 3}" class="g-eixo" text-anchor="end">${v}</text>`;
    E.porHora.forEach((p, i) => {
      if (i > hAtual) return;
      const x = ml + i * gw + gw * 0.18, w = gw * 0.64;
      svg += `<rect x="${x}" y="${Y(p.consumido)}" width="${w}" height="${mt + ih - Y(p.consumido)}" rx="2" class="en-barra${i === hAtual ? ' agora' : ''}"><title>${horas[i]}h · consumo ${U.num(p.consumido)} kWh · solar ${U.num(p.gerado)} kWh</title></rect>`;
    });
    const pts = E.porHora.slice(0, hAtual + 1).map((p, i) => [ml + i * gw + gw / 2, Y(p.gerado)]);
    if (pts.length) {
      const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
      svg += `<path d="${d} L${pts[pts.length - 1][0]} ${mt + ih} L${pts[0][0]} ${mt + ih}Z" fill="var(--c-solar)" opacity=".13"/>`;
      svg += `<path d="${d}" fill="none" stroke="var(--c-solar)" stroke-width="2.5" stroke-linejoin="round"/>`;
    }
    horas.forEach((lb, i) => { if (i % 2 === 0) svg += `<text x="${ml + i * gw + gw / 2}" y="${H - 6}" class="g-eixo" text-anchor="middle">${lb}h</text>`; });
    $('#en-curva').innerHTML = svg + '</svg>';

    /* Consumo por área */
    const totA = AREAS.reduce((s, a) => s + (E.porArea[a.k] || 0), 0) || 1;
    $('#en-areas').innerHTML = AREAS.map(a => {
      const v = E.porArea[a.k] || 0;
      return `<div class="area-l"><div class="area-topo"><span>${a.nome}</span><b>${U.num(v)} kWh</b></div>
        <div class="area-barra"><i style="width:${(v / totA * 100).toFixed(1)}%;background:${a.cor}"></i></div>
        <small>${U.num(v / totA * 100)}% · agora ${U.num(E.areasKW[a.k] || 0)} kW</small></div>`;
    }).join('');

    /* Balanço com a rede */
    const proprio = Math.max(0, E.geradoKWh - E.injetadoKWh);
    const totC = E.consumidoKWh || 1;
    $('#en-rede').innerHTML = `
      <div class="pizza-l">
        ${NX.graf.arco(proprio / totC, 'var(--c-solar)', { texto: U.num(proprio / totC * 100) + '%' })}
        <p>do consumo foi atendido direto pelas placas, sem passar pela rede</p>
      </div>
      <div class="rede-fluxo">
        <div><span>Solar usada na hora</span><b class="t-solar">${U.num(proprio / 1000, 2)} MWh</b></div>
        <div><span>Injetada (crédito)</span><b class="t-ok">${U.num(E.injetadoKWh / 1000, 2)} MWh</b></div>
        <div><span>Comprada da rede</span><b>${U.num(E.importadoKWh / 1000, 2)} MWh</b></div>
      </div>
      <p class="nota">De dia o telhado gera mais do que o CD consome e a sobra vira crédito. À noite as câmaras frias e a iluminação puxam da rede.</p>`;

    /* Usina */
    const n = E.nuvem ?? 1;
    $('#en-ceu').textContent = E.solarKW < 1 ? 'sem sol' : n > 0.85 ? 'céu limpo' : n > 0.65 ? 'parcialmente nublado' : 'nublado';
    $('#en-usina').innerHTML = `
      <div class="arco-wrap grande">${NX.graf.arco(E.solarKW / NX.CD.solar_kWp, 'var(--c-solar)', { texto: U.num(E.solarKW) + ' kW' })}
        <span>de ${U.num(NX.CD.solar_kWp)} kWp instalados</span></div>
      <div class="det-grade">
        <div class="det-l"><span>Módulos</span><b>${U.num(MODULOS)} × ${W_MODULO} W</b></div>
        <div class="det-l"><span>Área de telhado</span><b>≈ ${U.num(MODULOS * 2.0)} m²</b></div>
        <div class="det-l"><span>Pico do dia</span><b>${U.num(Math.max(...E.porHora.map(p => p.gerado)))} kWh/h</b></div>
        <div class="det-l"><span>Geração típica</span><b>${U.num(DIA_TIPICO / 1000, 1)} MWh/dia</b></div>
        <div class="det-l"><span>Economia projetada</span><b>≈ R$ ${U.num(DIA_TIPICO * 30 * tarifa / 1000, 0)} mil/mês</b></div>
      </div>`;

    /* Inversores */
    $('#en-inv').innerHTML = INVERSORES.map((f, i) => {
      const kw = E.solarKW / INVERSORES.length * f;
      const temp = 28 + kw / 150 * 22;
      const on = kw > 0.5;
      return `<div class="inv ${on ? 'on' : ''}"><div class="inv-topo"><b>INV-0${i + 1}</b><span class="inv-st">${on ? 'Gerando' : 'Standby'}</span></div>
        <strong>${U.num(kw, 1)} <small>kW</small></strong>
        <div class="barra"><i style="width:${Math.min(100, kw / 150 * 100).toFixed(0)}%"></i></div>
        <small>${U.num(temp, 0)} °C · eficiência ${on ? U.num(97.6 + (f - 1) * 20, 1) + '%' : '–'}</small></div>`;
    }).join('');

    /* Iluminação */
    $('#en-luz-sub').textContent = (h < 6 || h >= 18) ? 'modo noturno' : 'modo diurno';
    $('#en-luz').innerHTML = zonasLuz(h).map(z => `<div class="luz">
      <span class="lamp ${z.nivel > 0 ? 'acesa' : ''}" style="--n:${z.nivel}"></span>
      <div><b>${z.nome}</b><small>${z.obs}</small></div>
      <div class="luz-nivel"><div class="barra"><i style="width:${z.nivel * 100}%"></i></div><span>${U.num(z.nivel * 100)}%</span></div></div>`).join('');
  }

  return { titulo: 'Energia', sub: 'Consumo, iluminação e geração solar', render, atualizar };
})();
