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
      `${rotulo}: esperava 1 ocorrência e encontrei ${total}. Nada foi gravado.`
    );
  }

  return texto.replace(
    antigo,
    novo
  );
}

function escaparRegex(texto) {
  return texto.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

function fecharChave(
  texto,
  inicio
) {
  let nivel = 0;
  let aspas = null;
  let escape = false;

  for (
    let i = inicio;
    i < texto.length;
    i++
  ) {
    const c = texto[i];

    if (aspas) {
      if (escape) {
        escape = false;
        continue;
      }

      if (c === "\\") {
        escape = true;
        continue;
      }

      if (c === aspas) {
        aspas = null;
      }

      continue;
    }

    if (
      c === '"' ||
      c === "'" ||
      c === "`"
    ) {
      aspas = c;
      continue;
    }

    if (c === "{") {
      nivel += 1;
      continue;
    }

    if (c === "}") {
      nivel -= 1;

      if (nivel === 0) {
        return i;
      }
    }
  }

  return -1;
}

if (
  folha.includes(
    "FOLHA_PJ_EDITOR_V3"
  )
) {
  falhar(
    "O editor PJ V3 já parece estar instalado."
  );
}

// ============================================================
// 1. DESCOBRE AS VARIÁVEIS REAIS DO FORMULÁRIO
// ============================================================

const checkedCargoRegex =
  /checked=\{([A-Za-z_$][\w$]*)\.cargoConfianca\}/g;

const checkedCargoMatches =
  [...folha.matchAll(
    checkedCargoRegex
  )];

if (
  checkedCargoMatches.length !== 1
) {
  falhar(
    `Esperava 1 checkbox Cargo de confiança e encontrei ${checkedCargoMatches.length}.`
  );
}

const formVar =
  checkedCargoMatches[0][1];

const idxCheckedCargo =
  Number(
    checkedCargoMatches[0].index
  );

const janelaCargo =
  folha.slice(
    idxCheckedCargo,
    idxCheckedCargo + 1800
  );

const setterMatch =
  janelaCargo.match(
    /([A-Za-z_$][\w$]*)\(\(prev\)\s*=>\s*\(\{/
  );

if (!setterMatch?.[1]) {
  falhar(
    "Não consegui descobrir o setter do formulário."
  );
}

const setFormVar =
  setterMatch[1];

console.log("");
console.log(
  `ℹ️ Formulário: ${formVar}`
);
console.log(
  `ℹ️ Setter: ${setFormVar}`
);

// ============================================================
// 2. TIPO DO FORMULÁRIO
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

// ============================================================
// 3. VALOR PADRÃO
// ============================================================

folha = substituirUma(
  folha,
  `    cargoConfianca: false,
    horarioEntrada1: "",`,
  `    cargoConfianca: false,
    isPj: false,
    horarioEntrada1: "",`,
  "valor inicial isPj"
);

// ============================================================
// 4. LOCALIZA O OBJETO QUE CARREGA O FUNCIONÁRIO NO FORMULÁRIO
// ============================================================

const chamadaCarga =
  `${setFormVar}({`;

let procura = 0;
let blocoCarga = null;

while (true) {
  const idx =
    folha.indexOf(
      chamadaCarga,
      procura
    );

  if (idx < 0) {
    break;
  }

  const abre =
    folha.indexOf(
      "{",
      idx
    );

  if (abre < 0) {
    break;
  }

  const fecha =
    fecharChave(
      folha,
      abre
    );

  if (fecha < 0) {
    falhar(
      "Não consegui fechar um objeto do formulário."
    );
  }

  const bloco =
    folha.slice(
      abre + 1,
      fecha
    );

  if (
    bloco.includes(
      "cargoConfianca:"
    ) &&
    bloco.includes(
      "dataAdmissao:"
    ) &&
    bloco.includes(
      "horarioEntrada1:"
    )
  ) {
    blocoCarga = {
      idx,
      abre,
      fecha,
      conteudo: bloco,
    };

    break;
  }

  procura =
    fecha + 1;
}

if (!blocoCarga) {
  falhar(
    "Não encontrei o objeto usado para carregar o funcionário no editor."
  );
}

// ============================================================
// 5. EXTRAI A EXPRESSÃO REAL DE cargoConfianca
//    E GERA isPj COM A MESMA ESTRUTURA
// ============================================================

const matchCargoCarga =
  blocoCarga.conteudo.match(
    /(^|\n)(\s*)cargoConfianca:\s*([\s\S]*?)(?=\n\s*[A-Za-z_$][\w$]*\s*:)/m
  );

if (!matchCargoCarga) {
  falhar(
    "Encontrei o objeto de carga, mas não consegui extrair cargoConfianca."
  );
}

const indentCargo =
  matchCargoCarga[2];

let expressaoCargo =
  matchCargoCarga[3].trim();

if (
  expressaoCargo.endsWith(",")
) {
  expressaoCargo =
    expressaoCargo.slice(
      0,
      -1
    );
}

if (
  !expressaoCargo.includes(
    "cargoConfianca"
  )
) {
  falhar(
    "A expressão encontrada não contém cargoConfianca; não vou arriscar alterar."
  );
}

const expressaoPj =
  expressaoCargo.replace(
    /cargoConfianca/g,
    "isPj"
  );

const propriedadeCargoOriginal =
  `${indentCargo}cargoConfianca: ${expressaoCargo},`;

const propriedadeCargoNova =
  `${propriedadeCargoOriginal}
${indentCargo}isPj: ${expressaoPj},`;

const blocoNovo =
  blocoCarga.conteudo.replace(
    propriedadeCargoOriginal,
    propriedadeCargoNova
  );

if (
  blocoNovo ===
  blocoCarga.conteudo
) {
  falhar(
    "Não consegui inserir isPj no carregamento."
  );
}

folha =
  folha.slice(
    0,
    blocoCarga.abre + 1
  ) +
  blocoNovo +
  folha.slice(
    blocoCarga.fecha
  );

console.log(
  "ℹ️ isPj inserido no carregamento do funcionário."
);

// ============================================================
// 6. SALVAMENTO DO FORMULÁRIO
// ============================================================


const regexSalvarCargo =
  new RegExp(
    `cargoConfianca:\\s*${escaparRegex(
      formVar
    )}\\.cargoConfianca\\s*,`,
    "g"
  );

const matchesSalvar =
  [...folha.matchAll(
    regexSalvarCargo
  )];

if (
  matchesSalvar.length !== 1
) {
  falhar(
    `Esperava 1 salvamento de cargoConfianca e encontrei ${matchesSalvar.length}.`
  );
}

folha =
  folha.replace(
    regexSalvarCargo,
    `cargoConfianca: ${formVar}.cargoConfianca,
        isPj: ${formVar}.isPj,`
  );

// ============================================================
// 7. CHECKBOX PJ ACIMA DE CARGO DE CONFIANÇA
// ============================================================

const checkedCargoAtual =
  `checked={${formVar}.cargoConfianca}`;

const idxCargoAtual =
  folha.indexOf(
    checkedCargoAtual
  );

if (idxCargoAtual < 0) {
  falhar(
    "Não reencontrei o checkbox Cargo de confiança."
  );
}

const idxLabel =
  folha.lastIndexOf(
    "<label",
    idxCargoAtual
  );

if (idxLabel < 0) {
  falhar(
    "Não encontrei o início do label Cargo de confiança."
  );
}

const inicioLinha =
  folha.lastIndexOf(
    "\n",
    idxLabel
  ) + 1;

const indent =
  folha.slice(
    inicioLinha,
    idxLabel
  );

const blocoPj =
`${indent}{/* FOLHA_PJ_EDITOR_V3 */}
${indent}<label className="mb-4 flex cursor-pointer items-start gap-3 rounded-xl border border-[#D4AF37]/25 bg-[#D4AF37]/[0.07] p-3">
${indent}  <input
${indent}    type="checkbox"
${indent}    checked={${formVar}.isPj}
${indent}    onChange={(e) =>
${indent}      ${setFormVar}((prev) => ({
${indent}        ...prev,
${indent}        isPj: e.target.checked,
${indent}      }))
${indent}    }
${indent}    className="mt-0.5 h-4 w-4 accent-[#D4AF37]"
${indent}  />

${indent}  <span>
${indent}    <span className="block text-sm font-semibold text-[#F2D675]">
${indent}      Funcionário PJ
${indent}    </span>

${indent}    <span className="mt-0.5 block text-xs leading-relaxed text-white/40">
${indent}      Marque esta opção para aplicar a regra PJ da folha. Até R$ 6.500,00 líquidos será tratado como pagamento normal e somente o excedente poderá ir para boleto.
${indent}    </span>
${indent}  </span>
${indent}</label>

`;

folha =
  folha.slice(
    0,
    inicioLinha
  ) +
  blocoPj +
  folha.slice(
    inicioLinha
  );

// ============================================================
// 8. VALIDAÇÕES FINAIS
// ============================================================

const obrigatorios = [
  "FOLHA_PJ_EDITOR_V3",
  "Funcionário PJ",
  "isPj: boolean;",
  "isPj: false",
  `checked={${formVar}.isPj}`,
  `isPj: ${formVar}.isPj`,
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
      `Validação final falhou: ${marcador}`
    );
  }
}

if (
  contar(
    folha,
    "Funcionário PJ"
  ) < 1
) {
  falhar(
    "Checkbox PJ não foi inserido."
  );
}

// ============================================================
// 9. BACKUP
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
    `.backup-folha-pj-editor-v3-${carimbo}`
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
// 10. GRAVAÇÃO SEGURA
// ============================================================

const final =
  usaCrLf
    ? folha.replace(
        /\n/g,
        "\r\n"
      )
    : folha;

const tmp =
  `${folhaPath}.pj-editor-v3.tmp`;

try {
  fs.writeFileSync(
    tmp,
    final,
    "utf8"
  );

  const conferir =
    fs.readFileSync(
      tmp,
      "utf8"
    );

  if (
    !conferir.includes(
      "FOLHA_PJ_EDITOR_V3"
    ) ||
    !conferir.includes(
      `checked={${formVar}.isPj}`
    )
  ) {
    falhar(
      "Validação do arquivo temporário falhou."
    );
  }

  fs.copyFileSync(
    tmp,
    folhaPath
  );
} catch (error) {
  fs.copyFileSync(
    backupFile,
    folhaPath
  );

  if (
    fs.existsSync(tmp)
  ) {
    fs.unlinkSync(tmp);
  }

  throw error;
}

if (
  fs.existsSync(tmp)
) {
  fs.unlinkSync(tmp);
}

console.log("");
console.log(
  "✅ Funcionário PJ adicionado ao editor interno da Folha."
);
console.log(
  "✅ O status PJ será carregado quando o funcionário for aberto."
);
console.log(
  "✅ O status PJ será salvo ao clicar em Salvar alterações."
);
console.log(
  "✅ 1%, comissão e regra financeira não foram alterados."
);
console.log("");
console.log(
  "Backup:"
);
console.log(
  backupDir
);
console.log("");