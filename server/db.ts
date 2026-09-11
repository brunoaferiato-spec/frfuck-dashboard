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

function criarPoolDb() {
  const pool = mysql.createPool({
    uri: process.env.DATABASE_URL!,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
  });

  const db = drizzle(pool, { schema, mode: "default" });
  return { pool, db };
}

export async function getDb() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL não encontrada no process.env");
    return null;
  }

  // O mysql2 já gerencia as conexões internas do pool. Não encerramos o pool
  // durante uma requisição: várias queries da Folha rodam em paralelo e chamar
  // pool.end() aqui pode fechar a conexão que outra query ainda está usando,
  // gerando a sequência "Pool is closed" -> "Banco não conectado".
  for (let tentativa = 1; tentativa <= 2; tentativa += 1) {
    if (!_pool || !_db) {
      const conexao = criarPoolDb();
      _pool = conexao.pool;
      _db = conexao.db;
      console.log("✅ Pool do banco conectado");
    }

    const poolDaTentativa = _pool;
    const dbDaTentativa = _db;

    try {
      await poolDaTentativa.query("SELECT 1");
      return dbDaTentativa;
    } catch (error: any) {
      const mensagem = String(error?.message || error || "");
      console.error(
        `❌ Falha ao validar conexão do banco (tentativa ${tentativa}/2):`,
        mensagem
      );

      // Pool realmente encerrado: descarta apenas a referência global e cria
      // outro na próxima tentativa. Não chamamos .end() no pool antigo porque
      // ele pode ainda estar referenciado por uma query concorrente.
      if (/pool is closed/i.test(mensagem) && _pool === poolDaTentativa) {
        _pool = null;
        _db = null;
      }

      if (tentativa === 2) return null;

      // Pequena janela para o mysql2 recuperar uma conexão transitória antes
      // da segunda tentativa, sem derrubar as demais consultas da aplicação.
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  }

  return null;
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
let _funcionarioJornadaFieldsReady = false;

async function ensureFuncionarioJornadaFields() {
  if (_funcionarioJornadaFieldsReady) return;

  await getDb();
  if (!_pool) throw new Error("Banco não conectado");

  const [columns] = await _pool.query<any[]>(
    `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'funcionarios'`
  );

  const existentes = new Set(
    (columns || []).map((row: any) =>
      String(row.COLUMN_NAME || row.column_name || "")
    )
  );

  const alteracoes: string[] = [];

  if (!existentes.has("cargoConfianca")) {
    alteracoes.push(
      "ADD COLUMN cargoConfianca TINYINT(1) NOT NULL DEFAULT 0 AFTER dataAdmissao"
    );
  }
  if (!existentes.has("horarioEntrada1")) {
    alteracoes.push("ADD COLUMN horarioEntrada1 VARCHAR(5) NULL AFTER cargoConfianca");
  }
  if (!existentes.has("duracaoAlmocoMinutos")) {
    alteracoes.push("ADD COLUMN duracaoAlmocoMinutos INT NULL AFTER horarioEntrada1");
  }
  if (!existentes.has("horarioSaida1")) {
    alteracoes.push("ADD COLUMN horarioSaida1 VARCHAR(5) NULL AFTER horarioEntrada1");
  }
  if (!existentes.has("horarioEntrada2")) {
    alteracoes.push("ADD COLUMN horarioEntrada2 VARCHAR(5) NULL AFTER horarioSaida1");
  }
  if (!existentes.has("horarioSaida2")) {
    alteracoes.push("ADD COLUMN horarioSaida2 VARCHAR(5) NULL AFTER horarioEntrada2");
  }

  for (const alteracao of alteracoes) {
    try {
      await _pool.query(`ALTER TABLE funcionarios ${alteracao}`);
    } catch (error: any) {
      if (String(error?.code || "") !== "ER_DUP_FIELDNAME") throw error;
    }
  }

  _funcionarioJornadaFieldsReady = true;
}

function normalizarHorarioJornada(value?: string | null) {
  const horario = String(value || "").trim();
  if (!horario) return null;

  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(horario)) {
    throw new Error(`Horário de jornada inválido: ${horario}`);
  }

  return horario;
}

function normalizarDuracaoAlmoco(value?: number | null) {
  if (value === undefined || value === null) return null;

  const minutos = Number(value);
  if (!Number.isInteger(minutos) || minutos < 15 || minutos > 360) {
    throw new Error("Duração do almoço inválida");
  }

  return minutos;
}

// Data de nascimento é uma data civil, não um instante de tempo.
// Lemos diretamente do MySQL como YYYY-MM-DD para evitar que a serialização
// do driver/tRPC aplique fuso horário e faça o campo desaparecer no frontend.
async function aplicarDataNascimentoCivil<T extends { id: number }>(rows: T[]) {
  if (!_pool || rows.length === 0) return rows;

  const ids = rows
    .map((row) => Number(row.id))
    .filter((id) => Number.isFinite(id) && id > 0);

  if (ids.length === 0) return rows;

  const placeholders = ids.map(() => "?").join(",");
  const [rawRows] = await _pool.query(
    `SELECT id, nome, DATE_FORMAT(dataNascimento, '%Y-%m-%d') AS dataNascimento
       FROM funcionarios
      WHERE id IN (${placeholders})`,
    ids
  );

  const linhasNascimento = rawRows as Array<{
    id: number;
    nome: string;
    dataNascimento: string | null;
  }>;

  // Diagnóstico temporário: confirma exatamente o que o MySQL está devolvendo
  // para o funcionário usado no teste. Removeremos após identificar a origem.
  const mapa = new Map<number, string | null>();

  for (const item of linhasNascimento) {
    mapa.set(Number(item.id), item.dataNascimento ?? null);
  }

  return rows.map((row) => ({
    ...row,
    dataNascimento: mapa.get(Number(row.id)) ?? null,
  }));
}

