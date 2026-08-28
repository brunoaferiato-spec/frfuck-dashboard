import {
  regrasJoinville,
  regraAlinhadorJoinville,
} from "./joinville";

import {
  regrasBlumenau,
  regraAlinhadorPadraoBlumenau,
  regraAlinhadorMiltonBlumenau,
} from "./blumenau";

import {
  regrasSaoJose,
  regraAlinhadorSaoJose,
} from "./saoJose";

import {
  regrasFlorianopolis,
  regraAlinhadorFlorianopolis,
} from "./florianopolis";

import type {
  RegraPercentual,
  RegrasVendedorMecanico,
  RegraAlinhador,
} from "./types";

const REGRAS_POR_LOJA: Record<number, RegrasVendedorMecanico> = {
  1: regrasJoinville,
  2: regrasBlumenau,
  3: regrasSaoJose,
  4: regrasFlorianopolis,
};

function calcularPercentualPorFaixas(
  regra: RegraPercentual | RegraAlinhador,
  valorBruto: number
): number {
  const valor = Number(valorBruto || 0);

  if (valor <= 0) {
    return 0;
  }

  let percentual = 0;

  for (const faixa of regra.faixas) {
    if (valor >= faixa.minimo) {
      percentual = faixa.percentual;
    } else {
      break;
    }
  }

  return percentual;
}

function normalizarNome(nome: string) {
  return String(nome || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

// ======================================================
// VENDEDOR E MECÂNICO
// ======================================================

export function getRegraVendedorMecanico(args: {
  lojaId: number | string;
  funcao: string;
}): RegraPercentual | null {
  const lojaId = Number(args.lojaId);
  const funcao = String(args.funcao || "").trim().toLowerCase();

  const regrasLoja = REGRAS_POR_LOJA[lojaId];

  if (!regrasLoja) {
    return null;
  }

  if (funcao === "vendedor") {
    return regrasLoja.vendedor;
  }

  if (funcao === "mecanico") {
    return regrasLoja.mecanico;
  }

  return null;
}

export function calcularPercentualVendedorMecanico(args: {
  lojaId: number | string;
  funcao: string;
  valor: number;
}): number | null {
  const regra = getRegraVendedorMecanico({
    lojaId: args.lojaId,
    funcao: args.funcao,
  });

  if (!regra) {
    return null;
  }

  return calcularPercentualPorFaixas(regra, args.valor);
}

// ======================================================
// ALINHADOR
// ======================================================

export function getRegraAlinhador(args: {
  lojaId: number | string;
  funcionarioNome?: string;
}): RegraAlinhador | null {
  const lojaId = Number(args.lojaId);
  const nome = normalizarNome(args.funcionarioNome || "");

  // Joinville
  if (lojaId === 1) {
    return regraAlinhadorJoinville;
  }

  // Blumenau
  if (lojaId === 2) {
    // Milton possui uma regra exclusiva.
    if (nome.includes("MILTON")) {
      return regraAlinhadorMiltonBlumenau;
    }

    return regraAlinhadorPadraoBlumenau;
  }

  // São José
  if (lojaId === 3) {
    return regraAlinhadorSaoJose;
  }

  // Florianópolis
  if (lojaId === 4) {
    return regraAlinhadorFlorianopolis;
  }

  return null;
}

export function calcularPercentualAlinhador(args: {
  lojaId: number | string;
  funcionarioNome?: string;
  valor: number;
}): number | null {
  const regra = getRegraAlinhador({
    lojaId: args.lojaId,
    funcionarioNome: args.funcionarioNome,
  });

  if (!regra) {
    return null;
  }

  return calcularPercentualPorFaixas(regra, args.valor);
}

// ======================================================
// EXPORTS
// ======================================================

export {
  regrasJoinville,
  regrasBlumenau,
  regrasSaoJose,
  regrasFlorianopolis,

  regraAlinhadorJoinville,
  regraAlinhadorPadraoBlumenau,
  regraAlinhadorMiltonBlumenau,
  regraAlinhadorSaoJose,
  regraAlinhadorFlorianopolis,
};

export type {
  PeriodicidadeComissao,
  FaixaPercentual,
  RegraPercentual,
  RegrasVendedorMecanico,
  RegraAlinhador,
} from "./types";