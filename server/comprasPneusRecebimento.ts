import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { db } from "./comprasPecas";
import { empresaDaLoja } from "@shared/empresas";
import { nomeUsuario } from "./estoqueBase";

// Recebimento e fechamento dos pedidos de pneus.
// Tudo é feito pelo Compras:
// 1) Pedido salvo fica "aguardando" chegada.
// 2) A loja avisa o que chegou e o Compras registra a quantidade recebida ("conferido").
// 3) O Compras anexa o XML da nota: o sistema compara pedido × recebido × nota.
//    Tudo certo, finaliza; com diferença, só finaliza com justificativa ("finalizado").

export type StatusRecebimento = "aguardando" | "conferido" | "finalizado";

const TOLERANCIA_PRECO = 0.1; // R$ por pneu: diferença de centavos não conta
// O controle começa com as compras da semana de 23/11/2026; pedidos anteriores ficam como estavam.
const INICIO_CONTROLE = "2026-11-23 00:00:00";
const MAX_XML = 3 * 1024 * 1024;

let pronto = false;

async function tentar(sql: string, ignorar: string) {
  try {
    await db().query(sql);
  } catch (error: any) {
    if (String(error?.code || "") !== ignorar) throw error;
  }
}

export async function ensureRecebimentoPneus() {
  if (pronto) return;
  for (const coluna of [
    "ADD COLUMN recebimentoStatus VARCHAR(20) NULL",
    "ADD COLUMN recebidoPorNome VARCHAR(160) NULL",
    "ADD COLUMN recebidoEm TIMESTAMP NULL",
    "ADD COLUMN recebimentoObs TEXT NULL",
    "ADD COLUMN finalizadoPorNome VARCHAR(160) NULL",
    "ADD COLUMN finalizadoEm TIMESTAMP NULL",
    "ADD COLUMN finalizadoComDivergencia TINYINT(1) NOT NULL DEFAULT 0",
    "ADD COLUMN justificativa TEXT NULL",
  ]) {
    await tentar(`ALTER TABLE compras_pneus_pedidos ${coluna}`, "ER_DUP_FIELDNAME");
  }
  await tentar(
    `ALTER TABLE compras_pneus_pedidos ADD KEY idx_compras_pneus_pedido_recebimento (recebimentoStatus)`,
    "ER_DUP_KEYNAME"
  );
  await tentar(`ALTER TABLE compras_pneus_pedido_itens ADD COLUMN quantidadeRecebida INT NULL`, "ER_DUP_FIELDNAME");
  await tentar(`ALTER TABLE compras_pneus_fornecedores ADD COLUMN cnpj VARCHAR(14) NULL`, "ER_DUP_FIELDNAME");

  await db().query(`
    CREATE TABLE IF NOT EXISTS compras_pneus_pedido_notas (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      pedidoId INT UNSIGNED NOT NULL,
      chave VARCHAR(44) NULL,
      numero VARCHAR(20) NOT NULL,
      serie VARCHAR(5) NULL,
      emitenteNome VARCHAR(200) NULL,
      emitenteCnpj VARCHAR(14) NULL,
      destinatarioCnpj VARCHAR(14) NULL,
      dataEmissao VARCHAR(30) NULL,
      valorTotal DECIMAL(14,2) NULL,
      manual TINYINT(1) NOT NULL DEFAULT 0,
      itensJson MEDIUMTEXT NULL,
      xml MEDIUMTEXT NULL,
      anexadoPorNome VARCHAR(160) NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_compras_pneus_nota_chave (chave),
      KEY idx_compras_pneus_nota_pedido (pedidoId)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  // Uma vez só: os pedidos salvos desde o início do controle entram aguardando a chegada.
  // (Também desfaz a primeira versão, que tinha incluído pedidos dos 10 dias anteriores.)
  await db().query(`
    CREATE TABLE IF NOT EXISTS compras_pneus_migracoes (
      chave VARCHAR(120) NOT NULL,
      appliedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (chave)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  const chave = "recebimento_pneus_inicio_v2";
  const [feito] = await db().query<any[]>(`SELECT chave FROM compras_pneus_migracoes WHERE chave=? LIMIT 1`, [chave]);
  if (!feito.length) {
    await db().query(
      `UPDATE compras_pneus_pedidos pe
          SET pe.recebimentoStatus = NULL
        WHERE pe.recebimentoStatus = 'aguardando'
          AND pe.createdAt < ?
          AND NOT EXISTS (SELECT 1 FROM compras_pneus_pedido_notas n WHERE n.pedidoId = pe.id)`,
      [INICIO_CONTROLE]
    );
    await db().query(
      `UPDATE compras_pneus_pedidos pe
         JOIN compras_pneus_planejamentos p ON p.id = pe.planejamentoId
          SET pe.recebimentoStatus = 'aguardando'
        WHERE pe.recebimentoStatus IS NULL
          AND p.excluidoEm IS NULL
          AND pe.createdAt >= ?`,
      [INICIO_CONTROLE]
    );
    await db().query(`INSERT IGNORE INTO compras_pneus_migracoes (chave) VALUES (?)`, [chave]);
  }
  pronto = true;
}

// ======================================================
// LEITURA DO XML DA NF-e
// ======================================================
export type ItemNota = {
  indice: number;
  codigo: string;
  descricao: string;
  medidaLida: string | null; // medida encontrada na descrição
  medida: string | null; // medida do pedido associada (automática ou escolhida pelo Compras)
  quantidade: number;
  unitario: number;
  unitarioComImpostos: number;
  total: number;
};

export type NotaLida = {
  chave: string;
  numero: string;
  serie: string;
  emitenteNome: string;
  emitenteCnpj: string;
  destinatarioCnpj: string;
  dataEmissao: string;
  valorTotal: number;
  itens: ItemNota[];
};

function desescapar(v: string) {
  return v
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&")
    .trim();
}

function bloco(xml: string, tag: string) {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${tag}>`));
  return m ? m[1] : "";
}

function blocos(xml: string, tag: string) {
  return Array.from(xml.matchAll(new RegExp(`<(?:\\w+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, "g"))).map((m) => m[1]);
}

