import type { RegrasVendedorMecanico } from "./types";

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