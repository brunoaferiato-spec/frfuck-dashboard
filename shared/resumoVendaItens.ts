// Leitura do PDF "RESUMO GERAL VENDA DE ITENS" do sistema da loja (um dia de vendas).
// Cada linha da tabela: código, item, aplicação, qtd vendida e o estoque atual (coluna ESTOQ.).
// As células são centralizadas e algumas têm várias linhas (aplicação): o código fica no meio da linha,
// então cada bloco de texto é ligado ao código mais próximo na altura.

export type TextoPdfItem = { s: string; x: number; y: number; w: number };
export type ItemResumoVenda = {
  codigo: string;
  item: string;
  aplicacao: string;
  qtdVendida: number;
  estoqueSistema: number;
};
export type ResumoVenda = { loja: string; dataInicio: string | null; dataFim: string | null; itens: ItemResumoVenda[] };

// Limites das colunas pelo centro do texto (pontos do PDF, página deitada).
const COLUNAS: Array<[string, number, number]> = [
  ["codigo", 0, 75],
  ["item", 75, 165],
  ["aplicacao", 165, 300],
  ["qtd", 300, 334],
  ["vlrTotal", 334, 375],
  ["preco", 375, 415],
  ["fornecedor", 415, 510],
  ["vlrComp", 510, 550],
  ["custoMin", 550, 585],
  ["fornCustoMin", 585, 675],
  ["estoque", 675, 725],
  ["estMin", 725, 760],
  ["custoMedio", 760, 9999],
];

function colunaDe(cx: number) {
  return COLUNAS.find(([, a, b]) => cx >= a && cx < b)?.[0] || "";
}

function numero(v: string) {
  const s = String(v || "").replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function dataIso(br: string) {
  const m = br.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

// Junta os textos de uma página em itens. `textos` = itens do pdf.js (x, y, largura) daquela página.
export function itensDaPagina(textos: TextoPdfItem[]) {
  // Só o corpo da tabela: abaixo do cabeçalho (linha "MÍN."/"MÉDIO") e acima do rodapé.
  const cab = textos.find((t) => /^CÓD\.?$/i.test(t.s.trim()));
  const topo = cab ? cab.y - 8 : 480;
  const corpo = textos.filter((t) => t.y < topo && t.y > 60 && t.s.trim());

  const ancoras = corpo
    .filter((t) => colunaDe(t.x + t.w / 2) === "codigo" && /^[A-Z0-9][A-Z0-9.\-/]*$/i.test(t.s.trim()))
    .sort((a, b) => b.y - a.y);
  if (!ancoras.length) return [];

  // Agrupa, por coluna, as linhas seguidas (espaço pequeno entre elas) em blocos.
  const porColuna = new Map<string, TextoPdfItem[]>();
  for (const t of corpo) {
    const c = colunaDe(t.x + t.w / 2);
    if (!c || c === "codigo") continue;
    porColuna.set(c, [...(porColuna.get(c) || []), t]);
  }
  const linhas = ancoras.map((a) => ({ a, campos: {} as Record<string, string[]> }));
  for (const [coluna, lista] of porColuna) {
    const ord = [...lista].sort((p, q) => q.y - p.y || p.x - q.x);
    const blocos: TextoPdfItem[][] = [];
    for (const t of ord) {
      const ult = blocos[blocos.length - 1];
      const ultimo = ult?.[ult.length - 1];
      if (ult && ultimo && ultimo.y - t.y <= 10.5) ult.push(t);
      else blocos.push([t]);
    }
    const maisProximo = (y: number, lista = linhas) => lista.reduce((m, l) => (Math.abs(l.a.y - y) < Math.abs(m.a.y - y) ? l : m), lista[0]);
    for (const b of blocos) {
      const centro = (b[0].y + b[b.length - 1].y) / 2;
      // Códigos cuja altura cai dentro do bloco. Um só: o bloco inteiro é dele (aplicação de várias linhas).
      // Dois ou mais: linhas baixinhas de itens vizinhos grudaram; cada linha vai para o código mais próximo.
      const dentro = linhas.filter((l) => l.a.y <= b[0].y + 3 && l.a.y >= b[b.length - 1].y - 3);
      // Entre dois códigos vizinhos, a divisa é o maior espaço entre as linhas que ficam entre eles.
      const divisas: number[] = [];
      for (let i = 0; i + 1 < dentro.length; i++) {
        const [cima, baixo] = [dentro[i].a.y, dentro[i + 1].a.y];
        const entre = b.map((t) => t.y).filter((y) => y < cima + 1 && y > baixo - 1);
        let corte = (cima + baixo) / 2;
        let maior = -1;
        for (let j = 0; j + 1 < entre.length; j++) {
          const gap = entre[j] - entre[j + 1];
          if (gap > maior + 0.01) { maior = gap; corte = (entre[j] + entre[j + 1]) / 2; }
        }
        divisas.push(corte);
      }
      const destinoDe = (t: TextoPdfItem) => {
        if (dentro.length === 0) return maisProximo(centro);
        let i = 0;
        while (i < divisas.length && t.y < divisas[i]) i++;
        return dentro[i];
      };
      // Linhas na mesma altura viram uma só (ex.: "RENAULT" e "FLUENCE" lado a lado).
      let yAtual = Infinity;
      let destinoAtual: (typeof linhas)[number] | null = null;
      for (const t of b) {
        const alvo = destinoDe(t);
        const lista = (alvo.campos[coluna] = alvo.campos[coluna] || []);
        if (alvo === destinoAtual && Math.abs(t.y - yAtual) < 1.5 && lista.length) lista[lista.length - 1] += ` ${t.s.trim()}`;
        else lista.push(t.s.trim());
        yAtual = t.y;
        destinoAtual = alvo;
      }
    }
  }

  return linhas.map(({ a, campos }) => ({
    codigo: a.s.trim(),
    item: (campos.item || []).join(" ").replace(/\s+/g, " ").trim(),
    aplicacao: (campos.aplicacao || []).filter((s) => s !== ".").join("\n").trim(),
    qtdVendida: numero((campos.qtd || [])[0] || "0"),
    estoqueSistema: numero((campos.estoque || [])[0] || "0"),
  }));
}

export function lerResumoVenda(paginas: TextoPdfItem[][]): ResumoVenda {
  const primeira = paginas[0] || [];
  const titulo = primeira.find((t) => /RESUMO GERAL VENDA DE ITENS/i.test(t.s))?.s || "";
  const loja = titulo.replace(/-\s*RESUMO GERAL VENDA DE ITENS/i, "").replace(/^F\.\s*/i, "").trim();
  const periodo = primeira.find((t) => /\d{2}\/\d{2}\/\d{4}\s*-\s*\d{2}\/\d{2}\/\d{4}/.test(t.s))?.s || "";
  const [ini, fim] = periodo.split("-").map((p) => dataIso(p.trim()));
  const itens = paginas.flatMap((p) => itensDaPagina(p));
  return { loja, dataInicio: ini || null, dataFim: fim || ini || null, itens };
}
