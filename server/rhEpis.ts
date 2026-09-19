import mysql from "mysql2/promise";
import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";

const ITENS_EPI = [
  "luva",
  "protetor_ouvido",
  "creme_protecao",
  "oculos_protecao",
  "oculos",
  "botina",
  "uniforme",
] as const;

const itemEpiSchema = z.enum(ITENS_EPI);

const ITENS_EPI_LOTE = [
  "luva",
  "protetor_ouvido",
  "creme_protecao",
  "oculos_protecao",
  "oculos",
  "botina",
] as const;

const itemEpiLoteSchema = z.enum(ITENS_EPI_LOTE);
const dataCivilSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const MIME_PERMITIDOS = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const TAMANHO_MAXIMO = 6 * 1024 * 1024;

let poolEpis: mysql.Pool | null = null;
let estruturaEpisPronta = false;

function getPoolEpis() {
  if (!process.env.DATABASE_URL) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Banco de dados não configurado.",
    });
  }

  if (!poolEpis) {
    poolEpis = mysql.createPool({
      uri: process.env.DATABASE_URL,
      waitForConnections: true,
      connectionLimit: 4,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
    });
  }

  return poolEpis;
}

async function ensureRhEpisTable() {
  if (estruturaEpisPronta) return;

  const pool = getPoolEpis();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS rh_epi_entregas (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      lojaId INT NOT NULL,
      funcionarioId INT NOT NULL,
      item VARCHAR(50) NOT NULL,
      quantidade INT UNSIGNED NOT NULL DEFAULT 1,
      tamanho VARCHAR(80) NULL,
      dataEntrega DATE NOT NULL,
      observacao TEXT NULL,
      comprovanteNome VARCHAR(255) NULL,
      comprovanteMime VARCHAR(120) NULL,
      comprovanteTamanho INT UNSIGNED NULL,
      comprovanteHash CHAR(64) NULL,
      comprovanteConteudo LONGBLOB NULL,
      comprovantePorUsuarioId INT NULL,
      comprovantePorNome VARCHAR(255) NULL,
      comprovanteAnexadoEm DATETIME NULL,
      entreguePorUsuarioId INT NULL,
      entreguePorNome VARCHAR(255) NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_rh_epi_loja_data (lojaId, dataEntrega),
      KEY idx_rh_epi_funcionario (funcionarioId),
      KEY idx_rh_epi_item (item)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  const colunasUniforme = [
    "uniformeCamiseta",
    "uniformeCalca",
    "uniformeMoletom",
    "uniformeCamisa",
    "uniformeCamisetaPolo",
  ] as const;

  for (const nomeColuna of colunasUniforme) {
    const [existentes] = await pool.query<any[]>(
      `SELECT COLUMN_NAME
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'rh_epi_entregas'
          AND COLUMN_NAME = ?
        LIMIT 1`,
      [nomeColuna]
    );

    if (!existentes.length) {
      await pool.query(
        `ALTER TABLE rh_epi_entregas ADD COLUMN \`${nomeColuna}\` INT UNSIGNED NULL`
      );
    }
  }

  const [colunaLote] = await pool.query<any[]>(
    `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'rh_epi_entregas'
        AND COLUMN_NAME = 'loteId'
      LIMIT 1`
  );

  if (!colunaLote.length) {
    await pool.query(
      `ALTER TABLE rh_epi_entregas ADD COLUMN loteId BIGINT UNSIGNED NULL`
    );
  }

  const [indiceLote] = await pool.query<any[]>(
    `SELECT INDEX_NAME
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'rh_epi_entregas'
        AND INDEX_NAME = 'idx_rh_epi_lote'
      LIMIT 1`
  );

  if (!indiceLote.length) {
    await pool.query(
      `ALTER TABLE rh_epi_entregas ADD INDEX idx_rh_epi_lote (loteId)`
    );
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS rh_uniforme_movimentacoes (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      lojaId INT NOT NULL,
      funcionarioId INT NOT NULL,
      tipo VARCHAR(20) NOT NULL,
      dataMovimentacao DATE NOT NULL,

      devolvidoCamiseta INT UNSIGNED NOT NULL DEFAULT 0,
      devolvidoCalca INT UNSIGNED NOT NULL DEFAULT 0,
      devolvidoMoletom INT UNSIGNED NOT NULL DEFAULT 0,
      devolvidoCamisa INT UNSIGNED NOT NULL DEFAULT 0,
      devolvidoCamisetaPolo INT UNSIGNED NOT NULL DEFAULT 0,

      recebidoCamiseta INT UNSIGNED NOT NULL DEFAULT 0,
      recebidoCalca INT UNSIGNED NOT NULL DEFAULT 0,
      recebidoMoletom INT UNSIGNED NOT NULL DEFAULT 0,
      recebidoCamisa INT UNSIGNED NOT NULL DEFAULT 0,
      recebidoCamisetaPolo INT UNSIGNED NOT NULL DEFAULT 0,

      observacao TEXT NULL,
      registradoPorUsuarioId INT NULL,
      registradoPorNome VARCHAR(255) NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

      PRIMARY KEY (id),
      KEY idx_rh_uniforme_mov_funcionario (funcionarioId),
      KEY idx_rh_uniforme_mov_loja_data (lojaId, dataMovimentacao)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  estruturaEpisPronta = true;
}

function perfilRh(ctx: any) {
  const role = String(ctx.user?.role || "");
  const lojaId = Number(ctx.user?.lojaId || 0);

  return {
    role,
    lojaId,
    caixaLider: role === "rh" && lojaId > 0,
    liderRh: role === "rh" && lojaId <= 0,
    adminOuGestor: role === "admin" || role === "gestor",
  };
}

function assertAcessoRhEpis(ctx: any, lojaId?: number | null) {
  const perfil = perfilRh(ctx);

  if (!perfil.caixaLider && !perfil.liderRh && !perfil.adminOuGestor) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Usuário sem acesso ao controle de EPIs.",
    });
  }

  if (perfil.caixaLider && lojaId && Number(lojaId) !== Number(perfil.lojaId)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "A Caixa Líder só pode acessar EPIs da própria loja.",
    });
  }

  return perfil;
}

