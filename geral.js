/* =========================================================
   NEXUS CD · geral.js
   Tela "Visão geral": resumo da operação em tempo real
   ========================================================= */
NX.telas = NX.telas || {};

NX.STATUS_DOCA = {
  livre:         { txt: 'Livre', cls: 's-livre' },
  manobra:       { txt: 'Encostando', cls: 's-manobra' },
  operando_e:    { txt: 'Descarregando', cls: 's-descarga' },
  operando_s:    { txt: 'Carregando', cls: 's-carga' },
  conferencia:   { txt: 'Conferência', cls: 's-conf' },
  aguardando_nf: { txt: 'Aguardando NF', cls: 's-nf' }
};

NX.statusDoca = function (d) {
  const c = d.caminhao && NX.sim.caminhao(d.caminhao);
  if (!c) return NX.STATUS_DOCA.livre;
  if (c.status === 'operando') return NX.STATUS_DOCA[c.operacao === 'entrada' ? 'operando_e' : 'operando_s'];
  return NX.STATUS_DOCA[c.status] || NX.STATUS_DOCA.livre;
};

NX.ICONE_FRIO = '<svg class="ic-frio" viewBox="0 0 24 24" aria-label="refrigerado"><path d="M12 2v20M4.9 6.5l14.2 11M4.9 17.5l14.2-11M9 3.5l3 2.5 3-2.5M9 20.5l3-2.5 3 2.5" /></svg>';

