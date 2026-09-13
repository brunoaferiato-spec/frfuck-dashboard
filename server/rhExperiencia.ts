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
      message: "Banco de dados não configurado.",
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
      message: "A gestão de experiência é exclusiva da Líder de RH.",
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
  // A data de admissão conta como o 1º dia.
  // Portanto: 45º dia = admissão + 44 dias; 90º dia = admissão + 89 dias.
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
      message: "Funcionário não encontrado.",
    });
  }

  if (!funcionario.dataAdmissao) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "O funcionário não possui data de admissão cadastrada.",
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
        AND d.dataAdmissao = f.dataAdmissao

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
          message: "No 1º período, escolha prorrogar ou encerrar.",
        });
      }

      if (input.etapa === 2 && !["efetivar", "encerrar"].includes(input.decisao)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No 2º período, escolha efetivar ou encerrar.",
        });
      }

      const pool = getPoolExperiencia();
      const funcionario = await buscarFuncionario(pool, input.funcionarioId);
      const dataAdmissao = String(funcionario.dataAdmissao).slice(0, 10);
      const usuarioId = Number(ctx.user?.id || 0) || null;
      const usuarioNome = String(ctx.user?.name || ctx.user?.email || "Usuário");

      const [existentes] = await pool.query<any[]>(
        `SELECT *
           FROM rh_experiencia_decisoes
          WHERE funcionarioId = ?
            AND dataAdmissao = ?
          LIMIT 1`,
        [input.funcionarioId, dataAdmissao]
      );

      const atual = existentes?.[0];

      if (input.etapa === 1) {
        if (atual?.primeiraDecisao) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "A decisão do 1º período já foi registrada.",
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
          message: "A 2ª decisão só pode ser registrada depois da prorrogação do 1º período.",
        });
      }

      if (atual.segundaDecisao) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A decisão final já foi registrada.",
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