function nomeArquivoSeguro(nome: string) {
  const limpo = String(nome || "comprovante")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
  return limpo || "comprovante";
}

function bufferArquivo(base64: string) {
  let arquivo: Buffer;
  try {
    arquivo = Buffer.from(base64, "base64");
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Arquivo inválido." });
  }

  if (!arquivo.length || arquivo.length > TAMANHO_MAXIMO) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "O comprovante deve ter no máximo 6 MB.",
    });
  }
  return arquivo;
}

function validarMime(mime: string) {
  if (!MIME_PERMITIDOS.has(mime)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Envie PDF, JPG, PNG, WEBP ou foto HEIC/HEIF.",
    });
  }
}

async function validarFuncionarioDaLoja(pool: mysql.Pool, funcionarioId: number, lojaId: number) {
  const [funcionarios] = await pool.query<any[]>(
    `SELECT id, nome, lojaId FROM funcionarios WHERE id = ? AND lojaId = ? LIMIT 1`,
    [funcionarioId, lojaId]
  );

  if (!funcionarios?.[0]) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Funcionário não pertence à loja selecionada.",
    });
  }
}

export type SaldoUniformeFuncionario = {
  camiseta: number;
  calca: number;
  moletom: number;
  camisa: number;
  camisetaPolo: number;
};

export async function obterSaldoUniformeFuncionario(
  funcionarioId: number,
  lojaId: number
): Promise<SaldoUniformeFuncionario> {
  await ensureRhEpisTable();
  const pool = getPoolEpis();

  const [entregas] = await pool.query<any[]>(
    `SELECT
       COALESCE(SUM(uniformeCamiseta), 0) AS camiseta,
       COALESCE(SUM(uniformeCalca), 0) AS calca,
       COALESCE(SUM(uniformeMoletom), 0) AS moletom,
       COALESCE(SUM(uniformeCamisa), 0) AS camisa,
       COALESCE(SUM(uniformeCamisetaPolo), 0) AS camisetaPolo
     FROM rh_epi_entregas
     WHERE funcionarioId = ?
       AND lojaId = ?
       AND item = 'uniforme'`,
    [funcionarioId, lojaId]
  );

  const [movimentacoes] = await pool.query<any[]>(
    `SELECT
       COALESCE(SUM(recebidoCamiseta), 0) - COALESCE(SUM(devolvidoCamiseta), 0) AS camiseta,
       COALESCE(SUM(recebidoCalca), 0) - COALESCE(SUM(devolvidoCalca), 0) AS calca,
       COALESCE(SUM(recebidoMoletom), 0) - COALESCE(SUM(devolvidoMoletom), 0) AS moletom,
       COALESCE(SUM(recebidoCamisa), 0) - COALESCE(SUM(devolvidoCamisa), 0) AS camisa,
       COALESCE(SUM(recebidoCamisetaPolo), 0) - COALESCE(SUM(devolvidoCamisetaPolo), 0) AS camisetaPolo
     FROM rh_uniforme_movimentacoes
     WHERE funcionarioId = ?
       AND lojaId = ?`,
    [funcionarioId, lojaId]
  );

  const base = entregas?.[0] || {};
  const mov = movimentacoes?.[0] || {};

  return {
    camiseta: Number(base.camiseta || 0) + Number(mov.camiseta || 0),
    calca: Number(base.calca || 0) + Number(mov.calca || 0),
    moletom: Number(base.moletom || 0) + Number(mov.moletom || 0),
    camisa: Number(base.camisa || 0) + Number(mov.camisa || 0),
    camisetaPolo: Number(base.camisetaPolo || 0) + Number(mov.camisetaPolo || 0),
  };
}

