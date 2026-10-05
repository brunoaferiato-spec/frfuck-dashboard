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
    `❌ Não encontrei:\n${folhaPath}`
  );
}

const bruto = fs.readFileSync(
  folhaPath,
  "utf8"
);

const usaCrLf =
  bruto.includes("\r\n");

let folha =
  bruto.replace(/\r\n/g, "\n");

function falhar(msg) {
  throw new Error(
    `\n❌ ${msg}\n`
  );
}

function contar(texto, trecho) {
  return texto.split(trecho).length - 1;
}

function substituirUma(
  texto,
  antigo,
  novo,
  rotulo
) {
  const total =
    contar(texto, antigo);

  if (total !== 1) {
    falhar(
      `${rotulo}: esperava 1 ocorrência e encontrei ${total}. Nenhum arquivo foi alterado.`
    );
  }

  return texto.replace(
    antigo,
    novo
  );
}

if (
  folha.includes(
    "FOLHA_PJ_EDITOR_V2"
  )
) {
  falhar(
    "O editor PJ V2 já parece estar instalado."
  );
}

// ============================================================
// 1. FORMULÁRIO: acrescenta isPj
// ============================================================

folha = substituirUma(
  folha,
  `  cargoConfianca: boolean;
  horarioEntrada1: string;`,
  `  cargoConfianca: boolean;
  isPj: boolean;
  horarioEntrada1: string;`,
  "tipo FormEdicaoFuncionario"
);

folha = substituirUma(
  folha,
  `    cargoConfianca: false,
    horarioEntrada1: "",`,
  `    cargoConfianca: false,
    isPj: false,
    horarioEntrada1: "",`,
  "valor inicial PJ"
);

// ============================================================
// 2. ENCONTRA O CHECKBOX "CARGO DE CONFIANÇA"
//    E DESCOBRE AS VARIÁVEIS REAIS DO FORMULÁRIO.
// ============================================================

const regexChecked =
  /checked=\{([A-Za-z_$][\w$]*)\.cargoConfianca\}/g;

const checkedMatches =
  [...folha.matchAll(regexChecked)];

if (checkedMatches.length !== 1) {
  falhar(
    `Esperava encontrar 1 checkbox de Cargo de confiança e encontrei ${checkedMatches.length}.`
  );
}

const formVar =
  checkedMatches[0][1];

const checkedIndex =
  Number(
    checkedMatches[0].index
  );

const janelaCheckbox =
  folha.slice(
    checkedIndex,
    checkedIndex + 1500
  );

