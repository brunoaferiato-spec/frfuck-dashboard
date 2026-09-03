import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  computeFolhaLinha,
  findMetaForFuncionario,
  getRecepcaoConfig,
} from "@/lib/payrollStore";
import {
  calcularPremiacaoEspecialFuncionario,
  calcularPremiacaoSupervisorGrupo,
  getSalarioFixoSupervisor,
} from "@/lib/regrasComissao";
import {
  BarChart3,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileText,
  Gauge,
  LayoutDashboard,
  Loader2,
  LogOut,
  ReceiptText,
  ShieldCheck,
  TrendingUp,
  UserRoundSearch,
  Users,
  WalletCards,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const LOJAS = [
  { id: 1, nome: "Joinville" },
  { id: 2, nome: "Blumenau" },
  { id: 3, nome: "São José" },
  { id: 4, nome: "Florianópolis" },
  { id: 5, nome: "ACI Promoções" },
  { id: 6, nome: "São Leopoldo" },
  { id: 7, nome: "Gravataí" },
];

const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const ACI_SUPERVISORA_SALARIO_FIXO = 2400;

type QuadranteKey =
  | "gerente"
  | "comissao_semanal"
  | "consultor_vendas"
  | "consultor_vendas_mensal"
  | "comissao_mensal"
  | "alinhador"
  | "recepcao"
  | "supervisor_pj"
  | "supervisora_consultores_pj"
  | "salario_fixo";

type ResumoLoja = {
  lojaId: number;
  lojaNome: string;
  liquidez: number;
  comissaoPremiacao: number;
  adiantamento: number;
  folhaSemAdiantamento: number;
  boletos: number;
  desembolso: number;
  custoLiquidez: number;
  funcionarios: number;
  boletosNegativos: number;
  fechado: boolean;
  fechadoPorNome?: string | null;
  fechadoEm?: string | Date | null;
};

type DashboardData = {
  lojas: ResumoLoja[];
  carregadoEm: Date;
};

function money(value: number) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function compactMoney(value: number) {
  const numero = Number(value || 0);
  if (Math.abs(numero) >= 1_000_000) {
    return `R$ ${(numero / 1_000_000).toLocaleString("pt-BR", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 2,
    })} mi`;
  }
  if (Math.abs(numero) >= 1_000) {
    return `R$ ${(numero / 1_000).toLocaleString("pt-BR", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })} mil`;
  }
  return money(numero);
}

function normalizarNome(nome: unknown) {
  return String(nome || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function usaMetaSemanal(lojaId: number, ano: number, mes: number) {
  if ([1, 2, 6, 7].includes(lojaId)) return true;

  if (lojaId === 3) {
    if (ano > 2026) return true;
    if (ano === 2026 && mes >= 5) return true;
    return false;
  }

  return false;
}

function getQuadrante(
  lojaId: number,
  funcao: string,
  ano: number,
  mes: number,
  tipoMeta?: string | null
): QuadranteKey {
  if (funcao === "supervisor" && lojaId === 5) {
    return "supervisora_consultores_pj";
  }

  if (funcao === "supervisor") return "supervisor_pj";
  if (funcao === "gerente") return "gerente";

  if (funcao === "consultor_vendas") {
    if (lojaId === 5 || tipoMeta === "meta2") {
      return "consultor_vendas_mensal";
    }
    return "consultor_vendas";
  }

  if (funcao === "alinhador" || funcao === "aux_alinhador") {
    return "alinhador";
  }

  if (funcao === "recepcionista") return "recepcao";

  if (
    usaMetaSemanal(lojaId, ano, mes) &&
    (funcao === "vendedor" || funcao === "mecanico")
  ) {
    return "comissao_semanal";
  }

  if (funcao === "vendedor" || funcao === "mecanico") {
    return "comissao_mensal";
  }

  return "salario_fixo";
}

function getValorPorCarroSupervisoraAci(totalCarrosBruto: number) {
  const totalCarros = Number(totalCarrosBruto || 0);
  if (totalCarros >= 4200) return 2;
  if (totalCarros >= 3200) return 1.5;
  if (totalCarros >= 3000) return 1.25;
  if (totalCarros >= 2700) return 1;
  if (totalCarros >= 2400) return 0.75;
  return 0.5;
}

function calcularSupervisoraAci(args: {
  joinville: number;
  blumenau: number;
  saoJose: number;
  florianopolis: number;
  gravatai: number;
  saoLeopoldo: number;
}) {
  const totalCarros =
    Number(args.joinville || 0) +
    Number(args.blumenau || 0) +
    Number(args.saoJose || 0) +
    Number(args.florianopolis || 0) +
    Number(args.gravatai || 0) +
    Number(args.saoLeopoldo || 0);

  const valorPorCarro = getValorPorCarroSupervisoraAci(totalCarros);
  const comissao = Number((totalCarros * valorPorCarro).toFixed(2));

  return { totalCarros, valorPorCarro, comissao };
}

function calcularBoletoAjustado(args: {
  quadrante: QuadranteKey;
  funcao: string;
  lojaId: number;
  funcionarioNome: string;
  totalComissao: number;
  premiacao: number;
  vale: number;
  aluguel: number;
  inss: number;
  adiant: number;
  holerite: number;
  descontoFolhaProporcional?: number | null;
  boletoOriginal: number;
}) {
  const totalComissao = Number(args.totalComissao || 0);
  const premiacao = Number(args.premiacao || 0);
  const vale = Number(args.vale || 0);
  const aluguel = Number(args.aluguel || 0);
  const inss = Number(args.inss || 0);
  const adiant = Number(args.adiant || 0);
  const holerite = Number(args.holerite || 0);

  if (args.quadrante === "salario_fixo") {
    return premiacao - vale;
  }

  if (args.quadrante === "recepcao") {
    if (Number(args.lojaId) === 1) {
      return premiacao - vale;
    }
    return totalComissao + premiacao - vale;
  }

  if (args.quadrante === "consultor_vendas") {
    return totalComissao + premiacao - vale - aluguel;
  }

  if (args.quadrante === "alinhador") {
    const ehMiltonBlumenau =
      Number(args.lojaId) === 2 &&
      normalizarNome(args.funcionarioNome).includes("MILTON");

    if (ehMiltonBlumenau) {
      return totalComissao + premiacao - vale - aluguel - adiant;
    }

    return totalComissao + premiacao - vale - aluguel;
  }

  if (args.quadrante === "consultor_vendas_mensal") {
    return totalComissao + premiacao - vale - aluguel;
  }

  if (args.quadrante === "supervisora_consultores_pj") {
    return (
      ACI_SUPERVISORA_SALARIO_FIXO +
      totalComissao +
      premiacao -
      vale -
      aluguel -
      adiant
    );
  }

  if (args.quadrante === "supervisor_pj") {
    return (
      getSalarioFixoSupervisor() +
      totalComissao +
      premiacao -
      vale -
      aluguel -
      adiant
    );
  }

  if (
    args.quadrante === "comissao_semanal" ||
    args.quadrante === "comissao_mensal" ||
    args.quadrante === "gerente"
  ) {
    const descontoFolha =
      args.descontoFolhaProporcional !== null &&
      args.descontoFolhaProporcional !== undefined
        ? Number(args.descontoFolhaProporcional || 0)
        : inss + adiant + holerite;

    return totalComissao + premiacao - vale - aluguel - descontoFolha;
  }

  return Number(args.boletoOriginal || 0);
}

function calcularProporcaoTrocaFuncaoDashboard(
  dataMudanca: string | Date,
  ano: number,
  mes: number
) {
  const raw =
    dataMudanca instanceof Date
      ? dataMudanca.toISOString().slice(0, 10)
      : String(dataMudanca || "").slice(0, 10);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  if (Number(match[1]) !== ano || Number(match[2]) !== mes) return null;

  const totalDias = new Date(ano, mes, 0).getDate();
  const dia = Math.min(Math.max(1, Number(match[3])), totalDias);
  const diasNova = Math.max(0, totalDias - dia + 1);
  return totalDias > 0 ? diasNova / totalDias : 1;
}

function funcaoAnteriorUsaFolhaFixaDashboard(
  funcao: string,
  lojaId: number,
  ano: number,
  mes: number
) {
  const quadrante = getQuadrante(lojaId, funcao, ano, mes, null);
  return quadrante === "salario_fixo" || quadrante === "recepcao";
}

function funcionarioAtivoNaCompetencia(funcionario: any, ano: number, mes: number) {
  const dataReferencia = new Date(ano, mes - 1, 1);
  const desligamento = funcionario.dataDesligamento
    ? new Date(funcionario.dataDesligamento)
    : funcionario.data_desligamento
    ? new Date(funcionario.data_desligamento)
    : null;
  const reativacao = funcionario.dataReativacao
    ? new Date(funcionario.dataReativacao)
    : funcionario.data_reativacao
    ? new Date(funcionario.data_reativacao)
    : null;

  const status = String(funcionario.status || "ativo");

  if (status === "ativo") {
    if (!desligamento) return true;
    if (reativacao) {
      return dataReferencia < desligamento || dataReferencia >= reativacao;
    }
    return true;
  }

  if (status === "inativo") {
    if (!desligamento) return false;
    if (reativacao) {
      return dataReferencia < desligamento || dataReferencia >= reativacao;
    }
    return dataReferencia < desligamento;
  }

  return true;
}

function agruparFolhaBase(rows: any[], funcionarios: any[]) {
  const agrupado = new Map<number, any>();

  for (const row of rows || []) {
    const funcionarioId = Number(row.funcionarioId);
    const funcionario = funcionarios.find(
      (f) => Number(f.id) === funcionarioId
    );

    if (!agrupado.has(funcionarioId)) {
      agrupado.set(funcionarioId, {
        funcionarioId,
        loja_id: Number(row.lojaId),
        nome: funcionario?.nome || "",
        funcao: funcionario?.funcao || "",
        tipoMeta: funcionario?.tipoMeta || funcionario?.tipo_meta || "",
        sem1: 0,
        sem2: 0,
        sem3: 0,
        sem4: 0,
        sem5Extra: 0,
        com5Extra: 0,
        sem5: 0,
        sem6: 0,
        percManual1: null,
        percManual2: null,
        percManual3: null,
        percManual4: null,
        perc1: 0,
        perc2: 0,
        perc3: 0,
        perc4: 0,
        com1: 0,
        com2: 0,
        com3: 0,
        com4: 0,
        funcaoSemana1: null,
        funcaoSemana2: null,
        funcaoSemana3: null,
        funcaoSemana4: null,
        composicaoSemana1: null,
        composicaoSemana2: null,
        composicaoSemana3: null,
        composicaoSemana4: null,
        liquidezLojaGerente: 0,
        boleto: 0,
      });
    }

    const item = agrupado.get(funcionarioId)!;
    const semana = Number(row.semana);

    if (semana >= 1 && semana <= 4) {
      item[`sem${semana}`] = Number(row.liquidez || 0);
      item[`percManual${semana}`] =
        row.percentualManual !== null && row.percentualManual !== undefined
          ? Number(row.percentualManual)
          : null;
      item[`perc${semana}`] = Number(row.percentualComissao || 0);
      item[`com${semana}`] = Number(row.valorComissao || 0);
      item[`funcaoSemana${semana}`] =
        row.funcaoSemana === "vendedor" || row.funcaoSemana === "mecanico"
          ? row.funcaoSemana
          : null;
      try {
        const rawComposicao = row.composicaoSemana;
        item[`composicaoSemana${semana}`] = Array.isArray(rawComposicao)
          ? rawComposicao
          : typeof rawComposicao === "string" && rawComposicao.trim()
          ? JSON.parse(rawComposicao)
          : null;
      } catch {
        item[`composicaoSemana${semana}`] = null;
      }
    }

    if (semana === 7) {
      item.sem5Extra = Number(row.liquidez || 0);
      item.com5Extra = Number(row.valorComissao || 0);
    }

    if (semana === 5) {
      const ehSupervisoraAci =
        Number(row.lojaId) === 5 && funcionario?.funcao === "supervisor";

      if (ehSupervisoraAci) {
        item.sem5 = Number(row.liquidez || 0);
      } else {
        item.liquidezLojaGerente = Number(row.liquidez || 0);
      }
    }

    if (semana === 6) {
      item.sem6 = Number(row.liquidez || 0);
    }
  }

  return agrupado;
}

function calcularResumoLoja(args: {
  lojaId: number;
  lojaNome: string;
  ano: number;
  mes: number;
  funcionarios: any[];
  folhaBase: any[];
  extras: any;
  fechamento: any;
  resumoSupervisor: any;
  trocasFuncao: any[];
}): ResumoLoja {
  const funcionarios = (args.funcionarios || []).filter((f) =>
    funcionarioAtivoNaCompetencia(f, args.ano, args.mes)
  );

  const folhaMap = agruparFolhaBase(args.folhaBase || [], funcionarios);
  const trocaPorFuncionario = new Map<number, any>();
  for (const troca of args.trocasFuncao || []) {
    const funcionarioId = Number(troca.funcionarioId);
    if (!trocaPorFuncionario.has(funcionarioId)) {
      trocaPorFuncionario.set(funcionarioId, troca);
    }
  }

  const resumoFuncionariosLoja = funcionarios.map((funcionario) => {
    const base = folhaMap.get(Number(funcionario.id));
    return {
      nome: funcionario.nome,
      funcao: funcionario.funcao,
      totalLiquidez:
        Number(base?.sem1 || 0) +
        Number(base?.sem2 || 0) +
        Number(base?.sem3 || 0) +
        Number(base?.sem4 || 0) +
        Number(base?.sem5Extra || 0),
    };
  });

  const linhas = funcionarios.map((funcionario) => {
    const funcionarioId = Number(funcionario.id);
    const existente = folhaMap.get(funcionarioId) || {};
    const tipoMetaEfetivo =
      funcionario.funcao === "consultor_vendas" && args.lojaId === 5
        ? "meta2"
        : funcionario.tipoMeta || funcionario.tipo_meta || "";

    const ehGerenteSemanal =
      funcionario.funcao === "gerente" && [3, 6].includes(args.lojaId);

    const funcaoMetaCalculo = ehGerenteSemanal
      ? "vendedor"
      : funcionario.funcao;

    const meta = findMetaForFuncionario({
      funcionarioNome: funcionario.nome,
      funcao: ehGerenteSemanal ? "vendedor" : funcionario.funcao,
      cidade: String(args.lojaId),
      tipoMeta: tipoMetaEfetivo,
    });

    const descontos = args.extras?.descontosByFuncionario?.[funcionarioId] || {
      aluguel: 0,
      inss: 0,
      adiant: 0,
      holerite: 0,
    };

    const premiacoesManuais =
      args.extras?.premiacoesByFuncionario?.[funcionarioId] || [];
    const vales = args.extras?.valesByFuncionario?.[funcionarioId] || [];

    const base = {
      sem1: Number(existente.sem1 || 0),
      sem2: Number(existente.sem2 || 0),
      sem3: Number(existente.sem3 || 0),
      sem4: Number(existente.sem4 || 0),
      sem5Extra: Number(existente.sem5Extra || 0),
      com5Extra: Number(existente.com5Extra || 0),
      sem5: Number(existente.sem5 || 0),
      sem6: Number(existente.sem6 || 0),
      liquidezLojaGerente: Number(existente.liquidezLojaGerente || 0),
      percManual1: existente.percManual1 ?? null,
      percManual2: existente.percManual2 ?? null,
      percManual3: existente.percManual3 ?? null,
      percManual4: existente.percManual4 ?? null,
      perc1: Number(existente.perc1 || 0),
      perc2: Number(existente.perc2 || 0),
      perc3: Number(existente.perc3 || 0),
      perc4: Number(existente.perc4 || 0),
      com1: Number(existente.com1 || 0),
      com2: Number(existente.com2 || 0),
      com3: Number(existente.com3 || 0),
      com4: Number(existente.com4 || 0),
      funcaoSemana1: existente.funcaoSemana1 ?? null,
      funcaoSemana2: existente.funcaoSemana2 ?? null,
      funcaoSemana3: existente.funcaoSemana3 ?? null,
      funcaoSemana4: existente.funcaoSemana4 ?? null,
      composicaoSemana1: existente.composicaoSemana1 ?? null,
      composicaoSemana2: existente.composicaoSemana2 ?? null,
      composicaoSemana3: existente.composicaoSemana3 ?? null,
      composicaoSemana4: existente.composicaoSemana4 ?? null,
      premiacoesManuais,
      vales,
      aluguel: Number(descontos.aluguel || 0),
      inss: Number(descontos.inss || 0),
      adiant: Number(descontos.adiant || 0),
      holerite: Number(descontos.holerite || 0),
    };

    const calculado = computeFolhaLinha({
      meta,
      funcao: funcaoMetaCalculo,
      cidade: String(args.lojaId),
      funcionarioNome: funcionario.nome,
      tipoMeta: tipoMetaEfetivo,
      sem1: base.sem1,
      sem2: base.sem2,
      sem3: base.sem3,
      sem4: base.sem4,
      percManual1:
        funcionario.funcao === "vendedor" || funcionario.funcao === "mecanico"
          ? null
          : base.percManual1,
      percManual2:
        funcionario.funcao === "vendedor" || funcionario.funcao === "mecanico"
          ? null
          : base.percManual2,
      percManual3:
        funcionario.funcao === "vendedor" || funcionario.funcao === "mecanico"
          ? null
          : base.percManual3,
      percManual4:
        funcionario.funcao === "vendedor" || funcionario.funcao === "mecanico"
          ? null
          : base.percManual4,
      premiacoesManuais,
      vales,
      aluguel: base.aluguel,
      inss: base.inss,
      adiant: base.adiant,
      holerite: base.holerite,
    } as any) as any;

    const ajustado: any = { ...calculado };
    ajustado.sem5Extra = Number(base.sem5Extra || 0);
    ajustado.com5Extra = Number(base.com5Extra || 0);

    for (const semana of [1, 2, 3, 4] as const) {
      const composicao = (base as any)[`composicaoSemana${semana}`];
      const possuiHistorico =
        (base as any)[`funcaoSemana${semana}`] === "vendedor" ||
        (base as any)[`funcaoSemana${semana}`] === "mecanico" ||
        (Array.isArray(composicao) && composicao.length > 0);

      if (possuiHistorico) {
        ajustado[`perc${semana}`] = Number((base as any)[`perc${semana}`] || 0);
        ajustado[`com${semana}`] = Number((base as any)[`com${semana}`] || 0);
      }
    }

    for (const semana of [1, 2, 3, 4] as const) {
      const manual = Number(base[`percManual${semana}`] || 0);
      if (
        manual > 0 &&
        funcionario.funcao !== "vendedor" &&
        funcionario.funcao !== "mecanico" &&
        !ehGerenteSemanal
      ) {
        ajustado[`perc${semana}`] = manual;
        ajustado[`com${semana}`] = Number(
          (
            funcionario.funcao === "consultor_vendas"
              ? Number(base[`sem${semana}`] || 0) * manual
              : Number(base[`sem${semana}`] || 0) * (manual / 100)
          ).toFixed(2)
        );
      }
    }

    if (funcionario.funcao !== "supervisor") {
      ajustado.totalComissao =
        Number(ajustado.com1 || 0) +
        Number(ajustado.com2 || 0) +
        Number(ajustado.com3 || 0) +
        Number(ajustado.com4 || 0) +
        Number(base.com5Extra || 0);
      ajustado.totalLiquidez =
        Number(ajustado.totalLiquidez || 0) + Number(base.sem5Extra || 0);
    }

    if (funcionario.funcao === "supervisor" && args.lojaId !== 5) {
      const totalGrupo =
        Number(args.resumoSupervisor?.joinville || 0) +
        Number(args.resumoSupervisor?.blumenau || 0) +
        Number(args.resumoSupervisor?.saoJose || 0) +
        Number(args.resumoSupervisor?.florianopolis || 0);

      const calculoGrupoSupervisor = calcularPremiacaoSupervisorGrupo({
        liquidezTotalGrupo: totalGrupo,
      });

      ajustado.premiacao =
        Number(ajustado.premiacao || 0) +
        Number(calculoGrupoSupervisor.totalPorLoja || 0);
    }

    if (funcionario.funcao === "supervisor" && args.lojaId === 5) {
      const calculoAci = calcularSupervisoraAci({
        joinville: base.sem1,
        blumenau: base.sem2,
        saoJose: base.sem3,
        florianopolis: base.sem4,
        gravatai: base.sem5,
        saoLeopoldo: base.sem6,
      });

      ajustado.totalLiquidez = calculoAci.totalCarros;
      ajustado.totalComissao = calculoAci.comissao;
    }

    if (ehGerenteSemanal) {
      const metaGerente = findMetaForFuncionario({
        funcionarioNome: funcionario.nome,
        funcao: "gerente",
        cidade: String(args.lojaId),
        tipoMeta: tipoMetaEfetivo,
      });

      const calculoLoja = computeFolhaLinha({
        meta: metaGerente,
        funcao: "gerente",
        cidade: String(args.lojaId),
        funcionarioNome: funcionario.nome,
        tipoMeta: tipoMetaEfetivo,
        sem1: base.liquidezLojaGerente,
        sem2: 0,
        sem3: 0,
        sem4: 0,
        premiacoesManuais: [],
        vales: [],
        aluguel: 0,
        inss: 0,
        adiant: 0,
        holerite: 0,
      } as any) as any;

      ajustado.totalComissao =
        Number(ajustado.com1 || 0) +
        Number(ajustado.com2 || 0) +
        Number(ajustado.com3 || 0) +
        Number(ajustado.com4 || 0) +
        Number(base.com5Extra || 0) +
        Number(calculoLoja.com1 || 0);
    }

    const premiacaoEspecial = calcularPremiacaoEspecialFuncionario({
      lojaId: args.lojaId,
      funcionarioNome: funcionario.nome,
      funcionariosDaLoja: resumoFuncionariosLoja,
    });

    if (premiacaoEspecial.total > 0) {
      ajustado.premiacao =
        Number(ajustado.premiacao || 0) +
        Number(premiacaoEspecial.total || 0);
    }

    const quadrante = getQuadrante(
      args.lojaId,
      funcionario.funcao,
      args.ano,
      args.mes,
      tipoMetaEfetivo
    );

    const trocaFuncaoMes = trocaPorFuncionario.get(funcionarioId) || null;
    let descontoFolhaProporcional: number | null = null;

    if (trocaFuncaoMes) {
      if (String(trocaFuncaoMes.funcaoAnterior) === "recepcionista") {
        const configRecepcao = getRecepcaoConfig(
          funcionario.nome,
          String(args.lojaId)
        );
        const comissaoAnterior = Number(
          (
            Number(trocaFuncaoMes.quantidadeAnterior1 || 0) *
              Number(configRecepcao.valorVenda || 0) +
            ([3, 4].includes(args.lojaId)
              ? Number(trocaFuncaoMes.quantidadeAnterior2 || 0) *
                Number(configRecepcao.valorEntrada || 0)
              : 0)
          ).toFixed(2)
        );
        ajustado.totalComissao = Number(
          (Number(ajustado.totalComissao || 0) + comissaoAnterior).toFixed(2)
        );
      }

      const proporcaoNova = calcularProporcaoTrocaFuncaoDashboard(
        trocaFuncaoMes.dataMudanca,
        args.ano,
        args.mes
      );
      if (
        proporcaoNova !== null &&
        funcaoAnteriorUsaFolhaFixaDashboard(
          String(trocaFuncaoMes.funcaoAnterior || ""),
          args.lojaId,
          args.ano,
          args.mes
        ) &&
        ["comissao_semanal", "comissao_mensal", "gerente"].includes(quadrante)
      ) {
        descontoFolhaProporcional = Number(
          (
            (base.inss + base.adiant + base.holerite) *
            proporcaoNova
          ).toFixed(2)
        );
      }
    }

    const boleto = calcularBoletoAjustado({
      quadrante,
      funcao: funcionario.funcao,
      lojaId: args.lojaId,
      funcionarioNome: funcionario.nome,
      totalComissao: Number(ajustado.totalComissao || 0),
      premiacao: Number(ajustado.premiacao || 0),
      vale: Number(ajustado.vale || 0),
      aluguel: base.aluguel,
      inss: base.inss,
      adiant: base.adiant,
      holerite: base.holerite,
      descontoFolhaProporcional,
      boletoOriginal: Number(ajustado.boleto || 0),
    });

    return {
      funcionario,
      quadrante,
      sem1: base.sem1,
      sem2: base.sem2,
      sem3: base.sem3,
      sem4: base.sem4,
      sem5Extra: base.sem5Extra,
      liquidezLojaGerente: base.liquidezLojaGerente,
      totalLiquidez: Number(ajustado.totalLiquidez || 0),
      totalComissao: Number(ajustado.totalComissao || 0),
      premiacao: Number(ajustado.premiacao || 0),
      inss: base.inss,
      adiant: base.adiant,
      holerite: base.holerite,
      boleto: Number(boleto || 0),
    };
  });

  const supervisor = linhas.find(
    (linha) => linha.funcionario.funcao === "supervisor" && args.lojaId !== 5
  );
  const gerente = linhas.find(
    (linha) => linha.funcionario.funcao === "gerente"
  );

  let liquidez = Number(supervisor?.sem1 || 0);

  if (!liquidez && [3, 6].includes(args.lojaId)) {
    liquidez = Number(gerente?.liquidezLojaGerente || 0);
  }

  if (!liquidez) {
    liquidez = linhas
      .filter((linha) =>
        ["vendedor", "mecanico"].includes(linha.funcionario.funcao)
      )
      .reduce(
        (total, linha) =>
          total +
          Number(linha.sem1 || 0) +
          Number(linha.sem2 || 0) +
          Number(linha.sem3 || 0) +
          Number(linha.sem4 || 0) +
          Number((linha as any).sem5Extra || 0),
        0
      );
  }

  const comissaoPremiacao = linhas.reduce(
    (total, linha) =>
      total + Number(linha.totalComissao || 0) + Number(linha.premiacao || 0),
    0
  );

  const adiantamento = linhas.reduce(
    (total, linha) => total + Number(linha.adiant || 0),
    0
  );

  const folhaSemAdiantamento = linhas.reduce(
    (total, linha) =>
      total + Number(linha.inss || 0) + Number(linha.holerite || 0),
    0
  );

  const boletos = linhas.reduce(
    (total, linha) => total + Number(linha.boleto || 0),
    0
  );

  const boletosNegativos = linhas.filter(
    (linha) => Number(linha.boleto || 0) < 0
  ).length;

  const desembolso = adiantamento + folhaSemAdiantamento + boletos;
  const custoLiquidez = liquidez > 0 ? (desembolso / liquidez) * 100 : 0;

  return {
    lojaId: args.lojaId,
    lojaNome: args.lojaNome,
    liquidez,
    comissaoPremiacao,
    adiantamento,
    folhaSemAdiantamento,
    boletos,
    desembolso,
    custoLiquidez,
    funcionarios: funcionarios.length,
    boletosNegativos,
    fechado: Boolean(args.fechamento?.fechado),
    fechadoPorNome: args.fechamento?.fechadoPorNome || null,
    fechadoEm: args.fechamento?.fechadoEm || null,
  };
}

function KpiCard(props: {
  titulo: string;
  valor: string;
  subtitulo: string;
  icon: React.ComponentType<{ className?: string }>;
  destaque?: "yellow" | "green" | "red" | "blue";
}) {
  const Icon = props.icon;
  const cor =
    props.destaque === "green"
      ? "text-emerald-300"
      : props.destaque === "red"
      ? "text-rose-300"
      : props.destaque === "blue"
      ? "text-slate-100"
      : "text-[#F2D675]";

  const glow =
    props.destaque === "green"
      ? "from-emerald-400/10"
      : props.destaque === "red"
      ? "from-rose-400/10"
      : "from-[#D4AF37]/15";

  return (
    <Card className="group relative overflow-hidden rounded-2xl border border-[#D4AF37]/20 bg-gradient-to-br from-[#121212] via-[#0b0b0b] to-[#050505] shadow-[0_18px_55px_rgba(0,0,0,0.38)] transition-all duration-300 hover:-translate-y-1 hover:border-[#D4AF37]/55 hover:shadow-[0_22px_70px_rgba(212,175,55,0.12)]">
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${glow} via-transparent to-transparent opacity-70`} />
      <div className="pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full bg-[#D4AF37]/10 blur-3xl transition-all duration-300 group-hover:bg-[#D4AF37]/20" />
      <CardContent className="relative p-5">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#b9b1a0]">{props.titulo}</p>
            <div className="mt-2 h-px w-8 bg-gradient-to-r from-[#D4AF37] to-transparent" />
          </div>
          <div className="rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/[0.07] p-2.5 shadow-inner shadow-[#D4AF37]/5">
            <Icon className={`h-5 w-5 ${cor}`} />
          </div>
        </div>
        <p className={`text-[1.65rem] font-black tracking-[-0.03em] ${cor}`}>
          {props.valor}
        </p>
        <p className="mt-2 min-h-[32px] text-xs leading-5 text-[#79756d]">{props.subtitulo}</p>
      </CardContent>
    </Card>
  );
}

export default function Home() {
  const { user, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const agora = new Date();
  const [escopo, setEscopo] = useState("grupo");
  const [ano, setAno] = useState(String(agora.getFullYear()));
  const [mes, setMes] = useState(String(agora.getMonth() + 1));
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginSenha, setLoginSenha] = useState("");
  const [loginErro, setLoginErro] = useState("");

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: () => {
      window.location.href = "/";
    },
    onError: (error) => {
      setLoginErro(error?.message || "Não foi possível entrar. Confira email e senha.");
    },
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      window.location.href = "/";
    },
  });

  const anoNumero = Number(ano);
  const mesNumero = Number(mes);

  useEffect(() => {
    if (!user) {
      setCarregando(false);
      setDashboard(null);
      return;
    }

    let cancelado = false;

    async function carregar() {
      setCarregando(true);
      setErro("");

      try {
        const lojasSelecionadas =
          escopo === "grupo"
            ? LOJAS
            : LOJAS.filter((loja) => loja.id === Number(escopo));

        const resumoSupervisor =
          await utils.folhaPagamento.getResumoSupervisorMensal.fetch({
            ano: anoNumero,
            mes: mesNumero,
          });

        const resumos = await Promise.all(
          lojasSelecionadas.map(async (loja) => {
            const [funcionarios, folhaBase, extras, fechamento, trocasFuncao] =
              await Promise.all([
                utils.funcionarios.listByLoja.fetch({ lojaId: loja.id }),
                utils.folhaPagamento.getBaseByLojaAnoMes.fetch({
                  lojaId: loja.id,
                  ano: anoNumero,
                  mes: mesNumero,
                }),
                utils.folhaExtras.getByLojaAnoMes.fetch({
                  lojaId: loja.id,
                  ano: anoNumero,
                  mes: mesNumero,
                }),
                utils.folhaFechamento.getStatus.fetch({
                  lojaId: loja.id,
                  ano: anoNumero,
                  mes: mesNumero,
                }),
                utils.funcionarios.trocasByLojaCompetencia.fetch({
                  lojaId: loja.id,
                  ano: anoNumero,
                  mes: mesNumero,
                }),
              ]);

            return calcularResumoLoja({
              lojaId: loja.id,
              lojaNome: loja.nome,
              ano: anoNumero,
              mes: mesNumero,
              funcionarios: (funcionarios || []) as any[],
              folhaBase: (folhaBase || []) as any[],
              extras,
              fechamento,
              resumoSupervisor,
              trocasFuncao: (trocasFuncao || []) as any[],
            });
          })
        );

        if (!cancelado) {
          setDashboard({ lojas: resumos, carregadoEm: new Date() });
        }
      } catch (error: any) {
        console.error("Erro ao carregar dashboard", error);
        if (!cancelado) {
          setErro(error?.message || "Não foi possível carregar os dados do dashboard.");
          setDashboard(null);
        }
      } finally {
        if (!cancelado) setCarregando(false);
      }
    }

    void carregar();

    return () => {
      cancelado = true;
    };
  }, [user, escopo, anoNumero, mesNumero, utils]);

  const totais = useMemo(() => {
    const lojas = dashboard?.lojas || [];
    return lojas.reduce(
      (acc, loja) => {
        acc.liquidez += loja.liquidez;
        acc.comissaoPremiacao += loja.comissaoPremiacao;
        acc.adiantamento += loja.adiantamento;
        acc.folhaSemAdiantamento += loja.folhaSemAdiantamento;
        acc.boletos += loja.boletos;
        acc.desembolso += loja.desembolso;
        acc.funcionarios += loja.funcionarios;
        acc.boletosNegativos += loja.boletosNegativos;
        if (loja.fechado) acc.fechadas += 1;
        return acc;
      },
      {
        liquidez: 0,
        comissaoPremiacao: 0,
        adiantamento: 0,
        folhaSemAdiantamento: 0,
        boletos: 0,
        desembolso: 0,
        funcionarios: 0,
        boletosNegativos: 0,
        fechadas: 0,
      }
    );
  }, [dashboard]);

  const custoLiquidezGeral =
    totais.liquidez > 0 ? (totais.desembolso / totais.liquidez) * 100 : 0;

  const lojasAbertas = (dashboard?.lojas || []).filter((loja) => !loja.fechado);

  const chartData = useMemo(() => {
    const lojas = dashboard?.lojas || [];

    if (escopo === "grupo") {
      return lojas.map((loja) => ({
        nome: loja.lojaNome.replace("ACI Promoções", "ACI"),
        valor: Number(loja.desembolso.toFixed(2)),
      }));
    }

    const loja = lojas[0];
    if (!loja) return [];

    return [
      { nome: "Adiant.", valor: loja.adiantamento },
      { nome: "Folha", valor: loja.folhaSemAdiantamento },
      { nome: "Boletos", valor: loja.boletos },
    ];
  }, [dashboard, escopo]);

  const menu = [
    { label: "Dashboard", icon: LayoutDashboard, rota: "/", ativo: true },
    { label: "Folha de Pagamento", icon: WalletCards, rota: "/folha-pagamento" },
    { label: "RH / Funcionários", icon: Users, rota: "/funcionarios" },
    { label: "Análise de Funcionários", icon: UserRoundSearch, rota: "/analise-funcionario" },
    { label: "Usuários", icon: ShieldCheck, rota: "/usuarios", adminOnly: true },
  ];

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <Loader2 className="h-8 w-8 animate-spin text-[#F2D675]" />
      </div>
    );
  }

  if (!user) {
    async function entrar(event: React.FormEvent<HTMLFormElement>) {
      event.preventDefault();
      const email = loginEmail.trim().toLowerCase();
      const password = loginSenha;

      if (!email || !password) {
        setLoginErro("Informe email e senha.");
        return;
      }

      setLoginErro("");
      await loginMutation.mutateAsync({ email, password }).catch(() => undefined);
    }

    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050505] px-4 text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_10%,rgba(212,175,55,0.14),transparent_34%),radial-gradient(circle_at_10%_90%,rgba(212,175,55,0.05),transparent_28%)]" />

        <Card className="relative w-full max-w-md border-[#D4AF37]/20 bg-[#0a0a0a]/95 shadow-[0_30px_90px_rgba(0,0,0,0.65)] backdrop-blur-xl">
          <CardContent className="p-7 sm:p-8">
            <div className="mb-7 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#D4AF37]/30 bg-[#D4AF37]/10">
                <ShieldCheck className="h-7 w-7 text-[#F2D675]" />
              </div>
              <h1 className="text-2xl font-black tracking-tight text-[#F2D675]">Acesso ao sistema</h1>
              <p className="mt-2 text-sm text-[#8f8a80]">Entre com o usuário cadastrado para acessar a gestão.</p>
            </div>

            <form onSubmit={entrar} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-[#b5ad9b]">Email</label>
                <Input
                  type="email"
                  autoComplete="email"
                  value={loginEmail}
                  onChange={(event) => setLoginEmail(event.target.value)}
                  placeholder="usuario@empresa.com"
                  className="h-12 border-[#D4AF37]/20 bg-[#111111] text-white placeholder:text-[#5f5b54] focus-visible:ring-[#D4AF37]/40"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-[#b5ad9b]">Senha</label>
                <Input
                  type="password"
                  autoComplete="current-password"
                  value={loginSenha}
                  onChange={(event) => setLoginSenha(event.target.value)}
                  placeholder="Digite sua senha"
                  className="h-12 border-[#D4AF37]/20 bg-[#111111] text-white placeholder:text-[#5f5b54] focus-visible:ring-[#D4AF37]/40"
                />
              </div>

              {loginErro && (
                <div className="rounded-xl border border-red-500/25 bg-red-950/20 px-4 py-3 text-sm text-red-300">
                  {loginErro}
                </div>
              )}

              <Button
                type="submit"
                disabled={loginMutation.isPending}
                className="h-12 w-full bg-[#D4AF37] font-bold text-black hover:bg-[#E6C760] disabled:opacity-60"
              >
                {loginMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Entrando...
                  </>
                ) : (
                  "Entrar"
                )}
              </Button>
            </form>

            <p className="mt-5 text-center text-xs text-[#68635b]">
              O acesso é liberado somente para usuários cadastrados e ativos.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#050505] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_82%_8%,rgba(212,175,55,0.10),transparent_28%),radial-gradient(circle_at_12%_78%,rgba(212,175,55,0.05),transparent_24%)]" />
      <div className="relative flex min-h-screen">
        <aside className="hidden w-[270px] shrink-0 border-r border-[#D4AF37]/15 bg-[#060606]/95 shadow-[18px_0_55px_rgba(0,0,0,0.28)] backdrop-blur-xl xl:flex xl:flex-col">
          <div className="border-b border-[#D4AF37]/15 px-6 py-7">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#D4AF37]/30 bg-gradient-to-br from-[#D4AF37]/20 to-transparent shadow-[0_0_35px_rgba(212,175,55,0.10)]">
                <Gauge className="h-5 w-5 text-[#F2D675]" />
              </div>
              <div>
                <p className="text-lg font-black tracking-tight text-[#F2D675]">
                  Gestão Executiva
                </p>
                <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6f6a5f]">Folha & Performance</p>
              </div>
            </div>
          </div>

          <nav className="flex-1 space-y-2 p-4">
            {menu
              .filter(
                (item) =>
                  !item.adminOnly || ["admin", "gestor"].includes(String(user.role))
              )
              .map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    onClick={() => navigate(item.rota)}
                    className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold transition-all ${
                      item.ativo
                        ? "border border-[#D4AF37]/35 bg-gradient-to-r from-[#D4AF37]/14 to-[#D4AF37]/5 text-[#F2D675] shadow-[inset_3px_0_0_#D4AF37]"
                        : "text-[#8c877d] hover:bg-[#D4AF37]/[0.06] hover:text-[#F2D675]"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
          </nav>

          <div className="border-t border-[#D4AF37]/15 p-4">
            <div className="rounded-2xl border border-[#D4AF37]/15 bg-gradient-to-br from-[#111111] to-[#080808] p-4">
              <p className="truncate text-sm font-bold text-white">
                {user.name || user.email}
              </p>
              <p className="mt-1 text-xs uppercase tracking-wider text-[#D4AF37]">
                {String(user.role || "usuário")}
              </p>
              <Button
                variant="ghost"
                onClick={() => logoutMutation.mutate()}
                className="mt-3 w-full justify-start text-gray-400 hover:bg-red-500/10 hover:text-rose-300"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sair
              </Button>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="sticky top-0 z-40 border-b border-[#D4AF37]/15 bg-[#050505]/90 backdrop-blur-2xl">
            <div className="px-5 py-5 lg:px-8">
              <div className="flex flex-col gap-5 2xl:flex-row 2xl:items-center 2xl:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#C9A94B]">
                    <Gauge className="h-4 w-4" />
                    Painel executivo
                  </div>
                  <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-2">
                    <h1 className="text-3xl font-black tracking-[-0.035em] text-white lg:text-4xl">
                      Visão Financeira da Folha
                    </h1>
                    <span className="mb-1 rounded-full border border-[#D4AF37]/20 bg-[#D4AF37]/[0.06] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#D8C078]">
                      Executivo
                    </span>
                  </div>
                  <p className="mt-2 max-w-2xl text-sm text-[#79756d]">
                    Custos, pagamentos e fechamento das unidades em uma única visão gerencial.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <Select value={escopo} onValueChange={setEscopo}>
                    <SelectTrigger className="min-w-[190px] border-[#D4AF37]/25 bg-[#0c0c0c] text-white shadow-sm shadow-black/30">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-[#D4AF37]/20 bg-[#0c0c0c] text-white">
                      <SelectItem value="grupo">Grupo todo</SelectItem>
                      {LOJAS.map((loja) => (
                        <SelectItem key={loja.id} value={String(loja.id)}>
                          {loja.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={mes} onValueChange={setMes}>
                    <SelectTrigger className="border-[#D4AF37]/25 bg-[#0c0c0c] text-white shadow-sm shadow-black/30">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-[#D4AF37]/20 bg-[#0c0c0c] text-white">
                      {MESES.map((nome, index) => (
                        <SelectItem key={nome} value={String(index + 1)}>
                          {nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={ano} onValueChange={setAno}>
                    <SelectTrigger className="border-[#D4AF37]/25 bg-[#0c0c0c] text-white shadow-sm shadow-black/30">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-[#D4AF37]/20 bg-[#0c0c0c] text-white">
                      {[2025, 2026, 2027, 2028].map((item) => (
                        <SelectItem key={item} value={String(item)}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </header>

          <div className="space-y-6 px-5 py-7 lg:px-8 2xl:space-y-7">
            <div className="flex gap-2 overflow-x-auto pb-1 xl:hidden">
              {menu
                .filter(
                  (item) =>
                    !item.adminOnly || ["admin", "gestor"].includes(String(user.role))
                )
                .map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.label}
                      onClick={() => navigate(item.rota)}
                      className={`flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${
                        item.ativo
                          ? "border-[#D4AF37]/30 bg-[#D4AF37]/10 text-[#F2D675]"
                          : "border-white/10 bg-[#101827] text-gray-300"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </button>
                  );
                })}
            </div>

            {erro && (
              <div className="rounded-2xl border border-rose-500/25 bg-rose-950/15 px-4 py-3 text-sm text-rose-300">
                {erro}
              </div>
            )}

            {carregando ? (
              <div className="flex min-h-[420px] items-center justify-center rounded-3xl border border-[#D4AF37]/15 bg-gradient-to-br from-[#111111] to-[#080808]">
                <div className="text-center">
                  <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#F2D675]" />
                  <p className="mt-3 text-sm text-gray-500">
                    Consolidando dados da folha...
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#9c8952]">Resumo financeiro</p>
                    <h2 className="mt-1 text-xl font-black tracking-tight text-white">Indicadores da competência</h2>
                  </div>
                  <div className="rounded-full border border-[#D4AF37]/15 bg-[#D4AF37]/[0.04] px-3 py-1.5 text-xs text-[#8f897d]">
                    {escopo === "grupo" ? "Visão consolidada do grupo" : dashboard?.lojas?.[0]?.lojaNome || "Unidade"} • {MESES[mesNumero - 1]} {anoNumero}
                  </div>
                </div>

                <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
                  <KpiCard
                    titulo="Adiantamentos"
                    valor={compactMoney(totais.adiantamento)}
                    subtitulo="Valor lançado para pagamento antecipado"
                    icon={Clock3}
                    destaque="red"
                  />
                  <KpiCard
                    titulo="Folha sem adiantamento"
                    valor={compactMoney(totais.folhaSemAdiantamento)}
                    subtitulo="INSS + holerite, sem somar o adiantamento"
                    icon={FileText}
                    destaque="blue"
                  />
                  <KpiCard
                    titulo="Total de boletos"
                    valor={compactMoney(totais.boletos)}
                    subtitulo="Total calculado nos boletos da competência"
                    icon={ReceiptText}
                    destaque="green"
                  />
                  <KpiCard
                    titulo="Comissão + premiação"
                    valor={compactMoney(totais.comissaoPremiacao)}
                    subtitulo="Custo variável calculado pela folha"
                    icon={CircleDollarSign}
                  />
                  <KpiCard
                    titulo="Desembolso total"
                    valor={compactMoney(totais.desembolso)}
                    subtitulo="Adiantamento + folha + boletos"
                    icon={TrendingUp}
                    destaque="green"
                  />
                  <KpiCard
                    titulo="Custo / liquidez"
                    valor={`${custoLiquidezGeral.toLocaleString("pt-BR", {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    })}%`}
                    subtitulo={`${totais.funcionarios} colaboradores na competência`}
                    icon={BarChart3}
                  />
                </section>

                <section className="grid gap-4 2xl:grid-cols-[1.65fr_1fr]">
                  <Card className="border-[#D4AF37]/20 bg-gradient-to-br from-[#111111] via-[#0b0b0b] to-[#060606] shadow-[0_18px_55px_rgba(0,0,0,0.32)]">
                    <CardContent className="p-5 lg:p-6">
                      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                          <p className="text-lg font-bold text-white">
                            {escopo === "grupo"
                              ? "Desembolso por unidade"
                              : "Composição do desembolso"}
                          </p>
                          <p className="mt-1 text-sm text-gray-500">
                            {MESES[mesNumero - 1]} de {anoNumero}
                          </p>
                        </div>
                        <p className="text-xs text-gray-600">
                          Atualizado {dashboard?.carregadoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>

                      <div className="h-[310px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="4 4" stroke="#26221b" vertical={false} />
                            <XAxis dataKey="nome" stroke="#777164" tick={{ fontSize: 11 }} />
                            <YAxis
                              stroke="#777164"
                              tick={{ fontSize: 11 }}
                              tickFormatter={(value) => compactMoney(Number(value)).replace("R$ ", "")}
                            />
                            <Tooltip
                              cursor={{ fill: "rgba(255,255,255,0.03)" }}
                              contentStyle={{
                                backgroundColor: "#090909",
                                border: "1px solid rgba(212,175,55,0.38)",
                                borderRadius: "12px",
                              }}
                              formatter={(value: any) => [money(Number(value)), "Valor"]}
                            />
                            <defs>
                              <linearGradient id="goldBar" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#F2D675" />
                                <stop offset="55%" stopColor="#D4AF37" />
                                <stop offset="100%" stopColor="#8A6B1F" />
                              </linearGradient>
                            </defs>
                            <Bar dataKey="valor" fill="url(#goldBar)" radius={[9, 9, 2, 2]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-[#D4AF37]/20 bg-gradient-to-br from-[#111111] via-[#0b0b0b] to-[#060606] shadow-[0_18px_55px_rgba(0,0,0,0.32)]">
                    <CardContent className="p-5 lg:p-6">
                      <div className="mb-5 flex items-start justify-between">
                        <div>
                          <p className="text-lg font-bold text-white">Status do fechamento</p>
                          <p className="mt-1 text-sm text-gray-500">
                            {totais.fechadas} de {dashboard?.lojas.length || 0} competências fechadas
                          </p>
                        </div>
                        <CalendarDays className="h-5 w-5 text-[#F2D675]" />
                      </div>

                      <div className="space-y-2.5">
                        {(dashboard?.lojas || []).map((loja) => (
                          <button
                            key={loja.lojaId}
                            onClick={() => navigate("/folha-pagamento")}
                            className="flex w-full items-center justify-between rounded-2xl border border-white/[0.06] bg-white/[0.025] px-4 py-3 text-left transition hover:border-[#D4AF37]/25 hover:bg-black/30"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-white">
                                {loja.lojaNome}
                              </p>
                              <p className="mt-0.5 text-xs text-gray-600">
                                {loja.funcionarios} colaboradores
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span
                                className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
                                  loja.fechado
                                    ? "border border-emerald-400/15 bg-emerald-500/10 text-emerald-300"
                                    : "border border-rose-400/15 bg-rose-500/10 text-rose-300"
                                }`}
                              >
                                {loja.fechado ? "Fechado" : "Aberto"}
                              </span>
                              <ChevronRight className="h-4 w-4 text-gray-600" />
                            </div>
                          </button>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </section>

                <section className="grid gap-4 xl:grid-cols-[1fr_2fr]">
                  <Card className="border-[#D4AF37]/20 bg-gradient-to-br from-[#111111] via-[#0b0b0b] to-[#060606] shadow-[0_18px_55px_rgba(0,0,0,0.32)]">
                    <CardContent className="p-5 lg:p-6">
                      <p className="text-lg font-bold text-white">Atenção gerencial</p>
                      <div className="mt-5 space-y-3">
                        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4">
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-sm text-gray-400">Competências abertas</span>
                            <span className={lojasAbertas.length > 0 ? "font-black text-red-400" : "font-black text-emerald-400"}>
                              {lojasAbertas.length}
                            </span>
                          </div>
                          {lojasAbertas.length > 0 && (
                            <p className="mt-2 text-xs leading-relaxed text-gray-600">
                              {lojasAbertas.map((loja) => loja.lojaNome).join(" • ")}
                            </p>
                          )}
                        </div>

                        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4">
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-sm text-gray-400">Boletos negativos</span>
                            <span className={totais.boletosNegativos > 0 ? "font-black text-red-400" : "font-black text-emerald-400"}>
                              {totais.boletosNegativos}
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={() => navigate("/folha-pagamento")}
                          className="flex w-full items-center justify-between rounded-xl border border-[#D4AF37]/25 bg-[#D4AF37]/10 px-4 py-4 text-left text-sm font-bold text-[#F2D675] transition hover:bg-[#D4AF37]/15"
                        >
                          Abrir Folha de Pagamento
                          <ChevronRight className="h-5 w-5" />
                        </button>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="overflow-hidden border-[#D4AF37]/20 bg-gradient-to-br from-[#111111] via-[#0b0b0b] to-[#060606] shadow-[0_18px_55px_rgba(0,0,0,0.32)]">
                    <CardContent className="p-0">
                      <div className="flex items-center justify-between border-b border-white/5 px-5 py-5 lg:px-6">
                        <div>
                          <p className="text-lg font-bold text-white">Resumo por cidade</p>
                          <p className="mt-1 text-sm text-gray-500">
                            Comparativo financeiro da competência selecionada
                          </p>
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[900px] text-sm">
                          <thead>
                            <tr className="border-b border-[#D4AF37]/10 bg-[#D4AF37]/[0.025] text-left text-[11px] uppercase tracking-wider text-gray-600">
                              <th className="px-5 py-3 lg:px-6">Unidade</th>
                              <th className="px-4 py-3 text-right">Adiantamento</th>
                              <th className="px-4 py-3 text-right">Folha s/ adiant.</th>
                              <th className="px-4 py-3 text-right">Boletos</th>
                              <th className="px-4 py-3 text-right">Desembolso</th>
                              <th className="px-4 py-3 text-right">Custo / Liquidez</th>
                              <th className="px-5 py-3 text-center lg:px-6">Fechamento</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(dashboard?.lojas || []).map((loja) => (
                              <tr key={loja.lojaId} className="border-b border-white/[0.04] transition hover:bg-[#D4AF37]/[0.025]">
                                <td className="px-5 py-4 font-bold text-white lg:px-6">
                                  {loja.lojaNome}
                                </td>
                                <td className="px-4 py-4 text-right text-rose-300">
                                  {money(loja.adiantamento)}
                                </td>
                                <td className="px-4 py-4 text-right text-slate-200">
                                  {money(loja.folhaSemAdiantamento)}
                                </td>
                                <td className="px-4 py-4 text-right text-emerald-300">
                                  {money(loja.boletos)}
                                </td>
                                <td className="px-4 py-4 text-right font-black text-[#F2D675]">
                                  {money(loja.desembolso)}
                                </td>
                                <td className="px-4 py-4 text-right text-gray-300">
                                  {loja.custoLiquidez.toLocaleString("pt-BR", {
                                    minimumFractionDigits: 1,
                                    maximumFractionDigits: 1,
                                  })}%
                                </td>
                                <td className="px-5 py-4 text-center lg:px-6">
                                  <span
                                    className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
                                      loja.fechado
                                        ? "border border-emerald-400/15 bg-emerald-500/10 text-emerald-300"
                                        : "border border-rose-400/15 bg-rose-500/10 text-rose-300"
                                    }`}
                                  >
                                    {loja.fechado ? "Fechado" : "Aberto"}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </section>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
