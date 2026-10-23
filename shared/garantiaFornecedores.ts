import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { Empresa } from "./empresas";

// Formulários de garantia de cada fornecedor, preenchidos com os dados da garantia.
// Cada modelo é o PDF original do fornecedor (client/public/garantia/fornecedores) e escrevemos por cima.

// Telefone que vai em todos os formulários de fornecedor (o setor de Compras atende as garantias).
export const TELEFONE_COMPRAS = "47 9187-6410";

export type FotoFormulario = { bytes: Uint8Array; mime: string };
// Fotos por tipo, para os fornecedores que pedem as fotos dentro do formulário (GF).
export type FotosFormulario = Partial<Record<"dot" | "marca" | "completa" | "interna" | "banda", FotoFormulario[]>>;

export type DadosFormulario = {
  clienteCpf: string;
  // Consumidor (da venda)
  clienteNome: string;
  clienteEndereco: string;
  clienteBairro: string;
  clienteCep: string;
  clienteCidade: string;
  clienteUf: string;
  clienteTelefone: string;
  // Pneu e uso
  codigoProduto: string;
  medida: string;
  modelo: string;
  marca: string;
  carga: string;
  dot: string;
  kmRodado: number | null;
  posicao: string;
  defeito: string;
  tipoServico: "passeio" | "taxi" | "onibus" | "caminhao" | "outros";
  // Veículo
  veiculoMarca: string;
  veiculoModelo: string;
  veiculoAno: string;
  placa: string;
  // Nota fiscal da venda ao consumidor
  notaFiscal: string;
  notaSerie: string;
  notaData: string | null; // AAAA-MM-DD
  // Nota fiscal de compra do fornecedor (GF) e sulco do pneu
  nfFornecedor: string;
  nfFornecedorSerie: string;
  nfFornecedorData: string | null;
  sulco: string;
  // Polo: data de montagem (venda), KM atual do veículo, pressão de ar e e-mail de contato
  dataMontagem: string | null;
  kmAtual: number | null;
  pressao: string;
  emailCompras: string;
};

export type ModeloFornecedor = {
  id: string;
  nome: string; // como aparece no campo Fornecedor
  apelidos: string[]; // nomes que também identificam o fornecedor
  arquivo: string; // caminho público do PDF original
  campos: string[]; // campos extras pedidos por esse formulário
  fotos: boolean; // o formulário leva as fotos dentro do PDF
  preencher: (pdf: Uint8Array, dados: DadosFormulario, empresa: Empresa, fotos?: FotosFormulario) => Promise<Uint8Array>;
};

function semAcento(v: string) {
  return v.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
}

// "PNEU 205/55/16 LANVIGATOR COMFORT 1 91H" → medida, marca, modelo e índice de carga/velocidade.
export function separarPneu(descricao: string) {
  const partes = String(descricao || "").trim().split(/\s+/).filter((p) => !/^PNEUS?$/i.test(p));
  const iMedida = partes.findIndex((p) => /\d{3}\/\d{2}/.test(p) || /^\d{2,3}R\d{2}/i.test(p));
  const medida = iMedida >= 0 ? partes[iMedida] : "";
  const resto = iMedida >= 0 ? partes.slice(iMedida + 1) : partes;
  const carga = resto.length > 1 && /^\d{2,3}(\/\d{2,3})?[A-Z]{1,2}$/i.test(resto[resto.length - 1]) ? resto[resto.length - 1] : "";
  const semCarga = carga ? resto.slice(0, -1) : resto;
  return { medida, marca: semCarga[0] || "", modelo: semCarga.slice(1).join(" "), carga };
}

export function lados(posicao: string) {
  const p = semAcento(posicao);
  return {
    dianteiro: /DIANT/.test(p),
    traseiro: /TRAS/.test(p),
    esquerdo: /ESQ/.test(p),
    direito: /DIR/.test(p),
  };
}

export function modeloDoFornecedor(nome: string | null | undefined) {
  const n = semAcento(String(nome || ""));
  if (!n) return null;
  return MODELOS_FORNECEDOR.find((m) => [m.nome, ...m.apelidos].some((a) => n.includes(semAcento(a)))) || null;
}

function digitos(v: string) {
  return String(v || "").replace(/\D/g, "");
}

