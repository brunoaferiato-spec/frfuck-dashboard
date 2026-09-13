import mysql from "mysql2/promise";
import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";

const dataCivilSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const tipoDocumentoSchema = z.enum(["aviso", "pagamento"]);

const MIME_PERMITIDOS = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const TAMANHO_MAXIMO = 6 * 1024 * 1024;

const statusFeriasSchema = z.enum([
  "aguardando_aviso",
  "aguardando_liberacao_pagamento",
  "aguardando_pagamento",
  "programada",
  "em_ferias",
  "concluida",
  "cancelada",
]);

let poolFerias: mysql.Pool | null = null;
let estruturaFeriasPronta = false;

function getPoolFerias() {
  if (!process.env.DATABASE_URL) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Banco de dados não configurado.",
    });
  }

  if (!poolFerias) {
    poolFerias = mysql.createPool({
      uri: process.env.DATABASE_URL,
      waitForConnections: true,
      connectionLimit: 4,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
    });
  }

  return poolFerias;
}

async function ensureRhFeriasTable() {
  if (estruturaFeriasPronta) return;

  const pool = getPoolFerias();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS rh_ferias_processos (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      lojaId INT NOT NULL,
      funcionarioId INT NOT NULL,

      periodoAquisitivoInicio DATE NOT NULL,
      periodoAquisitivoFim DATE NOT NULL,
      dataInicio DATE NOT NULL,
      dataRetorno DATE NOT NULL,
      quantidadeDias INT UNSIGNED NOT NULL,
      observacao TEXT NULL,

      avisoSolicitado TINYINT(1) NOT NULL DEFAULT 1,
      avisoNome VARCHAR(255) NULL,
      avisoMime VARCHAR(120) NULL,
      avisoTamanho INT UNSIGNED NULL,
      avisoHash CHAR(64) NULL,
      avisoConteudo LONGBLOB NULL,
      avisoPorUsuarioId INT NULL,
      avisoPorNome VARCHAR(255) NULL,
      avisoAnexadoEm DATETIME NULL,

      pagamentoSolicitado TINYINT(1) NOT NULL DEFAULT 0,
      pagamentoNome VARCHAR(255) NULL,
      pagamentoMime VARCHAR(120) NULL,
      pagamentoTamanho INT UNSIGNED NULL,
      pagamentoHash CHAR(64) NULL,
      pagamentoConteudo LONGBLOB NULL,
      pagamentoPorUsuarioId INT NULL,
      pagamentoPorNome VARCHAR(255) NULL,
      pagamentoAnexadoEm DATETIME NULL,

      cancelado TINYINT(1) NOT NULL DEFAULT 0,
      canceladoPorUsuarioId INT NULL,
      canceladoPorNome VARCHAR(255) NULL,
      canceladoEm DATETIME NULL,

      criadoPorUsuarioId INT NULL,
      criadoPorNome VARCHAR(255) NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

      PRIMARY KEY (id),
      KEY idx_rh_ferias_loja_inicio (lojaId, dataInicio),
      KEY idx_rh_ferias_funcionario (funcionarioId),
      KEY idx_rh_ferias_retorno (dataRetorno)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  estruturaFeriasPronta = true;
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

function assertGestaoFerias(ctx: any) {
  const perfil = perfilRh(ctx);

  if (!perfil.liderRh && !perfil.adminOuGestor) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "A gestão de férias é exclusiva da Líder de RH.",
    });
  }

  return perfil;
}

function assertCaixaOuGestao(ctx: any, lojaId: number) {
  const perfil = perfilRh(ctx);

  if (perfil.caixaLider) {
    if (Number(perfil.lojaId) !== Number(lojaId)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "A Caixa Líder só pode acessar documentos de férias da própria loja.",
      });
    }

    return perfil;
  }

  if (perfil.liderRh || perfil.adminOuGestor) {
    return perfil;
  }

  throw new TRPCError({
    code: "FORBIDDEN",
    message: "Usuário sem acesso às férias.",
  });
}

function nomeArquivoSeguro(nome: string) {
  const limpo = String(nome || "documento")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);

  return limpo || "documento";
}

function validarMime(mime: string) {
  if (!MIME_PERMITIDOS.has(mime)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Envie PDF, JPG, PNG, WEBP ou foto HEIC/HEIF.",
    });
  }
}

