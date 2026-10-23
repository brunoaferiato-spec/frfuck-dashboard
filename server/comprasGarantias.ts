import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { assertCompras, assertSenhaExclusao, db } from "./comprasPecas";
import { empresaDaLoja } from "@shared/empresas";

// Garantia de pneus: termo de envio para análise, anexos (fotos, venda, nota, termo assinado,
// documento do fornecedor), prazo de 30 dias para resolver com o cliente e cobrança semanal do fornecedor.

export const PRAZO_DIAS = 30;
export const GUARDA_DIAS = 60; // garantia negada: o pneu fica guardado 60 dias para o cliente retirar
export const COBRAR_A_CADA_DIAS = 7;
export const STATUS = ["aberta", "enviada", "aprovada", "negada", "finalizada"] as const;
export const RESULTADOS = ["pneu_novo", "reembolso", "devolvido", "descartado"] as const;
// Fotos por tipo (alguns fornecedores, como a GF, pedem cada uma num lugar do formulário) e vídeo do pneu.
export const CATEGORIAS_ANEXO = ["foto", "foto_dot", "foto_marca", "foto_completa", "foto_interna", "foto_banda", "video", "venda", "nota", "termo", "fornecedor", "laudo", "cliente", "outro"] as const;
const MAX_ANEXO = 8 * 1024 * 1024;
const MAX_VIDEO = 25 * 1024 * 1024;
const MIMES_VIDEO = ["video/mp4", "video/quicktime", "video/webm", "video/3gpp", "video/x-matroska"];
const MIMES_ANEXO = ["text/plain", "application/pdf", "image/jpeg", "image/png", "image/webp", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/msword"];
let ready = false;

async function ensure() {
  if (ready) return;
  const p = db();
  await p.query(`CREATE TABLE IF NOT EXISTS compras_garantias (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    lojaId INT UNSIGNED NOT NULL,
    clienteNome VARCHAR(160) NOT NULL,
    clienteTelefone VARCHAR(40) NULL,
    clienteCpf VARCHAR(20) NULL,
    pneu VARCHAR(300) NOT NULL,
    quantidade INT NOT NULL DEFAULT 1,
    posicao VARCHAR(80) NULL,
    kmAtual INT NULL,
    defeito VARCHAR(500) NOT NULL,
    fornecedor VARCHAR(160) NULL,
    vendaNumero VARCHAR(60) NULL,
    vendaData DATE NULL,
    veiculo VARCHAR(120) NULL,
    veiculoAno VARCHAR(10) NULL,
    placa VARCHAR(20) NULL,
    kmVenda INT NULL,
    notaFiscal VARCHAR(60) NULL,
    dataEntrada DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'aberta',
    resultado VARCHAR(20) NULL,
    dataEnvio DATE NULL,
    dataResposta DATE NULL,
    dataFinalizacao DATE NULL,
    observacao TEXT NULL,
    criadoPorNome VARCHAR(160) NULL,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id), KEY idx_cg_status (status), KEY idx_cg_loja (lojaId)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  // Dados lidos da venda (a tabela foi criada antes dessas colunas).
  for (const coluna of ["vendaData DATE NULL", "veiculo VARCHAR(120) NULL", "veiculoAno VARCHAR(10) NULL", "placa VARCHAR(20) NULL", "kmVenda INT NULL",
    "pneuCodigo VARCHAR(40) NULL", "clienteEndereco VARCHAR(200) NULL", "clienteBairro VARCHAR(120) NULL", "clienteCep VARCHAR(12) NULL",
    "clienteCidade VARCHAR(120) NULL", "clienteUf VARCHAR(4) NULL", "dadosFornecedor TEXT NULL"]) {
    try {
      await p.query(`ALTER TABLE compras_garantias ADD COLUMN ${coluna}`);
    } catch (error: any) {
      if (error?.code !== "ER_DUP_FIELDNAME") throw error;
    }
  }

  await p.query(`CREATE TABLE IF NOT EXISTS compras_garantia_anexos (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    garantiaId INT UNSIGNED NOT NULL,
    categoria VARCHAR(20) NOT NULL,
    nome VARCHAR(255) NOT NULL,
    mime VARCHAR(120) NOT NULL,
    tamanho INT UNSIGNED NOT NULL,
    conteudo LONGBLOB NOT NULL,
    criadoPorNome VARCHAR(160) NULL,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), KEY idx_cg_anexo (garantiaId)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

  await p.query(`CREATE TABLE IF NOT EXISTS compras_garantia_cobrancas (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    garantiaId INT UNSIGNED NOT NULL,
    data DATE NOT NULL,
    observacao VARCHAR(500) NULL,
    criadoPorNome VARCHAR(160) NULL,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), KEY idx_cg_cobranca (garantiaId, data)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  ready = true;
}

const id = z.number().int().positive();
const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");
const anexoSchema = z.object({ nome: z.string().trim().min(1).max(255), mime: z.string().max(120), base64: z.string().min(1) });

function iso(v: unknown) {
  if (!v) return null;
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  return String(v).slice(0, 10);
}

function hojeIso() {
  return iso(new Date())!;
}

function somarDias(dataIsoStr: string, dias: number) {
  const [a, m, d] = dataIsoStr.split("-").map(Number);
  return iso(new Date(a, m - 1, d + dias))!;
}

function diasEntre(de: string, ate: string) {
  const [a1, m1, d1] = de.split("-").map(Number);
  const [a2, m2, d2] = ate.split("-").map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000);
}

function nomeUsuario(ctx: any) {
  return String(ctx?.user?.name || "Usuário");
}

// Situação do prazo e da cobrança, igual na lista, no detalhe e nos avisos.
// Etapas antes do envio: 1) termo assinado anexado; 2) fornecedor e nota fiscal; 3) documento do fornecedor e envio.
function etapaDe(g: any, termos: number) {
  if (g.status !== "aberta") return g.status as string;
  if (!termos) return "termo";
  if (!g.fornecedor || !g.notaFiscal) return "fornecedor";
  return "envio";
}

function situacao(g: any, ultimaCobranca: string | null) {
  const hoje = hojeIso();
  const prazo = somarDias(g.dataEntrada, PRAZO_DIAS);
  const diasRestantes = diasEntre(hoje, prazo);
  const ativa = g.status !== "finalizada";
  // Enquanto o fornecedor não responde, cobra a cada 7 dias (contando do envio ou da última cobrança).
  const baseCobranca = ultimaCobranca || g.dataEnvio;
  const cobrarAgora = g.status === "enviada" && !!baseCobranca && diasEntre(baseCobranca, hoje) >= COBRAR_A_CADA_DIAS;
  const guardaAte = g.status === "negada" && g.dataResposta ? somarDias(g.dataResposta, GUARDA_DIAS) : null;
  return {
    prazo,
    diasRestantes,
    vencida: ativa && diasRestantes < 0,
    venceLogo: ativa && diasRestantes >= 0 && diasRestantes <= 7,
    cobrarAgora,
    naoEnviada: g.status === "aberta",
    guardaAte,
    guardaVencida: !!guardaAte && diasEntre(guardaAte, hoje) > 0,
  };
}

function lerJson(v: unknown): Record<string, string> {
  try {
    const o = v ? JSON.parse(String(v)) : {};
    return o && typeof o === "object" ? o : {};
  } catch {
    return {};
  }
}

function linhaGarantia(x: any, ultimaCobranca: string | null, cobrancas: number, anexos: number, termos: number, laudos = 0, conversas = 0) {
  const g = {
    id: Number(x.id),
    lojaId: Number(x.lojaId),
    loja: empresaDaLoja(Number(x.lojaId))?.loja || `Loja ${x.lojaId}`,
    clienteNome: String(x.clienteNome || ""),
    clienteTelefone: x.clienteTelefone ? String(x.clienteTelefone) : "",
    clienteCpf: x.clienteCpf ? String(x.clienteCpf) : "",
    pneu: String(x.pneu || ""),
    quantidade: Number(x.quantidade || 1),
    posicao: x.posicao ? String(x.posicao) : "",
    kmAtual: x.kmAtual == null ? null : Number(x.kmAtual),
    defeito: String(x.defeito || ""),
    fornecedor: x.fornecedor ? String(x.fornecedor) : "",
    vendaNumero: x.vendaNumero ? String(x.vendaNumero) : "",
    vendaData: iso(x.vendaData),
    veiculo: x.veiculo ? String(x.veiculo) : "",
    veiculoAno: x.veiculoAno ? String(x.veiculoAno) : "",
    placa: x.placa ? String(x.placa) : "",
    kmVenda: x.kmVenda == null ? null : Number(x.kmVenda),
    pneuCodigo: x.pneuCodigo ? String(x.pneuCodigo) : "",
    clienteEndereco: x.clienteEndereco ? String(x.clienteEndereco) : "",
    clienteBairro: x.clienteBairro ? String(x.clienteBairro) : "",
    clienteCep: x.clienteCep ? String(x.clienteCep) : "",
    clienteCidade: x.clienteCidade ? String(x.clienteCidade) : "",
    clienteUf: x.clienteUf ? String(x.clienteUf) : "",
    dadosFornecedor: lerJson(x.dadosFornecedor),
    notaFiscal: x.notaFiscal ? String(x.notaFiscal) : "",
    dataEntrada: iso(x.dataEntrada)!,
    status: String(x.status) as (typeof STATUS)[number],
    resultado: x.resultado ? (String(x.resultado) as (typeof RESULTADOS)[number]) : null,
    dataEnvio: iso(x.dataEnvio),
    dataResposta: iso(x.dataResposta),
    dataFinalizacao: iso(x.dataFinalizacao),
    observacao: x.observacao ? String(x.observacao) : "",
    criadoPorNome: x.criadoPorNome ? String(x.criadoPorNome) : "",
    ultimaCobranca,
    cobrancas,
    anexos,
    termoAssinado: termos > 0,
    laudoAnexado: laudos > 0,
    conversaCliente: conversas > 0,
  };
  return { ...g, etapa: etapaDe(g, termos), ...situacao(g, ultimaCobranca) };
}

async function listar(where: string, params: any[]) {
  const [rows] = await db().query<any[]>(
    `SELECT g.*,
            (SELECT MAX(c.data) FROM compras_garantia_cobrancas c WHERE c.garantiaId=g.id) ultimaCobranca,
            (SELECT COUNT(*) FROM compras_garantia_cobrancas c WHERE c.garantiaId=g.id) cobrancas,
            (SELECT COUNT(*) FROM compras_garantia_anexos a WHERE a.garantiaId=g.id) anexos,
            (SELECT COUNT(*) FROM compras_garantia_anexos a WHERE a.garantiaId=g.id AND a.categoria='termo') termos,
            (SELECT COUNT(*) FROM compras_garantia_anexos a WHERE a.garantiaId=g.id AND a.categoria='laudo') laudos,
            (SELECT COUNT(*) FROM compras_garantia_anexos a WHERE a.garantiaId=g.id AND a.categoria='cliente' AND a.mime<>'text/plain') conversas
       FROM compras_garantias g
      ${where}
      ORDER BY (g.status='finalizada'), g.dataEntrada ASC, g.id ASC`,
    params
  );
  return rows.map((x) => linhaGarantia(x, iso(x.ultimaCobranca), Number(x.cobrancas || 0), Number(x.anexos || 0), Number(x.termos || 0), Number(x.laudos || 0), Number(x.conversas || 0)));
}

function bufferAnexo(a: z.infer<typeof anexoSchema>) {
  const mime = a.mime.toLowerCase();
  const video = MIMES_VIDEO.includes(mime);
  if (!video && !MIMES_ANEXO.includes(mime)) throw new TRPCError({ code: "BAD_REQUEST", message: "Anexo deve ser foto (JPG, PNG, WEBP), vídeo (MP4, MOV), PDF, Word ou Excel." });
  const buf = Buffer.from(a.base64, "base64");
  if (!buf.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Anexo vazio." });
  if (buf.length > (video ? MAX_VIDEO : MAX_ANEXO)) throw new TRPCError({ code: "BAD_REQUEST", message: video ? "Vídeo maior que 25 MB: grave mais curto ou em qualidade menor." : "Anexo maior que 8 MB." });
  return { mime, buf };
}

// Etapa 1 (termo): dados que vêm da venda + KM, posição e defeito, preenchidos na hora.
const dadosGarantia = z.object({
  lojaId: id,
  clienteNome: z.string().trim().min(2, "Informe o nome do cliente.").max(160),
  clienteTelefone: z.string().trim().max(40),
  clienteCpf: z.string().trim().max(20),
  pneu: z.string().trim().min(2, "Informe o pneu.").max(300),
  quantidade: z.number().int().min(1).max(20),
  posicao: z.string().trim().min(2, "Informe a posição do pneu.").max(80),
  kmAtual: z.number({ error: "Informe o KM atual." }).int().min(0).max(5000000),
  defeito: z.string().trim().min(2, "Informe o defeito alegado.").max(500),
  dataEntrada: dataIso,
  vendaNumero: z.string().trim().max(60),
  vendaData: dataIso.nullable(),
  veiculo: z.string().trim().max(120),
  veiculoAno: z.string().trim().max(10),
  placa: z.string().trim().max(20),
  kmVenda: z.number().int().min(0).max(5000000).nullable(),
  pneuCodigo: z.string().trim().max(40).default(""),
  clienteEndereco: z.string().trim().max(200).default(""),
  clienteBairro: z.string().trim().max(120).default(""),
  clienteCep: z.string().trim().max(12).default(""),
  clienteCidade: z.string().trim().max(120).default(""),
  clienteUf: z.string().trim().max(4).default(""),
});

async function buscar(garantiaId: number) {
  const lista = await listar(`WHERE g.id=?`, [garantiaId]);
  if (!lista.length) throw new TRPCError({ code: "NOT_FOUND", message: "Garantia não encontrada." });
  return lista[0];
}

export const comprasGarantiasRouter = router({
  lista: protectedProcedure
    .input(z.object({ lojaId: id.nullable(), situacao: z.enum(["andamento", "finalizadas", "todas"]) }))
    .query(async ({ ctx, input }) => {
      assertCompras(ctx); await ensure();
      const cond: string[] = [];
      const params: any[] = [];
      if (input.lojaId) { cond.push("g.lojaId=?"); params.push(input.lojaId); }
      if (input.situacao === "andamento") cond.push("g.status<>'finalizada'");
      if (input.situacao === "finalizadas") cond.push("g.status='finalizada'");
      return listar(cond.length ? `WHERE ${cond.join(" AND ")}` : "", params);
    }),

  // Avisos do comprador: aparecem em todas as telas de Compras até cada garantia ser finalizada.
  avisos: protectedProcedure.query(async ({ ctx }) => {
    assertCompras(ctx); await ensure();
    const ativas = await listar(`WHERE g.status<>'finalizada'`, []);
    return {
      total: ativas.length,
      vencidas: ativas.filter((g) => g.vencida).length,
      venceLogo: ativas.filter((g) => g.venceLogo).length,
      cobrar: ativas.filter((g) => g.cobrarAgora).length,
      naoEnviadas: ativas.filter((g) => g.naoEnviada).length,
      avisarCliente: ativas.filter((g) => g.status === "aprovada" || g.status === "negada").length,
      guardaVencida: ativas.filter((g) => g.guardaVencida).length,
    };
  }),

  detalhe: protectedProcedure.input(z.object({ garantiaId: id })).query(async ({ ctx, input }) => {
    assertCompras(ctx); await ensure();
    const garantia = await buscar(input.garantiaId);
    const [anexos] = await db().query<any[]>(
      `SELECT id,categoria,nome,mime,tamanho,criadoPorNome,createdAt FROM compras_garantia_anexos WHERE garantiaId=? ORDER BY id`,
      [input.garantiaId]
    );
    const [cobrancas] = await db().query<any[]>(
      `SELECT id,data,observacao,criadoPorNome FROM compras_garantia_cobrancas WHERE garantiaId=? ORDER BY data DESC, id DESC`,
      [input.garantiaId]
    );
    return {
      garantia,
      anexos: anexos.map((a) => ({ id: Number(a.id), categoria: String(a.categoria), nome: String(a.nome), mime: String(a.mime), tamanho: Number(a.tamanho), criadoPorNome: a.criadoPorNome ? String(a.criadoPorNome) : "" })),
      cobrancas: cobrancas.map((c) => ({ id: Number(c.id), data: iso(c.data), observacao: c.observacao ? String(c.observacao) : "", criadoPorNome: c.criadoPorNome ? String(c.criadoPorNome) : "" })),
    };
  }),

  // Etapa 1: abre a garantia para gerar o termo. A venda (PDF) vai junto e fica anexada.
  salvar: protectedProcedure.input(dadosGarantia.extend({ id: id.optional(), anexoVenda: anexoSchema.nullable().optional() })).mutation(async ({ ctx, input }) => {
    assertCompras(ctx); await ensure();
    if (!empresaDaLoja(input.lojaId)) throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione a loja." });
    const venda = input.anexoVenda ? bufferAnexo(input.anexoVenda) : null;
    const valores = [
      input.lojaId, input.clienteNome, input.clienteTelefone || null, input.clienteCpf || null, input.pneu, input.quantidade,
      input.posicao, input.kmAtual, input.defeito, input.dataEntrada, input.vendaNumero || null, input.vendaData,
      input.veiculo || null, input.veiculoAno || null, input.placa || null, input.kmVenda,
      input.pneuCodigo || null, input.clienteEndereco || null, input.clienteBairro || null, input.clienteCep || null,
      input.clienteCidade || null, input.clienteUf || null,
    ];
    const c = await db().getConnection();
    try {
      await c.beginTransaction();
      let garantiaId = input.id || 0;
      if (input.id) {
        await c.query(
          `UPDATE compras_garantias SET lojaId=?,clienteNome=?,clienteTelefone=?,clienteCpf=?,pneu=?,quantidade=?,posicao=?,kmAtual=?,
                  defeito=?,dataEntrada=?,vendaNumero=?,vendaData=?,veiculo=?,veiculoAno=?,placa=?,kmVenda=?,
                  pneuCodigo=?,clienteEndereco=?,clienteBairro=?,clienteCep=?,clienteCidade=?,clienteUf=? WHERE id=?`,
          [...valores, input.id]
        );
      } else {
        const [r] = await c.query<any>(
          `INSERT INTO compras_garantias (lojaId,clienteNome,clienteTelefone,clienteCpf,pneu,quantidade,posicao,kmAtual,defeito,dataEntrada,
                  vendaNumero,vendaData,veiculo,veiculoAno,placa,kmVenda,pneuCodigo,clienteEndereco,clienteBairro,clienteCep,clienteCidade,clienteUf,criadoPorNome)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [...valores, nomeUsuario(ctx)]
        );
        garantiaId = Number(r.insertId);
      }
      if (venda && input.anexoVenda) {
        await c.query(
          `INSERT INTO compras_garantia_anexos (garantiaId,categoria,nome,mime,tamanho,conteudo,criadoPorNome) VALUES (?,?,?,?,?,?,?)`,
          [garantiaId, "venda", input.anexoVenda.nome, venda.mime, venda.buf.length, venda.buf, nomeUsuario(ctx)]
        );
      }
      await c.commit();
      return { ok: true, garantiaId };
    } catch (e) { await c.rollback(); throw e; } finally { c.release(); }
  }),

  // Etapa 2: com o termo assinado anexado, informa o fornecedor e a nota fiscal do pneu.
  salvarFornecedor: protectedProcedure
    .input(z.object({ garantiaId: id, fornecedor: z.string().trim().min(2, "Informe o fornecedor.").max(160), notaFiscal: z.string().trim().min(1, "Informe o número da nota fiscal.").max(60) }))
    .mutation(async ({ ctx, input }) => {
      assertCompras(ctx); await ensure();
      const g = await buscar(input.garantiaId);
      if (!g.termoAssinado) throw new TRPCError({ code: "BAD_REQUEST", message: "Anexe o termo assinado pelo cliente antes de seguir." });
      await db().query(`UPDATE compras_garantias SET fornecedor=?, notaFiscal=? WHERE id=?`, [input.fornecedor, input.notaFiscal, input.garantiaId]);
      return { ok: true };
    }),

  // Etapa 3: campos extras do formulário do fornecedor (DOT, marca do veículo etc.), guardados para gerar de novo.
  salvarDadosFornecedor: protectedProcedure
    .input(z.object({ garantiaId: id, dados: z.record(z.string(), z.string().max(300)) }))
    .mutation(async ({ ctx, input }) => {
      assertCompras(ctx); await ensure();
      await buscar(input.garantiaId);
      await db().query(`UPDATE compras_garantias SET dadosFornecedor=? WHERE id=?`, [JSON.stringify(input.dados), input.garantiaId]);
      return { ok: true };
    }),

  // Avança a situação: enviada ao fornecedor → aprovada/negada → finalizada com o cliente.
  definirStatus: protectedProcedure
    .input(z.object({ garantiaId: id, status: z.enum(STATUS), data: dataIso, resultado: z.enum(RESULTADOS).nullable().optional() }))
    .mutation(async ({ ctx, input }) => {
      assertCompras(ctx); await ensure();
      const g = await buscar(input.garantiaId);
      if (input.status === "enviada" && g.status === "aberta") {
        if (!g.termoAssinado) throw new TRPCError({ code: "BAD_REQUEST", message: "Anexe o termo assinado pelo cliente antes de enviar." });
        if (!g.fornecedor || !g.notaFiscal) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o fornecedor e a nota fiscal antes de enviar." });
      }
      if ((input.status === "aprovada" || input.status === "negada") && g.status === "enviada" && !g.laudoAnexado) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Anexe o laudo do fornecedor antes de marcar aprovado ou negado." });
      }
      if (input.status === "finalizada" && !input.resultado) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe como foi resolvido com o cliente." });
      if (input.status === "finalizada" && !g.conversaCliente) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Anexe o print ou a conversa com o cliente antes de finalizar." });
      }
      const sets: Record<string, string> = {
        aberta: "dataEnvio=NULL, dataResposta=NULL, dataFinalizacao=NULL, resultado=NULL",
        enviada: "dataEnvio=?, dataResposta=NULL, dataFinalizacao=NULL, resultado=NULL",
        aprovada: "dataResposta=?, dataFinalizacao=NULL, resultado=NULL",
        negada: "dataResposta=?, dataFinalizacao=NULL, resultado=NULL",
        finalizada: "dataFinalizacao=?, resultado=?",
      };
      const params: any[] = input.status === "aberta" ? [] : input.status === "finalizada" ? [input.data, input.resultado] : [input.data];
      await db().query(`UPDATE compras_garantias SET status=?, ${sets[input.status]} WHERE id=?`, [input.status, ...params, input.garantiaId]);
      return { ok: true };
    }),

  registrarCobranca: protectedProcedure
    .input(z.object({ garantiaId: id, observacao: z.string().trim().max(500) }))
    .mutation(async ({ ctx, input }) => {
      assertCompras(ctx); await ensure();
      await buscar(input.garantiaId);
      await db().query(
        `INSERT INTO compras_garantia_cobrancas (garantiaId,data,observacao,criadoPorNome) VALUES (?,?,?,?)`,
        [input.garantiaId, hojeIso(), input.observacao || null, nomeUsuario(ctx)]
      );
      return { ok: true };
    }),

  adicionarAnexo: protectedProcedure
    .input(z.object({ garantiaId: id, categoria: z.enum(CATEGORIAS_ANEXO), anexo: anexoSchema }))
    .mutation(async ({ ctx, input }) => {
      assertCompras(ctx); await ensure();
      await buscar(input.garantiaId);
      const { mime, buf } = bufferAnexo(input.anexo);
      await db().query(
        `INSERT INTO compras_garantia_anexos (garantiaId,categoria,nome,mime,tamanho,conteudo,criadoPorNome) VALUES (?,?,?,?,?,?,?)`,
        [input.garantiaId, input.categoria, input.anexo.nome, mime, buf.length, buf, nomeUsuario(ctx)]
      );
      return { ok: true };
    }),

  baixarAnexo: protectedProcedure.input(z.object({ anexoId: id })).mutation(async ({ ctx, input }) => {
    assertCompras(ctx); await ensure();
    const [r] = await db().query<any[]>(`SELECT nome,mime,conteudo FROM compras_garantia_anexos WHERE id=? LIMIT 1`, [input.anexoId]);
    if (!r.length) throw new TRPCError({ code: "NOT_FOUND", message: "Anexo não encontrado." });
    const conteudo = Buffer.isBuffer(r[0].conteudo) ? r[0].conteudo : Buffer.from(r[0].conteudo);
    return { nome: String(r[0].nome), mime: String(r[0].mime), base64: conteudo.toString("base64") };
  }),

  excluirAnexo: protectedProcedure.input(z.object({ anexoId: id, senha: z.string().max(50) })).mutation(async ({ ctx, input }) => {
    assertCompras(ctx);
    assertSenhaExclusao(input.senha);
    await ensure();
    await db().query(`DELETE FROM compras_garantia_anexos WHERE id=?`, [input.anexoId]);
    return { ok: true };
  }),

  excluir: protectedProcedure.input(z.object({ garantiaId: id, senha: z.string().max(50) })).mutation(async ({ ctx, input }) => {
    assertCompras(ctx);
    assertSenhaExclusao(input.senha);
    await ensure();
    const c = await db().getConnection();
    try {
      await c.beginTransaction();
      await c.query(`DELETE FROM compras_garantia_anexos WHERE garantiaId=?`, [input.garantiaId]);
      await c.query(`DELETE FROM compras_garantia_cobrancas WHERE garantiaId=?`, [input.garantiaId]);
      await c.query(`DELETE FROM compras_garantias WHERE id=?`, [input.garantiaId]);
      await c.commit();
      return { ok: true };
    } catch (e) { await c.rollback(); throw e; } finally { c.release(); }
  }),
});
