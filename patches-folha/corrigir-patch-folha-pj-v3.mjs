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

let texto = fs.readFileSync(
  arquivoPatch,
  "utf8"
);

const antigo =
  '  return \\`${loja}::${funcionario}\\`;';

const novo =
  '  return \\`\\${loja}::\\${funcionario}\\`;';

const total =
  texto.split(antigo).length - 1;

if (total === 0) {
  if (texto.includes(novo)) {
    console.log("");
    console.log(
      "✅ Correção V3 já está aplicada."
    );
    console.log("");
    process.exit(0);
  }

  throw new Error(
    "❌ Não encontrei a linha esperada no patch principal."
  );
}

if (total !== 1) {
  throw new Error(
    `❌ Esperava 1 ocorrência da linha problemática e encontrei ${total}.`
  );
}

const backup =
  arquivoPatch +
  ".antes-correcao-v3";

fs.copyFileSync(
  arquivoPatch,
  backup
);

texto = texto.replace(
  antigo,
  novo
);

if (!texto.includes(novo)) {
  throw new Error(
    "❌ A validação da correção V3 falhou."
  );
}

fs.writeFileSync(
  arquivoPatch,
  texto,
  "utf8"
);

console.log("");
console.log(
  "✅ Correção V3 aplicada no patch principal."
);
console.log(
  "✅ Escape de loja + funcionário corrigido."
);
console.log("");
console.log(
  "Backup do patch anterior:"
);
console.log(backup);
console.log("");
console.log(
  "✅ Nenhum arquivo do sistema foi alterado."
);
console.log("");