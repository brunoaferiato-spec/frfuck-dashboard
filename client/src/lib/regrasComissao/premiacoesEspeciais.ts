import type {
  RegraPremiacaoEspecialFuncionario,
} from "./types";

// ======================================================
// PREMIAÇÕES ESPECIAIS POR FUNCIONÁRIO
// ======================================================

export const regrasPremiacoesEspeciais: RegraPremiacaoEspecialFuncionario[] = [
  // ====================================================
  // JOINVILLE - BRUNO ALMEIDA ALVES
  // ====================================================
  {
    lojaId: 1,
    funcionarioNome: "Bruno Almeida Alves",

    // Bruno continua sendo vendedor normalmente.
    funcaoBase: "vendedor",

    // Premiação fixa por ser chefe de pátio.
    premioFixo: 500,

    // + R$ 250 para cada mecânico que atingir R$ 50 mil
    // de liquidez no mês.
    premiacaoMecanicos: {
      valorPorMecanico: 250,
      metaLiquidezMecanico: 50000,
      excluirProprioFuncionario: false,
    },

    // + R$ 300 se o alinhador atingir R$ 90 mil.
    premiacaoAlinhador: {
      valorPremio: 300,
      metaLiquidezAlinhador: 90000,
    },
  },

  // ====================================================
  // BLUMENAU - EDUARDO ANTONIO
  // ====================================================
  {
    lojaId: 2,
    funcionarioNome: "Eduardo Antonio",

    // Eduardo continua sendo mecânico normalmente.
    funcaoBase: "mecanico",

    // Premiação fixa.
    premioFixo: 1000,

    // + R$ 300 para cada OUTRO mecânico que atingir
    // R$ 50 mil. O próprio Eduardo não entra na contagem.
    premiacaoMecanicos: {
      valorPorMecanico: 300,
      metaLiquidezMecanico: 50000,
      excluirProprioFuncionario: true,
    },

    // + R$ 300 se Milton atingir R$ 90 mil.
    premiacaoAlinhador: {
  valorPremio: 300,
  metaLiquidezAlinhador: 90000,
},
  },
];