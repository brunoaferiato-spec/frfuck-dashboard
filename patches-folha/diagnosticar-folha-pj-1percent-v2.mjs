import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const raiz = process.cwd();

const configuracoes = [
  {
    nome: "GESTAO FUNCIONARIOS",
    arquivo: "client/src/pages/GestaoFuncionarios.tsx",
    termos: [
      "type FormFuncionario",
      "interface FormFuncionario",
      "criarFormVazio",
      "handleEditFuncionario",
      "handleSubmit",
      "createFuncionario.mutate",
      "updateFuncionario.mutate",
      "cargoConfianca",
      "Data de admissão",
      "Cargo de confiança",
      "Tipo de meta",
    ],
    antes: 70,
    depois: 120,
  },
  {
    nome: "FOLHA PAGAMENTO",
    arquivo: "client/src/pages/FolhaPagamento.tsx",
    termos: [
      "type LinhaComQuadrante",
      "function calcularBoletoAjustado",
      "function getQuadrante(",
      "function TabelaQuadrante",
      "renderEditButton(",
      "Holerite",
      "Boleto",
      "Adiantamento",
      "onOpenImportacaoHolerite",
      "openCellEditor",
      "saveCellEditor",
      "linhasComQuadrante",
      "getQuadrante(",
    ],
    antes: 90,
    depois: 150,
  },
  {
    nome: "PAYROLL STORE",
    arquivo: "client/src/lib/payrollStore.ts",
    termos: [
      "export type Funcionario",
      "export type FolhaMensal",
      "export function computeFolhaLinha",
      "const boleto",
      "boleto:",
      "holerite",
      "adiant",
    ],
    antes: 70,
    depois: 120,
  },
  {
    nome: "ROUTERS",
    arquivo: "server/routers.ts",
    termos: [
      "funcionarios: router",
      "funcionarios:",
      "create: protectedProcedure",
      "update: protectedProcedure",
      "saveDesconto: protectedProcedure",
      "funcaoSchema",
    ],
    antes: 100,
    depois: 180,
  },
  {
    nome: "DB",
    arquivo: "server/db.ts",
    termos: [
      "export async function getFuncionariosByLoja",
      "export async function createFuncionario",
      "export async function updateFuncionario",
      "export async function getFolhaExtrasByLojaAnoMes",
      "export async function upsertDesconto",
      "descontosByFuncionario",
    ],
    antes: 100,
    depois: 180,
  },
  {
    nome: "SCHEMA",
    arquivo: "drizzle/schema.ts",
    termos: [
      'export const funcionarios = mysqlTable("funcionarios"',
      'export const descontos = mysqlTable("descontos"',
    ],
    antes: 40,
    depois: 100,
  },
];

function lerArquivo(relativo) {
  const completo = path.join(raiz, relativo);

  if (!fs.existsSync(completo)) {
    return {
      existe: false,
      completo,
      linhas: [],
    };
  }

  const bruto = fs.readFileSync(completo, "utf8").replace(/\r\n/g, "\n");

  return {
    existe: true,
    completo,
    linhas: bruto.split("\n"),
  };
}

function localizar(linhas, termo) {
  const procurado = termo.toLowerCase();
  const indices = [];

  for (let i = 0; i < linhas.length; i++) {
    if (linhas[i].toLowerCase().includes(procurado)) {
      indices.push(i);
    }
  }

  return indices;
}

function juntarFaixas(faixas) {
  if (!faixas.length) return [];

  const ordenadas = [...faixas].sort((a, b) => a.inicio - b.inicio);
  const resultado = [{ ...ordenadas[0] }];

  for (let i = 1; i < ordenadas.length; i++) {
    const atual = ordenadas[i];
    const anterior = resultado[resultado.length - 1];

    if (atual.inicio <= anterior.fim + 20) {
      anterior.fim = Math.max(anterior.fim, atual.fim);
      anterior.termos = [
        ...new Set([...anterior.termos, ...atual.termos]),
      ];
    } else {
      resultado.push({ ...atual });
    }
  }

  return resultado;
}

function renderizarTrecho(linhas, inicio, fim) {
  const resultado = [];

  for (let i = inicio; i <= fim; i++) {
    resultado.push(
      `${String(i + 1).padStart(6, " ")} | ${linhas[i] ?? ""}`
    );
  }

  return resultado.join("\n");
}

function diagnosticar(config) {
  const info = lerArquivo(config.arquivo);

  const partes = [];

  partes.push("");
  partes.push("#".repeat(110));
  partes.push(config.nome);
  partes.push(`ARQUIVO: ${info.completo}`);
  partes.push(`STATUS: ${info.existe ? "ENCONTRADO" : "NÃO ENCONTRADO"}`);

  if (!info.existe) {
    partes.push("#".repeat(110));
    return partes.join("\n");
  }

  partes.push(`LINHAS: ${info.linhas.length}`);
  partes.push("#".repeat(110));

  const faixas = [];

  for (const termo of config.termos) {
    const indices = localizar(info.linhas, termo);

    if (!indices.length) {
      partes.push("");
      partes.push(`⚠ TERMO NÃO ENCONTRADO: ${termo}`);
      continue;
    }

    for (const indice of indices.slice(0, 4)) {
      faixas.push({
        inicio: Math.max(0, indice - config.antes),
        fim: Math.min(
          info.linhas.length - 1,
          indice + config.depois
        ),
        termos: [termo],
      });
    }
  }

  const unificadas = juntarFaixas(faixas);

  for (const faixa of unificadas) {
    partes.push("");
    partes.push("=".repeat(110));
    partes.push(`TERMOS: ${faixa.termos.join(" | ")}`);
    partes.push(
      `LINHAS DO ARQUIVO: ${faixa.inicio + 1} até ${faixa.fim + 1}`
    );
    partes.push("=".repeat(110));
    partes.push(
      renderizarTrecho(info.linhas, faixa.inicio, faixa.fim)
    );
  }

  return partes.join("\n");
}

function comandoSeguro(comando) {
  try {
    return execSync(comando, {
      cwd: raiz,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (erro) {
    return `ERRO: ${erro?.message ?? erro}`;
  }
}

const saida = [];

saida.push("DIAGNÓSTICO DIRECIONADO — FOLHA PJ + 1% — V2");
saida.push(`Gerado em: ${new Date().toISOString()}`);
saida.push(`Projeto: ${raiz}`);
saida.push("");
saida.push(`Git HEAD: ${comandoSeguro("git rev-parse --short HEAD")}`);
saida.push("");
saida.push("GIT STATUS:");
saida.push(comandoSeguro("git status --short") || "(limpo)");

for (const config of configuracoes) {
  saida.push(diagnosticar(config));
}

const destino = path.join(
  raiz,
  "patches-folha",
  "diagnostico-folha-pj-1percent-v2.txt"
);

fs.writeFileSync(destino, saida.join("\n"), "utf8");

console.log("");
console.log("✅ Diagnóstico V2 concluído.");
console.log("✅ Nenhum arquivo do sistema foi alterado.");
console.log("");
console.log("Arquivo:");
console.log(destino);
console.log("");