import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  boolean,
  json,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow with role-based access control.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  passwordHash: varchar("passwordHash", { length: 255 }),
  isActive: boolean("isActive").default(true),
  role: mysqlEnum("role", ["user", "admin", "gestor", "rh", "compras", "financeiro"]).default("user").notNull(),
  lojaId: int("lojaId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Lojas (4 locations)
 */
export const lojas = mysqlTable("lojas", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 100 }).notNull(),
  metaTotal: decimal("metaTotal", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Loja = typeof lojas.$inferSelect;
export type InsertLoja = typeof lojas.$inferInsert;

/**
 * Funcionarios (employee records with history)
 */
export const funcionarios = mysqlTable("funcionarios", {
  id: int("id").autoincrement().primaryKey(),
  lojaId: int("lojaId").notNull(),
  nome: varchar("nome", { length: 150 }).notNull(),
  funcao: mysqlEnum("funcao", [
    "mecanico",
    "vendedor",
    "consultor_vendas",
    "alinhador",
    "recepcionista",
    "auxiliar_estoque",
    "lider_estoque",
    "auxiliar_caixa",
    "administrativo",
  ]).notNull(),
  dataAdmissao: timestamp("dataAdmissao").notNull(),
  dataDesligamento: timestamp("dataDesligamento"),
  motivoDesligamento: varchar("motivoDesligamento", { length: 100 }),
  deveEmpresa: decimal("deveEmpresa", { precision: 12, scale: 2 }).default("0"),
  status: mysqlEnum("status", ["ativo", "inativo"]).default("ativo").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Funcionario = typeof funcionarios.$inferSelect;
export type InsertFuncionario = typeof funcionarios.$inferInsert;

/**
 * Metas (commission tiers by function and location)
 */
export const metas = mysqlTable("metas", {
  id: int("id").autoincrement().primaryKey(),
  lojaId: int("lojaId").notNull(),
  funcao: varchar("funcao", { length: 50 }).notNull(),
  ano: int("ano").notNull(),
  mes: int("mes").notNull(),
  faixas: json("faixas").notNull(), // [{liquidezMinima, percentualComissao}, ...]
  salarioFixo: decimal("salarioFixo", { precision: 12, scale: 2 }),
  dataAlteracao: timestamp("dataAlteracao").defaultNow(),
  aplicacaoEm: mysqlEnum("aplicacaoEm", ["imediata", "mes_atual", "proximo_mes"]).default("proximo_mes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Meta = typeof metas.$inferSelect;
export type InsertMeta = typeof metas.$inferInsert;

/**
 * Folha de Pagamento (weekly liquidity and commissions)
 */
export const folhaPagamento = mysqlTable("folha_pagamento", {
  id: int("id").autoincrement().primaryKey(),
  funcionarioId: int("funcionarioId").notNull(),
  lojaId: int("lojaId").notNull(),
  contaBancariaId: int("contaBancariaId"),
  ano: int("ano").notNull(),
  mes: int("mes").notNull(),
  semana: int("semana").notNull(),
  liquidez: decimal("liquidez", { precision: 12, scale: 2 }).notNull(),
  percentualComissao: decimal("percentualComissao", { precision: 5, scale: 2 }).notNull(),
  valorComissao: decimal("valorComissao", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FolhaPagamento = typeof folhaPagamento.$inferSelect;
export type InsertFolhaPagamento = typeof folhaPagamento.$inferInsert;

/**
 * Premiacao (bonuses)
 */
export const premiacoes = mysqlTable("premiacao", {
  id: int("id").autoincrement().primaryKey(),
  funcionarioId: int("funcionarioId").notNull(),
  lojaId: int("lojaId").notNull(),
  ano: int("ano").notNull(),
  mes: int("mes").notNull(),
  descricao: varchar("descricao", { length: 200 }).notNull(),
  valor: decimal("valor", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Premiacao = typeof premiacoes.$inferSelect;
export type InsertPremiacao = typeof premiacoes.$inferInsert;

/**
 * Vales (simple and installment loans)
 */
export const vales = mysqlTable("vales", {
  id: int("id").autoincrement().primaryKey(),
  funcionarioId: int("funcionarioId").notNull(),
  lojaId: int("lojaId").notNull(),
  descricao: varchar("descricao", { length: 200 }).notNull(),
  valorTotal: decimal("valorTotal", { precision: 12, scale: 2 }).notNull(),
  valorParcela: decimal("valorParcela", { precision: 12, scale: 2 }).notNull(),
  parcelas: int("parcelas").notNull(),
  parcelaAtual: int("parcelaAtual").default(1),
  ano: int("ano").notNull(),
  mes: int("mes").notNull(),
  mesOrigem: int("mesOrigem").notNull(),
  tipo: mysqlEnum("tipo", ["simples", "parcelado"]).notNull(),
  status: mysqlEnum("status", ["ativo", "cancelado"]).default("ativo"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Vale = typeof vales.$inferSelect;
export type InsertVale = typeof vales.$inferInsert;

/**
 * Descontos (discounts: aluguel, INSS, adiantamento, holerite)
 */
export const descontos = mysqlTable("descontos", {
  id: int("id").autoincrement().primaryKey(),
  funcionarioId: int("funcionarioId").notNull(),
  lojaId: int("lojaId").notNull(),
  tipo: mysqlEnum("tipo", ["aluguel", "inss", "adiantamento", "holerite"]).notNull(),
  valor: decimal("valor", { precision: 12, scale: 2 }).notNull(),
  ano: int("ano").notNull(),
  mes: int("mes").notNull(),
  descricao: varchar("descricao", { length: 200 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Desconto = typeof descontos.$inferSelect;
export type InsertDesconto = typeof descontos.$inferInsert;

/**
 * Observacoes (notes on payroll)
 */
export const observacoes = mysqlTable("observacoes", {
  id: int("id").autoincrement().primaryKey(),
  funcionarioId: int("funcionarioId").notNull(),
  lojaId: int("lojaId").notNull(),
  ano: int("ano").notNull(),
  mes: int("mes").notNull(),
  texto: text("texto").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Observacao = typeof observacoes.$inferSelect;
export type InsertObservacao = typeof observacoes.$inferInsert;

/**
 * Tarefas (task management)
 */
export const tarefas = mysqlTable("tarefas", {
  id: int("id").autoincrement().primaryKey(),
  usuarioId: int("usuarioId").notNull(),
  titulo: varchar("titulo", { length: 200 }).notNull(),
  descricao: text("descricao"),
  prioridade: mysqlEnum("prioridade", ["vermelho", "amarelo", "verde"]).notNull(),
  status: mysqlEnum("status", ["pendente", "concluida", "cancelada"]).default("pendente"),
  dataVencimento: timestamp("dataVencimento"),
  dataExecucao: timestamp("dataExecucao"),
  horarioTick: timestamp("horarioTick"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Tarefa = typeof tarefas.$inferSelect;
export type InsertTarefa = typeof tarefas.$inferInsert;

/**
 * Tarefas Alertas (automatic alerts for HR)
 */
export const tarefasAlertas = mysqlTable("tarefas_alertas", {
  id: int("id").autoincrement().primaryKey(),
  usuarioRhId: int("usuarioRhId").notNull(),
  funcionarioId: int("funcionarioId").notNull(),
  tipo: varchar("tipo", { length: 50 }).notNull(),
  descricao: text("descricao"),
  dataAlerta: timestamp("dataAlerta").notNull(),
  dataVencimento: timestamp("dataVencimento"),
  lido: boolean("lido").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TarefaAlerta = typeof tarefasAlertas.$inferSelect;
export type InsertTarefaAlerta = typeof tarefasAlertas.$inferInsert;

/**
 * Feedbacks (experience period feedback)
 */
export const feedbacks = mysqlTable("feedbacks", {
  id: int("id").autoincrement().primaryKey(),
  funcionarioId: int("funcionarioId").notNull(),
  lojaId: int("lojaId").notNull(),
  dataFeedback: timestamp("dataFeedback").notNull(),
  proximoFeedback: timestamp("proximoFeedback"),
  etapa: mysqlEnum("etapa", ["primeira_45d", "segunda_45d", "finalizado"]).notNull(),
  observacoes: text("observacoes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Feedback = typeof feedbacks.$inferSelect;
export type InsertFeedback = typeof feedbacks.$inferInsert;

/**
 * Ferias (vacation management)
 */
export const ferias = mysqlTable("ferias", {
  id: int("id").autoincrement().primaryKey(),
  funcionarioId: int("funcionarioId").notNull(),
  lojaId: int("lojaId").notNull(),
  dataInicio: timestamp("dataInicio").notNull(),
  dataFim: timestamp("dataFim").notNull(),
  diasUteis: int("diasUteis"),
  status: mysqlEnum("status", ["agendada", "em_gozo", "concluida", "cancelada"]).default("agendada"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Feria = typeof ferias.$inferSelect;
export type InsertFeria = typeof ferias.$inferInsert;

/**
 * Rescisoes (termination management)
 */
export const rescisoes = mysqlTable("rescisoes", {
  id: int("id").autoincrement().primaryKey(),
  funcionarioId: int("funcionarioId").notNull(),
  lojaId: int("lojaId").notNull(),
  tipo: mysqlEnum("tipo", ["demissao", "pedido_contas"]).notNull(),
  dataRescisao: timestamp("dataRescisao").notNull(),
  dataPagamento: timestamp("dataPagamento"),
  dataFimAvisoPrevio: timestamp("dataFimAvisoPrevio"),
  status: mysqlEnum("status", ["pendente", "pago", "cancelado"]).default("pendente"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Rescisao = typeof rescisoes.$inferSelect;
export type InsertRescisao = typeof rescisoes.$inferInsert;

/**
 * Compras (purchase tracking)
 */
export const compras = mysqlTable("compras", {
  id: int("id").autoincrement().primaryKey(),
  usuarioComprasId: int("usuarioComprasId").notNull(),
  lojaId: int("lojaId").notNull(),
  fornecedor: varchar("fornecedor", { length: 150 }).notNull(),
  categoria: mysqlEnum("categoria", ["pneus", "insumos_estoque", "outros"]).notNull(),
  descricao: varchar("descricao", { length: 200 }),
  valor: decimal("valor", { precision: 12, scale: 2 }).notNull(),
  ano: int("ano").notNull(),
  mes: int("mes").notNull(),
  data: timestamp("data").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Compra = typeof compras.$inferSelect;
export type InsertCompra = typeof compras.$inferInsert;

/**
 * Logs de Atividade (activity logs for manager)
 */
export const logsAtividade = mysqlTable("logs_atividade", {
  id: int("id").autoincrement().primaryKey(),
  usuarioId: int("usuarioId").notNull(),
  tarefaId: int("tarefaId"),
  horarioConclusao: timestamp("horarioConclusao").notNull(),
  detalhes: text("detalhes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type LogAtividade = typeof logsAtividade.$inferSelect;
export type InsertLogAtividade = typeof logsAtividade.$inferInsert;

/**
 * Contas Bancarias (bank account management)
 */
export const contasBancarias = mysqlTable("contas_bancarias", {
  id: int("id").autoincrement().primaryKey(),
  lojaId: int("lojaId"),
  banco: mysqlEnum("banco", ["itau", "caixa", "santander"]).notNull(),
  nomeConta: varchar("nomeConta", { length: 100 }).notNull(),
  agencia: varchar("agencia", { length: 10 }).notNull(),
  conta: varchar("conta", { length: 20 }).notNull(),
  tipoConta: mysqlEnum("tipoConta", ["corrente", "poupanca"]).notNull(),
  saldo: decimal("saldo", { precision: 12, scale: 2 }).default("0"),
  ativa: boolean("ativa").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ContaBancaria = typeof contasBancarias.$inferSelect;
export type InsertContaBancaria = typeof contasBancarias.$inferInsert;

/**
 * Extratos Bancarios (imported bank statements)
 */
export const extratosBancarios = mysqlTable("extratos_bancarios", {
  id: int("id").autoincrement().primaryKey(),
  contaBancariaId: int("contaBancariaId").notNull(),
  dataImportacao: timestamp("dataImportacao").defaultNow(),
  dataInicio: timestamp("dataInicio").notNull(),
  dataFim: timestamp("dataFim").notNull(),
  saldoInicial: decimal("saldoInicial", { precision: 12, scale: 2 }),
  saldoFinal: decimal("saldoFinal", { precision: 12, scale: 2 }),
  transacoes: json("transacoes"), // [{data, descricao, valor, tipo}, ...]
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ExtratoBancario = typeof extratosBancarios.$inferSelect;
export type InsertExtratoBancario = typeof extratosBancarios.$inferInsert;

/**
 * Conciliacao Bancaria (reconciliation records)
 */
export const conciliacao = mysqlTable("conciliacao_bancaria", {
  id: int("id").autoincrement().primaryKey(),
  contaBancariaId: int("contaBancariaId").notNull(),
  ano: int("ano").notNull(),
  mes: int("mes").notNull(),
  dataInicio: timestamp("dataInicio").notNull(),
  dataFim: timestamp("dataFim").notNull(),
  transacoesExtrato: int("transacoesExtrato"),
  transacoesLancadas: int("transacoesLancadas"),
  transacoesConciliadas: int("transacoesConciliadas"),
  transacoesDiscrepancia: int("transacoesDiscrepancia"),
  status: mysqlEnum("status", ["pendente", "conciliada", "parcial"]).default("pendente"),
  usuarioId: int("usuarioId"),
  dataConciliacao: timestamp("dataConciliacao"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Conciliacao = typeof conciliacao.$inferSelect;
export type InsertConciliacao = typeof conciliacao.$inferInsert;

/**
 * Conciliacao Detalhes (reconciliation details)
 */
export const conciliacaoDetalhes = mysqlTable("conciliacao_detalhes", {
  id: int("id").autoincrement().primaryKey(),
  conciliacaoId: int("conciliacaoId").notNull(),
  transacaoExtratoId: int("transacaoExtratoId"),
  liquidezId: int("liquidezId"),
  valor: decimal("valor", { precision: 12, scale: 2 }).notNull(),
  dataTransacao: timestamp("dataTransacao"),
  descricaoExtrato: varchar("descricaoExtrato", { length: 200 }),
  status: mysqlEnum("status", ["conciliada", "discrepancia", "pendente"]).default("pendente"),
  motivoDiscrepancia: text("motivoDiscrepancia"),
  usuarioRevisao: int("usuarioRevisao"),
  dataRevisao: timestamp("dataRevisao"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ConciliacaoDetalhe = typeof conciliacaoDetalhes.$inferSelect;
export type InsertConciliacaoDetalhe = typeof conciliacaoDetalhes.$inferInsert;

/**
 * Comissao Funcionario (personalized commission override)
 */
export const comissaoFuncionario = mysqlTable("comissao_funcionario", {
  id: int("id").autoincrement().primaryKey(),
  funcionarioId: int("funcionarioId").notNull(),
  lojaId: int("lojaId").notNull(),
  ano: int("ano").notNull(),
  mes: int("mes").notNull(),
  faixas: json("faixas").notNull(), // [{liquidezMinima, percentualComissao}, ...]
  salarioFixo: decimal("salarioFixo", { precision: 12, scale: 2 }),
  dataAlteracao: timestamp("dataAlteracao").defaultNow(),
  aplicacaoEm: mysqlEnum("aplicacaoEm", ["imediata", "mes_atual", "proximo_mes"]).default("proximo_mes"),
  usuarioId: int("usuarioId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ComissaoFuncionario = typeof comissaoFuncionario.$inferSelect;
export type InsertComissaoFuncionario = typeof comissaoFuncionario.$inferInsert;


/**
 * Auditoria - Rastreia alterações na Folha de Pagamento
 */
export const auditoria = mysqlTable("auditoria", {
  id: int("id").autoincrement().primaryKey(),
  lojaId: int("lojaId").notNull(),
  funcionarioId: int("funcionarioId").notNull(),
  ano: int("ano").notNull(),
  mes: int("mes").notNull(),
  campo: varchar("campo", { length: 100 }).notNull(), // ex: "semana1", "premiacao", "vale"
  valorAnterior: text("valorAnterior"),
  valorNovo: text("valorNovo"),
  usuarioId: int("usuarioId").notNull(),
  usuarioNome: varchar("usuarioNome", { length: 255 }),
  dataAlteracao: timestamp("dataAlteracao").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Auditoria = typeof auditoria.$inferSelect;
export type InsertAuditoria = typeof auditoria.$inferInsert;