// ---------- SIQUEIRA CAMPOS: Formulário de Análise de Produtos (FAP), página 1, seções A a F ----------
async function preencherSiqueira(pdfBytes: Uint8Array, d: DadosFormulario, e: Empresa) {
  const doc = await PDFDocument.load(pdfBytes);
  const pag = doc.getPage(0);
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
  const cor = rgb(0.05, 0.05, 0.35);

  // Texto em uma linha; diminui a letra se não couber na largura do campo.
  const texto = (v: unknown, x: number, y: number, largura = 200, tamanho = 7.5) => {
    let s = String(v ?? "").trim();
    if (!s) return;
    s = s.replace(/[^\x20-\x7E -ÿ]/g, "");
    let t = tamanho;
    while (t > 5 && fonte.widthOfTextAtSize(s, t) > largura) t -= 0.25;
    pag.drawText(s, { x, y, size: t, font: fonte, color: cor });
  };
  // Um caractere centralizado em cada quadradinho (CEP, data, placa).
  const caixas = (v: string, centros: number[], y: number) => {
    const s = String(v || "").toUpperCase();
    centros.forEach((cx, i) => {
      const c = s[i];
      if (!c) return;
      pag.drawText(c, { x: cx - fonte.widthOfTextAtSize(c, 7.5) / 2, y, size: 7.5, font: fonte, color: cor });
    });
  };
  const marcar = (cx: number, y: number) => pag.drawText("X", { x: cx - 2.6, y, size: 8, font: negrito, color: cor });
  const centrado = (v: unknown, cx: number, y: number, largura: number) => {
    const s = String(v ?? "").trim();
    if (!s) return;
    let t = 7.5;
    while (t > 5 && fonte.widthOfTextAtSize(s, t) > largura) t -= 0.25;
    pag.drawText(s, { x: cx - fonte.widthOfTextAtSize(s, t) / 2, y, size: t, font: fonte, color: cor });
  };

  const CEP = [436.9, 449.7, 461.2, 472.6, 485.4, 511.3, 524.1, 537.4];
  const DATA = [449.6, 461.0, 485.4, 498.5, 524.1, 537.4];
  const PLACA = [449.6, 461.0, 472.6, 485.4, 498.5, 511.3, 524.1, 537.4];

  // A — Consumidor
  texto(d.clienteNome, 120, 726.7, 420);
  texto([d.clienteEndereco, d.clienteBairro].filter(Boolean).join(" - "), 106, 715.5, 295);
  caixas(digitos(d.clienteCep), CEP, 715.5);
  texto(d.clienteCidade, 98, 704.4, 240);
  texto(d.clienteUf, 364, 704.4, 38);
  texto(d.clienteTelefone, 430, 704.4, 112);

  // B — Revendedor (a loja)
  texto(e.razaoSocial, 281, 693.2, 262);
  texto(e.logradouro, 106, 682.1, 295);
  caixas(digitos(e.cep), CEP, 682.1);
  texto(e.cidade, 98, 670.9, 240);
  texto(e.uf, 364, 670.9, 38);
  texto(TELEFONE_COMPRAS, 430, 670.9, 112);
  texto(e.cnpj, 93, 659.7, 200);
  texto(e.ie, 359, 659.7, 185);
  texto(d.notaFiscal, 124, 648.6, 172);
  texto(d.notaSerie, 324, 648.6, 92);
  if (d.notaData) {
    const [a, m, dia] = d.notaData.split("-");
    caixas(`${dia}${m}${a.slice(2)}`, DATA, 648.6);
  }

  // C — Produto reclamado: sempre pneu
  marcar(253.5, 637.4);
  centrado(d.codigoProduto, 107, 608, 74);
  centrado(d.medida, 174, 608, 54);
  centrado(d.modelo, 225, 608, 42);
  centrado(d.marca, 281, 608, 64);
  centrado(d.carga, 352, 608, 72);
  centrado(d.dot, 435, 603.5, 84);
  centrado(d.kmRodado == null ? "" : `${d.kmRodado.toLocaleString("pt-BR")} km`, 512, 608, 62);

  // D — Veículo
  texto(d.veiculoMarca, 97, 581.6, 85);
  texto(d.veiculoModelo, 222, 581.6, 76);
  texto(d.veiculoAno, 373, 581.6, 45);
  caixas(String(d.placa || "").replace(/[^A-Za-z0-9]/g, ""), PLACA, 581.6);
  marcar(240, 570.4); // Blindado: não

  // E — Condição de uso: sempre asfalto
  marcar(154, 548.1);
  const l = lados(d.posicao);
  if (l.dianteiro) marcar(154, 537);
  if (l.traseiro) marcar(211, 537);
  if (l.esquerdo) marcar(352, 537);
  if (l.direito) marcar(437, 537);
  const servico: Record<DadosFormulario["tipoServico"], number> = { passeio: 154, taxi: 211, onibus: 271, caminhao: 352, outros: 412 };
  marcar(servico[d.tipoServico] ?? 154, 525.8);

  // F — Defeito alegado
  texto(d.defeito, 182, 514.6, 360);

  return doc.save();
}

