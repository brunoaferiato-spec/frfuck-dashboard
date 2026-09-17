import mysql from "mysql2/promise";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";

let poolExperiencia: mysql.Pool | null = null;
let estruturaExperienciaPronta = false;

function getPoolExperiencia() {
  if (!process.env.DATABASE_URL) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Banco de dados nÃ£o configurado.",
    });
  }

  if (!poolExperiencia) {
    poolExperiencia = mysql.createPool({
      uri: process.env.DATABASE_URL,
      waitForConnections: true,
      connectionLimit: 4,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
    });
  }

  return poolExperiencia;
}

async function ensureRhExperienciaTable() {
  if (estruturaExperienciaPronta) return;

  const pool = getPoolExperiencia();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS rh_experiencia_decisoes (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      funcionarioId INT NOT NULL,
      lojaId INT NOT NULL,
      dataAdmissao DATE NOT NULL,

      primeiraDecisao VARCHAR(30) NULL,
      primeiraObservacao TEXT NULL,
      primeiraDecisaoPorUsuarioId INT NULL,
      primeiraDecisaoPorNome VARCHAR(255) NULL,
      primeiraDecisaoEm DATETIME NULL,

      segundaDecisao VARCHAR(30) NULL,
      segundaObservacao TEXT NULL,
      segundaDecisaoPorUsuarioId INT NULL,
      segundaDecisaoPorNome VARCHAR(255) NULL,
      segundaDecisaoEm DATETIME NULL,

      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

      PRIMARY KEY (id),
      UNIQUE KEY uq_rh_experiencia_funcionario_admissao (funcionarioId, dataAdmissao),
      KEY idx_rh_experiencia_loja (lojaId)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS rh_experiencia_arquivos_contabilidade (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      arquivoNome VARCHAR(255) NOT NULL,
      arquivoMime VARCHAR(120) NOT NULL,
      arquivoTamanho INT NOT NULL,
      arquivoConteudo LONGBLOB NOT NULL,
      enviadoPorUsuarioId INT NULL,
      enviadoPorNome VARCHAR(255) NULL,
      enviadoEm DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

      PRIMARY KEY (id),
      KEY idx_rh_experiencia_arquivo_enviado_em (enviadoEm)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  estruturaExperienciaPronta = true;
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

function assertGestaoExperiencia(ctx: any) {
  const perfil = perfilRh(ctx);

  if (!perfil.liderRh && !perfil.adminOuGestor) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "A gestÃ£o de experiÃªncia Ã© exclusiva da LÃ­der de RH.",
    });
  }

  return perfil;
}

