import mysql from "mysql2/promise";
import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";

const dataCivilSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const TAMANHO_MAXIMO = 6 * 1024 * 1024;

const MIME_PERMITIDOS = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

type TipoDocumentoOperacional =
  | "cartao_ponto"
  | "ficha_demissional"
  | "rescisao_contabilidade";

let poolRescisoes: mysql.Pool | null = null;
let estruturaPronta = false;

function getPoolRescisoes() {
  if (!process.env.DATABASE_URL) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Banco de dados não configurado.",
    });
  }

  if (!poolRescisoes) {
    poolRescisoes = mysql.createPool({
      uri: process.env.DATABASE_URL,
      waitForConnections: true,
      connectionLimit: 4,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
    });
  }

  return poolRescisoes;
}

async function adicionarColunaSeNecessario(
  pool: mysql.Pool,
  definicao: string
) {
  try {
    await pool.query(`ALTER TABLE rh_rescisoes_processos ADD COLUMN ${definicao}`);
  } catch (error: any) {
    if (String(error?.code || "") !== "ER_DUP_FIELDNAME") throw error;
  }
}

async function ensureRhRescisoesTable() {
  if (estruturaPronta) return;

  const pool = getPoolRescisoes();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS rh_rescisoes_processos (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      lojaId INT NOT NULL,
      funcionarioId INT NOT NULL,

      origem VARCHAR(30) NOT NULL,
      status VARCHAR(30) NOT NULL,

      dataSolicitacao DATE NOT NULL,
      ultimoDiaInformado DATE NULL,
      dataPrevistaDesligamento DATE NULL,

      motivoEmpresa TEXT NULL,
      observacao TEXT NULL,

      cartaNome VARCHAR(255) NULL,
      cartaMime VARCHAR(120) NULL,
      cartaTamanho INT UNSIGNED NULL,
      cartaHash CHAR(64) NULL,
      cartaConteudo LONGBLOB NULL,
      cartaPorUsuarioId INT NULL,
      cartaPorNome VARCHAR(255) NULL,
      cartaAnexadaEm DATETIME NULL,

      recebidoRhPorUsuarioId INT NULL,
      recebidoRhPorNome VARCHAR(255) NULL,
      recebidoRhEm DATETIME NULL,

      criadoPorUsuarioId INT NULL,
      criadoPorNome VARCHAR(255) NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

      PRIMARY KEY (id),
      KEY idx_rh_rescisao_loja_status (lojaId, status),
      KEY idx_rh_rescisao_funcionario (funcionarioId),
      KEY idx_rh_rescisao_data (dataSolicitacao)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  const novasColunas = [
    "cartaoPontoNome VARCHAR(255) NULL",
    "cartaoPontoMime VARCHAR(120) NULL",
    "cartaoPontoTamanho INT UNSIGNED NULL",
    "cartaoPontoHash CHAR(64) NULL",
    "cartaoPontoConteudo LONGBLOB NULL",
    "cartaoPontoPorUsuarioId INT NULL",
    "cartaoPontoPorNome VARCHAR(255) NULL",
    "cartaoPontoAnexadoEm DATETIME NULL",

    "fichaDemissionalNome VARCHAR(255) NULL",
    "fichaDemissionalMime VARCHAR(120) NULL",
    "fichaDemissionalTamanho INT UNSIGNED NULL",
    "fichaDemissionalHash CHAR(64) NULL",
    "fichaDemissionalConteudo LONGBLOB NULL",
    "fichaDemissionalPorUsuarioId INT NULL",
    "fichaDemissionalPorNome VARCHAR(255) NULL",
    "fichaDemissionalAnexadaEm DATETIME NULL",

    "portalContabilidadeEnviado TINYINT(1) NOT NULL DEFAULT 0",
    "portalContabilidadePorUsuarioId INT NULL",
    "portalContabilidadePorNome VARCHAR(255) NULL",
    "portalContabilidadeEnviadoEm DATETIME NULL",

    "rescisaoNome VARCHAR(255) NULL",
    "rescisaoMime VARCHAR(120) NULL",
    "rescisaoTamanho INT UNSIGNED NULL",
    "rescisaoHash CHAR(64) NULL",
    "rescisaoConteudo LONGBLOB NULL",
    "rescisaoPorUsuarioId INT NULL",
    "rescisaoPorNome VARCHAR(255) NULL",
    "rescisaoAnexadaEm DATETIME NULL",

    "rescisaoConferida TINYINT(1) NOT NULL DEFAULT 0",
    "rescisaoConferidaPorUsuarioId INT NULL",
    "rescisaoConferidaPorNome VARCHAR(255) NULL",
    "rescisaoConferidaEm DATETIME NULL",

    "contasPagarLancado TINYINT(1) NOT NULL DEFAULT 0",
    "contasPagarPorUsuarioId INT NULL",
    "contasPagarPorNome VARCHAR(255) NULL",
    "contasPagarLancadoEm DATETIME NULL",
    "operacionalConcluidoEm DATETIME NULL",
  ];

  for (const coluna of novasColunas) {
    await adicionarColunaSeNecessario(pool, coluna);
  }

  estruturaPronta = true;
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

function assertGestao(ctx: any) {
  const perfil = perfilRh(ctx);

  if (!perfil.liderRh && !perfil.adminOuGestor) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "A gestão de rescisões é exclusiva da Líder de RH.",
    });
  }

  return perfil;
}