// ---------- GF PNEUS: Formulário de Análise de Produtos Importados (FAPI) ----------
// O PDF que temos é um exemplo já preenchido: antes de escrever, cobre os valores antigos com a cor da célula.
async function preencherGf(pdfBytes: Uint8Array, d: DadosFormulario, e: Empresa, fotos: FotosFormulario = {}) {
  const doc = await PDFDocument.load(pdfBytes);
  const [p1, p2, p3] = [doc.getPage(0), doc.getPage(1), doc.getPage(2)];
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
  const cor = rgb(0.05, 0.05, 0.35);
  const BRANCO = rgb(1, 1, 1);
  const AMARELO = rgb(1, 1, 0);

  const limpar = (pag: typeof p1, x: number, y: number, w: number, h: number, fundo = BRANCO) =>
    pag.drawRectangle({ x, y, width: w, height: h, color: fundo });
  const ajustar = (s: string, largura: number, tamanho: number) => {
    let t = tamanho;
    while (t > 5 && fonte.widthOfTextAtSize(s, t) > largura) t -= 0.25;
    return t;
  };
  const texto = (pag: typeof p1, v: unknown, x: number, y: number, largura = 200, tamanho = 8) => {
    const s = String(v ?? "").trim().replace(/[^\x20-\x7E -ÿ]/g, "");
    if (!s) return;
    pag.drawText(s, { x, y, size: ajustar(s, largura, tamanho), font: fonte, color: cor });
  };
  const centrado = (pag: typeof p1, v: unknown, cx: number, y: number, largura: number, tamanho = 8) => {
    const s = String(v ?? "").trim().replace(/[^\x20-\x7E -ÿ]/g, "");
    if (!s) return;
    const t = ajustar(s, largura, tamanho);
    pag.drawText(s, { x: cx - fonte.widthOfTextAtSize(s, t) / 2, y, size: t, font: fonte, color: cor });
  };
  const marcar = (pag: typeof p1, cx: number, y: number) => pag.drawText("X", { x: cx - 2.8, y, size: 8.5, font: negrito, color: cor });
  const dataBr = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "");

  // Valores do exemplo que vieram no PDF
  limpar(p1, 500, 622, 82, 11); // "PREENCHER" da nota do revendedor
  limpar(p1, 118, 610, 168, 10); // nota GF "329752"
  limpar(p1, 346, 610, 30, 10); // série "2"
  limpar(p1, 60, 478, 96, 10); // marca "MERCEDEZ"
  limpar(p1, 204, 478, 80, 10); // modelo "ACELO915"
  limpar(p1, 385, 478, 28, 10); // ano "2008"
  limpar(p1, 482, 480, 100, 12); // placa "Mfq3d31"
  limpar(p1, 200, 440, 200, 13); // "PREENCHER" da condição de uso
  limpar(p1, 198, 363, 380, 13); // defeito "DESLOCAMENTO"
  limpar(p1, 183, 398, 17, 14, AMARELO); // X antigo em Dianteira
  limpar(p1, 566, 398, 18, 14, AMARELO); // x antigo em Lado direito

  // Dados do consumidor final
  texto(p1, d.clienteNome, 120, 744.5, 280);
  texto(p1, d.clienteCpf, 482, 744.5, 100);
  texto(p1, [d.clienteEndereco, d.clienteBairro].filter(Boolean).join(" - "), 80, 731.6, 338);
  texto(p1, d.clienteCep, 457, 731.6, 125);
  texto(p1, d.clienteCidade, 80, 718.8, 252);
  texto(p1, d.clienteUf, 354, 718.8, 60);
  texto(p1, d.clienteTelefone, 482, 718.8, 100);

  // Distribuidor ou revendedor (a loja)
  texto(p1, e.razaoSocial, 120, 676.4, 460);
  texto(p1, e.logradouro, 80, 664.4, 338);
  texto(p1, e.cep, 457, 664.4, 125);
  texto(p1, e.cidade, 80, 651.6, 252);
  texto(p1, e.uf, 354, 651.6, 60);
  texto(p1, TELEFONE_COMPRAS, 482, 651.6, 100);
  texto(p1, e.cnpj, 56, 638.7, 228);
  texto(p1, e.ie, 385, 638.7, 195);
  texto(p1, d.notaFiscal, 120, 626, 165);
  texto(p1, d.notaSerie, 351, 626, 30);
  texto(p1, dataBr(d.notaData), 490, 626, 90);
  texto(p1, d.nfFornecedor, 120, 613.2, 165);
  texto(p1, d.nfFornecedorSerie, 351, 613.2, 30);
  texto(p1, dataBr(d.nfFornecedorData), 490, 613.2, 90);

  // Produto e veículo
  marcar(p1, 191, 576);
  centrado(p1, d.sulco ? `${d.sulco} mm` : "", 69, 530, 110);
  centrado(p1, d.medida, 154, 530, 54);
  centrado(p1, d.modelo, 211, 530, 55);
  centrado(p1, d.marca, 271, 530, 61);
  centrado(p1, d.carga, 352, 530, 95);
  centrado(p1, d.dot, 456, 530, 105);
  centrado(p1, d.kmRodado == null ? "" : `${d.kmRodado.toLocaleString("pt-BR")} km`, 547, 530, 72);
  centrado(p1, d.veiculoMarca, 107, 481, 94);
  centrado(p1, d.veiculoModelo, 243, 481, 78);
  centrado(p1, d.veiculoAno, 399, 481, 28);
  centrado(p1, String(d.placa || "").toUpperCase(), 532, 482, 98);
  marcar(p1, 278, 459.5); // Blindado: não

  // Condição de uso: asfaltada, posição e passeio
  centrado(p1, "ASFALTO", 300, 443.2, 195, 9);
  const l = lados(d.posicao);
  if (l.dianteiro) marcar(p1, 191, 401);
  if (l.traseiro) marcar(p1, 278, 401);
  if (l.esquerdo) marcar(p1, 488, 401);
  if (l.direito) marcar(p1, 575, 401);
  marcar(p1, 191, 382.5); // passeio
  texto(p1, d.defeito, 202, 366.9, 375, 10);

  // Fotos: cada par vai lado a lado na caixa da seção.
  const colocarFotos = async (pag: typeof p1, lista: FotoFormulario[] | undefined, topo: number, base: number, rotulos: Array<[number, number]>) => {
    for (const [x, y] of rotulos) limpar(pag, x - 2, y - 3, 44, 14); // "#VALOR!"
    const caixas = [[13, 321], [321, 584.5]];
    for (let i = 0; i < Math.min(2, lista?.length || 0); i++) {
      const foto = lista![i];
      const img = foto.mime.includes("png") ? await doc.embedPng(foto.bytes) : await doc.embedJpg(foto.bytes);
      const [x0, x1] = caixas[i];
      const larg = x1 - x0 - 10;
      const alt = topo - base - 10;
      const esc = Math.min(larg / img.width, alt / img.height);
      const w = img.width * esc;
      const h = img.height * esc;
      pag.drawImage(img, { x: x0 + 5 + (larg - w) / 2, y: base + 5 + (alt - h) / 2, width: w, height: h });
    }
  };
  await colocarFotos(p1, fotos.dot, 268, 36, [[148.9, 150.9], [434, 150.9]]);
  await colocarFotos(p2, fotos.marca, 765, 586, [[148.9, 675.1], [434, 675.1]]);
  await colocarFotos(p2, fotos.completa, 575, 378, [[146.4, 388.3], [431.5, 388.3]]);
  await colocarFotos(p2, fotos.interna, 367, 189, [[148.9, 278.4], [434, 278.4]]);
  await colocarFotos(p2, fotos.banda, 179, 28, [[148.9, 90], [434, 90]]);

  // Declaração: não causou danos, não houve vítimas; nome do consumidor e data.
  marcar(p3, 282, 799);
  marcar(p3, 500, 799);
  texto(p3, d.clienteNome, 30, 786.6, 315);
  const hoje = new Date();
  centrado(p3, String(hoje.getDate()).padStart(2, "0"), 290, 638.6, 30);
  centrado(p3, String(hoje.getMonth() + 1).padStart(2, "0"), 337, 638.6, 30);
  centrado(p3, String(hoje.getFullYear()), 392, 638.6, 40);

  return doc.save();
}

