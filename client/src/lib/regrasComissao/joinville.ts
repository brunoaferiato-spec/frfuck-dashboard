import type {
  RegrasVendedorMecanico,
  RegraAlinhador,
  RegrasConsultor,
} from "./types";

// =========================
// VENDEDOR E MECÂNICO
// =========================

export const regrasJoinville: RegrasVendedorMecanico = {
  vendedor: {
    periodicidade: "semanal",
    faixas: [
      { minimo: 0, percentual: 5 },
      { minimo: 33000, percentual: 6 },
      { minimo: 40000, percentual: 7 },
      { minimo: 47000, percentual: 8 },
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

export const regraAlinhadorJoinville: RegraAlinhador = {
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

export const regrasConsultorJoinville: RegrasConsultor = {
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