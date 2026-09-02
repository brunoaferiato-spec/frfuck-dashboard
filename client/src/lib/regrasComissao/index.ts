import {
  regrasJoinville,
  regraAlinhadorJoinville,
  regrasConsultorJoinville,
  regrasRecepcaoJoinville,
} from "./joinville";

import {
  regrasBlumenau,
  regraAlinhadorPadraoBlumenau,
  regraAlinhadorMiltonBlumenau,
  regrasConsultorBlumenau,
  regrasRecepcaoBlumenau,
} from "./blumenau";

import {
  regrasSaoJose,
  regraAlinhadorSaoJose,
  regrasConsultorSaoJose,
  regrasRecepcaoSaoJose,
  regraGerenteSaoJose,
} from "./saoJose";

import {
  regrasFlorianopolis,
  regraAlinhadorFlorianopolis,
  regrasConsultorFlorianopolis,
  regrasRecepcaoFlorianopolis,
  regraGerenteFlorianopolis,
} from "./florianopolis";

import {
  regrasSaoLeopoldo,
  regraAlinhadorSaoLeopoldo,
  regrasConsultorSaoLeopoldo,
  regrasRecepcaoSaoLeopoldo,
  regraGerenteSaoLeopoldo,
} from "./saoLeopoldo";

import {
  regrasGravatai,
  regraAlinhadorGravatai,
  regrasConsultorGravatai,
  regrasRecepcaoGravatai,
} from "./gravatai";

import { regraSupervisor } from "./supervisor";
import { regrasPremiacoesEspeciais } from "./premiacoesEspeciais";

import type {
  RegraPercentual,
  RegrasVendedorMecanico,
  RegraAlinhador,
  RegrasConsultor,
  RegrasRecepcao,
  RegraRecepcaoFuncionario,
  RegraGerente,
  RegraSupervisor,
  RegraPremiacaoEspecialFuncionario,
} from "./types";

// ======================================================
// MAPAS POR LOJA
// ======================================================

const REGRAS_POR_LOJA: Record<number, RegrasVendedorMecanico> = {
  1: regrasJoinville,
  2: regrasBlumenau,
  3: regrasSaoJose,
  4: regrasFlorianopolis,
  6: regrasSaoLeopoldo,
  7: regrasGravatai,
};

const REGRAS_CONSULTOR_POR_LOJA: Record<number, RegrasConsultor> = {
  1: regrasConsultorJoinville,
  2: regrasConsultorBlumenau,
  3: regrasConsultorSaoJose,
  4: regrasConsultorFlorianopolis,
  // ACI usa somente Consultor Meta 2 e segue a mesma regra mensal de Joinville.
  5: regrasConsultorJoinville,
  6: regrasConsultorSaoLeopoldo,
  7: regrasConsultorGravatai,
};

const REGRAS_RECEPCAO_POR_LOJA: Record<number, RegrasRecepcao> = {
  1: regrasRecepcaoJoinville,
  2: regrasRecepcaoBlumenau,
  3: regrasRecepcaoSaoJose,
  4: regrasRecepcaoFlorianopolis,
  6: regrasRecepcaoSaoLeopoldo,
  7: regrasRecepcaoGravatai,
};

// ======================================================
// HELPERS
// ======================================================