// ---------- POLO PNEUS: Laudo de Análise Produto Usado (página única, formulário em branco) ----------
async function preencherPolo(pdfBytes: Uint8Array, d: DadosFormulario, e: Empresa) {
  const doc = await PDFDocument.load(pdfBytes);
  const pag = doc.getPage(0);
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
  const cor = rgb(0.05, 0.05, 0.35);
  const limparTexto = (v: unknown) => String(v ?? "").trim().replace(/[^\x20-\x7E -ÿ]/g, "");
  const texto = (v: unknown, x: number, y: number, largura: number, tamanho = 9) => {
    const s = limparTexto(v);
    if (!s) return;
    let t = tamanho;
    while (t > 5.5 && fonte.widthOfTextAtSize(s, t) > largura) t -= 0.25;
    pag.drawText(s, { x, y: y + 2, size: t, font: fonte, color: cor }); // sobe um pouco para não encostar na linha da caixa
  };
  const marcar = (cx: number, y: number) => pag.drawText("X", { x: cx - 3.2, y, size: 10, font: negrito, color: cor });
  const dataBr = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "");
  const hoje = new Date();
  const hojeBr = `${String(hoje.getDate()).padStart(2, "0")}/${String(hoje.getMonth() + 1).padStart(2, "0")}/${hoje.getFullYear()}`;

  // Dados do cliente (a loja)
  texto(d.nfFornecedor, 146, 728.5, 100);
  texto(e.razaoSocial, 146, 714, 400);
  texto(e.cnpj, 146, 699.5, 400);
  texto(TELEFONE_COMPRAS, 108, 685, 140);
  texto(d.emailCompras, 300, 685, 248);

  // Dados de uso do produto
  texto("CARRO", 108, 656, 186);
  texto(dataBr(d.dataMontagem), 449, 656, 99);
  texto(d.veiculoMarca, 108, 641.5, 186);
  texto(d.kmAtual == null ? "" : `${d.kmAtual.toLocaleString("pt-BR")} km`, 449, 641.5, 99);
  texto(d.veiculoModelo, 108, 627, 83);
  texto(d.veiculoAno, 252, 627, 44);
  texto(d.kmRodado == null ? "" : `${d.kmRodado.toLocaleString("pt-BR")} km`, 449, 627, 99);
  texto("ASFALTO", 253, 606, 190);
  texto(d.posicao, 253, 591.5, 190);
  texto(d.pressao ? `${d.pressao} PSI` : "", 253, 577, 43);

  // Dados do produto
  texto(d.medida, 111, 548, 183);
  texto(String(d.dot || "").replace(/\D/g, "").slice(-4) || d.dot, 348, 548, 96);
  texto(d.marca, 111, 533.5, 183);
  texto(d.modelo, 111, 519, 183);
  texto(d.sulco ? `${d.sulco} mm` : "", 352, 519, 31);
  marcar(470.7, 496.5); // acidente: não

  // Defeito alegado: quebra nas linhas da tabela
  const palavras = limparTexto(d.defeito).split(/\s+/).filter(Boolean);
  const linhas: string[] = [];
  let atual = "";
  for (const p of palavras) {
    const tentativa = atual ? `${atual} ${p}` : p;
    if (fonte.widthOfTextAtSize(tentativa, 9) > 500 && atual) {
      linhas.push(atual);
      atual = p;
    } else atual = tentativa;
  }
  if (atual) linhas.push(atual);
  linhas.slice(0, 5).forEach((l, i) => pag.drawText(l, { x: 42, y: 449.5 - i * 14.3, size: 9, font: fonte, color: cor }));

  marcar(415.8, 371); // autorizo cortar: sim
  texto(e.cidade, 146, 348.5, 198);
  texto(hojeBr, 388, 348.5, 158);

  return doc.save();
}