NX.telas.geral = {
  titulo: 'Visão geral',
  sub: 'Operação do CD em tempo real',

  render(el) {
    const S = NX.sim, U = NX.util, k = S.kpis();
    const horaAgora = Math.floor((S.t % 1440) / 60);

    /* ---------- KPIs ---------- */
    const kpi = (rotulo, valor, detalhe, estado) =>
      `<div class="kpi ${estado || ''}"><span class="kpi-rot">${rotulo}</span><strong class="kpi-val">${valor}</strong><span class="kpi-det">${detalhe}</span></div>`;
    const meta = (v, limite) => v == null ? '' : v <= limite ? 'ok' : v <= limite * 1.3 ? 'atencao' : 'ruim';

    const kpis = [
      kpi('Pátio + portaria', k.noPatio, 'caminhões aguardando', k.noPatio > 10 ? 'ruim' : k.noPatio > 5 ? 'atencao' : 'ok'),
      kpi('Em doca', `${k.emDoca}<small>/12</small>`, `ocupação no dia ${U.num(k.ocupacaoDocas * 100)}%`),
      kpi('Finalizados hoje', k.finalizadosEntrada + k.finalizadosSaida, `${k.finalizadosEntrada} entradas · ${k.finalizadosSaida} saídas`),
      kpi('Espera no pátio', U.duracao(k.esperaMedia), 'média · meta 30 min', meta(k.esperaMedia, 30)),
      kpi('Descarga média', U.duracao(k.descargaMedia), `carga média ${U.duracao(k.cargaMedia)}`),
      kpi('Ciclo do caminhão', U.duracao(k.cicloMedio), 'portaria → saída · meta 2h', meta(k.cicloMedio, 120)),
      kpi('Emissão NF saída', U.duracao(k.nfSaidaMedia), 'média · meta 15 min', meta(k.nfSaidaMedia, 15)),
      kpi('Lançamento NF entrada', U.duracao(k.nfEntradaMedia), `${k.nfsPendentes} NFs pendentes agora`, meta(k.nfEntradaMedia, 40))
    ].join('');

    /* ---------- Docas ---------- */
    const cardDoca = d => {
      const st = NX.statusDoca(d);
      const c = d.caminhao && S.caminhao(d.caminhao);
      let corpo = '<span class="doca-vazia">disponível</span>';
      if (c) {
        let prog = '';
        if (c.status === 'operando') {
          const p = Math.min(1, (S.t - c.tempos.inicioOp) / (c.fimFase - c.tempos.inicioOp));
          prog = `<div class="barra"><i style="width:${(p * 100).toFixed(0)}%"></i></div>`;
        }
        corpo = `<span class="placa">${c.placa}</span>
          <span class="doca-info">${S.transportadora(c.transportadora).nome}</span>
          <span class="doca-linha"><span>${c.paletes} pal</span><b title="tempo na doca">${U.duracao(S.t - c.tempos.chamado)}</b></span>${prog}`;
      }
      return `<div class="doca ${st.cls}">
        <div class="doca-topo"><b>${String(d.id).padStart(2, '0')}</b>${d.fria ? NX.ICONE_FRIO : ''}</div>
        <span class="doca-st">${st.txt}</span>
        ${corpo}</div>`;
    };
    const docasE = S.docas.filter(d => d.tipo === 'entrada').map(cardDoca).join('');
    const docasS = S.docas.filter(d => d.tipo === 'saida').map(cardDoca).join('');

    /* ---------- Pátio ---------- */
    const fila = S.caminhoes.filter(c => c.status === 'patio' || c.status === 'portaria')
      .sort((a, b) => a.tempos.chegada - b.tempos.chegada);
    const linhasFila = fila.length ? fila.map(c => {
      const espera = S.t - c.tempos.chegada;
      return `<li class="${espera > 45 ? 'atrasado' : ''}">
        <span class="op op-${c.operacao}">${c.operacao === 'entrada' ? 'ENT' : 'SAÍ'}</span>
        <span class="fila-placa">${c.placa}${c.frio ? NX.ICONE_FRIO : ''}</span>
        <span class="fila-info">${c.status === 'portaria' ? 'na portaria' : c.parceiro}</span>
        <span class="fila-tempo">${U.duracao(espera)}</span></li>`;
    }).join('') : '<li class="vazio">Pátio livre · nenhum caminhão aguardando</li>';

    /* ---------- Movimentos por hora ---------- */
    const horas = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
    const grafMov = NX.graf.barras(horas, [
      { nome: 'Entradas', cor: 'var(--c-entrada)', valores: S.movHora.map(h => h.entrada) },
      { nome: 'Saídas', cor: 'var(--c-saida)', valores: S.movHora.map(h => h.saida) }
    ], { altura: 250, cadaLabel: 2, destaque: horaAgora, titulo: 'Caminhões finalizados por hora' });

    /* ---------- Energia ---------- */
    const E = S.energia;
    const autossuf = E.consumidoKWh ? E.geradoKWh / E.consumidoKWh : 0;
    const economia = E.geradoKWh * NX.CD.tarifa_kWh;
    const ptsHora = campo => E.porHora.slice(0, horaAgora + 1).map((h, i) => ({ x: i + 0.5, y: h[campo] }));
    const grafEnergia = NX.graf.linha([
      { cor: 'var(--texto-3)', pontos: ptsHora('consumido') },
      { cor: 'var(--c-solar)', area: true, pontos: ptsHora('gerado') }
    ], { largura: 360, altura: 130, min: 0, max: 900, xMin: 0, xMax: 24,
         xLabels: [0, 6, 12, 18, 24].map(h => ({ x: h, t: String(h).padStart(2, '0') + 'h' })) });

    /* ---------- Câmaras ---------- */
    const cam = key => {
      const cfg = NX.CD.camaras[key], c = S.camaras[key];
      const pos = (c.temp - (cfg.min - 4)) / ((cfg.max + 4) - (cfg.min - 4));
      const fx0 = 4 / ((cfg.max + 4) - (cfg.min - 4)), fx1 = 1 - fx0;
      return `<div class="camara ${c.alarme ? 'alarme' : ''}">
        <div class="camara-topo"><span>${cfg.nome}</span><strong>${U.num(c.temp, 1)} °C</strong></div>
        <div class="termo"><span class="termo-faixa" style="left:${fx0 * 100}%;right:${(1 - fx1) * 100}%"></span>
          <i style="left:${Math.max(0, Math.min(1, pos)) * 100}%"></i></div>
        <div class="camara-rodape"><span>${cfg.min} °C</span><span>${c.alarme ? 'FORA DA FAIXA' : 'dentro da faixa'}</span><span>${cfg.max} °C</span></div>
      </div>`;
    };

    /* ---------- Estoque ---------- */
    const est = (nome, area) => {
      const p = S.estoque[area] / NX.CD.posicoes[area];
      return `<div class="est"><div class="est-topo"><span>${nome}</span><b>${U.num(p * 100)}%</b></div>
        <div class="barra larga ${p > 0.9 ? 'cheia' : ''}"><i style="width:${(p * 100).toFixed(1)}%"></i></div>
        <span class="est-det">${U.num(S.estoque[area])} de ${U.num(NX.CD.posicoes[area])} posições</span></div>`;
    };

    /* ---------- Eventos ---------- */
    const eventos = S.eventos.slice(0, 14).map(e =>
      `<li class="ev ev-${e.tipo}"><time>${U.hora(e.t)}</time><span>${e.texto}</span></li>`).join('');

    el.innerHTML = `
      <div class="grade-kpi">${kpis}</div>

      <div class="linha-2">
        <section class="painel">
          <header><h2>Docas agora</h2>
            <div class="legenda">
              <span class="s-descarga">Descarregando</span><span class="s-carga">Carregando</span>
              <span class="s-manobra">Encostando</span><span class="s-conf">Conferência</span><span class="s-nf">Aguardando NF</span>
            </div></header>
          <h3 class="sub-docas">Recebimento <small>docas 1–6</small></h3>
          <div class="grade-docas">${docasE}</div>
          <h3 class="sub-docas">Expedição <small>docas 7–12</small></h3>
          <div class="grade-docas">${docasS}</div>
        </section>
        <section class="painel">
          <header><h2>Pátio e portaria</h2><span class="contador">${fila.length}</span></header>
          <ul class="fila">${linhasFila}</ul>
        </section>
      </div>

      <div class="linha-3">
        <section class="painel">
          <header><h2>Caminhões finalizados por hora</h2>
            <div class="legenda"><span class="l-entrada">Entradas</span><span class="l-saida">Saídas</span></div></header>
          ${grafMov}
          <div class="mini-kpis"><div><span>Paletes recebidos</span><b>${U.num(k.paletesRecebidos)}</b></div>
            <div><span>Paletes expedidos</span><b>${U.num(k.paletesExpedidos)}</b></div>
            <div><span>OTIF estimado</span><b>${k.otif == null ? '–' : U.num(k.otif * 100) + '%'}</b></div></div>
        </section>

        <section class="painel">
          <header><h2>Energia</h2><span class="tag-sol">${E.solarKW > 1 ? 'gerando' : 'sem sol'}</span></header>
          <div class="energia-agora">
            <div><span>Solar agora</span><b class="t-solar">${U.num(E.solarKW)} kW</b></div>
            <div><span>Consumo agora</span><b>${U.num(E.consumoKW)} kW</b></div>
          </div>
          <div class="arco-wrap">${NX.graf.arco(autossuf, 'var(--c-solar)')}<span>da energia do dia veio do telhado</span></div>
          <div class="sub-graf"><span class="l-solar">Geração solar</span><span class="l-consumo">Consumo</span><small>kWh por hora</small></div>
          ${grafEnergia}
          <div class="mini-kpis"><div><span>Gerado hoje</span><b>${U.num(E.geradoKWh / 1000, 2)} MWh</b></div>
            <div><span>Consumido hoje</span><b>${U.num(E.consumidoKWh / 1000, 2)} MWh</b></div>
            <div><span>Economia hoje</span><b class="t-solar">${U.real(economia)}</b></div></div>
        </section>

        <section class="painel">
          <header><h2>Armazém</h2></header>
          ${cam('resfriada')}${cam('congelada')}
          <div class="estoques">${est('Área seca', 'seca')}${est('Resfriados', 'resfriada')}${est('Congelados', 'congelada')}</div>
        </section>
      </div>

      <section class="painel">
        <header><h2>Eventos da operação</h2></header>
        <ul class="eventos">${eventos}</ul>
      </section>`;
  }
};
