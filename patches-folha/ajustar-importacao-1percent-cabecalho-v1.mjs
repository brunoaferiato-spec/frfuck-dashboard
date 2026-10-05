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

const original = fs.readFileSync(
  folhaPath,
  "utf8"
);

const crlf = original.includes("\r\n");

let folha = original.replace(
  /\r\n/g,
  "\n"
);

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
  const total = contar(
    texto,
    antigo
  );

  if (total !== 1) {
    falhar(
      `${rotulo}: esperava 1 ocorrência e encontrei ${total}. Nenhum arquivo foi gravado.`
    );
  }

  return texto.replace(
    antigo,
    novo
  );
}

if (
  !folha.includes(
    "FOLHA_1PCT_IMPORT_XLSX_V1"
  )
) {
  falhar(
    "A importação XLSX do 1% ainda não foi encontrada na Folha."
  );
}

if (
  folha.includes(
    "FOLHA_1PCT_HEADER_IMPORT_V1"
  )
) {
  falhar(
    "Este ajuste do cabeçalho 1% já parece estar aplicado."
  );
}

// ============================================================
// 1. NOVA PROP NA TABELA
// ============================================================

folha = substituirUma(
  folha,
  `  onOpenUmPorcentoEditor,
  umPorcentoByFuncionario,
  pjFuncionarioIds,`,
  `  onOpenUmPorcentoEditor,
  onOpenImportacaoUmPorcento,
  umPorcentoByFuncionario,
  pjFuncionarioIds,`,
  "props TabelaQuadrante"
);

folha = substituirUma(
  folha,
  `  onOpenUmPorcentoEditor: (linha: LinhaComQuadrante) => void;
  umPorcentoByFuncionario: Record<number, number>;`,
  `  onOpenUmPorcentoEditor: (linha: LinhaComQuadrante) => void;
  onOpenImportacaoUmPorcento: () => void;
  umPorcentoByFuncionario: Record<number, number>;`,
  "tipo da nova prop"
);

// ============================================================
// 2. TRANSFORMA CABEÇALHO 1% EM BOTÃO IMPORTAR
// ============================================================

folha = substituirUma(
  folha,
  `                {exibeUmPorcento && (
                  <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">
                    1%
                  </th>
                )}`,
  `                {exibeUmPorcento && (
                  <th className="p-2 text-center">
                    {/* FOLHA_1PCT_HEADER_IMPORT_V1 */}
                    <button
                      type="button"
                      onClick={onOpenImportacaoUmPorcento}
                      className="group inline-flex min-w-[78px] flex-col items-center justify-center rounded-xl border border-[#D4AF37]/25 bg-[#D4AF37]/[0.055] px-3 py-2 transition hover:border-[#D4AF37]/60 hover:bg-[#D4AF37]/[0.12]"
                      title="Importar relatório mensal para preencher o 1% de todos os funcionários"
                    >
                      <span className="text-[12px] font-extrabold text-[#F2D675]">
                        1%
                      </span>

                      <span className="mt-0.5 text-[8px] font-extrabold uppercase tracking-[0.12em] text-[#D4AF37]/65 group-hover:text-[#F2D675]">
                        Importar
                      </span>
                    </button>
                  </th>
                )}`,
  "cabeçalho 1%"
);

// ============================================================
// 3. FUNÇÃO QUE ABRE O EXPLORADOR DE ARQUIVOS
// ============================================================

const anchorHandler =
  "function openUmPorcentoEditor(";

const handlerIndex =
  folha.indexOf(
    anchorHandler
  );

if (handlerIndex < 0) {
  falhar(
    "Não encontrei openUmPorcentoEditor."
  );
}

const abrirImportacao = `// FOLHA_1PCT_HEADER_IMPORT_V1
function openImportacaoUmPorcentoV1() {
  if (!garantirCompetenciaAberta()) {
    return;
  }

  const input =
    document.createElement("input");

  input.type = "file";
  input.accept =
    ".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel";

  input.onchange = async () => {
    const file =
      input.files?.[0];

    if (!file) {
      return;
    }

    await importarRelatorioUmPctV1(
      file
    );
  };

  input.click();
}

`;