const texto = (xml: string, tag: string) => desescapar(bloco(xml, tag));
const numero = (xml: string, tag: string) => {
  const n = Number(texto(xml, tag));
  return Number.isFinite(n) ? n : 0;
};
const soDigitos = (v: string) => String(v || "").replace(/\D/g, "");

// Medida canônica: "175/70R13", "185R14", "31X10.50R15". Serve tanto para a medida do pedido
// quanto para a descrição do fornecedor ("PNEU 175/70 R13 82T XBRI", "175/70-13"...).
export function chaveMedida(valor: unknown): string | null {
  const t = String(valor ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/,/g, ".");
  let m = t.match(/(\d{3})\s*\/\s*(\d{2})\s*(?:Z?R|-|\/|\s)\s*F?\s*(\d{2}(?:\.5)?)(?!\d)/);
  if (m) return `${m[1]}/${m[2]}R${m[3]}`;
  m = t.match(/(?:^|\D)(\d{3})\s*\/\s*(\d{2})(\d{2})(?!\d)/); // "175/7013" (sem o R)
  if (m) return `${m[1]}/${m[2]}R${m[3]}`;
  m = t.match(/(\d{2})\s*X\s*(\d{1,2}\.\d{1,2})\s*-?\s*R?\s*(\d{2})(?!\d)/);
  if (m) return `${m[1]}X${m[2]}R${m[3]}`;
  m = t.match(/(?:^|\D)(\d{3})\s*\/?\s*R\s*(\d{2}(?:\.5)?)(?!\d)/);
  if (m) return `${m[1]}R${m[2]}`;
  m = t.trim().match(/^(\d{3})\s*\/\s*(\d{2}(?:\.5)?)C?$/); // medida do sistema sem perfil: "185/14"
  if (m) return `${m[1]}R${m[2]}`;
  return null;
}

