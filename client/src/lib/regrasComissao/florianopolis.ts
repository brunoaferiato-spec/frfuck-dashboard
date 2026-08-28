import type {
  RegrasVendedorMecanico,
  RegraAlinhador,
  RegrasConsultor,
  RegrasRecepcao,
} from "./types";
// =========================
// VENDEDOR E MECÂNICO
// =========================

export const regrasFlorianopolis: RegrasVendedorMecanico = {
  vendedor: {
    periodicidade: "mensal",
    faixas: [
      { minimo: 0, percentual: 5 },
      { minimo: 120000, percentual: 6 },
      { minimo: 130000, percentual: 7 },
      { minimo: 150000, percentual: 8 },
    ],
  },

  mecanico: {
    periodicidade: "mensal",
    faixas: [
      { minimo: 0, percentual: 10 },
      { minimo: 30000, percentual: 12 },
      { minimo: 40000, percentual: 15 },
      { minimo: 50000, percentual: 17 },
    ],
  },
};

// =========================
// ALINHADOR
// =========================

export const regraAlinhadorFlorianopolis: RegraAlinhador = {
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

export const regrasConsultorFlorianopolis: RegrasConsultor = {
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

export const regrasRecepcaoFlorianopolis: RegrasRecepcao = {
  regrasEspecificas: [
    {
      funcionarioNome: "Samantha",
      valorVenda: 3,
      valorEntrada: 0.5,
    },
    {
      funcionarioNome: "Izabela",
      valorVenda: 2,
      valorEntrada: 0.5,
    },
  ],
};