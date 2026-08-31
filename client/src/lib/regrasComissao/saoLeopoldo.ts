import type {
  RegrasVendedorMecanico,
  RegraAlinhador,
  RegrasConsultor,
  RegrasRecepcao,
  RegraGerente,
} from "./types";

// =========================
// VENDEDOR E MECÂNICO
// =========================

export const regrasSaoLeopoldo: RegrasVendedorMecanico = {
  vendedor: {
  periodicidade: "semanal",
  faixas: [
    { minimo: 0, percentual: 6 },
    { minimo: 30000, percentual: 7 },
    { minimo: 37500, percentual: 8 },
  ],
},

  mecanico: {
    periodicidade: "semanal",
    faixas: [
      { minimo: 0, percentual: 10 },
      { minimo: 8000, percentual: 12 },
      { minimo: 10000, percentual: 15 },
      { minimo: 20000, percentual: 17 },
    ],
  },
};

// =========================
// ALINHADOR
// =========================

export const regraAlinhadorSaoLeopoldo: RegraAlinhador = {
  periodicidade: "mensal",
  faixas: [
    { minimo: 0, percentual: 2 },
    { minimo: 100000, percentual: 2.5 },
    { minimo: 120000, percentual: 3 },
    { minimo: 140000, percentual: 3.5 },
    { minimo: 160000, percentual: 4 },
  ],
};

// =========================
// CONSULTOR DE VENDAS
// =========================

export const regrasConsultorSaoLeopoldo: RegrasConsultor = {
  meta1: {
    periodicidade: "semanal",

    faixas: [
      { minimoCarros: 0, valorPorCarro: 8 },
      { minimoCarros: 50, valorPorCarro: 9 },
      { minimoCarros: 55, valorPorCarro: 10 },
    ],

    carrosParaBonus: 65,
    valorBonus: 200,
  },

  meta2: {
    periodicidade: "mensal",

    carrosPorBloco: 12,
    valorPorBloco: 50,

    bonusAcumulativos: [
      { carros: 200, valor: 200 },
      { carros: 250, valor: 250 },
      { carros: 300, valor: 300 },
      { carros: 350, valor: 350 },
      { carros: 400, valor: 400 },
    ],
  },
};

// =========================
// RECEPÇÃO
// =========================

export const regrasRecepcaoSaoLeopoldo: RegrasRecepcao = {
  regraPadrao: {
    valorVenda: 1.5,
    valorEntrada: 0,
  },
};

export const regraGerenteSaoJose: RegraGerente = {
  periodicidade: "mensal",
  faixas: [
    { minimo: 0, percentual: 0.5 },
    { minimo: 360000, percentual: 1 },
    { minimo: 440000, percentual: 1.5 },
    { minimo: 480000, percentual: 2 },
  ],
};

// =========================
// GERENTE
// =========================

export const regraGerenteSaoLeopoldo: RegraGerente = {
  periodicidade: "mensal",
  faixas: [
    { minimo: 0, percentual: 1 },
    { minimo: 240000, percentual: 1.5 },
    { minimo: 300000, percentual: 2 },
    { minimo: 360000, percentual: 2.5 },
  ],
};