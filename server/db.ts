import { eq, and, or, gt, gte, desc, isNull, sql } from "drizzle-orm";
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

let _pool: mysql.Pool | null = null;
let _db: any | null = null;

export async function getDb() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL não encontrada no process.env");
    return null;
  }

  try {
    if (!_pool || !_db) {
      _pool = mysql.createPool({
        uri: process.env.DATABASE_URL,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0,
      });

      _db = drizzle(_pool, { schema, mode: "default" });
      console.log("✅ Pool do banco conectado");
    }

    await _pool.query("SELECT 1");

    return _db;
  } catch (error) {
    console.error("❌ Conexão do banco caiu. Recriando pool...", error);

    try {
      await _pool?.end();
    } catch {}

    _pool = null;
    _db = null;

    return null;
  }
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

  const emailNormalizado = email.trim().toLowerCase();

  const result = await db
    .select()
    .from(users)
    .where(eq(users.email, emailNormalizado))
    .limit(1);

  console.log("🔍 LOGIN EMAIL:", emailNormalizado, "USER FOUND:", result[0]?.email);

  return result[0] ?? undefined;

}

// ===== Lojas =====
export async function getLojas() {
  const db = await getDb();
  if (!db) return [];

  await db
    .update(lojas)
    .set({ nome: "São Leopoldo" })
    .where(eq(lojas.id, 6));

  await db
    .insert(lojas)
    .values({
      id: 7,
      nome: "Gravataí",
      metaTotal: "0.00",
    } as any)
    .onDuplicateKeyUpdate({
      set: { nome: "Gravataí" },
    });

  return await db.select().from(lojas);
}

export async function getLojaById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(lojas).where(eq(lojas.id, id)).limit(1);
  return result.length > 0 ? result[0] : null;
}

function formatarDataMySQL(value: Date) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error("Data inválida");
  }

  const ano = value.getUTCFullYear();
  const mes = String(value.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(value.getUTCDate()).padStart(2, "0");

  // Aniversário é uma data civil; gravamos ao meio-dia para evitar
  // qualquer deslocamento de fuso ao passar por TIMESTAMP.
  return `${ano}-${mes}-${dia} 12:00:00`;
}

// ===== Funcionários =====
async function aplicarDataNascimentoCivil<T extends { id: number }>(rows: T[]) {
  if (!_pool || rows.length === 0) return rows;

  const ids = rows
    .map((row) => Number(row.id))
    .filter((id) => Number.isFinite(id) && id > 0);

  if (ids.length === 0) return rows;

  const placeholders = ids.map(() => "?").join(",");
  const [rawRows] = await _pool.query(
    `SELECT id, DATE_FORMAT(dataNascimento, '%Y-%m-%d') AS dataNascimento
       FROM funcionarios
      WHERE id IN (${placeholders})`,
    ids
  );

  const mapa = new Map<number, string | null>();

  for (const item of rawRows as Array<{ id: number; dataNascimento: string | null }>) {
    mapa.set(Number(item.id), item.dataNascimento ?? null);
  }

  return rows.map((row) => ({
    ...row,
    // Aniversário é uma data civil, não um instante de tempo.
    // Entregamos YYYY-MM-DD explicitamente para o frontend, evitando
    // qualquer conversão de TIMESTAMP/fuso na serialização do tRPC.
    dataNascimento: mapa.get(Number(row.id)) ?? null,
  }));
}

export async function getFuncionariosByLoja(lojaId: number) {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select()
    .from(funcionarios)
    .where(eq(funcionarios.lojaId, lojaId))
    .orderBy(funcionarios.nome);

  return aplicarDataNascimentoCivil(rows);
}

