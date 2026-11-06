/* =========================================================
   NEXUS CD · tv.js
   Modo TV: resumo da operação em uma tela só (16:9),
   para televisão do setor ou print de apresentação
   ========================================================= */
NX.telas = NX.telas || {};

NX.telas.tv = (function () {
  const U = NX.util;

  function render(el) {
    el.innerHTML = `
      <div class="tv">
        <header class="tv-topo">
          <div class="marca"><div class="logo"><svg viewBox="0 0 32 32"><path d="M6 24V13l10-6 10 6v11h-5v-7H11v7z"/></svg></div>
            <div><strong>Nexus CD</strong><span>Centro de distribuição · Iturama MG</span></div></div>
          <div class="tv-alertas" id="tv-alertas"></div>
          <div class="tv-hora"><span id="tv-data"></span><b id="tv-relogio"></b><span class="turno" id="tv-turno"></span></div>
          <div class="tv-acoes">
            <button class="bt3d" id="tv-cheia" title="Tela cheia"><svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>Tela cheia</button>
            <a class="bt3d" href="#/geral" title="Sair do modo TV"><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>Sair</a>
          </div>
        </header>
        <div class="tv-kpis" id="tv-kpis"></div>
        <div class="tv-corpo">
          <section class="painel tv-docas"><header><h2>Docas</h2><div class="legenda" id="tv-leg"></div></header><div id="tv-docas" class="tv-grade-docas"></div></section>
          <div class="tv-col">
            <section class="painel tv-mov"><header><h2>Caminhões finalizados por hora</h2><div class="legenda"><span class="l-entrada">Entradas</span><span class="l-saida">Saídas</span></div></header><div id="tv-mov"></div></section>
            <section class="painel tv-fila"><header><h2>Pátio e portaria</h2><span class="contador" id="tv-fila-n">0</span></header><ul class="fila" id="tv-fila"></ul></section>
          </div>
          <section class="painel tv-lado">
            <div id="tv-energia"></div>
            <div id="tv-camaras"></div>
            <div id="tv-estoque" class="estoques"></div>
          </section>
        </div>
        <div class="tv-rodape"><span class="tv-ao-vivo"><span class="ponto-vivo"></span>AO VIVO</span><div class="tv-ticker"><div id="tv-ticker"></div></div></div>
      </div>`;
    el.querySelector('#tv-cheia').addEventListener('click', () => {
      const d = document.documentElement;
      if (document.fullscreenElement) document.exitFullscreen(); else if (d.requestFullscreen) d.requestFullscreen();
    });
    el.querySelector('#tv-leg').innerHTML = '<span class="s-descarga">Descarga</span><span class="s-carga">Carga</span><span class="s-manobra">Encostando</span><span class="s-conf">Conferência</span><span class="s-nf">Aguard. NF</span>';
    atualizar(el);
  }

  function atualizar(el) {
    const S = NX.sim, $ = s => el.querySelector(s);
    if (!$('#tv-kpis')) return;
    const k = S.kpis(), E = S.energia;
    const meta = (v, l) => v == null ? '' : v <= l ? 'ok' : v <= l * 1.3 ? 'atencao' : 'ruim';
    const d = new Date(); d.setDate(d.getDate() + S.dia);
    $('#tv-data').textContent = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
    $('#tv-relogio').textContent = U.hora(S.t);
    $('#tv-turno').textContent = S.turno().nome;

    const kpi = (r, v, dt, e) => `<div class="kpi ${e || ''}"><span class="kpi-rot">${r}</span><strong class="kpi-val">${v}</strong><span class="kpi-det">${dt}</span></div>`;
    $('#tv-kpis').innerHTML = [
      kpi('Caminhões atendidos', k.finalizadosEntrada + k.finalizadosSaida, `${k.finalizadosEntrada} entradas · ${k.finalizadosSaida} saídas`),
      kpi('No pátio agora', k.noPatio, `${k.emDoca}/12 docas em uso`, k.noPatio > 10 ? 'ruim' : k.noPatio > 5 ? 'atencao' : 'ok'),
      kpi('Espera no pátio', U.duracao(k.esperaMedia), 'meta 30 min', meta(k.esperaMedia, 30)),
      kpi('Ciclo do caminhão', U.duracao(k.cicloMedio), 'meta 2h', meta(k.cicloMedio, 120)),
      kpi('Emissão NF-e', U.duracao(k.nfSaidaMedia), `meta 15 min · ${k.nfsPendentes} ${k.nfsPendentes === 1 ? "pendente" : "pendentes"}`, meta(k.nfSaidaMedia, 15)),
      kpi('OTIF', k.otif == null ? '–' : U.num(k.otif * 100) + '%', 'meta 95%', k.otif == null ? '' : k.otif >= 0.95 ? 'ok' : k.otif >= 0.88 ? 'atencao' : 'ruim'),
      kpi('Paletes movimentados', U.num(k.paletesRecebidos + k.paletesExpedidos), `${U.num(k.paletesRecebidos)} receb. · ${U.num(k.paletesExpedidos)} exped.`),
      kpi('Solar agora', U.num(E.solarKW) + '<small> kW</small>', `economia hoje ${U.real(E.geradoKWh * NX.CD.tarifa_kWh)}`, E.solarKW > 1 ? 'ok' : '')
    ].join('');

    /* Docas */
    $('#tv-docas').innerHTML = S.docas.map(dc => {
      const st = NX.statusDoca(dc), c = dc.caminhao && S.caminhao(dc.caminhao);
      let p = '';
      if (c && c.status === 'operando') p = `<div class="barra"><i style="width:${(Math.min(1, (S.t - c.tempos.inicioOp) / (c.fimFase - c.tempos.inicioOp)) * 100).toFixed(0)}%"></i></div>`;
      return `<div class="doca ${st.cls}"><div class="doca-topo"><b>${String(dc.id).padStart(2, '0')}</b>${dc.fria ? NX.ICONE_FRIO : ''}<small>${dc.tipo === 'entrada' ? 'REC' : 'EXP'}</small></div>
        <span class="doca-st">${st.txt}</span>${c ? `<span class="placa">${c.placa}</span><span class="doca-info">${U.duracao(S.t - c.tempos.chamado)} na doca</span>${p}` : ''}</div>`;
    }).join('');

    /* Movimento por hora */
    const h = Math.floor((S.t % 1440) / 60);
    $('#tv-mov').innerHTML = NX.graf.barras(Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')), [
      { nome: 'Entradas', cor: 'var(--c-entrada)', valores: S.movHora.map(x => x.entrada) },
      { nome: 'Saídas', cor: 'var(--c-saida)', valores: S.movHora.map(x => x.saida) }
    ], { altura: 230, cadaLabel: 2, destaque: h });

    /* Fila */
    const filaP = S.caminhoes.filter(c => c.status === 'patio' || c.status === 'portaria').sort((a, b) => a.tempos.chegada - b.tempos.chegada);
    $('#tv-fila-n').textContent = filaP.length;
    $('#tv-fila').innerHTML = filaP.length ? filaP.slice(0, 7).map(c => {
      const esp = S.t - c.tempos.chegada;
      return `<li class="${esp > 45 ? 'atrasado' : ''}"><span class="op op-${c.operacao}">${c.operacao === 'entrada' ? 'ENT' : 'SAÍ'}</span>
        <span class="fila-placa">${c.placa}${c.frio ? NX.ICONE_FRIO : ''}</span><span class="fila-info">${c.status === 'portaria' ? 'na portaria' : c.parceiro}</span>
        <span class="fila-tempo">${U.duracao(esp)}</span></li>`;
    }).join('') + (filaP.length > 7 ? `<li class="vazio">+ ${filaP.length - 7} caminhões</li>` : '') : '<li class="vazio">Pátio livre</li>';

    /* Estoque */
    $('#tv-estoque').innerHTML = '<h2>Armazém</h2>' + [['Área seca', 'seca'], ['Resfriados', 'resfriada'], ['Congelados', 'congelada']].map(([n, a]) => {
      const p = S.estoque[a] / NX.CD.posicoes[a];
      return `<div class="est"><div class="est-topo"><span>${n}</span><b>${U.num(p * 100)}%</b></div><div class="barra larga ${p > 0.9 ? 'cheia' : ''}"><i style="width:${(p * 100).toFixed(1)}%"></i></div></div>`;
    }).join('');

    /* Energia e câmaras */
    const auto = E.consumidoKWh ? E.geradoKWh / E.consumidoKWh : 0;
    $('#tv-energia').innerHTML = `<h2>Energia</h2><div class="arco-wrap">${NX.graf.arco(auto, 'var(--c-solar)')}<span>do consumo de hoje veio das placas do telhado<br><b class="t-solar">${U.num(E.geradoKWh / 1000, 2)} MWh</b> gerados</span></div>`;
    $('#tv-camaras').innerHTML = ['resfriada', 'congelada'].map(key => {
      const cfg = NX.CD.camaras[key], c = S.camaras[key];
      return `<div class="tv-cam ${c.alarme ? 'alarme' : ''}"><span>${cfg.nome}</span><b>${U.num(c.temp, 1)} °C</b><small>${cfg.min} a ${cfg.max} °C</small></div>`;
    }).join('');

    /* Alertas e ticker */
    const alertas = [];
    for (const key of ['resfriada', 'congelada']) if (S.camaras[key].alarme) alertas.push(NX.CD.camaras[key].nome + ' fora da faixa');
    const fila = S.caminhoes.filter(c => c.status === 'patio' || c.status === 'portaria');
    const longa = fila.filter(c => S.t - c.tempos.chegada > 45).length;
    if (longa) alertas.push(`${longa} caminhão(ões) esperando há mais de 45 min`);
    const nfPend = S.nfs.filter(n => n.concluida == null && n.tipo === 'saida' && S.t - n.criada > 15).length;
    if (nfPend) alertas.push(`${nfPend} NF-e de saída fora do prazo`);
    $('#tv-alertas').innerHTML = alertas.length ? alertas.map(a => `<span class="tv-alerta">${a}</span>`).join('') : '<span class="tv-ok">Operação dentro do normal</span>';
    $('#tv-ticker').innerHTML = S.eventos.slice(0, 6).map(e => `<span class="ev-${e.tipo}"><time>${U.hora(e.t)}</time>${e.texto}</span>`).join('');
  }

  return { titulo: 'Modo TV', sub: '', render, atualizar };
})();