const setterMatch =
  janelaCheckbox.match(
    /([A-Za-z_$][\w$]*)\(\(prev\)\s*=>\s*\(\{/
  );

if (!setterMatch?.[1]) {
  falhar(
    "Não consegui descobrir a função que atualiza o formulário."
  );
}

const setFormVar =
  setterMatch[1];

console.log("");
console.log(
  `ℹ️ Formulário encontrado: ${formVar}`
);
console.log(
  `ℹ️ Setter encontrado: ${setFormVar}`
);

// ============================================================
// 3. CARREGA isPj QUANDO ABRE O FUNCIONÁRIO
// ============================================================

const loadRegex =
  /cargoConfianca:\s*Boolean\(Number\(([A-Za-z_$][\w$]*)\.cargoConfianca\s*\|\|\s*0\)\),/g;

const loadMatches =
  [...folha.matchAll(loadRegex)];

if (loadMatches.length < 1) {
  falhar(
    "Não encontrei o carregamento atual de Cargo de confiança."
  );
}

// Procuramos o candidato que esteja dentro de um objeto
// que também tenha dataAdmissao/horarioEntrada1.
let loadMatch = null;

for (
  const candidato of loadMatches
) {
  const pos =
    Number(candidato.index);

  const janela =
    folha.slice(
      Math.max(0, pos - 800),
      pos + 1000
    );

  if (
    janela.includes(
      "dataAdmissao:"
    ) &&
    janela.includes(
      "horarioEntrada1:"
    )
  ) {
    loadMatch =
      candidato;
    break;
  }
}

if (!loadMatch) {
  falhar(
    "Encontrei Cargo de confiança, mas não consegui identificar com segurança o carregamento do formulário."
  );
}

const funcionarioVar =
  loadMatch[1];

const loadAntigo =
  loadMatch[0];

const loadNovo =
  `${loadAntigo}
      isPj: Boolean(Number((${funcionarioVar} as any).isPj || 0)),`;

folha =
  folha.replace(
    loadAntigo,
    loadNovo
  );

console.log(
  `ℹ️ Funcionário carregado por: ${funcionarioVar}`
);

// ============================================================
// 4. SALVA isPj JUNTO COM O RESTANTE DO FORMULÁRIO
// ============================================================

const saveNeedle =
  `cargoConfianca: ${formVar}.cargoConfianca,`;

const saveCount =
  contar(
    folha,
    saveNeedle
  );

if (saveCount !== 1) {
  falhar(
    `Não consegui identificar o salvamento de Cargo de confiança. Ocorrências: ${saveCount}.`
  );
}

folha =
  folha.replace(
    saveNeedle,
    `${saveNeedle}
        isPj: ${formVar}.isPj,`
  );

// ============================================================
// 5. INSERE CHECKBOX PJ ACIMA DE CARGO DE CONFIANÇA
// ============================================================

const checkedCargoAtual =
  `checked={${formVar}.cargoConfianca}`;

const idxCheckedCargo =
  folha.indexOf(
    checkedCargoAtual
  );

if (idxCheckedCargo < 0) {
  falhar(
    "Checkbox Cargo de confiança não foi reencontrado."
  );
}

const idxLabelCargo =
  folha.lastIndexOf(
    "<label",
    idxCheckedCargo
  );

if (idxLabelCargo < 0) {
  falhar(
    "Não encontrei o início do bloco Cargo de confiança."
  );
}

const inicioLinhaLabel =
  folha.lastIndexOf(
    "\n",
    idxLabelCargo
  ) + 1;

const indentacao =
  folha
    .slice(
      inicioLinhaLabel,
      idxLabelCargo
    );

const blocoPj =
`${indentacao}{/* FOLHA_PJ_EDITOR_V2 */}
${indentacao}<label className="mb-4 flex cursor-pointer items-start gap-3 rounded-xl border border-[#D4AF37]/25 bg-[#D4AF37]/[0.07] p-3">
${indentacao}  <input
${indentacao}    type="checkbox"
${indentacao}    checked={${formVar}.isPj}
${indentacao}    onChange={(e) =>
${indentacao}      ${setFormVar}((prev) => ({
${indentacao}        ...prev,
${indentacao}        isPj: e.target.checked,
${indentacao}      }))
${indentacao}    }
${indentacao}    className="mt-0.5 h-4 w-4 accent-[#D4AF37]"
${indentacao}  />

${indentacao}  <span>
${indentacao}    <span className="block text-sm font-semibold text-[#F2D675]">
${indentacao}      Funcionário PJ
${indentacao}    </span>

${indentacao}    <span className="mt-0.5 block text-xs leading-relaxed text-white/40">
${indentacao}      Marque para aplicar a regra PJ na folha. Até R$ 6.500,00 líquidos é pagamento normal; somente o excedente poderá ir para boleto.
${indentacao}    </span>
${indentacao}  </span>
${indentacao}</label>

`;

folha =
  folha.slice(
    0,
    inicioLinhaLabel
  ) +
  blocoPj +
  folha.slice(
    inicioLinhaLabel
  );

// ============================================================
// 6. VALIDAÇÕES
// ============================================================

const obrigatorios = [
  "FOLHA_PJ_EDITOR_V2",
  "Funcionário PJ",
  "isPj: boolean;",
  "isPj: false",
  `checked={${formVar}.isPj}`,
  `isPj: ${formVar}.isPj`,
  `(${funcionarioVar} as any).isPj`,
];

for (
  const marcador of obrigatorios
) {
  if (
    !folha.includes(
      marcador
    )
  ) {
    falhar(
      `Validação falhou: ${marcador}`
    );
  }
}

// ============================================================
// 7. BACKUP
// ============================================================

const carimbo =
  new Date()
    .toISOString()
    .replace(
      /[-:TZ.]/g,
      ""
    )
    .slice(
      0,
      14
    );

const backupDir =
  path.join(
    raiz,
    `.backup-folha-pj-editor-v2-${carimbo}`
  );

const backupFile =
  path.join(
    backupDir,
    "client",
    "src",
    "pages",
    "FolhaPagamento.tsx"
  );

fs.mkdirSync(
  path.dirname(
    backupFile
  ),
  {
    recursive: true,
  }
);

fs.copyFileSync(
  folhaPath,
  backupFile
);

// ============================================================
// 8. GRAVAÇÃO SEGURA
// ============================================================

const final =
  usaCrLf
    ? folha.replace(
        /\n/g,
        "\r\n"
      )
    : folha;

const temporario =
  `${folhaPath}.pj-editor-v2.tmp`;

try {
  fs.writeFileSync(
    temporario,
    final,
    "utf8"
  );

  const conferir =
    fs.readFileSync(
      temporario,
      "utf8"
    );

  if (
    !conferir.includes(
      "FOLHA_PJ_EDITOR_V2"
    ) ||
    !conferir.includes(
      "Funcionário PJ"
    )
  ) {
    falhar(
      "Validação do arquivo temporário falhou."
    );
  }

  fs.copyFileSync(
    temporario,
    folhaPath
  );
} catch (error) {
  fs.copyFileSync(
    backupFile,
    folhaPath
  );

  if (
    fs.existsSync(
      temporario
    )
  ) {
    fs.unlinkSync(
      temporario
    );
  }

  throw error;
}

if (
  fs.existsSync(
    temporario
  )
) {
  fs.unlinkSync(
    temporario
  );
}

console.log("");
console.log(
  "✅ Funcionário PJ adicionado ao editor interno da Folha."
);
console.log(
  "✅ O valor atual de PJ será carregado ao abrir o funcionário."
);
console.log(
  "✅ O status PJ será salvo junto com as demais alterações."
);
console.log(
  "✅ Regra de boleto e importação do 1% não foram alteradas."
);
console.log("");
console.log(
  "Backup:"
);
console.log(
  backupDir
);
console.log("");