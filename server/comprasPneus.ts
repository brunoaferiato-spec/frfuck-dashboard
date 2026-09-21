import mysql from "mysql2/promise";
import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";

const TAMANHO_MAXIMO = 8 * 1024 * 1024;
const MIME_XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

let poolComprasPneus: mysql.Pool | null = null;
let estruturaComprasPneusPronta = false;


const SITES_PROMOCIONAIS: Record<number, string> = {
  1: "https://joinville.impactoprime.com.br/",
  2: "https://blumenau.impactoprime.com.br/",
  3: "https://saojose.impactoprime.com.br/",
  4: "https://florianopolis.impactoprime.com.br/",
  6: "https://saoleopoldo.impactoprime.com.br/",
  7: "https://gravatai.impactoprime.com.br/",
};

const NOMES_LOJAS_PROMOCIONAIS: Record<number, string> = {
  1: "Joinville",
  2: "Blumenau",
  3: "São José",
  4: "Florianópolis",
  6: "São Leopoldo",
  7: "Gravataí",
};

const PROMOCIONAIS_INICIAIS: Array<{
  lojaId: number;
  medida: string;
  custoInicial: number;
  precoAnuncio: number;
}> = [
  { lojaId: 1, medida: "175/60/13", custoInicial: 179.24, precoAnuncio: 179.9 },
  { lojaId: 1, medida: "185/60/14", custoInicial: 189.8, precoAnuncio: 189.9 },
  { lojaId: 1, medida: "185/60/15", custoInicial: 209, precoAnuncio: 199.9 },
  { lojaId: 1, medida: "205/55/16", custoInicial: 239, precoAnuncio: 229.9 },
  { lojaId: 1, medida: "205/55/17", custoInicial: 305, precoAnuncio: 299.9 },
  { lojaId: 1, medida: "175/75/13", custoInicial: 205.9, precoAnuncio: 199.9 },
  { lojaId: 1, medida: "175/65/14", custoInicial: 227.98, precoAnuncio: 219.9 },
  { lojaId: 1, medida: "195/55/15", custoInicial: 218, precoAnuncio: 219.9 },
  { lojaId: 2, medida: "175/60/13", custoInicial: 179.24, precoAnuncio: 179.9 },
  { lojaId: 2, medida: "185/60/14", custoInicial: 189.8, precoAnuncio: 189.9 },
  { lojaId: 2, medida: "185/60/15", custoInicial: 209, precoAnuncio: 199.9 },
  { lojaId: 2, medida: "205/55/16", custoInicial: 239, precoAnuncio: 229.9 },
  { lojaId: 2, medida: "205/55/17", custoInicial: 279, precoAnuncio: 299.9 },
  { lojaId: 2, medida: "175/75/13", custoInicial: 205.9, precoAnuncio: 199.9 },
  { lojaId: 2, medida: "175/65/14", custoInicial: 227.98, precoAnuncio: 219.9 },
  { lojaId: 2, medida: "195/55/15", custoInicial: 245, precoAnuncio: 219.9 },
  { lojaId: 3, medida: "175/60/13", custoInicial: 179.24, precoAnuncio: 169.9 },
  { lojaId: 3, medida: "185/60/14", custoInicial: 189.9, precoAnuncio: 179.9 },
  { lojaId: 3, medida: "185/60/15", custoInicial: 209, precoAnuncio: 199.9 },
  { lojaId: 3, medida: "205/55/16", custoInicial: 239, precoAnuncio: 239.9 },
  { lojaId: 3, medida: "205/55/17", custoInicial: 309, precoAnuncio: 299.9 },
  { lojaId: 3, medida: "175/75/13", custoInicial: 205.9, precoAnuncio: 199.9 },
  { lojaId: 3, medida: "175/65/14", custoInicial: 227.98, precoAnuncio: 219.9 },
  { lojaId: 3, medida: "195/55/15", custoInicial: 218, precoAnuncio: 219.9 },
  { lojaId: 3, medida: "215/65/16", custoInicial: 317, precoAnuncio: 319.9 },
  { lojaId: 3, medida: "235/60/16", custoInicial: 339, precoAnuncio: 339.9 },
  { lojaId: 3, medida: "215/55/17", custoInicial: 333.204, precoAnuncio: 329.9 },
  { lojaId: 3, medida: "215/60/17", custoInicial: 354.25, precoAnuncio: 349.9 },
  { lojaId: 3, medida: "225/55/18", custoInicial: 365, precoAnuncio: 369.9 },
  { lojaId: 4, medida: "175/60/13", custoInicial: 179.24, precoAnuncio: 169.9 },
  { lojaId: 4, medida: "185/60/14", custoInicial: 189.8, precoAnuncio: 179.9 },
  { lojaId: 4, medida: "185/60/15", custoInicial: 209, precoAnuncio: 199.9 },
  { lojaId: 4, medida: "205/55/16", custoInicial: 263.79, precoAnuncio: 239.9 },
  { lojaId: 4, medida: "205/55/17", custoInicial: 309, precoAnuncio: 299.9 },
  { lojaId: 4, medida: "175/75/13", custoInicial: 205.9, precoAnuncio: 199.9 },
  { lojaId: 4, medida: "175/65/14", custoInicial: 227.98, precoAnuncio: 219.9 },
  { lojaId: 4, medida: "195/55/15", custoInicial: 218, precoAnuncio: 219.9 },
  { lojaId: 4, medida: "215/65/16", custoInicial: 317, precoAnuncio: 319.9 },
  { lojaId: 4, medida: "235/60/16", custoInicial: 339, precoAnuncio: 339.9 },
  { lojaId: 4, medida: "215/55/17", custoInicial: 333.2, precoAnuncio: 329.9 },
  { lojaId: 4, medida: "215/60/17", custoInicial: 354.25, precoAnuncio: 349.9 },
  { lojaId: 4, medida: "225/55/18", custoInicial: 375, precoAnuncio: 369.9 },
  { lojaId: 7, medida: "175/60/13", custoInicial: 184.9, precoAnuncio: 169.9 },
  { lojaId: 7, medida: "185/60/14", custoInicial: 204.9, precoAnuncio: 189.9 },
  { lojaId: 7, medida: "185/60/15", custoInicial: 219.9, precoAnuncio: 219.9 },
  { lojaId: 7, medida: "205/55/16", custoInicial: 247.9, precoAnuncio: 249.9 },
  { lojaId: 7, medida: "205/55/17", custoInicial: 322.9, precoAnuncio: 299.9 },
  { lojaId: 7, medida: "175/75/13", custoInicial: 199.9, precoAnuncio: 199.9 },
  { lojaId: 7, medida: "175/65/14", custoInicial: 239.9, precoAnuncio: 219.9 },
  { lojaId: 7, medida: "195/55/15", custoInicial: 234.9, precoAnuncio: 229.9 },
  { lojaId: 6, medida: "175/60/13", custoInicial: 184.9, precoAnuncio: 169.9 },
  { lojaId: 6, medida: "185/60/14", custoInicial: 204.9, precoAnuncio: 189.9 },
  { lojaId: 6, medida: "185/60/15", custoInicial: 219.9, precoAnuncio: 219.9 },
  { lojaId: 6, medida: "205/55/16", custoInicial: 247.9, precoAnuncio: 249.9 },
  { lojaId: 6, medida: "205/55/17", custoInicial: 321.9, precoAnuncio: 299.9 },
  { lojaId: 6, medida: "175/75/13", custoInicial: 199.9, precoAnuncio: 199.9 },
  { lojaId: 6, medida: "175/65/14", custoInicial: 239.9, precoAnuncio: 219.9 },
  { lojaId: 6, medida: "195/55/15", custoInicial: 234.9, precoAnuncio: 229.9 },
];

const PROMOCIONAIS_PADRAO: Record<number, string[]> = {
  1: [
    "175/60/13",
    "185/60/14",
    "185/60/15",
    "205/55/16",
    "205/55/17",
    "175/75/13",
    "175/65/14",
    "195/55/15",
  ],
  2: [
    "175/60/13",
    "185/60/14",
    "185/60/15",
    "205/55/16",
    "205/55/17",
    "175/75/13",
    "175/65/14",
    "195/55/15",
  ],
  3: [
    "175/60/13",
    "185/60/14",
    "185/60/15",
    "205/55/16",
    "205/55/17",
    "175/75/13",
    "175/65/14",
    "195/55/15",
    "215/65/16",
    "235/60/16",
    "215/55/17",
    "215/60/17",
    "225/55/18",
  ],
  4: [
    "175/60/13",
    "185/60/14",
    "185/60/15",
    "205/55/16",
    "205/55/17",
    "175/75/13",
    "175/65/14",
    "195/55/15",
    "215/65/16",
    "235/60/16",
    "215/55/17",
    "215/60/17",
    "225/55/18",
  ],
};

const JOGOS_MINIMOS_2_PADRAO: Record<number, string[]> = {
  1: [
    "175/60/13",
    "185/60/14",
    "185/60/15",
    "205/55/16",
    "205/55/17",
    "175/75/13",
    "175/65/14",
    "195/55/15",
  ],
  2: [
    "175/60/13",
    "185/60/14",
    "185/60/15",
    "205/55/16",
    "205/55/17",
    "175/75/13",
    "175/65/14",
    "195/55/15",
  ],
  3: [
    "175/60/13",
    "185/60/14",
    "185/60/15",
    "205/55/16",
    "205/55/17",
    "175/75/13",
    "175/65/14",
    "195/55/15",
    "215/65/16",
    "235/60/16",
    "215/55/17",
    "215/60/17",
    "225/55/18",
  ],
  4: [
    "175/60/13",
    "185/60/14",
    "185/60/15",
    "205/55/16",
    "205/55/17",
    "175/75/13",
    "175/65/14",
    "195/55/15",
    "215/65/16",
    "235/60/16",
    "215/55/17",
    "215/60/17",
    "225/55/18",
  ],
  7: [
    "175/60/13",
    "185/60/14",
    "185/60/15",
    "205/55/16",
    "205/55/17",
    "175/75/13",
    "175/65/14",
    "195/55/15",
  ],
  6: [
    "175/60/13",
    "185/60/14",
    "185/60/15",
    "205/55/16",
    "205/55/17",
    "175/75/13",
    "175/65/14",
    "195/55/15",
  ],
};

const JOGOS_MINIMOS_2_CORRETOS = [
  "175/70/13",
  "175/70/14",
  "185/65/14",
  "185/70/14",
  "175/75/14",
  "185/65/15",
  "195/60/15",
  "195/65/15",
  "195/55/16",
  "205/60/16",
  "215/65/16",
  "235/60/16",
  "215/50/17",
  "225/65/17",
  "225/55/18",
] as const;

const JOGOS_MINIMOS_2_V54_ERRADOS = [
  "175/60/13",
  "185/60/14",
  "185/60/15",
  "205/55/16",
  "205/55/17",
  "175/75/13",
  "175/65/14",
  "195/55/15",
  "215/65/16",
  "235/60/16",
  "215/55/17",
  "215/60/17",
  "225/55/18",
] as const;

const LOJAS_JOGOS_MINIMOS = [1, 2, 3, 4, 6, 7] as const;

const MARCAS_NACIONAIS_AUTOMATICAS = [
  "PIRELLI",
  "GOODYEAR",
  "BRIDGESTONE",
  "FIRESTONE",
  "CONTINENTAL",
  "MICHELIN",
  "FATE",
  "AGATE",
] as const;