function assertCaixa(ctx: any, lojaIdTeste?: number | null) {
  const perfil = perfilRh(ctx);

  if (perfil.caixaLider) {
    return {
      ...perfil,
      lojaIdOperacao: perfil.lojaId,
      modoTeste: false,
    };
  }

  if (perfil.adminOuGestor && Number(lojaIdTeste || 0) > 0) {
    return {
      ...perfil,
      lojaIdOperacao: Number(lojaIdTeste),
      modoTeste: true,
    };
  }

  throw new TRPCError({
    code: "FORBIDDEN",
    message:
      "Esta ação é exclusiva da Caixa Líder. Admin/Gestor pode usar somente o modo de teste com uma loja selecionada.",
  });
}

function validarMime(mime: string) {
  if (!MIME_PERMITIDOS.has(String(mime || "").toLowerCase())) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Envie PDF, JPG, PNG, WEBP, HEIC ou HEIF.",
    });
  }
}

function bufferArquivo(base64: string) {
  const limpo = String(base64 || "").includes(",")
    ? String(base64).split(",").pop() || ""
    : String(base64 || "");

  let arquivo: Buffer;

  try {
    arquivo = Buffer.from(limpo, "base64");
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

function nomeArquivoSeguro(nome: string) {
  const limpo = String(nome || "documento")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(-180);

  return limpo || "documento";
}

async function buscarFuncionario(
  pool: mysql.Pool,
  funcionarioId: number,
  lojaId: number
) {
  const [rows] = await pool.query<any[]>(
    `SELECT id, lojaId, nome, funcao, status,
            DATE_FORMAT(dataAdmissao, '%Y-%m-%d') AS dataAdmissao
       FROM funcionarios
      WHERE id = ?
        AND lojaId = ?
      LIMIT 1`,
    [funcionarioId, lojaId]
  );

  const funcionario = rows?.[0];

  if (!funcionario) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Funcionário não encontrado nesta loja.",
    });
  }

  if (!["ativo", "experiencia"].includes(String(funcionario.status || "").toLowerCase())) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "O funcionário não está ativo para abertura de uma nova rescisão.",
    });
  }

  return funcionario;
}

async function validarProcessoAberto(
  pool: mysql.Pool,
  funcionarioId: number
) {
  const [rows] = await pool.query<any[]>(
    `SELECT id
       FROM rh_rescisoes_processos
      WHERE funcionarioId = ?
        AND status IN ('aguardando_rh', 'em_andamento')
      LIMIT 1`,
    [funcionarioId]
  );

  if (rows?.[0]) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Este funcionário já possui uma rescisão em andamento.",
    });
  }
}

function faseOperacional(row: any) {
  if (String(row.status) === "cancelada") return "cancelada";

  if (!row.cartaoPontoNome || !row.fichaDemissionalNome) {
    return "preparar_documentos";
  }

  if (!Boolean(Number(row.portalContabilidadeEnviado || 0))) {
    return "enviar_contabilidade";
  }

  if (!row.rescisaoNome) {
    return "aguardando_contabilidade";
  }

  if (!Boolean(Number(row.rescisaoConferida || 0))) {
    return "conferir_rescisao";
  }

  if (!Boolean(Number(row.contasPagarLancado || 0))) {
    return "lancar_contas_pagar";
  }

  return "operacional_concluido";
}

