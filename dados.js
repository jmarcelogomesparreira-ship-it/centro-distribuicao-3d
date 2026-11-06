/* =========================================================
   NEXUS CD · dados.js
   Cadastros base do centro de distribuição (dados fictícios)
   ========================================================= */
window.NX = window.NX || {};

/* ---------- Gerador aleatório com semente (resultados estáveis) ---------- */
NX.criarRNG = function (seed) {
  let a = seed >>> 0;
  const r = function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.entre = (min, max) => min + r() * (max - min);
  r.inteiro = (min, max) => Math.floor(min + r() * (max - min + 1));
  r.chance = p => r() < p;
  r.item = lista => lista[Math.floor(r() * lista.length)];
  r.pesado = lista => { // [{peso, ...}]
    const total = lista.reduce((s, x) => s + x.peso, 0);
    let v = r() * total;
    for (const x of lista) { v -= x.peso; if (v <= 0) return x; }
    return lista[lista.length - 1];
  };
  r.normal = (media, desvio) => {
    const u = 1 - r(), v = r();
    return media + desvio * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  return r;
};

/* ---------- O centro de distribuição ---------- */
NX.CD = {
  nome: 'Nexus CD',
  local: 'Iturama · MG',
  coord: [-19.7275, -50.1956],
  area_m2: 32000,
  operacao: 'E-commerce e varejo · 24h, 3 turnos',
  docas: [
    { id: 1, tipo: 'entrada', fria: false },
    { id: 2, tipo: 'entrada', fria: false },
    { id: 3, tipo: 'entrada', fria: false },
    { id: 4, tipo: 'entrada', fria: false },
    { id: 5, tipo: 'entrada', fria: true },
    { id: 6, tipo: 'entrada', fria: true },
    { id: 7, tipo: 'saida', fria: true },
    { id: 8, tipo: 'saida', fria: true },
    { id: 9, tipo: 'saida', fria: false },
    { id: 10, tipo: 'saida', fria: false },
    { id: 11, tipo: 'saida', fria: false },
    { id: 12, tipo: 'saida', fria: false }
  ],
  posicoes: { seca: 8400, resfriada: 720, congelada: 480 },
  camaras: {
    resfriada: { nome: 'Câmara resfriada', min: 2, max: 8, alvo: 4.5 },
    congelada: { nome: 'Câmara congelada', min: -24, max: -18, alvo: -21 }
  },
  solar_kWp: 900,          // usina fotovoltaica no telhado
  tarifa_kWh: 0.82,        // R$ por kWh (estimativa média)
  turnos: [
    { nome: '1º turno', ini: 6 * 60, fim: 14 * 60 },
    { nome: '2º turno', ini: 14 * 60, fim: 22 * 60 },
    { nome: '3º turno', ini: 22 * 60, fim: 30 * 60 }
  ]
};

/* ---------- Transportadoras (nomes fictícios) ---------- */
NX.TRANSPORTADORAS = [
  { id: 'T01', nome: 'Expresso Triângulo', frio: false, pontualidade: 0.94, cor: '#f5a524' },
  { id: 'T02', nome: 'Rodo Cerrado', frio: false, pontualidade: 0.88, cor: '#60a5fa' },
  { id: 'T03', nome: 'Via Minas Cargas', frio: false, pontualidade: 0.91, cor: '#34d399' },
  { id: 'T04', nome: 'Frio Norte Refrigerados', frio: true, pontualidade: 0.93, cor: '#22d3ee' },
  { id: 'T05', nome: 'LogPrime Express', frio: false, pontualidade: 0.97, cor: '#c084fc' },
  { id: 'T06', nome: 'Carga Certa', frio: false, pontualidade: 0.84, cor: '#fb7185' },
  { id: 'T07', nome: 'Polar Log', frio: true, pontualidade: 0.90, cor: '#7dd3fc' },
  { id: 'T08', nome: 'Transpaulista', frio: false, pontualidade: 0.92, cor: '#fbbf24' }
];

/* ---------- Tipos de veículo ---------- */
NX.VEICULOS = [
  { tipo: 'VUC', paletes: [4, 8], frio: false, peso: 18 },
  { tipo: 'Toco', paletes: [8, 12], frio: false, peso: 22 },
  { tipo: 'Truck', paletes: [12, 16], frio: false, peso: 30 },
  { tipo: 'Carreta', paletes: [24, 28], frio: false, peso: 22 },
  { tipo: 'Bitrem', paletes: [30, 34], frio: false, peso: 8 },
  { tipo: 'Truck frigorífico', paletes: [10, 14], frio: true, peso: 50 },
  { tipo: 'Carreta frigorífica', paletes: [22, 26], frio: true, peso: 50 }
];

/* ---------- Cidades (lat, lng) ---------- */
NX.CIDADES = {
  'Iturama/MG': [-19.7275, -50.1956],
  'Uberlândia/MG': [-18.9186, -48.2772],
  'Uberaba/MG': [-19.7472, -47.9381],
  'Frutal/MG': [-20.0247, -48.9406],
  'Ituiutaba/MG': [-18.9689, -49.4653],
  'São José do Rio Preto/SP': [-20.8197, -49.3794],
  'Ribeirão Preto/SP': [-21.1775, -47.8103],
  'Campinas/SP': [-22.9099, -47.0626],
  'São Paulo/SP': [-23.5505, -46.6333],
  'Jundiaí/SP': [-23.1857, -46.8978],
  'Americana/SP': [-22.7374, -47.3331],
  'Araçatuba/SP': [-21.2089, -50.4328],
  'Barretos/SP': [-20.5572, -48.5678],
  'Fernandópolis/SP': [-20.2839, -50.2464],
  'Santa Fé do Sul/SP': [-20.2083, -50.9258],
  'Goiânia/GO': [-16.6869, -49.2648],
  'Rio Verde/GO': [-17.7923, -50.9192],
  'Campo Grande/MS': [-20.4697, -54.6201]
};

/* ---------- Fornecedores (origem das entradas) ---------- */
NX.FORNECEDORES = [
  { nome: 'Alimentos Bom Sabor', cidade: 'Goiânia/GO', frio: null, peso: 10 },
  { nome: 'Casa & Lar Utilidades', cidade: 'São Paulo/SP', frio: null, peso: 9 },
  { nome: 'TecnoMais Eletrônicos', cidade: 'Campinas/SP', frio: null, peso: 7 },
  { nome: 'Higiene Total', cidade: 'Ribeirão Preto/SP', frio: null, peso: 8 },
  { nome: 'Bebidas Cerrado', cidade: 'Rio Verde/GO', frio: null, peso: 8 },
  { nome: 'Brinquedos Arco-Íris', cidade: 'Jundiaí/SP', frio: null, peso: 5 },
  { nome: 'Têxtil Primavera', cidade: 'Americana/SP', frio: null, peso: 6 },
  { nome: 'Pet Feliz Nutrição', cidade: 'Uberaba/MG', frio: null, peso: 6 },
  { nome: 'Laticínios Serra Azul', cidade: 'Uberlândia/MG', frio: 'resfriada', peso: 6 },
  { nome: 'Hortifruti Vale do Rio Grande', cidade: 'Frutal/MG', frio: 'resfriada', peso: 4 },
  { nome: 'Frigorífico Vale Verde', cidade: 'Araçatuba/SP', frio: 'congelada', peso: 5 },
  { nome: 'Sorvetes Polo Sul', cidade: 'São José do Rio Preto/SP', frio: 'congelada', peso: 3 }
];

/* ---------- Destinos (saídas: lojas e hubs de e-commerce) ---------- */
NX.DESTINOS = [
  { nome: 'Hub E-commerce Uberlândia', cidade: 'Uberlândia/MG', tipo: 'hub', peso: 10 },
  { nome: 'Hub Last Mile São Paulo', cidade: 'São Paulo/SP', tipo: 'hub', peso: 9 },
  { nome: 'Hub Rio Preto', cidade: 'São José do Rio Preto/SP', tipo: 'hub', peso: 9 },
  { nome: 'Hub Goiânia', cidade: 'Goiânia/GO', tipo: 'hub', peso: 7 },
  { nome: 'CD Avançado Ribeirão Preto', cidade: 'Ribeirão Preto/SP', tipo: 'cd', peso: 6 },
  { nome: 'Loja Iturama Centro', cidade: 'Iturama/MG', tipo: 'loja', peso: 5 },
  { nome: 'Loja Frutal', cidade: 'Frutal/MG', tipo: 'loja', peso: 4 },
  { nome: 'Loja Uberaba Shopping', cidade: 'Uberaba/MG', tipo: 'loja', peso: 5 },
  { nome: 'Loja Ituiutaba', cidade: 'Ituiutaba/MG', tipo: 'loja', peso: 4 },
  { nome: 'Loja Araçatuba', cidade: 'Araçatuba/SP', tipo: 'loja', peso: 4 },
  { nome: 'Loja Barretos', cidade: 'Barretos/SP', tipo: 'loja', peso: 3 },
  { nome: 'Loja Fernandópolis', cidade: 'Fernandópolis/SP', tipo: 'loja', peso: 3 },
  { nome: 'Loja Santa Fé do Sul', cidade: 'Santa Fé do Sul/SP', tipo: 'loja', peso: 3 },
  { nome: 'Hub Campo Grande', cidade: 'Campo Grande/MS', tipo: 'hub', peso: 5 }
];

/* ---------- Nomes para motoristas ---------- */
NX.NOMES = ['João', 'José', 'Antônio', 'Carlos', 'Paulo', 'Luiz', 'Marcos', 'Rafael', 'Ricardo', 'Fernando',
  'Rodrigo', 'Edson', 'Sérgio', 'Valdir', 'Cláudio', 'Adriano', 'Wesley', 'Diego', 'Fábio', 'Márcio',
  'Roberto', 'Gilmar', 'Anderson', 'Leandro', 'Juliano', 'Renato', 'Maria', 'Ana', 'Patrícia', 'Simone'];
NX.SOBRENOMES = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Pereira', 'Costa', 'Rodrigues', 'Almeida', 'Nascimento',
  'Lima', 'Araújo', 'Ferreira', 'Carvalho', 'Gomes', 'Martins', 'Rocha', 'Ribeiro', 'Alves', 'Monteiro', 'Barbosa'];

/* ---------- Utilidades gerais ---------- */
NX.util = {
  distanciaKm(a, b) { // linha reta x fator rodoviário
    const R = 6371, rad = Math.PI / 180;
    const dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 1.25);
  },
  hora(min) { // 545 -> "09:05"
    const m = ((Math.floor(min) % 1440) + 1440) % 1440;
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  },
  duracao(min) { // 75 -> "1h 15min"
    if (min == null || isNaN(min)) return '–';
    min = Math.round(min);
    if (min < 60) return min + ' min';
    const h = Math.floor(min / 60), m = min % 60;
    return h + 'h' + (m ? ' ' + String(m).padStart(2, '0') + 'min' : '');
  },
  num(v, casas = 0) {
    return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
  },
  real(v) {
    return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  },
  media(lista) { return lista.length ? lista.reduce((s, x) => s + x, 0) / lista.length : null; }
};
