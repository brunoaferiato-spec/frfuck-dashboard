import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const raiz = process.cwd();

const arquivos = [
  {
    nome: "FolhaPagamento",
    caminho: path.join(raiz, "client", "src", "pages", "FolhaPagamento.tsx"),
    termos: [
      "type QuadranteKey",
      "function getQuadrante(",
      "function TabelaQuadrante",
      "TabelaQuadrante(",
      "calcularBoletoAjustado",
      "renderEditButton",
      "openCellEditor",
      "saveCellEditor",
      "adiantamento",
      "holerite",
      "boleto",
      "totalComissao",
      "premiacao",
      "vale",
    ],
  },
  {
    nome: "GestaoFuncionarios",
    caminho: path.join(raiz, "client", "src", "pages", "GestaoFuncionarios.tsx"),
    termos: [
      "const FUNCOES",
      "FUNCOES",
      "funcao",
      "tipoMeta",
      "cpf",
      "pix",
      "create",
      "update",
      "editar",
      "Edit",
    ],
  },
  {
    nome: "payrollStore",
    caminho: path.join(raiz, "client", "src", "lib", "payrollStore.ts"),
    termos: [
      "FolhaLinha",
      "computeFolhaLinha",
      "computeSupervisor",
      "totalComissao",
      "premiacao",
      "adiantamento",
      "holerite",
      "boleto",
      "vale",
      "aluguel",
    ],
  },
  {
    nome: "routers",
    caminho: path.join(raiz, "server", "routers.ts"),
    termos: [
      "funcaoSchema",
      "funcionarios",
      "folha",
      "adiantamento",
      "holerite",
      "premiacao",
      "vale",
      "update",
    ],
  },
  {
    nome: "db",
    caminho: path.join(raiz, "server", "db.ts"),
    termos: [
      "funcionarios",
      "folha",
      "adiantamento",
      "holerite",
      "premiacao",
      "vale",
      "UPDATE funcionarios",
      "INSERT INTO funcionarios",
    ],
  },
  {
    nome: "schema raiz",
    caminho: path.join(raiz, "drizzle", "schema.ts"),
    termos: [
      "funcionarios",
      "folha",
      "funcao",
      "adiantamento",
      "holerite",
      "mysqlTable",
    ],
  },
  {
    nome: "schema server",
    caminho: path.join(raiz, "server", "drizzle", "schema.ts"),
    termos: [
      "funcionarios",
      "folha",
      "funcao",
      "adiantamento",
      "holerite",
      "mysqlTable",
    ],
  },
];

function normalizar(texto) {
  return texto.replace(/\r\n/g, "\n");
}

function linhasComNumero(texto) {
  return normalizar(texto).split("\n");
}

function trechoAoRedor(linhas, indice, antes = 12, depois = 20) {
  const inicio = Math.max(0, indice - antes);
  const fim = Math.min(linhas.length - 1, indice + depois);

  const resultado = [];

  for (let i = inicio; i <= fim; i++) {
    resultado.push(
      `${String(i + 1).padStart(6, " ")} | ${linhas[i]}`
    );
  }

  return resultado.join("\n");
}

function encontrarTrechos(texto, termos) {
  const linhas = linhasComNumero(texto);
  const encontrados = [];
  const faixasUsadas = [];

  for (const termo of termos) {
    const termoLower = termo.toLowerCase();

    for (let i = 0; i < linhas.length; i++) {
      if (!linhas[i].toLowerCase().includes(termoLower)) continue;

      const inicio = Math.max(0, i - 12);
      const fim = Math.min(linhas.length - 1, i + 20);

      const jaCoberto = faixasUsadas.some(
        (faixa) => i >= faixa.inicio && i <= faixa.fim
      );

      if (jaCoberto) break;

      faixasUsadas.push({ inicio, fim });

      encontrados.push(
        [
          "",
          "=".repeat(100),
          `TERMO: ${termo}`,
          `LINHA APROXIMADA: ${i + 1}`,
          "=".repeat(100),
          trechoAoRedor(linhas, i),
          "",
        ].join("\n")
      );

      break;
    }
  }

  return encontrados.join("\n");
}

function infoArquivo(item) {
  if (!fs.existsSync(item.caminho)) {
    return [
      "",
      "#".repeat(110),
      `ARQUIVO: ${item.nome}`,
      `CAMINHO: ${item.caminho}`,
      "STATUS: NÃO ENCONTRADO",
      "#".repeat(110),
      "",
    ].join("\n");
  }

  const bruto = fs.readFileSync(item.caminho, "utf8");
  const stat = fs.statSync(item.caminho);
  const temBom = bruto.startsWith("\uFEFF");
  const eol = bruto.includes("\r\n") ? "CRLF" : "LF";

  return [
    "",
    "#".repeat(110),
    `ARQUIVO: ${item.nome}`,
    `CAMINHO: ${item.caminho}`,
    `STATUS: ENCONTRADO`,
    `TAMANHO: ${stat.size} bytes`,
    `LINHAS: ${linhasComNumero(bruto).length}`,
    `ENCODING ESPERADO: UTF-8`,
    `BOM: ${temBom ? "SIM" : "NÃO"}`,
    `EOL: ${eol}`,
    "#".repeat(110),
    encontrarTrechos(bruto, item.termos),
    "",
  ].join("\n");
}

function comandoSeguro(comando) {
  try {
    return execSync(comando, {
      cwd: raiz,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (erro) {
    return `ERRO AO EXECUTAR: ${comando}\n${erro?.message ?? erro}`;
  }
}

const partes = [];

partes.push("DIAGNÓSTICO — FOLHA PJ + 1%");
partes.push(`Gerado em: ${new Date().toISOString()}`);
partes.push(`Raiz do projeto: ${raiz}`);

partes.push("");
partes.push("=".repeat(110));
partes.push("GIT");
partes.push("=".repeat(110));
partes.push(`HEAD: ${comandoSeguro("git rev-parse --short HEAD")}`);
partes.push("");
partes.push("git status --short:");
partes.push(comandoSeguro("git status --short") || "(limpo)");

for (const arquivo of arquivos) {
  partes.push(infoArquivo(arquivo));
}

const saida = partes.join("\n");

const pastaSaida = path.join(raiz, "patches-folha");
fs.mkdirSync(pastaSaida, { recursive: true });

const arquivoSaida = path.join(
  pastaSaida,
  "diagnostico-folha-pj-1percent.txt"
);

fs.writeFileSync(arquivoSaida, saida, "utf8");

console.log("");
console.log("✅ Diagnóstico concluído.");
console.log("✅ Nenhum arquivo do sistema foi alterado.");
console.log("");
console.log("Arquivo gerado:");
console.log(arquivoSaida);
console.log("");
console.log("Abra o arquivo no VS Code e envie ele para o ChatGPT.");
console.log("");