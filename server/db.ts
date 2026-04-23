import { eq, and, desc, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "../drizzle/schema";
import {
  InsertUser,
  InsertFuncionario,
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
  console.log("DATABASE_URL existe?", !!process.env.DATABASE_URL);

  if (!_db && process.env.DATABASE_URL) {
    try {
      const connection = await mysql.createConnection(process.env.DATABASE_URL);
      _db = drizzle(connection, { schema, mode: "default" });
      console.log("✅ Banco conectado");
    } catch (error) {
      console.error("❌ Erro ao conectar no banco:", error);
      _db = null;
    }
  }

  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL não encontrada no process.env");
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
      values.role = "admin";
      updateSet.role = "admin";
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

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user by email: database not available");
    return undefined;
  }

  const result = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  return result[0] ?? undefined;
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

// ===== Funcionários =====
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
    .where(
      and(
        eq(funcionarios.lojaId, lojaId),
        eq(funcionarios.id, id),
        eq(funcionarios.status, "ativo")
      )
    )
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function createFuncionario(data: {
  lojaId: number;
  nome: string;
  cpf?: string | null;
  pix?: string | null;
  dataNascimento?: Date | null;
  funcao:
    | "mecanico"
    | "vendedor"
    | "consultor_vendas"
    | "alinhador"
    | "aux_alinhador"
    | "recepcionista"
    | "auxiliar_estoque"
    | "lider_estoque"
    | "auxiliar_caixa"
    | "administrativo"
    | "gerente"
    | "supervisor";
  tipoMeta?: "meta1" | "meta2" | null;
  dataAdmissao: Date;
}) {
  const db = await getDb();
  if (!db) {
    throw new Error("Banco não conectado");
  }

  const values: InsertFuncionario = {
    lojaId: data.lojaId,
    nome: data.nome,
    cpf: data.cpf ?? null,
    pix: data.pix ?? null,
    dataNascimento: data.dataNascimento ?? null,
    funcao: data.funcao,
    tipoMeta: data.tipoMeta ?? null,
    dataAdmissao: data.dataAdmissao,
    status: "ativo",
  };

  const result = await db.insert(funcionarios).values(values as any);
  const insertId = result?.[0]?.insertId ?? result?.insertId;

  if (!insertId) {
    const criado = await db
      .select()
      .from(funcionarios)
      .where(eq(funcionarios.nome, data.nome))
      .orderBy(desc(funcionarios.id))
      .limit(1);

    return criado[0] ?? null;
  }

  const criado = await db
    .select()
    .from(funcionarios)
    .where(eq(funcionarios.id, insertId))
    .limit(1);

  return criado[0] ?? null;
}

export async function updateFuncionario(data: {
  id: number;
  lojaId: number;
  nome: string;
  cpf?: string | null;
  pix?: string | null;
  dataNascimento?: Date | null;
  funcao:
    | "mecanico"
    | "vendedor"
    | "consultor_vendas"
    | "alinhador"
    | "aux_alinhador"
    | "recepcionista"
    | "auxiliar_estoque"
    | "lider_estoque"
    | "auxiliar_caixa"
    | "administrativo"
    | "gerente"
    | "supervisor";
  tipoMeta?: "meta1" | "meta2" | null;
  dataAdmissao: Date;
}) {
  const db = await getDb();
  if (!db) {
    throw new Error("Banco não conectado");
  }

  await db
    .update(funcionarios)
    .set({
      lojaId: data.lojaId,
      nome: data.nome,
      cpf: data.cpf ?? null,
      pix: data.pix ?? null,
      dataNascimento: data.dataNascimento ?? null,
      funcao: data.funcao,
      tipoMeta: data.tipoMeta ?? null,
      dataAdmissao: data.dataAdmissao,
    } as any)
    .where(eq(funcionarios.id, data.id));

  const result = await db
    .select()
    .from(funcionarios)
    .where(eq(funcionarios.id, data.id))
    .limit(1);

  return result[0] ?? null;
}

// ===== Metas =====
export async function getMetaByFuncaoLojaAnoMes(lojaId: number, funcao: string, ano: number, mes: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select()
    .from(metas)
    .where(
      and(
        eq(metas.lojaId, lojaId),
        eq(metas.funcao, funcao),
        eq(metas.ano, ano),
        eq(metas.mes, mes)
      )
    )
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
      and(
        eq(folhaPagamento.funcionarioId, funcionarioId),
        eq(folhaPagamento.ano, ano),
        eq(folhaPagamento.mes, mes)
      )
    );
}

export async function getFolhaByLojaAnoMes(lojaId: number, ano: number, mes: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(folhaPagamento)
    .where(
      and(
        eq(folhaPagamento.lojaId, lojaId),
        eq(folhaPagamento.ano, ano),
        eq(folhaPagamento.mes, mes)
      )
    );
}