function bufferArquivo(base64: string) {
  let arquivo: Buffer;

  try {
    arquivo = Buffer.from(base64, "base64");
  } catch {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Arquivo inválido.",
    });
  }

  if (!arquivo.length || arquivo.length > TAMANHO_MAXIMO) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "O arquivo deve ter no máximo 6 MB.",
    });
  }

  return arquivo;
}

function hojeCivil() {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(
    agora.getDate()
  ).padStart(2, "0")}`;
}

function statusProcesso(row: any) {
  if (Boolean(Number(row.cancelado || 0))) {
    return "cancelada";
  }

  const avisoPendente = !Boolean(Number(row.avisoTemConteudo ?? (row.avisoConteudo ? 1 : 0))) || !row.avisoNome;
  if (avisoPendente) {
    return "aguardando_aviso";
  }

  if (!Boolean(Number(row.pagamentoSolicitado || 0))) {
    return "aguardando_liberacao_pagamento";
  }

  const pagamentoPendente = !Boolean(Number(row.pagamentoTemConteudo ?? (row.pagamentoConteudo ? 1 : 0))) || !row.pagamentoNome;
  if (pagamentoPendente) {
    return "aguardando_pagamento";
  }

  const hoje = hojeCivil();
  const inicio = String(row.dataInicio || "").slice(0, 10);
  const retorno = String(row.dataRetorno || "").slice(0, 10);

  if (hoje < inicio) {
    return "programada";
  }

  if (hoje >= inicio && hoje < retorno) {
    return "em_ferias";
  }

  return "concluida";
}


function adicionarDiasCivil(valor: string, dias: number) {
  const [ano, mes, dia] = valor.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  data.setUTCDate(data.getUTCDate() + dias);

  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, "0")}-${String(
    data.getUTCDate()
  ).padStart(2, "0")}`;
}

function adicionarAnosCivil(valor: string, anos: number) {
  const [ano, mes, dia] = valor.split("-").map(Number);
  const alvoAno = ano + anos;
  const ultimoDiaMes = new Date(Date.UTC(alvoAno, mes, 0)).getUTCDate();
  const diaAjustado = Math.min(dia, ultimoDiaMes);

  return `${alvoAno}-${String(mes).padStart(2, "0")}-${String(diaAjustado).padStart(2, "0")}`;
}

function anosCompletos(admissao: string, referencia: string) {
  const [anoA, mesA, diaA] = admissao.split("-").map(Number);
  const [anoR, mesR, diaR] = referencia.split("-").map(Number);

  let anos = anoR - anoA;
  if (mesR < mesA || (mesR === mesA && diaR < diaA)) {
    anos -= 1;
  }

  return Math.max(0, anos);
}

function diferencaDiasCivil(inicio: string, fim: string) {
  const [anoI, mesI, diaI] = inicio.split("-").map(Number);
  const [anoF, mesF, diaF] = fim.split("-").map(Number);
  const dataI = Date.UTC(anoI, mesI - 1, diaI);
  const dataF = Date.UTC(anoF, mesF - 1, diaF);

  return Math.round((dataF - dataI) / 86_400_000);
}

function periodoTeorico(admissao: string, indice: number) {
  const periodoAquisitivoInicio = adicionarAnosCivil(admissao, indice);
  const periodoAquisitivoFim = adicionarDiasCivil(adicionarAnosCivil(admissao, indice + 1), -1);
  const dataLimiteRetorno = adicionarDiasCivil(adicionarAnosCivil(admissao, indice + 2), -1);
  const ultimaDataSeguraInicio30 = adicionarDiasCivil(dataLimiteRetorno, -30);

  return {
    indice,
    periodoAquisitivoInicio,
    periodoAquisitivoFim,
    dataLimiteRetorno,
    ultimaDataSeguraInicio30,
  };
}

