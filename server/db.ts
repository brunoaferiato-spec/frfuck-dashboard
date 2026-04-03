import { eq, and, gte, lte, desc, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "../drizzle/schema";
import {
  InsertUser,
  users,
  lojas,
  funcionarios,
  metas,
  folhaPagamento,
  premiacoes,
  vales,
  descontos,
  observacoes,
  tarefas,
  tarefasAlertas,
  feedbacks,
  ferias,
  rescisoes,
  compras,
  logsAtividade,
  contasBancarias,
  extratosBancarios,
  conciliacao,
  conciliacaoDetalhes,
  comissaoFuncionario,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: any | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL, { schema, mode: "default" });
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ===== Lojas =====
export async function getLojas() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(lojas);
}

export async function getLojaById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(lojas).where(eq(lojas.id, id)).limit(1);
  return result.length > 0 ? result[0] : null;
}

// ===== Funcionarios =====
export async function getFuncionariosByLoja(lojaId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(funcionarios).where(eq(funcionarios.lojaId, lojaId));
}

export async function getFuncionarioById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(funcionarios).where(eq(funcionarios.id, id)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getFuncionarioAtivo(lojaId: number, id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select()
    .from(funcionarios)
    .where(and(eq(funcionarios.lojaId, lojaId), eq(funcionarios.id, id), eq(funcionarios.status, "ativo")))
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

// ===== Metas =====
export async function getMetaByFuncaoLojaAnoMes(lojaId: number, funcao: string, ano: number, mes: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select()
    .from(metas)
    .where(and(eq(metas.lojaId, lojaId), eq(metas.funcao, funcao), eq(metas.ano, ano), eq(metas.mes, mes)))
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getMetasByLoja(lojaId: number, ano: number, mes: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(metas)
    .where(and(eq(metas.lojaId, lojaId), eq(metas.ano, ano), eq(metas.mes, mes)));
}

// ===== Comissão Personalizada =====
export async function getComissaoFuncionario(funcionarioId: number, lojaId: number, ano: number, mes: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select()
    .from(comissaoFuncionario)
    .where(
      and(
        eq(comissaoFuncionario.funcionarioId, funcionarioId),
        eq(comissaoFuncionario.lojaId, lojaId),
        eq(comissaoFuncionario.ano, ano),
        eq(comissaoFuncionario.mes, mes)
      )
    )
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

// ===== Folha de Pagamento =====
export async function getFolhaByFuncionarioAnoMes(funcionarioId: number, ano: number, mes: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(folhaPagamento)
    .where(
      and(eq(folhaPagamento.funcionarioId, funcionarioId), eq(folhaPagamento.ano, ano), eq(folhaPagamento.mes, mes))
    );
}

export async function getFolhaByLojaAnoMes(lojaId: number, ano: number, mes: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(folhaPagamento)
    .where(and(eq(folhaPagamento.lojaId, lojaId), eq(folhaPagamento.ano, ano), eq(folhaPagamento.mes, mes)));
}

// ===== Premiações =====
export async function getPremiacoesByFuncionarioAnoMes(funcionarioId: number, ano: number, mes: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(premiacoes)
    .where(
      and(eq(premiacoes.funcionarioId, funcionarioId), eq(premiacoes.ano, ano), eq(premiacoes.mes, mes))
    );
}

// ===== Vales =====
export async function getValesByFuncionarioAnoMes(funcionarioId: number, ano: number, mes: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(vales)
    .where(and(eq(vales.funcionarioId, funcionarioId), eq(vales.ano, ano), eq(vales.mes, mes), eq(vales.status, "ativo")));
}

export async function getValesByFuncionarioMesOrigem(funcionarioId: number, mesOrigem: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(vales)
    .where(and(eq(vales.funcionarioId, funcionarioId), eq(vales.mesOrigem, mesOrigem), eq(vales.status, "ativo")));
}

// ===== Descontos =====
export async function getDescontosByFuncionarioAnoMes(funcionarioId: number, ano: number, mes: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(descontos)
    .where(and(eq(descontos.funcionarioId, funcionarioId), eq(descontos.ano, ano), eq(descontos.mes, mes)));
}

// ===== Observações =====
export async function getObservacoesByFuncionarioAnoMes(funcionarioId: number, ano: number, mes: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(observacoes)
    .where(and(eq(observacoes.funcionarioId, funcionarioId), eq(observacoes.ano, ano), eq(observacoes.mes, mes)));
}

// ===== Tarefas =====
export async function getTarefasByUsuario(usuarioId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(tarefas).where(eq(tarefas.usuarioId, usuarioId)).orderBy(desc(tarefas.dataVencimento));
}

export async function getTarefasByUsuarioStatus(usuarioId: number, status: "pendente" | "concluida" | "cancelada") {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(tarefas)
    .where(and(eq(tarefas.usuarioId, usuarioId), eq(tarefas.status, status)))
    .orderBy(desc(tarefas.dataVencimento));
}

// ===== Contas Bancárias =====
export async function getContasBancariasByLoja(lojaId: number | null) {
  const db = await getDb();
  if (!db) return [];
  if (lojaId === null) {
    return await db.select().from(contasBancarias).where(isNull(contasBancarias.lojaId));
  }
  return await db.select().from(contasBancarias).where(eq(contasBancarias.lojaId, lojaId));
}

export async function getContaBancariaById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(contasBancarias).where(eq(contasBancarias.id, id)).limit(1);
  return result.length > 0 ? result[0] : null;
}

// ===== Conciliação Bancária =====
export async function getConciliacaoByContaAnoMes(contaBancariaId: number, ano: number, mes: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select()
    .from(conciliacao)
    .where(
      and(
        eq(conciliacao.contaBancariaId, contaBancariaId),
        eq(conciliacao.ano, ano),
        eq(conciliacao.mes, mes)
      )
    )
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

// ===== Logs de Atividade =====
export async function getLogsByUsuario(usuarioId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(logsAtividade).where(eq(logsAtividade.usuarioId, usuarioId)).orderBy(desc(logsAtividade.createdAt));
}

// ===== Feedbacks =====
export async function getFeedbacksByFuncionario(funcionarioId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(feedbacks).where(eq(feedbacks.funcionarioId, funcionarioId)).orderBy(desc(feedbacks.dataFeedback));
}

// ===== Férias =====
export async function getFeriasByFuncionario(funcionarioId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(ferias).where(eq(ferias.funcionarioId, funcionarioId)).orderBy(desc(ferias.dataInicio));
}

// ===== Rescisões =====
export async function getRescisoesByFuncionario(funcionarioId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(rescisoes).where(eq(rescisoes.funcionarioId, funcionarioId)).orderBy(desc(rescisoes.dataRescisao));
}

// ===== Compras =====
export async function getComprasByLojaAnoMes(lojaId: number, ano: number, mes: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(compras)
    .where(and(eq(compras.lojaId, lojaId), eq(compras.ano, ano), eq(compras.mes, mes)))
    .orderBy(desc(compras.data));
}

export async function getComprasByLojaCategoria(lojaId: number, categoria: "pneus" | "insumos_estoque" | "outros") {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(compras).where(and(eq(compras.lojaId, lojaId), eq(compras.categoria, categoria)));
}