function getPoolComprasPneus() {
  if (!process.env.DATABASE_URL) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Banco de dados não configurado.",
    });
  }

  if (!poolComprasPneus) {
    poolComprasPneus = mysql.createPool({
      uri: process.env.DATABASE_URL,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
    });
  }

  return poolComprasPneus;
}

function perfilCompras(ctx: any) {
  const role = String(ctx.user?.role || "");
  return {
    role,
    autorizado: ["compras", "admin", "gestor"].includes(role),
  };
}

function assertCompras(ctx: any) {
  const perfil = perfilCompras(ctx);
  if (!perfil.autorizado) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Usuário sem acesso ao módulo de Compras.",
    });
  }
  return perfil;
}

async function ensureComprasPneus() {
  if (estruturaComprasPneusPronta) return;
  const pool = getPoolComprasPneus();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS compras_pneus_migracoes (
      chave VARCHAR(120) NOT NULL,
      appliedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (chave)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS compras_pneus_fornecedores (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      nome VARCHAR(160) NOT NULL,
      ativo TINYINT(1) NOT NULL DEFAULT 1,
      criadoPorUsuarioId INT NULL,
      criadoPorNome VARCHAR(255) NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_compras_pneus_fornecedor_nome (nome)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS compras_pneus_regras (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      lojaId INT NOT NULL,
      medida VARCHAR(40) NOT NULL,
      promocional TINYINT(1) NOT NULL DEFAULT 0,
      jogosMinimos INT UNSIGNED NOT NULL DEFAULT 0,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_compras_pneus_regra_loja_medida (lojaId, medida),
      KEY idx_compras_pneus_regra_loja (lojaId)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS compras_pneus_marcas_excluidas (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      marca VARCHAR(100) NOT NULL,
      ativo TINYINT(1) NOT NULL DEFAULT 1,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_compras_pneus_marca_excluida (marca)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);


  await pool.query(`
    CREATE TABLE IF NOT EXISTS compras_pneus_promocionais (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      lojaId INT NOT NULL,
      medida VARCHAR(40) NOT NULL,
      custoInicial DECIMAL(12,3) NULL,
      precoAnuncio DECIMAL(12,2) NOT NULL,
      siteUrl VARCHAR(255) NOT NULL,
      origemPreco VARCHAR(30) NOT NULL DEFAULT 'base_inicial',
      ultimaConferenciaSite TIMESTAMP NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_compras_pneus_promocional_loja_medida (lojaId, medida),
      KEY idx_compras_pneus_promocional_loja (lojaId)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  try {
    await pool.query(
      `ALTER TABLE compras_pneus_promocionais
       ADD COLUMN custoInicial DECIMAL(12,3) NULL AFTER medida`
    );
  } catch (error: any) {
    if (String(error?.code || "") !== "ER_DUP_FIELDNAME") throw error;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS compras_pneus_promocionais_historico (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      promocionalId INT UNSIGNED NOT NULL,
      precoAnterior DECIMAL(12,2) NULL,
      precoNovo DECIMAL(12,2) NOT NULL,
      origem VARCHAR(30) NOT NULL,
      usuarioId INT NULL,
      usuarioNome VARCHAR(255) NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_compras_pneus_promocional_hist_promocional (promocionalId)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS compras_pneus_planejamentos (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      lojaId INT NOT NULL,
      diasAnalise INT UNSIGNED NOT NULL,
      diasProjecao INT UNSIGNED NOT NULL,
      arquivoVendasNome VARCHAR(255) NULL,
      arquivoEstoqueNome VARCHAR(255) NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'planejamento',
      criadoPorUsuarioId INT NULL,
      criadoPorNome VARCHAR(255) NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_compras_pneus_planejamento_loja (lojaId),
      KEY idx_compras_pneus_planejamento_status (status)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  try {
    await pool.query(
      `ALTER TABLE compras_pneus_planejamentos
       ADD COLUMN chaveAnalise VARCHAR(64) NULL AFTER arquivoEstoqueNome`
    );
  } catch (error: any) {
    if (String(error?.code || "") !== "ER_DUP_FIELDNAME") throw error;
  }

  try {
    await pool.query(
      `ALTER TABLE compras_pneus_planejamentos
       ADD UNIQUE KEY uq_compras_pneus_chave_analise (chaveAnalise)`
    );
  } catch (error: any) {
    if (String(error?.code || "") !== "ER_DUP_KEYNAME") throw error;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS compras_pneus_itens (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      planejamentoId INT UNSIGNED NOT NULL,
      medida VARCHAR(40) NOT NULL,
      melhorPrecoUf DECIMAL(12,4) NULL,
      vendas INT NOT NULL DEFAULT 0,
      estoque INT NOT NULL DEFAULT 0,
      projecao DECIMAL(12,4) NOT NULL DEFAULT 0,
      promocional TINYINT(1) NOT NULL DEFAULT 0,
      adicionalPromocional INT NOT NULL DEFAULT 0,
      jogosValidos INT NOT NULL DEFAULT 0,
      jogosMinimos INT NOT NULL DEFAULT 0,
      necessidade DECIMAL(12,4) NOT NULL DEFAULT 0,
      quantidadeSugerida INT NOT NULL DEFAULT 0,
      quantidadeFinal INT NOT NULL DEFAULT 0,
      fornecedorSelecionadoId INT UNSIGNED NULL,
      precoSelecionado DECIMAL(12,4) NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_compras_pneus_item_planejamento_medida (planejamentoId, medida),
      KEY idx_compras_pneus_item_planejamento (planejamentoId),
      KEY idx_compras_pneus_item_fornecedor (fornecedorSelecionadoId)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS compras_pneus_cotacoes (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      itemId INT UNSIGNED NOT NULL,
      fornecedorId INT UNSIGNED NOT NULL,
      valor DECIMAL(12,4) NOT NULL,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_compras_pneus_cotacao_item_fornecedor (itemId, fornecedorId),
      KEY idx_compras_pneus_cotacao_item (itemId),
      KEY idx_compras_pneus_cotacao_fornecedor (fornecedorId)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS compras_pneus_pedidos (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      planejamentoId INT UNSIGNED NOT NULL,
      fornecedorId INT UNSIGNED NOT NULL,
      fornecedorNome VARCHAR(160) NOT NULL,
      totalPneus INT NOT NULL DEFAULT 0,
      totalValor DECIMAL(14,2) NOT NULL DEFAULT 0,
      criadoPorUsuarioId INT NULL,
      criadoPorNome VARCHAR(255) NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_compras_pneus_pedido_planejamento (planejamentoId),
      KEY idx_compras_pneus_pedido_fornecedor (fornecedorId)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS compras_pneus_pedido_itens (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      pedidoId INT UNSIGNED NOT NULL,
      itemOriginalId INT UNSIGNED NULL,
      medida VARCHAR(40) NOT NULL,
      quantidade INT NOT NULL DEFAULT 0,
      valorUnitario DECIMAL(12,4) NOT NULL DEFAULT 0,
      total DECIMAL(14,2) NOT NULL DEFAULT 0,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_compras_pneus_pedido_item_pedido (pedidoId)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  for (const [lojaIdTexto, medidas] of Object.entries(PROMOCIONAIS_PADRAO)) {
    const lojaId = Number(lojaIdTexto);
    for (const medida of medidas) {
      await pool.query(
        `INSERT IGNORE INTO compras_pneus_regras (lojaId, medida, promocional, jogosMinimos)
         VALUES (?, ?, 1, 0)`,
        [lojaId, medida]
      );
    }
  }


  for (const item of PROMOCIONAIS_INICIAIS) {
    await pool.query(
      `INSERT INTO compras_pneus_promocionais
         (lojaId, medida, custoInicial, precoAnuncio, siteUrl, origemPreco, ultimaConferenciaSite)
       VALUES (?, ?, ?, ?, ?, 'site_inicial', CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE
         custoInicial = VALUES(custoInicial),
         siteUrl = VALUES(siteUrl),
         precoAnuncio = CASE
           WHEN origemPreco IN ('base_inicial', 'site_inicial')
             THEN VALUES(precoAnuncio)
           ELSE precoAnuncio
         END,
         ultimaConferenciaSite = CASE
           WHEN origemPreco IN ('base_inicial', 'site_inicial')
             THEN CURRENT_TIMESTAMP
           ELSE ultimaConferenciaSite
         END,
         origemPreco = CASE
           WHEN origemPreco IN ('base_inicial', 'site_inicial')
             THEN 'site_inicial'
           ELSE origemPreco
         END`,
      [
        item.lojaId,
        item.medida,
        item.custoInicial,
        item.precoAnuncio,
        SITES_PROMOCIONAIS[item.lojaId],
      ]
    );
  }

  const CHAVE_JOGOS_MINIMOS_2 = "jogos_minimos_2_v1";

  const [migracaoJogosRows] = await pool.query<any[]>(
    `SELECT chave
     FROM compras_pneus_migracoes
     WHERE chave = ?
     LIMIT 1`,
    [CHAVE_JOGOS_MINIMOS_2]
  );

  if (!migracaoJogosRows.length) {
    const conexao = await pool.getConnection();

    try {
      await conexao.beginTransaction();

      for (const [lojaIdTexto, medidas] of Object.entries(
        JOGOS_MINIMOS_2_PADRAO
      )) {
        const lojaId = Number(lojaIdTexto);

        for (const medida of medidas) {
          await conexao.query(
            `INSERT INTO compras_pneus_regras
               (lojaId, medida, promocional, jogosMinimos)
             VALUES (?, ?, 1, 2)
             ON DUPLICATE KEY UPDATE
               jogosMinimos = 2`,
            [lojaId, medida]
          );
        }
      }

      await conexao.query(
        `INSERT INTO compras_pneus_migracoes (chave)
         VALUES (?)`,
        [CHAVE_JOGOS_MINIMOS_2]
      );

      await conexao.commit();
    } catch (error) {
      await conexao.rollback();
      throw error;
    } finally {
      conexao.release();
    }
  }

  const CHAVE_JOGOS_MINIMOS_2_CORRECAO = "jogos_minimos_2_v2_corrigido";

  const [migracaoJogosCorrecaoRows] = await pool.query<any[]>(
    `SELECT chave
     FROM compras_pneus_migracoes
     WHERE chave = ?
     LIMIT 1`,
    [CHAVE_JOGOS_MINIMOS_2_CORRECAO]
  );

  if (!migracaoJogosCorrecaoRows.length) {
    const conexao = await pool.getConnection();

    try {
      await conexao.beginTransaction();

      const medidasCorretas = new Set<string>(JOGOS_MINIMOS_2_CORRETOS);

      for (const lojaId of LOJAS_JOGOS_MINIMOS) {
        for (const medida of JOGOS_MINIMOS_2_V54_ERRADOS) {
          if (medidasCorretas.has(medida)) continue;

          await conexao.query(
            `UPDATE compras_pneus_regras
             SET jogosMinimos = 0
             WHERE lojaId = ?
               AND medida = ?
               AND jogosMinimos = 2`,
            [lojaId, medida]
          );
        }

        for (const medida of JOGOS_MINIMOS_2_CORRETOS) {
          await conexao.query(
            `INSERT INTO compras_pneus_regras
               (lojaId, medida, promocional, jogosMinimos)
             VALUES (?, ?, 0, 2)
             ON DUPLICATE KEY UPDATE
               jogosMinimos = 2`,
            [lojaId, medida]
          );
        }
      }

      await conexao.query(
        `INSERT INTO compras_pneus_migracoes (chave)
         VALUES (?)`,
        [CHAVE_JOGOS_MINIMOS_2_CORRECAO]
      );

      await conexao.commit();
    } catch (error) {
      await conexao.rollback();
      throw error;
    } finally {
      conexao.release();
    }
  }

  estruturaComprasPneusPronta = true;
}

function normalizarTexto(valor: unknown) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function normalizarMedida(valor: unknown) {
  return String(valor ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/R/gi, "");
}

const LOJAS_RELATORIO = [
  { id: 1, nome: "Joinville", marcador: "F. JOINVILLE" },
  { id: 2, nome: "Blumenau", marcador: "F. BLUMENAU" },
  { id: 3, nome: "São José", marcador: "F. SAO JOSE" },
  { id: 4, nome: "Florianópolis", marcador: "F. FLORIANOPOLIS" },
  { id: 5, nome: "ACI Promoções", marcador: "ACI PROMOCOES" },
  { id: 6, nome: "São Leopoldo", marcador: "F. SAO LEOPOLDO" },
  { id: 7, nome: "Gravataí", marcador: "F. GRAVATAI" },
] as const;

function lojaPorTextoRelatorio(texto: string) {
  const normalizado = normalizarTexto(texto);
  return (
    LOJAS_RELATORIO.find((loja) => normalizado.includes(loja.marcador)) || null
  );
}

function detectarLojaRelatorio(linhas: any[][]) {
  const primeiras = linhas.slice(0, 12);

  for (const linha of primeiras) {
    const normalizada = (linha || []).map(normalizarTexto);
    const temCabecalhoLoja = normalizada.some((valor) => valor === "LOJA");

    if (temCabecalhoLoja) {
      for (const celula of linha || []) {
        const loja = lojaPorTextoRelatorio(String(celula ?? ""));
        if (loja) return loja;
      }
    }
  }

  for (const linha of primeiras.slice(0, 5)) {
    for (const celula of linha || []) {
      const texto = String(celula ?? "");
      const normalizado = normalizarTexto(texto);

      if (normalizado.includes("ESTOQUE DE ITENS")) {
        const loja = lojaPorTextoRelatorio(texto);
        if (loja) return loja;
      }
    }
  }

  return null;
}

function validarLojaDosRelatorios(
  lojaIdSelecionada: number,
  linhasVendas: any[][],
  linhasEstoque: any[][]
) {
  const lojaEsperada =
    LOJAS_RELATORIO.find((loja) => loja.id === lojaIdSelecionada) || null;
  const lojaVendas = detectarLojaRelatorio(linhasVendas);
  const lojaEstoque = detectarLojaRelatorio(linhasEstoque);

  if (!lojaEsperada) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Loja selecionada não reconhecida pelo Compras.",
    });
  }

  if (!lojaVendas) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Não consegui identificar a loja no relatório de vendas/estoque. Confirme se o arquivo correto foi selecionado.",
    });
  }

  if (!lojaEstoque) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Não consegui identificar a loja no relatório detalhado por marca. Confirme se o arquivo correto foi selecionado.",
    });
  }

  if (lojaVendas.id !== lojaEstoque.id) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Os dois relatórios são de lojas diferentes: ${lojaVendas.nome} e ${lojaEstoque.nome}.`,
    });
  }

  if (lojaVendas.id !== lojaEsperada.id) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `A loja selecionada é ${lojaEsperada.nome}, mas os relatórios pertencem a ${lojaVendas.nome}. Troque a loja ou envie os arquivos corretos.`,
    });
  }

  return lojaVendas;
}