export const MODELOS_FORNECEDOR: ModeloFornecedor[] = [
  {
    id: "siqueira-campos",
    nome: "SIQUEIRA CAMPOS",
    apelidos: ["SIQUEIRA"],
    arquivo: "/garantia/fornecedores/siqueira-campos-fap.pdf",
    campos: ["notaSerie", "notaData", "tipoServico"],
    fotos: false,
    preencher: preencherSiqueira,
  },
  {
    id: "gf-pneus",
    nome: "GF PNEUS",
    apelidos: ["GF"],
    arquivo: "/garantia/fornecedores/gf-pneus-fapi.pdf",
    campos: ["sulco", "notaSerie", "notaData", "nfFornecedor", "nfFornecedorSerie", "nfFornecedorData"],
    fotos: true,
    preencher: preencherGf,
  },
  {
    id: "polo-pneus",
    nome: "POLO PNEUS",
    apelidos: ["POLO"],
    arquivo: "/garantia/fornecedores/polo-pneus-laudo.pdf",
    campos: ["nfFornecedor", "sulco", "pressao", "emailCompras"],
    fotos: false,
    preencher: preencherPolo,
  },
];

// ---------- Fornecedores sem formulário: as informações vão por WhatsApp ----------
export type FornecedorWhatsapp = { id: string; nome: string; apelidos: string[]; telefone?: string };

