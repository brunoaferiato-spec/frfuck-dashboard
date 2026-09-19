import mysql from "mysql2/promise";
import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";

const TIPOS_DOCUMENTO = [
  "advertencia_avulsa",
  "adiantamento_assinado",
  "folha_pagamento_assinada",
  "cartao_ponto_assinado",
] as const;

const tipoDocumentoSchema = z.enum(TIPOS_DOCUMENTO);
const dataCivilSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const competenciaSchema = z.string().regex(/^\d{4}-\d{2}$/).nullable().optional();

const MIME_PERMITIDOS = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const TAMANHO_MAXIMO = 6 * 1024 * 1024;

let poolDocumentos: mysql.Pool | null = null;
let estruturaDocumentosPronta = false;

function getPoolDocumentos() {
  if (!process.env.DATABASE_URL) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Banco de dados nÃ£o configurado.",
    });
  }

  if (!poolDocumentos) {
    poolDocumentos = mysql.createPool({
      uri: process.env.DATABASE_URL,
      waitForConnections: true,
      connectionLimit: 4,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
    });
  }

  return poolDocumentos;
}

async function ensureRhDocumentosTable() {
  if (estruturaDocumentosPronta) return;

  const pool = getPoolDocumentos();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS rh_documentos_funcionarios (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      lojaId INT NOT NULL,
      funcionarioId INT NOT NULL,
      tipo VARCHAR(50) NOT NULL,
      dataDocumento DATE NOT NULL,
      competencia CHAR(7) NULL,
      observacao TEXT NULL,
      arquivoNome VARCHAR(255) NOT NULL,
      arquivoMime VARCHAR(120) NOT NULL,
      arquivoTamanho INT UNSIGNED NOT NULL DEFAULT 0,
      arquivoHash CHAR(64) NOT NULL,
      arquivoConteudo LONGBLOB NOT NULL,
      enviadoPorUsuarioId INT NULL,
      enviadoPorNome VARCHAR(255) NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_rh_docs_loja_data (lojaId, dataDocumento),
      KEY idx_rh_docs_funcionario (funcionarioId),
      KEY idx_rh_docs_tipo (tipo),
      UNIQUE KEY uniq_rh_docs_arquivo (lojaId, funcionarioId, tipo, arquivoHash)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  estruturaDocumentosPronta = true;
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

function assertAcessoRhDocumentos(ctx: any, lojaId?: number | null) {
  const perfil = perfilRh(ctx);

  if (!perfil.caixaLider && !perfil.liderRh && !perfil.adminOuGestor) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "UsuÃ¡rio sem acesso aos Documentos RH.",
    });
  }

  if (
    perfil.caixaLider &&
    lojaId &&
    Number(lojaId) !== Number(perfil.lojaId)
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "A Caixa LÃ­der sÃ³ pode acessar documentos da prÃ³pria loja.",
    });
  }

  return perfil;
}

function nomeArquivoSeguro(nome: string) {
  const limpo = String(nome || "documento")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);

  return limpo || "documento";
}

function competenciaObrigatoria(tipo: (typeof TIPOS_DOCUMENTO)[number]) {
  return (
    tipo === "adiantamento_assinado" ||
    tipo === "folha_pagamento_assinada" ||
    tipo === "cartao_ponto_assinado"
  );
}

