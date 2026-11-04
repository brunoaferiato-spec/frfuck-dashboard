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
  // A partir de 10/2026: R$ 500 de chefe de pátio + R$ 500 se a loja
  // (liquidez do supervisor) bater R$ 400 mil. Não ganha mais por mecânico/rampa.
  {
    lojaId: 1,
    funcionarioNome: "Bruno Almeida Alves",
    funcaoBase: "vendedor",
    vigenteDe: 202610,
    premioFixo: 500,
    premiacaoMetaLoja: {
      valorPremio: 500,
      metaLiquidezLoja: 400000,
    },
  },

  // Regra até 09/2026, mantida para os meses anteriores à mudança.
  {
    lojaId: 1,
    funcionarioNome: "Bruno Almeida Alves",
    vigenteAte: 202609,

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