export async function getFuncionarioById(id: number) {
  const db = await getDb();
  if (!db) return null;

  const rows = await db
    .select()
    .from(funcionarios)
    .where(eq(funcionarios.id, id))
    .limit(1);

  const normalizados = await aplicarDataNascimentoCivil(rows);
  return normalizados.length > 0 ? normalizados[0] : null;
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
  cpf: string;
  pix: string;
  dataNascimento: Date;
  funcao:
    | "mecanico"
    | "vendedor"
    | "consultor_vendas"
    | "alinhador"
    | "aux_alinhador"
    | "auxiliar_limpeza"
    | "caixa"
    | "caixa_lider"
    | "recepcionista"
    | "auxiliar_estoque"
    | "lider_estoque"
    | "auxiliar_mecanico"
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
    cpf: data.cpf,
    pix: data.pix,
    dataNascimento: data.dataNascimento,
    funcao: data.funcao,
    tipoMeta:
  data.tipoMeta === "meta1" || data.tipoMeta === "meta2"
    ? data.tipoMeta
    : null,
    dataAdmissao: data.dataAdmissao,
    status: "ativo",
  };

  const result = await db.insert(funcionarios).values(values as any);
  const insertId = result?.[0]?.insertId ?? result?.insertId;

  if (insertId && _pool) {
    await _pool.execute(
      "UPDATE funcionarios SET dataNascimento = ? WHERE id = ?",
      [formatarDataMySQL(data.dataNascimento), insertId]
    );
  }

  if (!insertId) {
    const criado = await db
      .select()
      .from(funcionarios)
      .where(eq(funcionarios.nome, data.nome))
      .orderBy(desc(funcionarios.id))
      .limit(1);

    return criado[0] ?? null;
  }

  return getFuncionarioById(Number(insertId));
}

export async function updateFuncionario(data: {
  id: number;
  lojaId: number;
  nome: string;
  cpf: string;
  pix: string;
  dataNascimento: Date;
  funcao:
    | "mecanico"
    | "vendedor"
    | "consultor_vendas"
    | "alinhador"
    | "aux_alinhador"
    | "auxiliar_limpeza"
    | "caixa"
    | "caixa_lider"
    | "recepcionista"
    | "auxiliar_estoque"
    | "lider_estoque"
    | "auxiliar_mecanico"
    | "administrativo"
    | "gerente"
    | "supervisor";
  tipoMeta?: "meta1" | "meta2" | "" | null;
  dataAdmissao: Date;
}) {
  const db = await getDb();
  if (!db) {
    throw new Error("Banco não conectado");
  }

  const tipoMetaNormalizado =
    data.tipoMeta === "meta1" || data.tipoMeta === "meta2"
      ? data.tipoMeta
      : null;

  await db
    .update(funcionarios)
    .set({
      lojaId: data.lojaId,
      nome: data.nome,
      cpf: data.cpf,
      pix: data.pix,
      funcao: data.funcao,
      tipoMeta: tipoMetaNormalizado,
      dataAdmissao: data.dataAdmissao,
    } as any)
    .where(eq(funcionarios.id, data.id));

  // Persistência explícita da data de nascimento no MySQL.
  // Isso evita que a data seja descartada/normalizada de forma incorreta
  // pela camada de serialização de datas.
  if (!_pool) {
    throw new Error("Pool do banco não disponível");
  }

  await _pool.execute(
    "UPDATE funcionarios SET dataNascimento = ? WHERE id = ?",
    [formatarDataMySQL(data.dataNascimento), data.id]
  );

  // Confirma diretamente no MySQL o valor que acabou de ser gravado.
  const [rawRows] = await _pool.query(
    "SELECT DATE_FORMAT(dataNascimento, '%Y-%m-%d') AS dataNascimento FROM funcionarios WHERE id = ? LIMIT 1",
    [data.id]
  );

  const dataPersistida = (rawRows as Array<{ dataNascimento: string | null }>)[0]
    ?.dataNascimento;

  if (!dataPersistida) {
    throw new Error("A data de aniversário não foi persistida no banco");
  }

  return getFuncionarioById(data.id);
}

export async function inativarFuncionarioById(id: number, dataDesligamento: Date) {
  const db = await getDb();
  if (!db) {
    throw new Error("Banco não conectado");
  }

  await db
    .update(funcionarios)
    .set({
      status: "inativo",
      dataDesligamento,
    } as any)
    .where(eq(funcionarios.id, id));

  return { success: true };
}

