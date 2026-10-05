import fs from "node:fs";
import path from "node:path";

const raiz = process.cwd();
const pagePath = path.join(raiz, "client", "src", "pages", "ComprasPecas.tsx");
const componentPath = path.join(
  raiz,
  "client",
  "src",
  "components",
  "ComprasPecasCotacao.tsx"
);

function falhar(msg) {
  throw new Error(`PATCH COMPRAS PEÇAS V2.3.1: ${msg}`);
}

function ler(arquivo) {
  if (!fs.existsSync(arquivo)) falhar(`arquivo não encontrado: ${arquivo}`);
  const bruto = fs.readFileSync(arquivo, "utf8");
  const bom = bruto.startsWith("\uFEFF") ? "\uFEFF" : "";
  const corpo = bom ? bruto.slice(1) : bruto;
  const eol = corpo.includes("\r\n") ? "\r\n" : "\n";
  return { bom, eol, texto: corpo.replace(/\r\n/g, "\n") };
}

function montar(info, texto) {
  return info.bom + texto.replace(/\n/g, info.eol);
}

function substituirUma(texto, antigo, novo, rotulo) {
  const total = texto.split(antigo).length - 1;
  if (total !== 1) {
    falhar(`${rotulo}: esperava 1 ocorrência, encontrei ${total}. Nada foi gravado.`);
  }
  return texto.replace(antigo, novo);
}

const pageInfo = ler(pagePath);
const componentInfo = ler(componentPath);

let page = pageInfo.texto;
let component = componentInfo.texto;

if (!component.includes("Cidade da compra")) {
  falhar("a V2.3 precisa estar aplicada antes desta correção.");
}

if (page.includes('<ComprasPecasCotacao arquivoNome={arquivoNome} itens={itens} />') &&
    !page.includes('{arquivoNome && (\n          <ComprasPecasCotacao')) {
  falhar("a V2.3.1 parece já estar aplicada.");
}

page = substituirUma(
  page,
  "        {arquivoNome && (\n          <ComprasPecasCotacao arquivoNome={arquivoNome} itens={itens} />\n        )}\n",
  "        <ComprasPecasCotacao arquivoNome={arquivoNome} itens={itens} />\n",
  "mostrar seletor de cidade antes do relatório"
);

component = substituirUma(
  component,
  "        {!planejamentoId && (\n          <button\n            type=\"button\"\n            onClick={salvarPlanejamento}\n            disabled={criarPlano.isPending || !lojaSelecionada}\n            className=\"h-11 rounded-xl bg-[#D4AF37] px-4 text-sm font-black text-black disabled:opacity-50\"\n          >\n            <Save className=\"mr-2 inline h-4 w-4\"/>\n            Salvar planejamento\n          </button>\n        )}\n",
  "        {arquivoNome && !planejamentoId && (\n          <button\n            type=\"button\"\n            onClick={salvarPlanejamento}\n            disabled={criarPlano.isPending || !lojaSelecionada}\n            className=\"h-11 rounded-xl bg-[#D4AF37] px-4 text-sm font-black text-black disabled:opacity-50\"\n          >\n            <Save className=\"mr-2 inline h-4 w-4\"/>\n            Salvar planejamento\n          </button>\n        )}\n",
  "ocultar salvar planejamento antes do relatório"
);

if (!component.includes("Selecione a cidade da compra e depois importe o relatório acima.")) {
  component = substituirUma(
    component,
    "    {(mensagem||erro)&&<div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${erro?\"border-rose-400/20 text-rose-200\":\"border-emerald-400/20 text-emerald-200\"}`}>{erro||mensagem}</div>}\n",
    "    {!arquivoNome && !planejamentoId && (\n      <div className=\"mt-4 rounded-xl border border-[#D4AF37]/15 bg-[#D4AF37]/[0.03] px-4 py-3 text-sm text-gray-500\">\n        Selecione a cidade da compra e depois importe o relatório acima.\n      </div>\n    )}\n\n    {(mensagem||erro)&&<div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${erro?\"border-rose-400/20 text-rose-200\":\"border-emerald-400/20 text-emerald-200\"}`}>{erro||mensagem}</div>}\n",
    "mensagem antes do relatório"
  );
}

for (const marcador of [
  "Cidade da compra",
  "Selecione a cidade da compra e depois importe o relatório acima.",
  "arquivoNome && !planejamentoId",
]) {
  if (!component.includes(marcador)) {
    falhar(`validação do componente falhou: ${marcador}`);
  }
}

if (!page.includes('<ComprasPecasCotacao arquivoNome={arquivoNome} itens={itens} />')) {
  falhar("validação da página falhou.");
}

const agora = new Date();
const carimbo =
  String(agora.getFullYear()) +
  String(agora.getMonth() + 1).padStart(2, "0") +
  String(agora.getDate()).padStart(2, "0") +
  String(agora.getHours()).padStart(2, "0") +
  String(agora.getMinutes()).padStart(2, "0") +
  String(agora.getSeconds()).padStart(2, "0");

const backupDir = path.join(raiz, `.backup-compras-pecas-v231-${carimbo}`);

for (const [relativo, origem] of [
  ["client/src/pages/ComprasPecas.tsx", pagePath],
  ["client/src/components/ComprasPecasCotacao.tsx", componentPath],
]) {
  const destino = path.join(backupDir, relativo);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.copyFileSync(origem, destino);
}

const tmpPage = `${pagePath}.v231.tmp`;
const tmpComponent = `${componentPath}.v231.tmp`;

try {
  fs.writeFileSync(tmpPage, montar(pageInfo, page), "utf8");
  fs.writeFileSync(tmpComponent, montar(componentInfo, component), "utf8");

  fs.renameSync(tmpPage, pagePath);
  fs.renameSync(tmpComponent, componentPath);
} catch (error) {
  if (fs.existsSync(tmpPage)) fs.unlinkSync(tmpPage);
  if (fs.existsSync(tmpComponent)) fs.unlinkSync(tmpComponent);

  try {
    fs.copyFileSync(
      path.join(backupDir, "client/src/pages/ComprasPecas.tsx"),
      pagePath
    );
    fs.copyFileSync(
      path.join(backupDir, "client/src/components/ComprasPecasCotacao.tsx"),
      componentPath
    );
  } catch {}

  throw error;
}

console.log("");
console.log("✅ Compras > Peças V2.3.1 aplicado.");
console.log(`✅ Backup: ${path.relative(raiz, backupDir)}`);
console.log("");
console.log("Agora o seletor de cidade aparece ANTES de importar o relatório.");
console.log("O botão Salvar planejamento só aparece depois que houver relatório.");
console.log("O patch NÃO fez commit.");
