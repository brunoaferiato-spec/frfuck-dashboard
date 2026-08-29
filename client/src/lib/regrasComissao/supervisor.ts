import type { RegraSupervisor } from "./types";

// =========================
// SUPERVISOR
// =========================

export const regraSupervisor: RegraSupervisor = {
  // Salário fixo mensal
  salarioFixo: 6000,

  // Premiações por liquidez de cada loja.
  // As faixas são ACUMULATIVAS.
  lojas: [
    // =========================
    // JOINVILLE
    // =========================
    {
      lojaId: 1,
      nomeLoja: "Joinville",
      metas: [
        { meta: 300000, premio: 1000 },
        { meta: 360000, premio: 2000 },
        { meta: 400000, premio: 2000 },
        { meta: 440000, premio: 2000 },
        { meta: 480000, premio: 2000 },
        { meta: 520000, premio: 2000 },
        { meta: 560000, premio: 2000 },
      ],
    },

    // =========================
    // BLUMENAU
    // =========================
    {
      lojaId: 2,
      nomeLoja: "Blumenau",
      metas: [
        { meta: 300000, premio: 1000 },
        { meta: 360000, premio: 2000 },
        { meta: 400000, premio: 3000 },
        { meta: 440000, premio: 3000 },
        { meta: 480000, premio: 3000 },
        { meta: 520000, premio: 3000 },
        { meta: 560000, premio: 3000 },
      ],
    },

    // =========================
    // SÃO JOSÉ
    // =========================
    {
      lojaId: 3,
      nomeLoja: "São José",
      metas: [
        { meta: 300000, premio: 1000 },
        { meta: 360000, premio: 2000 },
        { meta: 400000, premio: 3000 },
        { meta: 440000, premio: 3000 },
        { meta: 480000, premio: 3000 },
        { meta: 520000, premio: 3000 },
        { meta: 560000, premio: 3000 },
      ],
    },

    // =========================
    // FLORIANÓPOLIS
    // =========================
    {
      lojaId: 4,
      nomeLoja: "Florianópolis",
      metas: [
        { meta: 300000, premio: 1000 },
        { meta: 360000, premio: 1000 },
        { meta: 400000, premio: 1000 },
        { meta: 440000, premio: 1000 },
        { meta: 480000, premio: 1000 },
        { meta: 520000, premio: 1000 },
        { meta: 560000, premio: 1000 },
      ],
    },
  ],

  // =========================
  // PREMIAÇÃO DO GRUPO
  // =========================
  // Também acumulativa.
  metasGrupo: [
    {
      meta: 1420000,
      premioTotalGrupo: 1000,
    },
    {
      meta: 1540000,
      premioTotalGrupo: 1000,
    },
    {
      meta: 1600000,
      premioTotalGrupo: 1000,
    },
  ],

  // O prêmio do grupo é dividido entre as 4 lojas.
  divisorPremiacaoGrupo: 4,

  // Recorde atual oficial do grupo
  recordeGrupoAtual: 1780000,

  // 0,1%
  percentualPremioRecorde: 0.001,
};