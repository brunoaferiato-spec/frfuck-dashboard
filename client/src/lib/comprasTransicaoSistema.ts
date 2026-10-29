// Gravataí trocou de sistema em 19/10/2026: até 19/12 a venda do período fica dividida entre o
// sistema antigo e o novo. Peças e Amortecedores aceitam o relatório antigo só para somar a venda;
// o estoque vem sempre do sistema novo.

export const LOJA_TRANSICAO_SISTEMA = "7";

export function transicaoSistemaAtiva(lojaId: string | number | null | undefined) {
  return new Date() < new Date(2026, 11, 20) && String(lojaId ?? "") === LOJA_TRANSICAO_SISTEMA;
}

type Linha = Record<string, unknown>;

function normalizar(valor: unknown) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function chaveCampo(valor: unknown) {
  return normalizar(valor).replace(/[^A-Z0-9]+/g, " ").trim();
}

function campoReal(linha: Linha, nomes: string[]) {
  const mapa = new Map(Object.keys(linha).map((k) => [chaveCampo(k), k]));
  for (const nome of nomes) {
    const real = mapa.get(chaveCampo(nome));
    if (real) return real;
  }
  return null;
}

function numeroBR(valor: unknown) {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;
  const limpo = String(valor ?? "").trim().replace(/\s/g, "").replace(/R\$/gi, "").replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, "");
  const numero = Number(limpo);
  return Number.isFinite(numero) ? numero : 0;
}

const CAMPOS = {
  codigo: ["CÓDIGO", "CODIGO", "COD"],
  item: ["ITEM", "DESCRIÇÃO", "DESCRICAO"],
  venda: ["VENDA PERIODO", "VENDA PERÍODO"],
  estoque: ["ESTOQUE ATUAL", "ESTOQUE"],
};

/**
 * Soma a venda do relatório antigo na linha do mesmo código (ou, se o código mudou, do mesmo item)
 * do relatório novo. Item que só vendeu no sistema antigo entra com estoque 0.
 */
export function combinarVendasSistemaAntigo(linhasNovo: Linha[], linhasAntigo: Linha[]) {
  const modelo = linhasNovo.find((l) => campoReal(l, CAMPOS.codigo) && campoReal(l, CAMPOS.venda)) || linhasNovo[0] || {};
  const kCodigo = campoReal(modelo, CAMPOS.codigo) || "CODIGO";
  const kItem = campoReal(modelo, CAMPOS.item) || "ITEM";
  const kVenda = campoReal(modelo, CAMPOS.venda) || "VENDA PERIODO";
  const kEstoque = campoReal(modelo, CAMPOS.estoque) || "ESTOQUE ATUAL";

  const resultado = linhasNovo.map((l) => ({ ...l }));
  const porCodigo = new Map<string, Linha>();
  const porItem = new Map<string, Linha>();
  for (const linha of resultado) {
    const codigo = normalizar(linha[kCodigo]);
    const item = normalizar(linha[kItem]);
    if (codigo && !porCodigo.has(codigo)) porCodigo.set(codigo, linha);
    if (item && !porItem.has(item)) porItem.set(item, linha);
  }

  let vendasSomadas = 0;
  const soNoAntigo: string[] = [];

  for (const antiga of linhasAntigo) {
    const kc = campoReal(antiga, CAMPOS.codigo);
    const ki = campoReal(antiga, CAMPOS.item);
    const kv = campoReal(antiga, CAMPOS.venda);
    if (!kc || !kv) continue;
    const codigo = String(antiga[kc] ?? "").trim();
    const item = ki ? String(antiga[ki] ?? "").trim() : "";
    const venda = numeroBR(antiga[kv]);
    if (!codigo || venda <= 0) continue;

    vendasSomadas += venda;
    const destino = porCodigo.get(normalizar(codigo)) || (item ? porItem.get(normalizar(item)) : undefined);
    if (destino) {
      destino[kVenda] = numeroBR(destino[kVenda]) + venda;
    } else {
      const nova: Linha = { [kCodigo]: codigo, [kItem]: item, [kVenda]: venda, [kEstoque]: 0 };
      resultado.push(nova);
      porCodigo.set(normalizar(codigo), nova);
      if (item) porItem.set(normalizar(item), nova);
      soNoAntigo.push(codigo);
    }
  }

  return { linhas: resultado, vendasSomadas, soNoAntigo };
}
