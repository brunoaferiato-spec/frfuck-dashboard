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