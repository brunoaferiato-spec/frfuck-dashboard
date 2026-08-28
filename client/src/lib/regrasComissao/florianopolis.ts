import type { RegrasVendedorMecanico } from "./types";

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