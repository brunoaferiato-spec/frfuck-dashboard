// Contagem semanal de estoque: cada semana o estoquista conta alguns grupos de peças (ciclo de 4 semanas que se repete).
// Ele imprime o relatório "ESTOQUE DE ITENS" do grupo, conta no papel, anexa o PDF, as fotos das folhas e as alterações.

import type { TextoPdfItem } from "./resumoVendaItens";

export const GRUPOS_ESTOQUE = {
  terminal_direcao: "Terminal de direção",
  terminal_axial: "Terminal axial",
  pivo: "Pivô",
  pneus: "Pneus",
  amortecedor: "Amortecedor",
  bieleta: "Bieleta",
  oleos: "Óleos",
  fluidos: "Fluidos",
  bucha: "Bucha",
  coxim: "Coxim",
  kit_amortecedor: "Kit amortecedor",
  pastilha: "Pastilha",
  disco_freio: "Disco de freio",
  cilindro_freio: "Cilindro de freio",
} as const;
export type GrupoEstoque = keyof typeof GRUPOS_ESTOQUE;

// Pneu é contado a cada 15 dias (semanas 1 e 3); a bieleta só na semana 2.
export const CICLO_SEMANAS: Record<1 | 2 | 3 | 4, GrupoEstoque[]> = {
  1: ["terminal_direcao", "terminal_axial", "pivo", "pneus"],
  2: ["amortecedor", "bieleta", "oleos", "fluidos"],
  3: ["bucha", "coxim", "kit_amortecedor", "pneus"],
  4: ["pastilha", "disco_freio", "cilindro_freio"],
};

// Segunda-feira em que começa a semana 1 do primeiro ciclo.
export const INICIO_CICLO = "2026-10-26";

function diaUtc(iso: string) {
  const [a, m, d] = iso.split("-").map(Number);
  return Date.UTC(a, m - 1, d);
}
function isoUtc(ms: number) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

// Segunda-feira da semana de uma data.
export function segundaDaSemana(iso: string) {
  const ms = diaUtc(iso);
  const dow = new Date(ms).getUTCDay(); // 0 = domingo
  return isoUtc(ms - ((dow + 6) % 7) * 86400000);
}
export function somarDias(iso: string, dias: number) {
  return isoUtc(diaUtc(iso) + dias * 86400000);
}

// Número da semana no ciclo (1 a 4) de uma semana que começa na segunda informada; null antes do início.
export function semanaDoCiclo(segunda: string): 1 | 2 | 3 | 4 | null {
  const idx = Math.floor((diaUtc(segunda) - diaUtc(INICIO_CICLO)) / (7 * 86400000));
  if (idx < 0) return null;
  return ((idx % 4) + 1) as 1 | 2 | 3 | 4;
}

export function gruposDaSemana(segunda: string) {
  const n = semanaDoCiclo(segunda);
  return n ? CICLO_SEMANAS[n] : [];
}

// ---------- leitura do PDF "ESTOQUE DE ITENS" ----------
export type ItemEstoque = { codigo: string; item: string; qtd: number };
export type RelatorioEstoque = { loja: string; itens: ItemEstoque[]; total: number | null };

function numero(v: string) {
  const n = Number(String(v || "").replace(/\s/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function lerEstoqueItens(paginas: TextoPdfItem[][]): RelatorioEstoque {
  let loja = "";
  let total: number | null = null;
  const itens: ItemEstoque[] = [];
  for (const textos of paginas) {
    const ts = textos.filter((t) => t.s.trim());
    const titulo = ts.find((t) => /ESTOQUE DE ITENS/i.test(t.s));
    if (titulo && !loja) loja = titulo.s.replace(/-\s*ESTOQUE DE ITENS.*/i, "").replace(/^F\.\s*/i, "").trim();
    // Linhas pela altura; o código fica na primeira coluna (centro < 80).
    const linhas: TextoPdfItem[][] = [];
    for (const t of [...ts].sort((a, b) => b.y - a.y || a.x - b.x)) {
      const l = linhas[linhas.length - 1];
      if (l && Math.abs(l[0].y - t.y) <= 3) l.push(t);
      else linhas.push([t]);
    }
    for (const l of linhas) {
      const col = (a: number, b: number) => l.filter((t) => t.x + t.w / 2 >= a && t.x + t.w / 2 < b).map((t) => t.s.trim()).join(" ").trim();
      const codigo = col(0, 80);
      const item = col(80, 300);
      const qtd = col(300, 380);
      if (/^TOTAIS$/i.test(item) || /^TOTAIS$/i.test(codigo)) { total = numero(qtd); continue; }
      if (!codigo || /^C[ÓO]DIGO$/i.test(codigo) || /^\d{2}\/\d{2}\/\d{4}/.test(codigo)) continue;
      if (!qtd || !/^-?[\d.,]+$/.test(qtd)) continue;
      itens.push({ codigo, item, qtd: numero(qtd) });
    }
  }
  return { loja, itens, total };
}
