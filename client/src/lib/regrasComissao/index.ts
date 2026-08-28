import { regrasJoinville } from "./joinville";
import { regrasBlumenau } from "./blumenau";
import { regrasSaoJose } from "./saoJose";
import { regrasFlorianopolis } from "./florianopolis";

import type {
  RegraPercentual,
  RegrasVendedorMecanico,
} from "./types";

const REGRAS_POR_LOJA: Record<number, RegrasVendedorMecanico> = {
  1: regrasJoinville,
  2: regrasBlumenau,
  3: regrasSaoJose,
  4: regrasFlorianopolis,
};

function calcularPercentualPorFaixas(
  regra: RegraPercentual,
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

export {
  regrasJoinville,
  regrasBlumenau,
  regrasSaoJose,
  regrasFlorianopolis,
};

export type {
  PeriodicidadeComissao,
  FaixaPercentual,
  RegraPercentual,
  RegrasVendedorMecanico,
} from "./types";