// Leitura do PDF "COMPRAS X OS" do sistema da loja (um dia) e a regra da conferência:
// o estoquista só compra peça para carro que está na loja, então toda compra tem que sair no mesmo dia.
// Cada produto vem num bloco "CÓDIGO - NOME" com as linhas de movimento (COMPRA, VENDA, AJUSTE, GARANTIA) e TOTAIS.

import type { TextoPdfItem } from "./resumoVendaItens";

export type MovimentoCompraOS = {
  tipo: string;
  documento: string;
  qtdAnterior: number;
  qtdMovimento: number;
  qtdFinal: number;
};
export type ProdutoCompraOS = { codigo: string; item: string; movimentos: MovimentoCompraOS[] };
export type CompraOSErrado = ProdutoCompraOS & {
  qtdComprada: number;
  estoqueAntes: number;
  qtdFinal: number;
  sobrou: number;
  motivo: string;
};
export type RelatorioCompraOS = { loja: string; dataInicio: string | null; dataFim: string | null; produtos: ProdutoCompraOS[] };

// Colunas pela posição da esquerda do texto (pontos do PDF, página deitada).
const COLUNAS: Array<[keyof MovimentoCompraOS | "data" | "outro", number, number]> = [
  ["data", 0, 95],
  ["qtdAnterior", 95, 160],
  ["outro", 160, 295],
  ["tipo", 295, 365],
  ["documento", 365, 425],
  ["qtdMovimento", 425, 490],
  ["outro", 490, 610],
  ["qtdFinal", 610, 665],
  ["outro", 665, 9999],
];