export async function getFuncionariosByLoja(lojaId: number) {
  await ensureFuncionarioJornadaFields();
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
  await ensureFuncionarioJornadaFields();
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
  await ensureFuncionarioJornadaFields();
  const db = await getDb();
  if (!db) return null;

  const rows = await db
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

  const normalizados = await aplicarDataNascimentoCivil(rows);
  return normalizados.length > 0 ? normalizados[0] : null;
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
  cargoConfianca?: boolean | null;
  horarioEntrada1?: string | null;
  duracaoAlmocoMinutos?: number | null;
  horarioSaida1?: string | null;
  horarioEntrada2?: string | null;
  horarioSaida2?: string | null;
}) {
  await ensureFuncionarioJornadaFields();
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
    cargoConfianca: Boolean(data.cargoConfianca),
    horarioEntrada1: normalizarHorarioJornada(data.horarioEntrada1),
    duracaoAlmocoMinutos: normalizarDuracaoAlmoco(data.duracaoAlmocoMinutos),
    horarioSaida1: normalizarHorarioJornada(data.horarioSaida1),
    horarioEntrada2: normalizarHorarioJornada(data.horarioEntrada2),
    horarioSaida2: normalizarHorarioJornada(data.horarioSaida2),
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
  cargoConfianca?: boolean | null;
  horarioEntrada1?: string | null;
  duracaoAlmocoMinutos?: number | null;
  horarioSaida1?: string | null;
  horarioEntrada2?: string | null;
  horarioSaida2?: string | null;
}) {
  await ensureFuncionarioJornadaFields();
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
      cargoConfianca: Boolean(data.cargoConfianca),
      horarioEntrada1: normalizarHorarioJornada(data.horarioEntrada1),
      duracaoAlmocoMinutos: normalizarDuracaoAlmoco(data.duracaoAlmocoMinutos),
      horarioSaida1: normalizarHorarioJornada(data.horarioSaida1),
      horarioEntrada2: normalizarHorarioJornada(data.horarioEntrada2),
      horarioSaida2: normalizarHorarioJornada(data.horarioSaida2),
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

  const atualizado = await getFuncionarioById(data.id);

  if (!atualizado || !(atualizado as any).dataNascimento) {
    throw new Error("A data de aniversário não foi persistida no banco");
  }

  return atualizado;
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


// ===== Histórico de troca de função =====
let _trocaFuncaoTablesReady = false;

function dataCivilMySQL(value: Date) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error("Data de mudança inválida");
  }

  const ano = value.getUTCFullYear();
  const mes = String(value.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(value.getUTCDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function funcaoEhSalarioFixo(funcao: string) {
  return [
    "auxiliar_limpeza",
    "caixa",
    "caixa_lider",
    "auxiliar_estoque",
    "lider_estoque",
    "auxiliar_mecanico",
    "administrativo",
  ].includes(String(funcao || ""));
}

async function ensureTrocaFuncaoTables() {
  if (_trocaFuncaoTablesReady) return;

  const db = await getDb();
  if (!db || !_pool) throw new Error("Banco não conectado");

  await _pool.query(`
    CREATE TABLE IF NOT EXISTS funcionario_trocas_funcao (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      funcionario_id INT NOT NULL,
      loja_id INT NOT NULL,
      funcao_anterior VARCHAR(50) NOT NULL,
      funcao_nova VARCHAR(50) NOT NULL,
      tipo_meta_anterior VARCHAR(20) NULL,
      tipo_meta_novo VARCHAR(20) NULL,
      data_mudanca DATE NOT NULL,
      usuario_id INT NULL,
      usuario_nome VARCHAR(255) NULL,
      criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_troca_funcionario_data (funcionario_id, data_mudanca),
      INDEX idx_troca_loja_data (loja_id, data_mudanca)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await _pool.query(`
    CREATE TABLE IF NOT EXISTS folha_transicoes_funcao (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      troca_funcao_id INT NOT NULL,
      funcionario_id INT NOT NULL,
      loja_id INT NOT NULL,
      ano INT NOT NULL,
      mes INT NOT NULL,
      quantidade_anterior_1 DECIMAL(12,2) NOT NULL DEFAULT 0,
      quantidade_anterior_2 DECIMAL(12,2) NOT NULL DEFAULT 0,
      valor_fixo_anterior DECIMAL(14,2) NOT NULL DEFAULT 0,
      ultima_alteracao_por VARCHAR(255) NULL,
      ultima_alteracao_em DATETIME NULL,
      criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_folha_transicao (troca_funcao_id, ano, mes),
      INDEX idx_folha_transicao_competencia (loja_id, ano, mes, funcionario_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Auditoria das correções de data de troca de função. A movimentação original
  // continua sendo um único registro; aqui guardamos cada correção realizada.
  await _pool.query(`
    CREATE TABLE IF NOT EXISTS funcionario_trocas_funcao_correcoes (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      troca_funcao_id INT NOT NULL,
      funcionario_id INT NOT NULL,
      loja_id INT NOT NULL,
      data_anterior DATE NOT NULL,
      data_nova DATE NOT NULL,
      usuario_id INT NULL,
      usuario_nome VARCHAR(255) NULL,
      corrigido_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_correcao_troca (troca_funcao_id, id),
      INDEX idx_correcao_funcionario (funcionario_id, corrigido_em)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  _trocaFuncaoTablesReady = true;
}

export async function trocarFuncaoFuncionario(data: {
  id: number;
  lojaId: number;
  novaFuncao:
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
  novoTipoMeta?: "meta1" | "meta2" | null;
  dataMudanca: Date;
  usuarioId?: number | null;
  usuarioNome?: string | null;
}) {
  await ensureTrocaFuncaoTables();
  if (!_pool) throw new Error("Banco não conectado");

  const dataMudancaSql = dataCivilMySQL(data.dataMudanca);
  const ano = Number(dataMudancaSql.slice(0, 4));
  const mes = Number(dataMudancaSql.slice(5, 7));

  await assertCompetenciaFolhaAberta(data.lojaId, ano, mes);

  const connection = await _pool.getConnection();
  try {
    await connection.beginTransaction();

    const [funcRows] = await connection.query<any[]>(
      `SELECT id, lojaId, funcao, tipoMeta,
              DATE_FORMAT(dataAdmissao, '%Y-%m-%d') AS dataAdmissao
         FROM funcionarios
        WHERE id = ? AND lojaId = ?
        LIMIT 1
        FOR UPDATE`,
      [data.id, data.lojaId]
    );

    const funcionario = funcRows?.[0];
    if (!funcionario) {
      throw new Error("Funcionário não encontrado nesta loja");
    }

    const funcaoAnterior = String(funcionario.funcao || "");
    if (funcaoAnterior === data.novaFuncao) {
      throw new Error("A nova função é igual à função atual do funcionário");
    }

    const admissaoRaw = funcionario.dataAdmissao
      ? String(funcionario.dataAdmissao).slice(0, 10)
      : "";
    if (admissaoRaw && dataMudancaSql < admissaoRaw) {
      throw new Error("A data da troca não pode ser anterior à admissão");
    }

    const tipoMetaAnterior = funcionario.tipoMeta || null;
    const tipoMetaNovo =
      data.novaFuncao === "consultor_vendas" &&
      (data.novoTipoMeta === "meta1" || data.novoTipoMeta === "meta2")
        ? data.novoTipoMeta
        : null;

    const [insertResult]: any = await connection.query(
      `INSERT INTO funcionario_trocas_funcao
         (funcionario_id, loja_id, funcao_anterior, funcao_nova,
          tipo_meta_anterior, tipo_meta_novo, data_mudanca, usuario_id, usuario_nome)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.id,
        data.lojaId,
        funcaoAnterior,
        data.novaFuncao,
        tipoMetaAnterior,
        tipoMetaNovo,
        dataMudancaSql,
        data.usuarioId ?? null,
        data.usuarioNome ?? null,
      ]
    );

    const trocaFuncaoId = Number(insertResult?.insertId || 0);
    if (!trocaFuncaoId) {
      throw new Error("Não foi possível registrar o histórico da troca de função");
    }

    // Ao sair de Recepção ou de uma função de salário fixo, os campos sem1/sem2
    // tinham outro significado. Migramos os valores para o histórico da transição
    // antes de zerá-los, evitando que sejam interpretados como liquidez da nova função.
    if (funcaoAnterior === "recepcionista" || funcaoEhSalarioFixo(funcaoAnterior)) {
      const [folhaRows] = await connection.query<any[]>(
        `SELECT semana, liquidez
           FROM folha_pagamento
          WHERE funcionarioId = ? AND lojaId = ? AND ano = ? AND mes = ?
            AND semana IN (1, 2, 3, 4)`,
        [data.id, data.lojaId, ano, mes]
      );

      const valorSemana = (semana: number) =>
        Number(folhaRows.find((row: any) => Number(row.semana) === semana)?.liquidez || 0);

      const quantidadeAnterior1 = funcaoAnterior === "recepcionista" ? valorSemana(1) : 0;
      const quantidadeAnterior2 = funcaoAnterior === "recepcionista" ? valorSemana(2) : 0;
      const valorFixoAnterior = funcaoEhSalarioFixo(funcaoAnterior) ? valorSemana(1) : 0;

      await connection.query(
        `INSERT INTO folha_transicoes_funcao
           (troca_funcao_id, funcionario_id, loja_id, ano, mes,
            quantidade_anterior_1, quantidade_anterior_2, valor_fixo_anterior,
            ultima_alteracao_por, ultima_alteracao_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
           quantidade_anterior_1 = VALUES(quantidade_anterior_1),
           quantidade_anterior_2 = VALUES(quantidade_anterior_2),
           valor_fixo_anterior = VALUES(valor_fixo_anterior),
           ultima_alteracao_por = VALUES(ultima_alteracao_por),
           ultima_alteracao_em = NOW()`,
        [
          trocaFuncaoId,
          data.id,
          data.lojaId,
          ano,
          mes,
          quantidadeAnterior1,
          quantidadeAnterior2,
          valorFixoAnterior,
          data.usuarioNome ?? null,
        ]
      );

      await connection.query(
        `UPDATE folha_pagamento
            SET liquidez = 0,
                percentualComissao = 0,
                valorComissao = 0,
                percentualManual = NULL,
                motivoPercentualManual = NULL
          WHERE funcionarioId = ? AND lojaId = ? AND ano = ? AND mes = ?
            AND semana IN (1, 2, 3, 4)`,
        [data.id, data.lojaId, ano, mes]
      );
    }

    await connection.query(
      `UPDATE funcionarios
          SET funcao = ?, tipoMeta = ?
        WHERE id = ? AND lojaId = ?`,
      [data.novaFuncao, tipoMetaNovo, data.id, data.lojaId]
    );

    await connection.commit();

    return {
      success: true,
      trocaFuncaoId,
      funcaoAnterior,
      funcaoNova: data.novaFuncao,
      dataMudanca: dataMudancaSql,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function getTrocasFuncaoByLojaCompetencia(
  lojaId: number,
  ano: number,
  mes: number
) {
  await ensureTrocaFuncaoTables();
  if (!_pool) return [];

  const inicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const prox = new Date(Date.UTC(ano, mes, 1));
  const fimExclusivo = `${prox.getUTCFullYear()}-${String(prox.getUTCMonth() + 1).padStart(2, "0")}-01`;

  const [rows] = await _pool.query<any[]>(
    `SELECT
       t.id,
       t.funcionario_id AS funcionarioId,
       t.loja_id AS lojaId,
       t.funcao_anterior AS funcaoAnterior,
       t.funcao_nova AS funcaoNova,
       t.tipo_meta_anterior AS tipoMetaAnterior,
       t.tipo_meta_novo AS tipoMetaNovo,
       t.data_mudanca AS dataMudanca,
       t.usuario_nome AS usuarioNome,
       t.criado_em AS criadoEm,
       COALESCE(d.quantidade_anterior_1, 0) AS quantidadeAnterior1,
       COALESCE(d.quantidade_anterior_2, 0) AS quantidadeAnterior2,
       COALESCE(d.valor_fixo_anterior, 0) AS valorFixoAnterior,
       d.ultima_alteracao_por AS ultimaAlteracaoPor,
       d.ultima_alteracao_em AS ultimaAlteracaoEm
     FROM funcionario_trocas_funcao t
     LEFT JOIN folha_transicoes_funcao d
       ON d.troca_funcao_id = t.id AND d.ano = ? AND d.mes = ?
     WHERE t.loja_id = ?
       AND t.data_mudanca >= ?
       AND t.data_mudanca < ?
     ORDER BY t.funcionario_id, t.data_mudanca DESC, t.id DESC`,
    [ano, mes, lojaId, inicio, fimExclusivo]
  );

  return rows || [];
}

export async function getTrocasFuncaoByFuncionario(
  funcionarioId: number,
  lojaId: number
) {
  await ensureTrocaFuncaoTables();
  if (!_pool) return [];

  const [rows] = await _pool.query<any[]>(
    `SELECT
       t.id,
       t.funcionario_id AS funcionarioId,
       t.loja_id AS lojaId,
       t.funcao_anterior AS funcaoAnterior,
       t.funcao_nova AS funcaoNova,
       t.tipo_meta_anterior AS tipoMetaAnterior,
       t.tipo_meta_novo AS tipoMetaNovo,
       DATE_FORMAT(t.data_mudanca, '%Y-%m-%d') AS dataMudanca,
       t.usuario_nome AS usuarioNome,
       t.criado_em AS criadoEm,
       (
         SELECT DATE_FORMAT(c.data_anterior, '%Y-%m-%d')
           FROM funcionario_trocas_funcao_correcoes c
          WHERE c.troca_funcao_id = t.id
          ORDER BY c.id DESC
          LIMIT 1
       ) AS ultimaDataAnterior,
       (
         SELECT DATE_FORMAT(c.data_nova, '%Y-%m-%d')
           FROM funcionario_trocas_funcao_correcoes c
          WHERE c.troca_funcao_id = t.id
          ORDER BY c.id DESC
          LIMIT 1
       ) AS ultimaDataNova,
       (
         SELECT c.usuario_nome
           FROM funcionario_trocas_funcao_correcoes c
          WHERE c.troca_funcao_id = t.id
          ORDER BY c.id DESC
          LIMIT 1
       ) AS corrigidoPor,
       (
         SELECT c.corrigido_em
           FROM funcionario_trocas_funcao_correcoes c
          WHERE c.troca_funcao_id = t.id
          ORDER BY c.id DESC
          LIMIT 1
       ) AS corrigidoEm
     FROM funcionario_trocas_funcao t
     WHERE t.funcionario_id = ? AND t.loja_id = ?
     ORDER BY t.data_mudanca DESC, t.id DESC`,
    [funcionarioId, lojaId]
  );

  return rows || [];
}

export async function corrigirDataTrocaFuncao(data: {
  trocaFuncaoId: number;
  funcionarioId: number;
  lojaId: number;
  novaData: Date;
  usuarioId?: number | null;
  usuarioNome?: string | null;
}) {
  await ensureTrocaFuncaoTables();
  if (!_pool) throw new Error("Banco não conectado");

  const novaDataSql = dataCivilMySQL(data.novaData);

  const [baseRows] = await _pool.query<any[]>(
    `SELECT
       t.id,
       t.funcionario_id AS funcionarioId,
       t.loja_id AS lojaId,
       DATE_FORMAT(t.data_mudanca, '%Y-%m-%d') AS dataMudanca,
       DATE_FORMAT(f.dataAdmissao, '%Y-%m-%d') AS dataAdmissao
     FROM funcionario_trocas_funcao t
     INNER JOIN funcionarios f ON f.id = t.funcionario_id AND f.lojaId = t.loja_id
     WHERE t.id = ? AND t.funcionario_id = ? AND t.loja_id = ?
     LIMIT 1`,
    [data.trocaFuncaoId, data.funcionarioId, data.lojaId]
  );

  const trocaBase = baseRows?.[0];
  if (!trocaBase) {
    throw new Error("Histórico de troca de função não encontrado");
  }

  const dataAnteriorSql = String(trocaBase.dataMudanca || "").slice(0, 10);
  const dataAdmissaoSql = String(trocaBase.dataAdmissao || "").slice(0, 10);

  if (dataAnteriorSql === novaDataSql) {
    return {
      success: true,
      semAlteracao: true,
      trocaFuncaoId: data.trocaFuncaoId,
      dataAnterior: dataAnteriorSql,
      dataNova: novaDataSql,
    };
  }

  if (dataAdmissaoSql && novaDataSql < dataAdmissaoSql) {
    throw new Error("A data da troca não pode ser anterior à admissão");
  }

  // Preserva a sequência histórica caso o funcionário tenha mais de uma troca.
  const [anteriorRows] = await _pool.query<any[]>(
    `SELECT DATE_FORMAT(data_mudanca, '%Y-%m-%d') AS dataMudanca
       FROM funcionario_trocas_funcao
      WHERE funcionario_id = ? AND loja_id = ? AND id < ?
      ORDER BY id DESC
      LIMIT 1`,
    [data.funcionarioId, data.lojaId, data.trocaFuncaoId]
  );

  const [posteriorRows] = await _pool.query<any[]>(
    `SELECT DATE_FORMAT(data_mudanca, '%Y-%m-%d') AS dataMudanca
       FROM funcionario_trocas_funcao
      WHERE funcionario_id = ? AND loja_id = ? AND id > ?
      ORDER BY id ASC
      LIMIT 1`,
    [data.funcionarioId, data.lojaId, data.trocaFuncaoId]
  );

  const trocaAnterior = anteriorRows?.[0]?.dataMudanca
    ? String(anteriorRows[0].dataMudanca).slice(0, 10)
    : "";
  const trocaPosterior = posteriorRows?.[0]?.dataMudanca
    ? String(posteriorRows[0].dataMudanca).slice(0, 10)
    : "";

  if (trocaAnterior && novaDataSql < trocaAnterior) {
    throw new Error(
      `A nova data não pode ser anterior à troca de função anterior (${trocaAnterior}).`
    );
  }

  if (trocaPosterior && novaDataSql > trocaPosterior) {
    throw new Error(
      `A nova data não pode ser posterior à troca de função seguinte (${trocaPosterior}).`
    );
  }

  const anoAnterior = Number(dataAnteriorSql.slice(0, 4));
  const mesAnterior = Number(dataAnteriorSql.slice(5, 7));
  const anoNovo = Number(novaDataSql.slice(0, 4));
  const mesNovo = Number(novaDataSql.slice(5, 7));
  const mudouCompetencia = anoAnterior !== anoNovo || mesAnterior !== mesNovo;

  await assertCompetenciaFolhaAberta(data.lojaId, anoAnterior, mesAnterior);
  if (mudouCompetencia) {
    await assertCompetenciaFolhaAberta(data.lojaId, anoNovo, mesNovo);

    // Se a troca já gerou uma transição financeira, mudar de competência exige
    // reconstruir valores da folha anterior/nova. Bloqueamos para não corromper
    // cálculo e orientamos um ajuste controlado.
    const [transicaoRows] = await _pool.query<any[]>(
      `SELECT id
         FROM folha_transicoes_funcao
        WHERE troca_funcao_id = ?
        LIMIT 1`,
      [data.trocaFuncaoId]
    );

    if (transicaoRows?.[0]) {
      throw new Error(
        "Essa correção muda a competência e a troca possui transição financeira. " +
          "Para preservar os valores da folha, corrija essa movimentação com ajuste assistido."
      );
    }
  }

  const connection = await _pool.getConnection();
  try {
    await connection.beginTransaction();

    const [lockRows] = await connection.query<any[]>(
      `SELECT DATE_FORMAT(data_mudanca, '%Y-%m-%d') AS dataMudanca
         FROM funcionario_trocas_funcao
        WHERE id = ? AND funcionario_id = ? AND loja_id = ?
        LIMIT 1
        FOR UPDATE`,
      [data.trocaFuncaoId, data.funcionarioId, data.lojaId]
    );

    const trocaLock = lockRows?.[0];
    if (!trocaLock) {
      throw new Error("Histórico de troca de função não encontrado");
    }

    const dataAtualLock = String(trocaLock.dataMudanca || "").slice(0, 10);

    await connection.query(
      `INSERT INTO funcionario_trocas_funcao_correcoes
         (troca_funcao_id, funcionario_id, loja_id, data_anterior, data_nova,
          usuario_id, usuario_nome)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        data.trocaFuncaoId,
        data.funcionarioId,
        data.lojaId,
        dataAtualLock,
        novaDataSql,
        data.usuarioId ?? null,
        data.usuarioNome ?? null,
      ]
    );

    await connection.query(
      `UPDATE funcionario_trocas_funcao
          SET data_mudanca = ?
        WHERE id = ? AND funcionario_id = ? AND loja_id = ?`,
      [novaDataSql, data.trocaFuncaoId, data.funcionarioId, data.lojaId]
    );

    await connection.commit();

    return {
      success: true,
      trocaFuncaoId: data.trocaFuncaoId,
      dataAnterior: dataAtualLock,
      dataNova: novaDataSql,
      mudouCompetencia,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function upsertFolhaTransicaoFuncao(data: {
  trocaFuncaoId: number;
  funcionarioId: number;
  lojaId: number;
  ano: number;
  mes: number;
  quantidadeAnterior1: number;
  quantidadeAnterior2?: number;
  valorFixoAnterior?: number;
  ultimaAlteracaoPor?: string | null;
  ultimaAlteracaoEm?: Date | null;
}) {
  await ensureTrocaFuncaoTables();
  if (!_pool) throw new Error("Banco não conectado");

  await assertCompetenciaFolhaAberta(data.lojaId, data.ano, data.mes);

  const [trocaRows] = await _pool.query<any[]>(
    `SELECT id
       FROM funcionario_trocas_funcao
      WHERE id = ? AND funcionario_id = ? AND loja_id = ?
      LIMIT 1`,
    [data.trocaFuncaoId, data.funcionarioId, data.lojaId]
  );

  if (!trocaRows?.[0]) {
    throw new Error("Histórico de troca de função não encontrado");
  }

  await _pool.query(
    `INSERT INTO folha_transicoes_funcao
       (troca_funcao_id, funcionario_id, loja_id, ano, mes,
        quantidade_anterior_1, quantidade_anterior_2, valor_fixo_anterior,
        ultima_alteracao_por, ultima_alteracao_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       quantidade_anterior_1 = VALUES(quantidade_anterior_1),
       quantidade_anterior_2 = VALUES(quantidade_anterior_2),
       valor_fixo_anterior = VALUES(valor_fixo_anterior),
       ultima_alteracao_por = VALUES(ultima_alteracao_por),
       ultima_alteracao_em = VALUES(ultima_alteracao_em)`,
    [
      data.trocaFuncaoId,
      data.funcionarioId,
      data.lojaId,
      data.ano,
      data.mes,
      Number(data.quantidadeAnterior1 || 0),
      Number(data.quantidadeAnterior2 || 0),
      Number(data.valorFixoAnterior || 0),
      data.ultimaAlteracaoPor ?? null,
      data.ultimaAlteracaoEm ?? null,
    ]
  );

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
let _valeRepasseFieldsReady = false;

async function ensureValeRepasseFields() {
  if (_valeRepasseFieldsReady) return;

  await getDb();
  if (!_pool) throw new Error("Banco não conectado");

  const [columns] = await _pool.query<any[]>(
    `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'vales'`
  );

  const existentes = new Set(
    (columns || []).map((row: any) => String(row.COLUMN_NAME || row.column_name || ""))
  );

  const alteracoes: string[] = [];

  if (!existentes.has("dataVale")) {
    alteracoes.push("ADD COLUMN dataVale DATE NULL");
  }
  if (!existentes.has("repasseBeneficiario")) {
    alteracoes.push("ADD COLUMN repasseBeneficiario VARCHAR(100) NULL");
  }
  if (!existentes.has("repasseValor")) {
    alteracoes.push("ADD COLUMN repasseValor DECIMAL(12,2) NULL");
  }
  if (!existentes.has("repasseStatus")) {
    alteracoes.push(
      "ADD COLUMN repasseStatus ENUM('pendente','pago') NULL"
    );
  }
  if (!existentes.has("repassePagoEm")) {
    alteracoes.push("ADD COLUMN repassePagoEm DATETIME NULL");
  }
  if (!existentes.has("repassePagoPor")) {
    alteracoes.push("ADD COLUMN repassePagoPor VARCHAR(255) NULL");
  }

  for (const alteracao of alteracoes) {
    try {
      await _pool.query(`ALTER TABLE vales ${alteracao}`);
    } catch (error: any) {
      // Em deploys simultâneos, outra instância pode ter criado a coluna primeiro.
      if (String(error?.code || "") !== "ER_DUP_FIELDNAME") throw error;
    }
  }

  _valeRepasseFieldsReady = true;
}

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

  await ensureValeRepasseFields();
  if (!_pool) throw new Error("Banco não conectado");

  const [valesRaw] = await _pool.query<any[]>(
    `SELECT
       id, funcionarioId, lojaId, grupoId, descricao, valorTotal, valorParcela,
       parcelas, parcelaAtual, ano, mes, mesOrigem, tipo, status,
       ultima_alteracao_por AS ultimaAlteracaoPor,
       ultima_alteracao_em AS ultimaAlteracaoEm,
       DATE_FORMAT(dataVale, '%Y-%m-%d') AS dataVale,
       repasseBeneficiario, repasseValor, repasseStatus, repassePagoEm, repassePagoPor
     FROM vales
     WHERE lojaId = ? AND ano = ? AND mes = ? AND status = 'ativo'`,
    [lojaId, ano, mes]
  );

  const valesRows = Array.isArray(valesRaw) ? valesRaw : [];

  const [premiosRows, obsRows, descontosRows] =
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
    dataVale?: string | null;
    repasseBeneficiario?: string | null;
    repasseValor?: number | null;
    repasseStatus?: "pendente" | "pago" | null;
    repassePagoEm?: Date | null;
    repassePagoPor?: string | null;

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
      dataVale: (row as any).dataVale || null,
      repasseBeneficiario: (row as any).repasseBeneficiario || null,
      repasseValor:
        (row as any).repasseValor == null ? null : Number((row as any).repasseValor),
      repasseStatus: ((row as any).repasseStatus || null) as
        | "pendente"
        | "pago"
        | null,
      repassePagoEm: (row as any).repassePagoEm || null,
      repassePagoPor: (row as any).repassePagoPor || null,

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
    dataVale?: string | null;
    repasseBeneficiario?: "Franklyn" | null;
  }>;

  ultimaAlteracaoPor?: string | null;
  ultimaAlteracaoEm?: Date | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco não conectado");

  if (!data.items.length) return { success: true };

  await ensureValeRepasseFields();
  if (!_pool) throw new Error("Banco não conectado");

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

  // Os campos de repasse são mantidos fora do schema Drizzle atual para não
  // exigir troca de schema/migration nesta etapa. Cada parcela recebe o mesmo
  // beneficiário e o valor a repassar é exatamente o valor daquela parcela.
  for (const item of data.items) {
    if (!item.dataVale && !item.repasseBeneficiario) continue;

    await _pool.query(
      `UPDATE vales
          SET dataVale = ?,
              repasseBeneficiario = ?,
              repasseValor = ?,
              repasseStatus = ?,
              repassePagoEm = NULL,
              repassePagoPor = NULL
        WHERE funcionarioId = ?
          AND lojaId = ?
          AND grupoId = ?
          AND ano = ?
          AND mes = ?
          AND parcelaAtual = ?
          AND status = 'ativo'`,
      [
        item.dataVale || null,
        item.repasseBeneficiario || null,
        item.repasseBeneficiario ? item.valorParcela.toFixed(2) : null,
        item.repasseBeneficiario ? "pendente" : null,
        data.funcionarioId,
        data.lojaId,
        item.grupoId,
        item.ano,
        item.mes,
        item.parcelaAtual,
      ]
    );
  }

  return { success: true };
}

export async function getRepassesFranklynByAnoMes(ano: number, mes: number) {
  await ensureValeRepasseFields();
  if (!_pool) throw new Error("Banco não conectado");

  const [rows] = await _pool.query<any[]>(
    `SELECT
       v.id,
       v.funcionarioId,
       f.nome AS funcionarioNome,
       v.lojaId,
       l.nome AS lojaNome,
       DATE_FORMAT(v.dataVale, '%Y-%m-%d') AS dataVale,
       v.descricao,
       COALESCE(v.repasseValor, v.valorParcela) AS valor,
       v.parcelaAtual,
       v.parcelas AS totalParcelas,
       COALESCE(v.repasseStatus, 'pendente') AS repasseStatus,
       v.repassePagoEm,
       v.repassePagoPor
     FROM vales v
     INNER JOIN funcionarios f ON f.id = v.funcionarioId
     LEFT JOIN lojas l ON l.id = v.lojaId
     WHERE v.ano = ?
       AND v.mes = ?
       AND v.status = 'ativo'
       AND v.repasseBeneficiario = 'Franklyn'
     ORDER BY
       CASE WHEN COALESCE(v.repasseStatus, 'pendente') = 'pendente' THEN 0 ELSE 1 END,
       v.dataVale, l.nome, f.nome, v.id`,
    [ano, mes]
  );

  return (rows || []).map((row: any) => ({
    ...row,
    id: Number(row.id),
    funcionarioId: Number(row.funcionarioId),
    lojaId: Number(row.lojaId),
    valor: Number(row.valor || 0),
    parcelaAtual: Number(row.parcelaAtual || 1),
    totalParcelas: Number(row.totalParcelas || 1),
  }));
}

export async function setRepasseFranklynPago(data: {
  valeId: number;
  pago: boolean;
  usuarioNome: string;
}) {
  await ensureValeRepasseFields();
  if (!_pool) throw new Error("Banco não conectado");

  const [rows] = await _pool.query<any[]>(
    `SELECT id, repasseBeneficiario
       FROM vales
      WHERE id = ? AND status = 'ativo'
      LIMIT 1`,
    [data.valeId]
  );

  const vale = rows?.[0];
  if (!vale || String(vale.repasseBeneficiario || "") !== "Franklyn") {
    throw new Error("Repasse ao Franklyn não encontrado");
  }

  await _pool.query(
    `UPDATE vales
        SET repasseStatus = ?,
            repassePagoEm = ?,
            repassePagoPor = ?
      WHERE id = ?`,
    [
      data.pago ? "pago" : "pendente",
      data.pago ? new Date() : null,
      data.pago ? data.usuarioNome : null,
      data.valeId,
    ]
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
  await ensureValeRepasseFields();
  if (!_pool) throw new Error("Banco não conectado");

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
    const [repasseRows] = await _pool.query<any[]>(
      `SELECT repasseBeneficiario, repasseStatus FROM vales WHERE id = ? LIMIT 1`,
      [row.id]
    );

    if (
      String(repasseRows?.[0]?.repasseBeneficiario || "") === "Franklyn" &&
      String(repasseRows?.[0]?.repasseStatus || "") === "pago"
    ) {
      throw new Error(
        "Este vale já foi pago ao Franklyn e não pode ser excluído. Desfaça o pagamento do repasse primeiro."
      );
    }

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

let _funcaoSemanaColumnReady = false;

async function ensureFuncaoSemanaColumn() {
  if (_funcaoSemanaColumnReady) return;

  const db = await getDb();
  if (!db || !_pool) throw new Error("Banco não conectado");

  // Compatibilidade sem migration manual: cria as colunas de histórico semanal
  // somente quando ainda não existirem.
  const [funcaoColumns] = await _pool.query(
    `SHOW COLUMNS FROM folha_pagamento LIKE 'funcaoSemana'`
  );

  if (!Array.isArray(funcaoColumns) || funcaoColumns.length === 0) {
    await _pool.query(
      `ALTER TABLE folha_pagamento ADD COLUMN funcaoSemana VARCHAR(30) NULL AFTER semana`
    );
  }

  const [composicaoColumns] = await _pool.query(
    `SHOW COLUMNS FROM folha_pagamento LIKE 'composicaoSemana'`
  );

  if (!Array.isArray(composicaoColumns) || composicaoColumns.length === 0) {
    await _pool.query(
      `ALTER TABLE folha_pagamento ADD COLUMN composicaoSemana JSON NULL AFTER funcaoSemana`
    );
  }

  _funcaoSemanaColumnReady = true;
}

let _folhaSem5ConfigReady = false;

async function ensureFolhaSem5ConfigTable() {
  if (_folhaSem5ConfigReady) return;

  const db = await getDb();
  if (!db || !_pool) throw new Error("Banco não conectado");

  await _pool.query(`
    CREATE TABLE IF NOT EXISTS folha_sem5_config (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      loja_id INT NOT NULL,
      ano INT NOT NULL,
      mes INT NOT NULL,
      sem5_ativa TINYINT(1) NOT NULL DEFAULT 0,
      ultima_alteracao_por VARCHAR(255) NULL,
      ultima_alteracao_em DATETIME NULL,
      criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_folha_sem5_competencia (loja_id, ano, mes)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  _folhaSem5ConfigReady = true;
}

export async function getFolhaSem5Status(lojaId: number, ano: number, mes: number) {
  await ensureFolhaSem5ConfigTable();
  if (!_pool) return { lojaId, ano, mes, ativa: false };

  const [rows] = await _pool.query<any[]>(
    `SELECT sem5_ativa AS ativa
       FROM folha_sem5_config
      WHERE loja_id = ? AND ano = ? AND mes = ?
      LIMIT 1`,
    [lojaId, ano, mes]
  );

  const [dadosSem5] = await _pool.query<any[]>(
    `SELECT id
       FROM folha_pagamento
      WHERE lojaId = ? AND ano = ? AND mes = ? AND semana = 7
      LIMIT 1`,
    [lojaId, ano, mes]
  );

  return {
    lojaId,
    ano,
    mes,
    ativa: Boolean(Number(rows?.[0]?.ativa || 0)) || Boolean(dadosSem5?.[0]),
  };
}

export async function ativarFolhaSem5(data: {
  lojaId: number;
  ano: number;
  mes: number;
  usuarioNome?: string | null;
}) {
  await ensureFolhaSem5ConfigTable();
  if (!_pool) throw new Error("Banco não conectado");

  await assertCompetenciaFolhaAberta(data.lojaId, data.ano, data.mes);

  await _pool.query(
    `INSERT INTO folha_sem5_config
       (loja_id, ano, mes, sem5_ativa, ultima_alteracao_por, ultima_alteracao_em)
     VALUES (?, ?, ?, 1, ?, NOW())
     ON DUPLICATE KEY UPDATE
       sem5_ativa = 1,
       ultima_alteracao_por = VALUES(ultima_alteracao_por),
       ultima_alteracao_em = NOW()`,
    [data.lojaId, data.ano, data.mes, data.usuarioNome ?? null]
  );

  return getFolhaSem5Status(data.lojaId, data.ano, data.mes);
}

export async function desativarFolhaSem5(data: {
  lojaId: number;
  ano: number;
  mes: number;
  usuarioNome?: string | null;
}) {
  await ensureFolhaSem5ConfigTable();
  if (!_pool) throw new Error("Banco não conectado");

  await assertCompetenciaFolhaAberta(data.lojaId, data.ano, data.mes);

  // A SEM5 real é armazenada como semana=7 para não conflitar com os campos
  // especiais já existentes nas posições 5 e 6. Se houver qualquer lançamento
  // financeiro ou composição de função, protegemos os dados e não removemos.
  const [rowsComDados] = await _pool.query<any[]>(
    `SELECT id
       FROM folha_pagamento
      WHERE lojaId = ?
        AND ano = ?
        AND mes = ?
        AND semana = 7
        AND (
          COALESCE(liquidez, 0) <> 0
          OR COALESCE(percentualComissao, 0) <> 0
          OR COALESCE(valorComissao, 0) <> 0
          OR percentualManual IS NOT NULL
          OR (composicaoSemana IS NOT NULL AND JSON_LENGTH(composicaoSemana) > 0)
        )
      LIMIT 1`,
    [data.lojaId, data.ano, data.mes]
  );

  if (rowsComDados?.[0]) {
    throw new Error(
      "A SEM5 possui lançamentos. Zere ou remova os dados da quinta semana antes de desativá-la."
    );
  }

  // Linhas vazias não representam lançamento. Elas são removidas para evitar
  // que o status da SEM5 seja reativado automaticamente.
  await _pool.query(
    `DELETE FROM folha_pagamento
      WHERE lojaId = ? AND ano = ? AND mes = ? AND semana = 7`,
    [data.lojaId, data.ano, data.mes]
  );

  await _pool.query(
    `INSERT INTO folha_sem5_config
       (loja_id, ano, mes, sem5_ativa, ultima_alteracao_por, ultima_alteracao_em)
     VALUES (?, ?, ?, 0, ?, NOW())
     ON DUPLICATE KEY UPDATE
       sem5_ativa = 0,
       ultima_alteracao_por = VALUES(ultima_alteracao_por),
       ultima_alteracao_em = NOW()`,
    [data.lojaId, data.ano, data.mes, data.usuarioNome ?? null]
  );

  return getFolhaSem5Status(data.lojaId, data.ano, data.mes);
}

export async function getFolhaBaseByLojaAnoMes(lojaId: number, ano: number, mes: number) {
  console.log("BUSCANDO FOLHA:", lojaId, ano, mes);
  const db = await getDb();
  if (!db || !_pool) return [];

  await ensureFuncaoSemanaColumn();

  const [rows] = await _pool.query(
    `SELECT *
       FROM folha_pagamento
      WHERE lojaId = ?
        AND ano = ?
        AND mes = ?
      ORDER BY funcionarioId, semana`,
    [lojaId, ano, mes]
  );

  return Array.isArray(rows) ? rows : [];
}

export async function upsertFolhaBaseItem(data: {
  funcionarioId: number;
  lojaId: number;
  ano: number;
  mes: number;
  semana: number;
  funcaoSemana?: "vendedor" | "mecanico" | null;
  composicaoSemana?: Array<{
    funcao: "vendedor" | "mecanico";
    liquidez: number;
    percentual: number;
    comissao: number;
  }> | null;
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
  await ensureFuncaoSemanaColumn();

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
    const {
      funcaoSemana: _funcaoSemana,
      composicaoSemana: _composicaoSemana,
      ...dataBase
    } = data;

    await db.insert(folhaPagamento).values({
  ...dataBase,
  percentualManual: data.percentualManual ?? null,
  motivoPercentualManual: data.motivoPercentualManual ?? null,
  ultimaAlteracaoPor: data.ultimaAlteracaoPor ?? null,
  ultimaAlteracaoEm: data.ultimaAlteracaoEm ?? null,
} as any);
  }

  // Só altera a função histórica quando o chamador a informa.
  // Edições manuais posteriores de liquidez/percentual não apagam esse histórico.
  if (data.funcaoSemana !== undefined && _pool) {
    await _pool.query(
      `UPDATE folha_pagamento
          SET funcaoSemana = ?
        WHERE funcionarioId = ?
          AND lojaId = ?
          AND ano = ?
          AND mes = ?
          AND semana = ?`,
      [
        data.funcaoSemana ?? null,
        data.funcionarioId,
        data.lojaId,
        data.ano,
        data.mes,
        data.semana,
      ]
    );
  }

  if (data.composicaoSemana !== undefined && _pool) {
    await _pool.query(
      `UPDATE folha_pagamento
          SET composicaoSemana = ?
        WHERE funcionarioId = ?
          AND lojaId = ?
          AND ano = ?
          AND mes = ?
          AND semana = ?`,
      [
        data.composicaoSemana === null
          ? null
          : JSON.stringify(data.composicaoSemana),
        data.funcionarioId,
        data.lojaId,
        data.ano,
        data.mes,
        data.semana,
      ]
    );
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

// ===== RH - Conferência diária de ponto =====

type RhPontoPeriodo =
  | "entrada"
  | "saida_almoco"
  | "retorno_almoco"
  | "saida";

type RhPontoRegistroImportado = {
  data: string;
  nomePdf: string;
  entrada1?: string | null;
  saida1?: string | null;
  entrada2?: string | null;
  saida2?: string | null;
};

type RhPontoStatusAnalise =
  | "ok"
  | "atraso_registrado"
  | "atraso"
  | "almoco_excedido"
  | "intervalo_inferior"
  | "sem_batida"
  | "falta"
  | "falta_tratada"
  | "saida_antecipada"
  | "jornada_nao_cadastrada"
  | "nao_identificado"
  | "duplicado_relatorio"
  | "ausente_relatorio"
  | "aguardando_horario"
  | "atestado";

type RhPontoTratativaTipo =
  | "advertencia"
  | "atestado"
  | "justificativa"
  | "falta";

const RH_PONTO_HORARIOS: Record<RhPontoPeriodo, string> = {
  entrada: "10:00",
  saida_almoco: "12:30",
  retorno_almoco: "14:30",
  saida: "17:45",
};

// Política interna informada:
// - até 10 minutos após a entrada: OK / dentro da tolerância;
// - 11 a 15 minutos: atraso registrado, sem advertência obrigatória;
// - acima de 15 minutos: ocorrência que exige tratativa.
const RH_PONTO_TOLERANCIA_ATRASO_MINUTOS = 10;
const RH_PONTO_LIMITE_ADVERTENCIA_ATRASO_MINUTOS = 15;

const RH_PONTO_CAMPOS: Record<
  RhPontoPeriodo,
  {
    tipo: "entrada_fixa" | "inicio_almoco" | "duracao_almoco" | "saida_fixa";
    registro: "entrada1" | "saida1" | "entrada2" | "saida2";
  }
> = {
  entrada: { tipo: "entrada_fixa", registro: "entrada1" },
  saida_almoco: { tipo: "inicio_almoco", registro: "saida1" },
  retorno_almoco: { tipo: "duracao_almoco", registro: "entrada2" },
  saida: { tipo: "saida_fixa", registro: "saida2" },
};

const RH_PONTO_TIPOS_QUE_EXIGEM_TRATATIVA = new Set([
  "atraso",
  "almoco_excedido",
  "sem_batida",
  "falta",
  "saida_antecipada",
  "ausente_relatorio",
]);

function formatarDuracaoRh(minutos: number) {
  const total = Math.max(0, Math.round(Number(minutos || 0)));
  const horas = Math.floor(total / 60);
  const resto = total % 60;
  return `${String(horas).padStart(2, "0")}:${String(resto).padStart(2, "0")}`;
}

function calcularDuracaoIntervaloRh(saida: string, retorno: string) {
  const inicio = minutosDoHorarioRh(saida);
  let fim = minutosDoHorarioRh(retorno);

  if (fim < inicio) fim += 24 * 60;
  return Math.max(0, fim - inicio);
}

function normalizarDataCivilRh(dataReferencia: string) {
  const valor = String(dataReferencia || "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    throw new Error("Data de referência inválida");
  }

  return valor;
}

function somarDiasDataCivilRh(dataCivil: string, dias: number) {
  const [ano, mes, dia] = normalizarDataCivilRh(dataCivil).split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  data.setUTCDate(data.getUTCDate() + Number(dias || 0));
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, "0")}-${String(
    data.getUTCDate()
  ).padStart(2, "0")}`;
}

function minutosDoHorarioRh(horario: string) {
  const match = String(horario || "").match(/^([01]\d|2[0-3]):([0-5]\d)$/);

  if (!match) {
    throw new Error("Horário inválido");
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

function calcularMinutosAtrasoRh(horarioPrevisto: string, horarioBatida: string) {
  return Math.max(
    0,
    minutosDoHorarioRh(horarioBatida) - minutosDoHorarioRh(horarioPrevisto)
  );
}

function normalizarNomeRhPonto(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizarBatidaRhPonto(value?: string | null) {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return null;
  if (raw === "FALTA") return "FALTA";
  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(raw)) {
    throw new Error(`Batida inválida no relatório: ${raw}`);
  }
  return raw;
}

let _rhPontoTablesReady = false;

async function ensureRhPontoTables() {
  if (_rhPontoTablesReady) return;

  await getDb();

  if (!_pool) {
    throw new Error("Pool do banco não disponível");
  }

  await _pool.query(`
    CREATE TABLE IF NOT EXISTS rh_ponto_conferencias (
      id INT NOT NULL AUTO_INCREMENT,
      lojaId INT NOT NULL,
      dataReferencia DATE NOT NULL,
      periodo ENUM('entrada','saida_almoco','retorno_almoco','saida') NOT NULL,
      horarioPrevisto VARCHAR(5) NOT NULL,
      conferidoPorUsuarioId INT NOT NULL,
      conferidoPorNome VARCHAR(255) NOT NULL,
      conferidoEm DATETIME NOT NULL,
      observacao TEXT NULL,
      origem VARCHAR(20) NOT NULL DEFAULT 'manual',
      relatorioNome VARCHAR(255) NULL,
      relatorioHash VARCHAR(64) NULL,
      relatorioTotalLinhas INT NOT NULL DEFAULT 0,
      relatorioDadosJson LONGTEXT NULL,
      relatorioImportadoEm DATETIME NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_rh_ponto_conferencia (lojaId, dataReferencia, periodo),
      KEY idx_rh_ponto_conferencia_data (dataReferencia),
      KEY idx_rh_ponto_conferencia_loja (lojaId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await _pool.query(`
    CREATE TABLE IF NOT EXISTS rh_ponto_ocorrencias (
      id INT NOT NULL AUTO_INCREMENT,
      conferenciaId INT NOT NULL,
      lojaId INT NOT NULL,
      funcionarioId INT NOT NULL,
      horarioPrevisto VARCHAR(10) NOT NULL,
      horarioBatida VARCHAR(20) NOT NULL,
      minutosAtraso INT NOT NULL DEFAULT 0,
      observacao TEXT NULL,
      tipoOcorrencia VARCHAR(30) NULL,
      nomePdf VARCHAR(255) NULL,
      advertenciaObrigatoria TINYINT(1) NOT NULL DEFAULT 0,
      advertenciaStatus ENUM('pendente','anexada','dispensada') NOT NULL DEFAULT 'dispensada',
      advertenciaArquivoNome VARCHAR(255) NULL,
      advertenciaArquivoUrl TEXT NULL,
      advertenciaAnexadaEm DATETIME NULL,
      advertenciaAnexadaPorUsuarioId INT NULL,
      advertenciaAnexadaPorNome VARCHAR(255) NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_rh_ponto_ocorrencia_conferencia (conferenciaId),
      KEY idx_rh_ponto_ocorrencia_funcionario (funcionarioId),
      KEY idx_rh_ponto_ocorrencia_loja (lojaId),
      KEY idx_rh_ponto_ocorrencia_advertencia (advertenciaStatus)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await _pool.query(`
    CREATE TABLE IF NOT EXISTS rh_ponto_tratativas (
      id INT NOT NULL AUTO_INCREMENT,
      ocorrenciaId INT NOT NULL,
      conferenciaId INT NOT NULL,
      lojaId INT NOT NULL,
      funcionarioId INT NOT NULL,
      tipo VARCHAR(30) NOT NULL,
      observacao TEXT NULL,
      diasAtestado INT NULL,
      dataInicioAtestado DATE NULL,
      dataFimAtestado DATE NULL,
      documentoStatus VARCHAR(30) NOT NULL DEFAULT 'pendente_documento',
      documentoKey TEXT NULL,
      documentoNome VARCHAR(255) NULL,
      documentoMime VARCHAR(120) NULL,
      documentoTamanho INT NULL,
      criadoPorUsuarioId INT NOT NULL,
      criadoPorNome VARCHAR(255) NOT NULL,
      criadoEm DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      documentoAnexadoPorUsuarioId INT NULL,
      documentoAnexadoPorNome VARCHAR(255) NULL,
      documentoAnexadoEm DATETIME NULL,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_rh_ponto_tratativa_ocorrencia (ocorrenciaId),
      KEY idx_rh_ponto_tratativa_loja_status (lojaId, documentoStatus),
      KEY idx_rh_ponto_tratativa_funcionario (funcionarioId),
      KEY idx_rh_ponto_tratativa_atestado (funcionarioId, dataInicioAtestado, dataFimAtestado)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await _pool.query(`
    CREATE TABLE IF NOT EXISTS rh_ponto_cadastros_pendentes (
      id INT NOT NULL AUTO_INCREMENT,
      conferenciaId INT NOT NULL,
      lojaId INT NOT NULL,
      dataReferencia DATE NOT NULL,
      periodo VARCHAR(30) NOT NULL,
      tipo VARCHAR(30) NOT NULL,
      nomePdf VARCHAR(255) NOT NULL,
      funcionarioId INT NULL,
      mensagem TEXT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pendente',
      resolvidoEm DATETIME NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_rh_ponto_cadastro_pendente (conferenciaId, tipo, nomePdf),
      KEY idx_rh_ponto_cadastro_status (status, lojaId),
      KEY idx_rh_ponto_cadastro_data (dataReferencia)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Vínculo persistente entre o nome que vem no Secullum e o funcionário correto.
  // Ex.: "GIOVANNI ... GOULART" no PDF pode apontar para um cadastro com pequena
  // divergência de digitação, sem obrigar a alterar o nome oficial do funcionário.
  await _pool.query(`
    CREATE TABLE IF NOT EXISTS rh_ponto_vinculos_nome (
      id INT NOT NULL AUTO_INCREMENT,
      lojaId INT NOT NULL,
      nomePdf VARCHAR(255) NOT NULL,
      nomePdfNormalizado VARCHAR(255) NOT NULL,
      funcionarioId INT NOT NULL,
      criadoPorUsuarioId INT NULL,
      criadoPorNome VARCHAR(255) NULL,
      criadoEm DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_rh_ponto_vinculo_nome (lojaId, nomePdfNormalizado),
      KEY idx_rh_ponto_vinculo_funcionario (funcionarioId),
      KEY idx_rh_ponto_vinculo_loja (lojaId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const adicionarColunasFaltantes = async (
    tabela: string,
    colunas: Array<{ nome: string; ddl: string }>
  ) => {
    const [rows] = await _pool!.query<any[]>(
      `SELECT COLUMN_NAME
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?`,
      [tabela]
    );

    const existentes = new Set(
      (rows || []).map((row: any) => String(row.COLUMN_NAME || row.column_name || ""))
    );

    for (const coluna of colunas) {
      if (existentes.has(coluna.nome)) continue;
      try {
        await _pool!.query(`ALTER TABLE ${tabela} ${coluna.ddl}`);
      } catch (error: any) {
        if (String(error?.code || "") !== "ER_DUP_FIELDNAME") throw error;
      }
    }
  };

  await adicionarColunasFaltantes("rh_ponto_conferencias", [
    { nome: "origem", ddl: "ADD COLUMN origem VARCHAR(20) NOT NULL DEFAULT 'manual' AFTER observacao" },
    { nome: "relatorioNome", ddl: "ADD COLUMN relatorioNome VARCHAR(255) NULL AFTER origem" },
    { nome: "relatorioHash", ddl: "ADD COLUMN relatorioHash VARCHAR(64) NULL AFTER relatorioNome" },
    { nome: "relatorioTotalLinhas", ddl: "ADD COLUMN relatorioTotalLinhas INT NOT NULL DEFAULT 0 AFTER relatorioHash" },
    { nome: "relatorioDadosJson", ddl: "ADD COLUMN relatorioDadosJson LONGTEXT NULL AFTER relatorioTotalLinhas" },
    { nome: "relatorioImportadoEm", ddl: "ADD COLUMN relatorioImportadoEm DATETIME NULL AFTER relatorioDadosJson" },
  ]);

  await adicionarColunasFaltantes("rh_ponto_ocorrencias", [
    { nome: "tipoOcorrencia", ddl: "ADD COLUMN tipoOcorrencia VARCHAR(30) NULL AFTER observacao" },
    { nome: "nomePdf", ddl: "ADD COLUMN nomePdf VARCHAR(255) NULL AFTER tipoOcorrencia" },
  ]);

  // Compatibilidade com versões antigas.
  await _pool.query(
    "ALTER TABLE rh_ponto_ocorrencias MODIFY COLUMN horarioPrevisto VARCHAR(10) NOT NULL"
  );
  await _pool.query(
    "ALTER TABLE rh_ponto_ocorrencias MODIFY COLUMN horarioBatida VARCHAR(20) NOT NULL"
  );

  _rhPontoTablesReady = true;
}

function agruparRhPontoRows(rows: any[]) {
  const mapa = new Map<number, any>();

  for (const row of rows || []) {
    const id = Number(row.id);

    if (!mapa.has(id)) {
      mapa.set(id, {
        id,
        lojaId: Number(row.lojaId),
        lojaNome: row.lojaNome || `Loja ${row.lojaId}`,
        dataReferencia: String(row.dataReferencia || "").slice(0, 10),
        periodo: row.periodo,
        horarioPrevisto: row.horarioPrevisto,
        conferidoPorUsuarioId: Number(row.conferidoPorUsuarioId),
        conferidoPorNome: row.conferidoPorNome,
        conferidoEm: row.conferidoEm,
        observacao: row.observacao ?? null,
        origem: row.origem || "manual",
        relatorioNome: row.relatorioNome ?? null,
        relatorioHash: row.relatorioHash ?? null,
        relatorioTotalLinhas: Number(row.relatorioTotalLinhas || 0),
        relatorioImportadoEm: row.relatorioImportadoEm ?? null,
        ocorrencias: [],
      });
    }

    if (row.ocorrenciaId !== null && row.ocorrenciaId !== undefined) {
      mapa.get(id).ocorrencias.push({
        id: Number(row.ocorrenciaId),
        conferenciaId: id,
        lojaId: Number(row.lojaId),
        funcionarioId: Number(row.funcionarioId),
        funcionarioNome: row.funcionarioNome || "",
        funcionarioFuncao: row.funcionarioFuncao || "",
        horarioPrevisto: row.ocorrenciaHorarioPrevisto,
        horarioBatida: row.horarioBatida,
        minutosAtraso: Number(row.minutosAtraso || 0),
        observacao: row.ocorrenciaObservacao ?? null,
        tipoOcorrencia: row.tipoOcorrencia ?? null,
        nomePdf: row.nomePdf ?? null,
        tratativaId: row.tratativaId !== null && row.tratativaId !== undefined ? Number(row.tratativaId) : null,
        tratativaTipo: row.tratativaTipo ?? null,
        documentoStatus: row.documentoStatus ?? null,
      });
    }
  }

  return Array.from(mapa.values());
}

async function consultarRhPonto(args: {
  dataInicio: string;
  dataFim: string;
  lojaId?: number | null;
}) {
  await ensureRhPontoTables();

  if (!_pool) {
    throw new Error("Pool do banco não disponível");
  }

  const dataInicio = normalizarDataCivilRh(args.dataInicio);
  const dataFim = normalizarDataCivilRh(args.dataFim);

  const parametros: Array<string | number> = [dataInicio, dataFim];

  let filtroLoja = "";
  if (args.lojaId !== null && args.lojaId !== undefined) {
    filtroLoja = " AND c.lojaId = ? ";
    parametros.push(Number(args.lojaId));
  }

  const [rows] = await _pool.query(
    `
      SELECT
        c.id,
        c.lojaId,
        l.nome AS lojaNome,
        DATE_FORMAT(c.dataReferencia, '%Y-%m-%d') AS dataReferencia,
        c.periodo,
        c.horarioPrevisto,
        c.conferidoPorUsuarioId,
        c.conferidoPorNome,
        c.conferidoEm,
        c.observacao,
        c.origem,
        c.relatorioNome,
        c.relatorioHash,
        c.relatorioTotalLinhas,
        c.relatorioImportadoEm,
        o.id AS ocorrenciaId,
        o.funcionarioId,
        f.nome AS funcionarioNome,
        f.funcao AS funcionarioFuncao,
        o.horarioPrevisto AS ocorrenciaHorarioPrevisto,
        o.horarioBatida,
        o.minutosAtraso,
        o.observacao AS ocorrenciaObservacao,
        o.tipoOcorrencia,
        o.nomePdf,
        t.id AS tratativaId,
        t.tipo AS tratativaTipo,
        t.documentoStatus
      FROM rh_ponto_conferencias c
      INNER JOIN lojas l ON l.id = c.lojaId
      LEFT JOIN rh_ponto_ocorrencias o ON o.conferenciaId = c.id
      LEFT JOIN funcionarios f ON f.id = o.funcionarioId
      LEFT JOIN rh_ponto_tratativas t ON t.ocorrenciaId = o.id
      WHERE c.dataReferencia BETWEEN ? AND ?
      ${filtroLoja}
      ORDER BY
        c.dataReferencia DESC,
        c.lojaId ASC,
        FIELD(c.periodo, 'entrada', 'saida_almoco', 'retorno_almoco', 'saida'),
        f.nome ASC
    `,
    parametros
  );

  return agruparRhPontoRows(rows as any[]);
}

export async function getRhPontoDia(lojaId: number, dataReferencia: string) {
  const data = normalizarDataCivilRh(dataReferencia);

  return consultarRhPonto({
    dataInicio: data,
    dataFim: data,
    lojaId,
  });
}

export async function getRhPontoHistorico(args: {
  dataInicio: string;
  dataFim: string;
  lojaId?: number | null;
}) {
  return consultarRhPonto(args);
}

async function getAtestadosAtivosNoDia(lojaId: number, dataReferencia: string) {
  await ensureRhPontoTables();
  if (!_pool) throw new Error("Pool do banco não disponível");

  const [rows] = await _pool.query<any[]>(
    `SELECT t.funcionarioId, t.documentoStatus, t.dataInicioAtestado, t.dataFimAtestado
       FROM rh_ponto_tratativas t
      WHERE t.lojaId = ?
        AND t.tipo = 'atestado'
        AND t.dataInicioAtestado IS NOT NULL
        AND t.dataFimAtestado IS NOT NULL
        AND ? BETWEEN t.dataInicioAtestado AND t.dataFimAtestado`,
    [Number(lojaId), normalizarDataCivilRh(dataReferencia)]
  );

  return new Map<number, any>(
    (rows || []).map((row: any) => [Number(row.funcionarioId), row])
  );
}

async function getFaltasTratadasNoDia(lojaId: number, dataReferencia: string) {
  await ensureRhPontoTables();
  if (!_pool) throw new Error("Pool do banco não disponível");

  const [rows] = await _pool.query<any[]>(
    `SELECT DISTINCT t.funcionarioId, t.documentoStatus
       FROM rh_ponto_tratativas t
       INNER JOIN rh_ponto_conferencias c ON c.id = t.conferenciaId
      WHERE t.lojaId = ?
        AND t.tipo = 'falta'
        AND c.dataReferencia = ?`,
    [Number(lojaId), normalizarDataCivilRh(dataReferencia)]
  );

  return new Map<number, any>((rows || []).map((row: any) => [Number(row.funcionarioId), row]));
}

export async function analisarRhPontoImportacao(data: {
  lojaId: number;
  dataReferencia: string;
  periodo: RhPontoPeriodo;
  registros: RhPontoRegistroImportado[];
}) {
  await ensureFuncionarioJornadaFields();
  await ensureRhPontoTables();

  if (!_pool) throw new Error("Pool do banco não disponível");

  const lojaId = Number(data.lojaId);
  const dataReferencia = normalizarDataCivilRh(data.dataReferencia);
  const config = RH_PONTO_CAMPOS[data.periodo];
  const horarioConferencia = RH_PONTO_HORARIOS[data.periodo];

  if (!config || !horarioConferencia) throw new Error("Período de conferência inválido");
  if (!Array.isArray(data.registros) || data.registros.length === 0) {
    throw new Error("O PDF não possui registros de ponto para analisar");
  }
  if (data.registros.length > 1000) {
    throw new Error("O relatório possui registros demais para uma conferência diária");
  }

  const datasRelatorio = Array.from(
    new Set(data.registros.map((registro) => normalizarDataCivilRh(registro.data)))
  );
  if (datasRelatorio.length !== 1) {
    throw new Error("O PDF possui mais de uma data. Use o relatório de um único dia.");
  }
  if (datasRelatorio[0] !== dataReferencia) {
    throw new Error(
      `O relatório é de ${datasRelatorio[0].split("-").reverse().join("/")}, mas a conferência selecionada é de ${dataReferencia
        .split("-")
        .reverse()
        .join("/")}.`
    );
  }

  const [lojaRows] = await _pool.query<any[]>(
    "SELECT id, nome FROM lojas WHERE id = ? LIMIT 1",
    [lojaId]
  );
  if (!lojaRows?.[0]) throw new Error("Loja não encontrada");

  const [funcionarioRows] = await _pool.query<any[]>(
    `SELECT
       id, lojaId, nome, funcao, status, cargoConfianca,
       horarioEntrada1, duracaoAlmocoMinutos,
       horarioSaida1, horarioEntrada2, horarioSaida2
     FROM funcionarios
     WHERE lojaId = ?
       AND status IN ('ativo', 'experiencia')
     ORDER BY nome`,
    [lojaId]
  );

  const funcionarioRowsTodos = funcionarioRows || [];
  const nomesCargoConfianca = new Set(
    funcionarioRowsTodos
      .filter((f: any) => Boolean(Number(f.cargoConfianca || 0)))
      .map((f: any) => normalizarNomeRhPonto(f.nome))
      .filter(Boolean)
  );
  const funcionariosPonto = funcionarioRowsTodos.filter(
    (f: any) => !Boolean(Number(f.cargoConfianca || 0))
  );

  const atestadosNoDia = await getAtestadosAtivosNoDia(lojaId, dataReferencia);
  const faltasTratadasNoDia = await getFaltasTratadasNoDia(lojaId, dataReferencia);

  const porNome = new Map<string, any[]>();
  for (const funcionario of funcionariosPonto) {
    const chave = normalizarNomeRhPonto(funcionario.nome);
    const atual = porNome.get(chave) || [];
    atual.push(funcionario);
    porNome.set(chave, atual);
  }

  // Nomes previamente vinculados pelo RH/Caixa. O vínculo só é usado quando
  // não existe correspondência exata pelo nome normalizado do cadastro.
  const [vinculosNomeRows] = await _pool.query<any[]>(
    `SELECT v.nomePdfNormalizado,
            f.id, f.lojaId, f.nome, f.funcao, f.status, f.cargoConfianca,
            f.horarioEntrada1, f.duracaoAlmocoMinutos,
            f.horarioSaida1, f.horarioEntrada2, f.horarioSaida2
       FROM rh_ponto_vinculos_nome v
       INNER JOIN funcionarios f
         ON f.id = v.funcionarioId AND f.lojaId = v.lojaId
      WHERE v.lojaId = ?
        AND f.status IN ('ativo', 'experiencia')
        AND COALESCE(f.cargoConfianca, 0) = 0`,
    [lojaId]
  );

  const porVinculoNome = new Map<string, any>();
  for (const row of vinculosNomeRows || []) {
    const chave = normalizarNomeRhPonto(String(row.nomePdfNormalizado || ""));
    if (chave) porVinculoNome.set(chave, row);
  }

  const contagemNomesPdf = new Map<string, number>();
  for (const registro of data.registros) {
    const chave = normalizarNomeRhPonto(registro.nomePdf);
    contagemNomesPdf.set(chave, (contagemNomesPdf.get(chave) || 0) + 1);
  }

  const itens: any[] = [];
  const funcionariosEncontrados = new Set<number>();
  const checkpointMinutos = minutosDoHorarioRh(horarioConferencia);

  const baseItem = (registro: RhPontoRegistroImportado, funcionario: any, extras: any = {}) => ({
    nomePdf: registro.nomePdf,
    funcionarioId: funcionario ? Number(funcionario.id) : null,
    funcionarioNome: funcionario?.nome ?? null,
    funcionarioFuncao: funcionario?.funcao ?? null,
    horarioPrevisto: null,
    horarioBatida: null,
    minutosAtraso: 0,
    minutosAntecipados: 0,
    advertenciaObrigatoria: false,
    tratativaObrigatoria: false,
    ...extras,
  });

  for (const registroOriginal of data.registros) {
    const registro: RhPontoRegistroImportado = {
      ...registroOriginal,
      data: normalizarDataCivilRh(registroOriginal.data),
      nomePdf: String(registroOriginal.nomePdf || "").trim(),
      entrada1: normalizarBatidaRhPonto(registroOriginal.entrada1),
      saida1: normalizarBatidaRhPonto(registroOriginal.saida1),
      entrada2: normalizarBatidaRhPonto(registroOriginal.entrada2),
      saida2: normalizarBatidaRhPonto(registroOriginal.saida2),
    };

    if (!registro.nomePdf) continue;
    const nomeNormalizado = normalizarNomeRhPonto(registro.nomePdf);

    if (nomesCargoConfianca.has(nomeNormalizado)) continue;

    if ((contagemNomesPdf.get(nomeNormalizado) || 0) > 1) {
      itens.push({
        ...baseItem(registro, null, {
          horarioBatida: (registro as any)[config.registro] ?? null,
        }),
        status: "duplicado_relatorio" as RhPontoStatusAnalise,
        bloqueiaFinalizacao: true,
        mensagem: "O mesmo nome aparece mais de uma vez no relatório.",
      });
      continue;
    }

    const candidatosDiretos = porNome.get(nomeNormalizado) || [];
    const funcionarioVinculado =
      candidatosDiretos.length === 0 ? porVinculoNome.get(nomeNormalizado) : null;
    const candidatos = funcionarioVinculado
      ? [funcionarioVinculado]
      : candidatosDiretos;

    if (candidatos.length !== 1) {
      itens.push({
        ...baseItem(registro, null, {
          horarioBatida: (registro as any)[config.registro] ?? null,
        }),
        status: "nao_identificado" as RhPontoStatusAnalise,
        bloqueiaFinalizacao: false,
        mensagem:
          candidatos.length > 1
            ? "Existe mais de um funcionário com este nome no cadastro. A Líder de RH deve revisar o cadastro."
            : "Funcionário do PDF não encontrado no cadastro desta loja. Ficará pendente para a Líder de RH cadastrar.",
      });
      continue;
    }

    const funcionario = candidatos[0];
    const funcionarioId = Number(funcionario.id);
    funcionariosEncontrados.add(funcionarioId);

    const atestado = atestadosNoDia.get(funcionarioId);
    if (atestado) {
      itens.push({
        ...baseItem(registro, funcionario),
        status: "atestado" as RhPontoStatusAnalise,
        bloqueiaFinalizacao: false,
        mensagem:
          atestado.documentoStatus === "concluida"
            ? "Funcionário coberto por atestado nesta data."
            : "Funcionário coberto por atestado informado anteriormente; documento ainda pendente.",
      });
      continue;
    }

    const faltaTratada = faltasTratadasNoDia.get(funcionarioId);
    if (faltaTratada) {
      itens.push({
        ...baseItem(registro, funcionario),
        status: "falta_tratada" as RhPontoStatusAnalise,
        bloqueiaFinalizacao: false,
        mensagem:
          faltaTratada.documentoStatus === "concluida"
            ? "Falta deste dia já registrada e advertência anexada."
            : "Falta deste dia já registrada; advertência assinada ainda pendente.",
      });
      continue;
    }

    const entradaFixa = normalizarBatidaRhPonto(String(funcionario.horarioEntrada1 || "").trim());
    const saidaFixa = normalizarBatidaRhPonto(String(funcionario.horarioSaida2 || "").trim());
    const duracaoAlmocoMinutos =
      funcionario.duracaoAlmocoMinutos === null || funcionario.duracaoAlmocoMinutos === undefined
        ? null
        : Number(funcionario.duracaoAlmocoMinutos);

    const entrada1 = registro.entrada1;
    const saida1 = registro.saida1;
    const entrada2 = registro.entrada2;
    const saida2 = registro.saida2;

    if (config.tipo === "entrada_fixa") {
      const horarioPrevisto = entradaFixa;
      if (!horarioPrevisto || horarioPrevisto === "FALTA") {
        itens.push({
          ...baseItem(registro, funcionario, { horarioBatida: entrada1 }),
          status: "jornada_nao_cadastrada" as RhPontoStatusAnalise,
          bloqueiaFinalizacao: false,
          mensagem: "Horário fixo de entrada ainda não cadastrado. Ficará pendente para o RH.",
        });
        continue;
      }

      const previstoMinutos = minutosDoHorarioRh(horarioPrevisto);
      if (!entrada1) {
        if (previstoMinutos > checkpointMinutos) {
          itens.push({
            ...baseItem(registro, funcionario, { horarioPrevisto }),
            status: "aguardando_horario" as RhPontoStatusAnalise,
            bloqueiaFinalizacao: false,
            mensagem: `Entrada prevista ${horarioPrevisto}; ainda não era exigível na conferência das ${horarioConferencia}.`,
          });
        } else {
          itens.push({
            ...baseItem(registro, funcionario, { horarioPrevisto, tratativaObrigatoria: true }),
            status: "sem_batida" as RhPontoStatusAnalise,
            bloqueiaFinalizacao: false,
            mensagem: "Batida de entrada não encontrada. Defina atestado, justificativa ou falta/advertência.",
          });
        }
        continue;
      }

      if (entrada1 === "FALTA") {
        itens.push({
          ...baseItem(registro, funcionario, {
            horarioPrevisto,
            horarioBatida: "FALTA",
            tratativaObrigatoria: true,
          }),
          status: "falta" as RhPontoStatusAnalise,
          bloqueiaFinalizacao: false,
          mensagem: "O relatório registrou FALTA. Defina atestado, justificativa ou falta/advertência.",
        });
        continue;
      }

      const minutosAtraso = calcularMinutosAtrasoRh(horarioPrevisto, entrada1);
      if (minutosAtraso > RH_PONTO_LIMITE_ADVERTENCIA_ATRASO_MINUTOS) {
        itens.push({
          ...baseItem(registro, funcionario, {
            horarioPrevisto,
            horarioBatida: entrada1,
            minutosAtraso,
            advertenciaObrigatoria: true,
            tratativaObrigatoria: true,
          }),
          status: "atraso" as RhPontoStatusAnalise,
          bloqueiaFinalizacao: false,
          mensagem: `${minutosAtraso} minutos após o horário. Acima de 15 minutos: exige atestado, justificativa ou advertência.`,
        });
        continue;
      }

      if (minutosAtraso > RH_PONTO_TOLERANCIA_ATRASO_MINUTOS) {
        itens.push({
          ...baseItem(registro, funcionario, {
            horarioPrevisto,
            horarioBatida: entrada1,
            minutosAtraso,
          }),
          status: "atraso_registrado" as RhPontoStatusAnalise,
          bloqueiaFinalizacao: false,
          mensagem: `${minutosAtraso} minutos após o horário. Atraso registrado, sem advertência obrigatória.`,
        });
        continue;
      }

      itens.push({
        ...baseItem(registro, funcionario, { horarioPrevisto, horarioBatida: entrada1 }),
        status: "ok" as RhPontoStatusAnalise,
        bloqueiaFinalizacao: false,
        mensagem:
          minutosAtraso > 0
            ? `${minutosAtraso} minuto${minutosAtraso === 1 ? "" : "s"} após o horário, dentro da tolerância de 10 minutos.`
            : "Entrada dentro do horário.",
      });
      continue;
    }

    if (config.tipo === "inicio_almoco") {
      if (!duracaoAlmocoMinutos || duracaoAlmocoMinutos <= 0) {
        itens.push({
          ...baseItem(registro, funcionario, { horarioBatida: saida1 }),
          status: "jornada_nao_cadastrada" as RhPontoStatusAnalise,
          bloqueiaFinalizacao: false,
          mensagem: "Duração do almoço ainda não cadastrada. Ficará pendente para o RH.",
        });
        continue;
      }

      if (!saida1) {
        itens.push({
          ...baseItem(registro, funcionario, { horarioPrevisto: formatarDuracaoRh(duracaoAlmocoMinutos) }),
          status: "aguardando_horario" as RhPontoStatusAnalise,
          bloqueiaFinalizacao: false,
          mensagem: "O início do almoço ainda não apareceu. Como o horário de almoço é flexível, não há ocorrência neste momento.",
        });
        continue;
      }

      itens.push({
        ...baseItem(registro, funcionario, {
          horarioPrevisto: formatarDuracaoRh(duracaoAlmocoMinutos),
          horarioBatida: saida1,
        }),
        status: "ok" as RhPontoStatusAnalise,
        bloqueiaFinalizacao: false,
        mensagem: `Início do almoço registrado às ${saida1}. A duração será conferida no retorno.`,
      });
      continue;
    }

    if (config.tipo === "duracao_almoco") {
      if (!duracaoAlmocoMinutos || duracaoAlmocoMinutos <= 0) {
        itens.push({
          ...baseItem(registro, funcionario, { horarioBatida: entrada2 }),
          status: "jornada_nao_cadastrada" as RhPontoStatusAnalise,
          bloqueiaFinalizacao: false,
          mensagem: "Duração do almoço ainda não cadastrada. Ficará pendente para o RH.",
        });
        continue;
      }

      const duracaoPrevistaTexto = formatarDuracaoRh(duracaoAlmocoMinutos);
      if (!saida1) {
        itens.push({
          ...baseItem(registro, funcionario, { horarioPrevisto: duracaoPrevistaTexto, tratativaObrigatoria: true }),
          status: "sem_batida" as RhPontoStatusAnalise,
          bloqueiaFinalizacao: false,
          mensagem: "Batida de saída para almoço não encontrada. Defina atestado, justificativa ou advertência.",
        });
        continue;
      }

      if (!entrada2) {
        const retornoEsperadoMinutos = minutosDoHorarioRh(saida1) + duracaoAlmocoMinutos;
        if (checkpointMinutos < retornoEsperadoMinutos) {
          itens.push({
            ...baseItem(registro, funcionario, {
              horarioPrevisto: duracaoPrevistaTexto,
              horarioBatida: saida1,
            }),
            status: "aguardando_horario" as RhPontoStatusAnalise,
            bloqueiaFinalizacao: false,
            mensagem: `Intervalo iniciado às ${saida1}; ainda está dentro dos ${duracaoPrevistaTexto} previstos.`,
          });
        } else {
          itens.push({
            ...baseItem(registro, funcionario, {
              horarioPrevisto: duracaoPrevistaTexto,
              horarioBatida: saida1,
              tratativaObrigatoria: true,
            }),
            status: "sem_batida" as RhPontoStatusAnalise,
            bloqueiaFinalizacao: false,
            mensagem: "O intervalo previsto terminou, mas a batida de retorno não foi encontrada. Defina a tratativa.",
          });
        }
        continue;
      }

      const duracaoReal = calcularDuracaoIntervaloRh(saida1, entrada2);
      const duracaoRealTexto = formatarDuracaoRh(duracaoReal);
      if (duracaoReal > duracaoAlmocoMinutos) {
        const excedente = duracaoReal - duracaoAlmocoMinutos;
        itens.push({
          ...baseItem(registro, funcionario, {
            horarioPrevisto: duracaoPrevistaTexto,
            horarioBatida: duracaoRealTexto,
            minutosAtraso: excedente,
            tratativaObrigatoria: true,
          }),
          status: "almoco_excedido" as RhPontoStatusAnalise,
          bloqueiaFinalizacao: false,
          mensagem: `Intervalo de ${duracaoRealTexto}; excedeu ${excedente} minuto${excedente === 1 ? "" : "s"}. Defina atestado, justificativa ou advertência.`,
        });
        continue;
      }

      if (duracaoReal < duracaoAlmocoMinutos) {
        const faltaram = duracaoAlmocoMinutos - duracaoReal;
        itens.push({
          ...baseItem(registro, funcionario, {
            horarioPrevisto: duracaoPrevistaTexto,
            horarioBatida: duracaoRealTexto,
          }),
          status: "intervalo_inferior" as RhPontoStatusAnalise,
          bloqueiaFinalizacao: false,
          mensagem: `Intervalo realizado em ${duracaoRealTexto}; ficou ${faltaram} minuto${faltaram === 1 ? "" : "s"} abaixo do tempo cadastrado.`,
        });
        continue;
      }

      itens.push({
        ...baseItem(registro, funcionario, {
          horarioPrevisto: duracaoPrevistaTexto,
          horarioBatida: duracaoRealTexto,
        }),
        status: "ok" as RhPontoStatusAnalise,
        bloqueiaFinalizacao: false,
        mensagem: `Almoço cumprido corretamente: ${duracaoRealTexto}.`,
      });
      continue;
    }

    const horarioPrevisto = saidaFixa;
    if (!horarioPrevisto || horarioPrevisto === "FALTA") {
      itens.push({
        ...baseItem(registro, funcionario, { horarioBatida: saida2 }),
        status: "jornada_nao_cadastrada" as RhPontoStatusAnalise,
        bloqueiaFinalizacao: false,
        mensagem: "Horário fixo de saída ainda não cadastrado. Ficará pendente para o RH.",
      });
      continue;
    }

    const previstoMinutos = minutosDoHorarioRh(horarioPrevisto);
    if (!saida2) {
      if (previstoMinutos > checkpointMinutos) {
        itens.push({
          ...baseItem(registro, funcionario, { horarioPrevisto }),
          status: "aguardando_horario" as RhPontoStatusAnalise,
          bloqueiaFinalizacao: false,
          mensagem: `Saída prevista ${horarioPrevisto}; ainda não era exigível na conferência das ${horarioConferencia}.`,
        });
      } else {
        itens.push({
          ...baseItem(registro, funcionario, { horarioPrevisto, tratativaObrigatoria: true }),
          status: "sem_batida" as RhPontoStatusAnalise,
          bloqueiaFinalizacao: false,
          mensagem: "Batida de saída não encontrada. Defina atestado, justificativa ou advertência.",
        });
      }
      continue;
    }

    const minutosAntecipados = Math.max(0, previstoMinutos - minutosDoHorarioRh(saida2));
    if (minutosAntecipados > 0) {
      itens.push({
        ...baseItem(registro, funcionario, {
          horarioPrevisto,
          horarioBatida: saida2,
          minutosAntecipados,
          tratativaObrigatoria: true,
        }),
        status: "saida_antecipada" as RhPontoStatusAnalise,
        bloqueiaFinalizacao: false,
        mensagem: `${minutosAntecipados} minuto${minutosAntecipados === 1 ? "" : "s"} antes do horário fixo de saída. Defina a tratativa.`,
      });
      continue;
    }

    itens.push({
      ...baseItem(registro, funcionario, { horarioPrevisto, horarioBatida: saida2 }),
      status: "ok" as RhPontoStatusAnalise,
      bloqueiaFinalizacao: false,
      mensagem: "Saída dentro do horário.",
    });
  }

  // Funcionários ativos que não aparecem no PDF.
  for (const funcionario of funcionariosPonto) {
    const funcionarioId = Number(funcionario.id);
    if (funcionariosEncontrados.has(funcionarioId)) continue;
    if (atestadosNoDia.has(funcionarioId)) {
      itens.push({
        ...baseItem({ data: dataReferencia, nomePdf: funcionario.nome }, funcionario),
        status: "atestado" as RhPontoStatusAnalise,
        bloqueiaFinalizacao: false,
        mensagem: "Funcionário não está no PDF porque há atestado cobrindo esta data.",
      });
      continue;
    }
    if (faltasTratadasNoDia.has(funcionarioId)) {
      itens.push({
        ...baseItem({ data: dataReferencia, nomePdf: funcionario.nome }, funcionario),
        status: "falta_tratada" as RhPontoStatusAnalise,
        bloqueiaFinalizacao: false,
        mensagem: "Falta deste dia já registrada; não será criada outra pendência nos demais horários.",
      });
      continue;
    }

    const entradaFixa = normalizarBatidaRhPonto(String(funcionario.horarioEntrada1 || "").trim());
    const saidaFixa = normalizarBatidaRhPonto(String(funcionario.horarioSaida2 || "").trim());
    const duracaoAlmocoMinutos =
      funcionario.duracaoAlmocoMinutos === null || funcionario.duracaoAlmocoMinutos === undefined
        ? null
        : Number(funcionario.duracaoAlmocoMinutos);

    if (config.tipo === "entrada_fixa") {
      if (!entradaFixa || entradaFixa === "FALTA") continue;
      if (minutosDoHorarioRh(entradaFixa) > checkpointMinutos) continue;
      itens.push({
        ...baseItem({ data: dataReferencia, nomePdf: funcionario.nome }, funcionario, {
          horarioPrevisto: entradaFixa,
          tratativaObrigatoria: true,
        }),
        status: "ausente_relatorio" as RhPontoStatusAnalise,
        bloqueiaFinalizacao: false,
        mensagem: "Funcionário ativo com entrada prevista, mas não encontrado no PDF. Defina a tratativa.",
      });
      continue;
    }

    if (config.tipo === "saida_fixa") {
      if (!saidaFixa || saidaFixa === "FALTA") continue;
      if (minutosDoHorarioRh(saidaFixa) > checkpointMinutos) continue;
      itens.push({
        ...baseItem({ data: dataReferencia, nomePdf: funcionario.nome }, funcionario, {
          horarioPrevisto: saidaFixa,
          tratativaObrigatoria: true,
        }),
        status: "ausente_relatorio" as RhPontoStatusAnalise,
        bloqueiaFinalizacao: false,
        mensagem: "Funcionário ativo não encontrado no PDF. Defina atestado, justificativa ou falta/advertência.",
      });
      continue;
    }

    if (
      (config.tipo === "inicio_almoco" || config.tipo === "duracao_almoco") &&
      duracaoAlmocoMinutos &&
      entradaFixa &&
      minutosDoHorarioRh(entradaFixa) <= checkpointMinutos
    ) {
      itens.push({
        ...baseItem({ data: dataReferencia, nomePdf: funcionario.nome }, funcionario, {
          horarioPrevisto: formatarDuracaoRh(duracaoAlmocoMinutos),
          tratativaObrigatoria: true,
        }),
        status: "ausente_relatorio" as RhPontoStatusAnalise,
        bloqueiaFinalizacao: false,
        mensagem: "Funcionário ativo não encontrado no PDF; não foi possível conferir o intervalo. Defina a tratativa.",
      });
    }
  }

  const contar = (status: RhPontoStatusAnalise) => itens.filter((item) => item.status === status).length;
  const bloqueios = itens.filter((item) => item.bloqueiaFinalizacao).length;

  return {
    lojaId,
    lojaNome: lojaRows[0].nome,
    dataReferencia,
    periodo: data.periodo,
    horarioConferencia,
    totalRegistrosPdf: data.registros.length,
    totalFuncionariosCadastro: funcionariosPonto.length,
    bloqueios,
    podeFinalizar: bloqueios === 0,
    totais: {
      ok: contar("ok"),
      atrasosRegistrados: contar("atraso_registrado"),
      atrasos: contar("atraso"),
      almocosExcedidos: contar("almoco_excedido"),
      intervalosInferiores: contar("intervalo_inferior"),
      semBatida: contar("sem_batida"),
      faltas: contar("falta"),
      faltasTratadas: contar("falta_tratada"),
      saidasAntecipadas: contar("saida_antecipada"),
      jornadaNaoCadastrada: contar("jornada_nao_cadastrada"),
      naoIdentificados: contar("nao_identificado"),
      duplicadosRelatorio: contar("duplicado_relatorio"),
      ausentesRelatorio: contar("ausente_relatorio"),
      aguardandoHorario: contar("aguardando_horario"),
      atestados: contar("atestado"),
    },
    itens,
  };
}

export async function salvarRhPontoImportacao(data: {
  lojaId: number;
  dataReferencia: string;
  periodo: RhPontoPeriodo;
  arquivoNome: string;
  arquivoHash?: string | null;
  observacao?: string | null;
  registros: RhPontoRegistroImportado[];
  usuarioId: number;
  usuarioNome: string;
}) {
  const analise = await analisarRhPontoImportacao({
    lojaId: data.lojaId,
    dataReferencia: data.dataReferencia,
    periodo: data.periodo,
    registros: data.registros,
  });

  if (!analise.podeFinalizar) {
    throw new Error(
      `A conferência possui ${analise.bloqueios} bloqueio${analise.bloqueios === 1 ? "" : "s"}. Revise o relatório e tente novamente.`
    );
  }

  await ensureRhPontoTables();
  if (!_pool) throw new Error("Pool do banco não disponível");

  const lojaId = Number(data.lojaId);
  const dataReferencia = normalizarDataCivilRh(data.dataReferencia);
  const horarioPrevistoConferencia = RH_PONTO_HORARIOS[data.periodo];
  const connection = await _pool.getConnection();

  try {
    await connection.beginTransaction();

    await connection.query(
      `INSERT INTO rh_ponto_conferencias (
         lojaId, dataReferencia, periodo, horarioPrevisto,
         conferidoPorUsuarioId, conferidoPorNome, conferidoEm,
         observacao, origem, relatorioNome, relatorioHash,
         relatorioTotalLinhas, relatorioDadosJson, relatorioImportadoEm
       )
       VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, 'pdf', ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         horarioPrevisto = VALUES(horarioPrevisto),
         conferidoPorUsuarioId = VALUES(conferidoPorUsuarioId),
         conferidoPorNome = VALUES(conferidoPorNome),
         conferidoEm = NOW(), observacao = VALUES(observacao), origem = 'pdf',
         relatorioNome = VALUES(relatorioNome), relatorioHash = VALUES(relatorioHash),
         relatorioTotalLinhas = VALUES(relatorioTotalLinhas),
         relatorioDadosJson = VALUES(relatorioDadosJson), relatorioImportadoEm = NOW(),
         updatedAt = NOW()`,
      [
        lojaId,
        dataReferencia,
        data.periodo,
        horarioPrevistoConferencia,
        Number(data.usuarioId),
        data.usuarioNome,
        data.observacao?.trim() || null,
        String(data.arquivoNome || "relatorio-ponto.pdf").slice(0, 255),
        data.arquivoHash?.trim() || null,
        data.registros.length,
        JSON.stringify(data.registros),
      ]
    );

    const [conferenciaRows] = await connection.query<any[]>(
      `SELECT id FROM rh_ponto_conferencias
        WHERE lojaId = ? AND dataReferencia = ? AND periodo = ? LIMIT 1`,
      [lojaId, dataReferencia, data.periodo]
    );
    const conferenciaId = Number(conferenciaRows?.[0]?.id || 0);
    if (!conferenciaId) throw new Error("Não foi possível identificar a conferência salva");

    // Mantém ocorrências que já receberam uma tratativa. As demais podem ser
    // recalculadas em uma reimportação sem apagar pendências já assumidas.
    const [tratadasRows] = await connection.query<any[]>(
      `SELECT o.id, o.funcionarioId
         FROM rh_ponto_ocorrencias o
         INNER JOIN rh_ponto_tratativas t ON t.ocorrenciaId = o.id
        WHERE o.conferenciaId = ?`,
      [conferenciaId]
    );
    const funcionariosComTratativa = new Set(
      (tratadasRows || []).map((row: any) => Number(row.funcionarioId))
    );

    await connection.query(
      `DELETE o FROM rh_ponto_ocorrencias o
       LEFT JOIN rh_ponto_tratativas t ON t.ocorrenciaId = o.id
       WHERE o.conferenciaId = ? AND t.id IS NULL`,
      [conferenciaId]
    );

    const ocorrenciasSalvar = analise.itens.filter((item: any) =>
      [
        "atraso_registrado",
        "atraso",
        "almoco_excedido",
        "intervalo_inferior",
        "sem_batida",
        "falta",
        "saida_antecipada",
        "ausente_relatorio",
      ].includes(String(item.status))
    );

    for (const item of ocorrenciasSalvar) {
      const funcionarioId = Number(item.funcionarioId || 0);
      if (!funcionarioId || funcionariosComTratativa.has(funcionarioId)) continue;

      await connection.query(
        `INSERT INTO rh_ponto_ocorrencias (
           conferenciaId, lojaId, funcionarioId,
           horarioPrevisto, horarioBatida, minutosAtraso,
           observacao, tipoOcorrencia, nomePdf,
           advertenciaObrigatoria, advertenciaStatus
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'dispensada')`,
        [
          conferenciaId,
          lojaId,
          funcionarioId,
          String(item.horarioPrevisto || "—").slice(0, 10),
          String(item.horarioBatida || "SEM BATIDA").slice(0, 20),
          Number(item.minutosAtraso || 0),
          item.mensagem || null,
          item.status,
          item.nomePdf || null,
          item.status === "atraso" ? 1 : 0,
        ]
      );
    }

    // Pendências de cadastro/jornada para a Líder de RH.
    for (const item of analise.itens as any[]) {
      if (!["nao_identificado", "jornada_nao_cadastrada"].includes(String(item.status))) continue;
      const tipo = item.status === "nao_identificado" ? "funcionario" : "jornada";
      const nomePendente = String(item.funcionarioNome || item.nomePdf || "Funcionário").trim();
      if (!nomePendente) continue;

      await connection.query(
        `INSERT INTO rh_ponto_cadastros_pendentes (
           conferenciaId, lojaId, dataReferencia, periodo, tipo,
           nomePdf, funcionarioId, mensagem, status
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendente')
         ON DUPLICATE KEY UPDATE
           funcionarioId = VALUES(funcionarioId), mensagem = VALUES(mensagem),
           status = 'pendente', resolvidoEm = NULL, updatedAt = NOW()`,
        [
          conferenciaId,
          lojaId,
          dataReferencia,
          data.periodo,
          tipo,
          nomePendente,
          item.funcionarioId ? Number(item.funcionarioId) : null,
          item.mensagem || null,
        ]
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return getRhPontoDia(lojaId, dataReferencia);
}

async function resolverCadastrosPendentesAutomaticamente(lojaId?: number | null) {
  await ensureFuncionarioJornadaFields();
  await ensureRhPontoTables();
  if (!_pool) throw new Error("Pool do banco não disponível");

  const params: any[] = [];
  const filtro = lojaId ? " AND p.lojaId = ?" : "";
  if (lojaId) params.push(Number(lojaId));

  const [pendentes] = await _pool.query<any[]>(
    `SELECT p.* FROM rh_ponto_cadastros_pendentes p
      WHERE p.status = 'pendente' ${filtro}`,
    params
  );

  for (const pendente of pendentes || []) {
    if (String(pendente.tipo) === "jornada" && pendente.funcionarioId) {
      const [rows] = await _pool.query<any[]>(
        `SELECT id, cargoConfianca, horarioEntrada1, duracaoAlmocoMinutos, horarioSaida2
           FROM funcionarios WHERE id = ? AND lojaId = ? LIMIT 1`,
        [Number(pendente.funcionarioId), Number(pendente.lojaId)]
      );
      const f = rows?.[0];
      if (
        f &&
        (Boolean(Number(f.cargoConfianca || 0)) ||
          (f.horarioEntrada1 && f.duracaoAlmocoMinutos && f.horarioSaida2))
      ) {
        await _pool.query(
          `UPDATE rh_ponto_cadastros_pendentes
              SET status = 'resolvido', resolvidoEm = NOW(), updatedAt = NOW()
            WHERE id = ?`,
          [Number(pendente.id)]
        );
      }
      continue;
    }

    if (String(pendente.tipo) === "funcionario") {
      const [rows] = await _pool.query<any[]>(
        `SELECT id, nome FROM funcionarios
          WHERE lojaId = ? AND status IN ('ativo','experiencia')`,
        [Number(pendente.lojaId)]
      );
      const chave = normalizarNomeRhPonto(String(pendente.nomePdf || ""));
      const candidatosDiretos = (rows || []).filter(
        (f: any) => normalizarNomeRhPonto(String(f.nome || "")) === chave
      );

      let funcionarioIdResolvido =
        candidatosDiretos.length === 1 ? Number(candidatosDiretos[0].id) : 0;

      if (!funcionarioIdResolvido && candidatosDiretos.length === 0 && chave) {
        const [vinculoRows] = await _pool.query<any[]>(
          `SELECT v.funcionarioId
             FROM rh_ponto_vinculos_nome v
             INNER JOIN funcionarios f
               ON f.id = v.funcionarioId AND f.lojaId = v.lojaId
            WHERE v.lojaId = ?
              AND v.nomePdfNormalizado = ?
              AND f.status IN ('ativo','experiencia')
              AND COALESCE(f.cargoConfianca, 0) = 0
            LIMIT 1`,
          [Number(pendente.lojaId), chave]
        );
        funcionarioIdResolvido = Number(vinculoRows?.[0]?.funcionarioId || 0);
      }

      if (funcionarioIdResolvido) {
        await _pool.query(
          `UPDATE rh_ponto_cadastros_pendentes
              SET status = 'resolvido', funcionarioId = ?, resolvidoEm = NOW(), updatedAt = NOW()
            WHERE id = ?`,
          [funcionarioIdResolvido, Number(pendente.id)]
        );
      }
    }
  }
}

export async function vincularRhPontoNomeFuncionario(data: {
  lojaId: number;
  nomePdf: string;
  funcionarioId: number;
  usuarioId?: number | null;
  usuarioNome?: string | null;
}) {
  await ensureFuncionarioJornadaFields();
  await ensureRhPontoTables();
  if (!_pool) throw new Error("Pool do banco não disponível");

  const lojaId = Number(data.lojaId);
  const funcionarioId = Number(data.funcionarioId);
  const nomePdf = String(data.nomePdf || "").replace(/\s+/g, " ").trim();
  const nomePdfNormalizado = normalizarNomeRhPonto(nomePdf);

  if (!lojaId || !funcionarioId) {
    throw new Error("Loja e funcionário são obrigatórios para criar o vínculo");
  }
  if (!nomePdfNormalizado) {
    throw new Error("Nome do PDF inválido para criar o vínculo");
  }

  const [funcionarioRows] = await _pool.query<any[]>(
    `SELECT id, lojaId, nome, funcao, status, cargoConfianca
       FROM funcionarios
      WHERE id = ? AND lojaId = ?
        AND status IN ('ativo','experiencia')
      LIMIT 1`,
    [funcionarioId, lojaId]
  );

  const funcionario = funcionarioRows?.[0];
  if (!funcionario) {
    throw new Error("Funcionário ativo não encontrado nesta loja");
  }
  if (Boolean(Number(funcionario.cargoConfianca || 0))) {
    throw new Error("Cargo de confiança não deve ser vinculado ao relatório de ponto");
  }

  await _pool.query(
    `INSERT INTO rh_ponto_vinculos_nome (
       lojaId, nomePdf, nomePdfNormalizado, funcionarioId,
       criadoPorUsuarioId, criadoPorNome
     ) VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       nomePdf = VALUES(nomePdf),
       funcionarioId = VALUES(funcionarioId),
       criadoPorUsuarioId = VALUES(criadoPorUsuarioId),
       criadoPorNome = VALUES(criadoPorNome),
       updatedAt = NOW()`,
    [
      lojaId,
      nomePdf.slice(0, 255),
      nomePdfNormalizado.slice(0, 255),
      funcionarioId,
      data.usuarioId ? Number(data.usuarioId) : null,
      data.usuarioNome?.trim() || null,
    ]
  );

  // Resolve pendências antigas do mesmo nome do Secullum nesta loja.
  const [pendentesRows] = await _pool.query<any[]>(
    `SELECT id, nomePdf
       FROM rh_ponto_cadastros_pendentes
      WHERE lojaId = ? AND tipo = 'funcionario' AND status = 'pendente'`,
    [lojaId]
  );

  const idsResolver = (pendentesRows || [])
    .filter(
      (row: any) =>
        normalizarNomeRhPonto(String(row.nomePdf || "")) === nomePdfNormalizado
    )
    .map((row: any) => Number(row.id))
    .filter((id: number) => id > 0);

  for (const pendenciaId of idsResolver) {
    await _pool.query(
      `UPDATE rh_ponto_cadastros_pendentes
          SET funcionarioId = ?, status = 'resolvido', resolvidoEm = NOW(), updatedAt = NOW()
        WHERE id = ?`,
      [funcionarioId, pendenciaId]
    );
  }

  return {
    success: true,
    lojaId,
    nomePdf,
    nomePdfNormalizado,
    funcionarioId,
    funcionarioNome: funcionario.nome,
    funcionarioFuncao: funcionario.funcao,
    pendenciasResolvidas: idsResolver.length,
  };
}

export async function getRhPontoPendencias(args: { lojaId?: number | null } = {}) {
  await resolverCadastrosPendentesAutomaticamente(args.lojaId ?? null);
  if (!_pool) throw new Error("Pool do banco não disponível");

  const paramsOc: any[] = [];
  const filtroOc = args.lojaId ? " AND o.lojaId = ?" : "";
  if (args.lojaId) paramsOc.push(Number(args.lojaId));

  const [ocorrencias] = await _pool.query<any[]>(
    `SELECT
       o.id AS ocorrenciaId, o.lojaId, l.nome AS lojaNome,
       o.funcionarioId, f.nome AS funcionarioNome, f.funcao AS funcionarioFuncao,
       o.tipoOcorrencia, o.horarioPrevisto, o.horarioBatida, o.minutosAtraso,
       o.observacao, c.id AS conferenciaId,
       DATE_FORMAT(c.dataReferencia, '%Y-%m-%d') AS dataReferencia,
       c.periodo, c.horarioPrevisto AS horarioConferencia,
       t.id AS tratativaId, t.tipo AS tratativaTipo, t.observacao AS tratativaObservacao,
       t.diasAtestado, DATE_FORMAT(t.dataInicioAtestado, '%Y-%m-%d') AS dataInicioAtestado,
       DATE_FORMAT(t.dataFimAtestado, '%Y-%m-%d') AS dataFimAtestado,
       t.documentoStatus, t.documentoNome, t.documentoMime, t.criadoEm
     FROM rh_ponto_ocorrencias o
     INNER JOIN rh_ponto_conferencias c ON c.id = o.conferenciaId
     INNER JOIN funcionarios f ON f.id = o.funcionarioId
     LEFT JOIN lojas l ON l.id = o.lojaId
     LEFT JOIN rh_ponto_tratativas t ON t.ocorrenciaId = o.id
     WHERE (
       (t.id IS NULL AND o.tipoOcorrencia IN ('atraso','almoco_excedido','sem_batida','falta','saida_antecipada','ausente_relatorio'))
       OR
       (t.id IS NOT NULL AND t.documentoStatus = 'pendente_documento')
     )
     ${filtroOc}
     ORDER BY c.dataReferencia ASC, c.horarioPrevisto ASC, f.nome ASC`,
    paramsOc
  );

  const paramsCad: any[] = [];
  const filtroCad = args.lojaId ? " AND p.lojaId = ?" : "";
  if (args.lojaId) paramsCad.push(Number(args.lojaId));
  const [cadastros] = await _pool.query<any[]>(
    `SELECT p.id, p.lojaId, l.nome AS lojaNome,
            DATE_FORMAT(p.dataReferencia, '%Y-%m-%d') AS dataReferencia,
            p.periodo, p.tipo, p.nomePdf, p.funcionarioId, p.mensagem
       FROM rh_ponto_cadastros_pendentes p
       LEFT JOIN lojas l ON l.id = p.lojaId
      WHERE p.status = 'pendente' ${filtroCad}
      ORDER BY p.dataReferencia ASC, p.nomePdf ASC`,
    paramsCad
  );

  const itensOcorrencia = (ocorrencias || []).map((row: any) => ({
    id: `oc-${row.ocorrenciaId}`,
    fase: row.tratativaId ? "documento" : "classificar",
    ocorrenciaId: Number(row.ocorrenciaId),
    conferenciaId: Number(row.conferenciaId),
    lojaId: Number(row.lojaId),
    lojaNome: row.lojaNome || `Loja ${row.lojaId}`,
    funcionarioId: Number(row.funcionarioId),
    funcionarioNome: row.funcionarioNome,
    funcionarioFuncao: row.funcionarioFuncao,
    dataReferencia: row.dataReferencia,
    periodo: row.periodo,
    horarioConferencia: row.horarioConferencia,
    tipoOcorrencia: row.tipoOcorrencia,
    horarioPrevisto: row.horarioPrevisto,
    horarioBatida: row.horarioBatida,
    minutosAtraso: Number(row.minutosAtraso || 0),
    mensagem: row.observacao,
    tratativaId: row.tratativaId ? Number(row.tratativaId) : null,
    tratativaTipo: row.tratativaTipo || null,
    tratativaObservacao: row.tratativaObservacao || null,
    diasAtestado: row.diasAtestado ? Number(row.diasAtestado) : null,
    dataInicioAtestado: row.dataInicioAtestado || null,
    dataFimAtestado: row.dataFimAtestado || null,
    documentoStatus: row.documentoStatus || null,
    documentoNome: row.documentoNome || null,
    documentoMime: row.documentoMime || null,
  }));

  const itensCadastro = (cadastros || []).map((row: any) => ({
    id: `cad-${row.id}`,
    fase: "cadastro",
    cadastroPendenteId: Number(row.id),
    lojaId: Number(row.lojaId),
    lojaNome: row.lojaNome || `Loja ${row.lojaId}`,
    funcionarioId: row.funcionarioId ? Number(row.funcionarioId) : null,
    funcionarioNome: row.nomePdf,
    dataReferencia: row.dataReferencia,
    periodo: row.periodo,
    tipoCadastro: row.tipo,
    mensagem: row.mensagem,
  }));

  return [...itensOcorrencia, ...itensCadastro];
}

export async function criarRhPontoTratativa(data: {
  ocorrenciaId: number;
  lojaId: number;
  tipo: RhPontoTratativaTipo;
  observacao?: string | null;
  diasAtestado?: number | null;
  usuarioId: number;
  usuarioNome: string;
}) {
  await ensureRhPontoTables();
  if (!_pool) throw new Error("Pool do banco não disponível");

  const [rows] = await _pool.query<any[]>(
    `SELECT o.id, o.lojaId, o.funcionarioId, o.tipoOcorrencia,
            c.id AS conferenciaId, DATE_FORMAT(c.dataReferencia, '%Y-%m-%d') AS dataReferencia
       FROM rh_ponto_ocorrencias o
       INNER JOIN rh_ponto_conferencias c ON c.id = o.conferenciaId
      WHERE o.id = ? AND o.lojaId = ? LIMIT 1`,
    [Number(data.ocorrenciaId), Number(data.lojaId)]
  );
  const ocorrencia = rows?.[0];
  if (!ocorrencia) throw new Error("Ocorrência não encontrada");

  if (!RH_PONTO_TIPOS_QUE_EXIGEM_TRATATIVA.has(String(ocorrencia.tipoOcorrencia))) {
    throw new Error("Esta ocorrência não exige tratativa");
  }

  const tipo = String(data.tipo) as RhPontoTratativaTipo;
  const observacao = String(data.observacao || "").trim();
  if (tipo === "justificativa" && observacao.length < 3) {
    throw new Error("Informe a justificativa");
  }

  let diasAtestado: number | null = null;
  let dataInicioAtestado: string | null = null;
  let dataFimAtestado: string | null = null;

  if (tipo === "atestado") {
    diasAtestado = Math.max(1, Math.min(60, Number(data.diasAtestado || 1)));
    if (!Number.isInteger(diasAtestado)) throw new Error("Quantidade de dias do atestado inválida");
    dataInicioAtestado = normalizarDataCivilRh(ocorrencia.dataReferencia);
    dataFimAtestado = somarDiasDataCivilRh(dataInicioAtestado, diasAtestado - 1);
  }

  await _pool.query(
    `INSERT INTO rh_ponto_tratativas (
       ocorrenciaId, conferenciaId, lojaId, funcionarioId,
       tipo, observacao, diasAtestado, dataInicioAtestado, dataFimAtestado,
       documentoStatus, criadoPorUsuarioId, criadoPorNome, criadoEm
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente_documento', ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       tipo = VALUES(tipo), observacao = VALUES(observacao),
       diasAtestado = VALUES(diasAtestado),
       dataInicioAtestado = VALUES(dataInicioAtestado),
       dataFimAtestado = VALUES(dataFimAtestado),
       documentoStatus = CASE WHEN documentoKey IS NULL THEN 'pendente_documento' ELSE 'concluida' END,
       updatedAt = NOW()`,
    [
      Number(data.ocorrenciaId),
      Number(ocorrencia.conferenciaId),
      Number(data.lojaId),
      Number(ocorrencia.funcionarioId),
      tipo,
      observacao || null,
      diasAtestado,
      dataInicioAtestado,
      dataFimAtestado,
      Number(data.usuarioId),
      data.usuarioNome,
    ]
  );

  const [tratativaRows] = await _pool.query<any[]>(
    "SELECT id FROM rh_ponto_tratativas WHERE ocorrenciaId = ? LIMIT 1",
    [Number(data.ocorrenciaId)]
  );
  return {
    success: true,
    tratativaId: Number(tratativaRows?.[0]?.id || 0),
    dataInicioAtestado,
    dataFimAtestado,
  };
}

export async function salvarDocumentoRhPontoTratativa(data: {
  tratativaId: number;
  lojaId: number;
  documentoKey: string;
  documentoNome: string;
  documentoMime: string;
  documentoTamanho: number;
  usuarioId: number;
  usuarioNome: string;
}) {
  await ensureRhPontoTables();
  if (!_pool) throw new Error("Pool do banco não disponível");

  const [result] = await _pool.query<any>(
    `UPDATE rh_ponto_tratativas
        SET documentoKey = ?, documentoNome = ?, documentoMime = ?, documentoTamanho = ?,
            documentoStatus = 'concluida', documentoAnexadoPorUsuarioId = ?,
            documentoAnexadoPorNome = ?, documentoAnexadoEm = NOW(), updatedAt = NOW()
      WHERE id = ? AND lojaId = ?`,
    [
      data.documentoKey,
      String(data.documentoNome || "documento").slice(0, 255),
      String(data.documentoMime || "application/octet-stream").slice(0, 120),
      Number(data.documentoTamanho || 0),
      Number(data.usuarioId),
      data.usuarioNome,
      Number(data.tratativaId),
      Number(data.lojaId),
    ]
  );

  if (!result?.affectedRows) throw new Error("Tratativa não encontrada");
  return { success: true };
}

export async function getRhPontoTratativaDocumento(tratativaId: number, lojaId: number) {
  await ensureRhPontoTables();
  if (!_pool) throw new Error("Pool do banco não disponível");

  const [rows] = await _pool.query<any[]>(
    `SELECT id, lojaId, funcionarioId, tipo, documentoKey, documentoNome, documentoMime
       FROM rh_ponto_tratativas
      WHERE id = ? AND lojaId = ? LIMIT 1`,
    [Number(tratativaId), Number(lojaId)]
  );
  return rows?.[0] || null;
}

export async function salvarRhPontoConferencia(data: {
  lojaId: number;
  dataReferencia: string;
  periodo: RhPontoPeriodo;
  observacao?: string | null;
  ocorrencias: Array<{
    funcionarioId: number;
    horarioBatida: string;
    observacao?: string | null;
  }>;
  usuarioId: number;
  usuarioNome: string;
}) {
  await ensureRhPontoTables();
  if (!_pool) throw new Error("Pool do banco não disponível");

  const lojaId = Number(data.lojaId);
  const dataReferencia = normalizarDataCivilRh(data.dataReferencia);
  const horarioPrevisto = RH_PONTO_HORARIOS[data.periodo];
  if (!horarioPrevisto) throw new Error("Período inválido");

  const connection = await _pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      `INSERT INTO rh_ponto_conferencias (
         lojaId, dataReferencia, periodo, horarioPrevisto,
         conferidoPorUsuarioId, conferidoPorNome, conferidoEm, observacao, origem
       ) VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, 'manual')
       ON DUPLICATE KEY UPDATE
         conferidoPorUsuarioId = VALUES(conferidoPorUsuarioId),
         conferidoPorNome = VALUES(conferidoPorNome), conferidoEm = NOW(),
         observacao = VALUES(observacao), origem = 'manual', updatedAt = NOW()`,
      [lojaId, dataReferencia, data.periodo, horarioPrevisto, Number(data.usuarioId), data.usuarioNome, data.observacao?.trim() || null]
    );

    const [cRows] = await connection.query<any[]>(
      `SELECT id FROM rh_ponto_conferencias WHERE lojaId = ? AND dataReferencia = ? AND periodo = ? LIMIT 1`,
      [lojaId, dataReferencia, data.periodo]
    );
    const conferenciaId = Number(cRows?.[0]?.id || 0);
    if (!conferenciaId) throw new Error("Conferência não encontrada");

    for (const ocorrencia of data.ocorrencias || []) {
      const horarioBatida = String(ocorrencia.horarioBatida || "").trim();
      const minutosAtraso = calcularMinutosAtrasoRh(horarioPrevisto, horarioBatida);
      const tipo = minutosAtraso > RH_PONTO_LIMITE_ADVERTENCIA_ATRASO_MINUTOS ? "atraso" : "atraso_registrado";
      await connection.query(
        `INSERT INTO rh_ponto_ocorrencias (
           conferenciaId, lojaId, funcionarioId, horarioPrevisto, horarioBatida,
           minutosAtraso, observacao, tipoOcorrencia, advertenciaObrigatoria, advertenciaStatus
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'dispensada')`,
        [
          conferenciaId,
          lojaId,
          Number(ocorrencia.funcionarioId),
          horarioPrevisto,
          horarioBatida,
          minutosAtraso,
          ocorrencia.observacao?.trim() || null,
          tipo,
          tipo === "atraso" ? 1 : 0,
        ]
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return getRhPontoDia(lojaId, dataReferencia);
}

// ======================================================
// RH • FECHAMENTO DE CAIXA
// ======================================================

type RhCaixaContagem = {
  cedula200: number;
  cedula100: number;
  cedula50: number;
  cedula20: number;
  cedula10: number;
  cedula5: number;
  cedula2: number;
  moeda1: number;
  moeda050: number;
  moeda025: number;
  moeda010: number;
  moeda005: number;
  moeda001: number;
};

const RH_CAIXA_DENOMINACOES_CENTAVOS: Record<keyof RhCaixaContagem, number> = {
  cedula200: 20000,
  cedula100: 10000,
  cedula50: 5000,
  cedula20: 2000,
  cedula10: 1000,
  cedula5: 500,
  cedula2: 200,
  moeda1: 100,
  moeda050: 50,
  moeda025: 25,
  moeda010: 10,
  moeda005: 5,
  moeda001: 1,
};

let _rhCaixaTablesReady = false;

async function ensureRhCaixaTables() {
  if (_rhCaixaTablesReady) return;

  await getDb();
  if (!_pool) throw new Error("Pool do banco não disponível");

  await _pool.query(`
    CREATE TABLE IF NOT EXISTS rh_caixa_fechamentos (
      id INT NOT NULL AUTO_INCREMENT,
      lojaId INT NOT NULL,
      dataReferencia DATE NOT NULL,
      contaNome VARCHAR(100) NOT NULL DEFAULT 'CAIXA',
      relatorioNome VARCHAR(255) NOT NULL,
      relatorioHash VARCHAR(64) NOT NULL,
      relatorioKey TEXT NULL,
      relatorioBase64 LONGTEXT NULL,
      relatorioMime VARCHAR(120) NULL,
      relatorioTamanho INT NOT NULL DEFAULT 0,
      relatorioTotalMovimentos INT NOT NULL DEFAULT 0,
      saldoInicial DECIMAL(14,2) NOT NULL DEFAULT 0,
      totalCreditos DECIMAL(14,2) NOT NULL DEFAULT 0,
      totalDebitos DECIMAL(14,2) NOT NULL DEFAULT 0,
      saldoFinal DECIMAL(14,2) NOT NULL DEFAULT 0,
      contagemJson LONGTEXT NOT NULL,
      totalFisico DECIMAL(14,2) NOT NULL DEFAULT 0,
      diferenca DECIMAL(14,2) NOT NULL DEFAULT 0,
      status ENUM('correto','diferenca_justificada') NOT NULL DEFAULT 'correto',
      justificativaTipo VARCHAR(60) NULL,
      justificativaObservacao TEXT NULL,
      fechadoPorUsuarioId INT NOT NULL,
      fechadoPorNome VARCHAR(255) NOT NULL,
      fechadoEm DATETIME NOT NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_rh_caixa_loja_data (lojaId, dataReferencia),
      KEY idx_rh_caixa_data (dataReferencia),
      KEY idx_rh_caixa_loja (lojaId),
      KEY idx_rh_caixa_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const [colunasRhCaixa] = await _pool.query<any[]>(
    `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'rh_caixa_fechamentos'`
  );
  const colunasRhCaixaExistentes = new Set(
    (colunasRhCaixa || []).map((row: any) => String(row.COLUMN_NAME || row.column_name || ""))
  );
  if (!colunasRhCaixaExistentes.has("relatorioBase64")) {
    try {
      await _pool.query(
        `ALTER TABLE rh_caixa_fechamentos ADD COLUMN relatorioBase64 LONGTEXT NULL AFTER relatorioKey`
      );
    } catch (error: any) {
      if (String(error?.code || "") !== "ER_DUP_FIELDNAME") throw error;
    }
  }

  _rhCaixaTablesReady = true;
}

function normalizarContagemRhCaixa(contagem: Partial<RhCaixaContagem>): RhCaixaContagem {
  const normalizada = {} as RhCaixaContagem;

  for (const chave of Object.keys(RH_CAIXA_DENOMINACOES_CENTAVOS) as Array<keyof RhCaixaContagem>) {
    const valor = Number(contagem?.[chave] || 0);
    if (!Number.isFinite(valor) || valor < 0 || !Number.isInteger(valor)) {
      throw new Error(`Quantidade inválida na contagem: ${String(chave)}`);
    }
    normalizada[chave] = valor;
  }

  return normalizada;
}

function calcularTotalFisicoRhCaixaCentavos(contagem: RhCaixaContagem) {
  return (Object.keys(RH_CAIXA_DENOMINACOES_CENTAVOS) as Array<keyof RhCaixaContagem>).reduce(
    (total, chave) => total + contagem[chave] * RH_CAIXA_DENOMINACOES_CENTAVOS[chave],
    0
  );
}

function mapearRhCaixaFechamento(row: any) {
  let contagem: RhCaixaContagem | null = null;
  try {
    contagem = row?.contagemJson ? JSON.parse(String(row.contagemJson)) : null;
  } catch {
    contagem = null;
  }

  return {
    id: Number(row.id),
    lojaId: Number(row.lojaId),
    lojaNome: row.lojaNome || `Loja ${row.lojaId}`,
    dataReferencia: String(row.dataReferencia || "").slice(0, 10),
    contaNome: row.contaNome || "CAIXA",
    relatorioNome: row.relatorioNome || "relatorio.xlsx",
    relatorioHash: row.relatorioHash || "",
    relatorioTotalMovimentos: Number(row.relatorioTotalMovimentos || 0),
    saldoInicial: Number(row.saldoInicial || 0),
    totalCreditos: Number(row.totalCreditos || 0),
    totalDebitos: Number(row.totalDebitos || 0),
    saldoFinal: Number(row.saldoFinal || 0),
    contagem,
    totalFisico: Number(row.totalFisico || 0),
    diferenca: Number(row.diferenca || 0),
    status: row.status || "correto",
    justificativaTipo: row.justificativaTipo || null,
    justificativaObservacao: row.justificativaObservacao || null,
    fechadoPorUsuarioId: Number(row.fechadoPorUsuarioId || 0),
    fechadoPorNome: row.fechadoPorNome || "",
    fechadoEm: row.fechadoEm || null,
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null,
  };
}

export async function getRhCaixaDia(lojaId: number, dataReferencia: string) {
  await ensureRhCaixaTables();
  if (!_pool) throw new Error("Pool do banco não disponível");

  const data = normalizarDataCivilRh(dataReferencia);
  const [rows] = await _pool.query<any[]>(
    `SELECT f.*, l.nome AS lojaNome,
            DATE_FORMAT(f.dataReferencia, '%Y-%m-%d') AS dataReferencia
       FROM rh_caixa_fechamentos f
       LEFT JOIN lojas l ON l.id = f.lojaId
      WHERE f.lojaId = ? AND f.dataReferencia = ?
      LIMIT 1`,
    [Number(lojaId), data]
  );

  return rows?.[0] ? mapearRhCaixaFechamento(rows[0]) : null;
}

export async function getRhCaixaHistorico(args: {
  dataInicio: string;
  dataFim: string;
  lojaId?: number | null;
}) {
  await ensureRhCaixaTables();
  if (!_pool) throw new Error("Pool do banco não disponível");

  const dataInicio = normalizarDataCivilRh(args.dataInicio);
  const dataFim = normalizarDataCivilRh(args.dataFim);
  if (dataInicio > dataFim) throw new Error("Período inválido");

  const params: any[] = [dataInicio, dataFim];
  let filtroLoja = "";
  if (args.lojaId) {
    filtroLoja = " AND f.lojaId = ?";
    params.push(Number(args.lojaId));
  }

  const [rows] = await _pool.query<any[]>(
    `SELECT f.*, l.nome AS lojaNome,
            DATE_FORMAT(f.dataReferencia, '%Y-%m-%d') AS dataReferencia
       FROM rh_caixa_fechamentos f
       LEFT JOIN lojas l ON l.id = f.lojaId
      WHERE f.dataReferencia BETWEEN ? AND ? ${filtroLoja}
      ORDER BY f.dataReferencia DESC, l.nome ASC, f.id DESC`,
    params
  );

  return (rows || []).map(mapearRhCaixaFechamento);
}

export async function salvarRhCaixaFechamento(data: {
  lojaId: number;
  dataReferencia: string;
  contaNome: string;
  relatorioNome: string;
  relatorioHash: string;
  relatorioKey?: string | null;
  relatorioBase64?: string | null;
  relatorioMime: string;
  relatorioTamanho: number;
  relatorioTotalMovimentos: number;
  saldoInicial: number;
  totalCreditos: number;
  totalDebitos: number;
  saldoFinal: number;
  contagem: RhCaixaContagem;
  justificativaTipo?: string | null;
  justificativaObservacao?: string | null;
  usuarioId: number;
  usuarioNome: string;
}) {
  await ensureRhCaixaTables();
  if (!_pool) throw new Error("Pool do banco não disponível");

  const lojaId = Number(data.lojaId);
  const dataReferencia = normalizarDataCivilRh(data.dataReferencia);
  const contagem = normalizarContagemRhCaixa(data.contagem);
  const totalFisicoCentavos = calcularTotalFisicoRhCaixaCentavos(contagem);
  const saldoFinalCentavos = Math.round(Number(data.saldoFinal || 0) * 100);
  const diferencaCentavos = totalFisicoCentavos - saldoFinalCentavos;
  const totalFisico = totalFisicoCentavos / 100;
  const diferenca = diferencaCentavos / 100;
  const status = diferencaCentavos === 0 ? "correto" : "diferenca_justificada";

  let justificativaTipo = String(data.justificativaTipo || "").trim();
  const justificativaObservacao = String(data.justificativaObservacao || "").trim();
  const diferencaAbsolutaCentavos = Math.abs(diferencaCentavos);
  const dentroMargem = diferencaCentavos !== 0 && diferencaAbsolutaCentavos <= 500;
  const motivosForaMargem = new Set([
    "uber_aberto",
    "pagamento_dinheiro_pix_aberto",
    "outro",
  ]);

  if (diferencaCentavos !== 0) {
    if (dentroMargem) {
      justificativaTipo = "diferenca_caixa";
    } else {
      if (!justificativaTipo) throw new Error("Informe o motivo da diferença do caixa");
      if (!motivosForaMargem.has(justificativaTipo)) {
        throw new Error("Selecione um motivo válido para a diferença acima de R$ 5,00");
      }
    }

    if (justificativaObservacao.length < 3) {
      throw new Error("A observação é obrigatória. Descreva o motivo da diferença do caixa");
    }
  }

  await _pool.query(
    `INSERT INTO rh_caixa_fechamentos (
       lojaId, dataReferencia, contaNome,
       relatorioNome, relatorioHash, relatorioKey, relatorioBase64, relatorioMime,
       relatorioTamanho, relatorioTotalMovimentos,
       saldoInicial, totalCreditos, totalDebitos, saldoFinal,
       contagemJson, totalFisico, diferenca, status,
       justificativaTipo, justificativaObservacao,
       fechadoPorUsuarioId, fechadoPorNome, fechadoEm
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       contaNome = VALUES(contaNome),
       relatorioNome = VALUES(relatorioNome),
       relatorioHash = VALUES(relatorioHash),
       relatorioKey = VALUES(relatorioKey),
       relatorioBase64 = VALUES(relatorioBase64),
       relatorioMime = VALUES(relatorioMime),
       relatorioTamanho = VALUES(relatorioTamanho),
       relatorioTotalMovimentos = VALUES(relatorioTotalMovimentos),
       saldoInicial = VALUES(saldoInicial),
       totalCreditos = VALUES(totalCreditos),
       totalDebitos = VALUES(totalDebitos),
       saldoFinal = VALUES(saldoFinal),
       contagemJson = VALUES(contagemJson),
       totalFisico = VALUES(totalFisico),
       diferenca = VALUES(diferenca),
       status = VALUES(status),
       justificativaTipo = VALUES(justificativaTipo),
       justificativaObservacao = VALUES(justificativaObservacao),
       fechadoPorUsuarioId = VALUES(fechadoPorUsuarioId),
       fechadoPorNome = VALUES(fechadoPorNome),
       fechadoEm = NOW(),
       updatedAt = NOW()`,
    [
      lojaId,
      dataReferencia,
      String(data.contaNome || "CAIXA").slice(0, 100),
      String(data.relatorioNome || "relatorio.xlsx").slice(0, 255),
      String(data.relatorioHash || "").slice(0, 64),
      data.relatorioKey ?? null,
      data.relatorioBase64 ?? null,
      String(data.relatorioMime || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").slice(0, 120),
      Number(data.relatorioTamanho || 0),
      Number(data.relatorioTotalMovimentos || 0),
      Number(data.saldoInicial || 0).toFixed(2),
      Number(data.totalCreditos || 0).toFixed(2),
      Number(data.totalDebitos || 0).toFixed(2),
      Number(data.saldoFinal || 0).toFixed(2),
      JSON.stringify(contagem),
      totalFisico.toFixed(2),
      diferenca.toFixed(2),
      status,
      diferencaCentavos === 0 ? null : justificativaTipo,
      diferencaCentavos === 0 ? null : justificativaObservacao,
      Number(data.usuarioId),
      data.usuarioNome,
    ]
  );

  return getRhCaixaDia(lojaId, dataReferencia);
}

export async function getRhCaixaRelatorioArquivo(fechamentoId: number, lojaId: number) {
  await ensureRhCaixaTables();
  if (!_pool) throw new Error("Pool do banco não disponível");

  const [rows] = await _pool.query<any[]>(
    `SELECT id, lojaId, relatorioKey, relatorioBase64, relatorioNome, relatorioMime
       FROM rh_caixa_fechamentos
      WHERE id = ? AND lojaId = ?
      LIMIT 1`,
    [Number(fechamentoId), Number(lojaId)]
  );

  return rows?.[0] || null;
}