function numero(valor: unknown): number {
  if (typeof valor === "number" && Number.isFinite(valor)) return valor;
  if (valor === null || valor === undefined) return 0;

  let texto = String(valor).trim();
  if (!texto || texto === "-") return 0;

  texto = texto.replace(/R\$/gi, "").replace(/\s+/g, "");
  if (/^-?\d{1,3}(\.\d{3})*,\d+$/.test(texto) || /^-?\d+,\d+$/.test(texto)) {
    texto = texto.replace(/\./g, "").replace(",", ".");
  } else {
    texto = texto.replace(/[^0-9.-]/g, "");
  }

  const n = Number(texto);
  return Number.isFinite(n) ? n : 0;
}

function arredondarMultiplo4(valor: number) {
  if (!Number.isFinite(valor) || valor <= 0) return 0;
  return Math.ceil(valor / 4) * 4;
}

function bufferXlsx(base64: string, rotulo: string) {
  const limpo = String(base64 || "").includes(",")
    ? String(base64).split(",").pop() || ""
    : String(base64 || "");

  let buffer: Buffer;
  try {
    buffer = Buffer.from(limpo, "base64");
  } catch {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `${rotulo} inválido.`,
    });
  }

  if (!buffer.length || buffer.length > TAMANHO_MAXIMO) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `${rotulo} deve ter no máximo 8 MB.`,
    });
  }

  return buffer;
}

