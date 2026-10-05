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
    `❌ Não encontrei o patch:\n${arquivoPatch}`
  );
}

let texto = fs.readFileSync(
  arquivoPatch,
  "utf8"
);

const inicioMarcador =
  "// Adiciona isPj na única chamada de calcularBoletoAjustado fora da definição";

const fimMarcador =
  "// Localiza as queries já existentes para inserir os novos hooks depois delas.";

if (
  texto.includes(
    "// Adiciona isPj em TODAS as chamadas de calcularBoletoAjustado"
  )
) {
  console.log("");
  console.log(
    "✅ O patch já está com a correção das 4 chamadas."
  );
  console.log("");
  process.exit(0);
}

const inicio =
  texto.indexOf(inicioMarcador);

const fim =
  texto.indexOf(
    fimMarcador,
    inicio
  );

if (inicio < 0) {
  throw new Error(
    "❌ Não encontrei o bloco antigo de calcularBoletoAjustado no patch."
  );
}

if (fim < 0) {
  throw new Error(
    "❌ Não encontrei o final do bloco antigo no patch."
  );
}

const backup =
  arquivoPatch +
  ".antes-correcao";

fs.copyFileSync(
  arquivoPatch,
  backup
);

const novoBloco = `// Adiciona isPj em TODAS as chamadas de calcularBoletoAjustado.
// A Folha atual possui 4 caminhos diferentes que chegam ao cálculo do boleto.
const totalChamadasBoleto =
  contar(
    folha,
    "calcularBoletoAjustado({"
  );

if (totalChamadasBoleto !== 4) {
  falhar(
    \`folha: esperava 4 chamadas calcularBoletoAjustado({, encontrei \${totalChamadasBoleto}\`
  );
}

for (
  let ocorrencia =
    totalChamadasBoleto;
  ocorrencia >= 1;
  ocorrencia--
) {
  const call =
    encontrarChamadaObjeto(
      folha,
      "calcularBoletoAjustado({",
      ocorrencia
    );

  const bloco =
    folha.slice(
      call.objectStart + 1,
      call.objectEnd
    );

  if (
    /\\\\bisPj\\\\s*:/.test(
      bloco
    )
  ) {
    continue;
  }

  const porNome =
    bloco.match(
      /funcionarioNome\\\\s*:\\\\s*([A-Za-z_$][\\\\w$]*)\\\\.nome\\\\b/
    );

  const porFuncao =
    bloco.match(
      /funcao\\\\s*:\\\\s*([A-Za-z_$][\\\\w$]*)\\\\.funcao\\\\b/
    );

  const porId =
    bloco.match(
      /funcionarioId\\\\s*:\\\\s*([A-Za-z_$][\\\\w$]*)\\\\.(?:funcionarioId|id)\\\\b/
    );

  const baseVar =
    porNome?.[1] ||
    porFuncao?.[1] ||
    porId?.[1] ||
    null;

  if (!baseVar) {
    falhar(
      \`folha: não consegui identificar o funcionário na chamada calcularBoletoAjustado #\${ocorrencia}. Nenhum arquivo foi gravado.\`
    );
  }

  folha =
    folha.slice(
      0,
      call.objectStart + 1
    ) +
    \`\\n      isPj: Boolean((\${baseVar} as any).isPj),\` +
    folha.slice(
      call.objectStart + 1
    );
}

`;

texto =
  texto.slice(
    0,
    inicio
  ) +
  novoBloco +
  texto.slice(
    fim
  );

fs.writeFileSync(
  arquivoPatch,
  texto,
  "utf8"
);

console.log("");
console.log(
  "✅ Patch da Folha corrigido."
);
console.log(
  "✅ Agora ele trata as 4 chamadas de calcularBoletoAjustado."
);
console.log("");
console.log(
  "Backup do patch anterior:"
);
console.log(backup);
console.log("");
console.log(
  "Nenhum arquivo do sistema foi alterado por esta correção."
);
console.log("");