export const FORNECEDORES_WHATSAPP: FornecedorWhatsapp[] = [
  { id: "gomma", nome: "GOMMA", apelidos: ["GOMA"] },
  { id: "cantu", nome: "CANTU", apelidos: [] },
];

export function fornecedorWhatsapp(nome: string | null | undefined) {
  const n = semAcento(String(nome || ""));
  if (!n) return null;
  return FORNECEDORES_WHATSAPP.find((f) => [f.nome, ...f.apelidos].some((a) => n.includes(semAcento(a)))) || null;
}

// Mensagem com tudo o que o fornecedor precisa para analisar a garantia (fotos e vídeo vão junto na conversa).
export function mensagemWhatsapp(d: DadosFormulario & { garantiaId: number; dataEntrada: string; pneu: string }, e: Empresa) {
  const dataBr = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "");
  const linha = (rotulo: string, valor: unknown) => (String(valor ?? "").trim() ? `${rotulo}: ${String(valor).trim()}` : "");
  const veiculo = [d.veiculoMarca, d.veiculoModelo, d.veiculoAno].filter(Boolean).join(" ");
  return [
    `*SOLICITAÇÃO DE GARANTIA - PNEU*`,
    `Garantia nº ${d.garantiaId} • entrada em ${dataBr(d.dataEntrada)}`,
    "",
    `*Revenda*`,
    e.razaoSocial,
    linha("CNPJ", e.cnpj),
    linha("Cidade", `${e.cidade}/${e.uf}`),
    linha("Contato", TELEFONE_COMPRAS),
    "",
    `*Consumidor*`,
    linha("Nome", d.clienteNome),
    linha("Cidade", [d.clienteCidade, d.clienteUf].filter(Boolean).join("/")),
    "",
    `*Pneu*`,
    d.pneu,
    linha("Medida", d.medida),
    linha("Marca / modelo", [d.marca, d.modelo].filter(Boolean).join(" ")),
    linha("DOT", d.dot),
    linha("KM rodado", d.kmRodado == null ? "" : `${d.kmRodado.toLocaleString("pt-BR")} km`),
    linha("Posição", d.posicao),
    linha("Sulco", d.sulco ? `${d.sulco} mm` : ""),
    linha("Uso", "Passeio, asfalto"),
    "",
    `*Defeito alegado*`,
    d.defeito,
    "",
    `*Veículo*`,
    linha("Veículo", veiculo),
    linha("Placa", d.placa),
    "",
    `*Notas fiscais*`,
    linha("NF de venda ao consumidor", [d.notaFiscal, d.notaData ? `de ${dataBr(d.notaData)}` : ""].filter(Boolean).join(" ")),
    linha("NF de compra do fornecedor", [d.nfFornecedor, d.nfFornecedorData ? `de ${dataBr(d.nfFornecedorData)}` : ""].filter(Boolean).join(" ")),
    "",
    "Fotos e vídeo do pneu seguem nesta conversa.",
  ]
    .filter((l, i, arr) => l !== "" || (arr[i - 1] !== "" && i > 0))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}