function calcularPercentualPorFaixas(
  regra: RegraPercentual | RegraAlinhador | RegraGerente,
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

function normalizarFuncao(funcao: string) {
  return String(funcao || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
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

  if (lojaId === 1) {
    return regraAlinhadorJoinville;
  }

  if (lojaId === 2) {
    if (nome.includes("MILTON")) {
      return regraAlinhadorMiltonBlumenau;
    }

    return regraAlinhadorPadraoBlumenau;
  }

  if (lojaId === 3) {
    // SÃO JOSÉ - regras individuais de alinhador.
    // João Gabriel: 1% fixo sobre a liquidez.
    if (nome.includes("JOAO GABRIEL RODRIGUES VIEIRA")) {
      return {
        ...regraAlinhadorSaoJose,
        faixas: [{ minimo: 0, percentual: 1 }],
      };
    }

    // Alessander dos Santos Albino: 2% fixo sobre a liquidez.
    if (nome.includes("ALESSANDER DOS SANTOS ALBINO")) {
      return {
        ...regraAlinhadorSaoJose,
        faixas: [{ minimo: 0, percentual: 2 }],
      };
    }

    // Demais alinhadores de São José preservam a regra atual.
    return regraAlinhadorSaoJose;
  }

  if (lojaId === 4) {
    return regraAlinhadorFlorianopolis;
  }

  if (lojaId === 6) {
    return regraAlinhadorSaoLeopoldo;
  }

  if (lojaId === 7) {
    return regraAlinhadorGravatai;
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
// CONSULTOR DE VENDAS
// ======================================================

export function getRegrasConsultor(args: {
  lojaId: number | string;
}): RegrasConsultor | null {
  const lojaId = Number(args.lojaId);

  return REGRAS_CONSULTOR_POR_LOJA[lojaId] || null;
}

// ======================================================
// CONSULTOR META 1 - SEMANAL
// ======================================================

export function calcularConsultorMeta1Semana(args: {
  lojaId: number | string;
  carros: number;
  semana: 1 | 2 | 3 | 4;
}) {
  const regras = getRegrasConsultor({
    lojaId: args.lojaId,
  });

  const carros = Number(args.carros || 0);

  if (!regras || carros <= 0) {
    return {
      carros,
      valorPorCarro: 0,
      comissao: 0,
      premiacao: 0,
      descricaoPremiacao: null as string | null,
    };
  }

  let valorPorCarro = 0;

  for (const faixa of regras.meta1.faixas) {
    if (carros >= faixa.minimoCarros) {
      valorPorCarro = faixa.valorPorCarro;
    } else {
      break;
    }
  }

  const comissao = carros * valorPorCarro;

  const bateuBonus =
    carros >= regras.meta1.carrosParaBonus;

  const premiacao = bateuBonus
    ? regras.meta1.valorBonus
    : 0;

  const descricaoPremiacao = bateuBonus
    ? `PREMIAÇÃO SEMANA ${args.semana}`
    : null;

  return {
    carros,
    valorPorCarro,
    comissao,
    premiacao,
    descricaoPremiacao,
  };
}

// ======================================================
// CONSULTOR META 2 - MENSAL
// ======================================================

export function calcularConsultorMeta2Mensal(args: {
  lojaId: number | string;
  carros: number;
}) {
  const regras = getRegrasConsultor({
    lojaId: args.lojaId,
  });

  const carros = Number(args.carros || 0);

  if (!regras || carros <= 0) {
    return {
      carros,
      blocosCompletos: 0,
      comissao: 0,
      premiacao: 0,
      detalhesPremiacao: [] as Array<{
        descricao: string;
        valor: number;
      }>,
    };
  }

  const blocosCompletos = Math.floor(
    carros / regras.meta2.carrosPorBloco
  );

  const comissao =
    blocosCompletos * regras.meta2.valorPorBloco;

  const detalhesPremiacao = regras.meta2.bonusAcumulativos
    .filter((bonus) => carros >= bonus.carros)
    .map((bonus) => ({
      descricao: `META ${bonus.carros} CARROS`,
      valor: bonus.valor,
    }));

  const premiacao = detalhesPremiacao.reduce(
    (total, item) => total + Number(item.valor || 0),
    0
  );

  return {
    carros,
    blocosCompletos,
    comissao,
    premiacao,
    detalhesPremiacao,
  };
}

// ======================================================
// RECEPÇÃO
// ======================================================

export function getRegraRecepcao(args: {
  lojaId: number | string;
  funcionarioNome?: string;
}): RegraRecepcaoFuncionario | null {
  const lojaId = Number(args.lojaId);
  const nomeFuncionario = normalizarNome(
    args.funcionarioNome || ""
  );

  const regrasLoja =
    REGRAS_RECEPCAO_POR_LOJA[lojaId];

  if (!regrasLoja) {
    return null;
  }

  const regraEspecifica =
    regrasLoja.regrasEspecificas?.find((regra) => {
      const nomeRegra = normalizarNome(
        regra.funcionarioNome || ""
      );

      if (!nomeRegra || !nomeFuncionario) {
        return false;
      }

      return (
        nomeFuncionario === nomeRegra ||
        nomeFuncionario.includes(nomeRegra) ||
        nomeRegra.includes(nomeFuncionario)
      );
    });

  if (regraEspecifica) {
    return regraEspecifica;
  }

  if (regrasLoja.regraPadrao) {
    return regrasLoja.regraPadrao;
  }

  return null;
}

export function calcularRecepcao(args: {
  lojaId: number | string;
  funcionarioNome?: string;
  vendas: number;
  entradas: number;
}) {
  const regra = getRegraRecepcao({
    lojaId: args.lojaId,
    funcionarioNome: args.funcionarioNome,
  });

  const vendas = Number(args.vendas || 0);
  const entradas = Number(args.entradas || 0);

  if (!regra) {
    return {
      valorVenda: 0,
      valorEntrada: 0,
      comissaoVenda: 0,
      comissaoEntrada: 0,
      totalComissao: 0,
    };
  }

  const comissaoVenda =
    vendas * Number(regra.valorVenda || 0);

  const comissaoEntrada =
    entradas * Number(regra.valorEntrada || 0);

  return {
    valorVenda: Number(regra.valorVenda || 0),
    valorEntrada: Number(regra.valorEntrada || 0),
    comissaoVenda,
    comissaoEntrada,
    totalComissao:
      comissaoVenda + comissaoEntrada,
  };
}

// ======================================================
// GERENTE
// ======================================================

export function getRegraGerente(args: {
  lojaId: number | string;
}): RegraGerente | null {
  const lojaId = Number(args.lojaId);

  if (lojaId === 3) {
    return regraGerenteSaoJose;
  }

  if (lojaId === 4) {
    return regraGerenteFlorianopolis;
  }

  if (lojaId === 6) {
    return regraGerenteSaoLeopoldo;
  }

  return null;
}

export function calcularPercentualGerente(args: {
  lojaId: number | string;
  liquidezLoja: number;
}): number | null {
  const regra = getRegraGerente({
    lojaId: args.lojaId,
  });

  if (!regra) {
    return null;
  }

  return calcularPercentualPorFaixas(
    regra,
    Number(args.liquidezLoja || 0)
  );
}

// ======================================================
// SUPERVISOR
// ======================================================

export function calcularPremiacaoSupervisorLoja(args: {
  lojaId: number | string;
  liquidezLoja: number;
}) {
  const lojaId = Number(args.lojaId);
  const liquidez = Number(args.liquidezLoja || 0);

  const regraLoja = regraSupervisor.lojas.find(
    (loja) => loja.lojaId === lojaId
  );

  if (!regraLoja) {
    return {
      total: 0,
      detalhes: [] as Array<{
        descricao: string;
        valor: number;
      }>,
    };
  }

  const detalhes = regraLoja.metas
    .filter((meta) => liquidez >= meta.meta)
    .map((meta) => ({
      descricao: `${regraLoja.nomeLoja} - Meta R$ ${meta.meta.toLocaleString(
        "pt-BR",
        {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }
      )}`,
      valor: meta.premio,
    }));

  const total = detalhes.reduce(
    (acc, item) => acc + Number(item.valor || 0),
    0
  );

  return {
    total,
    detalhes,
  };
}

export function calcularPremiacaoSupervisorGrupo(args: {
  liquidezTotalGrupo: number;
}) {
  const liquidezGrupo = Number(
    args.liquidezTotalGrupo || 0
  );

  const detalhes: Array<{
    descricao: string;
    valorTotalGrupo: number;
    valorPorLoja: number;
  }> = [];

  for (const meta of regraSupervisor.metasGrupo) {
    if (liquidezGrupo >= meta.meta) {
      detalhes.push({
        descricao: `Meta Grupo R$ ${meta.meta.toLocaleString(
          "pt-BR",
          {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }
        )}`,
        valorTotalGrupo: meta.premioTotalGrupo,
        valorPorLoja:
          meta.premioTotalGrupo /
          regraSupervisor.divisorPremiacaoGrupo,
      });
    }
  }

  if (
    liquidezGrupo >
    regraSupervisor.recordeGrupoAtual
  ) {
    const premioRecordeTotal =
      liquidezGrupo *
      regraSupervisor.percentualPremioRecorde;

    detalhes.push({
      descricao: `Recorde do Grupo acima de R$ ${regraSupervisor.recordeGrupoAtual.toLocaleString(
        "pt-BR",
        {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }
      )}`,
      valorTotalGrupo: premioRecordeTotal,
      valorPorLoja:
        premioRecordeTotal /
        regraSupervisor.divisorPremiacaoGrupo,
    });
  }

  const totalGrupo = detalhes.reduce(
    (acc, item) =>
      acc + Number(item.valorTotalGrupo || 0),
    0
  );

  const totalPorLoja = detalhes.reduce(
    (acc, item) =>
      acc + Number(item.valorPorLoja || 0),
    0
  );

  return {
    totalGrupo,
    totalPorLoja,
    detalhes,
  };
}

// Na folha o supervisor aparece dividido entre 4 lojas.
// R$ 6.000 total / 4 = R$ 1.500 por loja.
export function getSalarioFixoSupervisor() {
  return (
    regraSupervisor.salarioFixo /
    regraSupervisor.divisorPremiacaoGrupo
  );
}

export function getRecordeAtualSupervisor() {
  return regraSupervisor.recordeGrupoAtual;
}

// ======================================================
// PREMIAÇÕES ESPECIAIS
// ======================================================

export type FuncionarioResumoPremiacaoEspecial = {
  nome: string;
  funcao: string;
  totalLiquidez: number;
};

export function getRegraPremiacaoEspecial(args: {
  lojaId: number | string;
  funcionarioNome: string;
}): RegraPremiacaoEspecialFuncionario | null {
  const lojaId = Number(args.lojaId);
  const nome = normalizarNome(args.funcionarioNome);

  const regra = regrasPremiacoesEspeciais.find((item) => {
    const nomeRegra = normalizarNome(item.funcionarioNome);

    const primeiroNomeRegra = nomeRegra.split(/\s+/)[0] || "";
    const primeiroNomeFuncionario = nome.split(/\s+/)[0] || "";

    return (
      item.lojaId === lojaId &&
      (
        nome === nomeRegra ||
        nome.includes(nomeRegra) ||
        nomeRegra.includes(nome) ||
        (
          primeiroNomeRegra.length >= 4 &&
          primeiroNomeRegra === primeiroNomeFuncionario
        )
      )
    );
  });

  return regra || null;
}

export function calcularPremiacaoEspecialFuncionario(args: {
  lojaId: number | string;
  funcionarioNome: string;
  funcionariosDaLoja: FuncionarioResumoPremiacaoEspecial[];
}) {
  const regra = getRegraPremiacaoEspecial({
    lojaId: args.lojaId,
    funcionarioNome: args.funcionarioNome,
  });

  if (!regra) {
    return {
      total: 0,
      detalhes: [] as Array<{
        descricao: string;
        valor: number;
      }>,
    };
  }

  const detalhes: Array<{
    descricao: string;
    valor: number;
  }> = [];

  const lojaId = Number(args.lojaId);
  const nomeTitular = normalizarNome(args.funcionarioNome);

  // ====================================================
  // PRÊMIO FIXO
  // ====================================================
  if (Number(regra.premioFixo || 0) > 0) {
    const descricaoFixo =
      lojaId === 1
        ? "CHEFE DE PÁTIO"
        : "PREMIAÇÃO FIXA";

    detalhes.push({
      descricao: descricaoFixo,
      valor: Number(regra.premioFixo || 0),
    });
  }

  // ====================================================
  // MECÂNICOS QUE ATINGIRAM A META
  // ====================================================
  if (regra.premiacaoMecanicos) {
    const mecanicosElegiveis = args.funcionariosDaLoja.filter(
      (funcionario) => {
        const ehMecanico =
          normalizarFuncao(funcionario.funcao) === "mecanico";

        if (!ehMecanico) {
          return false;
        }

        if (
          Number(funcionario.totalLiquidez || 0) <
          regra.premiacaoMecanicos!.metaLiquidezMecanico
        ) {
          return false;
        }

        if (
          regra.premiacaoMecanicos!.excluirProprioFuncionario &&
          normalizarNome(funcionario.nome) === nomeTitular
        ) {
          return false;
        }

        return true;
      }
    );

    if (mecanicosElegiveis.length > 0) {
      const valorMecanicos =
        mecanicosElegiveis.length *
        Number(regra.premiacaoMecanicos.valorPorMecanico || 0);

      detalhes.push({
        descricao:
          mecanicosElegiveis.length === 1
            ? "MECÂNICO"
            : `MECÂNICOS (${mecanicosElegiveis.length})`,
        valor: valorMecanicos,
      });
    }
  }

  // ====================================================
  // RAMPA / ALINHADOR
  // ====================================================
  if (regra.premiacaoAlinhador) {
    const nomeAlinhadorEspecifico = normalizarNome(
      regra.premiacaoAlinhador.funcionarioAlinhador || ""
    );

    const alinhadorElegivel = args.funcionariosDaLoja.find(
      (funcionario) => {
        const ehAlinhador =
          normalizarFuncao(funcionario.funcao) === "alinhador";

        if (!ehAlinhador) {
          return false;
        }

        if (
          nomeAlinhadorEspecifico &&
          !normalizarNome(funcionario.nome).includes(
            nomeAlinhadorEspecifico
          )
        ) {
          return false;
        }

        return (
          Number(funcionario.totalLiquidez || 0) >=
          regra.premiacaoAlinhador!.metaLiquidezAlinhador
        );
      }
    );

    if (alinhadorElegivel) {
      detalhes.push({
        descricao:
          lojaId === 2
            ? "RAMPA - MILTON"
            : "RAMPA",
        valor: Number(regra.premiacaoAlinhador.valorPremio || 0),
      });
    }
  }

  const total = detalhes.reduce(
    (acc, item) => acc + Number(item.valor || 0),
    0
  );

  return {
    total,
    detalhes,
  };
}

// ======================================================
// EXPORTS
// ======================================================

export {
  regrasJoinville,
  regrasBlumenau,
  regrasSaoJose,
  regrasFlorianopolis,
  regrasSaoLeopoldo,
  regrasGravatai,

  regraAlinhadorJoinville,
  regraAlinhadorPadraoBlumenau,
  regraAlinhadorMiltonBlumenau,
  regraAlinhadorSaoJose,
  regraAlinhadorFlorianopolis,
  regraAlinhadorSaoLeopoldo,
  regraAlinhadorGravatai,

  regrasConsultorJoinville,
  regrasConsultorBlumenau,
  regrasConsultorSaoJose,
  regrasConsultorFlorianopolis,
  regrasConsultorSaoLeopoldo,
  regrasConsultorGravatai,

  regrasRecepcaoJoinville,
  regrasRecepcaoBlumenau,
  regrasRecepcaoSaoJose,
  regrasRecepcaoFlorianopolis,
  regrasRecepcaoSaoLeopoldo,
  regrasRecepcaoGravatai,

  regraGerenteSaoJose,
  regraGerenteFlorianopolis,
  regraGerenteSaoLeopoldo,

  regraSupervisor,
  regrasPremiacoesEspeciais,
};

export type {
  PeriodicidadeComissao,
  FaixaPercentual,
  RegraPercentual,
  RegrasVendedorMecanico,
  RegraAlinhador,

  FaixaConsultorMeta1,
  RegraConsultorMeta1,
  BonusConsultorMeta2,
  RegraConsultorMeta2,
  RegrasConsultor,

  RegraRecepcaoFuncionario,
  RegrasRecepcao,

  RegraGerente,
  RegraSupervisor,

  RegraPremiacaoMecanicos,
  RegraPremiacaoAlinhador,
  RegraPremiacaoEspecialFuncionario,
} from "./types";
