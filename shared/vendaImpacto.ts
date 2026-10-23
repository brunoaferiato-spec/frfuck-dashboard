// Leitura do PDF de venda do Impacto Prime ("VENDA Nº ..."): dados do cliente, do veículo e os pneus vendidos.
// Recebe as linhas de texto do PDF (cada linha = itens da esquerda para a direita), para servir no navegador e em testes.

export type TextoPdf = { s: string; x: number };
export type PneuVendido = { codigo: string; descricao: string; quantidade: number };
export type DadosVenda = {
  vendaNumero: string;
  vendaData: string | null; // AAAA-MM-DD
  cnpjEmpresa: string;
  clienteNome: string;
  clienteCpf: string;
  clienteTelefone: string;
  clienteEndereco: string;
  clienteBairro: string;
  clienteCep: string;
  clienteCidade: string;
  clienteUf: string;
  veiculo: string;
  veiculoAno: string;
  placa: string;
  kmVenda: number | null;
  pneus: PneuVendido[];
};

function limpar(v: unknown) {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

function semAcento(v: string) {
  return v.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
}

const ehRotulo = (s: string) => /:\s*$/.test(s);

// Valor que vem logo à direita do rótulo, na mesma linha (vazio se o próximo item já é outro rótulo).
function valorDoRotulo(linhas: TextoPdf[][], rotulo: string, de = 0, ate = linhas.length) {
  const alvo = semAcento(rotulo);
  for (let i = de; i < ate; i++) {
    const linha = linhas[i];
    const pos = linha.findIndex((t) => semAcento(limpar(t.s)) === alvo);
    if (pos < 0) continue;
    const prox = linha[pos + 1];
    return prox && !ehRotulo(limpar(prox.s)) ? limpar(prox.s) : "";
  }
  return "";
}

function indiceDoTitulo(linhas: TextoPdf[][], titulo: string, de = 0) {
  const alvo = semAcento(titulo);
  for (let i = de; i < linhas.length; i++) {
    if (linhas[i].length === 1 && semAcento(limpar(linhas[i][0].s)) === alvo) return i;
  }
  return -1;
}

export function extrairVenda(linhas: TextoPdf[][]): DadosVenda {
  const texto = linhas.map((l) => l.map((t) => t.s).join(" ")).join("\n");
  const numero = texto.match(/VENDA\s+N[º°o]?\s*(\d+)/i)?.[1] || "";
  const data = texto.match(/VENDA:\s*(\d{2})\/(\d{2})\/(\d{4})/i);

  const iEmpresa = indiceDoTitulo(linhas, "EMPRESA");
  const iCliente = indiceDoTitulo(linhas, "CLIENTE");
  const iConsultores = indiceDoTitulo(linhas, "CONSULTORES");
  const iVeiculo = indiceDoTitulo(linhas, "VEÍCULO");
  const iItens = indiceDoTitulo(linhas, "ITENS ADQUIRIDOS");
  const fimCliente = iConsultores > iCliente ? iConsultores : linhas.length;

  const pneus: PneuVendido[] = [];
  if (iItens >= 0) {
    for (let i = iItens + 1; i < linhas.length; i++) {
      const linha = linhas[i];
      if (linha.some((t) => /^SUBTOTAL$/i.test(limpar(t.s)))) break;
      const desc = linha.find((t) => /^PNEU\b/i.test(limpar(t.s)));
      if (!desc) continue;
      const codigo = linha.find((t) => t.x < desc.x && limpar(t.s));
      const qtd = linha.find((t) => t.x > desc.x && /^\d+$/.test(limpar(t.s)));
      pneus.push({ codigo: codigo ? limpar(codigo.s) : "", descricao: limpar(desc.s), quantidade: qtd ? Number(limpar(qtd.s)) : 1 });
    }
  }

  const km = valorDoRotulo(linhas, "KM:", Math.max(0, iVeiculo)).replace(/\D/g, "");
  return {
    vendaNumero: numero,
    vendaData: data ? `${data[3]}-${data[2]}-${data[1]}` : null,
    cnpjEmpresa: valorDoRotulo(linhas, "CNPJ:", Math.max(0, iEmpresa), iCliente > 0 ? iCliente : linhas.length),
    clienteNome: valorDoRotulo(linhas, "NOME:", Math.max(0, iCliente), fimCliente),
    clienteCpf: valorDoRotulo(linhas, "CPF/CNPJ:", Math.max(0, iCliente), fimCliente),
    clienteTelefone: valorDoRotulo(linhas, "TELEFONE:", Math.max(0, iCliente), fimCliente),
    clienteEndereco: valorDoRotulo(linhas, "LOGRADOURO:", Math.max(0, iCliente), fimCliente),
    clienteBairro: valorDoRotulo(linhas, "BAIRRO:", Math.max(0, iCliente), fimCliente),
    clienteCep: valorDoRotulo(linhas, "CEP:", Math.max(0, iCliente), fimCliente),
    clienteCidade: valorDoRotulo(linhas, "CIDADE:", Math.max(0, iCliente), fimCliente),
    clienteUf: valorDoRotulo(linhas, "UF:", Math.max(0, iCliente), fimCliente),
    veiculo: valorDoRotulo(linhas, "VEÍCULO:", Math.max(0, iVeiculo)),
    veiculoAno: valorDoRotulo(linhas, "ANO:", Math.max(0, iVeiculo)),
    placa: valorDoRotulo(linhas, "PLACA:", Math.max(0, iVeiculo)),
    kmVenda: km ? Number(km) : null,
    pneus,
  };
}

// Agrupa os itens de texto do pdf.js em linhas (mesma altura), de cima para baixo e da esquerda para a direita.
export function linhasDoPdf(itens: Array<{ str: string; transform: number[] }>): TextoPdf[][] {
  const linhas: Array<{ y: number; itens: TextoPdf[] }> = [];
  for (const it of itens) {
    if (!String(it.str || "").trim()) continue;
    const x = it.transform[4];
    const y = it.transform[5];
    const linha = linhas.find((l) => Math.abs(l.y - y) <= 2);
    if (linha) linha.itens.push({ s: it.str, x });
    else linhas.push({ y, itens: [{ s: it.str, x }] });
  }
  return linhas.sort((a, b) => b.y - a.y).map((l) => l.itens.sort((a, b) => a.x - b.x));
}