function labelFaseOperacional(fase: string) {
  if (fase === "preparar_documentos") return "Preparar documentos";
  if (fase === "enviar_contabilidade") return "Enviar ao portal da contabilidade";
  if (fase === "aguardando_contabilidade") return "Aguardando retorno da contabilidade";
  if (fase === "conferir_rescisao") return "Conferir rescisão";
  if (fase === "lancar_contas_pagar") return "Lançar no Contas a Pagar";
  if (fase === "operacional_concluido") return "Processo operacional concluído";
  if (fase === "cancelada") return "Cancelada";
  return fase;
}

async function selecionarProcessos(
  pool: mysql.Pool,
  filtroLojaId?: number | null
) {
  const params: any[] = [];
  let filtroLoja = "";

  if (filtroLojaId) {
    filtroLoja = " AND r.lojaId = ? ";
    params.push(Number(filtroLojaId));
  }

  const [rows] = await pool.query<any[]>(
    `SELECT
       r.id,
       r.lojaId,
       COALESCE(l.nome, CONCAT('Loja ', r.lojaId)) AS lojaNome,
       r.funcionarioId,
       f.nome AS funcionarioNome,
       f.funcao AS funcionarioFuncao,

       r.origem,
       r.status,

       DATE_FORMAT(r.dataSolicitacao, '%Y-%m-%d') AS dataSolicitacao,
       DATE_FORMAT(r.ultimoDiaInformado, '%Y-%m-%d') AS ultimoDiaInformado,
       DATE_FORMAT(r.dataPrevistaDesligamento, '%Y-%m-%d') AS dataPrevistaDesligamento,

       r.motivoEmpresa,
       r.observacao,

       r.cartaNome,
       r.cartaMime,
       r.cartaTamanho,
       r.cartaPorNome,
       DATE_FORMAT(r.cartaAnexadaEm, '%Y-%m-%dT%H:%i:%s') AS cartaAnexadaEm,

       r.cartaoPontoNome,
       r.cartaoPontoMime,
       r.cartaoPontoTamanho,
       r.cartaoPontoPorNome,
       DATE_FORMAT(r.cartaoPontoAnexadoEm, '%Y-%m-%dT%H:%i:%s') AS cartaoPontoAnexadoEm,

       r.fichaDemissionalNome,
       r.fichaDemissionalMime,
       r.fichaDemissionalTamanho,
       r.fichaDemissionalPorNome,
       DATE_FORMAT(r.fichaDemissionalAnexadaEm, '%Y-%m-%dT%H:%i:%s') AS fichaDemissionalAnexadaEm,

       r.portalContabilidadeEnviado,
       r.portalContabilidadePorNome,
       DATE_FORMAT(r.portalContabilidadeEnviadoEm, '%Y-%m-%dT%H:%i:%s') AS portalContabilidadeEnviadoEm,

       r.rescisaoNome,
       r.rescisaoMime,
       r.rescisaoTamanho,
       r.rescisaoPorNome,
       DATE_FORMAT(r.rescisaoAnexadaEm, '%Y-%m-%dT%H:%i:%s') AS rescisaoAnexadaEm,

       r.rescisaoConferida,
       r.rescisaoConferidaPorNome,
       DATE_FORMAT(r.rescisaoConferidaEm, '%Y-%m-%dT%H:%i:%s') AS rescisaoConferidaEm,

       r.contasPagarLancado,
       r.contasPagarPorNome,
       DATE_FORMAT(r.contasPagarLancadoEm, '%Y-%m-%dT%H:%i:%s') AS contasPagarLancadoEm,
       DATE_FORMAT(r.operacionalConcluidoEm, '%Y-%m-%dT%H:%i:%s') AS operacionalConcluidoEm,

       r.recebidoRhPorNome,
       DATE_FORMAT(r.recebidoRhEm, '%Y-%m-%dT%H:%i:%s') AS recebidoRhEm,

       r.criadoPorNome,
       DATE_FORMAT(r.createdAt, '%Y-%m-%dT%H:%i:%s') AS createdAt,
       DATE_FORMAT(r.updatedAt, '%Y-%m-%dT%H:%i:%s') AS updatedAt

     FROM rh_rescisoes_processos r
     INNER JOIN funcionarios f ON f.id = r.funcionarioId
     LEFT JOIN lojas l ON l.id = r.lojaId
     WHERE 1 = 1
       ${filtroLoja}
     ORDER BY
       FIELD(r.status, 'aguardando_rh', 'em_andamento', 'concluida', 'cancelada'),
       r.updatedAt DESC,
       r.createdAt DESC
     LIMIT 1000`,
    params
  );

  return (rows || []).map((row: any) => {
    const fase = faseOperacional(row);

    return {
      id: Number(row.id),
      lojaId: Number(row.lojaId),
      lojaNome: row.lojaNome,
      funcionarioId: Number(row.funcionarioId),
      funcionarioNome: row.funcionarioNome,
      funcionarioFuncao: row.funcionarioFuncao ?? null,

      origem: row.origem,
      status: row.status,

      dataSolicitacao: row.dataSolicitacao,
      ultimoDiaInformado: row.ultimoDiaInformado ?? null,
      dataPrevistaDesligamento: row.dataPrevistaDesligamento ?? null,

      motivoEmpresa: row.motivoEmpresa ?? null,
      observacao: row.observacao ?? null,

      cartaNome: row.cartaNome ?? null,
      cartaMime: row.cartaMime ?? null,
      cartaTamanho: row.cartaTamanho ? Number(row.cartaTamanho) : null,
      cartaPorNome: row.cartaPorNome ?? null,
      cartaAnexadaEm: row.cartaAnexadaEm ?? null,

      cartaoPontoNome: row.cartaoPontoNome ?? null,
      cartaoPontoMime: row.cartaoPontoMime ?? null,
      cartaoPontoTamanho: row.cartaoPontoTamanho ? Number(row.cartaoPontoTamanho) : null,
      cartaoPontoPorNome: row.cartaoPontoPorNome ?? null,
      cartaoPontoAnexadoEm: row.cartaoPontoAnexadoEm ?? null,

      fichaDemissionalNome: row.fichaDemissionalNome ?? null,
      fichaDemissionalMime: row.fichaDemissionalMime ?? null,
      fichaDemissionalTamanho: row.fichaDemissionalTamanho
        ? Number(row.fichaDemissionalTamanho)
        : null,
      fichaDemissionalPorNome: row.fichaDemissionalPorNome ?? null,
      fichaDemissionalAnexadaEm: row.fichaDemissionalAnexadaEm ?? null,

      portalContabilidadeEnviado: Boolean(Number(row.portalContabilidadeEnviado || 0)),
      portalContabilidadePorNome: row.portalContabilidadePorNome ?? null,
      portalContabilidadeEnviadoEm: row.portalContabilidadeEnviadoEm ?? null,

      rescisaoNome: row.rescisaoNome ?? null,
      rescisaoMime: row.rescisaoMime ?? null,
      rescisaoTamanho: row.rescisaoTamanho ? Number(row.rescisaoTamanho) : null,
      rescisaoPorNome: row.rescisaoPorNome ?? null,
      rescisaoAnexadaEm: row.rescisaoAnexadaEm ?? null,

      rescisaoConferida: Boolean(Number(row.rescisaoConferida || 0)),
      rescisaoConferidaPorNome: row.rescisaoConferidaPorNome ?? null,
      rescisaoConferidaEm: row.rescisaoConferidaEm ?? null,

      contasPagarLancado: Boolean(Number(row.contasPagarLancado || 0)),
      contasPagarPorNome: row.contasPagarPorNome ?? null,
      contasPagarLancadoEm: row.contasPagarLancadoEm ?? null,
      operacionalConcluidoEm: row.operacionalConcluidoEm ?? null,

      faseOperacional: fase,
      faseOperacionalLabel: labelFaseOperacional(fase),

      recebidoRhPorNome: row.recebidoRhPorNome ?? null,
      recebidoRhEm: row.recebidoRhEm ?? null,

      criadoPorNome: row.criadoPorNome ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  });
}

async function buscarProcessoDaLoja(
  pool: mysql.Pool,
  id: number,
  lojaId: number
) {
  const [rows] = await pool.query<any[]>(
    `SELECT *
       FROM rh_rescisoes_processos
      WHERE id = ?
        AND lojaId = ?
      LIMIT 1`,
    [id, lojaId]
  );

  const processo = rows?.[0];

  if (!processo) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Processo de rescisão não encontrado nesta loja.",
    });
  }

  return processo;
}

