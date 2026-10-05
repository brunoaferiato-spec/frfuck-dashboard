import fs from "node:fs";
import path from "node:path";

const raiz = process.cwd();

const arquivoPatch = path.join(
  raiz,
  "patches-folha",
  "aplicar-folha-pj-1percent-v1.mjs"
);

if (!fs.existsSync(arquivoPatch)) {
  throw new Error(
    `❌ Não encontrei o patch principal:\n${arquivoPatch}`
  );
}

let texto = fs
  .readFileSync(arquivoPatch, "utf8")
  .replace(/\r\n/g, "\n");

if (texto.includes("FOLHA_PJ_CHAVES_V1")) {
  console.log("");
  console.log("✅ Correção V2 já está aplicada no patch principal.");
  console.log("");
  process.exit(0);
}

const backup =
  arquivoPatch + ".antes-correcao-v2";

fs.copyFileSync(
  arquivoPatch,
  backup
);

function substituirUma(
  origem,
  antigo,
  novo,
  rotulo
) {
  const total =
    origem.split(antigo).length - 1;

  if (total !== 1) {
    throw new Error(
      `❌ ${rotulo}: esperava 1 ocorrência e encontrei ${total}.`
    );
  }

  return origem.replace(
    antigo,
    novo
  );
}

// ============================================================
// 1. REMOVE A TENTATIVA DE ALTERAR AS 4 CHAMADAS INDIVIDUAIS
// ============================================================

const inicioMarcador =
  "// Adiciona isPj em TODAS as chamadas de calcularBoletoAjustado";

const fimMarcador =
  "// Localiza as queries já existentes para inserir os novos hooks depois delas.";

const inicio =
  texto.indexOf(inicioMarcador);

const fim =
  texto.indexOf(
    fimMarcador,
    inicio
  );

if (inicio < 0) {
  throw new Error(
    "❌ Não encontrei no patch principal o bloco da correção anterior."
  );
}

if (fim < 0) {
  throw new Error(
    "❌ Não encontrei o final do bloco da correção anterior."
  );
}

const novoBlocoChamadas = `// FOLHA_PJ_1PCT_V1
// A identificação PJ é centralizada por loja + nome do funcionário.
// Não é necessário alterar individualmente os quatro caminhos do boleto.

`;

texto =
  texto.slice(0, inicio) +
  novoBlocoChamadas +
  texto.slice(fim);

// ============================================================
// 2. CRIA REGISTRO CENTRAL DOS PJs NA FOLHA
// ============================================================

const ancoraDepoisTipo = `  "folha: parâmetro isPj boleto"
);`;

const blocoRegistro = `  "folha: parâmetro isPj boleto"
);

// FOLHA_PJ_1PCT_V1
folha = replaceOnce(
  folha,
  \`function calcularBoletoAjustado(args: {\`,
  \`const FOLHA_PJ_CHAVES_V1 = new Set<string>(); // FOLHA_PJ_1PCT_V1

function normalizarChavePjV1(
  lojaId: unknown,
  nome: unknown
) {
  const loja =
    Number(lojaId || 0);

  const funcionario =
    String(nome || "")
      .normalize("NFD")
      .replace(/[\\\\u0300-\\\\u036f]/g, "")
      .toLowerCase()
      .replace(/\\\\s+/g, " ")
      .trim();

  return \\\`\${loja}::\${funcionario}\\\`;
}

function calcularBoletoAjustado(args: {\`,
  "folha: registro central PJ"
);`;

texto = substituirUma(
  texto,
  ancoraDepoisTipo,
  blocoRegistro,
  "Inserção do registro central PJ"
);

// ============================================================
// 3. FAZ A REGRA DO BOLETO CONSULTAR O CADASTRO PJ
// ============================================================

texto = substituirUma(
  texto,
  `if (Boolean(args.isPj)) {`,
  `if (
    Boolean(args.isPj) ||
    FOLHA_PJ_CHAVES_V1.has(
      normalizarChavePjV1(
        args.lojaId,
        args.funcionarioNome
      )
    )
  ) {`,
  "Regra central de identificação PJ"
);

// ============================================================
// 4. ALIMENTA O REGISTRO PJ COM O CADASTRO DA LOJA
// ============================================================

const ancoraEditor = `  const [
    umPorcentoEditor,
    setUmPorcentoEditor,
  ] = useState({`;

const populacaoPj = `  // FOLHA_PJ_1PCT_V1
  // Atualiza a lista de funcionários PJ da loja antes dos cálculos.
  FOLHA_PJ_CHAVES_V1.clear();

  for (
    const funcionarioPjV1 of (
      ((\${stmtFuncs.varName}.data ?? []) as any[])
    )
  ) {
    if (
      !Boolean(
        Number(
          funcionarioPjV1?.isPj || 0
        )
      )
    ) {
      continue;
    }

    FOLHA_PJ_CHAVES_V1.add(
      normalizarChavePjV1(
        Number(
          funcionarioPjV1?.lojaId ||
          lojaId
        ),
        funcionarioPjV1?.nome
      )
    );
  }

  const [
    umPorcentoEditor,
    setUmPorcentoEditor,
  ] = useState({`;

texto = substituirUma(
  texto,
  ancoraEditor,
  populacaoPj,
  "População do registro PJ"
);

// ============================================================
// 5. VALIDA O PATCH CORRIGIDO
// ============================================================

const obrigatorios = [
  "FOLHA_PJ_CHAVES_V1",
  "normalizarChavePjV1",
  "getUmPorcento",
  "saveUmPorcento",
  "Funcionário PJ",
  "baseLiquidaPj",
  "Pagamento PJ",
];

for (const marcador of obrigatorios) {
  if (!texto.includes(marcador)) {
    throw new Error(
      `❌ Validação falhou. Não encontrei: ${marcador}`
    );
  }
}

// ============================================================
// 6. GRAVA SOMENTE O PATCH, NÃO O SISTEMA
// ============================================================

fs.writeFileSync(
  arquivoPatch,
  texto,
  "utf8"
);

console.log("");
console.log("✅ Patch principal corrigido para V2.");
console.log(
  "✅ Identificação PJ centralizada por loja + funcionário."
);
console.log(
  "✅ As 4 chamadas diferentes do boleto não precisam mais ser modificadas."
);
console.log("");
console.log("Backup do patch anterior:");
console.log(backup);
console.log("");
console.log(
  "✅ Nenhum arquivo do sistema foi alterado por este corretor."
);
console.log("");