function calcularPeriodoAlvo(
  admissao: string,
  periodosJaRegistrados: Set<string>,
  ignorarInicio?: string | null
) {
  const hoje = hojeCivil();
  const completos = anosCompletos(admissao, hoje);
  let indice = Math.max(0, completos - 1);

  for (let tentativas = 0; tentativas < 80; tentativas += 1) {
    const periodo = periodoTeorico(admissao, indice);
    const ocupado =
      periodosJaRegistrados.has(periodo.periodoAquisitivoInicio) &&
      periodo.periodoAquisitivoInicio !== ignorarInicio;

    if (!ocupado) {
      const diasAteLimiteRetorno = diferencaDiasCivil(hoje, periodo.dataLimiteRetorno);
      const diasAteUltimoInicio30 = diferencaDiasCivil(hoje, periodo.ultimaDataSeguraInicio30);

      return {
        ...periodo,
        diasAteLimiteRetorno,
        diasAteUltimoInicio30,
        aquisitivoConcluido: hoje > periodo.periodoAquisitivoFim,
      };
    }

    indice += 1;
  }

  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Não foi possível calcular o próximo período de férias.",
  });
}

async function buscarDadosFuncionarioFerias(
  pool: mysql.Pool,
  funcionarioId: number,
  lojaId?: number | null
) {
  const params: any[] = [funcionarioId];
  let filtroLoja = "";

  if (lojaId) {
    filtroLoja = " AND f.lojaId = ?";
    params.push(lojaId);
  }

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
     WHERE f.id = ? ${filtroLoja}
     LIMIT 1`,
    params
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

async function buscarPeriodosRegistrados(
  pool: mysql.Pool,
  funcionarioId: number,
  ignorarId?: number
) {
  const params: any[] = [funcionarioId];
  let ignorar = "";

  if (ignorarId) {
    ignorar = " AND id <> ?";
    params.push(ignorarId);
  }

  const [rows] = await pool.query<any[]>(
    `SELECT DATE_FORMAT(periodoAquisitivoInicio, '%Y-%m-%d') AS periodoAquisitivoInicio
       FROM rh_ferias_processos
      WHERE funcionarioId = ?
        AND cancelado = 0
        ${ignorar}`,
    params
  );

  return new Set(
    (rows || [])
      .map((row: any) => String(row.periodoAquisitivoInicio || "").slice(0, 10))
      .filter(Boolean)
  );
}

async function calcularPeriodoFuncionario(
  pool: mysql.Pool,
  funcionarioId: number,
  lojaId?: number | null,
  ignorarId?: number
) {
  const funcionario = await buscarDadosFuncionarioFerias(pool, funcionarioId, lojaId);
  const registrados = await buscarPeriodosRegistrados(pool, funcionarioId, ignorarId);

  const ignorarInicio =
    ignorarId
      ? (
          await pool.query<any[]>(
            `SELECT DATE_FORMAT(periodoAquisitivoInicio, '%Y-%m-%d') AS inicio
               FROM rh_ferias_processos
              WHERE id = ?
              LIMIT 1`,
            [ignorarId]
          )
        )[0]?.[0]?.inicio || null
      : null;

  const periodo = calcularPeriodoAlvo(
    String(funcionario.dataAdmissao).slice(0, 10),
    registrados,
    ignorarInicio
  );

  return {
    funcionarioId: Number(funcionario.id),
    funcionarioNome: funcionario.nome,
    funcionarioFuncao: funcionario.funcao ?? null,
    lojaId: Number(funcionario.lojaId),
    lojaNome: funcionario.lojaNome,
    dataAdmissao: String(funcionario.dataAdmissao).slice(0, 10),
    ...periodo,
  };
}


async function validarFuncionarioDaLoja(
  pool: mysql.Pool,
  funcionarioId: number,
  lojaId: number
) {
  const [rows] = await pool.query<any[]>(
    `SELECT id, nome, lojaId
       FROM funcionarios
      WHERE id = ? AND lojaId = ?
      LIMIT 1`,
    [funcionarioId, lojaId]
  );

  if (!rows?.[0]) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Funcionário não pertence à loja selecionada.",
    });
  }
}

async function buscarProcesso(pool: mysql.Pool, id: number) {
  const [rows] = await pool.query<any[]>(
    `SELECT *
       FROM rh_ferias_processos
      WHERE id = ?
      LIMIT 1`,
    [id]
  );

  const processo = rows?.[0];

  if (!processo) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Processo de férias não encontrado.",
    });
  }

  return processo;
}

function diferencaDias(dataInicio: string, dataRetorno: string) {
  const inicio = new Date(`${dataInicio}T00:00:00Z`);
  const retorno = new Date(`${dataRetorno}T00:00:00Z`);
  return Math.round((retorno.getTime() - inicio.getTime()) / 86_400_000);
}

async function validarSobreposicao(
  pool: mysql.Pool,
  funcionarioId: number,
  dataInicio: string,
  dataRetorno: string,
  ignorarId?: number
) {
  const params: any[] = [funcionarioId, dataRetorno, dataInicio];
  let sql = `
    SELECT id
      FROM rh_ferias_processos
     WHERE funcionarioId = ?
       AND cancelado = 0
       AND dataInicio < ?
       AND dataRetorno > ?
  `;

  if (ignorarId) {
    sql += " AND id <> ?";
    params.push(ignorarId);
  }

  sql += " LIMIT 1";

  const [rows] = await pool.query<any[]>(sql, params);

  if (rows?.[0]) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Já existe outro processo de férias desse funcionário sobrepondo este período.",
    });
  }
}

function validarDatas(input: {
  periodoAquisitivoInicio: string;
  periodoAquisitivoFim: string;
  dataInicio: string;
  dataRetorno: string;
  quantidadeDias: number;
}) {
  if (input.periodoAquisitivoInicio > input.periodoAquisitivoFim) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "O período aquisitivo informado é inválido.",
    });
  }

  if (input.dataInicio <= input.periodoAquisitivoFim) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "As férias não podem iniciar antes do término do período aquisitivo.",
    });
  }

  if (input.dataInicio >= input.dataRetorno) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A data de retorno deve ser posterior ao início das férias.",
    });
  }

  if (input.quantidadeDias < 1 || input.quantidadeDias > 30) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A quantidade de dias deve ficar entre 1 e 30.",
    });
  }

  if (diferencaDias(input.dataInicio, input.dataRetorno) !== input.quantidadeDias) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A data de retorno não corresponde à quantidade de dias informada.",
    });
  }
}

const dadosProcessoSchema = z.object({
  lojaId: z.number().int().positive(),
  funcionarioId: z.number().int().positive(),
  periodoAquisitivoInicio: dataCivilSchema,
  periodoAquisitivoFim: dataCivilSchema,
  dataInicio: dataCivilSchema,
  dataRetorno: dataCivilSchema,
  quantidadeDias: z.number().int().min(1).max(30),
  observacao: z.string().trim().max(3000).nullable().optional(),
});

export const rhFeriasRouter = router({
  periodoSugerido: protectedProcedure
    .input(
      z.object({
        lojaId: z.number().int().positive(),
        funcionarioId: z.number().int().positive(),
        ignorarId: z.number().int().positive().nullable().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      await ensureRhFeriasTable();
      assertGestaoFerias(ctx);

      const pool = getPoolFerias();
      return calcularPeriodoFuncionario(
        pool,
        input.funcionarioId,
        input.lojaId,
        input.ignorarId || undefined
      );
    }),

  vencimentos: protectedProcedure.query(async ({ ctx }) => {
    await ensureRhFeriasTable();
    assertGestaoFerias(ctx);

    const pool = getPoolFerias();

    const [funcionarios] = await pool.query<any[]>(
      `SELECT
         f.id,
         f.nome,
         f.lojaId,
         f.funcao,
         DATE_FORMAT(f.dataAdmissao, '%Y-%m-%d') AS dataAdmissao,
         COALESCE(l.nome, CONCAT('Loja ', f.lojaId)) AS lojaNome
       FROM funcionarios f
       LEFT JOIN lojas l ON l.id = f.lojaId
       WHERE f.status = 'ativo'
         AND f.dataAdmissao IS NOT NULL
       ORDER BY f.nome`
    );

    const [periodos] = await pool.query<any[]>(
      `SELECT
         funcionarioId,
         DATE_FORMAT(periodoAquisitivoInicio, '%Y-%m-%d') AS periodoAquisitivoInicio
       FROM rh_ferias_processos
       WHERE cancelado = 0`
    );

    const mapa = new Map<number, Set<string>>();

    for (const row of periodos || []) {
      const funcionarioId = Number(row.funcionarioId);
      const conjunto = mapa.get(funcionarioId) || new Set<string>();
      const inicio = String(row.periodoAquisitivoInicio || "").slice(0, 10);
      if (inicio) conjunto.add(inicio);
      mapa.set(funcionarioId, conjunto);
    }

    return (funcionarios || []).map((funcionario: any) => {
      const admissao = String(funcionario.dataAdmissao).slice(0, 10);
      const periodo = calcularPeriodoAlvo(
        admissao,
        mapa.get(Number(funcionario.id)) || new Set<string>()
      );

      return {
        funcionarioId: Number(funcionario.id),
        funcionarioNome: funcionario.nome,
        funcionarioFuncao: funcionario.funcao ?? null,
        lojaId: Number(funcionario.lojaId),
        lojaNome: funcionario.lojaNome,
        dataAdmissao: admissao,
        ...periodo,
      };
    });
  }),

  listar: protectedProcedure
    .input(
      z.object({
        lojaId: z.number().int().positive().nullable().optional(),
        funcionarioId: z.number().int().positive().nullable().optional(),
        status: statusFeriasSchema.nullable().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      await ensureRhFeriasTable();
      assertGestaoFerias(ctx);

      const pool = getPoolFerias();
      const condicoes: string[] = ["1 = 1"];
      const params: any[] = [];

      if (input.lojaId) {
        condicoes.push("p.lojaId = ?");
        params.push(Number(input.lojaId));
      }

      if (input.funcionarioId) {
        condicoes.push("p.funcionarioId = ?");
        params.push(Number(input.funcionarioId));
      }

      const [rows] = await pool.query<any[]>(
        `SELECT
           p.id,
           p.lojaId,
           p.funcionarioId,
           p.periodoAquisitivoInicio,
           p.periodoAquisitivoFim,
           p.dataInicio,
           p.dataRetorno,
           p.quantidadeDias,
           p.observacao,
           p.avisoSolicitado,
           p.avisoNome,
           p.avisoMime,
           p.avisoTamanho,
           p.avisoPorUsuarioId,
           p.avisoPorNome,
           p.avisoAnexadoEm,
           CASE WHEN p.avisoConteudo IS NULL THEN 0 ELSE 1 END AS avisoTemConteudo,
           p.pagamentoSolicitado,
           p.pagamentoNome,
           p.pagamentoMime,
           p.pagamentoTamanho,
           p.pagamentoPorUsuarioId,
           p.pagamentoPorNome,
           p.pagamentoAnexadoEm,
           CASE WHEN p.pagamentoConteudo IS NULL THEN 0 ELSE 1 END AS pagamentoTemConteudo,
           p.cancelado,
           p.criadoPorUsuarioId,
           p.criadoPorNome,
           p.createdAt,
           p.updatedAt,
           COALESCE(l.nome, CONCAT('Loja ', p.lojaId)) AS lojaNome,
           COALESCE(f.nome, CONCAT('Funcionário ', p.funcionarioId)) AS funcionarioNome,
           f.funcao AS funcionarioFuncao,
           DATE_FORMAT(p.periodoAquisitivoInicio, '%Y-%m-%d') AS periodoAquisitivoInicioFmt,
           DATE_FORMAT(p.periodoAquisitivoFim, '%Y-%m-%d') AS periodoAquisitivoFimFmt,
           DATE_FORMAT(p.dataInicio, '%Y-%m-%d') AS dataInicioFmt,
           DATE_FORMAT(p.dataRetorno, '%Y-%m-%d') AS dataRetornoFmt,
           DATE_FORMAT(p.avisoAnexadoEm, '%Y-%m-%dT%H:%i:%s') AS avisoAnexadoEmFmt,
           DATE_FORMAT(p.pagamentoAnexadoEm, '%Y-%m-%dT%H:%i:%s') AS pagamentoAnexadoEmFmt,
           DATE_FORMAT(p.createdAt, '%Y-%m-%dT%H:%i:%s') AS criadoEmFmt,
           DATE_FORMAT(p.updatedAt, '%Y-%m-%dT%H:%i:%s') AS atualizadoEmFmt
         FROM rh_ferias_processos p
         LEFT JOIN funcionarios f ON f.id = p.funcionarioId
         LEFT JOIN lojas l ON l.id = p.lojaId
         WHERE ${condicoes.join(" AND ")}
         ORDER BY p.cancelado ASC, p.dataInicio ASC, p.id DESC
         LIMIT 1500`,
        params
      );

      const normalizados = (rows || []).map((row: any) => {
        const status = statusProcesso(row);

        return {
          id: Number(row.id),
          lojaId: Number(row.lojaId),
          lojaNome: row.lojaNome,
          funcionarioId: Number(row.funcionarioId),
          funcionarioNome: row.funcionarioNome,
          funcionarioFuncao: row.funcionarioFuncao ?? null,

          periodoAquisitivoInicio: row.periodoAquisitivoInicioFmt,
          periodoAquisitivoFim: row.periodoAquisitivoFimFmt,
          dataInicio: row.dataInicioFmt,
          dataRetorno: row.dataRetornoFmt,
          quantidadeDias: Number(row.quantidadeDias || 0),
          observacao: row.observacao ?? null,

          status,

          avisoPendente:
            !Boolean(Number(row.avisoTemConteudo || 0)) || !row.avisoNome,
          avisoNome: row.avisoNome ?? null,
          avisoMime: row.avisoMime ?? null,
          avisoTamanho: row.avisoTamanho ? Number(row.avisoTamanho) : null,
          avisoPorNome: row.avisoPorNome ?? null,
          avisoAnexadoEm: row.avisoAnexadoEmFmt ?? null,

          pagamentoSolicitado: Boolean(Number(row.pagamentoSolicitado || 0)),
          pagamentoPendente:
            !Boolean(Number(row.pagamentoTemConteudo || 0)) || !row.pagamentoNome,
          pagamentoNome: row.pagamentoNome ?? null,
          pagamentoMime: row.pagamentoMime ?? null,
          pagamentoTamanho: row.pagamentoTamanho ? Number(row.pagamentoTamanho) : null,
          pagamentoPorNome: row.pagamentoPorNome ?? null,
          pagamentoAnexadoEm: row.pagamentoAnexadoEmFmt ?? null,

          criadoPorNome: row.criadoPorNome ?? null,
          criadoEm: row.criadoEmFmt ?? null,
          atualizadoEm: row.atualizadoEmFmt ?? null,
        };
      });

      if (!input.status) {
        return normalizados;
      }

      return normalizados.filter((item: any) => item.status === input.status);
    }),

  salvar: protectedProcedure
    .input(dadosProcessoSchema)
    .mutation(async ({ input, ctx }) => {
      await ensureRhFeriasTable();
      assertGestaoFerias(ctx);
      validarDatas(input);

      const pool = getPoolFerias();
      await validarFuncionarioDaLoja(pool, input.funcionarioId, input.lojaId);

      const periodoAutomatico = await calcularPeriodoFuncionario(
        pool,
        input.funcionarioId,
        input.lojaId
      );

      if (
        input.periodoAquisitivoInicio !== periodoAutomatico.periodoAquisitivoInicio ||
        input.periodoAquisitivoFim !== periodoAutomatico.periodoAquisitivoFim
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "O período aquisitivo mudou. Atualize a tela e tente novamente.",
        });
      }

      if (input.dataRetorno > periodoAutomatico.dataLimiteRetorno) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Pela regra interna, o colaborador precisa retornar até ${periodoAutomatico.dataLimiteRetorno}.`,
        });
      }

      await validarSobreposicao(
        pool,
        input.funcionarioId,
        input.dataInicio,
        input.dataRetorno
      );

      const [resultado] = await pool.query<any>(
        `INSERT INTO rh_ferias_processos (
           lojaId,
           funcionarioId,
           periodoAquisitivoInicio,
           periodoAquisitivoFim,
           dataInicio,
           dataRetorno,
           quantidadeDias,
           observacao,
           avisoSolicitado,
           pagamentoSolicitado,
           criadoPorUsuarioId,
           criadoPorNome
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)`,
        [
          input.lojaId,
          input.funcionarioId,
          input.periodoAquisitivoInicio,
          input.periodoAquisitivoFim,
          input.dataInicio,
          input.dataRetorno,
          input.quantidadeDias,
          input.observacao || null,
          Number(ctx.user?.id || 0) || null,
          String(ctx.user?.name || ctx.user?.email || "Usuário"),
        ]
      );

      return {
        success: true,
        id: Number(resultado.insertId),
      };
    }),

  atualizar: protectedProcedure
    .input(
      dadosProcessoSchema.extend({
        id: z.number().int().positive(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await ensureRhFeriasTable();
      assertGestaoFerias(ctx);
      validarDatas(input);

      const pool = getPoolFerias();
      const processo = await buscarProcesso(pool, input.id);

      if (Boolean(Number(processo.cancelado || 0))) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Um processo cancelado não pode ser alterado.",
        });
      }

      if (processo.avisoConteudo || processo.avisoNome) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "O aviso de férias já foi anexado. Para preservar o documento assinado, cancele este processo e crie outro se precisar alterar os dados.",
        });
      }

      await validarFuncionarioDaLoja(pool, input.funcionarioId, input.lojaId);

      const periodoAutomatico = await calcularPeriodoFuncionario(
        pool,
        input.funcionarioId,
        input.lojaId,
        input.id
      );

      if (
        input.periodoAquisitivoInicio !== periodoAutomatico.periodoAquisitivoInicio ||
        input.periodoAquisitivoFim !== periodoAutomatico.periodoAquisitivoFim
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "O período aquisitivo calculado não corresponde ao processo.",
        });
      }

      if (input.dataRetorno > periodoAutomatico.dataLimiteRetorno) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Pela regra interna, o colaborador precisa retornar até ${periodoAutomatico.dataLimiteRetorno}.`,
        });
      }

      await validarSobreposicao(
        pool,
        input.funcionarioId,
        input.dataInicio,
        input.dataRetorno,
        input.id
      );

      await pool.query(
        `UPDATE rh_ferias_processos
            SET lojaId = ?,
                funcionarioId = ?,
                periodoAquisitivoInicio = ?,
                periodoAquisitivoFim = ?,
                dataInicio = ?,
                dataRetorno = ?,
                quantidadeDias = ?,
                observacao = ?
          WHERE id = ?`,
        [
          input.lojaId,
          input.funcionarioId,
          input.periodoAquisitivoInicio,
          input.periodoAquisitivoFim,
          input.dataInicio,
          input.dataRetorno,
          input.quantidadeDias,
          input.observacao || null,
          input.id,
        ]
      );

      return { success: true };
    }),

  cancelar: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      await ensureRhFeriasTable();
      assertGestaoFerias(ctx);

      const pool = getPoolFerias();
      const processo = await buscarProcesso(pool, input.id);

      if (Boolean(Number(processo.cancelado || 0))) {
        return { success: true };
      }

      await pool.query(
        `UPDATE rh_ferias_processos
            SET cancelado = 1,
                canceladoPorUsuarioId = ?,
                canceladoPorNome = ?,
                canceladoEm = NOW()
          WHERE id = ?`,
        [
          Number(ctx.user?.id || 0) || null,
          String(ctx.user?.name || ctx.user?.email || "Usuário"),
          input.id,
        ]
      );

      return { success: true };
    }),

  liberarPagamento: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      await ensureRhFeriasTable();
      assertGestaoFerias(ctx);

      const pool = getPoolFerias();
      const processo = await buscarProcesso(pool, input.id);

      if (Boolean(Number(processo.cancelado || 0))) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "O processo está cancelado.",
        });
      }

      if (!processo.avisoConteudo || !processo.avisoNome) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "O aviso de férias precisa ser anexado antes de liberar o pagamento.",
        });
      }

      await pool.query(
        `UPDATE rh_ferias_processos
            SET pagamentoSolicitado = 1
          WHERE id = ?`,
        [input.id]
      );

      return { success: true };
    }),

  pendenciasCaixa: protectedProcedure.query(async ({ ctx }) => {
    await ensureRhFeriasTable();

    const perfil = perfilRh(ctx);
    if (!perfil.caixaLider) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Esta consulta é exclusiva da Caixa Líder.",
      });
    }

    const pool = getPoolFerias();

    const [rows] = await pool.query<any[]>(
      `SELECT
         p.id,
         p.lojaId,
         p.funcionarioId,
         COALESCE(f.nome, CONCAT('Funcionário ', p.funcionarioId)) AS funcionarioNome,
         DATE_FORMAT(p.dataInicio, '%Y-%m-%d') AS dataInicio,
         DATE_FORMAT(p.dataRetorno, '%Y-%m-%d') AS dataRetorno,
         p.avisoSolicitado,
         CASE WHEN p.avisoConteudo IS NULL OR p.avisoNome IS NULL THEN 1 ELSE 0 END AS avisoPendente,
         p.pagamentoSolicitado,
         CASE WHEN p.pagamentoConteudo IS NULL OR p.pagamentoNome IS NULL THEN 1 ELSE 0 END AS pagamentoPendente
       FROM rh_ferias_processos p
       LEFT JOIN funcionarios f ON f.id = p.funcionarioId
       WHERE p.lojaId = ?
         AND p.cancelado = 0
         AND (
           (p.avisoSolicitado = 1 AND (p.avisoConteudo IS NULL OR p.avisoNome IS NULL))
           OR
           (p.pagamentoSolicitado = 1 AND (p.pagamentoConteudo IS NULL OR p.pagamentoNome IS NULL))
         )
       ORDER BY p.dataInicio ASC, p.id DESC`,
      [perfil.lojaId]
    );

    return (rows || []).map((row: any) => ({
      id: Number(row.id),
      lojaId: Number(row.lojaId),
      funcionarioId: Number(row.funcionarioId),
      funcionarioNome: row.funcionarioNome,
      dataInicio: row.dataInicio,
      dataRetorno: row.dataRetorno,
      avisoPendente: Boolean(Number(row.avisoPendente || 0)),
      pagamentoSolicitado: Boolean(Number(row.pagamentoSolicitado || 0)),
      pagamentoPendente: Boolean(Number(row.pagamentoPendente || 0)),
    }));
  }),

  anexarDocumento: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        tipo: tipoDocumentoSchema,
        arquivoNome: z.string().trim().min(1).max(255),
        arquivoMime: z.string().trim().min(1).max(120),
        arquivoTamanho: z.number().int().positive().max(TAMANHO_MAXIMO),
        arquivoBase64: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await ensureRhFeriasTable();

      const pool = getPoolFerias();
      const processo = await buscarProcesso(pool, input.id);
      const perfil = assertCaixaOuGestao(ctx, Number(processo.lojaId));

      if (Boolean(Number(processo.cancelado || 0))) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "O processo está cancelado.",
        });
      }

      if (perfil.caixaLider) {
        if (input.tipo === "aviso" && !Boolean(Number(processo.avisoSolicitado || 0))) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "O aviso ainda não foi solicitado pelo RH.",
          });
        }

        if (
          input.tipo === "pagamento" &&
          !Boolean(Number(processo.pagamentoSolicitado || 0))
        ) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "O pagamento ainda não foi solicitado pelo RH.",
          });
        }
      }

      validarMime(input.arquivoMime);
      const arquivo = bufferArquivo(input.arquivoBase64);
      const hash = createHash("sha256").update(arquivo).digest("hex");

      const prefixo = input.tipo === "aviso" ? "aviso" : "pagamento";

      await pool.query(
        `UPDATE rh_ferias_processos
            SET ${prefixo}Nome = ?,
                ${prefixo}Mime = ?,
                ${prefixo}Tamanho = ?,
                ${prefixo}Hash = ?,
                ${prefixo}Conteudo = ?,
                ${prefixo}PorUsuarioId = ?,
                ${prefixo}PorNome = ?,
                ${prefixo}AnexadoEm = NOW()
          WHERE id = ?`,
        [
          nomeArquivoSeguro(input.arquivoNome),
          input.arquivoMime,
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
    .input(
      z.object({
        id: z.number().int().positive(),
        tipo: tipoDocumentoSchema,
      })
    )
    .query(async ({ input, ctx }) => {
      await ensureRhFeriasTable();

      const pool = getPoolFerias();
      const processo = await buscarProcesso(pool, input.id);

      assertCaixaOuGestao(ctx, Number(processo.lojaId));

      const prefixo = input.tipo === "aviso" ? "aviso" : "pagamento";
      const conteudoOriginal = processo[`${prefixo}Conteudo`];
      const nome = processo[`${prefixo}Nome`];
      const mime = processo[`${prefixo}Mime`];
      const tamanho = processo[`${prefixo}Tamanho`];

      if (!conteudoOriginal || !nome) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Documento ainda não anexado.",
        });
      }

      const conteudo = Buffer.isBuffer(conteudoOriginal)
        ? conteudoOriginal
        : Buffer.from(conteudoOriginal || []);

      return {
        id: Number(processo.id),
        arquivoNome: nome,
        arquivoMime: mime || "application/octet-stream",
        arquivoTamanho: Number(tamanho || conteudo.length),
        arquivoBase64: conteudo.toString("base64"),
      };
    }),
});