// ===== Premiações =====
export async function getPremiacoesByFuncionarioAnoMes(funcionarioId: number, ano: number, mes: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(premiacoes)
    .where(
      and(
        eq(premiacoes.funcionarioId, funcionarioId),
        eq(premiacoes.ano, ano),
        eq(premiacoes.mes, mes)
      )
    );
}

// ===== Vales =====
export async function getValesByFuncionarioAnoMes(funcionarioId: number, ano: number, mes: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(vales)
    .where(
      and(
        eq(vales.funcionarioId, funcionarioId),
        eq(vales.ano, ano),
        eq(vales.mes, mes),
        eq(vales.status, "ativo")
      )
    );
}

export async function getValesByFuncionarioMesOrigem(funcionarioId: number, mesOrigem: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(vales)
    .where(
      and(
        eq(vales.funcionarioId, funcionarioId),
        eq(vales.mesOrigem, mesOrigem),
        eq(vales.status, "ativo")
      )
    );
}

// ===== Descontos =====
export async function getDescontosByFuncionarioAnoMes(funcionarioId: number, ano: number, mes: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(descontos)
    .where(
      and(
        eq(descontos.funcionarioId, funcionarioId),
        eq(descontos.ano, ano),
        eq(descontos.mes, mes)
      )
    );
}

// ===== Observações =====
export async function getObservacoesByFuncionarioAnoMes(funcionarioId: number, ano: number, mes: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(observacoes)
    .where(
      and(
        eq(observacoes.funcionarioId, funcionarioId),
        eq(observacoes.ano, ano),
        eq(observacoes.mes, mes)
      )
    );
}

// ===== Tarefas =====
export async function getTarefasByUsuario(usuarioId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(tarefas)
    .where(eq(tarefas.usuarioId, usuarioId))
    .orderBy(desc(tarefas.dataVencimento));
}

export async function getTarefasByUsuarioStatus(
  usuarioId: number,
  status: "pendente" | "concluida" | "cancelada"
) {
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
  return await db
    .select()
    .from(logsAtividade)
    .where(eq(logsAtividade.usuarioId, usuarioId))
    .orderBy(desc(logsAtividade.createdAt));
}

// ===== Feedbacks =====
export async function getFeedbacksByFuncionario(funcionarioId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(feedbacks)
    .where(eq(feedbacks.funcionarioId, funcionarioId))
    .orderBy(desc(feedbacks.dataFeedback));
}

// ===== Férias =====
export async function getFeriasByFuncionario(funcionarioId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(ferias)
    .where(eq(ferias.funcionarioId, funcionarioId))
    .orderBy(desc(ferias.dataInicio));
}

// ===== Rescisões =====
export async function getRescisoesByFuncionario(funcionarioId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(rescisoes)
    .where(eq(rescisoes.funcionarioId, funcionarioId))
    .orderBy(desc(rescisoes.dataRescisao));
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

export async function getComprasByLojaCategoria(
  lojaId: number,
  categoria: "pneus" | "insumos_estoque" | "outros"
) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(compras)
    .where(and(eq(compras.lojaId, lojaId), eq(compras.categoria, categoria)));
}

// ===== Usuários =====
export async function getUsers() {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select({
      id: users.id,
      openId: users.openId,
      name: users.name,
      email: users.email,
      role: users.role,
      lojaId: users.lojaId,
      isActive: users.isActive,
      lastSignedIn: users.lastSignedIn,
    })
    .from(users)
    .orderBy(desc(users.id));
}

export async function updateUserById(
  id: number,
  data: {
    name: string;
    email: string;
    role: string;
    lojaId: number | null;
    isActive: boolean;
    passwordHash?: string | null;
  }
) {
  const db = await getDb();
  if (!db) {
    throw new Error("Banco não conectado");
  }

  const updateData: Record<string, unknown> = {
    name: data.name,
    email: data.email,
    role: data.role,
    lojaId: data.lojaId,
    isActive: data.isActive,
  };

  if (data.passwordHash) {
    updateData.passwordHash = data.passwordHash;
  }

  await db.update(users).set(updateData as any).where(eq(users.id, id));

  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0] ?? null;
}