export function lerXmlNfe(xml: string): NotaLida {
  const conteudo = String(xml || "");
  const infNFe = conteudo.match(/<(?:\w+:)?infNFe\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?infNFe>/);
  if (!infNFe) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Esse arquivo não é o XML de uma nota fiscal (NF-e). Anexe o arquivo .xml que o fornecedor mandou.",
    });
  }
  const corpo = infNFe[2];
  const idAttr = infNFe[1].match(/Id\s*=\s*"NFe(\d{44})"/);
  const chave = idAttr ? idAttr[1] : soDigitos(texto(conteudo, "chNFe"));
  const ide = bloco(corpo, "ide");
  const emit = bloco(corpo, "emit");
  const dest = bloco(corpo, "dest");
  const icmsTot = bloco(bloco(corpo, "total"), "ICMSTot");

  const dets = blocos(corpo, "det");
  const itens: ItemNota[] = dets.map((det, i) => {
    const prod = bloco(det, "prod");
    const imposto = bloco(det, "imposto");
    const quantidade = numero(prod, "qCom");
    const vProd = numero(prod, "vProd");
    const unitario = numero(prod, "vUnCom") || (quantidade ? vProd / quantidade : 0);
    // Custo efetivo do pneu: produto + IPI + ST + frete/seguro/outras − desconto.
    const extras =
      numero(bloco(imposto, "IPI"), "vIPI") +
      numero(imposto, "vICMSST") +
      numero(imposto, "vFCPST") +
      numero(prod, "vFrete") +
      numero(prod, "vSeg") +
      numero(prod, "vOutro") -
      numero(prod, "vDesc");
    const descricao = texto(prod, "xProd");
    const medidaLida = chaveMedida(descricao);
    return {
      indice: i,
      codigo: texto(prod, "cProd"),
      descricao,
      medidaLida,
      medida: null,
      quantidade,
      unitario: Number(unitario.toFixed(4)),
      unitarioComImpostos: quantidade ? Number(((vProd + extras) / quantidade).toFixed(4)) : 0,
      total: Number((vProd + extras).toFixed(2)),
    };
  });

  if (!itens.length) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Não encontrei produtos nesse XML de nota." });
  }

  return {
    chave,
    numero: texto(ide, "nNF"),
    serie: texto(ide, "serie"),
    emitenteNome: texto(emit, "xNome"),
    emitenteCnpj: soDigitos(texto(emit, "CNPJ")),
    destinatarioCnpj: soDigitos(texto(dest, "CNPJ")),
    dataEmissao: texto(ide, "dhEmi") || texto(ide, "dEmi"),
    valorTotal: numero(icmsTot, "vNF"),
    itens,
  };
}