function camposDocumento(tipo: TipoDocumentoOperacional) {
  if (tipo === "cartao_ponto") {
    return {
      prefixo: "cartaoPonto",
      nomePadrao: "cartao-ponto",
      label: "Cartão-ponto",
    };
  }

  if (tipo === "ficha_demissional") {
    return {
      prefixo: "fichaDemissional",
      nomePadrao: "ficha-demissional",
      label: "Ficha demissional",
    };
  }

  return {
    prefixo: "rescisao",
    nomePadrao: "rescisao",
    label: "Rescisão",
  };
}

export const rhRescisoesRouter = router({
  minhaLoja: protectedProcedure
    .input(
      z
        .object({
          lojaId: z.number().int().positive().optional(),
        })
        .optional()
    )
    .query(async ({ input, ctx }) => {
      await ensureRhRescisoesTable();
      const perfil = assertCaixa(ctx, input?.lojaId);

      return selecionarProcessos(
        getPoolRescisoes(),
        perfil.lojaIdOperacao
      );
    }),

  listar: protectedProcedure.query(async ({ ctx }) => {
    await ensureRhRescisoesTable();
    assertGestao(ctx);

    return selecionarProcessos(getPoolRescisoes());
  }),

  criarPedidoDemissao: protectedProcedure
    .input(
      z.object({
        funcionarioId: z.number().int().positive(),
        lojaIdTeste: z.number().int().positive().optional(),
        dataSolicitacao: dataCivilSchema,
        ultimoDiaInformado: dataCivilSchema.nullable().optional(),
        observacao: z.string().trim().max(3000).nullable().optional(),

        arquivoNome: z.string().trim().min(1).max(255),
        arquivoMime: z.string().trim().min(1).max(120),
        arquivoTamanho: z.number().int().positive().max(TAMANHO_MAXIMO),
        arquivoBase64: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await ensureRhRescisoesTable();
      const perfil = assertCaixa(ctx, input.lojaIdTeste);
      const pool = getPoolRescisoes();

      const funcionario = await buscarFuncionario(
        pool,
        input.funcionarioId,
        perfil.lojaIdOperacao
      );

      await validarProcessoAberto(pool, input.funcionarioId);

      validarMime(input.arquivoMime);
      const carta = bufferArquivo(input.arquivoBase64);
      const hash = createHash("sha256").update(carta).digest("hex");
      const usuarioId = Number(ctx.user?.id || 0) || null;
      const usuarioNome = String(ctx.user?.name || ctx.user?.email || "Caixa Líder");

      const [result] = await pool.query<any>(
        `INSERT INTO rh_rescisoes_processos (
           lojaId,
           funcionarioId,
           origem,
           status,
           dataSolicitacao,
           ultimoDiaInformado,
           observacao,

           cartaNome,
           cartaMime,
           cartaTamanho,
           cartaHash,
           cartaConteudo,
           cartaPorUsuarioId,
           cartaPorNome,
           cartaAnexadaEm,

           criadoPorUsuarioId,
           criadoPorNome
         ) VALUES (?, ?, 'pedido_demissao', 'aguardando_rh', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?)`,
        [
          perfil.lojaIdOperacao,
          Number(funcionario.id),
          input.dataSolicitacao,
          input.ultimoDiaInformado || null,
          input.observacao || null,

          nomeArquivoSeguro(input.arquivoNome),
          input.arquivoMime,
          carta.length,
          hash,
          carta,
          usuarioId,
          usuarioNome,

          usuarioId,
          usuarioNome,
        ]
      );

      return {
        success: true,
        id: Number(result.insertId),
        funcionarioNome: funcionario.nome,
      };
    }),

  criarDesligamentoEmpresa: protectedProcedure
    .input(
      z.object({
        lojaId: z.number().int().positive(),
        funcionarioId: z.number().int().positive(),
        dataPrevistaDesligamento: dataCivilSchema,
        motivoEmpresa: z.string().trim().max(3000).nullable().optional(),
        observacao: z.string().trim().max(3000).nullable().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await ensureRhRescisoesTable();
      assertGestao(ctx);
      const pool = getPoolRescisoes();

      const funcionario = await buscarFuncionario(
        pool,
        input.funcionarioId,
        input.lojaId
      );

      await validarProcessoAberto(pool, input.funcionarioId);

      const usuarioId = Number(ctx.user?.id || 0) || null;
      const usuarioNome = String(ctx.user?.name || ctx.user?.email || "Líder RH");

      const [result] = await pool.query<any>(
        `INSERT INTO rh_rescisoes_processos (
           lojaId,
           funcionarioId,
           origem,
           status,
           dataSolicitacao,
           dataPrevistaDesligamento,
           motivoEmpresa,
           observacao,

           recebidoRhPorUsuarioId,
           recebidoRhPorNome,
           recebidoRhEm,

           criadoPorUsuarioId,
           criadoPorNome
         ) VALUES (?, ?, 'empresa', 'em_andamento', ?, ?, ?, ?, ?, ?, NOW(), ?, ?)`,
        [
          input.lojaId,
          Number(funcionario.id),
          input.dataPrevistaDesligamento,
          input.dataPrevistaDesligamento,
          input.motivoEmpresa || null,
          input.observacao || null,

          usuarioId,
          usuarioNome,

          usuarioId,
          usuarioNome,
        ]
      );

      return {
        success: true,
        id: Number(result.insertId),
        funcionarioNome: funcionario.nome,
      };
    }),

  assumir: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      await ensureRhRescisoesTable();
      assertGestao(ctx);
      const pool = getPoolRescisoes();

      const usuarioId = Number(ctx.user?.id || 0) || null;
      const usuarioNome = String(ctx.user?.name || ctx.user?.email || "Líder RH");

      const [result] = await pool.query<any>(
        `UPDATE rh_rescisoes_processos
            SET status = 'em_andamento',
                recebidoRhPorUsuarioId = ?,
                recebidoRhPorNome = ?,
                recebidoRhEm = NOW()
          WHERE id = ?
            AND status = 'aguardando_rh'`,
        [usuarioId, usuarioNome, input.id]
      );

      if (!Number(result?.affectedRows || 0)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Este pedido já foi recebido ou não está mais aguardando o RH.",
        });
      }

      return { success: true };
    }),

  anexarDocumentoOperacional: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        tipo: z.enum([
          "cartao_ponto",
          "ficha_demissional",
          "rescisao_contabilidade",
        ]),
        lojaIdTeste: z.number().int().positive().optional(),
        arquivoNome: z.string().trim().min(1).max(255),
        arquivoMime: z.string().trim().min(1).max(120),
        arquivoTamanho: z.number().int().positive().max(TAMANHO_MAXIMO),
        arquivoBase64: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await ensureRhRescisoesTable();
      const perfil = assertCaixa(ctx, input.lojaIdTeste);
      const pool = getPoolRescisoes();
      const processo = await buscarProcessoDaLoja(
        pool,
        input.id,
        perfil.lojaIdOperacao
      );

      if (["cancelada", "concluida"].includes(String(processo.status))) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Este processo não aceita novos documentos.",
        });
      }

      if (
        input.tipo === "rescisao_contabilidade" &&
        !Boolean(Number(processo.portalContabilidadeEnviado || 0))
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Confirme primeiro que os documentos foram enviados ao portal da contabilidade.",
        });
      }

      validarMime(input.arquivoMime);
      const arquivo = bufferArquivo(input.arquivoBase64);
      const hash = createHash("sha256").update(arquivo).digest("hex");
      const usuarioId = Number(ctx.user?.id || 0) || null;
      const usuarioNome = String(ctx.user?.name || ctx.user?.email || "Caixa Líder");
      const campos = camposDocumento(input.tipo);

      const prefixo = campos.prefixo;
      const nome = nomeArquivoSeguro(input.arquivoNome || campos.nomePadrao);

      const resetFinal =
        input.tipo === "rescisao_contabilidade"
          ? `,
                rescisaoConferida = 0,
                rescisaoConferidaPorUsuarioId = NULL,
                rescisaoConferidaPorNome = NULL,
                rescisaoConferidaEm = NULL,
                contasPagarLancado = 0,
                contasPagarPorUsuarioId = NULL,
                contasPagarPorNome = NULL,
                contasPagarLancadoEm = NULL,
                operacionalConcluidoEm = NULL`
          : "";

      await pool.query(
        `UPDATE rh_rescisoes_processos
            SET ${prefixo}Nome = ?,
                ${prefixo}Mime = ?,
                ${prefixo}Tamanho = ?,
                ${prefixo}Hash = ?,
                ${prefixo}Conteudo = ?,
                ${prefixo}PorUsuarioId = ?,
                ${prefixo}PorNome = ?,
                ${prefixo}${input.tipo === "cartao_ponto" ? "AnexadoEm" : "AnexadaEm"} = NOW()
                ${resetFinal}
          WHERE id = ?
            AND lojaId = ?`,
        [
          nome,
          input.arquivoMime,
          arquivo.length,
          hash,
          arquivo,
          usuarioId,
          usuarioNome,
          input.id,
          perfil.lojaIdOperacao,
        ]
      );

      return {
        success: true,
        tipo: input.tipo,
        label: campos.label,
      };
    }),

  marcarPortalContabilidade: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        lojaIdTeste: z.number().int().positive().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await ensureRhRescisoesTable();
      const perfil = assertCaixa(ctx, input.lojaIdTeste);
      const pool = getPoolRescisoes();
      const processo = await buscarProcessoDaLoja(
        pool,
        input.id,
        perfil.lojaIdOperacao
      );

      if (!processo.cartaoPontoNome || !processo.fichaDemissionalNome) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Anexe o cartão-ponto e a ficha demissional antes de confirmar o envio à contabilidade.",
        });
      }

      const usuarioId = Number(ctx.user?.id || 0) || null;
      const usuarioNome = String(ctx.user?.name || ctx.user?.email || "Caixa Líder");

      await pool.query(
        `UPDATE rh_rescisoes_processos
            SET portalContabilidadeEnviado = 1,
                portalContabilidadePorUsuarioId = ?,
                portalContabilidadePorNome = ?,
                portalContabilidadeEnviadoEm = NOW()
          WHERE id = ?
            AND lojaId = ?`,
        [usuarioId, usuarioNome, input.id, perfil.lojaIdOperacao]
      );

      return { success: true };
    }),

  marcarRescisaoConferida: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        lojaIdTeste: z.number().int().positive().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await ensureRhRescisoesTable();
      const perfil = assertCaixa(ctx, input.lojaIdTeste);
      const pool = getPoolRescisoes();
      const processo = await buscarProcessoDaLoja(
        pool,
        input.id,
        perfil.lojaIdOperacao
      );

      if (!processo.rescisaoNome) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Anexe primeiro a rescisão enviada pela contabilidade.",
        });
      }

      const usuarioId = Number(ctx.user?.id || 0) || null;
      const usuarioNome = String(ctx.user?.name || ctx.user?.email || "Caixa Líder");

      await pool.query(
        `UPDATE rh_rescisoes_processos
            SET rescisaoConferida = 1,
                rescisaoConferidaPorUsuarioId = ?,
                rescisaoConferidaPorNome = ?,
                rescisaoConferidaEm = NOW()
          WHERE id = ?
            AND lojaId = ?`,
        [usuarioId, usuarioNome, input.id, perfil.lojaIdOperacao]
      );

      return { success: true };
    }),

  marcarContasPagar: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        lojaIdTeste: z.number().int().positive().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await ensureRhRescisoesTable();
      const perfil = assertCaixa(ctx, input.lojaIdTeste);
      const pool = getPoolRescisoes();
      const processo = await buscarProcessoDaLoja(
        pool,
        input.id,
        perfil.lojaIdOperacao
      );

      if (!processo.rescisaoNome) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Anexe primeiro a rescisão enviada pela contabilidade.",
        });
      }

      if (!Boolean(Number(processo.rescisaoConferida || 0))) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Confirme primeiro que a rescisão foi conferida e está tudo OK.",
        });
      }

      const usuarioId = Number(ctx.user?.id || 0) || null;
      const usuarioNome = String(ctx.user?.name || ctx.user?.email || "Caixa Líder");

      await pool.query(
        `UPDATE rh_rescisoes_processos
            SET contasPagarLancado = 1,
                contasPagarPorUsuarioId = ?,
                contasPagarPorNome = ?,
                contasPagarLancadoEm = NOW(),
                operacionalConcluidoEm = NOW()
          WHERE id = ?
            AND lojaId = ?`,
        [usuarioId, usuarioNome, input.id, perfil.lojaIdOperacao]
      );

      return { success: true };
    }),

  baixarDocumento: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        tipo: z.enum([
          "carta",
          "cartao_ponto",
          "ficha_demissional",
          "rescisao_contabilidade",
        ]),
      })
    )
    .query(async ({ input, ctx }) => {
      await ensureRhRescisoesTable();
      const perfil = perfilRh(ctx);

      if (!perfil.liderRh && !perfil.adminOuGestor && !perfil.caixaLider) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Acesso negado ao documento.",
        });
      }

      const mapa = {
        carta: {
          nome: "cartaNome",
          mime: "cartaMime",
          conteudo: "cartaConteudo",
        },
        cartao_ponto: {
          nome: "cartaoPontoNome",
          mime: "cartaoPontoMime",
          conteudo: "cartaoPontoConteudo",
        },
        ficha_demissional: {
          nome: "fichaDemissionalNome",
          mime: "fichaDemissionalMime",
          conteudo: "fichaDemissionalConteudo",
        },
        rescisao_contabilidade: {
          nome: "rescisaoNome",
          mime: "rescisaoMime",
          conteudo: "rescisaoConteudo",
        },
      } as const;

      const campos = mapa[input.tipo];
      const pool = getPoolRescisoes();

      const [rows] = await pool.query<any[]>(
        `SELECT lojaId,
                ${campos.nome} AS arquivoNome,
                ${campos.mime} AS arquivoMime,
                ${campos.conteudo} AS arquivoConteudo
           FROM rh_rescisoes_processos
          WHERE id = ?
          LIMIT 1`,
        [input.id]
      );

      const processo = rows?.[0];

      if (!processo || !processo.arquivoConteudo || !processo.arquivoNome) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Documento não encontrado.",
        });
      }

      if (
        perfil.caixaLider &&
        Number(processo.lojaId) !== Number(perfil.lojaId)
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "A Caixa Líder só pode acessar documentos da própria loja.",
        });
      }

      const conteudo = Buffer.isBuffer(processo.arquivoConteudo)
        ? processo.arquivoConteudo
        : Buffer.from(processo.arquivoConteudo);

      return {
        nome: processo.arquivoNome,
        mime: processo.arquivoMime || "application/octet-stream",
        arquivoBase64: conteudo.toString("base64"),
      };
    }),

  excluir: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      await ensureRhRescisoesTable();

      const perfil = perfilRh(ctx);

      if (!perfil.liderRh && perfil.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Somente a Líder de RH ou o Administrador podem excluir uma rescisão.",
        });
      }

      const pool = getPoolRescisoes();

      const [rows] = await pool.query<any[]>(
        `SELECT r.id,
                f.nome AS funcionarioNome
           FROM rh_rescisoes_processos r
           INNER JOIN funcionarios f ON f.id = r.funcionarioId
          WHERE r.id = ?
          LIMIT 1`,
        [input.id]
      );

      const processo = rows?.[0];

      if (!processo) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Processo de rescisão não encontrado.",
        });
      }

      const [result] = await pool.query<any>(
        `DELETE FROM rh_rescisoes_processos
          WHERE id = ?`,
        [input.id]
      );

      if (!Number(result?.affectedRows || 0)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Não foi possível excluir o processo.",
        });
      }

      return {
        success: true,
        funcionarioNome: processo.funcionarioNome,
      };
    }),

  baixarCarta: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      await ensureRhRescisoesTable();
      const perfil = perfilRh(ctx);

      if (!perfil.liderRh && !perfil.adminOuGestor && !perfil.caixaLider) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Acesso negado ao documento.",
        });
      }

      const pool = getPoolRescisoes();
      const [rows] = await pool.query<any[]>(
        `SELECT lojaId, cartaNome, cartaMime, cartaConteudo
           FROM rh_rescisoes_processos
          WHERE id = ?
          LIMIT 1`,
        [input.id]
      );

      const processo = rows?.[0];

      if (!processo || !processo.cartaConteudo || !processo.cartaNome) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Carta de demissão não encontrada.",
        });
      }

      if (
        perfil.caixaLider &&
        Number(processo.lojaId) !== Number(perfil.lojaId)
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "A Caixa Líder só pode acessar documentos da própria loja.",
        });
      }

      const conteudo = Buffer.isBuffer(processo.cartaConteudo)
        ? processo.cartaConteudo
        : Buffer.from(processo.cartaConteudo);

      return {
        nome: processo.cartaNome,
        mime: processo.cartaMime || "application/octet-stream",
        arquivoBase64: conteudo.toString("base64"),
      };
    }),
});