export const rhDocumentosRouter = router({
  listar: protectedProcedure
    .input(
      z.object({
        lojaId: z.number().int().positive().nullable().optional(),
        funcionarioId: z.number().int().positive().nullable().optional(),
        tipo: tipoDocumentoSchema.nullable().optional(),
        competencia: competenciaSchema,
        dataInicio: dataCivilSchema.nullable().optional(),
        dataFim: dataCivilSchema.nullable().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      await ensureRhDocumentosTable();
      const perfil = assertAcessoRhDocumentos(ctx, input.lojaId ?? null);
      const pool = getPoolDocumentos();

      const condicoes: string[] = ["1 = 1"];
      const params: any[] = [];

      const lojaEfetiva = perfil.caixaLider
        ? perfil.lojaId
        : input.lojaId || null;

      if (lojaEfetiva) {
        condicoes.push("d.lojaId = ?");
        params.push(Number(lojaEfetiva));
      }

      if (input.funcionarioId) {
        condicoes.push("d.funcionarioId = ?");
        params.push(Number(input.funcionarioId));
      }

      if (input.tipo) {
        condicoes.push("d.tipo = ?");
        params.push(input.tipo);
      }

      if (input.competencia) {
        condicoes.push("d.competencia = ?");
        params.push(input.competencia);
      }

      if (input.dataInicio) {
        condicoes.push("d.dataDocumento >= ?");
        params.push(input.dataInicio);
      }

      if (input.dataFim) {
        condicoes.push("d.dataDocumento <= ?");
        params.push(input.dataFim);
      }

      const [rows] = await pool.query<any[]>(
        `SELECT
           d.id,
           d.lojaId,
           COALESCE(l.nome, CONCAT('Loja ', d.lojaId)) AS lojaNome,
           d.funcionarioId,
           COALESCE(f.nome, CONCAT('FuncionÃ¡rio ', d.funcionarioId)) AS funcionarioNome,
           f.funcao AS funcionarioFuncao,
           d.tipo,
           DATE_FORMAT(d.dataDocumento, '%Y-%m-%d') AS dataDocumento,
           d.competencia,
           d.observacao,
           d.arquivoNome,
           d.arquivoMime,
           d.arquivoTamanho,
           d.enviadoPorUsuarioId,
           d.enviadoPorNome,
           DATE_FORMAT(d.createdAt, '%Y-%m-%dT%H:%i:%s') AS criadoEm
         FROM rh_documentos_funcionarios d
         LEFT JOIN funcionarios f ON f.id = d.funcionarioId
         LEFT JOIN lojas l ON l.id = d.lojaId
         WHERE ${condicoes.join(" AND ")}
         ORDER BY d.dataDocumento DESC, d.createdAt DESC, d.id DESC
         LIMIT 1000`,
        params
      );

      return (rows || []).map((row: any) => ({
        ...row,
        id: Number(row.id),
        lojaId: Number(row.lojaId),
        funcionarioId: Number(row.funcionarioId),
        arquivoTamanho: Number(row.arquivoTamanho || 0),
        enviadoPorUsuarioId: row.enviadoPorUsuarioId
          ? Number(row.enviadoPorUsuarioId)
          : null,
      }));
    }),

  salvar: protectedProcedure
    .input(
      z.object({
        lojaId: z.number().int().positive(),
        funcionarioId: z.number().int().positive(),
        tipo: tipoDocumentoSchema,
        dataDocumento: dataCivilSchema,
        competencia: competenciaSchema,
        observacao: z.string().trim().max(2000).nullable().optional(),
        arquivoNome: z.string().trim().min(1).max(255),
        arquivoMime: z.string().trim().min(1).max(120),
        arquivoTamanho: z.number().int().positive().max(TAMANHO_MAXIMO),
        arquivoBase64: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await ensureRhDocumentosTable();
      assertAcessoRhDocumentos(ctx, input.lojaId);

      if (!MIME_PERMITIDOS.has(input.arquivoMime)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Envie PDF, JPG, PNG, WEBP ou foto HEIC/HEIF.",
        });
      }

      if (competenciaObrigatoria(input.tipo) && !input.competencia) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Informe a competÃªncia deste documento.",
        });
      }

      let arquivo: Buffer;
      try {
        arquivo = Buffer.from(input.arquivoBase64, "base64");
      } catch {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Arquivo invÃ¡lido.",
        });
      }

      if (!arquivo.length || arquivo.length > TAMANHO_MAXIMO) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "O documento deve ter no mÃ¡ximo 6 MB.",
        });
      }

      const pool = getPoolDocumentos();

      const [funcionarios] = await pool.query<any[]>(
        `SELECT id, nome, lojaId
           FROM funcionarios
          WHERE id = ? AND lojaId = ?
          LIMIT 1`,
        [input.funcionarioId, input.lojaId]
      );

      if (!funcionarios?.[0]) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "FuncionÃ¡rio nÃ£o pertence Ã  loja selecionada.",
        });
      }

      const arquivoHash = createHash("sha256").update(arquivo).digest("hex");

      try {
        const [resultado] = await pool.query<any>(
          `INSERT INTO rh_documentos_funcionarios (
             lojaId, funcionarioId, tipo, dataDocumento, competencia, observacao,
             arquivoNome, arquivoMime, arquivoTamanho, arquivoHash, arquivoConteudo,
             enviadoPorUsuarioId, enviadoPorNome
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            input.lojaId,
            input.funcionarioId,
            input.tipo,
            input.dataDocumento,
            input.competencia || null,
            input.observacao || null,
            nomeArquivoSeguro(input.arquivoNome),
            input.arquivoMime,
            arquivo.length,
            arquivoHash,
            arquivo,
            Number(ctx.user?.id || 0) || null,
            String(ctx.user?.name || ctx.user?.email || "UsuÃ¡rio"),
          ]
        );

        return {
          success: true,
          id: Number(resultado.insertId),
        };
      } catch (error: any) {
        if (String(error?.code || "") === "ER_DUP_ENTRY") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Este mesmo arquivo jÃ¡ foi anexado para este funcionÃ¡rio.",
          });
        }
        throw error;
      }
    }),

  excluir: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await ensureRhDocumentosTable();

      const pool = getPoolDocumentos();

      const [rows] = await pool.query<any[]>(
        `SELECT id, lojaId, funcionarioId, tipo, arquivoNome
           FROM rh_documentos_funcionarios
          WHERE id = ?
          LIMIT 1`,
        [input.id]
      );

      const documento = rows?.[0];

      if (!documento) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Documento não encontrado.",
        });
      }

      assertAcessoRhDocumentos(ctx, Number(documento.lojaId));

      const [resultado] = await pool.query<any>(
        `DELETE FROM rh_documentos_funcionarios
          WHERE id = ?
            AND lojaId = ?`,
        [input.id, Number(documento.lojaId)]
      );

      if (Number(resultado?.affectedRows || 0) !== 1) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "O documento não foi encontrado para exclusão.",
        });
      }

      return {
        success: true,
        id: Number(documento.id),
      };
    }),

  arquivo: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      await ensureRhDocumentosTable();
      const pool = getPoolDocumentos();

      const [rows] = await pool.query<any[]>(
        `SELECT id, lojaId, arquivoNome, arquivoMime, arquivoTamanho, arquivoConteudo
           FROM rh_documentos_funcionarios
          WHERE id = ?
          LIMIT 1`,
        [input.id]
      );

      const row = rows?.[0];
      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Documento nÃ£o encontrado.",
        });
      }

      assertAcessoRhDocumentos(ctx, Number(row.lojaId));

      const conteudo = Buffer.isBuffer(row.arquivoConteudo)
        ? row.arquivoConteudo
        : Buffer.from(row.arquivoConteudo || []);

      return {
        id: Number(row.id),
        arquivoNome: row.arquivoNome || "documento",
        arquivoMime: row.arquivoMime || "application/octet-stream",
        arquivoTamanho: Number(row.arquivoTamanho || conteudo.length),
        arquivoBase64: conteudo.toString("base64"),
      };
    }),
});