// ======================================================
// COMPARAÇÃO PEDIDO × RECEBIDO × NOTA
// ======================================================
type Problema = { tipo: "grave" | "atencao"; texto: string };

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function lerItensNota(json: unknown): ItemNota[] {
  try {
    const lista = JSON.parse(String(json || "[]"));
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

// Medida do pedido a que o item da nota corresponde: a escolhida pelo Compras ou a encontrada na descrição.
function medidaDoItemNota(item: ItemNota, chavesPedido: Map<string, string>) {
  if (item.medida) return item.medida;
  if (item.medidaLida && chavesPedido.has(item.medidaLida)) return chavesPedido.get(item.medidaLida)!;
  return null;
}

async function carregarPedido(pedidoId: number) {
  const [rows] = await db().query<any[]>(
    `SELECT pe.*, p.lojaId, p.excluidoEm, f.cnpj AS fornecedorCnpj
       FROM compras_pneus_pedidos pe
       JOIN compras_pneus_planejamentos p ON p.id = pe.planejamentoId
       LEFT JOIN compras_pneus_fornecedores f ON f.id = pe.fornecedorId
      WHERE pe.id = ? LIMIT 1`,
    [pedidoId]
  );
  const pedido = rows[0];
  if (!pedido || pedido.excluidoEm) throw new TRPCError({ code: "NOT_FOUND", message: "Pedido não encontrado." });
  return pedido;
}

async function itensDoPedido(pedidoId: number) {
  const [rows] = await db().query<any[]>(
    `SELECT id, medida, quantidade, valorUnitario, quantidadeRecebida
       FROM compras_pneus_pedido_itens WHERE pedidoId = ? ORDER BY medida`,
    [pedidoId]
  );
  return rows.map((r) => ({
    id: Number(r.id),
    medida: String(r.medida),
    quantidade: Number(r.quantidade || 0),
    valorUnitario: Number(r.valorUnitario || 0),
    quantidadeRecebida: r.quantidadeRecebida == null ? null : Number(r.quantidadeRecebida),
  }));
}

async function notasDoPedido(pedidoId: number) {
  const [rows] = await db().query<any[]>(
    `SELECT id, chave, numero, serie, emitenteNome, emitenteCnpj, destinatarioCnpj, dataEmissao, valorTotal,
            manual, itensJson, anexadoPorNome, createdAt
       FROM compras_pneus_pedido_notas WHERE pedidoId = ? ORDER BY id`,
    [pedidoId]
  );
  return rows.map((r) => ({
    id: Number(r.id),
    chave: r.chave ? String(r.chave) : "",
    numero: String(r.numero || ""),
    serie: r.serie ? String(r.serie) : "",
    emitenteNome: r.emitenteNome ? String(r.emitenteNome) : "",
    emitenteCnpj: r.emitenteCnpj ? String(r.emitenteCnpj) : "",
    destinatarioCnpj: r.destinatarioCnpj ? String(r.destinatarioCnpj) : "",
    dataEmissao: r.dataEmissao ? String(r.dataEmissao) : "",
    valorTotal: r.valorTotal == null ? null : Number(r.valorTotal),
    manual: !!Number(r.manual),
    itens: lerItensNota(r.itensJson),
    anexadoPorNome: r.anexadoPorNome ? String(r.anexadoPorNome) : "",
    createdAt: r.createdAt,
  }));
}

function comparar(
  pedido: any,
  itens: Awaited<ReturnType<typeof itensDoPedido>>,
  notas: Awaited<ReturnType<typeof notasDoPedido>>
) {
  const chavesPedido = new Map<string, string>();
  for (const item of itens) {
    const chave = chaveMedida(item.medida);
    if (chave && !chavesPedido.has(chave)) chavesPedido.set(chave, item.medida);
  }
  const notasComItens = notas.filter((n) => !n.manual);
  const temXml = notasComItens.length > 0;

  // Soma da nota por medida do pedido.
  const somaNota = new Map<string, { qtd: number; valor: number; valorImp: number }>();
  const foraDoPedido: Array<ItemNota & { notaId: number; notaNumero: string }> = [];
  for (const nota of notasComItens) {
    for (const item of nota.itens) {
      const medida = medidaDoItemNota(item, chavesPedido);
      if (!medida) {
        foraDoPedido.push({ ...item, notaId: nota.id, notaNumero: nota.numero });
        continue;
      }
      const s = somaNota.get(medida) || { qtd: 0, valor: 0, valorImp: 0 };
      s.qtd += item.quantidade;
      s.valor += item.quantidade * item.unitario;
      s.valorImp += item.quantidade * item.unitarioComImpostos;
      somaNota.set(medida, s);
    }
  }

  const linhas = itens.map((item) => {
    const problemas: Problema[] = [];
    const recebida = item.quantidadeRecebida;
    if (recebida != null && recebida < item.quantidade) {
      problemas.push({ tipo: "atencao", texto: `Chegou ${recebida} de ${item.quantidade} pedidos` });
    } else if (recebida != null && recebida > item.quantidade) {
      problemas.push({ tipo: "atencao", texto: `Chegou ${recebida}, o pedido era ${item.quantidade}` });
    }
    const s = somaNota.get(item.medida);
    const notaQtd = s ? s.qtd : 0;
    const precoNota = s && s.qtd ? s.valor / s.qtd : null;
    const precoNotaImp = s && s.qtd ? s.valorImp / s.qtd : null;
    if (temXml) {
      if (!notaQtd) {
        problemas.push({ tipo: "atencao", texto: "Não está na nota" });
      } else if (recebida != null && notaQtd > recebida) {
        problemas.push({ tipo: "grave", texto: `Nota cobra ${notaQtd}, a loja recebeu ${recebida}` });
      } else if (recebida != null && notaQtd < recebida) {
        problemas.push({ tipo: "atencao", texto: `Chegou ${recebida}, a nota tem ${notaQtd}` });
      } else if (recebida == null && notaQtd !== item.quantidade) {
        problemas.push({ tipo: "atencao", texto: `Nota tem ${notaQtd}, o pedido era ${item.quantidade}` });
      }
      if (precoNota != null && item.valorUnitario > 0) {
        const bate =
          Math.abs(precoNota - item.valorUnitario) <= TOLERANCIA_PRECO ||
          (precoNotaImp != null && Math.abs(precoNotaImp - item.valorUnitario) <= TOLERANCIA_PRECO);
        if (!bate) {
          const diff = precoNota - item.valorUnitario;
          problemas.push({
            tipo: diff > 0 ? "grave" : "atencao",
            texto: `Preço na nota ${moeda(precoNota)} (pedido ${moeda(item.valorUnitario)}, ${diff > 0 ? "+" : ""}${moeda(diff)} cada)`,
          });
        }
      }
    }
    return {
      itemId: item.id,
      medida: item.medida,
      pedida: item.quantidade,
      recebida,
      notaQtd: temXml ? notaQtd : null,
      precoPedido: item.valorUnitario,
      precoNota: precoNota == null ? null : Number(precoNota.toFixed(2)),
      precoNotaComImpostos: precoNotaImp == null ? null : Number(precoNotaImp.toFixed(2)),
      problemas,
    };
  });

  const avisos: Problema[] = [];
  const empresa = empresaDaLoja(Number(pedido.lojaId));
  const cnpjLoja = soDigitos(empresa?.cnpj || "");
  const cnpjFornecedor = soDigitos(pedido.fornecedorCnpj || "");
  for (const nota of notasComItens) {
    if (cnpjLoja && nota.destinatarioCnpj && nota.destinatarioCnpj !== cnpjLoja) {
      avisos.push({ tipo: "grave", texto: `A nota ${nota.numero} não é para ${empresa?.loja} (CNPJ de destino diferente).` });
    }
    if (cnpjFornecedor && nota.emitenteCnpj && nota.emitenteCnpj !== cnpjFornecedor) {
      avisos.push({
        tipo: "atencao",
        texto: `A nota ${nota.numero} foi emitida por ${nota.emitenteNome || "outro CNPJ"}, que não é o CNPJ usado antes por ${pedido.fornecedorNome}.`,
      });
    }
  }
  for (const extra of foraDoPedido) {
    avisos.push({
      tipo: "grave",
      texto: `Na nota ${extra.notaNumero} e fora do pedido: ${extra.quantidade} × ${extra.descricao}`,
    });
  }

  const totalPedido = itens.reduce((t, i) => t + i.quantidade * i.valorUnitario, 0);
  const totalNotas = notas.reduce((t, n) => t + Number(n.valorTotal || 0), 0);
  const divergente = linhas.some((l) => l.problemas.length) || avisos.length > 0;

  return {
    temXml,
    linhas,
    foraDoPedido,
    avisos,
    totalPedido: Number(totalPedido.toFixed(2)),
    totalNotas: Number(totalNotas.toFixed(2)),
    divergente,
  };
}

function resumoPedido(r: any) {
  const criado = r.createdAt ? new Date(r.createdAt) : null;
  return {
    id: Number(r.id),
    planejamentoId: Number(r.planejamentoId),
    lojaId: Number(r.lojaId),
    loja: empresaDaLoja(Number(r.lojaId))?.loja || `Loja ${r.lojaId}`,
    fornecedorNome: String(r.fornecedorNome || ""),
    totalPneus: Number(r.totalPneus || 0),
    createdAt: r.createdAt,
    diasDesdePedido: criado ? Math.floor((Date.now() - criado.getTime()) / 86_400_000) : 0,
    status: String(r.recebimentoStatus || "") as StatusRecebimento,
    recebidoPorNome: r.recebidoPorNome ? String(r.recebidoPorNome) : "",
    recebidoEm: r.recebidoEm || null,
    recebimentoObs: r.recebimentoObs ? String(r.recebimentoObs) : "",
    finalizadoPorNome: r.finalizadoPorNome ? String(r.finalizadoPorNome) : "",
    finalizadoEm: r.finalizadoEm || null,
    finalizadoComDivergencia: !!Number(r.finalizadoComDivergencia || 0),
    justificativa: r.justificativa ? String(r.justificativa) : "",
  };
}

const idSchema = z.number().int().positive();

// ======================================================
// COMPRAS: fechamento com a nota fiscal.
// ======================================================
function exigirCompras(ctx: any) {
  const role = String(ctx.user?.role || "");
  if (!["compras", "admin", "gestor", "pneus_leitura"].includes(role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Usuário sem acesso ao módulo de Compras." });
  }
}

async function exigirAberto(pedidoId: number) {
  const pedido = await carregarPedido(pedidoId);
  if (pedido.recebimentoStatus === "finalizado") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Esse pedido já foi finalizado." });
  }
  if (!pedido.recebimentoStatus) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Esse pedido é anterior ao controle de recebimento." });
  }
  return pedido;
}

export const fechamentoPneusRouter = router({
  lista: protectedProcedure.query(async ({ ctx }) => {
    exigirCompras(ctx);
    await ensureRecebimentoPneus();
    const [rows] = await db().query<any[]>(
      `SELECT pe.*, p.lojaId,
              (SELECT COUNT(*) FROM compras_pneus_pedido_notas n WHERE n.pedidoId = pe.id) AS notas,
              (SELECT COUNT(*) FROM compras_pneus_pedido_itens i WHERE i.pedidoId = pe.id
                 AND i.quantidadeRecebida IS NOT NULL AND i.quantidadeRecebida <> i.quantidade) AS diferencasLoja
         FROM compras_pneus_pedidos pe
         JOIN compras_pneus_planejamentos p ON p.id = pe.planejamentoId
        WHERE p.excluidoEm IS NULL
          AND (pe.recebimentoStatus IN ('aguardando','conferido')
               OR (pe.recebimentoStatus = 'finalizado' AND pe.finalizadoEm >= NOW() - INTERVAL 60 DAY))
        ORDER BY pe.createdAt ASC, pe.id ASC`
    );
    const pedidos = rows.map((r) => ({
      ...resumoPedido(r),
      totalValor: Number(r.totalValor || 0),
      notas: Number(r.notas || 0),
      diferencasLoja: Number(r.diferencasLoja || 0),
    }));
    return {
      aguardando: pedidos.filter((x) => x.status === "aguardando"),
      conferidos: pedidos.filter((x) => x.status === "conferido"),
      finalizados: pedidos.filter((x) => x.status === "finalizado").reverse(),
    };
  }),

  detalhe: protectedProcedure.input(z.object({ pedidoId: idSchema })).query(async ({ ctx, input }) => {
    exigirCompras(ctx);
    await ensureRecebimentoPneus();
    const pedido = await carregarPedido(input.pedidoId);
    const itens = await itensDoPedido(input.pedidoId);
    const notas = await notasDoPedido(input.pedidoId);
    return {
      pedido: { ...resumoPedido(pedido), totalValor: Number(pedido.totalValor || 0) },
      medidas: itens.map((i) => i.medida),
      itens: itens.map((i) => ({ id: i.id, medida: i.medida, quantidade: i.quantidade, quantidadeRecebida: i.quantidadeRecebida })),
      notas,
      comparacao: comparar(pedido, itens, notas),
    };
  }),

  anexarNota: protectedProcedure
    .input(z.object({ pedidoId: idSchema, xml: z.string().min(50).max(MAX_XML) }))
    .mutation(async ({ ctx, input }) => {
      exigirCompras(ctx);
      await ensureRecebimentoPneus();
      await exigirAberto(input.pedidoId);
      const nota = lerXmlNfe(input.xml);
      if (nota.chave) {
        const [existe] = await db().query<any[]>(
          `SELECT n.pedidoId FROM compras_pneus_pedido_notas n WHERE n.chave=? LIMIT 1`,
          [nota.chave]
        );
        if (existe.length) {
          const outro = Number(existe[0].pedidoId);
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              outro === input.pedidoId
                ? `A nota ${nota.numero} já está anexada neste pedido.`
                : `A nota ${nota.numero} já foi usada no pedido #${outro}.`,
          });
        }
      }
      await db().query(
        `INSERT INTO compras_pneus_pedido_notas
           (pedidoId, chave, numero, serie, emitenteNome, emitenteCnpj, destinatarioCnpj, dataEmissao, valorTotal, manual, itensJson, xml, anexadoPorNome)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
        [
          input.pedidoId,
          nota.chave || null,
          nota.numero || "s/n",
          nota.serie || null,
          nota.emitenteNome || null,
          nota.emitenteCnpj || null,
          nota.destinatarioCnpj || null,
          nota.dataEmissao || null,
          nota.valorTotal,
          JSON.stringify(nota.itens),
          input.xml,
          nomeUsuario(ctx),
        ]
      );
      return { ok: true, numero: nota.numero, itens: nota.itens.length };
    }),

  // Fornecedor que não mandou XML: registra só o número (a conferência fica pedido × recebido).
  notaManual: protectedProcedure
    .input(z.object({ pedidoId: idSchema, numero: z.string().trim().min(1).max(20), valorTotal: z.number().min(0).max(100_000_000).nullable() }))
    .mutation(async ({ ctx, input }) => {
      exigirCompras(ctx);
      await ensureRecebimentoPneus();
      await exigirAberto(input.pedidoId);
      await db().query(
        `INSERT INTO compras_pneus_pedido_notas (pedidoId, numero, valorTotal, manual, anexadoPorNome) VALUES (?, ?, ?, 1, ?)`,
        [input.pedidoId, input.numero, input.valorTotal, nomeUsuario(ctx)]
      );
      return { ok: true };
    }),

  removerNota: protectedProcedure.input(z.object({ notaId: idSchema })).mutation(async ({ ctx, input }) => {
    exigirCompras(ctx);
    await ensureRecebimentoPneus();
    const [rows] = await db().query<any[]>(`SELECT pedidoId FROM compras_pneus_pedido_notas WHERE id=? LIMIT 1`, [input.notaId]);
    if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Nota não encontrada." });
    await exigirAberto(Number(rows[0].pedidoId));
    await db().query(`DELETE FROM compras_pneus_pedido_notas WHERE id=?`, [input.notaId]);
    return { ok: true };
  }),

  // Item da nota que o sistema não reconheceu: o Compras diz a qual medida do pedido ele corresponde.
  associarItemNota: protectedProcedure
    .input(z.object({ notaId: idSchema, indice: z.number().int().min(0), medida: z.string().trim().max(40).nullable() }))
    .mutation(async ({ ctx, input }) => {
      exigirCompras(ctx);
      await ensureRecebimentoPneus();
      const [rows] = await db().query<any[]>(`SELECT pedidoId, itensJson FROM compras_pneus_pedido_notas WHERE id=? LIMIT 1`, [input.notaId]);
      if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Nota não encontrada." });
      const pedidoId = Number(rows[0].pedidoId);
      await exigirAberto(pedidoId);
      if (input.medida) {
        const medidas = (await itensDoPedido(pedidoId)).map((i) => i.medida);
        if (!medidas.includes(input.medida)) throw new TRPCError({ code: "BAD_REQUEST", message: "Essa medida não está no pedido." });
      }
      const itens = lerItensNota(rows[0].itensJson);
      const item = itens.find((i) => i.indice === input.indice);
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Item da nota não encontrado." });
      item.medida = input.medida || null;
      await db().query(`UPDATE compras_pneus_pedido_notas SET itensJson=? WHERE id=?`, [JSON.stringify(itens), input.notaId]);
      return { ok: true };
    }),

  // Quanto chegou de cada medida (o que a loja avisou).
  registrarRecebimento: protectedProcedure
    .input(
      z.object({
        pedidoId: idSchema,
        itens: z.array(z.object({ itemId: idSchema, quantidadeRecebida: z.number().int().min(0).max(10000) })).min(1).max(500),
        obs: z.string().trim().max(1000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      exigirCompras(ctx);
      await ensureRecebimentoPneus();
      const pedido = await exigirAberto(input.pedidoId);
      if (pedido.recebimentoStatus !== "aguardando") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "O recebimento desse pedido já foi registrado." });
      }
      const itens = await itensDoPedido(input.pedidoId);
      const informados = new Map(input.itens.map((i) => [i.itemId, i.quantidadeRecebida]));
      const faltando = itens.filter((i) => !informados.has(i.id));
      if (faltando.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Falta informar quanto chegou de ${faltando.map((f) => f.medida).join(", ")}.` });
      }
      const conn = await db().getConnection();
      try {
        await conn.beginTransaction();
        for (const item of itens) {
          await conn.query(`UPDATE compras_pneus_pedido_itens SET quantidadeRecebida=? WHERE id=?`, [informados.get(item.id), item.id]);
        }
        await conn.query(
          `UPDATE compras_pneus_pedidos
              SET recebimentoStatus='conferido', recebidoPorNome=?, recebidoEm=NOW(), recebimentoObs=?
            WHERE id=? AND recebimentoStatus='aguardando'`,
          [nomeUsuario(ctx), input.obs || null, input.pedidoId]
        );
        await conn.commit();
      } catch (error) {
        await conn.rollback();
        throw error;
      } finally {
        conn.release();
      }
      const diferencas = itens.filter((i) => informados.get(i.id) !== i.quantidade).length;
      return { ok: true, diferencas };
    }),

  // Registrou errado: volta para "aguardando" e mantém as quantidades para corrigir.
  corrigirRecebimento: protectedProcedure.input(z.object({ pedidoId: idSchema })).mutation(async ({ ctx, input }) => {
    exigirCompras(ctx);
    await ensureRecebimentoPneus();
    const pedido = await exigirAberto(input.pedidoId);
    if (pedido.recebimentoStatus !== "conferido") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "O recebimento desse pedido ainda não foi registrado." });
    }
    await db().query(`UPDATE compras_pneus_pedidos SET recebimentoStatus='aguardando' WHERE id=?`, [input.pedidoId]);
    return { ok: true };
  }),

  finalizar: protectedProcedure
    .input(z.object({ pedidoId: idSchema, justificativa: z.string().trim().max(2000) }))
    .mutation(async ({ ctx, input }) => {
      exigirCompras(ctx);
      await ensureRecebimentoPneus();
      const pedido = await exigirAberto(input.pedidoId);
      if (pedido.recebimentoStatus !== "conferido") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Registre o que chegou na loja antes de finalizar." });
      }
      const itens = await itensDoPedido(input.pedidoId);
      const notas = await notasDoPedido(input.pedidoId);
      if (!notas.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Anexe o XML da nota (ou informe o número da nota) antes de finalizar." });
      }
      const { divergente } = comparar(pedido, itens, notas);
      if (divergente && input.justificativa.length < 10) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Tem diferença entre pedido, recebimento e nota: escreva a justificativa para finalizar." });
      }
      await db().query(
        `UPDATE compras_pneus_pedidos
            SET recebimentoStatus='finalizado', finalizadoPorNome=?, finalizadoEm=NOW(),
                finalizadoComDivergencia=?, justificativa=?
          WHERE id=? AND recebimentoStatus='conferido'`,
        [nomeUsuario(ctx), divergente ? 1 : 0, input.justificativa || null, input.pedidoId]
      );
      // Guarda o CNPJ do fornecedor na primeira nota, para avisar se vier de outro CNPJ depois.
      const cnpj = notas.find((n) => n.emitenteCnpj)?.emitenteCnpj;
      if (cnpj) {
        await db().query(`UPDATE compras_pneus_fornecedores SET cnpj=? WHERE id=? AND cnpj IS NULL`, [cnpj, pedido.fornecedorId]);
      }
      return { ok: true, divergente };
    }),
});
