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
  throw new Error("❌ FolhaPagamento.tsx não encontrado.");
}

const bruto = fs.readFileSync(folhaPath, "utf8");
const crlf = bruto.includes("\r\n");

let texto = bruto.replace(/\r\n/g, "\n");

function falhar(msg) {
  throw new Error(`\n❌ ${msg}\n`);
}

function contar(origem, trecho) {
  return origem.split(trecho).length - 1;
}

function trocarUma(origem, antigo, novo, rotulo) {
  const total = contar(origem, antigo);

  if (total !== 1) {
    falhar(
      `${rotulo}: esperava 1 ocorrência, encontrei ${total}. Nada foi gravado.`
    );
  }

  return origem.replace(antigo, novo);
}

if (texto.includes("FOLHA_PJ_EDITOR_V1")) {
  falhar("Este ajuste do editor PJ já parece estar aplicado.");
}

// ------------------------------------------------------------
// 1. Campo isPj no formulário interno da Folha
// ------------------------------------------------------------

texto = trocarUma(
  texto,
  `  cargoConfianca: boolean;
  horarioEntrada1: string;`,
  `  cargoConfianca: boolean;
  isPj: boolean;
  horarioEntrada1: string;`,
  "tipo FormEdicaoFuncionario"
);

texto = trocarUma(
  texto,
  `    cargoConfianca: false,
    horarioEntrada1: "",`,
  `    cargoConfianca: false,
    isPj: false,
    horarioEntrada1: "",`,
  "valor inicial isPj"
);

// ------------------------------------------------------------
// 2. Descobre automaticamente o nome do estado desse formulário
// ------------------------------------------------------------

const regexState =
  /const\s*\[\s*([A-Za-z_$][\w$]*)\s*,\s*([A-Za-z_$][\w$]*)\s*\]\s*=\s*useState(?:<[^>]+>)?\([^;]*criarFormEdicaoFuncionarioVazio\(\)[^;]*\);/s;

const stateMatch = texto.match(regexState);

if (!stateMatch) {
  falhar(
    "Não consegui localizar o estado do formulário interno de funcionário."
  );
}

const formVar = stateMatch[1];
const setFormVar = stateMatch[2];

// ------------------------------------------------------------
// 3. Ao abrir funcionário, carrega isPj
// ------------------------------------------------------------

const cargoLoadRegex = new RegExp(
  `(cargoConfianca:\\s*Boolean\\(Number\\([^\\n]*cargoConfianca[^\\n]*\\)\\),)`
);

const cargoLoadMatch = texto.match(cargoLoadRegex);

if (!cargoLoadMatch) {
  falhar("Não encontrei onde cargoConfianca é carregado no editor.");
}

texto = texto.replace(
  cargoLoadMatch[1],
  `${cargoLoadMatch[1]}
      isPj: Boolean(Number((funcionarioDetalhe as any)?.isPj || 0)),`
);

