import fs from "node:fs";
import path from "node:path";

const raiz = process.cwd();

const arquivo = path.join(
  raiz,
  "patches-folha",
  "ajustar-pj-editor-folha-v3.mjs"
);

if (!fs.existsSync(arquivo)) {
  throw new Error(
    `❌ Não encontrei:\n${arquivo}`
  );
}

let texto = fs.readFileSync(
  arquivo,
  "utf8"
);

const antigo = `const regexSalvarCargo =
  new RegExp(
    \`cargoConfianca:\\\\s*\${escaparRegex(
      formVar
    )}\\\\.cargoConfianca\\\\s*,\`
  );`;

const novo = `const regexSalvarCargo =
  new RegExp(
    \`cargoConfianca:\\\\s*\${escaparRegex(
      formVar
    )}\\\\.cargoConfianca\\\\s*,\`,
    "g"
  );`;

if (texto.includes(novo)) {
  console.log("");
  console.log("✅ A correção já está aplicada.");
  console.log("");
  process.exit(0);
}

if (!texto.includes(antigo)) {
  throw new Error(
    "❌ Não encontrei o bloco esperado no V3. Nada foi alterado."
  );
}

fs.copyFileSync(
  arquivo,
  arquivo + ".antes-matchall-fix"
);

texto = texto.replace(
  antigo,
  novo
);

fs.writeFileSync(
  arquivo,
  texto,
  "utf8"
);

console.log("");
console.log("✅ Erro matchAll corrigido no V3.");
console.log("✅ Nenhum arquivo do sistema foi alterado.");
console.log("");