export async function deleteUserById(id: number) {
  const db = await getDb();
  if (!db) {
    throw new Error("Banco não conectado");
  }

  await db.delete(users).where(eq(users.id, id));

  return {
    success: true,
  };
}
// ===== Folha Extras =====
export async function getFolhaExtrasByLojaAnoMes(lojaId: number, ano: number, mes: number) {
  const db = await getDb();
  if (!db) {
    return {
      premiacoesByFuncionario: {},
      observacoesByFuncionario: {},
      descontosByFuncionario: {},
      valesByFuncionario: {},
    };
  }

  const [premiosRows, obsRows, descontosRows, valesRows] = await Promise.all([
    db.select().from(premiacoes).where(
      and(eq(premiacoes.lojaId, lojaId), eq(premiacoes.ano, ano), eq(premiacoes.mes, mes))
    ),
    db.select().from(observacoes).where(
      and(eq(observacoes.lojaId, lojaId), eq(observacoes.ano, ano), eq(observacoes.mes, mes))
    ),
    db.select().from(descontos).where(
      and(eq(descontos.lojaId, lojaId), eq(descontos.ano, ano), eq(descontos.mes, mes))
    ),
    db.select().from(vales).where(
      and(eq(vales.lojaId, lojaId), eq(vales.ano, ano), eq(vales.mes, mes), eq(vales.status, "ativo"))
    ),
  ]);

  const premiacoesByFuncionario: Record<number, Array<{ id: string; descricao: string; valor: number }>> = {};
  const observacoesByFuncionario: Record<number, string[]> = {};
  const descontosByFuncionario: Record<number, { aluguel: number; inss: number; adiant: number; holerite: number }> = {};
  const valesByFuncionario: Record<number, Array<{
    id: string;
    grupoId: string;
    descricao: string;
    valor: number;
    parcelaAtual: number;
    totalParcelas: number;
    anoOrigem: number;
    mesOrigem: number;
  }>> = {};

  for (const row of premiosRows) {
    const fid = row.funcionarioId;
    if (!premiacoesByFuncionario[fid]) premiacoesByFuncionario[fid] = [];
    premiacoesByFuncionario[fid].push({
      id: String(row.id),
      descricao: row.descricao,
      valor: Number(row.valor || 0),
    });
  }

  for (const row of obsRows) {
    const fid = row.funcionarioId;
    if (!observacoesByFuncionario[fid]) observacoesByFuncionario[fid] = [];
    observacoesByFuncionario[fid].push(row.texto);
  }

  for (const row of descontosRows) {
    const fid = row.funcionarioId;
    if (!descontosByFuncionario[fid]) {
      descontosByFuncionario[fid] = {
        aluguel: 0,
        inss: 0,
        adiant: 0,
        holerite: 0,
      };
    }

    const valor = Number(row.valor || 0);

    if (row.tipo === "aluguel") descontosByFuncionario[fid].aluguel = valor;
    if (row.tipo === "inss") descontosByFuncionario[fid].inss = valor;
    if (row.tipo === "adiantamento") descontosByFuncionario[fid].adiant = valor;
    if (row.tipo === "holerite") descontosByFuncionario[fid].holerite = valor;
  }

  for (const row of valesRows) {
    const fid = row.funcionarioId;
    if (!valesByFuncionario[fid]) valesByFuncionario[fid] = [];
    valesByFuncionario[fid].push({
      id: String(row.id),
      grupoId: row.grupoId,
      descricao: row.descricao,
      valor: Number(row.valorParcela || 0),
      parcelaAtual: Number(row.parcelaAtual || 1),
      totalParcelas: Number(row.parcelas || 1),
      anoOrigem: row.ano,
      mesOrigem: row.mesOrigem,
    });
  }

  return {
    premiacoesByFuncionario,
    observacoesByFuncionario,
    descontosByFuncionario,
    valesByFuncionario,
  };
}

export async function createPremiacao(data: {
  funcionarioId: number;
  lojaId: number;
  ano: number;
  mes: number;
  descricao: string;
  valor: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco não conectado");

  await db.insert(premiacoes).values({
    funcionarioId: data.funcionarioId,
    lojaId: data.lojaId,
    ano: data.ano,
    mes: data.mes,
    descricao: data.descricao,
    valor: data.valor.toFixed(2),
  } as any);

  return { success: true };
}

export async function deletePremiacaoById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco não conectado");

  await db.delete(premiacoes).where(eq(premiacoes.id, id));
  return { success: true };
}

