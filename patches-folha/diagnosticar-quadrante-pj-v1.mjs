import fs from "node:fs";
import path from "node:path";

const raiz = process.cwd();

const folhaPath = path.join(
  raiz,
  "client",
  "src",
  "pages",
  "FolhaPagamento.tsx"
);

if (!fs.existsSync(folhaPath)) {
  throw new Error(
    `❌ Não encontrei FolhaPagamento.tsx:\n${folhaPath}`
  );
}

const texto = fs
  .readFileSync(folhaPath, "utf8")
  .replace(/\r\n/g, "\n");

const linhas = texto.split("\n");

const termos = [
  // PJ já instalado
  "FOLHA_PJ_EDITOR_V3",
  "Funcionário PJ",
  "isPj:",
  "isPj)",
  "isPj}",

  // quadrantes
  "type QuadranteKey",
  "function getQuadrante(",
  "function getQuadranteTitulo",
  "function getQuadranteDescricao",
  "linhasPorQuadrante",
  "getQuadrante(",

  // tabela
  "function TabelaQuadrante",
  "const isPj",
  "isSupervisor",
  "isSupervisoraAci",
  "isGerente",
  "isMensalUnico",

  // semanas
  "onOpenImportacaoSemana",
  "openImportacaoSemana",
  "ImportacaoSemana",
  "confirmarImportacao",
  "importarSemana",
  "sem1",
  "SEM1",

  // 1%
  "FOLHA_1PCT",
  "umPorcento",
  "1%",

  // descontos / pagamento
  "onOpenImportacaoAdiantamento",
  "onOpenImportacaoHolerite",
  "Adiant.",
  "Holerite",
  "Pagamento PJ",
  "adiant",
  "holerite",
  "boleto",

  // funcionários
  "funcionariosQuery",
  "funcionariosAtivos",
  "funcionarioId",
];

function janelaAoRedor(
  indice,
  antes = 35,
  depois = 70
) {
  const inicio =
    Math.max(
      0,
      indice - antes
    );

  const fim =
    Math.min(
      linhas.length - 1,
      indice + depois
    );

  const saida = [];

  for (
    let i = inicio;
    i <= fim;
    i++
  ) {
    saida.push(
      `${String(i + 1).padStart(6, " ")} | ${linhas[i]}`
    );
  }

  return {
    inicio,
    fim,
    texto: saida.join("\n"),
  };
}

const encontrados = [];
const faixas = [];

function jaCoberto(indice) {
  return faixas.some(
    (f) =>
      indice >= f.inicio &&
      indice <= f.fim
  );
}

for (const termo of termos) {
  const alvo =
    termo.toLowerCase();

  let quantidade = 0;

  for (
    let i = 0;
    i < linhas.length;
    i++
  ) {
    if (
      !linhas[i]
        .toLowerCase()
        .includes(alvo)
    ) {
      continue;
    }

    quantidade += 1;

    // para termos muito repetidos,
    // limita os blocos úteis
    if (
      quantidade > 8
    ) {
      continue;
    }

    if (
      jaCoberto(i)
    ) {
      continue;
    }

    const janela =
      janelaAoRedor(
        i,
        35,
        70
      );

    faixas.push({
      inicio:
        janela.inicio,
      fim:
        janela.fim,
    });

    encontrados.push(
      [
        "",
        "=".repeat(110),
        `TERMO: ${termo}`,
        `LINHA: ${i + 1}`,
        "=".repeat(110),
        janela.texto,
        "",
      ].join("\n")
    );
  }
}

// ---------------------------------------------
// RESUMO DE MARCADORES IMPORTANTES
// ---------------------------------------------

function possui(valor) {
  return texto.includes(valor)
    ? "SIM"
    : "NÃO";
}

const resumo = [
  "DIAGNÓSTICO — NOVO QUADRANTE PJ",
  "",
  `Arquivo: ${folhaPath}`,
  `Linhas: ${linhas.length}`,
  "",
  "ESTADO ATUAL:",
  `PJ editor V3: ${possui("FOLHA_PJ_EDITOR_V3")}`,
  `Campo isPj: ${possui("isPj")}`,
  `Importação 1%: ${possui("FOLHA_1PCT")}`,
  `Pagamento PJ: ${possui("Pagamento PJ")}`,
  `linhasPorQuadrante: ${possui("linhasPorQuadrante")}`,
  `Importação de semana: ${possui("onOpenImportacaoSemana")}`,
  `Importação de adiantamento: ${possui("onOpenImportacaoAdiantamento")}`,
  `Importação de holerite: ${possui("onOpenImportacaoHolerite")}`,
  "",
  "OBJETIVO DO PRÓXIMO PATCH:",
  "1. Funcionário marcado isPj vai para quadrante próprio.",
  "2. Quadrante PJ será o PRIMEIRO da Folha.",
  "3. PJ mantém a função original: Vendedor, Mecânico, Gerente, Alinhador etc.",
  "4. SEM1/SEM2/SEM3/SEM4/SEM5 continuam recebendo importação por nome.",
  "5. Comissão continua usando a regra da função original.",
  "6. PJ não terá coluna 1%.",
  "7. Adiantamento PJ será manual, sem importação de PDF.",
  "8. Pagamento PJ será manual, sem importação de Holerite.",
  "9. Vale, aluguel, premiação, boleto e observação permanecem.",
  "10. Regra financeira de R$ 6.500,00 permanece sem alteração.",
  "",
];

const saida = [
  ...resumo,
  ...encontrados,
].join("\n");

const pasta =
  path.join(
    raiz,
    "patches-folha"
  );

fs.mkdirSync(
  pasta,
  {
    recursive: true,
  }
);

const destino =
  path.join(
    pasta,
    "diagnostico-quadrante-pj-v1.txt"
  );

fs.writeFileSync(
  destino,
  saida,
  "utf8"
);

console.log("");
console.log(
  "✅ Diagnóstico do quadrante PJ concluído."
);
console.log(
  "✅ Nenhum arquivo do sistema foi alterado."
);
console.log("");
console.log(
  "Arquivo gerado:"
);
console.log(
  destino
);
console.log("");
console.log(
  "Vou usar este diagnóstico para montar o patch final."
);
console.log("");