folha =
  folha.slice(
    0,
    handlerIndex
  ) +
  abrirImportacao +
  folha.slice(
    handlerIndex
  );

// ============================================================
// 4. PASSA A FUNÇÃO PARA TODAS AS TABELAS
// ============================================================

folha = substituirUma(
  folha,
  `              onOpenUmPorcentoEditor={openUmPorcentoEditor}
              umPorcentoByFuncionario={umPorcentoByFuncionario}`,
  `              onOpenUmPorcentoEditor={openUmPorcentoEditor}
              onOpenImportacaoUmPorcento={openImportacaoUmPorcentoV1}
              umPorcentoByFuncionario={umPorcentoByFuncionario}`,
  "prop na chamada da tabela"
);

// ============================================================
// 5. ALERTA VISÍVEL AO FINAL DA IMPORTAÇÃO
// ============================================================

const successAnchor = `    setUmPorcentoImportacao({
      carregando: false,
      arquivoNome:
        file.name,
      mensagem:
        correspondencias.length +
        " funcionário(s) atualizado(s) pelo relatório de " +
        periodo.label +
        "." +
        resumoNaoEncontrados,
      erro: "",
    });`;

folha = substituirUma(
  folha,
  successAnchor,
  `${successAnchor}

    window.alert(
      "Importação do 1% concluída.\\n\\n" +
      correspondencias.length +
      " funcionário(s) atualizado(s).\\n" +
      "Período: " +
      periodo.label +
      (
        naoEncontrados.length
          ? "\\n\\nNão vinculados: " +
            naoEncontrados.join(", ")
          : ""
      )
    );`,
  "alerta de sucesso"
);

const errorAnchor = `    setUmPorcentoImportacao(
      (prev) => ({
        ...prev,
        carregando: false,
        mensagem: "",
        erro:
          error?.message ||
          "Erro ao importar o relatório.",
      })
    );`;

folha = substituirUma(
  folha,
  errorAnchor,
  `${errorAnchor}

    window.alert(
      error?.message ||
      "Erro ao importar o relatório do 1%."
    );`,
  "alerta de erro"
);

// ============================================================
// 6. VALIDAÇÃO
// ============================================================

const marcadores = [
  "FOLHA_1PCT_HEADER_IMPORT_V1",
  "openImportacaoUmPorcentoV1",
  "onOpenImportacaoUmPorcento",
  "Importar",
  "Importação do 1% concluída",
];

for (
  const marcador of marcadores
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
    `.backup-folha-1pct-header-import-v1-${carimbo}`
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
// 8. GRAVAÇÃO
// ============================================================

const final =
  crlf
    ? folha.replace(
        /\n/g,
        "\r\n"
      )
    : folha;

const tmp =
  folhaPath +
  ".header-1pct.tmp";

try {
  fs.writeFileSync(
    tmp,
    final,
    "utf8"
  );

  const check =
    fs.readFileSync(
      tmp,
      "utf8"
    );

  if (
    !check.includes(
      "FOLHA_1PCT_HEADER_IMPORT_V1"
    ) ||
    !check.includes(
      "openImportacaoUmPorcentoV1"
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
  "✅ Cabeçalho 1% ajustado."
);
console.log("");
console.log(
  "Agora:"
);
console.log(
  "• 1% / IMPORTAR no cabeçalho abre o relatório mensal"
);
console.log(
  "• o relatório preenche todos os funcionários reconhecidos"
);
console.log(
  "• cada R$ individual continua clicável para ajuste manual"
);
console.log(
  "• ao terminar, o sistema informa quantos foram atualizados"
);
console.log(
  "• nomes não vinculados também são informados"
);
console.log("");
console.log(
  "✅ Comissão, boleto e regra PJ não foram alterados."
);
console.log("");
console.log(
  "Backup:"
);
console.log(
  backupDir
);
console.log("");