export async function reativarFuncionarioById(
  id: number,
  dataReativacao: Date
) {
  const db = await getDb();

  if (!db) {
    throw new Error("Banco não conectado");
  }

  await db
    .update(funcionarios)
    .set({
      status: "ativo",
      dataReativacao,
    } as any)
    .where(eq(funcionarios.id, id));
    return { success: true };
}

export async function deleteFuncionarioById(id: number) {
  const db = await getDb();

  if (!db) {
    throw new Error("Banco não conectado");
  }

  await db.delete(funcionarios).where(eq(funcionarios.id, id));

  return { success: true };
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
export async function getFolhaExtrasByLojaAnoMes(
  lojaId: number,
  ano: number,
  mes: number
) {
  const db = await getDb();

  if (!db) {
    return {
      premiacoesByFuncionario: {},
      observacoesByFuncionario: {},
      descontosByFuncionario: {},
      descontosAuditoriaByFuncionario: {},
      valesByFuncionario: {},
    };
  }

  const [premiosRows, obsRows, descontosRows, valesRows] =
    await Promise.all([
      db
        .select()
        .from(premiacoes)
        .where(
          and(
            eq(premiacoes.lojaId, lojaId),
            eq(premiacoes.ano, ano),
            eq(premiacoes.mes, mes)
          )
        ),

      db
        .select()
        .from(observacoes)
        .where(
          and(
            eq(observacoes.lojaId, lojaId),
            eq(observacoes.ano, ano),
            eq(observacoes.mes, mes)
          )
        ),

      db
        .select()
        .from(descontos)
        .where(
          and(
            eq(descontos.lojaId, lojaId),
            eq(descontos.ano, ano),
            eq(descontos.mes, mes)
          )
        ),

      db
  .select()
  .from(vales)
  .where(
    and(
      eq(vales.lojaId, lojaId),
      eq(vales.ano, ano),
      eq(vales.mes, mes),
      eq(vales.status, "ativo")
    )
  ),
    ]);

    const premiacoesByFuncionario: Record<
  number,
  Array<{
    id: string;
    descricao: string;
    valor: number;
    ultimaAlteracaoPor?: string | null;
    ultimaAlteracaoEm?: Date | null;
  }>
> = {};
  
  const observacoesByFuncionario: Record<number, string[]> = {};

  const descontosByFuncionario: Record<
    number,
    {
      aluguel: number;
      inss: number;
      adiant: number;
      holerite: number;
    }
  > = {};

  const descontosAuditoriaByFuncionario: Record<number, any> = {};

  const valesByFuncionario: Record<
  number,
  Array<{
    id: string;
    grupoId: string;
    descricao: string;
    valor: number;
    parcelaAtual: number;
    totalParcelas: number;
    anoOrigem: number;
    mesOrigem: number;

    ultimaAlteracaoPor?: string | null;
    ultimaAlteracaoEm?: Date | null;
  }>
> = {};

  for (const row of premiosRows) {
    const fid = Number(row.funcionarioId);

    if (!premiacoesByFuncionario[fid]) {
      premiacoesByFuncionario[fid] = [];
    }

    premiacoesByFuncionario[fid].push({
  id: String(row.id),
  descricao: String(row.descricao || ""),
  valor: Number(row.valor || 0),

  ultimaAlteracaoPor: (row as any).ultimaAlteracaoPor || null,
  ultimaAlteracaoEm: (row as any).ultimaAlteracaoEm || null,
});
  }

  for (const row of obsRows) {
    const fid = Number(row.funcionarioId);

    if (!observacoesByFuncionario[fid]) {
      observacoesByFuncionario[fid] = [];
    }

    observacoesByFuncionario[fid].push(String(row.texto || ""));
  }

  for (const row of descontosRows) {
    const fid = Number(row.funcionarioId);
    const tipo = String(row.tipo);

    if (!descontosByFuncionario[fid]) {
      descontosByFuncionario[fid] = {
        aluguel: 0,
        inss: 0,
        adiant: 0,
        holerite: 0,
      };
    }

    if (!descontosAuditoriaByFuncionario[fid]) {
      descontosAuditoriaByFuncionario[fid] = {};
    }

    descontosAuditoriaByFuncionario[fid][tipo] = {
      ultimaAlteracaoPor: (row as any).ultimaAlteracaoPor || null,
      ultimaAlteracaoEm: (row as any).ultimaAlteracaoEm || null,
    };

    const valor = Number(row.valor || 0);

    if (tipo === "aluguel") descontosByFuncionario[fid].aluguel = valor;
    if (tipo === "inss") descontosByFuncionario[fid].inss = valor;
    if (tipo === "adiantamento") descontosByFuncionario[fid].adiant = valor;
    if (tipo === "holerite") descontosByFuncionario[fid].holerite = valor;
  }

  for (const row of valesRows) {
    const fid = Number(row.funcionarioId);

    if (!valesByFuncionario[fid]) {
      valesByFuncionario[fid] = [];
    }

    valesByFuncionario[fid].push({
      id: String(row.id),
      grupoId: String(row.grupoId || ""),
      descricao: String(row.descricao || ""),
      valor: Number(row.valorParcela || row.valor || 0),
      parcelaAtual: Number(row.parcelaAtual || 1),
      totalParcelas: Number(row.parcelas || row.totalParcelas || 1),
      anoOrigem: Number(row.anoOrigem || row.ano || ano),
      mesOrigem: Number(row.mesOrigem || row.mes || mes),

      ultimaAlteracaoPor: (row as any).ultimaAlteracaoPor || null,
      ultimaAlteracaoEm: (row as any).ultimaAlteracaoEm || null,
    });
  }

  return {
    premiacoesByFuncionario,
    observacoesByFuncionario,
    descontosByFuncionario,
    descontosAuditoriaByFuncionario,
    valesByFuncionario,
  };
}


// ===== Fechamento de competência da folha =====
// Esta tabela é criada automaticamente na primeira consulta, evitando
// depender de uma migration separada para ativar o recurso.
async function ensureFolhaFechamentosTable() {
  await getDb();
  if (!_pool) throw new Error("Banco não conectado");

  await _pool.query(`
    CREATE TABLE IF NOT EXISTS folha_fechamentos (
      id INT NOT NULL AUTO_INCREMENT,
      loja_id INT NOT NULL,
      ano INT NOT NULL,
      mes INT NOT NULL,
      status ENUM('aberto','fechado') NOT NULL DEFAULT 'aberto',
      fechado_por_id INT NULL,
      fechado_por_nome VARCHAR(255) NULL,
      fechado_em DATETIME NULL,
      reaberto_por_id INT NULL,
      reaberto_por_nome VARCHAR(255) NULL,
      reaberto_em DATETIME NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_folha_fechamento (loja_id, ano, mes)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

export async function getFolhaFechamentoStatus(
  lojaId: number,
  ano: number,
  mes: number
) {
  await ensureFolhaFechamentosTable();
  if (!_pool) throw new Error("Banco não conectado");

  const [rows] = await _pool.query<any[]>(
    `SELECT
       id,
       loja_id AS lojaId,
       ano,
       mes,
       status,
       fechado_por_id AS fechadoPorId,
       fechado_por_nome AS fechadoPorNome,
       fechado_em AS fechadoEm,
       reaberto_por_id AS reabertoPorId,
       reaberto_por_nome AS reabertoPorNome,
       reaberto_em AS reabertoEm
     FROM folha_fechamentos
     WHERE loja_id = ? AND ano = ? AND mes = ?
     LIMIT 1`,
    [lojaId, ano, mes]
  );

  const row = rows?.[0];

  if (!row) {
    return {
      fechado: false,
      status: "aberto" as const,
      lojaId,
      ano,
      mes,
      fechadoPorId: null,
      fechadoPorNome: null,
      fechadoEm: null,
      reabertoPorId: null,
      reabertoPorNome: null,
      reabertoEm: null,
    };
  }

  return {
    ...row,
    fechado: row.status === "fechado",
  };
}

export async function fecharCompetenciaFolha(data: {
  lojaId: number;
  ano: number;
  mes: number;
  usuarioId: number;
  usuarioNome: string;
}) {
  await ensureFolhaFechamentosTable();
  if (!_pool) throw new Error("Banco não conectado");

  await _pool.query(
    `INSERT INTO folha_fechamentos
       (loja_id, ano, mes, status, fechado_por_id, fechado_por_nome, fechado_em,
        reaberto_por_id, reaberto_por_nome, reaberto_em)
     VALUES (?, ?, ?, 'fechado', ?, ?, NOW(), NULL, NULL, NULL)
     ON DUPLICATE KEY UPDATE
       status = 'fechado',
       fechado_por_id = VALUES(fechado_por_id),
       fechado_por_nome = VALUES(fechado_por_nome),
       fechado_em = NOW(),
       reaberto_por_id = NULL,
       reaberto_por_nome = NULL,
       reaberto_em = NULL`,
    [data.lojaId, data.ano, data.mes, data.usuarioId, data.usuarioNome]
  );

  return getFolhaFechamentoStatus(data.lojaId, data.ano, data.mes);
}

export async function reabrirCompetenciaFolha(data: {
  lojaId: number;
  ano: number;
  mes: number;
  usuarioId: number;
  usuarioNome: string;
}) {
  await ensureFolhaFechamentosTable();
  if (!_pool) throw new Error("Banco não conectado");

  await _pool.query(
    `INSERT INTO folha_fechamentos
       (loja_id, ano, mes, status, reaberto_por_id, reaberto_por_nome, reaberto_em)
     VALUES (?, ?, ?, 'aberto', ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       status = 'aberto',
       reaberto_por_id = VALUES(reaberto_por_id),
       reaberto_por_nome = VALUES(reaberto_por_nome),
       reaberto_em = NOW()`,
    [data.lojaId, data.ano, data.mes, data.usuarioId, data.usuarioNome]
  );

  return getFolhaFechamentoStatus(data.lojaId, data.ano, data.mes);
}

export async function assertCompetenciaFolhaAberta(
  lojaId: number,
  ano: number,
  mes: number
) {
  const status = await getFolhaFechamentoStatus(lojaId, ano, mes);

  if (status.fechado) {
    throw new Error(
      `A folha de ${String(mes).padStart(2, "0")}/${ano} está fechada. Reabra a competência antes de alterar valores.`
    );
  }
}

export async function createPremiacao(data: {
  funcionarioId: number;
  lojaId: number;
  ano: number;
  mes: number;
  descricao: string;
  valor: number;

  ultimaAlteracaoPor?: string | null;
  ultimaAlteracaoEm?: Date | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco não conectado");

  await assertCompetenciaFolhaAberta(data.lojaId, data.ano, data.mes);

  await db.insert(premiacoes).values({
    funcionarioId: data.funcionarioId,
    lojaId: data.lojaId,
    ano: data.ano,
    mes: data.mes,
    descricao: data.descricao,
    valor: data.valor.toFixed(2),

    ultimaAlteracaoPor: data.ultimaAlteracaoPor ?? null,
    ultimaAlteracaoEm: data.ultimaAlteracaoEm ?? null,
  } as any);

  return { success: true };
}

export async function deletePremiacaoById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco não conectado");

  const row = await db.select().from(premiacoes).where(eq(premiacoes.id, id)).limit(1);
  if (row[0]) {
    await assertCompetenciaFolhaAberta(
      Number(row[0].lojaId),
      Number(row[0].ano),
      Number(row[0].mes)
    );
  }

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

  await assertCompetenciaFolhaAberta(data.lojaId, data.ano, data.mes);

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

  await assertCompetenciaFolhaAberta(data.lojaId, data.ano, data.mes);

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

  ultimaAlteracaoPor?: string | null;
  ultimaAlteracaoEm?: Date | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco não conectado");

  await assertCompetenciaFolhaAberta(data.lojaId, data.ano, data.mes);

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

        ultimaAlteracaoPor: data.ultimaAlteracaoPor ?? null,
        ultimaAlteracaoEm: data.ultimaAlteracaoEm ?? null,
    } as any).where(eq(descontos.id, existing[0].id));
  } else {
    await db.insert(descontos).values({
      funcionarioId: data.funcionarioId,
      lojaId: data.lojaId,
      ano: data.ano,
      mes: data.mes,
      tipo: data.tipo,
      valor: data.valor.toFixed(2),

      ultimaAlteracaoPor: data.ultimaAlteracaoPor ?? null,
      ultimaAlteracaoEm: data.ultimaAlteracaoEm ?? null,
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

  ultimaAlteracaoPor?: string | null;
  ultimaAlteracaoEm?: Date | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco não conectado");

  if (!data.items.length) return { success: true };

  const competencias = Array.from(
    new Set(data.items.map((item) => `${item.ano}-${item.mes}`))
  );

  for (const competencia of competencias) {
    const [anoItem, mesItem] = competencia.split("-").map(Number);
    await assertCompetenciaFolhaAberta(data.lojaId, anoItem, mesItem);
  }

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

      ultimaAlteracaoPor: data.ultimaAlteracaoPor ?? null,
      ultimaAlteracaoEm: data.ultimaAlteracaoEm ?? null,
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
  valeId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco não conectado");

  await assertCompetenciaFolhaAberta(data.lojaId, data.ano, data.mes);

const valeAtual = data.valeId
  ? await db
      .select()
      .from(vales)
      .where(eq(vales.id, data.valeId))
      .limit(1)
  : [];

const grupoId = valeAtual[0]?.grupoId || data.grupoId;

const rows = await db.select().from(vales).where(
  and(
    eq(vales.grupoId, grupoId),
    eq(vales.status, "ativo")
  )
);

const currentRef = new Date(data.ano, data.mes - 1, 1).getTime();

for (const row of rows) {
  const rowRef = new Date(row.ano, row.mes - 1, 1).getTime();

  if (rowRef >= currentRef) {
    await assertCompetenciaFolhaAberta(
      Number(row.lojaId),
      Number(row.ano),
      Number(row.mes)
    );

    await db
      .update(vales)
      .set({ status: "cancelado" } as any)
      .where(eq(vales.id, row.id));
  }
}

return { success: true };
}

export async function getFolhaBaseByLojaAnoMes(lojaId: number, ano: number, mes: number) {
  console.log("BUSCANDO FOLHA:", lojaId, ano, mes);
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
  percentualManual?: number | null;
  motivoPercentualManual?: string | null;

  ultimaAlteracaoPor?: string | null;
  ultimaAlteracaoEm?: Date | null;
}) {
  console.log("SALVANDO FOLHA:", data);

  const db = await getDb();
  if (!db) throw new Error("Banco não conectado");

  await assertCompetenciaFolhaAberta(data.lojaId, data.ano, data.mes);

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

  if (existing.length > 0) {
    await db
  .update(folhaPagamento)
  .set({
    liquidez: data.liquidez,
    percentualComissao: data.percentualComissao,
    valorComissao: data.valorComissao,
    percentualManual: data.percentualManual ?? null,
    motivoPercentualManual: data.motivoPercentualManual ?? null,
    ultimaAlteracaoPor: data.ultimaAlteracaoPor ?? null,
    ultimaAlteracaoEm: data.ultimaAlteracaoEm ?? null,
  } as any)
  .where(eq(folhaPagamento.id, existing[0].id));
  } else {
    await db.insert(folhaPagamento).values({
  ...data,
  percentualManual: data.percentualManual ?? null,
  motivoPercentualManual: data.motivoPercentualManual ?? null,
  ultimaAlteracaoPor: data.ultimaAlteracaoPor ?? null,
  ultimaAlteracaoEm: data.ultimaAlteracaoEm ?? null,
} as any);
  }
}

export async function getResumoSupervisorMensal(ano: number, mes: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.execute(sql`
    SELECT 
      f.lojaId,
      fp.liquidez,
      fp.valorComissao
    FROM folha_pagamento fp
    INNER JOIN funcionarios f 
      ON f.id = fp.funcionarioId
    WHERE 
      f.funcao = 'supervisor'
      AND fp.ano = ${ano}
      AND fp.mes = ${mes}
      AND fp.semana = 1
      AND fp.lojaId IN (1, 2, 3, 4)
  `);
}