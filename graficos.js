/* =========================================================
   NEXUS CD · graficos.js
   Gráficos SVG leves, reaproveitados por todas as telas
   ========================================================= */
NX.graf = {
  /* Barras agrupadas: labels[], series[{nome, cor, valores[]}] */
  barras(labels, series, opc = {}) {
    const W = 640, H = opc.altura || 200, ml = 30, mr = 8, mt = 10, mb = 22;
    const iw = W - ml - mr, ih = H - mt - mb;
    const empilhar = opc.agrupar === false;
    const somas = labels.map((_, i) => series.reduce((a, s) => a + (s.valores[i] || 0), 0));
    const max = Math.max(1, ...(empilhar ? somas : series.flatMap(s => s.valores))) * 1.1;
    const passo = niceStep(max);
    const topo = Math.ceil(max / passo) * passo;
    const gw = iw / labels.length;
    const bw = Math.max(2, Math.min(14, (gw - 4) / series.length - 1));
    let svg = `<svg viewBox="0 0 ${W} ${H}" class="graf" role="img" aria-label="${opc.titulo || ''}">`;
    for (let v = 0; v <= topo; v += passo) {
      const y = mt + ih - (v / topo) * ih;
      svg += `<line x1="${ml}" x2="${W - mr}" y1="${y}" y2="${y}" class="g-grade"/>`;
      svg += `<text x="${ml - 6}" y="${y + 3}" class="g-eixo" text-anchor="end">${v}</text>`;
    }
    labels.forEach((lb, i) => {
      if (empilhar) {
        const bwE = Math.min(46, gw * 0.62), xE = ml + i * gw + (gw - bwE) / 2;
        let base = 0;
        series.forEach(s => {
          const v = s.valores[i] || 0; if (!v) return;
          const h = (v / topo) * ih;
          svg += `<rect x="${xE}" y="${mt + ih - base - h}" width="${bwE}" height="${h}" rx="2" fill="${s.cor}"><title>${lb} · ${s.nome}: ${v}</title></rect>`;
          base += h;
        });
        if (somas[i]) svg += `<text x="${xE + bwE / 2}" y="${mt + ih - base - 5}" class="g-valor" text-anchor="middle">${somas[i]}</text>`;
        svg += `<text x="${ml + i * gw + gw / 2}" y="${H - 6}" class="g-eixo" text-anchor="middle">${lb}</text>`;
        return;
      }
      const x0 = ml + i * gw + (gw - series.length * (bw + 1)) / 2;
      series.forEach((s, j) => {
        const v = s.valores[i] || 0;
        const h = (v / topo) * ih;
        if (v > 0) svg += `<rect x="${x0 + j * (bw + 1)}" y="${mt + ih - h}" width="${bw}" height="${h}" rx="1.5" fill="${s.cor}" ${opc.destaque === i ? '' : (opc.destaque != null && i > opc.destaque ? 'opacity=".25"' : '')}><title>${lb} · ${s.nome}: ${v}</title></rect>`;
      });
      if (!opc.cadaLabel || i % opc.cadaLabel === 0)
        svg += `<text x="${ml + i * gw + gw / 2}" y="${H - 6}" class="g-eixo" text-anchor="middle">${lb}</text>`;
    });
    if (opc.destaque != null) {
      const x = ml + opc.destaque * gw;
      svg += `<rect x="${x}" y="${mt}" width="${gw}" height="${ih}" class="g-agora"/>`;
    }
    return svg + '</svg>';
  },

  /* Linha simples: pontos [{x, y}] */
  linha(series, opc = {}) {
    const W = opc.largura || 640, H = opc.altura || 160, ml = 34, mr = 8, mt = 10, mb = 22;
    const iw = W - ml - mr, ih = H - mt - mb;
    const ys = series.flatMap(s => s.pontos.map(p => p.y)).concat(opc.faixa || []);
    let min = opc.min ?? Math.min(...ys), max = opc.max ?? Math.max(...ys);
    if (min === max) { min -= 1; max += 1; }
    const x0 = opc.xMin ?? 0, x1 = opc.xMax ?? 1;
    const X = x => ml + ((x - x0) / (x1 - x0)) * iw;
    const Y = y => mt + ih - ((y - min) / (max - min)) * ih;
    let svg = `<svg viewBox="0 0 ${W} ${H}" class="graf">`;
    if (opc.faixa) svg += `<rect x="${ml}" width="${iw}" y="${Y(opc.faixa[1])}" height="${Y(opc.faixa[0]) - Y(opc.faixa[1])}" class="g-faixa"/>`;
    [min, (min + max) / 2, max].forEach(v => {
      svg += `<line x1="${ml}" x2="${W - mr}" y1="${Y(v)}" y2="${Y(v)}" class="g-grade"/>`;
      svg += `<text x="${ml - 6}" y="${Y(v) + 3}" class="g-eixo" text-anchor="end">${NX.util.num(v, opc.casas ?? 0)}</text>`;
    });
    (opc.xLabels || []).forEach(l => svg += `<text x="${X(l.x)}" y="${H - 6}" class="g-eixo" text-anchor="middle">${l.t}</text>`);
    series.forEach(s => {
      if (!s.pontos.length) return;
      const d = s.pontos.map((p, i) => (i ? 'L' : 'M') + X(p.x).toFixed(1) + ' ' + Y(p.y).toFixed(1)).join(' ');
      if (s.area) svg += `<path d="${d} L${X(s.pontos[s.pontos.length - 1].x)} ${mt + ih} L${X(s.pontos[0].x)} ${mt + ih}Z" fill="${s.cor}" opacity=".14"/>`;
      svg += `<path d="${d}" fill="none" stroke="${s.cor}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    });
    return svg + '</svg>';
  },

  /* Medidor em arco (0..1) */
  arco(valor, cor, opc = {}) {
    const v = Math.max(0, Math.min(1, valor || 0));
    const r = 42, c = Math.PI * r;
    return `<svg viewBox="0 0 100 58" class="arco">
      <path d="M8 52 A42 42 0 0 1 92 52" class="arco-fundo"/>
      <path d="M8 52 A42 42 0 0 1 92 52" stroke="${cor}" class="arco-valor"
            stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - v)}"/>
      <text x="50" y="48" text-anchor="middle" class="arco-txt">${opc.texto ?? Math.round(v * 100) + '%'}</text>
    </svg>`;
  }
};

function niceStep(max) {
  const bruto = max / 4;
  const p = Math.pow(10, Math.floor(Math.log10(bruto)));
  const n = bruto / p;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * p;
}