// Se a variável real não se chamar funcionarioDetalhe,
// tenta corrigir pela variável usada no próprio cargoConfianca.
texto = texto.replace(
  /isPj: Boolean\(Number\(\(funcionarioDetalhe as any\)\?\.isPj \|\| 0\)\),/,
  (match) => {
    const trechoAnterior =
      texto.slice(
        Math.max(0, texto.indexOf(match) - 500),
        texto.indexOf(match)
      );

    const candidato =
      trechoAnterior.match(
        /cargoConfianca:\s*Boolean\(Number\(([\w$]+)\.cargoConfianca/
      );

    if (!candidato?.[1]) {
      return match;
    }

    return `isPj: Boolean(Number((${candidato[1]} as any)?.isPj || 0)),`;
  }
);

// ------------------------------------------------------------
// 4. Salva isPj junto com cargoConfianca
// ------------------------------------------------------------

const cargoSave = `${formVar}.cargoConfianca`;

if (!texto.includes(cargoSave)) {
  falhar(
    `Não encontrei ${cargoSave} no salvamento do editor.`
  );
}

const saveRegex = new RegExp(
  `(cargoConfianca:\\s*${formVar.replace(
    /[$]/g,
    "\\$&"
  )}\\.cargoConfianca,)`
);

const saveMatch = texto.match(saveRegex);

if (!saveMatch) {
  falhar("Não encontrei o payload de salvamento do editor.");
}

texto = texto.replace(
  saveMatch[1],
  `${saveMatch[1]}
        isPj: ${formVar}.isPj,`
);

// ------------------------------------------------------------
// 5. Adiciona checkbox PJ antes do Cargo de confiança
// ------------------------------------------------------------

const cargoCheckboxAnchor = `                <label className="mb-4 flex cursor-pointer items-start gap-3 rounded-xl border border-[#D4AF37]/18 bg-[#D4AF37]/[0.05] p-3">
                  <input
                    type="checkbox"
                    checked={${formVar}.cargoConfianca}`;

const idxCargo = texto.indexOf(cargoCheckboxAnchor);

if (idxCargo < 0) {
  falhar("Não encontrei o checkbox Cargo de confiança.");
}

const blocoPj = `                {/* FOLHA_PJ_EDITOR_V1 */}
                <label className="mb-4 flex cursor-pointer items-start gap-3 rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/[0.06] p-3">
                  <input
                    type="checkbox"
                    checked={${formVar}.isPj}
                    onChange={(e) =>
                      ${setFormVar}((prev) => ({
                        ...prev,
                        isPj: e.target.checked,
                      }))
                    }
                    className="mt-0.5 h-4 w-4 accent-[#D4AF37]"
                  />

                  <span>
                    <span className="block text-sm font-semibold text-[#F2D675]">
                      Funcionário PJ
                    </span>

                    <span className="mt-0.5 block text-xs leading-relaxed text-white/40">
                      Marque esta opção para aplicar a regra PJ da folha:
                      pagamento normal até R$ 6.500,00 líquidos e boleto somente sobre o excedente.
                    </span>
                  </span>
                </label>

`;

texto =
  texto.slice(0, idxCargo) +
  blocoPj +
  texto.slice(idxCargo);

// ------------------------------------------------------------
// 6. Validação
// ------------------------------------------------------------

for (const marcador of [
  "FOLHA_PJ_EDITOR_V1",
  "Funcionário PJ",
  "isPj: boolean;",
  "isPj: false",
  `isPj: ${formVar}.isPj`,
]) {
  if (!texto.includes(marcador)) {
    falhar(`Validação falhou: ${marcador}`);
  }
}

// ------------------------------------------------------------
// 7. Backup + gravação
// ------------------------------------------------------------

const carimbo = new Date()
  .toISOString()
  .replace(/[-:TZ.]/g, "")
  .slice(0, 14);

const backupDir = path.join(
  raiz,
  `.backup-folha-pj-editor-v1-${carimbo}`
);

const backupFile = path.join(
  backupDir,
  "client",
  "src",
  "pages",
  "FolhaPagamento.tsx"
);

fs.mkdirSync(path.dirname(backupFile), {
  recursive: true,
});

fs.copyFileSync(folhaPath, backupFile);

const final = crlf
  ? texto.replace(/\n/g, "\r\n")
  : texto;

const tmp = `${folhaPath}.pj-editor.tmp`;

try {
  fs.writeFileSync(tmp, final, "utf8");

  const check = fs.readFileSync(tmp, "utf8");

  if (
    !check.includes("FOLHA_PJ_EDITOR_V1") ||
    !check.includes("Funcionário PJ")
  ) {
    falhar("Validação do arquivo temporário falhou.");
  }

  fs.copyFileSync(tmp, folhaPath);
} catch (error) {
  fs.copyFileSync(backupFile, folhaPath);

  if (fs.existsSync(tmp)) {
    fs.unlinkSync(tmp);
  }

  throw error;
}

if (fs.existsSync(tmp)) {
  fs.unlinkSync(tmp);
}

console.log("");
console.log("✅ Opção PJ adicionada ao editor da Folha.");
console.log("✅ O status PJ será carregado e salvo pelo próprio modal.");
console.log("✅ Regra financeira PJ não foi alterada.");
console.log("");
console.log("Backup:");
console.log(backupDir);
console.log("");