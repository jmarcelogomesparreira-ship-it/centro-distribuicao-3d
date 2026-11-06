/* =========================================================
   NEXUS CD · simulador.js
   Motor da operação "ao vivo": caminhões, docas, NFs,
   energia, câmaras frias e estoque. Tudo em minutos simulados.
   ========================================================= */
(function () {
  const U = NX.util;
  const hoje = new Date();
  const R = NX.criarRNG(hoje.getFullYear() * 10000 + (hoje.getMonth() + 1) * 100 + hoje.getDate());

  /* Taxa de chegada (caminhões por hora) para cada hora do dia */
  const CHEGADAS = {
    entrada: [0.5, 0.4, 0.3, 0.3, 0.6, 1.5, 4.2, 4.8, 4.8, 4.5, 4.2, 3.5, 2.8, 3.2, 4.0, 4.0, 3.6, 3.0, 2.4, 2.0, 1.6, 1.2, 0.9, 0.7],
    saida:   [1.4, 1.2, 1.0, 0.8, 1.0, 1.6, 2.0, 2.2, 2.6, 3.0, 3.2, 3.2, 3.4, 4.0, 4.8, 5.2, 5.2, 5.0, 4.6, 4.2, 3.8, 3.2, 2.4, 1.8]
  };

  const FASES = {
    portaria: 'Na portaria',
    patio: 'Aguardando no pátio',
    manobra: 'Manobrando',
    operando: 'Operando',
    conferencia: 'Em conferência',
    aguardando_nf: 'Aguardando NF',
    liberado: 'Liberado · saindo',
    finalizado: 'Finalizado'
  };

  const sim = {
    t: 0,                 // minutos simulados absolutos (dia * 1440 + minuto do dia)
    dia: 0,
    velocidade: 60,       // minutos simulados por minuto real (60x = 1 s real vale 1 min)
    pausado: false,
    caminhoes: [],
    docas: NX.CD.docas.map(d => ({ ...d, caminhao: null, ocupadaMin: 0 })),
    nfs: [],
    eventos: [],
    energia: null,
    camaras: {
      resfriada: { temp: NX.CD.camaras.resfriada.alvo, serie: [], alarme: false },
      congelada: { temp: NX.CD.camaras.congelada.alvo, serie: [], alarme: false }
    },
    estoque: {
      seca: Math.round(NX.CD.posicoes.seca * 0.71),
      resfriada: Math.round(NX.CD.posicoes.resfriada * 0.63),
      congelada: Math.round(NX.CD.posicoes.congelada * 0.77)
    },
    movHora: null,        // entradas/saídas finalizadas por hora
    FASES,
    _ouvintes: [],
    _seq: { caminhao: 1, nfSaida: 128450 },
    _nuvem: 0.85
  };

  function zerarDia() {
    sim.energia = {
      geradoKWh: 0, consumidoKWh: 0, importadoKWh: 0, injetadoKWh: 0, areasKW: {}, nuvem: 1,
      solarKW: 0, consumoKW: 0,
      porHora: Array.from({ length: 24 }, () => ({ gerado: 0, consumido: 0, importado: 0, injetado: 0 })),
      porArea: { iluminacao: 0, camaras: 0, docas: 0, empilhadeiras: 0, administrativo: 0 }
    };
    sim.movHora = Array.from({ length: 24 }, () => ({ entrada: 0, saida: 0 }));
    sim.docas.forEach(d => d.ocupadaMin = 0);
    for (const k of ['resfriada', 'congelada']) {
      Object.assign(sim.camaras[k], { serie: [], minFora: 0, alarmesDia: 0, tMin: Infinity, tMax: -Infinity, portaMin: 0 });
    }
  }

  /* ---------------- Eventos (feed) ---------------- */
  function evento(tipo, texto) {
    sim.eventos.unshift({ t: sim.t, dia: sim.dia, tipo, texto });
    if (sim.eventos.length > 200) sim.eventos.length = 200;
  }

  /* ---------------- Criação de caminhões ---------------- */
  function placa() {
    const L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const l = () => L[R.inteiro(0, 25)];
    return l() + l() + l() + R.inteiro(0, 9) + l() + R.inteiro(10, 99);
  }

  function novoCaminhao(operacao) {
    // o planejamento puxa o estoque de volta para ~72% de ocupação em cada área
    const occ = a => sim.estoque[a] / NX.CD.posicoes[a];
    const occFrio = (sim.estoque.resfriada + sim.estoque.congelada) / (NX.CD.posicoes.resfriada + NX.CD.posicoes.congelada);
    const ajuste = (v, sinal) => Math.max(0.3, Math.min(2, 1 + sinal * (v - 0.72) * 5));
    const frio = R.chance((operacao === 'entrada' ? 0.22 : 0.18) * ajuste(occFrio, operacao === 'entrada' ? -1 : 1) / ajuste(occ('seca'), operacao === 'entrada' ? -1 : 1));
    let parceiro, tipoFrio = null;
    if (operacao === 'entrada') {
      const alvoFrio = occ('resfriada') <= occ('congelada') ? 'resfriada' : 'congelada';
      const tipoAlvo = R.chance(0.75) ? alvoFrio : (alvoFrio === 'resfriada' ? 'congelada' : 'resfriada');
      parceiro = R.pesado(NX.FORNECEDORES.filter(f => frio ? f.frio === tipoAlvo : !f.frio));
      tipoFrio = parceiro.frio;
    } else {
      parceiro = R.pesado(NX.DESTINOS);
      if (frio) tipoFrio = R.chance(occ('resfriada') >= occ('congelada') ? 0.75 : 0.25) ? 'resfriada' : 'congelada';
    }
    const veiculosOk = NX.VEICULOS.filter(v => v.frio === frio && (operacao === 'saida' || v.tipo !== 'VUC'));
    const veiculo = R.pesado(veiculosOk);
    const transp = R.item(NX.TRANSPORTADORAS.filter(t => t.frio === frio));
    const paletes = R.inteiro(veiculo.paletes[0], veiculo.paletes[1]);
    const km = Math.max(8, U.distanciaKm(NX.CD.coord, NX.CIDADES[parceiro.cidade]));
    const c = {
      id: 'CM' + String(sim._seq.caminhao++).padStart(4, '0'),
      dia: sim.dia,
      operacao,                                   // 'entrada' | 'saida'
      frio, tipoFrio,                             // null | 'resfriada' | 'congelada'
      placa: placa(),
      veiculo: veiculo.tipo,
      motorista: R.item(NX.NOMES) + ' ' + R.item(NX.SOBRENOMES),
      transportadora: transp.id,
      parceiro: parceiro.nome,                    // fornecedor ou destino
      cidade: parceiro.cidade,
      km,
      paletes,
      pesoKg: Math.round(paletes * R.entre(380, 820)),
      valor: Math.round(paletes * R.entre(3500, 16000)),
      status: 'portaria',
      doca: null,
      divergencia: false,
      fimFase: sim.t + R.entre(3, 9),
      tempos: { chegada: sim.t }
    };
    sim.caminhoes.push(c);
    return c;
  }

  /* ---------------- NFs ---------------- */
  function criarNF(c) {
    const entrada = c.operacao === 'entrada';
    const nf = {
      numero: entrada ? String(R.inteiro(10000, 999999)) : String(sim._seq.nfSaida++),
      serie: entrada ? String(R.inteiro(1, 3)) : '1',
      tipo: c.operacao,
      caminhao: c.id,
      parceiro: c.parceiro,
      valor: c.valor,
      paletes: c.paletes,
      dia: sim.dia,
      criada: sim.t,
      concluida: null,
      status: 'pendente',  // pendente | divergente | lancada (entrada) | emitida (saída)
      divergencia: c.divergencia,
      motivo: c.divergencia ? R.item(['Falta de volumes', 'Sobra de volumes', 'Avaria na carga', 'Quantidade divergente do pedido', 'Preço divergente do pedido', 'Lote/validade divergente']) : null,
      placa: c.placa,
      cidade: c.cidade,
      pesoKg: c.pesoKg,
      cfop: null
    };
    const mesmaUF = c.cidade.endsWith('/MG');
    nf.cfop = entrada ? (mesmaUF ? '1.102' : '2.102') : (mesmaUF ? '5.152' : '6.152');
    // a fila do fiscal pesa no tempo de emissão
    const fila = sim.nfs.filter(n => n.concluida == null && n.tipo === c.operacao).length;
    // Tempo que o fiscal leva: entrada = lançamento; saída = emissão
    if (entrada) {
      nf.prazo = sim.t + (c.divergencia ? R.entre(60, 180) : Math.max(6, R.normal(22, 10) + fila * 1.5));
      if (c.divergencia) nf.status = 'divergente';
    } else {
      nf.prazo = sim.t + (c.divergencia ? R.entre(20, 40) : Math.max(3, R.normal(8, 4) + fila * 1.8));
    }
    sim.nfs.push(nf);
    c.nf = nf.numero;
    return nf;
  }

  /* ---------------- Docas ---------------- */
  function docaLivre(c) {
    return sim.docas.find(d => !d.caminhao && d.tipo === c.operacao && d.fria === c.frio);
  }
  function soltarDoca(c) {
    const d = sim.docas.find(x => x.id === c.doca);
    if (d) d.caminhao = null;
    c.tempos.docaLivre = sim.t;
  }

  /* ---------------- Avanço de fase de cada caminhão ---------------- */
  function avancar(c) {
    const T = NX.TRANSPORTADORAS.find(t => t.id === c.transportadora);
    switch (c.status) {
      case 'portaria':
        c.status = 'patio';
        c.tempos.patio = sim.t;
        break;

      case 'manobra': {
        c.status = 'operando';
        c.tempos.inicioOp = sim.t;
        const ritmo = c.operacao === 'entrada' ? R.entre(1.5, 2.3) : R.entre(1.2, 1.9);
        c.fimFase = sim.t + 8 + c.paletes * ritmo * (c.frio ? 1.15 : 1);
        evento(c.operacao, `Doca ${c.doca}: ${c.operacao === 'entrada' ? 'descarga iniciada' : 'carregamento iniciado'} · ${c.placa} (${c.paletes} paletes)`);
        break;
      }

      case 'operando':
        c.tempos.fimOp = sim.t;
        c.status = 'conferencia';
        c.divergencia = R.chance(0.06);
        c.fimFase = sim.t + R.entre(6, 14) + (c.divergencia ? R.entre(10, 25) : 0);
        if (c.operacao === 'saida') baixarEstoque(c, -1);
        break;

      case 'conferencia':
        c.tempos.fimConf = sim.t;
        if (c.divergencia) evento('alerta', `Divergência na conferência · doca ${c.doca} · ${c.placa}`);
        criarNF(c);
        if (c.operacao === 'entrada') {
          baixarEstoque(c, +1);
          soltarDoca(c);
          c.status = 'liberado';
          c.fimFase = sim.t + R.entre(3, 8);
        } else {
          c.status = 'aguardando_nf';
          c.fimFase = Infinity; // quem libera é o fiscal
        }
        break;

      case 'liberado': {
        c.status = 'finalizado';
        c.tempos.saida = sim.t;
        const h = Math.floor(sim.t / 60) % 24;
        sim.movHora[h][c.operacao]++;
        // pontualidade da entrega (saídas): estimativa pela transportadora
        if (c.operacao === 'saida') c.noPrazo = R.chance(T.pontualidade);
        break;
      }
    }
  }

  function processarFiscal() {
    for (const nf of sim.nfs) {
      if (nf.concluida != null || sim.t < nf.prazo) continue;
      nf.concluida = sim.t;
      const c = sim.caminhoes.find(x => x.id === nf.caminhao);
      if (nf.tipo === 'entrada') {
        nf.status = 'lancada';
        if (nf.divergencia) evento('fiscal', `NF ${nf.numero} (${nf.parceiro}) lançada após tratar divergência`);
      } else {
        nf.status = 'emitida';
        if (c) {
          c.tempos.nf = sim.t;
          soltarDoca(c);
          c.status = 'liberado';
          c.fimFase = sim.t + R.entre(3, 8);
          evento('fiscal', `NF-e ${nf.numero} emitida · ${c.placa} liberado da doca ${c.doca}`);
        }
      }
    }
  }

  function chamarDoPatio() {
    const fila = sim.caminhoes.filter(c => c.status === 'patio').sort((a, b) => a.tempos.patio - b.tempos.patio);
    for (const c of fila) {
      const d = docaLivre(c);
      if (!d) continue;
      d.caminhao = c.id;
      c.doca = d.id;
      c.status = 'manobra';
      c.tempos.chamado = sim.t;
      c.fimFase = sim.t + R.entre(3, 7);
    }
  }

  /* ---------------- Estoque ---------------- */
  function baixarEstoque(c, sinal) {
    const area = c.frio ? c.tipoFrio : 'seca';
    const max = NX.CD.posicoes[area];
    sim.estoque[area] = Math.max(0, Math.min(max, sim.estoque[area] + sinal * c.paletes));
  }

  /* ---------------- Energia ---------------- */
  function energia(dt) {
    const h = (sim.t / 60) % 24;
    sim._nuvem = Math.max(0.45, Math.min(1, sim._nuvem + R.normal(0, 0.02)));
    const sol = h > 6 && h < 18.5 ? Math.pow(Math.sin(Math.PI * (h - 6) / 12.5), 1.25) : 0;
    const solar = NX.CD.solar_kWp * 0.82 * sol * sim._nuvem;

    const noite = h < 6 || h >= 18;
    const docasAtivas = sim.docas.filter(d => d.caminhao).length;
    const areas = {
      iluminacao: noite ? 205 : 70,
      camaras: 175 + 35 * Math.sin(sim.t / 17) + (sim.docas.filter(d => d.fria && d.caminhao).length * 12),
      docas: 4 + docasAtivas * 6.5,
      empilhadeiras: (h >= 22 || h < 5) ? 68 : 22,
      administrativo: (h >= 7 && h < 18) ? 85 : 38
    };
    const consumo = Object.values(areas).reduce((s, v) => s + v, 0);

    const E = sim.energia;
    E.solarKW = solar; E.consumoKW = consumo; E.areasKW = areas; E.nuvem = sim._nuvem;
    const imp = Math.max(0, consumo - solar), inj = Math.max(0, solar - consumo);
    E.importadoKWh += imp * dt / 60; E.injetadoKWh += inj * dt / 60;
    E.porHora[Math.floor(h)].importado += imp * dt / 60;
    E.porHora[Math.floor(h)].injetado += inj * dt / 60;
    E.geradoKWh += solar * dt / 60;
    E.consumidoKWh += consumo * dt / 60;
    const hi = Math.floor(h);
    E.porHora[hi].gerado += solar * dt / 60;
    E.porHora[hi].consumido += consumo * dt / 60;
    for (const k in areas) E.porArea[k] += areas[k] * dt / 60;
  }

  /* ---------------- Câmaras frias ---------------- */
  function camaras(dt) {
    for (const k of ['resfriada', 'congelada']) {
      const cfg = NX.CD.camaras[k], cam = sim.camaras[k];
      const portasAbertas = sim.docas.filter(d => d.fria && d.caminhao &&
        sim.caminhoes.find(c => c.id === d.caminhao && c.status === 'operando' && c.tipoFrio === k)).length;
      cam.temp += ((cfg.alvo - cam.temp) * 0.05 + portasAbertas * 0.05 + R.normal(0, 0.05)) * dt;
      // falha rara de compressor
      if (R.chance(0.0004 * dt)) { cam.temp += 3.5; evento('alerta', `${cfg.nome}: pico de temperatura · compressor em verificação`); }
      const fora = cam.temp > cfg.max || cam.temp < cfg.min;
      if (fora && !cam.alarme) { evento('alerta', `${cfg.nome} fora da faixa: ${U.num(cam.temp, 1)} °C`); cam.alarmesDia++; }
      if (fora) cam.minFora += dt;
      cam.portaMin += portasAbertas * dt;
      cam.tMin = Math.min(cam.tMin, cam.temp); cam.tMax = Math.max(cam.tMax, cam.temp);
      if (!fora && cam.alarme) evento('info', `${cfg.nome} normalizada: ${U.num(cam.temp, 1)} °C`);
      cam.alarme = fora;
      if (Math.floor(sim.t) % 5 === 0) {
        const ult = cam.serie[cam.serie.length - 1];
        if (!ult || ult.t !== Math.floor(sim.t)) cam.serie.push({ t: Math.floor(sim.t), v: cam.temp });
      }
    }
  }

  /* ---------------- Passo de 1 minuto ---------------- */
  function passo(dt) {
    sim.t += dt;

    // virada do dia (sim.t é absoluto: dia * 1440 + minuto do dia)
    const diaAtual = Math.floor(sim.t / 1440);
    if (diaAtual !== sim.dia) {
      sim.dia = diaAtual;
      zerarDia();
      // mantém as últimas 24h (linha do tempo das docas e entregas ainda em rota)
      sim.caminhoes = sim.caminhoes.filter(c => c.status !== 'finalizado' || c.tempos.saida > sim.t - 1440);
      sim.nfs = sim.nfs.filter(n => n.concluida == null);
      evento('info', 'Virada do dia · indicadores zerados');
    }

    // chegadas
    const h = Math.floor(sim.t / 60) % 24;
    for (const op of ['entrada', 'saida']) {
      const occT = (sim.estoque.seca + sim.estoque.resfriada + sim.estoque.congelada) / (NX.CD.posicoes.seca + NX.CD.posicoes.resfriada + NX.CD.posicoes.congelada);
      const f = Math.max(0.6, Math.min(1.5, 1 + (op === 'entrada' ? -1 : 1) * (occT - 0.72) * 4));
      if (R.chance(CHEGADAS[op][h] * 1.2 * f * dt / 60)) {
        const c = novoCaminhao(op);
        evento('portaria', `${c.placa} chegou na portaria · ${c.operacao === 'entrada' ? 'entrega de ' + c.parceiro : 'coleta p/ ' + c.parceiro}${c.frio ? ' · refrigerado' : ''}`);
      }
    }

    // fases
    for (const c of sim.caminhoes) {
      if (c.status !== 'finalizado' && c.status !== 'patio' && sim.t >= c.fimFase) avancar(c);
    }
    processarFiscal();
    chamarDoPatio();

    for (const d of sim.docas) if (d.caminhao) d.ocupadaMin += dt;
    energia(dt);
    camaras(dt);
  }

  /* ---------------- API pública ---------------- */
  sim.avancarMinutos = function (min) {
    while (min > 0) { const dt = Math.min(1, min); passo(dt); min -= dt; }
  };

  sim.ouvir = fn => sim._ouvintes.push(fn);
  sim._avisar = () => sim._ouvintes.forEach(fn => fn(sim));

  sim.iniciar = function () {
    zerarDia();
    // começa no horário real de agora e "aquece" a operação desde 00:00
    const agora = new Date();
    const inicio = agora.getHours() * 60 + agora.getMinutes();
    sim.avancarMinutos(inicio);
    evento('info', 'Painel conectado · simulação em andamento');
    let ultimo = performance.now();
    let acumulado = 0;
    setInterval(() => {
      const t = performance.now();
      const realMin = (t - ultimo) / 60000; ultimo = t;
      if (sim.pausado) return;
      acumulado += realMin * sim.velocidade;
      if (acumulado >= 0.25) {
        sim.avancarMinutos(Math.min(acumulado, 60)); // limite: evita travar se a aba ficou parada
        acumulado = 0;
        sim._avisar();
      }
    }, 250);
    sim._avisar();
  };

  /* ---------------- Indicadores (KPIs) ---------------- */
  sim.kpis = function () {
    const doDia = sim.caminhoes.filter(c => c.dia === sim.dia);
    const fin = doDia.filter(c => c.status === 'finalizado');
    const finE = fin.filter(c => c.operacao === 'entrada');
    const finS = fin.filter(c => c.operacao === 'saida');
    const ativos = sim.caminhoes.filter(c => c.status !== 'finalizado');

    const espera = doDia.filter(c => c.tempos.chamado != null).map(c => c.tempos.chamado - c.tempos.patio);
    const descarga = doDia.filter(c => c.operacao === 'entrada' && c.tempos.fimOp != null).map(c => c.tempos.fimOp - c.tempos.inicioOp);
    const carga = doDia.filter(c => c.operacao === 'saida' && c.tempos.fimOp != null).map(c => c.tempos.fimOp - c.tempos.inicioOp);
    const ciclo = fin.map(c => c.tempos.saida - c.tempos.chegada);

    const nfsDia = sim.nfs.filter(n => n.dia === sim.dia && n.concluida != null);
    const nfE = nfsDia.filter(n => n.tipo === 'entrada').map(n => n.concluida - n.criada);
    const nfS = nfsDia.filter(n => n.tipo === 'saida').map(n => n.concluida - n.criada);

    const minutosDia = Math.max(1, sim.t - sim.dia * 1440);
    const ocupacaoDocas = sim.docas.reduce((s, d) => s + d.ocupadaMin, 0) / (sim.docas.length * minutosDia);

    return {
      noPatio: ativos.filter(c => c.status === 'patio' || c.status === 'portaria').length,
      emDoca: sim.docas.filter(d => d.caminhao).length,
      finalizadosEntrada: finE.length,
      finalizadosSaida: finS.length,
      paletesRecebidos: finE.reduce((s, c) => s + c.paletes, 0),
      paletesExpedidos: finS.reduce((s, c) => s + c.paletes, 0),
      esperaMedia: U.media(espera),
      descargaMedia: U.media(descarga),
      cargaMedia: U.media(carga),
      cicloMedio: U.media(ciclo),
      nfEntradaMedia: U.media(nfE),
      nfSaidaMedia: U.media(nfS),
      nfsPendentes: sim.nfs.filter(n => n.concluida == null).length,
      ocupacaoDocas,
      otif: finS.length ? finS.filter(c => c.noPrazo).length / finS.length : null
    };
  };

  sim.turno = function () {
    const md = sim.t % 1440;
    const m = md < 360 ? md + 1440 : md;
    return NX.CD.turnos.find(t => m >= t.ini && m < t.fim) || NX.CD.turnos[0];
  };

  sim.caminhao = id => sim.caminhoes.find(c => c.id === id);
  sim.transportadora = id => NX.TRANSPORTADORAS.find(t => t.id === id);

  NX.sim = sim;
})();
