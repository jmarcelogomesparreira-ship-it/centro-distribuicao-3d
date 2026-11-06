/* =========================================================
   NEXUS CD · fiscal.js
   Tela "Fiscal": NF de entrada (lançamento) e NF-e de saída
   (emissão), SLA, fila, divergências e valor movimentado
   ========================================================= */
NX.telas = NX.telas || {};

NX.telas.fiscal = (function () {
  const U = NX.util;
  const SLA = { entrada: 40, saida: 15 };
  let filtro = 'todas';

  const tempo = n => (n.concluida ?? NX.sim.t) - n.criada;

  function histograma(lista, faixas) {
    const cont = faixas.map(() => 0);
    for (const n of lista) {
      const t = tempo(n);
      const i = faixas.findIndex(f => t < f.ate);
      cont[i === -1 ? faixas.length - 1 : i]++;
    }
    return cont;
  }

  function render(el) {
    el.innerHTML = `
      <div class="grade-kpi" id="fs-kpis"></div>
      <div class="linha-2">
        <section class="painel">
          <header><h2>Fila do fiscal agora</h2>
            <div class="seg" id="fs-filtro"><button data-v="todas" class="ativo">Todas</button><button data-v="saida">Saída</button><button data-v="entrada">Entrada</button></div></header>
          <div class="rolagem-x"><table class="tabela" id="fs-fila"></table></div>
        </section>
        <section class="painel">
          <header><h2>Dentro do prazo</h2><span class="kpi-det">hoje</span></header>
          <div id="fs-sla" class="sla-wrap"></div>
          <p class="nota" id="fs-nota"></p>
        </section>
      </div>
      <div class="linha-2 igual">
        <section class="painel">
          <header><h2>Tempo de emissão da NF-e de saída</h2><span class="kpi-det">quantidade de notas por faixa</span></header>
          <div id="fs-hist-s"></div>
        </section>
        <section class="painel">
          <header><h2>Tempo de lançamento da NF de entrada</h2><span class="kpi-det">quantidade de notas por faixa</span></header>
          <div id="fs-hist-e"></div>
        </section>
      </div>
      <div class="linha-2 igual">
        <section class="painel">
          <header><h2>Tempo médio por hora</h2>
            <div class="legenda"><span class="l-saida">Emissão saída</span><span class="l-entrada">Lançamento entrada</span><span class="l-meta">Meta saída 15 min</span></div></header>
          <div id="fs-hora"></div>
        </section>
        <section class="painel">
          <header><h2>Valor movimentado por hora</h2>
            <div class="legenda"><span class="l-entrada">Entradas</span><span class="l-saida">Saídas</span></div></header>
          <div id="fs-valor"></div>
        </section>
      </div>
      <div class="linha-2 igual">
        <section class="painel">
          <header><h2>Divergências do dia</h2><span class="contador" id="fs-div-n">0</span></header>
          <div class="rolagem-x"><table class="tabela" id="fs-div"></table></div>
        </section>
        <section class="painel">
          <header><h2>Últimas notas concluídas</h2></header>
          <div class="rolagem-x"><table class="tabela" id="fs-ult"></table></div>
        </section>
      </div>`;
    el.querySelector('#fs-filtro').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      filtro = b.dataset.v;
      el.querySelectorAll('#fs-filtro button').forEach(x => x.classList.toggle('ativo', x === b));
      atualizar(el);
    });
    atualizar(el);
  }

  function atualizar(el) {
    const S = NX.sim, $ = s => el.querySelector(s);
    if (!$('#fs-kpis')) return;
    const doDia = S.nfs.filter(n => n.dia === S.dia);
    const ok = doDia.filter(n => n.concluida != null);
    const okE = ok.filter(n => n.tipo === 'entrada'), okS = ok.filter(n => n.tipo === 'saida');
    const pend = S.nfs.filter(n => n.concluida == null);
    const pendE = pend.filter(n => n.tipo === 'entrada'), pendS = pend.filter(n => n.tipo === 'saida');
    const mE = U.media(okE.map(tempo)), mS = U.media(okS.map(tempo));
    const noPrazo = (l, t) => l.length ? l.filter(n => tempo(n) <= SLA[t]).length / l.length : null;
    const slaE = noPrazo(okE.filter(n => !n.divergencia), 'entrada'), slaS = noPrazo(okS, 'saida');
    const div = doDia.filter(n => n.divergencia);
    const valE = okE.reduce((s, n) => s + n.valor, 0), valS = okS.reduce((s, n) => s + n.valor, 0);
    const meta = (v, l) => v == null ? '' : v <= l ? 'ok' : v <= l * 1.3 ? 'atencao' : 'ruim';
    const pct = v => v == null ? '–' : U.num(v * 100) + '%';
    const kpi = (r, v, d, e) => `<div class="kpi ${e || ''}"><span class="kpi-rot">${r}</span><strong class="kpi-val">${v}</strong><span class="kpi-det">${d}</span></div>`;
    const mi = v => v >= 1e6 ? 'R$ ' + U.num(v / 1e6, 1) + ' mi' : U.real(v);

    $('#fs-kpis').innerHTML = [
      kpi('Emissão NF-e saída', U.duracao(mS), `média · meta ${SLA.saida} min`, meta(mS, SLA.saida)),
      kpi('Lançamento NF entrada', U.duracao(mE), `média · meta ${SLA.entrada} min`, meta(mE, SLA.entrada)),
      kpi('NF-e emitidas', okS.length, `${pct(slaS)} no prazo`, slaS == null ? '' : slaS >= 0.9 ? 'ok' : slaS >= 0.75 ? 'atencao' : 'ruim'),
      kpi('NF entrada lançadas', okE.length, `${pct(slaE)} no prazo (sem divergência)`, slaE == null ? '' : slaE >= 0.9 ? 'ok' : slaE >= 0.75 ? 'atencao' : 'ruim'),
      kpi('Pendentes agora', pend.length, `${pendS.length} saída (caminhão parado) · ${pendE.length} entrada`, pendS.length > 4 ? 'ruim' : pendS.length > 2 ? 'atencao' : 'ok'),
      kpi('Divergências', div.length, `${U.num(doDia.length ? div.length / doDia.length * 100 : 0, 1)}% das notas do dia`, div.length / Math.max(1, doDia.length) > 0.08 ? 'atencao' : 'ok'),
      kpi('Valor recebido', mi(valE), `${okE.length} notas de entrada`),
      kpi('Valor expedido', mi(valS), `${okS.length} notas de saída`)
    ].join('');

    /* Fila */
    const fila = pend.filter(n => filtro === 'todas' || n.tipo === filtro).sort((a, b) => a.criada - b.criada);
    $('#fs-fila').innerHTML = `<thead><tr><th>Tipo</th><th>NF</th><th>Parceiro</th><th>Placa</th><th class="num">Valor</th><th>Situação</th><th>Tempo x prazo</th></tr></thead><tbody>` +
      (fila.length ? fila.map(n => {
        const t = tempo(n), lim = SLA[n.tipo], p = t / lim;
        const c = S.caminhao(n.caminhao);
        const sit = n.divergencia ? `<span class="pilula s-nf">${n.tipo === 'entrada' ? 'Divergente' : 'Em análise'}</span>`
          : n.tipo === 'saida' ? `<span class="pilula s-manobra">Aguardando · doca ${c ? String(c.doca).padStart(2, '0') : '–'}</span>` : '<span class="pilula s-conf">A lançar</span>';
        return `<tr><td><span class="op op-${n.tipo}">${n.tipo === 'entrada' ? 'ENT' : 'SAÍ'}</span></td>
          <td class="mono">${n.numero}</td><td class="corta">${n.parceiro}</td><td class="mono">${n.placa}</td>
          <td class="num mono">${U.real(n.valor)}</td><td>${sit}</td>
          <td><div class="mini-barra prazo ${p > 1 ? 'ruim' : p > 0.75 ? 'atencao' : ''}"><i style="width:${Math.min(100, p * 100).toFixed(0)}%"></i><span>${U.duracao(t)} / ${lim} min</span></div></td></tr>`;
      }).join('') : '<tr><td colspan="7" class="vazio">Nenhuma nota pendente</td></tr>') + '</tbody>';

    /* SLA */
    const anel = (nome, v, sub) => `<div class="sla">${NX.graf.arco(v ?? 0, v == null ? 'var(--borda-forte)' : v >= 0.9 ? 'var(--ok)' : v >= 0.75 ? 'var(--atencao)' : 'var(--ruim)', { texto: pct(v) })}
      <b>${nome}</b><span>${sub}</span></div>`;
    $('#fs-sla').innerHTML = anel('NF-e de saída', slaS, `em até ${SLA.saida} min`) + anel('NF de entrada', slaE, `em até ${SLA.entrada} min`);
    const travados = pendS.reduce((s, n) => s + (S.t - n.criada), 0);
    $('#fs-nota').innerHTML = pendS.length
      ? `Agora ${pendS.length === 1 ? 'há <b>1 caminhão parado' : 'há <b>' + pendS.length + ' caminhões parados'} na doca</b> esperando NF-e, somando <b>${U.duracao(travados)}</b> de doca ocupada sem operação.`
      : 'Nenhum caminhão parado na doca esperando NF-e neste momento.';

    /* Histogramas */
    const fxS = [{ ate: 5, r: '0–5' }, { ate: 10, r: '5–10' }, { ate: 15, r: '10–15' }, { ate: 20, r: '15–20' }, { ate: 30, r: '20–30' }, { ate: Infinity, r: '30+' }];
    const fxE = [{ ate: 15, r: '0–15' }, { ate: 30, r: '15–30' }, { ate: 40, r: '30–40' }, { ate: 60, r: '40–60' }, { ate: 120, r: '60–120' }, { ate: Infinity, r: '120+' }];
    const hist = (lista, fx, lim) => {
      const cont = histograma(lista, fx);
      return NX.graf.barras(fx.map(f => f.r + ' min'), [
        { nome: 'Dentro do prazo', cor: 'var(--ok)', valores: cont.map((v, i) => fx[i].ate <= lim ? v : 0) },
        { nome: 'Fora do prazo', cor: 'var(--ruim)', valores: cont.map((v, i) => fx[i].ate > lim ? v : 0) }
      ], { altura: 190, agrupar: false });
    };
    $('#fs-hist-s').innerHTML = hist(okS, fxS, SLA.saida);
    $('#fs-hist-e').innerHTML = hist(okE, fxE, SLA.entrada);

    /* Tempo médio por hora */
    const horaAtual = Math.floor((S.t % 1440) / 60);
    const porHora = tipo => {
      const pts = [];
      for (let h = 0; h <= horaAtual; h++) {
        const l = ok.filter(n => n.tipo === tipo && Math.floor((n.concluida % 1440) / 60) === h);
        if (l.length) pts.push({ x: h + 0.5, y: U.media(l.map(tempo)) });
      }
      return pts;
    };
    $('#fs-hora').innerHTML = NX.graf.linha([
      { cor: 'var(--c-saida)', pontos: porHora('saida') },
      { cor: 'var(--c-entrada)', pontos: porHora('entrada') }
    ], { altura: 200, min: 0, max: 80, faixa: [0, SLA.saida], xMin: 0, xMax: 24,
         xLabels: [0, 4, 8, 12, 16, 20, 24].map(h => ({ x: h, t: String(h).padStart(2, '0') + 'h' })) });

    /* Valor por hora */
    const vh = Array.from({ length: 24 }, () => ({ entrada: 0, saida: 0 }));
    ok.forEach(n => vh[Math.floor((n.concluida % 1440) / 60)][n.tipo] += n.valor / 1000);
    $('#fs-valor').innerHTML = NX.graf.barras(Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')), [
      { nome: 'Entradas (R$ mil)', cor: 'var(--c-entrada)', valores: vh.map(v => Math.round(v.entrada)) },
      { nome: 'Saídas (R$ mil)', cor: 'var(--c-saida)', valores: vh.map(v => Math.round(v.saida)) }
    ], { altura: 200, cadaLabel: 2, destaque: horaAtual }) + '<p class="eixo-nota">em R$ mil</p>';

    /* Divergências */
    $('#fs-div-n').textContent = div.length;
    $('#fs-div').innerHTML = `<thead><tr><th>Hora</th><th>Tipo</th><th>NF</th><th>Parceiro</th><th>Motivo</th><th>Situação</th></tr></thead><tbody>` +
      (div.length ? div.slice().reverse().map(n => `<tr><td class="mono">${U.hora(n.criada)}</td>
        <td><span class="op op-${n.tipo}">${n.tipo === 'entrada' ? 'ENT' : 'SAÍ'}</span></td><td class="mono">${n.numero}</td>
        <td class="corta">${n.parceiro}</td><td class="corta" title="${n.motivo}">${n.motivo}</td>
        <td>${n.concluida != null ? '<span class="pilula s-carga">Resolvida</span>' : '<span class="pilula s-nf">Em tratativa</span>'}</td></tr>`).join('')
        : '<tr><td colspan="6" class="vazio">Nenhuma divergência hoje</td></tr>') + '</tbody>';

    /* Últimas notas */
    const ult = ok.slice().sort((a, b) => b.concluida - a.concluida).slice(0, 10);
    $('#fs-ult').innerHTML = `<thead><tr><th>Hora</th><th>NF / série</th><th>CFOP</th><th>Parceiro</th><th class="num">Valor</th><th class="num">Tempo</th></tr></thead><tbody>` +
      (ult.length ? ult.map(n => {
        const t = tempo(n);
        return `<tr><td class="mono">${U.hora(n.concluida)}</td><td class="mono">${n.numero}<small class="tipo-doca">/${n.serie}</small></td>
        <td class="mono" title="${{ '1.102': 'Compra p/ comercialização (MG)', '2.102': 'Compra p/ comercialização (outro estado)', '5.152': 'Transferência p/ filial (MG)', '6.152': 'Transferência p/ filial (outro estado)' }[n.cfop]}">${n.cfop}</td>
        <td class="corta">${n.parceiro}</td><td class="num mono">${U.real(n.valor)}</td>
        <td class="num mono ${t > SLA[n.tipo] && !n.divergencia ? 't-ruim' : ''}">${U.duracao(t)}</td></tr>`;
      }).join('') : '<tr><td colspan="6" class="vazio">Sem notas concluídas ainda</td></tr>') + '</tbody>';
  }

  return { titulo: 'Fiscal', sub: 'Notas fiscais de entrada e saída', render, atualizar };
})();