function numero(v: string) {
  const n = Number(String(v || "").replace(/\s/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
function dataIso(br: string) {
  const m = String(br || "").match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

function linhasDaPagina(textos: TextoPdfItem[]) {
  const itens = textos.filter((t) => t.s.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
  const linhas: TextoPdfItem[][] = [];
  for (const t of itens) {
    const ultima = linhas[linhas.length - 1];
    if (ultima && Math.abs(ultima[0].y - t.y) <= 2) ultima.push(t);
    else linhas.push([t]);
  }
  return linhas.map((l) => l.sort((a, b) => a.x - b.x));
}

export function lerComprasOS(paginas: TextoPdfItem[][]): RelatorioCompraOS {
  let loja = "";
  let periodo = "";
  const produtos: ProdutoCompraOS[] = [];
  let atual: ProdutoCompraOS | null = null;
  for (const textos of paginas) {
    for (const linha of linhasDaPagina(textos)) {
      const texto = linha.map((t) => t.s.trim()).join(" ").trim();
      if (/COMPRAS\s*X\s*OS/i.test(texto)) {
        if (!loja) loja = texto.replace(/-\s*COMPRAS\s*X\s*OS.*/i, "").replace(/^F\.\s*/i, "").trim();
        continue;
      }
      if (/^\d{2}\/\d{2}\/\d{4}\s*-\s*\d{2}\/\d{2}\/\d{4}$/.test(texto)) {
        if (!periodo) periodo = texto;
        continue;
      }
      if (/^DATA\b/i.test(texto) || /^TOTAIS\b/i.test(texto)) continue;
      // Rodapé: data e hora da emissão + "1 / 5".
      if (/^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}/.test(texto)) continue;
      const primeiro = linha[0];
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(primeiro.s.trim()) && primeiro.x < 95) {
        if (!atual) continue;
        const m: Record<string, string> = {};
        for (const t of linha) {
          const col = COLUNAS.find(([, a, b]) => t.x >= a && t.x < b)?.[0] || "outro";
          if (col !== "outro") m[col] = m[col] ? `${m[col]} ${t.s.trim()}` : t.s.trim();
        }
        atual.movimentos.push({
          tipo: String(m.tipo || "").toUpperCase(),
          documento: m.documento || "",
          qtdAnterior: numero(m.qtdAnterior),
          qtdMovimento: numero(m.qtdMovimento),
          qtdFinal: numero(m.qtdFinal),
        });
        continue;
      }
      // Título do produto (centralizado): "CÓDIGO - NOME".
      const t = texto.match(/^(\S+)\s+-\s+(.+)$/);
      if (t && primeiro.x > 150) {
        atual = { codigo: t[1].trim(), item: t[2].trim(), movimentos: [] };
        produtos.push(atual);
      }
    }
  }
  const [ini, fim] = periodo.split(/\s+-\s+/).map((p) => dataIso(p));
  return { loja, dataInicio: ini || null, dataFim: fim || ini || null, produtos };
}

const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

// O estoque não compra pneu: produto de pneu nunca entra na conferência.
export function ehPneu(p: Pick<ProdutoCompraOS, "item">) {
  return /^PNEU\b/i.test(String(p.item || "").trim());
}

// Compra semanal de reposição (amortecedor, peças): a mesma nota fiscal aparece em muitos produtos.
// Nota com COMPRA em 5 produtos ou mais é reposição, e tudo o que entrou com ela é desconsiderado.
export const MIN_PRODUTOS_NOTA_REPOSICAO = 5;
export type NotaReposicao = { documento: string; produtos: number; pecas: number };

export function notasReposicao(produtos: ProdutoCompraOS[]): NotaReposicao[] {
  const porNota = new Map<string, { produtos: Set<string>; pecas: number }>();
  for (const p of produtos) {
    if (ehPneu(p)) continue;
    for (const m of p.movimentos) {
      if (m.tipo !== "COMPRA" || !m.documento) continue;
      const n = porNota.get(m.documento) || { produtos: new Set<string>(), pecas: 0 };
      n.produtos.add(p.codigo);
      n.pecas += m.qtdMovimento;
      porNota.set(m.documento, n);
    }
  }
  return Array.from(porNota.entries())
    .filter(([, n]) => n.produtos.size >= MIN_PRODUTOS_NOTA_REPOSICAO)
    .map(([documento, n]) => ({ documento, produtos: n.produtos.size, pecas: n.pecas }))
    .sort((a, b) => b.produtos - a.produtos);
}

// Regra combinada com o Bruno:
// - pneu e produto sem COMPRA do dia a dia são ignorados (só venda, ou só reposição);
// - errado se já tinha a peça no estoque quando comprou (QTD ANTERIOR da primeira compra do dia a dia > 0);
// - errado se sobrou no fim do dia mais do que já tinha antes + o que chegou de reposição depois da compra
//   (se saiu mais, diminui da reposição e está certo);
// - ajuste que zera o estoque antes da compra e terminar zerado está certo; GARANTIA conta como saída.
export function avaliarCompraOS(p: ProdutoCompraOS, reposicao: Set<string> = new Set()): CompraOSErrado | null {
  if (ehPneu(p) || !p.movimentos.length) return null;
  const ehReposicao = (m: MovimentoCompraOS) => m.tipo === "COMPRA" && reposicao.has(m.documento);
  const primeira = p.movimentos.findIndex((m) => m.tipo === "COMPRA" && !ehReposicao(m));
  if (primeira < 0) return null;
  const compras = p.movimentos.filter((m) => m.tipo === "COMPRA" && !ehReposicao(m));
  const qtdComprada = compras.reduce((s, m) => s + m.qtdMovimento, 0);
  const estoqueAntes = p.movimentos[primeira].qtdAnterior;
  const reposicaoDepois = p.movimentos.slice(primeira + 1).filter(ehReposicao).reduce((s, m) => s + m.qtdMovimento, 0);
  const qtdFinal = p.movimentos[p.movimentos.length - 1].qtdFinal;
  const sobrou = Math.max(0, qtdFinal - Math.max(0, estoqueAntes) - reposicaoDepois);
  const motivos: string[] = [];
  if (estoqueAntes > 0) motivos.push(`Já tinha ${fmt(estoqueAntes)} no estoque quando comprou`);
  if (sobrou > 0) motivos.push(`Comprou ${fmt(qtdComprada)} e sobraram ${fmt(sobrou)} no estoque no fim do dia${reposicaoDepois ? ` (já descontada a reposição de ${fmt(reposicaoDepois)})` : ""}`);
  if (!motivos.length) return null;
  return { ...p, qtdComprada, estoqueAntes, qtdFinal, sobrou, motivo: motivos.join(". ") };
}

// Produtos que entram na conferência (com compra do dia a dia) e os errados.
export function conferirCompraOS(produtos: ProdutoCompraOS[]) {
  const notas = notasReposicao(produtos);
  const reposicao = new Set(notas.map((n) => n.documento));
  const comprados = produtos.filter((p) => !ehPneu(p) && p.movimentos.some((m) => m.tipo === "COMPRA" && !reposicao.has(m.documento))).length;
  const errados = produtos.map((p) => avaliarCompraOS(p, reposicao)).filter((x): x is CompraOSErrado => !!x);
  return { notas, comprados, errados };
}

export function itensErradosCompraOS(r: RelatorioCompraOS) {
  return conferirCompraOS(r.produtos).errados;
}
