/* =========================================================
   NEXUS CD · app.js
   Navegação, relógio, controle de velocidade e telas
   ========================================================= */
(function () {
  const S = NX.sim, U = NX.util;

  const ROTAS = ['geral', 'galpao', 'docas', 'fiscal', 'energia', 'transporte', 'armazem', 'tv'];
  const tela = id => NX.telas[id] || NX.telas.geral;

  const $tela = document.getElementById('tela');
  const $titulo = document.getElementById('titulo-tela');
  const $sub = document.getElementById('sub-tela');
  let atual = null, anterior = null;

  function rota() {
    const id = (location.hash.replace('#/', '') || 'geral');
    atual = ROTAS.includes(id) ? id : 'geral';
    document.querySelectorAll('#menu a').forEach(a => a.classList.toggle('ativo', a.dataset.rota === atual));
    document.body.classList.toggle('modo-tv', atual === 'tv');
    if (atual !== 'tv' && document.fullscreenElement) document.exitFullscreen();
    if (anterior && anterior.sair) anterior.sair();
    const t = tela(atual);
    anterior = t;
    $titulo.textContent = t.titulo;
    $sub.textContent = t.sub;
    $tela.innerHTML = '';
    t.render($tela);
    window.scrollTo(0, 0);
  }

  /* Relógio e turno */
  const $relogio = document.getElementById('relogio');
  const $turno = document.getElementById('turno');
  const $data = document.getElementById('data');
  function relogio() {
    $relogio.textContent = U.hora(S.t);
    $turno.textContent = S.turno().nome;
    const d = new Date(); d.setDate(d.getDate() + S.dia);
    $data.textContent = d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
  }

  /* Velocidade */
  document.querySelectorAll('#vel button[data-v]').forEach(b => {
    b.addEventListener('click', () => {
      S.velocidade = Number(b.dataset.v);
      S.pausado = false;
      atualizarControles();
    });
  });
  document.getElementById('pausa').addEventListener('click', () => { S.pausado = !S.pausado; atualizarControles(); });
  function atualizarControles() {
    document.querySelectorAll('#vel button[data-v]').forEach(b => b.classList.toggle('ativo', !S.pausado && Number(b.dataset.v) === S.velocidade));
    const p = document.getElementById('pausa');
    p.classList.toggle('ativo', S.pausado);
    p.setAttribute('aria-label', S.pausado ? 'Continuar' : 'Pausar');
    p.innerHTML = S.pausado
      ? '<svg viewBox="0 0 24 24"><path d="M7 5l12 7-12 7z"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>';
  }

  /* Atualização das telas (no máximo 2x por segundo) */
  let ultimoRender = 0;
  S.ouvir(() => {
    relogio();
    const agora = performance.now();
    if (agora - ultimoRender < 500) return;
    ultimoRender = agora;
    const t = tela(atual);
    if (t.atualizar) t.atualizar($tela);
    else t.render($tela);
  });

  S.iniciar();
  window.addEventListener('hashchange', rota);
  rota();
  atualizarControles();
})();