export const rhEpisRouter = router({
  listar: protectedProcedure
    .input(
      z.object({
        lojaId: z.number().int().positive().nullable().optional(),
        funcionarioId: z.number().int().positive().nullable().optional(),
        item: itemEpiSchema.nullable().optional(),
        dataInicio: dataCivilSchema.nullable().optional(),
        dataFim: dataCivilSchema.nullable().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      await ensureRhEpisTable();
      const perfil = assertAcessoRhEpis(ctx, input.lojaId ?? null);
      const pool = getPoolEpis();
      const condicoes: string[] = ["1 = 1"];
      const params: any[] = [];

      const lojaEfetiva = perfil.caixaLider ? perfil.lojaId : input.lojaId || null;

      if (lojaEfetiva) {
        condicoes.push("e.lojaId = ?");
        params.push(Number(lojaEfetiva));
      }
      if (input.funcionarioId) {
        condicoes.push("e.funcionarioId = ?");
        params.push(Number(input.funcionarioId));
      }
      if (input.item) {
        condicoes.push("e.item = ?");
        params.push(input.item);
      }
      if (input.dataInicio) {
        condicoes.push("e.dataEntrega >= ?");
        params.push(input.dataInicio);
      }
      if (input.dataFim) {
        condicoes.push("e.dataEntrega <= ?");
        params.push(input.dataFim);
      }

      const [rows] = await pool.query<any[]>(
        `SELECT
           e.id,
           e.loteId,
           e.lojaId,
           COALESCE(l.nome, CONCAT('Loja ', e.lojaId)) AS lojaNome,
           e.funcionarioId,
           COALESCE(f.nome, CONCAT('Funcionário ', e.funcionarioId)) AS funcionarioNome,
           f.funcao AS funcionarioFuncao,
           e.item,
           e.quantidade,
           e.uniformeCamiseta,
           e.uniformeCalca,
           e.uniformeMoletom,
           e.uniformeCamisa,
           e.uniformeCamisetaPolo,
           e.tamanho,
           DATE_FORMAT(e.dataEntrega, '%Y-%m-%d') AS dataEntrega,
           DATE_FORMAT(
             CASE
               WHEN e.item = 'luva' THEN DATE_ADD(e.dataEntrega, INTERVAL 7 DAY)
               WHEN e.item = 'protetor_ouvido' THEN DATE_ADD(e.dataEntrega, INTERVAL 15 DAY)
               WHEN e.item = 'creme_protecao' THEN DATE_ADD(e.dataEntrega, INTERVAL 3 MONTH)
               WHEN e.item = 'oculos_protecao' THEN DATE_ADD(e.dataEntrega, INTERVAL 2 MONTH)
               WHEN e.item = 'botina' THEN DATE_ADD(e.dataEntrega, INTERVAL 6 MONTH)
               ELSE NULL
             END,
             '%Y-%m-%d'
           ) AS proximaTroca,
           COALESCE(mestre.observacao, e.observacao) AS observacao,
           COALESCE(mestre.comprovanteNome, e.comprovanteNome) AS comprovanteNome,
           COALESCE(mestre.comprovanteMime, e.comprovanteMime) AS comprovanteMime,
           COALESCE(mestre.comprovanteTamanho, e.comprovanteTamanho) AS comprovanteTamanho,
           CASE
             WHEN COALESCE(mestre.comprovanteConteudo, e.comprovanteConteudo) IS NULL
               OR COALESCE(mestre.comprovanteNome, e.comprovanteNome) IS NULL
             THEN 1
             ELSE 0
           END AS comprovantePendente,
           COALESCE(mestre.entreguePorUsuarioId, e.entreguePorUsuarioId) AS entreguePorUsuarioId,
           COALESCE(mestre.entreguePorNome, e.entreguePorNome) AS entreguePorNome,
           COALESCE(mestre.comprovantePorUsuarioId, e.comprovantePorUsuarioId) AS comprovantePorUsuarioId,
           COALESCE(mestre.comprovantePorNome, e.comprovantePorNome) AS comprovantePorNome,
           DATE_FORMAT(COALESCE(mestre.createdAt, e.createdAt), '%Y-%m-%dT%H:%i:%s') AS criadoEm,
           DATE_FORMAT(COALESCE(mestre.comprovanteAnexadoEm, e.comprovanteAnexadoEm), '%Y-%m-%dT%H:%i:%s') AS comprovanteAnexadoEm
         FROM rh_epi_entregas e
         LEFT JOIN rh_epi_entregas mestre ON mestre.id = e.loteId
         LEFT JOIN funcionarios f ON f.id = e.funcionarioId
         LEFT JOIN lojas l ON l.id = e.lojaId
         WHERE ${condicoes.join(" AND ")}
         ORDER BY e.dataEntrega DESC, e.createdAt DESC, e.id DESC
         LIMIT 1500`,
        params
      );

      return (rows || []).map((row: any) => ({
        ...row,
        id: Number(row.id),
        loteId:
          row.loteId === null || row.loteId === undefined
            ? null
            : Number(row.loteId),
        lojaId: Number(row.lojaId),
        funcionarioId: Number(row.funcionarioId),
        quantidade: Number(row.quantidade || 0),
        uniformeCamiseta:
          row.uniformeCamiseta === null || row.uniformeCamiseta === undefined
            ? null
            : Number(row.uniformeCamiseta),
        uniformeCalca:
          row.uniformeCalca === null || row.uniformeCalca === undefined
            ? null
            : Number(row.uniformeCalca),
        uniformeMoletom:
          row.uniformeMoletom === null || row.uniformeMoletom === undefined
            ? null
            : Number(row.uniformeMoletom),
        uniformeCamisa:
          row.uniformeCamisa === null || row.uniformeCamisa === undefined
            ? null
            : Number(row.uniformeCamisa),
        uniformeCamisetaPolo:
          row.uniformeCamisetaPolo === null || row.uniformeCamisetaPolo === undefined
            ? null
            : Number(row.uniformeCamisetaPolo),
        comprovanteTamanho:
          row.comprovanteTamanho === null || row.comprovanteTamanho === undefined
            ? null
            : Number(row.comprovanteTamanho),
        comprovantePendente: Boolean(Number(row.comprovantePendente || 0)),
      }));
    }),

  saldoUniforme: protectedProcedure
    .input(
      z.object({
        lojaId: z.number().int().positive(),
        funcionarioId: z.number().int().positive(),
      })
    )
    .query(async ({ input, ctx }) => {
      await ensureRhEpisTable();
      assertAcessoRhEpis(ctx, input.lojaId);

      const pool = getPoolEpis();
      await validarFuncionarioDaLoja(pool, input.funcionarioId, input.lojaId);

      return obterSaldoUniformeFuncionario(input.funcionarioId, input.lojaId);
    }),

  movimentarUniforme: protectedProcedure
    .input(
      z.object({
        lojaId: z.number().int().positive(),
        funcionarioId: z.number().int().positive(),
        tipo: z.enum(["troca", "devolucao"]),
        dataMovimentacao: dataCivilSchema,
        devolvido: z.object({
          camiseta: z.number().int().min(0).max(99),
          calca: z.number().int().min(0).max(99),
          moletom: z.number().int().min(0).max(99),
          camisa: z.number().int().min(0).max(99),
          camisetaPolo: z.number().int().min(0).max(99),
        }),
        recebido: z.object({
          camiseta: z.number().int().min(0).max(99),
          calca: z.number().int().min(0).max(99),
          moletom: z.number().int().min(0).max(99),
          camisa: z.number().int().min(0).max(99),
          camisetaPolo: z.number().int().min(0).max(99),
        }),
        observacao: z.string().trim().max(2000).nullable().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await ensureRhEpisTable();
      assertAcessoRhEpis(ctx, input.lojaId);

      const pool = getPoolEpis();
      await validarFuncionarioDaLoja(pool, input.funcionarioId, input.lojaId);

      const saldoAtual = await obterSaldoUniformeFuncionario(
        input.funcionarioId,
        input.lojaId
      );

      const totalDevolvido = Object.values(input.devolvido).reduce(
        (total, valor) => total + valor,
        0
      );
      const totalRecebido = Object.values(input.recebido).reduce(
        (total, valor) => total + valor,
        0
      );

      if (totalDevolvido <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Informe pelo menos uma peça devolvida.",
        });
      }

      if (input.tipo === "devolucao" && totalRecebido > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Na devolução avulsa não pode haver novas peças entregues.",
        });
      }

      const conferir: Array<{
        chave: keyof SaldoUniformeFuncionario;
        rotulo: string;
      }> = [
        { chave: "camiseta", rotulo: "camiseta" },
        { chave: "calca", rotulo: "calça" },
        { chave: "moletom", rotulo: "moletom" },
        { chave: "camisa", rotulo: "camisa" },
        { chave: "camisetaPolo", rotulo: "camiseta polo" },
      ];

      for (const item of conferir) {
        if (input.devolvido[item.chave] > saldoAtual[item.chave]) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Não é possível devolver ${input.devolvido[item.chave]} de ${item.rotulo}. Saldo atual: ${saldoAtual[item.chave]}.`,
          });
        }
      }

      await pool.query(
        `INSERT INTO rh_uniforme_movimentacoes (
           lojaId,
           funcionarioId,
           tipo,
           dataMovimentacao,
           devolvidoCamiseta,
           devolvidoCalca,
           devolvidoMoletom,
           devolvidoCamisa,
           devolvidoCamisetaPolo,
           recebidoCamiseta,
           recebidoCalca,
           recebidoMoletom,
           recebidoCamisa,
           recebidoCamisetaPolo,
           observacao,
           registradoPorUsuarioId,
           registradoPorNome
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.lojaId,
          input.funcionarioId,
          input.tipo,
          input.dataMovimentacao,
          input.devolvido.camiseta,
          input.devolvido.calca,
          input.devolvido.moletom,
          input.devolvido.camisa,
          input.devolvido.camisetaPolo,
          input.recebido.camiseta,
          input.recebido.calca,
          input.recebido.moletom,
          input.recebido.camisa,
          input.recebido.camisetaPolo,
          input.observacao || null,
          Number(ctx.user?.id || 0) || null,
          String(ctx.user?.name || ctx.user?.email || "Usuário"),
        ]
      );

      return {
        success: true,
        saldoAnterior: saldoAtual,
        saldoAtual: await obterSaldoUniformeFuncionario(
          input.funcionarioId,
          input.lojaId
        ),
      };
    }),

  salvarLote: protectedProcedure
    .input(
      z.object({
        lojaId: z.number().int().positive(),
        funcionarioId: z.number().int().positive(),
        itens: z
          .array(
            z.object({
              item: itemEpiLoteSchema,
              quantidade: z.number().int().min(1).max(99),
              tamanho: z.string().trim().max(80).nullable().optional(),
            })
          )
          .min(1)
          .max(20),
        dataEntrega: dataCivilSchema,
        observacao: z.string().trim().max(2000).nullable().optional(),
        comprovanteNome: z.string().trim().min(1).max(255).nullable().optional(),
        comprovanteMime: z.string().trim().min(1).max(120).nullable().optional(),
        comprovanteTamanho: z.number().int().positive().max(TAMANHO_MAXIMO).nullable().optional(),
        comprovanteBase64: z.string().min(1).nullable().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await ensureRhEpisTable();
      assertAcessoRhEpis(ctx, input.lojaId);

      const pool = getPoolEpis();
      await validarFuncionarioDaLoja(pool, input.funcionarioId, input.lojaId);

      const itensUnicos = new Set(input.itens.map((item) => item.item));
      if (itensUnicos.size !== input.itens.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cada EPI deve aparecer apenas uma vez no mesmo lote.",
        });
      }

      const temAlgumArquivo =
        Boolean(input.comprovanteNome) ||
        Boolean(input.comprovanteMime) ||
        Boolean(input.comprovanteTamanho) ||
        Boolean(input.comprovanteBase64);

      const temArquivoCompleto =
        Boolean(input.comprovanteNome) &&
        Boolean(input.comprovanteMime) &&
        Boolean(input.comprovanteTamanho) &&
        Boolean(input.comprovanteBase64);

      if (temAlgumArquivo && !temArquivoCompleto) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Os dados do comprovante estão incompletos.",
        });
      }

      let comprovanteNome: string | null = null;
      let comprovanteMime: string | null = null;
      let comprovanteTamanho: number | null = null;
      let comprovanteHash: string | null = null;
      let comprovanteConteudo: Buffer | null = null;
      let comprovantePorUsuarioId: number | null = null;
      let comprovantePorNome: string | null = null;
      let comprovanteAnexadoEm: Date | null = null;

      if (temArquivoCompleto) {
        validarMime(String(input.comprovanteMime));
        const arquivo = bufferArquivo(String(input.comprovanteBase64));

        comprovanteNome = nomeArquivoSeguro(String(input.comprovanteNome));
        comprovanteMime = String(input.comprovanteMime);
        comprovanteTamanho = arquivo.length;
        comprovanteHash = createHash("sha256").update(arquivo).digest("hex");
        comprovanteConteudo = arquivo;
        comprovantePorUsuarioId = Number(ctx.user?.id || 0) || null;
        comprovantePorNome = String(ctx.user?.name || ctx.user?.email || "Usuário");
        comprovanteAnexadoEm = new Date();
      }

      const entreguePorUsuarioId = Number(ctx.user?.id || 0) || null;
      const entreguePorNome = String(ctx.user?.name || ctx.user?.email || "Usuário");
      const primeiro = input.itens[0]!;
      const restantes = input.itens.slice(1);
      const connection = await pool.getConnection();

      try {
        await connection.beginTransaction();

        const [resultadoPrimeiro] = await connection.query<any>(
          `INSERT INTO rh_epi_entregas (
             lojaId, funcionarioId, item, quantidade, tamanho, dataEntrega, observacao,
             comprovanteNome, comprovanteMime, comprovanteTamanho, comprovanteHash,
             comprovanteConteudo, comprovantePorUsuarioId, comprovantePorNome,
             comprovanteAnexadoEm, entreguePorUsuarioId, entreguePorNome
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            input.lojaId,
            input.funcionarioId,
            primeiro.item,
            primeiro.quantidade,
            primeiro.tamanho || null,
            input.dataEntrega,
            input.observacao || null,
            comprovanteNome,
            comprovanteMime,
            comprovanteTamanho,
            comprovanteHash,
            comprovanteConteudo,
            comprovantePorUsuarioId,
            comprovantePorNome,
            comprovanteAnexadoEm,
            entreguePorUsuarioId,
            entreguePorNome,
          ]
        );

        const loteId = Number(resultadoPrimeiro.insertId);

        await connection.query(
          `UPDATE rh_epi_entregas SET loteId = ? WHERE id = ?`,
          [loteId, loteId]
        );

        const ids = [loteId];

        for (const item of restantes) {
          const [resultadoItem] = await connection.query<any>(
            `INSERT INTO rh_epi_entregas (
               lojaId, funcionarioId, loteId, item, quantidade, tamanho, dataEntrega
             ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              input.lojaId,
              input.funcionarioId,
              loteId,
              item.item,
              item.quantidade,
              item.tamanho || null,
              input.dataEntrega,
            ]
          );

          ids.push(Number(resultadoItem.insertId));
        }

        await connection.commit();

        return {
          success: true,
          loteId,
          ids,
          quantidadeItens: input.itens.length,
          documentoPendente: !comprovanteConteudo,
        };
      } catch (error) {
        try {
          await connection.rollback();
        } catch {
          // preserva o erro original
        }
        throw error;
      } finally {
        connection.release();
      }
    }),

  salvar: protectedProcedure
    .input(
      z.object({
        lojaId: z.number().int().positive(),
        funcionarioId: z.number().int().positive(),
        item: itemEpiSchema,
        quantidade: z.number().int().min(1).max(495),
        uniformeCamiseta: z.number().int().min(0).max(99).nullable().optional(),
        uniformeCalca: z.number().int().min(0).max(99).nullable().optional(),
        uniformeMoletom: z.number().int().min(0).max(99).nullable().optional(),
        uniformeCamisa: z.number().int().min(0).max(99).nullable().optional(),
        uniformeCamisetaPolo: z.number().int().min(0).max(99).nullable().optional(),
        tamanho: z.string().trim().max(80).nullable().optional(),
        dataEntrega: dataCivilSchema,
        observacao: z.string().trim().max(2000).nullable().optional(),
        comprovanteNome: z.string().trim().min(1).max(255).nullable().optional(),
        comprovanteMime: z.string().trim().min(1).max(120).nullable().optional(),
        comprovanteTamanho: z.number().int().positive().max(TAMANHO_MAXIMO).nullable().optional(),
        comprovanteBase64: z.string().min(1).nullable().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await ensureRhEpisTable();
      assertAcessoRhEpis(ctx, input.lojaId);

      const pool = getPoolEpis();
      await validarFuncionarioDaLoja(pool, input.funcionarioId, input.lojaId);

      const temAlgumArquivo =
        Boolean(input.comprovanteNome) ||
        Boolean(input.comprovanteMime) ||
        Boolean(input.comprovanteTamanho) ||
        Boolean(input.comprovanteBase64);

      const temArquivoCompleto =
        Boolean(input.comprovanteNome) &&
        Boolean(input.comprovanteMime) &&
        Boolean(input.comprovanteTamanho) &&
        Boolean(input.comprovanteBase64);

      if (temAlgumArquivo && !temArquivoCompleto) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Os dados do comprovante estão incompletos.",
        });
      }

      const uniformeQuantidades = {
        camiseta: input.uniformeCamiseta,
        calca: input.uniformeCalca,
        moletom: input.uniformeMoletom,
        camisa: input.uniformeCamisa,
        camisetaPolo: input.uniformeCamisetaPolo,
      };

      const valoresUniforme = Object.values(uniformeQuantidades);
      const uniformeCompleto = valoresUniforme.every(
        (valor) =>
          typeof valor === "number" &&
          Number.isInteger(valor) &&
          valor >= 0 &&
          valor <= 99
      );
      const totalUniformes = valoresUniforme.reduce(
        (total, valor) => total + (typeof valor === "number" ? valor : 0),
        0
      );

      if (input.item === "uniforme") {
        if (!uniformeCompleto) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Informe a quantidade de camiseta, calça, moletom, camisa e camiseta polo. Use 0 quando não houver a peça.",
          });
        }

        if (totalUniformes <= 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Informe pelo menos uma peça de uniforme entregue.",
          });
        }

        if (!temArquivoCompleto) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Para uniforme, a ficha assinada é obrigatória.",
          });
        }
      }

      const quantidadeGravada =
        input.item === "uniforme" ? totalUniformes : input.quantidade;

      let comprovanteNome: string | null = null;
      let comprovanteMime: string | null = null;
      let comprovanteTamanho: number | null = null;
      let comprovanteHash: string | null = null;
      let comprovanteConteudo: Buffer | null = null;
      let comprovantePorUsuarioId: number | null = null;
      let comprovantePorNome: string | null = null;
      let comprovanteAnexadoEm: Date | null = null;

      if (temArquivoCompleto) {
        validarMime(String(input.comprovanteMime));
        const arquivo = bufferArquivo(String(input.comprovanteBase64));

        comprovanteNome = nomeArquivoSeguro(String(input.comprovanteNome));
        comprovanteMime = String(input.comprovanteMime);
        comprovanteTamanho = arquivo.length;
        comprovanteHash = createHash("sha256").update(arquivo).digest("hex");
        comprovanteConteudo = arquivo;
        comprovantePorUsuarioId = Number(ctx.user?.id || 0) || null;
        comprovantePorNome = String(ctx.user?.name || ctx.user?.email || "Usuário");
        comprovanteAnexadoEm = new Date();
      }

      const [resultado] = await pool.query<any>(
        `INSERT INTO rh_epi_entregas (
           lojaId, funcionarioId, item, quantidade,
           uniformeCamiseta, uniformeCalca, uniformeMoletom, uniformeCamisa, uniformeCamisetaPolo,
           tamanho, dataEntrega, observacao,
           comprovanteNome, comprovanteMime, comprovanteTamanho, comprovanteHash,
           comprovanteConteudo, comprovantePorUsuarioId, comprovantePorNome,
           comprovanteAnexadoEm, entreguePorUsuarioId, entreguePorNome
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.lojaId,
          input.funcionarioId,
          input.item,
          quantidadeGravada,
          input.item === "uniforme" ? uniformeQuantidades.camiseta : null,
          input.item === "uniforme" ? uniformeQuantidades.calca : null,
          input.item === "uniforme" ? uniformeQuantidades.moletom : null,
          input.item === "uniforme" ? uniformeQuantidades.camisa : null,
          input.item === "uniforme" ? uniformeQuantidades.camisetaPolo : null,
          input.tamanho || null,
          input.dataEntrega,
          input.observacao || null,
          comprovanteNome,
          comprovanteMime,
          comprovanteTamanho,
          comprovanteHash,
          comprovanteConteudo,
          comprovantePorUsuarioId,
          comprovantePorNome,
          comprovanteAnexadoEm,
          Number(ctx.user?.id || 0) || null,
          String(ctx.user?.name || ctx.user?.email || "Usuário"),
        ]
      );

      return {
        success: true,
        id: Number(resultado.insertId),
        documentoPendente: !comprovanteConteudo,
      };
    }),

  excluirEntrega: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        lojaId: z.number().int().positive(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await ensureRhEpisTable();
      assertAcessoRhEpis(ctx, input.lojaId);

      const pool = getPoolEpis();
      const connection = await pool.getConnection();

      try {
        await connection.beginTransaction();

        const [rows] = await connection.query<any[]>(
          `SELECT id, lojaId, funcionarioId, item, loteId
             FROM rh_epi_entregas
            WHERE id = ?
            LIMIT 1
            FOR UPDATE`,
          [input.id]
        );

        const entrega = rows?.[0];

        if (!entrega) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Entrega de EPI não encontrada.",
          });
        }

        if (Number(entrega.lojaId) !== Number(input.lojaId)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "A entrega não pertence à loja informada.",
          });
        }

        if (String(entrega.item) === "uniforme") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Uniformes possuem fluxo próprio e não podem ser excluídos por esta ação.",
          });
        }

        const loteId = Number(entrega.loteId || 0) || null;
        let quantidadeExcluida = 0;

        if (loteId) {
          const [itensLote] = await connection.query<any[]>(
            `SELECT id, lojaId, item
               FROM rh_epi_entregas
              WHERE loteId = ?
              FOR UPDATE`,
            [loteId]
          );

          if (!itensLote.length) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "O lote desta entrega não foi encontrado.",
            });
          }

          const lojaDiferente = itensLote.some(
            (item) => Number(item.lojaId) !== Number(input.lojaId)
          );
          if (lojaDiferente) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "O lote possui registros de outra loja e não foi excluído.",
            });
          }

          const contemUniforme = itensLote.some(
            (item) => String(item.item) === "uniforme"
          );
          if (contemUniforme) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "O lote contém uniforme e não pode ser excluído por esta ação.",
            });
          }

          const [resultado] = await connection.query<any>(
            `DELETE FROM rh_epi_entregas
              WHERE loteId = ?
                AND lojaId = ?`,
            [loteId, input.lojaId]
          );

          quantidadeExcluida = Number(resultado.affectedRows || 0);
        } else {
          const [resultado] = await connection.query<any>(
            `DELETE FROM rh_epi_entregas
              WHERE id = ?
                AND lojaId = ?
                AND loteId IS NULL
                AND item <> 'uniforme'`,
            [input.id, input.lojaId]
          );

          quantidadeExcluida = Number(resultado.affectedRows || 0);
        }

        if (quantidadeExcluida <= 0) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Nenhuma entrega foi excluída.",
          });
        }

        await connection.commit();

        return {
          success: true,
          loteId,
          quantidadeExcluida,
        };
      } catch (error) {
        try {
          await connection.rollback();
        } catch {
          // preserva o erro original
        }
        throw error;
      } finally {
        connection.release();
      }
    }),

  anexarComprovante: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        lojaId: z.number().int().positive(),
        comprovanteNome: z.string().trim().min(1).max(255),
        comprovanteMime: z.string().trim().min(1).max(120),
        comprovanteTamanho: z.number().int().positive().max(TAMANHO_MAXIMO),
        comprovanteBase64: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await ensureRhEpisTable();
      assertAcessoRhEpis(ctx, input.lojaId);
      validarMime(input.comprovanteMime);

      const arquivo = bufferArquivo(input.comprovanteBase64);
      const pool = getPoolEpis();

      const [rows] = await pool.query<any[]>(
        `SELECT id, lojaId FROM rh_epi_entregas WHERE id = ? LIMIT 1`,
        [input.id]
      );

      const entrega = rows?.[0];
      if (!entrega) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Entrega de EPI não encontrada." });
      }

      if (Number(entrega.lojaId) !== Number(input.lojaId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A entrega não pertence à loja informada.",
        });
      }

      const hash = createHash("sha256").update(arquivo).digest("hex");

      await pool.query(
        `UPDATE rh_epi_entregas
            SET comprovanteNome = ?,
                comprovanteMime = ?,
                comprovanteTamanho = ?,
                comprovanteHash = ?,
                comprovanteConteudo = ?,
                comprovantePorUsuarioId = ?,
                comprovantePorNome = ?,
                comprovanteAnexadoEm = NOW()
          WHERE id = ?`,
        [
          nomeArquivoSeguro(input.comprovanteNome),
          input.comprovanteMime,
          arquivo.length,
          hash,
          arquivo,
          Number(ctx.user?.id || 0) || null,
          String(ctx.user?.name || ctx.user?.email || "Usuário"),
          input.id,
        ]
      );

      return { success: true };
    }),

  arquivo: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      await ensureRhEpisTable();
      const pool = getPoolEpis();

      const [rows] = await pool.query<any[]>(
        `SELECT id, lojaId, comprovanteNome, comprovanteMime, comprovanteTamanho, comprovanteConteudo
           FROM rh_epi_entregas
          WHERE id = ?
          LIMIT 1`,
        [input.id]
      );

      const row = rows?.[0];
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Entrega de EPI não encontrada." });
      }

      assertAcessoRhEpis(ctx, Number(row.lojaId));

      if (!row.comprovanteConteudo || !row.comprovanteNome) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Esta entrega ainda não possui termo/comprovante anexado.",
        });
      }

      const conteudo = Buffer.isBuffer(row.comprovanteConteudo)
        ? row.comprovanteConteudo
        : Buffer.from(row.comprovanteConteudo || []);

      return {
        id: Number(row.id),
        arquivoNome: row.comprovanteNome || "comprovante",
        arquivoMime: row.comprovanteMime || "application/octet-stream",
        arquivoTamanho: Number(row.comprovanteTamanho || conteudo.length),
        arquivoBase64: conteudo.toString("base64"),
      };
    }),
});