function adicionarDiasCivil(valor: string, dias: number) {
  const [ano, mes, dia] = valor.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  data.setUTCDate(data.getUTCDate() + dias);

  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, "0")}-${String(
    data.getUTCDate()
  ).padStart(2, "0")}`;
}

function calcularDatasExperiencia(dataAdmissao: string) {
  // A data de admissÃ£o conta como o 1Âº dia.
  // Portanto: 45Âº dia = admissÃ£o + 44 dias; 90Âº dia = admissÃ£o + 89 dias.
  return {
    fimPrimeiroPeriodo: adicionarDiasCivil(dataAdmissao, 44),
    inicioSegundoPeriodo: adicionarDiasCivil(dataAdmissao, 45),
    fimSegundoPeriodo: adicionarDiasCivil(dataAdmissao, 89),
  };
}

async function buscarFuncionario(pool: mysql.Pool, funcionarioId: number) {
  const [rows] = await pool.query<any[]>(
    `SELECT
       f.id,
       f.nome,
       f.lojaId,
       f.funcao,
       f.status,
       DATE_FORMAT(f.dataAdmissao, '%Y-%m-%d') AS dataAdmissao,
       COALESCE(l.nome, CONCAT('Loja ', f.lojaId)) AS lojaNome
     FROM funcionarios f
     LEFT JOIN lojas l ON l.id = f.lojaId
     WHERE f.id = ?
     LIMIT 1`,
    [funcionarioId]
  );

  const funcionario = rows?.[0];

  if (!funcionario) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "FuncionÃ¡rio nÃ£o encontrado.",
    });
  }

  if (!funcionario.dataAdmissao) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "O funcionÃ¡rio nÃ£o possui data de admissÃ£o cadastrada.",
    });
  }

  return funcionario;
}

export const rhExperienciaRouter = router({
  listar: protectedProcedure.query(async ({ ctx }) => {
    await ensureRhExperienciaTable();
    assertGestaoExperiencia(ctx);

    const pool = getPoolExperiencia();

    const [rows] = await pool.query<any[]>(
      `SELECT
         f.id AS funcionarioId,
         f.nome AS funcionarioNome,
         f.funcao AS funcionarioFuncao,
         f.lojaId,
         COALESCE(l.nome, CONCAT('Loja ', f.lojaId)) AS lojaNome,
         DATE_FORMAT(f.dataAdmissao, '%Y-%m-%d') AS dataAdmissao,

         d.primeiraDecisao,
         d.primeiraObservacao,
         d.primeiraDecisaoPorNome,
         DATE_FORMAT(d.primeiraDecisaoEm, '%Y-%m-%dT%H:%i:%s') AS primeiraDecisaoEm,

         d.segundaDecisao,
         d.segundaObservacao,
         d.segundaDecisaoPorNome,
         DATE_FORMAT(d.segundaDecisaoEm, '%Y-%m-%dT%H:%i:%s') AS segundaDecisaoEm

       FROM funcionarios f
       LEFT JOIN lojas l ON l.id = f.lojaId
       LEFT JOIN rh_experiencia_decisoes d
         ON d.funcionarioId = f.id
        AND DATE(d.dataAdmissao) = DATE(f.dataAdmissao)

       WHERE f.dataAdmissao IS NOT NULL
         AND f.dataAdmissao <= CURDATE()
         AND (
           (f.status = 'ativo' AND f.dataAdmissao >= DATE_SUB(CURDATE(), INTERVAL 180 DAY))
           OR d.id IS NOT NULL
         )

       ORDER BY f.dataAdmissao DESC, f.nome ASC
       LIMIT 1000`
    );

    return (rows || []).map((row: any) => {
      const dataAdmissao = String(row.dataAdmissao).slice(0, 10);
      const datas = calcularDatasExperiencia(dataAdmissao);

      return {
        funcionarioId: Number(row.funcionarioId),
        funcionarioNome: row.funcionarioNome,
        funcionarioFuncao: row.funcionarioFuncao ?? null,
        lojaId: Number(row.lojaId),
        lojaNome: row.lojaNome,
        dataAdmissao,
        ...datas,

        primeiraDecisao: row.primeiraDecisao ?? null,
        primeiraObservacao: row.primeiraObservacao ?? null,
        primeiraDecisaoPorNome: row.primeiraDecisaoPorNome ?? null,
        primeiraDecisaoEm: row.primeiraDecisaoEm ?? null,

        segundaDecisao: row.segundaDecisao ?? null,
        segundaObservacao: row.segundaObservacao ?? null,
        segundaDecisaoPorNome: row.segundaDecisaoPorNome ?? null,
        segundaDecisaoEm: row.segundaDecisaoEm ?? null,
      };
    });
  }),

  listarArquivosContabilidade: protectedProcedure.query(async ({ ctx }) => {
    await ensureRhExperienciaTable();
    assertGestaoExperiencia(ctx);

    const pool = getPoolExperiencia();

    const [rows] = await pool.query<any[]>(
      `SELECT
         id,
         arquivoNome,
         arquivoMime,
         arquivoTamanho,
         enviadoPorNome,
         DATE_FORMAT(enviadoEm, '%Y-%m-%dT%H:%i:%s') AS enviadoEm
       FROM rh_experiencia_arquivos_contabilidade
       ORDER BY enviadoEm DESC, id DESC
       LIMIT 50`
    );

    return (rows || []).map((row: any) => ({
      id: Number(row.id),
      arquivoNome: String(row.arquivoNome || "arquivo-experiencia"),
      arquivoMime: String(row.arquivoMime || "application/octet-stream"),
      arquivoTamanho: Number(row.arquivoTamanho || 0),
      enviadoPorNome: row.enviadoPorNome ?? null,
      enviadoEm: row.enviadoEm ?? null,
    }));
  }),

  anexarArquivoContabilidade: protectedProcedure
    .input(
      z.object({
        arquivoNome: z.string().trim().min(1).max(255),
        arquivoMime: z.string().trim().max(120).optional(),
        arquivoBase64: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {

      await ensureRhExperienciaTable();
      assertGestaoExperiencia(ctx);

      const nome = String(input.arquivoNome || "").trim();
      const mime = String(input.arquivoMime || "").trim().toLowerCase();
      const extensao = nome.toLowerCase().split(".").pop() || "";

      const mimesPermitidos = new Set([
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
        "text/csv",
        "application/csv",
        "text/plain",
        "application/octet-stream",
      ]);

      const extensoesPermitidas = new Set(["pdf", "xlsx", "xls", "csv"]);

      if (!mimesPermitidos.has(mime) && !extensoesPermitidas.has(extensao)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Envie o arquivo da contabilidade em PDF, XLSX, XLS ou CSV.",
        });
      }

      const base64Limpo = String(input.arquivoBase64 || "").includes(",")
        ? String(input.arquivoBase64).split(",").pop() || ""
        : String(input.arquivoBase64 || "");

      let buffer: Buffer;

      try {
        buffer = Buffer.from(base64Limpo, "base64");
      } catch {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Arquivo da contabilidade invalido.",
        });
      }

      if (!buffer.length || buffer.length > 8 * 1024 * 1024) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "O arquivo da contabilidade deve ter no maximo 8 MB.",
        });
      }

      const pool = getPoolExperiencia();
      const usuarioId = Number(ctx.user?.id || 0) || null;
      const usuarioNome = String(ctx.user?.name || ctx.user?.email || "Lider de RH");

      await pool.query(
        `INSERT INTO rh_experiencia_arquivos_contabilidade (
           arquivoNome,
           arquivoMime,
           arquivoTamanho,
           arquivoConteudo,
           enviadoPorUsuarioId,
           enviadoPorNome,
           enviadoEm
         ) VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [
          nome,
          mime || "application/octet-stream",
          buffer.length,
          buffer,
          usuarioId,
          usuarioNome,
        ]
      );

      return { success: true };
    }),

  baixarArquivoContabilidade: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await ensureRhExperienciaTable();
      assertGestaoExperiencia(ctx);

      const pool = getPoolExperiencia();

      const [rows] = await pool.query<any[]>(
        `SELECT
           arquivoNome,
           arquivoMime,
           arquivoConteudo
         FROM rh_experiencia_arquivos_contabilidade
         WHERE id = ?
         LIMIT 1`,
        [Number(input.id)]
      );

      const arquivo = rows?.[0];

      if (!arquivo) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Arquivo da contabilidade nao encontrado.",
        });
      }

      const conteudo = Buffer.isBuffer(arquivo.arquivoConteudo)
        ? arquivo.arquivoConteudo
        : Buffer.from(arquivo.arquivoConteudo);

      return {
        arquivoNome: String(arquivo.arquivoNome || "arquivo-experiencia"),
        arquivoMime: String(arquivo.arquivoMime || "application/octet-stream"),
        arquivoBase64: conteudo.toString("base64"),
      };
    }),

  efetivarHistorico: protectedProcedure
    .input(
      z.object({
        funcionarioId: z.number().int().positive(),
        observacao: z.string().trim().max(3000).nullable().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await ensureRhExperienciaTable();
      assertGestaoExperiencia(ctx);

      const pool = getPoolExperiencia();
      const funcionario = await buscarFuncionario(pool, input.funcionarioId);
      const [dataAdmissaoRows] = await pool.query<any[]>(
        `SELECT DATE_FORMAT(dataAdmissao, '%Y-%m-%d') AS dataAdmissao
           FROM funcionarios
          WHERE id = ?
          LIMIT 1`,
        [input.funcionarioId]
      );

      const dataAdmissao = String(
        dataAdmissaoRows?.[0]?.dataAdmissao || ""
      ).slice(0, 10);

      if (!/^\d{4}-\d{2}-\d{2}$/.test(dataAdmissao)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Nao foi possivel identificar a data de admissao do funcionario.",
        });
      }
      const datas = calcularDatasExperiencia(dataAdmissao);

      const agora = new Date();
      const hoje = `${agora.getFullYear()}-${String(
        agora.getMonth() + 1
      ).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;

      if (datas.fimSegundoPeriodo > hoje) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "A efetivacao historica so fica disponivel quando o 90o dia ja chegou.",
        });
      }

      const [existentes] = await pool.query<any[]>(
        `SELECT *
           FROM rh_experiencia_decisoes
          WHERE funcionarioId = ?
            AND DATE(dataAdmissao) = ?
          LIMIT 1`,
        [input.funcionarioId, dataAdmissao]
      );

      const atual = existentes?.[0];

      if (atual?.primeiraDecisao === "encerrar") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Este funcionario possui encerramento registrado no 1o periodo.",
        });
      }

      if (atual?.segundaDecisao) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A decisao final deste funcionario ja foi registrada.",
        });
      }

      const usuarioId = Number(ctx.user?.id || 0) || null;
      const usuarioNome = String(ctx.user?.name || ctx.user?.email || "Lider de RH");
      const observacaoInformada = String(input.observacao || "").trim();

      const observacaoHistorica = observacaoInformada
        ? `Regularizacao historica: ${observacaoInformada}`
        : "Regularizacao historica de funcionario antigo: efetivacao registrada apos o 90o dia sem decisao anterior cadastrada no sistema.";

      await pool.query(
        `INSERT INTO rh_experiencia_decisoes (
           funcionarioId,
           lojaId,
           dataAdmissao,
           segundaDecisao,
           segundaObservacao,
           segundaDecisaoPorUsuarioId,
           segundaDecisaoPorNome,
           segundaDecisaoEm
         ) VALUES (?, ?, ?, 'efetivar', ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
           lojaId = VALUES(lojaId),
           segundaDecisao = 'efetivar',
           segundaObservacao = VALUES(segundaObservacao),
           segundaDecisaoPorUsuarioId = VALUES(segundaDecisaoPorUsuarioId),
           segundaDecisaoPorNome = VALUES(segundaDecisaoPorNome),
           segundaDecisaoEm = NOW()`,
        [
          input.funcionarioId,
          Number(funcionario.lojaId),
          dataAdmissao,
          observacaoHistorica,
          usuarioId,
          usuarioNome,
        ]
      );

      return { success: true };
    }),

  registrarDecisao: protectedProcedure
    .input(
      z.object({
        funcionarioId: z.number().int().positive(),
        etapa: z.union([z.literal(1), z.literal(2)]),
        decisao: z.enum(["prorrogar", "efetivar", "encerrar"]),
        observacao: z.string().trim().max(3000).nullable().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await ensureRhExperienciaTable();
      assertGestaoExperiencia(ctx);

      if (input.etapa === 1 && !["prorrogar", "encerrar"].includes(input.decisao)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No 1Âº perÃ­odo, escolha prorrogar ou encerrar.",
        });
      }

      if (input.etapa === 2 && !["efetivar", "encerrar"].includes(input.decisao)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No 2Âº perÃ­odo, escolha efetivar ou encerrar.",
        });
      }

      const pool = getPoolExperiencia();
      const funcionario = await buscarFuncionario(pool, input.funcionarioId);
      const [dataAdmissaoRows] = await pool.query<any[]>(
        `SELECT DATE_FORMAT(dataAdmissao, '%Y-%m-%d') AS dataAdmissao
           FROM funcionarios
          WHERE id = ?
          LIMIT 1`,
        [input.funcionarioId]
      );

      const dataAdmissao = String(
        dataAdmissaoRows?.[0]?.dataAdmissao || ""
      ).slice(0, 10);

      if (!/^\d{4}-\d{2}-\d{2}$/.test(dataAdmissao)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Nao foi possivel identificar a data de admissao do funcionario.",
        });
      }
      const usuarioId = Number(ctx.user?.id || 0) || null;
      const usuarioNome = String(ctx.user?.name || ctx.user?.email || "UsuÃ¡rio");

      const [existentes] = await pool.query<any[]>(
        `SELECT *
           FROM rh_experiencia_decisoes
          WHERE funcionarioId = ?
            AND DATE(dataAdmissao) = ?
          LIMIT 1`,
        [input.funcionarioId, dataAdmissao]
      );

      const atual = existentes?.[0];

      if (input.etapa === 1) {
        if (atual?.primeiraDecisao) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "A decisÃ£o do 1Âº perÃ­odo jÃ¡ foi registrada.",
          });
        }

        await pool.query(
          `INSERT INTO rh_experiencia_decisoes (
             funcionarioId,
             lojaId,
             dataAdmissao,
             primeiraDecisao,
             primeiraObservacao,
             primeiraDecisaoPorUsuarioId,
             primeiraDecisaoPorNome,
             primeiraDecisaoEm
           ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE
             lojaId = VALUES(lojaId),
             primeiraDecisao = VALUES(primeiraDecisao),
             primeiraObservacao = VALUES(primeiraObservacao),
             primeiraDecisaoPorUsuarioId = VALUES(primeiraDecisaoPorUsuarioId),
             primeiraDecisaoPorNome = VALUES(primeiraDecisaoPorNome),
             primeiraDecisaoEm = NOW()`,
          [
            input.funcionarioId,
            Number(funcionario.lojaId),
            dataAdmissao,
            input.decisao,
            input.observacao || null,
            usuarioId,
            usuarioNome,
          ]
        );

        return { success: true };
      }

      if (!atual || atual.primeiraDecisao !== "prorrogar") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A 2Âª decisÃ£o sÃ³ pode ser registrada depois da prorrogaÃ§Ã£o do 1Âº perÃ­odo.",
        });
      }

      if (atual.segundaDecisao) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A decisÃ£o final jÃ¡ foi registrada.",
        });
      }

      await pool.query(
        `UPDATE rh_experiencia_decisoes
            SET segundaDecisao = ?,
                segundaObservacao = ?,
                segundaDecisaoPorUsuarioId = ?,
                segundaDecisaoPorNome = ?,
                segundaDecisaoEm = NOW()
          WHERE id = ?`,
        [
          input.decisao,
          input.observacao || null,
          usuarioId,
          usuarioNome,
          Number(atual.id),
        ]
      );

      return { success: true };
    }),
});
