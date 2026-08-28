import type {
  RegrasVendedorMecanico,
  RegraAlinhador,
} from "./types";

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