export async function createObservacao(data: {
  funcionarioId: number;
  lojaId: number;
  ano: number;
  mes: number;
  texto: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco não conectado");

  await db.insert(observacoes).values({
    funcionarioId: data.funcionarioId,
    lojaId: data.lojaId,
    ano: data.ano,
    mes: data.mes,
    texto: data.texto,
  } as any);

  return { success: true };
}

export async function deleteObservacaoByTexto(data: {
  funcionarioId: number;
  lojaId: number;
  ano: number;
  mes: number;
  texto: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco não conectado");

  const rows = await db.select().from(observacoes).where(
    and(
      eq(observacoes.funcionarioId, data.funcionarioId),
      eq(observacoes.lojaId, data.lojaId),
      eq(observacoes.ano, data.ano),
      eq(observacoes.mes, data.mes),
      eq(observacoes.texto, data.texto)
    )
  );

  if (rows[0]) {
    await db.delete(observacoes).where(eq(observacoes.id, rows[0].id));
  }

  return { success: true };
}

export async function upsertDesconto(data: {
  funcionarioId: number;
  lojaId: number;
  ano: number;
  mes: number;
  tipo: "aluguel" | "inss" | "adiantamento" | "holerite";
  valor: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco não conectado");

  const existing = await db.select().from(descontos).where(
    and(
      eq(descontos.funcionarioId, data.funcionarioId),
      eq(descontos.lojaId, data.lojaId),
      eq(descontos.ano, data.ano),
      eq(descontos.mes, data.mes),
      eq(descontos.tipo, data.tipo)
    )
  ).limit(1);

  if (existing[0]) {
    await db.update(descontos).set({
      valor: data.valor.toFixed(2),
    } as any).where(eq(descontos.id, existing[0].id));
  } else {
    await db.insert(descontos).values({
      funcionarioId: data.funcionarioId,
      lojaId: data.lojaId,
      ano: data.ano,
      mes: data.mes,
      tipo: data.tipo,
      valor: data.valor.toFixed(2),
    } as any);
  }

  return { success: true };
}

export async function createValesBatch(data: {
  funcionarioId: number;
  lojaId: number;
  items: Array<{
    grupoId: string;
    descricao: string;
    valorTotal: number;
    valorParcela: number;
    parcelas: number;
    parcelaAtual: number;
    ano: number;
    mes: number;
    mesOrigem: number;
    tipo: "simples" | "parcelado";
  }>;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco não conectado");

  if (!data.items.length) return { success: true };

  await db.insert(vales).values(
    data.items.map((item) => ({
      funcionarioId: data.funcionarioId,
      lojaId: data.lojaId,
      grupoId: item.grupoId,
      descricao: item.descricao,
      valorTotal: item.valorTotal.toFixed(2),
      valorParcela: item.valorParcela.toFixed(2),
      parcelas: item.parcelas,
      parcelaAtual: item.parcelaAtual,
      ano: item.ano,
      mes: item.mes,
      mesOrigem: item.mesOrigem,
      tipo: item.tipo,
      status: "ativo",
    })) as any
  );

  return { success: true };
}

export async function cancelValesByGrupoFromCurrentForward(data: {
  funcionarioId: number;
  lojaId: number;
  grupoId: string;
  ano: number;
  mes: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco não conectado");

  const rows = await db.select().from(vales).where(
    and(
      eq(vales.funcionarioId, data.funcionarioId),
      eq(vales.lojaId, data.lojaId),
      eq(vales.grupoId, data.grupoId),
      eq(vales.status, "ativo")
    )
  );

  const currentRef = new Date(data.ano, data.mes - 1, 1).getTime();

  for (const row of rows) {
    const rowRef = new Date(row.ano, row.mes - 1, 1).getTime();
    if (rowRef >= currentRef) {
      await db.update(vales).set({ status: "cancelado" } as any).where(eq(vales.id, row.id));
    }
  }

  return { success: true };
}

export async function getFolhaBaseByLojaAnoMes(lojaId: number, ano: number, mes: number) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(folhaPagamento)
    .where(
      and(
        eq(folhaPagamento.lojaId, lojaId),
        eq(folhaPagamento.ano, ano),
        eq(folhaPagamento.mes, mes)
      )
    );
}

export async function upsertFolhaBaseItem(data: {
  funcionarioId: number;
  lojaId: number;
  ano: number;
  mes: number;
  semana: number;
  liquidez: number;
  percentualComissao: number;
  valorComissao: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco não conectado");

  const existing = await db
    .select()
    .from(folhaPagamento)
    .where(
      and(
        eq(folhaPagamento.funcionarioId, data.funcionarioId),
        eq(folhaPagamento.lojaId, data.lojaId),
        eq(folhaPagamento.ano, data.ano),
        eq(folhaPagamento.mes, data.mes),
        eq(folhaPagamento.semana, data.semana)
      )
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(folhaPagamento)
      .set({
        liquidez: data.liquidez.toFixed(2),
        percentualComissao: data.percentualComissao.toFixed(2),
        valorComissao: data.valorComissao.toFixed(2),
      } as any)
      .where(eq(folhaPagamento.id, existing[0].id));

    return { success: true, id: existing[0].id };
  }

  const inserted = await db.insert(folhaPagamento).values({
    funcionarioId: data.funcionarioId,
    lojaId: data.lojaId,
    ano: data.ano,
    mes: data.mes,
    semana: data.semana,
    liquidez: data.liquidez.toFixed(2),
    percentualComissao: data.percentualComissao.toFixed(2),
    valorComissao: data.valorComissao.toFixed(2),
  } as any);

  return { success: true, id: inserted?.insertId ?? null };
}