function lerLinhasXlsx(buffer: Buffer, rotulo: string) {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  } catch {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Não foi possível abrir ${rotulo}. Exporte novamente em .xlsx.`,
    });
  }

  const linhas: any[][] = [];
  for (const abaNome of workbook.SheetNames) {
    const aba = workbook.Sheets[abaNome];
    linhas.push(
      ...XLSX.utils.sheet_to_json<any[]>(aba, {
        header: 1,
        raw: true,
        defval: null,
      })
    );
  }
  return linhas;
}

function localizarCabecalho(linhas: any[][], termos: string[]) {
  for (let i = 0; i < linhas.length; i += 1) {
    const normalizada = (linhas[i] || []).map(normalizarTexto);
    if (termos.every((termo) => normalizada.some((v) => v.includes(termo)))) {
      return { indice: i, normalizada };
    }
  }
  return null;
}

type LinhaVenda = {
  medida: string;
  melhorPrecoUf: number;
  vendas: number;
  estoque: number;
};

function parseRelatorioVendas(buffer: Buffer) {
  const linhas = lerLinhasXlsx(buffer, "o relatório de vendas/estoque");
  const cabecalho = localizarCabecalho(linhas, ["MEDIDA", "VENDAS", "ESTOQ"]);

  if (!cabecalho) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Não encontrei as colunas MEDIDA, VENDAS e ESTOQ. no relatório de 60 dias.",
    });
  }

  const h = cabecalho.normalizada;
  const idxMedida = h.findIndex((v) => v === "MEDIDA" || v.includes("MEDIDA"));
  const idxVendas = h.findIndex((v) => v === "VENDAS" || v.includes("VENDAS"));
  const idxEstoque = h.findIndex((v) => v.includes("ESTOQ"));
  const idxPreco = h.findIndex(
    (v) => v.includes("MELHOR") && v.includes("COMP") && v.includes("UF")
  );
  const idxTipo = h.findIndex((v) => v === "TIPO" || v.includes("TIPO"));

  const resultado: LinhaVenda[] = [];

  for (let i = cabecalho.indice + 1; i < linhas.length; i += 1) {
    const linha = linhas[i] || [];
    const medida = normalizarMedida(linha[idxMedida]);

    if (!/^\d{3}\/\d{2}(\/\d{2})?$/.test(medida)) continue;

    if (idxTipo >= 0) {
      const tipo = normalizarTexto(linha[idxTipo]);
      if (tipo && !tipo.includes("IMPORTADO")) continue;
    }

    resultado.push({
      medida,
      melhorPrecoUf: idxPreco >= 0 ? numero(linha[idxPreco]) : 0,
      vendas: Math.max(0, Math.trunc(numero(linha[idxVendas]))),
      estoque: Math.max(0, Math.trunc(numero(linha[idxEstoque]))),
    });
  }

  if (!resultado.length) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Nenhuma medida de pneu importado foi encontrada no relatório.",
    });
  }

  return resultado;
}

type EstoqueMarca = {
  medida: string;
  marca: string;
  quantidade: number;
};

function parseRelatorioMarcas(buffer: Buffer) {
  const linhas = lerLinhasXlsx(buffer, "o relatório detalhado de estoque");
  const cabecalho = localizarCabecalho(linhas, ["ITEM", "QTD TOTAL"]);

  if (!cabecalho) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Não encontrei as colunas ITEM e QTD TOTAL no relatório detalhado de estoque.",
    });
  }

  const h = cabecalho.normalizada;
  const idxItem = h.findIndex((v) => v === "ITEM" || v.includes("ITEM"));
  const idxQtd = h.findIndex((v) => v.includes("QTD TOTAL"));

  const resultado: EstoqueMarca[] = [];

  for (let i = cabecalho.indice + 1; i < linhas.length; i += 1) {
    const itemOriginal = String((linhas[i] || [])[idxItem] ?? "").trim();
    if (!itemOriginal) continue;

    const item = normalizarTexto(itemOriginal);
    const match = item.match(/\b(\d{3}\/\d{2}(?:\/\d{2})?)\b/);
    if (!match) continue;

    const medida = normalizarMedida(match[1]);
    const depois = item.slice((match.index || 0) + match[0].length).trim();
    const marca = depois.split(/\s+/)[0]?.trim() || "SEM MARCA";
    const quantidade = Math.max(0, Math.trunc(numero((linhas[i] || [])[idxQtd])));

    if (!quantidade) continue;
    resultado.push({ medida, marca, quantidade });
  }

  return resultado;
}

function workbookBase64(
  nomeAba: string,
  linhas: Array<Array<string | number | null>>,
  larguras: number[],
  colunasMoeda: number[] = []
) {
  const ws = XLSX.utils.aoa_to_sheet(linhas);
  ws["!cols"] = larguras.map((wch) => ({ wch }));

  const ref = ws["!ref"];
  if (ref && colunasMoeda.length) {
    const range = XLSX.utils.decode_range(ref);
    for (const coluna of colunasMoeda) {
      for (let linha = 1; linha <= range.e.r; linha += 1) {
        const endereco = XLSX.utils.encode_cell({ r: linha, c: coluna });
        const celula = ws[endereco];
        if (celula && typeof celula.v === "number") {
          celula.z = '"R$" #,##0.00';
        }
      }
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, nomeAba);
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(buffer).toString("base64");
}

async function workbookCotacaoFornecedorBase64(
  fornecedorNome: string,
  itens: Array<{ medida: string; melhorPrecoUf: unknown }>
) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Cotação", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  worksheet.columns = [
    { header: "MEDIDA", key: "medida", width: 18 },
    { header: "MELHOR PREÇO UF", key: "melhorPrecoUf", width: 20 },
    { header: fornecedorNome, key: "fornecedor", width: 22 },
  ];

  for (const item of itens) {
    worksheet.addRow({
      medida: item.medida,
      melhorPrecoUf: Number(item.melhorPrecoUf || 0),
      fornecedor: null,
    });
  }

  worksheet.getColumn(2).numFmt = '"R$" #,##0.00';
  worksheet.getColumn(3).numFmt = '"R$" #,##0.00';

  const cabecalho = worksheet.getRow(1);
  cabecalho.font = { bold: true };

  for (let linha = 1; linha <= worksheet.rowCount; linha += 1) {
    const row = worksheet.getRow(linha);

    row.getCell(1).protection = { locked: true };
    row.getCell(2).protection = { locked: true };
    row.getCell(3).protection = { locked: linha === 1 };

    if (linha > 1) {
      row.getCell(2).numFmt = '"R$" #,##0.00';
      row.getCell(3).numFmt = '"R$" #,##0.00';
    }
  }

  await worksheet.protect("frcompras", {
    selectLockedCells: false,
    selectUnlockedCells: true,
    formatCells: false,
    formatColumns: false,
    formatRows: false,
    insertColumns: false,
    insertRows: false,
    insertHyperlinks: false,
    deleteColumns: false,
    deleteRows: false,
    sort: false,
    autoFilter: false,
    pivotTables: false,
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer as any).toString("base64");
}


async function listarPromocionaisCalculados(lojaId?: number | null) {
  await ensureComprasPneus();
  const pool = getPoolComprasPneus();

  const params: any[] = [];
  let where = "";

  if (lojaId) {
    where = "WHERE pr.lojaId = ?";
    params.push(lojaId);
  }

  const [rows] = await pool.query<any[]>(
    `SELECT
       pr.id,
       pr.lojaId,
       pr.medida,
       pr.custoInicial,
       pr.precoAnuncio,
       pr.siteUrl,
       pr.origemPreco,
       DATE_FORMAT(pr.ultimaConferenciaSite, '%Y-%m-%d %H:%i:%s') AS ultimaConferenciaSite,
       DATE_FORMAT(pr.updatedAt, '%Y-%m-%d %H:%i:%s') AS updatedAt,
       (
         SELECT pi.valorUnitario
         FROM compras_pneus_pedido_itens pi
         JOIN compras_pneus_pedidos pe ON pe.id = pi.pedidoId
         JOIN compras_pneus_planejamentos pl ON pl.id = pe.planejamentoId
         WHERE pl.lojaId = pr.lojaId
           AND pi.medida = pr.medida
         ORDER BY pe.createdAt DESC, pe.id DESC
         LIMIT 1
       ) AS ultimoCusto,
       (
         SELECT pi.quantidade
         FROM compras_pneus_pedido_itens pi
         JOIN compras_pneus_pedidos pe ON pe.id = pi.pedidoId
         JOIN compras_pneus_planejamentos pl ON pl.id = pe.planejamentoId
         WHERE pl.lojaId = pr.lojaId
           AND pi.medida = pr.medida
         ORDER BY pe.createdAt DESC, pe.id DESC
         LIMIT 1
       ) AS quantidadeUltimoPedido,
       (
         SELECT DATE_FORMAT(pe.createdAt, '%Y-%m-%d %H:%i:%s')
         FROM compras_pneus_pedido_itens pi
         JOIN compras_pneus_pedidos pe ON pe.id = pi.pedidoId
         JOIN compras_pneus_planejamentos pl ON pl.id = pe.planejamentoId
         WHERE pl.lojaId = pr.lojaId
           AND pi.medida = pr.medida
         ORDER BY pe.createdAt DESC, pe.id DESC
         LIMIT 1
       ) AS dataUltimoPedido
     FROM compras_pneus_promocionais pr
     ${where}
     ORDER BY pr.lojaId ASC, pr.medida ASC`,
    params
  );

  return rows.map((row) => {
    const precoAnuncio = Number(row.precoAnuncio || 0);

    const custoPedido =
      row.ultimoCusto === null || row.ultimoCusto === undefined
        ? null
        : Number(row.ultimoCusto);

    const custoInicial =
      row.custoInicial === null || row.custoInicial === undefined
        ? null
        : Number(row.custoInicial);

    const ultimoCusto = custoPedido ?? custoInicial;
    const custoOrigem =
      custoPedido !== null
        ? "pedido"
        : custoInicial !== null
        ? "planilha_inicial"
        : null;

    const quantidadeUltimoPedido = Number(row.quantidadeUltimoPedido || 0);

    const custoMeta10 =
      ultimoCusto === null ? null : Number((ultimoCusto * 1.1).toFixed(2));
    const diferencaMeta10 =
      custoMeta10 === null
        ? null
        : Number((precoAnuncio - custoMeta10).toFixed(2));
    const diferencaCusto =
      ultimoCusto === null
        ? null
        : Number((precoAnuncio - ultimoCusto).toFixed(2));
    const margemPercentual =
      ultimoCusto && ultimoCusto > 0
        ? Number((((precoAnuncio / ultimoCusto) - 1) * 100).toFixed(2))
        : null;
    const perdaMeta10Unit =
      custoMeta10 === null
        ? 0
        : Math.max(0, Number((custoMeta10 - precoAnuncio).toFixed(2)));
    const impactoMeta10UltimoPedido = Number(
      (perdaMeta10Unit * quantidadeUltimoPedido).toFixed(2)
    );

    return {
      id: Number(row.id),
      lojaId: Number(row.lojaId),
      lojaNome:
        NOMES_LOJAS_PROMOCIONAIS[Number(row.lojaId)] ||
        `Loja ${row.lojaId}`,
      medida: row.medida,
      precoAnuncio,
      custoInicial,
      custoOrigem,
      siteUrl: row.siteUrl,
      origemPreco: row.origemPreco,
      ultimaConferenciaSite: row.ultimaConferenciaSite,
      updatedAt: row.updatedAt,
      ultimoCusto,
      custoMeta10,
      diferencaMeta10,
      diferencaCusto,
      margemPercentual,
      quantidadeUltimoPedido,
      impactoMeta10UltimoPedido,
      dataUltimoPedido: row.dataUltimoPedido,
    };
  });
}

const itemAnaliseSchema = z.object({
  medida: z.string().min(3).max(40),
  melhorPrecoUf: z.number().nonnegative(),
  vendas: z.number().int().nonnegative(),
  estoque: z.number().int().nonnegative(),
  projecao: z.number().nonnegative(),
  promocional: z.boolean(),
  adicionalPromocional: z.number().int().nonnegative(),
  jogosValidos: z.number().int().nonnegative(),
  jogosMinimos: z.number().int().nonnegative(),
  necessidade: z.number(),
  quantidadeSugerida: z.number().int().nonnegative(),
  quantidadeFinal: z.number().int().nonnegative(),
});

export const comprasPneusRouter = router({
  analisar: protectedProcedure
    .input(
      z.object({
        lojaId: z.number().int().positive(),
        diasAnalise: z.number().int().min(1).max(365),
        diasProjecao: z.number().int().min(1).max(180),
        arquivoVendasNome: z.string().min(1).max(255),
        arquivoVendasBase64: z.string().min(1),
        arquivoEstoqueNome: z.string().min(1).max(255),
        arquivoEstoqueBase64: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertCompras(ctx);
      await ensureComprasPneus();
      const pool = getPoolComprasPneus();

      const bufferVendas = bufferXlsx(
        input.arquivoVendasBase64,
        "O relatório de vendas/estoque"
      );
      const bufferEstoque = bufferXlsx(
        input.arquivoEstoqueBase64,
        "O relatório detalhado de estoque"
      );

      const linhasVendas = lerLinhasXlsx(
        bufferVendas,
        "o relatório de vendas/estoque"
      );
      const linhasEstoque = lerLinhasXlsx(
        bufferEstoque,
        "o relatório detalhado de estoque"
      );

      const lojaRelatorio = validarLojaDosRelatorios(
        input.lojaId,
        linhasVendas,
        linhasEstoque
      );

      const chaveAnalise = createHash("sha256")
        .update(String(input.lojaId))
        .update("|")
        .update(String(input.diasAnalise))
        .update("|")
        .update(String(input.diasProjecao))
        .update("|")
        .update(bufferVendas)
        .update("|")
        .update(bufferEstoque)
        .digest("hex");

      const vendas = parseRelatorioVendas(bufferVendas);
      const estoqueMarcas = parseRelatorioMarcas(bufferEstoque);

      const [regrasRows] = await pool.query<any[]>(
        `SELECT medida, promocional, jogosMinimos
         FROM compras_pneus_regras
         WHERE lojaId = ?`,
        [input.lojaId]
      );

      const regras = new Map<string, { promocional: boolean; jogosMinimos: number }>();
      for (const item of regrasRows) {
        regras.set(normalizarMedida(item.medida), {
          promocional: Boolean(item.promocional),
          jogosMinimos: Math.max(0, Number(item.jogosMinimos || 0)),
        });
      }

      const marcasExcluidas = new Set(
        MARCAS_NACIONAIS_AUTOMATICAS.map((marca) => normalizarTexto(marca))
      );

      const porMedidaMarca = new Map<string, Map<string, number>>();
      for (const item of estoqueMarcas) {
        const marca = normalizarTexto(item.marca);
        if (marcasExcluidas.has(marca)) continue;

        if (!porMedidaMarca.has(item.medida)) {
          porMedidaMarca.set(item.medida, new Map());
        }
        const mapaMarca = porMedidaMarca.get(item.medida)!;
        mapaMarca.set(marca, (mapaMarca.get(marca) || 0) + item.quantidade);
      }

      const itens = vendas.map((item) => {
        const regra = regras.get(item.medida) || {
          promocional: false,
          jogosMinimos: 0,
        };

        const mapaMarca = porMedidaMarca.get(item.medida) || new Map();
        let jogosValidos = 0;
        for (const qtd of mapaMarca.values()) {
          jogosValidos += Math.floor(Number(qtd || 0) / 4);
        }

        const projecao =
          (Number(item.vendas || 0) / input.diasAnalise) * input.diasProjecao;
        const adicionalPromocional = regra.promocional ? 12 : 0;
        const necessidade =
          projecao + adicionalPromocional - Number(item.estoque || 0);

        const pelaVenda =
          necessidade > 2 ? arredondarMultiplo4(necessidade) : 0;

        const deficitJogos = Math.max(
          0,
          Number(regra.jogosMinimos || 0) - jogosValidos
        );
        const peloMinimo = deficitJogos * 4;
        const quantidadeSugerida = arredondarMultiplo4(
          Math.max(pelaVenda, peloMinimo)
        );

        return {
          medida: item.medida,
          melhorPrecoUf: Number(item.melhorPrecoUf || 0),
          vendas: item.vendas,
          estoque: item.estoque,
          projecao: Number(projecao.toFixed(2)),
          promocional: regra.promocional,
          adicionalPromocional,
          jogosValidos,
          jogosMinimos: regra.jogosMinimos,
          necessidade: Number(necessidade.toFixed(2)),
          quantidadeSugerida,
          quantidadeFinal: quantidadeSugerida,
        };
      });

      return {
        itens,
        marcasExcluidas: Array.from(marcasExcluidas),
        totalMedidas: itens.length,
        totalComprar: itens.filter((item) => item.quantidadeFinal > 0).length,
        totalPneus: itens.reduce(
          (total, item) => total + Number(item.quantidadeFinal || 0),
          0
        ),
        chaveAnalise,
        lojaRelatorio: {
          id: lojaRelatorio.id,
          nome: lojaRelatorio.nome,
        },
      };
    }),


  promocionais: protectedProcedure
    .input(
      z.object({
        lojaId: z.number().int().positive().nullable(),
      })
    )
    .query(async ({ ctx, input }) => {
      assertCompras(ctx);
      return listarPromocionaisCalculados(input.lojaId);
    }),

  atualizarPrecoPromocional: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        precoAnuncio: z.number().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertCompras(ctx);
      await ensureComprasPneus();
      const pool = getPoolComprasPneus();

      const [rows] = await pool.query<any[]>(
        `SELECT id, lojaId, medida, precoAnuncio
         FROM compras_pneus_promocionais
         WHERE id = ?
         LIMIT 1`,
        [input.id]
      );

      const atual = rows[0];

      if (!atual) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Promocional não encontrado.",
        });
      }

      const precoAnterior = Number(atual.precoAnuncio || 0);
      const precoNovo = Number(input.precoAnuncio.toFixed(2));

      if (precoAnterior !== precoNovo) {
        await pool.query(
          `INSERT INTO compras_pneus_promocionais_historico
             (promocionalId, precoAnterior, precoNovo, origem, usuarioId, usuarioNome)
           VALUES (?, ?, ?, 'manual', ?, ?)`,
          [
            input.id,
            precoAnterior,
            precoNovo,
            Number(ctx.user?.id || 0) || null,
            String(ctx.user?.name || "") || null,
          ]
        );

        await pool.query(
          `UPDATE compras_pneus_promocionais
           SET precoAnuncio = ?, origemPreco = 'manual'
           WHERE id = ?`,
          [precoNovo, input.id]
        );
      }

      return {
        id: Number(atual.id),
        lojaId: Number(atual.lojaId),
        lojaNome:
          NOMES_LOJAS_PROMOCIONAIS[Number(atual.lojaId)] ||
          `Loja ${atual.lojaId}`,
        medida: atual.medida,
        precoAnuncio: precoNovo,
      };
    }),

  exportarPromocionais: protectedProcedure
    .input(
      z.object({
        lojaId: z.number().int().positive().nullable(),
      })
    )
    .mutation(async ({ ctx }) => {
      assertCompras(ctx);

      // O Excel de acompanhamento sempre leva as seis lojas,
      // independentemente do filtro que estiver aberto na tela.
      const itens = await listarPromocionaisCalculados(null);

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Promocionais");

      worksheet.pageSetup = {
        orientation: "landscape",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: {
          left: 0.25,
          right: 0.25,
          top: 0.35,
          bottom: 0.35,
          header: 0.15,
          footer: 0.15,
        },
      };

      worksheet.properties.defaultRowHeight = 15;
      worksheet.views = [
        {
          state: "normal",
          showGridLines: false,
          zoomScale: 64,
          zoomScaleNormal: 64,
          activeCell: "A1",
        },
      ];

      const ordemLojas = [1, 2, 3, 4, 7, 6];
      const pares = [
        [1, 2],
        [3, 4],
        [7, 6],
      ];

      const itensPorLoja = new Map<number, any[]>();
      for (const lojaId of ordemLojas) {
        itensPorLoja.set(
          lojaId,
          itens.filter((item) => Number(item.lojaId) === lojaId)
        );
      }

      const larguraBloco = 7;
      const colunaSegundoBloco = 9; // coluna I; H fica como espaço.

      const cabecalhos = [
        "MEDIDA",
        "CUSTO",
        "10%",
        "COM OS 10%",
        "ANÚNCIO",
        "GAP P/ 10%",
        "MARGEM R$",
      ];

      function aplicarBorda(celula: any) {
        celula.border = {
          top: { style: "thin", color: { argb: "FF000000" } },
          left: { style: "thin", color: { argb: "FF000000" } },
          bottom: { style: "thin", color: { argb: "FF000000" } },
          right: { style: "thin", color: { argb: "FF000000" } },
        };
      }

      function escreverBloco(lojaId: number, linhaInicio: number, colunaInicio: number) {
        const lojaNome = NOMES_LOJAS_PROMOCIONAIS[lojaId] || `Loja ${lojaId}`;
        const dados = itensPorLoja.get(lojaId) || [];
        const colunaFim = colunaInicio + larguraBloco - 1;

        worksheet.mergeCells(linhaInicio, colunaInicio, linhaInicio, colunaFim);
        const titulo = worksheet.getCell(linhaInicio, colunaInicio);
        titulo.value = "PROMOCIONAIS";
        titulo.font = { bold: true, size: 9 };
        titulo.alignment = { horizontal: "center" };

        worksheet.mergeCells(
          linhaInicio + 1,
          colunaInicio,
          linhaInicio + 1,
          colunaFim
        );
        const lojaCell = worksheet.getCell(linhaInicio + 1, colunaInicio);
        lojaCell.value = lojaNome.toUpperCase();
        lojaCell.font = { bold: true, size: 10 };
        lojaCell.alignment = { horizontal: "center" };

        for (let i = 0; i < cabecalhos.length; i += 1) {
          const cell = worksheet.getCell(linhaInicio + 2, colunaInicio + i);
          cell.value = cabecalhos[i];
          cell.font = {
            bold: true,
            size: 8,
            color: { argb: "FFFFFFFF" },
          };
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FF111111" },
          };
          cell.alignment = {
            horizontal: i === 0 ? "center" : "center",
            vertical: "middle",
          };
          aplicarBorda(cell);
        }

        for (let index = 0; index < dados.length; index += 1) {
          const item = dados[index];
          const linha = linhaInicio + 3 + index;

          const valores = [
            item.medida,
            item.ultimoCusto,
            item.ultimoCusto === null ? null : 0.1,
            item.custoMeta10,
            item.precoAnuncio,
            item.diferencaMeta10,
            item.diferencaCusto,
          ];

          for (let i = 0; i < valores.length; i += 1) {
            const cell = worksheet.getCell(linha, colunaInicio + i);
            cell.value = valores[i] as any;
            cell.alignment = {
              horizontal: i === 0 ? "center" : "right",
              vertical: "middle",
            };
            aplicarBorda(cell);
          }

          const custo = worksheet.getCell(linha, colunaInicio + 1);
          custo.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FF92D050" },
          };

          const anuncio = worksheet.getCell(linha, colunaInicio + 4);
          anuncio.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FF92D050" },
          };

          const gap = worksheet.getCell(linha, colunaInicio + 5);
          if (item.diferencaMeta10 !== null && Number(item.diferencaMeta10) < 0) {
            gap.font = { color: { argb: "FFFF0000" } };
          } else if (item.diferencaMeta10 !== null) {
            gap.font = { color: { argb: "FF008000" } };
          }

          const margem = worksheet.getCell(linha, colunaInicio + 6);
          if (item.diferencaCusto !== null && Number(item.diferencaCusto) < 0) {
            margem.font = { color: { argb: "FFFF0000" } };
          }

          for (const offset of [1, 3, 4, 5, 6]) {
            worksheet.getCell(linha, colunaInicio + offset).numFmt =
              '"R$" #,##0.00;[Red]-"R$" #,##0.00';
          }

          worksheet.getCell(linha, colunaInicio + 2).numFmt = "0%";
        }

        return dados.length;
      }

      let linhaInicio = 1;
      for (const [esquerda, direita] of pares) {
        const qtdEsquerda = escreverBloco(esquerda, linhaInicio, 1);
        const qtdDireita = escreverBloco(
          direita,
          linhaInicio,
          colunaSegundoBloco
        );
        linhaInicio += Math.max(qtdEsquerda, qtdDireita) + 5;
      }

      const larguras = [
        12, 10, 6, 11, 10, 11, 10,
        2,
        12, 10, 6, 11, 10, 11, 10,
      ];

      for (let i = 0; i < larguras.length; i += 1) {
        worksheet.getColumn(i + 1).width = larguras[i];
      }

      const buffer = await workbook.xlsx.writeBuffer();

      return {
        nome: "promocionais-pneus-todas-lojas.xlsx",
        mime: MIME_XLSX,
        base64: Buffer.from(buffer as any).toString("base64"),
      };
    }),

  fornecedores: protectedProcedure.query(async ({ ctx }) => {
    assertCompras(ctx);
    await ensureComprasPneus();
    const pool = getPoolComprasPneus();

    const [rows] = await pool.query<any[]>(
      `SELECT id, nome, ativo, createdAt
       FROM compras_pneus_fornecedores
       ORDER BY ativo DESC, nome ASC`
    );
    return rows.map((item) => ({ ...item, ativo: Boolean(item.ativo) }));
  }),

  criarFornecedor: protectedProcedure
    .input(z.object({ nome: z.string().trim().min(2).max(160) }))
    .mutation(async ({ ctx, input }) => {
      assertCompras(ctx);
      await ensureComprasPneus();
      const pool = getPoolComprasPneus();

      try {
        const [result] = await pool.query<any>(
          `INSERT INTO compras_pneus_fornecedores
             (nome, ativo, criadoPorUsuarioId, criadoPorNome)
           VALUES (?, 1, ?, ?)`,
          [
            input.nome.trim(),
            Number(ctx.user?.id || 0) || null,
            String(ctx.user?.name || "") || null,
          ]
        );
        return { id: Number(result.insertId), nome: input.nome.trim() };
      } catch (error: any) {
        if (String(error?.code || "") === "ER_DUP_ENTRY") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Esse fornecedor já está cadastrado.",
          });
        }
        throw error;
      }
    }),

  definirFornecedorAtivo: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), ativo: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      assertCompras(ctx);
      await ensureComprasPneus();
      const pool = getPoolComprasPneus();
      await pool.query(
        `UPDATE compras_pneus_fornecedores SET ativo = ? WHERE id = ?`,
        [input.ativo ? 1 : 0, input.id]
      );
      return { ok: true };
    }),

  regras: protectedProcedure
    .input(z.object({ lojaId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      assertCompras(ctx);
      await ensureComprasPneus();
      const pool = getPoolComprasPneus();

      const [rows] = await pool.query<any[]>(
        `SELECT medida, promocional, jogosMinimos
         FROM compras_pneus_regras
         WHERE lojaId = ?
         ORDER BY medida ASC`,
        [input.lojaId]
      );
      return rows.map((item) => ({
        medida: item.medida,
        promocional: Boolean(item.promocional),
        jogosMinimos: Number(item.jogosMinimos || 0),
      }));
    }),

  salvarRegra: protectedProcedure
    .input(
      z.object({
        lojaId: z.number().int().positive(),
        medida: z.string().trim().min(3).max(40),
        promocional: z.boolean(),
        jogosMinimos: z.number().int().min(0).max(10),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertCompras(ctx);
      await ensureComprasPneus();
      const pool = getPoolComprasPneus();

      await pool.query(
        `INSERT INTO compras_pneus_regras
           (lojaId, medida, promocional, jogosMinimos)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           promocional = VALUES(promocional),
           jogosMinimos = VALUES(jogosMinimos)`,
        [
          input.lojaId,
          normalizarMedida(input.medida),
          input.promocional ? 1 : 0,
          input.jogosMinimos,
        ]
      );

      return { ok: true };
    }),

  marcasExcluidas: protectedProcedure.query(async ({ ctx }) => {
    assertCompras(ctx);
    await ensureComprasPneus();
    const pool = getPoolComprasPneus();
    const [rows] = await pool.query<any[]>(
      `SELECT id, marca, ativo
       FROM compras_pneus_marcas_excluidas
       ORDER BY marca ASC`
    );
    return rows.map((item) => ({ ...item, ativo: Boolean(item.ativo) }));
  }),

  adicionarMarcaExcluida: protectedProcedure
    .input(z.object({ marca: z.string().trim().min(2).max(100) }))
    .mutation(async ({ ctx, input }) => {
      assertCompras(ctx);
      await ensureComprasPneus();
      const pool = getPoolComprasPneus();
      const marca = normalizarTexto(input.marca);

      await pool.query(
        `INSERT INTO compras_pneus_marcas_excluidas (marca, ativo)
         VALUES (?, 1)
         ON DUPLICATE KEY UPDATE ativo = 1`,
        [marca]
      );
      return { ok: true, marca };
    }),

  removerMarcaExcluida: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      assertCompras(ctx);
      await ensureComprasPneus();
      const pool = getPoolComprasPneus();
      await pool.query(
        `DELETE FROM compras_pneus_marcas_excluidas WHERE id = ?`,
        [input.id]
      );
      return { ok: true };
    }),

  salvarPlanejamento: protectedProcedure
    .input(
      z.object({
        lojaId: z.number().int().positive(),
        diasAnalise: z.number().int().min(1).max(365),
        diasProjecao: z.number().int().min(1).max(180),
        arquivoVendasNome: z.string().max(255).nullable(),
        arquivoEstoqueNome: z.string().max(255).nullable(),
        chaveAnalise: z.string().length(64),
        itens: z.array(itemAnaliseSchema).min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertCompras(ctx);
      await ensureComprasPneus();
      const pool = getPoolComprasPneus();

      const [jaExistentes] = await pool.query<any[]>(
        `SELECT id
         FROM compras_pneus_planejamentos
         WHERE chaveAnalise = ?
         LIMIT 1`,
        [input.chaveAnalise]
      );

      if (jaExistentes[0]) {
        return {
          id: Number(jaExistentes[0].id),
          jaExistia: true,
        };
      }

      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        const [result] = await conn.query<any>(
          `INSERT INTO compras_pneus_planejamentos
             (lojaId, diasAnalise, diasProjecao, arquivoVendasNome,
              arquivoEstoqueNome, chaveAnalise, status, criadoPorUsuarioId, criadoPorNome)
           VALUES (?, ?, ?, ?, ?, ?, 'planejamento', ?, ?)`,
          [
            input.lojaId,
            input.diasAnalise,
            input.diasProjecao,
            input.arquivoVendasNome,
            input.arquivoEstoqueNome,
            input.chaveAnalise,
            Number(ctx.user?.id || 0) || null,
            String(ctx.user?.name || "") || null,
          ]
        );

        const planejamentoId = Number(result.insertId);

        for (const item of input.itens) {
          await conn.query(
            `INSERT INTO compras_pneus_itens
               (planejamentoId, medida, melhorPrecoUf, vendas, estoque, projecao,
                promocional, adicionalPromocional, jogosValidos, jogosMinimos,
                necessidade, quantidadeSugerida, quantidadeFinal)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              planejamentoId,
              item.medida,
              item.melhorPrecoUf || null,
              item.vendas,
              item.estoque,
              item.projecao,
              item.promocional ? 1 : 0,
              item.adicionalPromocional,
              item.jogosValidos,
              item.jogosMinimos,
              item.necessidade,
              item.quantidadeSugerida,
              arredondarMultiplo4(item.quantidadeFinal),
            ]
          );
        }

        await conn.commit();
        return { id: planejamentoId, jaExistia: false };
      } catch (error: any) {
        await conn.rollback();

        if (String(error?.code || "") === "ER_DUP_ENTRY") {
          const [duplicados] = await pool.query<any[]>(
            `SELECT id
             FROM compras_pneus_planejamentos
             WHERE chaveAnalise = ?
             LIMIT 1`,
            [input.chaveAnalise]
          );

          if (duplicados[0]) {
            return {
              id: Number(duplicados[0].id),
              jaExistia: true,
            };
          }
        }

        throw error;
      } finally {
        conn.release();
      }
    }),

  planejamentos: protectedProcedure
    .input(
      z
        .object({
          lojaId: z.number().int().positive().nullable().optional(),
          dataInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
          dataFim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      assertCompras(ctx);
      await ensureComprasPneus();
      const pool = getPoolComprasPneus();

      const condicoes: string[] = [];
      const params: any[] = [];

      if (input?.lojaId) {
        condicoes.push("p.lojaId = ?");
        params.push(input.lojaId);
      }

      if (input?.dataInicio) {
        condicoes.push("DATE(p.createdAt) >= ?");
        params.push(input.dataInicio);
      }

      if (input?.dataFim) {
        condicoes.push("DATE(p.createdAt) <= ?");
        params.push(input.dataFim);
      }

      const where = condicoes.length
        ? "WHERE " + condicoes.join(" AND ")
        : "";

      const [rows] = await pool.query<any[]>(
        `SELECT p.id, p.lojaId, p.diasAnalise, p.diasProjecao, p.status,
                p.criadoPorNome, p.createdAt,
                COUNT(i.id) AS totalMedidas,
                COALESCE(SUM(i.quantidadeFinal), 0) AS totalPneus
         FROM compras_pneus_planejamentos p
         LEFT JOIN compras_pneus_itens i
           ON i.planejamentoId = p.id AND i.quantidadeFinal > 0
         ${where}
         GROUP BY p.id
         ORDER BY p.createdAt DESC, p.id DESC
         LIMIT 500`,
        params
      );

      return rows.map((item) => ({
        ...item,
        id: Number(item.id),
        lojaId: Number(item.lojaId),
        totalMedidas: Number(item.totalMedidas || 0),
        totalPneus: Number(item.totalPneus || 0),
      }));
    }),

  detalhe: protectedProcedure
    .input(z.object({ planejamentoId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      assertCompras(ctx);
      await ensureComprasPneus();
      const pool = getPoolComprasPneus();

      const [planos] = await pool.query<any[]>(
        `SELECT * FROM compras_pneus_planejamentos WHERE id = ? LIMIT 1`,
        [input.planejamentoId]
      );
      const planejamento = planos[0];
      if (!planejamento) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Planejamento não encontrado.",
        });
      }

      const [itens] = await pool.query<any[]>(
        `SELECT i.*,
                f.nome AS fornecedorSelecionadoNome
         FROM compras_pneus_itens i
         LEFT JOIN compras_pneus_fornecedores f
           ON f.id = i.fornecedorSelecionadoId
         WHERE i.planejamentoId = ?
         ORDER BY i.medida ASC`,
        [input.planejamentoId]
      );

      const ids = itens.map((item) => Number(item.id));
      let cotacoes: any[] = [];
      if (ids.length) {
        const placeholders = ids.map(() => "?").join(",");
        const [rows] = await pool.query<any[]>(
          `SELECT c.itemId, c.fornecedorId, c.valor, f.nome AS fornecedorNome
           FROM compras_pneus_cotacoes c
           JOIN compras_pneus_fornecedores f ON f.id = c.fornecedorId
           WHERE c.itemId IN (${placeholders})
           ORDER BY f.nome ASC`,
          ids
        );
        cotacoes = rows;
      }

      return {
        planejamento,
        itens: itens.map((item) => ({
          ...item,
          id: Number(item.id),
          planejamentoId: Number(item.planejamentoId),
          melhorPrecoUf: Number(item.melhorPrecoUf || 0),
          vendas: Number(item.vendas || 0),
          estoque: Number(item.estoque || 0),
          projecao: Number(item.projecao || 0),
          promocional: Boolean(item.promocional),
          adicionalPromocional: Number(item.adicionalPromocional || 0),
          jogosValidos: Number(item.jogosValidos || 0),
          jogosMinimos: Number(item.jogosMinimos || 0),
          necessidade: Number(item.necessidade || 0),
          quantidadeSugerida: Number(item.quantidadeSugerida || 0),
          quantidadeFinal: Number(item.quantidadeFinal || 0),
          fornecedorSelecionadoId: item.fornecedorSelecionadoId
            ? Number(item.fornecedorSelecionadoId)
            : null,
          precoSelecionado: item.precoSelecionado
            ? Number(item.precoSelecionado)
            : null,
        })),
        cotacoes: cotacoes.map((item) => ({
          ...item,
          itemId: Number(item.itemId),
          fornecedorId: Number(item.fornecedorId),
          valor: Number(item.valor || 0),
        })),
      };
    }),

  atualizarQuantidade: protectedProcedure
    .input(
      z.object({
        itemId: z.number().int().positive(),
        quantidadeFinal: z.number().int().min(0).max(10000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertCompras(ctx);
      await ensureComprasPneus();
      const pool = getPoolComprasPneus();

      await pool.query(
        `UPDATE compras_pneus_itens
         SET quantidadeFinal = ?
         WHERE id = ?`,
        [arredondarMultiplo4(input.quantidadeFinal), input.itemId]
      );
      return { ok: true };
    }),

  salvarCotacao: protectedProcedure
    .input(
      z.object({
        itemId: z.number().int().positive(),
        fornecedorId: z.number().int().positive(),
        valor: z.number().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertCompras(ctx);
      await ensureComprasPneus();
      const pool = getPoolComprasPneus();

      await pool.query(
        `INSERT INTO compras_pneus_cotacoes (itemId, fornecedorId, valor)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE valor = VALUES(valor)`,
        [input.itemId, input.fornecedorId, input.valor]
      );

      await pool.query(
        `UPDATE compras_pneus_planejamentos p
         JOIN compras_pneus_itens i ON i.planejamentoId = p.id
         SET p.status = CASE
           WHEN p.status = 'pedido_salvo' THEN p.status
           ELSE 'cotacao'
         END
         WHERE i.id = ?`,
        [input.itemId]
      );

      return { ok: true };
    }),

  selecionarFornecedor: protectedProcedure
    .input(
      z.object({
        itemId: z.number().int().positive(),
        fornecedorId: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertCompras(ctx);
      await ensureComprasPneus();
      const pool = getPoolComprasPneus();

      const [rows] = await pool.query<any[]>(
        `SELECT valor FROM compras_pneus_cotacoes
         WHERE itemId = ? AND fornecedorId = ?
         LIMIT 1`,
        [input.itemId, input.fornecedorId]
      );

      if (!rows[0]) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Informe primeiro o valor desse fornecedor.",
        });
      }

      await pool.query(
        `UPDATE compras_pneus_itens
         SET fornecedorSelecionadoId = ?, precoSelecionado = ?
         WHERE id = ?`,
        [input.fornecedorId, Number(rows[0].valor), input.itemId]
      );

      return { ok: true };
    }),

  selecionarMenores: protectedProcedure
    .input(z.object({ planejamentoId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      assertCompras(ctx);
      await ensureComprasPneus();
      const pool = getPoolComprasPneus();

      const [itens] = await pool.query<any[]>(
        `SELECT id FROM compras_pneus_itens
         WHERE planejamentoId = ? AND quantidadeFinal > 0`,
        [input.planejamentoId]
      );

      for (const item of itens) {
        const [cotacoes] = await pool.query<any[]>(
          `SELECT fornecedorId, valor
           FROM compras_pneus_cotacoes
           WHERE itemId = ?
           ORDER BY valor ASC, fornecedorId ASC
           LIMIT 1`,
          [item.id]
        );
        if (!cotacoes[0]) continue;

        await pool.query(
          `UPDATE compras_pneus_itens
           SET fornecedorSelecionadoId = ?, precoSelecionado = ?
           WHERE id = ?`,
          [
            Number(cotacoes[0].fornecedorId),
            Number(cotacoes[0].valor),
            Number(item.id),
          ]
        );
      }

      return { ok: true };
    }),

  arquivoCotacaoFornecedor: protectedProcedure
    .input(
      z.object({
        planejamentoId: z.number().int().positive(),
        fornecedorId: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertCompras(ctx);
      await ensureComprasPneus();
      const pool = getPoolComprasPneus();

      const [fornecedores] = await pool.query<any[]>(
        `SELECT id, nome
         FROM compras_pneus_fornecedores
         WHERE id = ? AND ativo = 1
         LIMIT 1`,
        [input.fornecedorId]
      );

      const fornecedor = fornecedores[0];
      if (!fornecedor) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Fornecedor não encontrado ou inativo.",
        });
      }

      const [itens] = await pool.query<any[]>(
        `SELECT medida, melhorPrecoUf
         FROM compras_pneus_itens
         WHERE planejamentoId = ? AND quantidadeFinal > 0
         ORDER BY medida ASC`,
        [input.planejamentoId]
      );

      if (!itens.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Esse planejamento não possui itens para cotação.",
        });
      }

      const nomeSeguro = normalizarTexto(fornecedor.nome)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      return {
        nome: `cotacao-pneus-${nomeSeguro || input.fornecedorId}-${input.planejamentoId}.xlsx`,
        mime: MIME_XLSX,
        base64: await workbookCotacaoFornecedorBase64(
          String(fornecedor.nome),
          itens
        ),
      };
    }),

  importarCotacaoFornecedor: protectedProcedure
    .input(
      z.object({
        planejamentoId: z.number().int().positive(),
        fornecedorId: z.number().int().positive(),
        arquivoNome: z.string().min(1).max(255),
        arquivoBase64: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertCompras(ctx);
      await ensureComprasPneus();
      const pool = getPoolComprasPneus();

      const [fornecedores] = await pool.query<any[]>(
        `SELECT id, nome
         FROM compras_pneus_fornecedores
         WHERE id = ? AND ativo = 1
         LIMIT 1`,
        [input.fornecedorId]
      );

      const fornecedor = fornecedores[0];
      if (!fornecedor) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Fornecedor não encontrado ou inativo.",
        });
      }

      const buffer = bufferXlsx(
        input.arquivoBase64,
        "A planilha preenchida pelo fornecedor"
      );
      const linhas = lerLinhasXlsx(
        buffer,
        "a planilha preenchida pelo fornecedor"
      );

      let cabecalhoIndice = -1;
      let idxMedida = -1;
      let idxFornecedor = -1;
      const fornecedorEsperado = normalizarTexto(fornecedor.nome);

      for (let i = 0; i < Math.min(linhas.length, 12); i += 1) {
        const normalizada = (linhas[i] || []).map(normalizarTexto);
        const medida = normalizada.findIndex((valor) => valor === "MEDIDA");
        const fornecedorColuna = normalizada.findIndex(
          (valor) => valor === fornecedorEsperado
        );

        if (medida >= 0 && fornecedorColuna >= 0) {
          cabecalhoIndice = i;
          idxMedida = medida;
          idxFornecedor = fornecedorColuna;
          break;
        }
      }

      if (cabecalhoIndice < 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Esta planilha não pertence ao fornecedor ${fornecedor.nome}. Baixe a planilha pelo card correto e importe o arquivo devolvido por ele.`,
        });
      }

      const [itens] = await pool.query<any[]>(
        `SELECT id, medida
         FROM compras_pneus_itens
         WHERE planejamentoId = ? AND quantidadeFinal > 0`,
        [input.planejamentoId]
      );

      const itensPorMedida = new Map(
        itens.map((item) => [normalizarMedida(item.medida), Number(item.id)])
      );

      let importados = 0;
      let ignorados = 0;

      for (let i = cabecalhoIndice + 1; i < linhas.length; i += 1) {
        const linha = linhas[i] || [];
        const medida = normalizarMedida(linha[idxMedida]);
        const itemId = itensPorMedida.get(medida);

        if (!itemId) {
          if (medida) ignorados += 1;
          continue;
        }

        const valor = numero(linha[idxFornecedor]);
        if (!(valor > 0)) continue;

        await pool.query(
          `INSERT INTO compras_pneus_cotacoes (itemId, fornecedorId, valor)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE valor = VALUES(valor)`,
          [itemId, input.fornecedorId, valor]
        );

        importados += 1;
      }

      if (!importados) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Nenhum valor válido foi encontrado na coluna do fornecedor. Preencha os preços e tente novamente.",
        });
      }

      await pool.query(
        `UPDATE compras_pneus_planejamentos
         SET status = CASE
           WHEN status = 'pedido_salvo' THEN status
           ELSE 'cotacao'
         END
         WHERE id = ?`,
        [input.planejamentoId]
      );

      return {
        ok: true,
        importados,
        ignorados,
        fornecedorId: Number(input.fornecedorId),
        fornecedorNome: String(fornecedor.nome),
        totalEsperado: itens.length,
      };
    }),

  arquivoCotacao: protectedProcedure
    .input(z.object({ planejamentoId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      assertCompras(ctx);
      await ensureComprasPneus();
      const pool = getPoolComprasPneus();

      const [itens] = await pool.query<any[]>(
        `SELECT medida, melhorPrecoUf
         FROM compras_pneus_itens
         WHERE planejamentoId = ? AND quantidadeFinal > 0
         ORDER BY medida ASC`,
        [input.planejamentoId]
      );

      if (!itens.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Esse planejamento não possui itens para cotação.",
        });
      }

      const linhas: Array<Array<string | number | null>> = [
        ["MEDIDA", "MELHOR PREÇO UF"],
        ...itens.map((item) => [
          item.medida,
          Number(item.melhorPrecoUf || 0) || null,
        ]),
      ];

      return {
        nome: `cotacao-pneus-${input.planejamentoId}.xlsx`,
        mime: MIME_XLSX,
        base64: workbookBase64("Cotação", linhas, [18, 20], [1]),
      };
    }),

  fecharPedidos: protectedProcedure
    .input(z.object({ planejamentoId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      assertCompras(ctx);
      await ensureComprasPneus();
      const pool = getPoolComprasPneus();

      const [existentes] = await pool.query<any[]>(
        `SELECT id FROM compras_pneus_pedidos
         WHERE planejamentoId = ?
         LIMIT 1`,
        [input.planejamentoId]
      );

      if (existentes.length) {
        await pool.query(
          `UPDATE compras_pneus_planejamentos
           SET status = 'pedido_salvo'
           WHERE id = ?`,
          [input.planejamentoId]
        );
        return { ok: true, jaSalvo: true };
      }

      const [itens] = await pool.query<any[]>(
        `SELECT i.id, i.medida, i.quantidadeFinal, i.precoSelecionado,
                i.fornecedorSelecionadoId, f.nome AS fornecedorNome
         FROM compras_pneus_itens i
         LEFT JOIN compras_pneus_fornecedores f
           ON f.id = i.fornecedorSelecionadoId
         WHERE i.planejamentoId = ?
           AND i.quantidadeFinal > 0
         ORDER BY f.nome ASC, i.medida ASC`,
        [input.planejamentoId]
      );

      if (!itens.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Esse planejamento não possui itens para pedido.",
        });
      }

      const pendentes = itens.filter(
        (item) =>
          !item.fornecedorSelecionadoId ||
          Number(item.precoSelecionado || 0) <= 0 ||
          !item.fornecedorNome
      );

      if (pendentes.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Ainda existem ${pendentes.length} medida(s) sem fornecedor/preço selecionado.`,
        });
      }

      const grupos = new Map<number, any[]>();
      for (const item of itens) {
        const fornecedorId = Number(item.fornecedorSelecionadoId);
        if (!grupos.has(fornecedorId)) grupos.set(fornecedorId, []);
        grupos.get(fornecedorId)!.push(item);
      }

      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        for (const [fornecedorId, linhas] of grupos.entries()) {
          const fornecedorNome = String(linhas[0]?.fornecedorNome || "");
          const totalPneus = linhas.reduce(
            (total, item) => total + Number(item.quantidadeFinal || 0),
            0
          );
          const totalValor = linhas.reduce(
            (total, item) =>
              total +
              Number(item.quantidadeFinal || 0) *
                Number(item.precoSelecionado || 0),
            0
          );

          const [result] = await conn.query<any>(
            `INSERT INTO compras_pneus_pedidos
               (planejamentoId, fornecedorId, fornecedorNome, totalPneus,
                totalValor, criadoPorUsuarioId, criadoPorNome)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              input.planejamentoId,
              fornecedorId,
              fornecedorNome,
              totalPneus,
              totalValor,
              Number(ctx.user?.id || 0) || null,
              String(ctx.user?.name || "") || null,
            ]
          );

          const pedidoId = Number(result.insertId);

          for (const item of linhas) {
            const quantidade = Number(item.quantidadeFinal || 0);
            const valorUnitario = Number(item.precoSelecionado || 0);
            await conn.query(
              `INSERT INTO compras_pneus_pedido_itens
                 (pedidoId, itemOriginalId, medida, quantidade, valorUnitario, total)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [
                pedidoId,
                Number(item.id),
                item.medida,
                quantidade,
                valorUnitario,
                quantidade * valorUnitario,
              ]
            );
          }
        }

        await conn.query(
          `UPDATE compras_pneus_planejamentos
           SET status = 'pedido_salvo'
           WHERE id = ?`,
          [input.planejamentoId]
        );

        await conn.commit();
        return { ok: true, jaSalvo: false, pedidos: grupos.size };
      } catch (error) {
        await conn.rollback();
        throw error;
      } finally {
        conn.release();
      }
    }),

  excluirPedidosPlanejamento: protectedProcedure
    .input(z.object({ planejamentoId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      assertCompras(ctx);
      await ensureComprasPneus();
      const pool = getPoolComprasPneus();
      const conn = await pool.getConnection();

      try {
        await conn.beginTransaction();

        const [pedidos] = await conn.query<any[]>(
          `SELECT id
           FROM compras_pneus_pedidos
           WHERE planejamentoId = ?`,
          [input.planejamentoId]
        );

        await conn.query(
          `DELETE pi
           FROM compras_pneus_pedido_itens pi
           INNER JOIN compras_pneus_pedidos pe ON pe.id = pi.pedidoId
           WHERE pe.planejamentoId = ?`,
          [input.planejamentoId]
        );

        await conn.query(
          `DELETE FROM compras_pneus_pedidos
           WHERE planejamentoId = ?`,
          [input.planejamentoId]
        );

        const [cotacoes] = await conn.query<any[]>(
          `SELECT COUNT(*) AS total
           FROM compras_pneus_cotacoes c
           INNER JOIN compras_pneus_itens i ON i.id = c.itemId
           WHERE i.planejamentoId = ?`,
          [input.planejamentoId]
        );

        const novoStatus =
          Number(cotacoes[0]?.total || 0) > 0 ? "cotacao" : "planejamento";

        await conn.query(
          `UPDATE compras_pneus_planejamentos
           SET status = ?
           WHERE id = ?`,
          [novoStatus, input.planejamentoId]
        );

        await conn.commit();

        return {
          ok: true,
          excluidos: pedidos.length,
          planejamentoId: input.planejamentoId,
          novoStatus,
        };
      } catch (error) {
        await conn.rollback();
        throw error;
      } finally {
        conn.release();
      }
    }),

  excluirPlanejamento: protectedProcedure
    .input(z.object({ planejamentoId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      assertCompras(ctx);
      await ensureComprasPneus();
      const pool = getPoolComprasPneus();
      const conn = await pool.getConnection();

      try {
        await conn.beginTransaction();

        const [planos] = await conn.query<any[]>(
          `SELECT id
           FROM compras_pneus_planejamentos
           WHERE id = ?
           LIMIT 1`,
          [input.planejamentoId]
        );

        if (!planos.length) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Planejamento não encontrado.",
          });
        }

        await conn.query(
          `DELETE pi
           FROM compras_pneus_pedido_itens pi
           INNER JOIN compras_pneus_pedidos pe ON pe.id = pi.pedidoId
           WHERE pe.planejamentoId = ?`,
          [input.planejamentoId]
        );

        await conn.query(
          `DELETE FROM compras_pneus_pedidos
           WHERE planejamentoId = ?`,
          [input.planejamentoId]
        );

        await conn.query(
          `DELETE c
           FROM compras_pneus_cotacoes c
           INNER JOIN compras_pneus_itens i ON i.id = c.itemId
           WHERE i.planejamentoId = ?`,
          [input.planejamentoId]
        );

        await conn.query(
          `DELETE FROM compras_pneus_itens
           WHERE planejamentoId = ?`,
          [input.planejamentoId]
        );

        await conn.query(
          `DELETE FROM compras_pneus_planejamentos
           WHERE id = ?`,
          [input.planejamentoId]
        );

        await conn.commit();

        return {
          ok: true,
          planejamentoId: input.planejamentoId,
        };
      } catch (error) {
        await conn.rollback();
        throw error;
      } finally {
        conn.release();
      }
    }),

  historico: protectedProcedure
    .input(
      z.object({
        lojaId: z.number().int().positive().nullable(),
        fornecedorId: z.number().int().positive().nullable(),
        status: z.enum(["todos", "planejamento", "cotacao", "pedido_salvo"]),
        dataInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
        dataFim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
        busca: z.string().max(80).nullable(),
      })
    )
    .query(async ({ ctx, input }) => {
      assertCompras(ctx);
      await ensureComprasPneus();
      const pool = getPoolComprasPneus();

      const condicoes: string[] = [];
      const params: any[] = [];

      if (input.lojaId) {
        condicoes.push("p.lojaId = ?");
        params.push(input.lojaId);
      }

      if (input.dataInicio) {
        condicoes.push("DATE(p.createdAt) >= ?");
        params.push(input.dataInicio);
      }

      if (input.dataFim) {
        condicoes.push("DATE(p.createdAt) <= ?");
        params.push(input.dataFim);
      }

      if (input.status === "pedido_salvo") {
        condicoes.push("p.status = 'pedido_salvo'");
      } else if (input.status === "cotacao") {
        condicoes.push("p.status = 'cotacao'");
      } else if (input.status === "planejamento") {
        condicoes.push("p.status = 'planejamento'");
      }

      if (input.fornecedorId) {
        condicoes.push(
          `(
            EXISTS (
              SELECT 1
              FROM compras_pneus_itens fi
              JOIN compras_pneus_cotacoes fc ON fc.itemId = fi.id
              WHERE fi.planejamentoId = p.id
                AND fc.fornecedorId = ?
            )
            OR EXISTS (
              SELECT 1
              FROM compras_pneus_pedidos fp
              WHERE fp.planejamentoId = p.id
                AND fp.fornecedorId = ?
            )
          )`
        );
        params.push(input.fornecedorId, input.fornecedorId);
      }

      if (input.busca) {
        const busca = `%${input.busca.trim()}%`;
        condicoes.push(
          `(
            CAST(p.id AS CHAR) LIKE ?
            OR EXISTS (
              SELECT 1
              FROM compras_pneus_itens bi
              WHERE bi.planejamentoId = p.id
                AND bi.medida LIKE ?
            )
          )`
        );
        params.push(busca, busca);
      }

      const where = condicoes.length
        ? `WHERE ${condicoes.join(" AND ")}`
        : "";

      const [rows] = await pool.query<any[]>(
        `SELECT
           p.id,
           p.lojaId,
           p.diasAnalise,
           p.diasProjecao,
           p.status,
           p.criadoPorNome,
           DATE_FORMAT(p.createdAt, '%Y-%m-%d %H:%i:%s') AS createdAt,
           (
             SELECT COUNT(*)
             FROM compras_pneus_cotacoes c
             JOIN compras_pneus_itens i ON i.id = c.itemId
             WHERE i.planejamentoId = p.id
           ) AS totalCotacoes,
           (
             SELECT COUNT(DISTINCT c.fornecedorId)
             FROM compras_pneus_cotacoes c
             JOIN compras_pneus_itens i ON i.id = c.itemId
             WHERE i.planejamentoId = p.id
           ) AS fornecedoresCotados,
           (
             SELECT COUNT(*)
             FROM compras_pneus_pedidos pe
             WHERE pe.planejamentoId = p.id
           ) AS pedidosSalvos,
           (
             SELECT COALESCE(SUM(pe.totalPneus), 0)
             FROM compras_pneus_pedidos pe
             WHERE pe.planejamentoId = p.id
           ) AS totalPneusPedido,
           (
             SELECT COALESCE(SUM(pe.totalValor), 0)
             FROM compras_pneus_pedidos pe
             WHERE pe.planejamentoId = p.id
           ) AS totalValorPedido
         FROM compras_pneus_planejamentos p
         ${where}
         ORDER BY p.id DESC
         LIMIT 100`,
        params
      );

      return rows.map((item) => ({
        ...item,
        id: Number(item.id),
        lojaId: Number(item.lojaId),
        totalCotacoes: Number(item.totalCotacoes || 0),
        fornecedoresCotados: Number(item.fornecedoresCotados || 0),
        pedidosSalvos: Number(item.pedidosSalvos || 0),
        totalPneusPedido: Number(item.totalPneusPedido || 0),
        totalValorPedido: Number(item.totalValorPedido || 0),
      }));
    }),

  pedidos: protectedProcedure
    .input(z.object({ planejamentoId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      assertCompras(ctx);
      await ensureComprasPneus();
      const pool = getPoolComprasPneus();

      const [rows] = await pool.query<any[]>(
        `SELECT i.id, i.medida, i.quantidadeFinal, i.precoSelecionado,
                i.fornecedorSelecionadoId, f.nome AS fornecedorNome
         FROM compras_pneus_itens i
         JOIN compras_pneus_fornecedores f
           ON f.id = i.fornecedorSelecionadoId
         WHERE i.planejamentoId = ?
           AND i.quantidadeFinal > 0
           AND i.fornecedorSelecionadoId IS NOT NULL
         ORDER BY f.nome ASC, i.medida ASC`,
        [input.planejamentoId]
      );

      const grupos = new Map<number, any>();
      for (const row of rows) {
        const fornecedorId = Number(row.fornecedorSelecionadoId);
        if (!grupos.has(fornecedorId)) {
          grupos.set(fornecedorId, {
            fornecedorId,
            fornecedorNome: row.fornecedorNome,
            itens: [],
            totalPneus: 0,
            totalValor: 0,
          });
        }
        const grupo = grupos.get(fornecedorId);
        const quantidade = Number(row.quantidadeFinal || 0);
        const preco = Number(row.precoSelecionado || 0);
        grupo.itens.push({
          id: Number(row.id),
          medida: row.medida,
          quantidade,
          preco,
          total: quantidade * preco,
        });
        grupo.totalPneus += quantidade;
        grupo.totalValor += quantidade * preco;
      }

      return Array.from(grupos.values());
    }),

  arquivoPedido: protectedProcedure
    .input(
      z.object({
        planejamentoId: z.number().int().positive(),
        fornecedorId: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertCompras(ctx);
      await ensureComprasPneus();
      const pool = getPoolComprasPneus();

      const [fornecedores] = await pool.query<any[]>(
        `SELECT nome FROM compras_pneus_fornecedores WHERE id = ? LIMIT 1`,
        [input.fornecedorId]
      );
      const fornecedor = fornecedores[0];
      if (!fornecedor) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Fornecedor não encontrado.",
        });
      }

      const [itens] = await pool.query<any[]>(
        `SELECT medida, quantidadeFinal, precoSelecionado
         FROM compras_pneus_itens
         WHERE planejamentoId = ?
           AND fornecedorSelecionadoId = ?
           AND quantidadeFinal > 0
         ORDER BY medida ASC`,
        [input.planejamentoId, input.fornecedorId]
      );

      const totalPedido = Number(
        itens
          .reduce(
            (total, item) =>
              total +
              Number(item.quantidadeFinal || 0) *
                Number(item.precoSelecionado || 0),
            0
          )
          .toFixed(2)
      );

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Pedido", {
        views: [
          {
            state: "frozen",
            ySplit: 1,
            showGridLines: false,
          },
        ],
      });

      worksheet.columns = [
        { header: "MEDIDA", key: "medida", width: 20 },
        { header: "QUANTIDADE", key: "quantidade", width: 16 },
        { header: "VALOR UNITÁRIO", key: "valorUnitario", width: 20 },
        { header: "TOTAL", key: "total", width: 20 },
      ];

      for (const item of itens) {
        const quantidade = Number(item.quantidadeFinal || 0);
        const valorUnitario = Number(item.precoSelecionado || 0);

        worksheet.addRow({
          medida: item.medida,
          quantidade,
          valorUnitario,
          total: Number((quantidade * valorUnitario).toFixed(2)),
        });
      }

      const linhaTotal = worksheet.addRow({
        medida: "TOTAL DO PEDIDO",
        quantidade: null,
        valorUnitario: null,
        total: totalPedido,
      });

      const cabecalho = worksheet.getRow(1);
      cabecalho.font = {
        bold: true,
        color: { argb: "FFFFFFFF" },
      };
      cabecalho.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF111111" },
      };
      cabecalho.alignment = {
        horizontal: "center",
        vertical: "middle",
      };

      worksheet.getColumn(2).numFmt = "0";
      worksheet.getColumn(3).numFmt = '"R$" #,##0.00';
      worksheet.getColumn(4).numFmt = '"R$" #,##0.00';

      linhaTotal.font = { bold: true };
      linhaTotal.getCell(4).font = { bold: true };
      linhaTotal.getCell(4).numFmt = '"R$" #,##0.00';

      worksheet.eachRow((row) => {
        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.protection = {
            locked: true,
            hidden: false,
          };
        });
      });

      await worksheet.protect("fr-pedido-bloqueado", {
        selectLockedCells: true,
        selectUnlockedCells: false,
        formatCells: false,
        formatColumns: false,
        formatRows: false,
        insertColumns: false,
        insertRows: false,
        insertHyperlinks: false,
        deleteColumns: false,
        deleteRows: false,
        sort: false,
        autoFilter: false,
        pivotTables: false,
      });

      const buffer = await workbook.xlsx.writeBuffer();

      const nomeSeguro = normalizarTexto(fornecedor.nome)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      return {
        nome: `pedido-pneus-${nomeSeguro || input.fornecedorId}-${input.planejamentoId}.xlsx`,
        mime: MIME_XLSX,
        base64: Buffer.from(buffer as any).toString("base64"),
      };

    }),
});
