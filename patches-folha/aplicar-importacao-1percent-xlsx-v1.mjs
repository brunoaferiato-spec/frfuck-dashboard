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

const originalBruto = fs.readFileSync(
  folhaPath,
  "utf8"
);

const usaCrLf = originalBruto.includes("\r\n");

let folha = originalBruto.replace(
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
      `${rotulo}: esperava 1 ocorrência, encontrei ${total}. Nenhum arquivo foi alterado.`
    );
  }

  return texto.replace(
    antigo,
    novo
  );
}

if (
  !folha.includes(
    "FOLHA_PJ_1PCT_V1"
  )
) {
  falhar(
    "A estrutura de 1% criada anteriormente não foi encontrada. Não vou alterar a Folha."
  );
}

if (
  folha.includes(
    "FOLHA_1PCT_IMPORT_XLSX_V1"
  )
) {
  falhar(
    "A importação XLSX do 1% já parece estar instalada."
  );
}

// ============================================================
// 1. ESTADO DA IMPORTAÇÃO
// ============================================================

const stateAnchor = `  const [
    umPorcentoEditor,
    setUmPorcentoEditor,
  ] = useState({`;

const stateStart =
  folha.indexOf(stateAnchor);

if (stateStart < 0) {
  falhar(
    "Não encontrei o estado umPorcentoEditor."
  );
}

const stateClose =
  folha.indexOf(
    "\n  });",
    stateStart
  );

if (stateClose < 0) {
  falhar(
    "Não encontrei o final do estado umPorcentoEditor."
  );
}

const stateEnd =
  stateClose +
  "\n  });".length;

const blocoEstado = `

  // FOLHA_1PCT_IMPORT_XLSX_V1
  const [
    umPorcentoImportacao,
    setUmPorcentoImportacao,
  ] = useState({
    carregando: false,
    arquivoNome: "",
    mensagem: "",
    erro: "",
  });`;

folha =
  folha.slice(0, stateEnd) +
  blocoEstado +
  folha.slice(stateEnd);

// ============================================================
// 2. FUNÇÕES PARA LER E CRUZAR O RELATÓRIO
// ============================================================

const handlerAnchor =
  "function openUmPorcentoEditor(";

const handlerIndex =
  folha.indexOf(handlerAnchor);

if (handlerIndex < 0) {
  falhar(
    "Não encontrei openUmPorcentoEditor."
  );
}

const blocoImportacao = `// FOLHA_1PCT_IMPORT_XLSX_V1

type RegistroRelatorioUmPctV1 = {
  nomeRelatorio: string;
  secao:
    | "venda"
    | "mecanica"
    | "alinhamento";
  liquidezBase: number;
};

function normalizarTextoUmPctV1(
  value: unknown
) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\\u0300-\\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\\s+/g, " ")
    .trim();
}

function normalizarNomeUmPctV1(
  value: unknown
) {
  return normalizarTextoUmPctV1(
    value
  )
    .replace(
      /\\b(DE|DA|DO|DAS|DOS|E)\\b/g,
      " "
    )
    .replace(/\\s+/g, " ")
    .trim();
}

function scoreNomeUmPctV1(
  nomeA: unknown,
  nomeB: unknown
) {
  const a =
    normalizarNomeUmPctV1(
      nomeA
    );

  const b =
    normalizarNomeUmPctV1(
      nomeB
    );

  if (!a || !b) {
    return 0;
  }

  if (a === b) {
    return 1;
  }

  const tokensA =
    a.split(" ").filter(Boolean);

  const tokensB =
    b.split(" ").filter(Boolean);

  if (
    !tokensA.length ||
    !tokensB.length
  ) {
    return 0;
  }

  // O primeiro nome precisa coincidir.
  if (
    tokensA[0] !==
    tokensB[0]
  ) {
    return 0;
  }

  const setA =
    new Set(tokensA);

  const setB =
    new Set(tokensB);

  let comuns = 0;

  for (
    const token of setA
  ) {
    if (setB.has(token)) {
      comuns += 1;
    }
  }

  if (comuns < 2) {
    return 0;
  }

  const menor =
    Math.min(
      setA.size,
      setB.size
    );

  const maior =
    Math.max(
      setA.size,
      setB.size
    );

  const cobertura =
    menor > 0
      ? comuns / menor
      : 0;

  const jaccard =
    maior > 0
      ? comuns / maior
      : 0;

  const contem =
    a.includes(b) ||
    b.includes(a)
      ? 0.08
      : 0;

  return Math.min(
    1,
    cobertura * 0.72 +
      jaccard * 0.28 +
      contem
  );
}

function numeroUmPctV1(
  value: unknown
) {
  if (
    typeof value === "number"
  ) {
    return Number.isFinite(value)
      ? value
      : 0;
  }

  const raw =
    String(value ?? "")
      .trim();

  if (!raw) {
    return 0;
  }

  const limpo =
    raw
      .replace(/R\\$/gi, "")
      .replace(/\\s/g, "");

  if (
    limpo.includes(",")
  ) {
    const valor =
      Number(
        limpo
          .replace(/\\./g, "")
          .replace(",", ".")
      );

    return Number.isFinite(valor)
      ? valor
      : 0;
  }

  const valor =
    Number(limpo);

  return Number.isFinite(valor)
    ? valor
    : 0;
}

function periodoRelatorioUmPctV1(
  matriz: unknown[][]
) {
  for (
    const row of matriz
  ) {
    for (
      const cell of row
    ) {
      if (
        typeof cell !==
        "string"
      ) {
        continue;
      }

      const match =
        cell.match(
          /(\\d{2})\\/(\\d{2})\\/(\\d{4})\\s*-\\s*(\\d{2})\\/(\\d{2})\\/(\\d{4})/
        );

      if (!match) {
        continue;
      }

      return {
        inicioDia:
          Number(match[1]),
        inicioMes:
          Number(match[2]),
        inicioAno:
          Number(match[3]),
        fimDia:
          Number(match[4]),
        fimMes:
          Number(match[5]),
        fimAno:
          Number(match[6]),
        label:
          match[0],
      };
    }
  }

  return null;
}

function lojaRelatorioUmPctV1(
  matriz: unknown[][]
) {
  const texto =
    normalizarTextoUmPctV1(
      matriz
        .slice(0, 12)
        .flat()
        .map(
          (cell) =>
            String(
              cell ?? ""
            )
        )
        .join(" ")
    );

  const lojas = [
    {
      id: 1,
      termos: [
        "JOINVILLE",
      ],
    },
    {
      id: 2,
      termos: [
        "BLUMENAU",
      ],
    },
    {
      id: 3,
      termos: [
        "SAO JOSE",
      ],
    },
    {
      id: 4,
      termos: [
        "FLORIANOPOLIS",
      ],
    },
    {
      id: 5,
      termos: [
        "ACI PROMOCOES",
        "ACI PROMOCAO",
        "ACI",
      ],
    },
    {
      id: 6,
      termos: [
        "SAO LEOPOLDO",
      ],
    },
    {
      id: 7,
      termos: [
        "GRAVATAI",
      ],
    },
  ];

  for (
    const loja of lojas
  ) {
    if (
      loja.termos.some(
        (termo) =>
          texto.includes(
            termo
          )
      )
    ) {
      return loja.id;
    }
  }

  return null;
}

function registrosRelatorioUmPctV1(
  matriz: unknown[][]
) {
  const registros:
    RegistroRelatorioUmPctV1[] =
      [];

  let secao:
    | "venda"
    | "mecanica"
    | "alinhamento"
    | null = null;

  let colNome = -1;
  let colValor = -1;

  for (
    const rowRaw of matriz
  ) {
    const row =
      Array.isArray(rowRaw)
        ? rowRaw
        : [];

    const norm =
      row.map(
        normalizarTextoUmPctV1
      );

    const primeira =
      norm[0] || "";

    if (
      primeira === "VENDA"
    ) {
      secao = "venda";
      colNome = -1;
      colValor = -1;
      continue;
    }

    if (
      primeira === "MECANICA"
    ) {
      secao = "mecanica";
      colNome = -1;
      colValor = -1;
      continue;
    }

    if (
      primeira ===
      "ALINHAMENTO"
    ) {
      secao = "alinhamento";
      colNome = -1;
      colValor = -1;
      continue;
    }

    const indiceColaborador =
      norm.findIndex(
        (cell) =>
          cell ===
          "COLABORADOR"
      );

    if (
      indiceColaborador >= 0 &&
      secao
    ) {
      colNome =
        indiceColaborador;

      const colunaSemPneu =
        norm.findIndex(
          (cell) =>
            cell ===
              "LIQ S PNEUS" ||
            cell.includes(
              "LIQ S PNEUS"
            )
        );

      const colunaLiquidez =
        norm.findIndex(
          (cell) =>
            cell ===
            "LIQUIDEZ"
        );

      if (
        colunaSemPneu >= 0
      ) {
        colValor =
          colunaSemPneu;
      } else if (
        secao ===
          "alinhamento" &&
        colunaLiquidez >= 0
      ) {
        // O bloco ALINHAMENTO do relatório
        // não possui LIQ. S/ PNEUS.
        // Nesse caso LIQUIDEZ é o equivalente.
        colValor =
          colunaLiquidez;
      } else {
        colValor = -1;
      }

      continue;
    }

    if (
      !secao ||
      colNome < 0 ||
      colValor < 0
    ) {
      continue;
    }

    const nome =
      String(
        row[colNome] ?? ""
      ).trim();

    const nomeNorm =
      normalizarTextoUmPctV1(
        nome
      );

    if (
      !nomeNorm ||
      nomeNorm ===
        "TOTAIS" ||
      nomeNorm ===
        "LOJA" ||
      nomeNorm ===
        "COLABORADOR"
    ) {
      continue;
    }

    const liquidez =
      numeroUmPctV1(
        row[colValor]
      );

    if (
      !Number.isFinite(
        liquidez
      )
    ) {
      continue;
    }

    registros.push({
      nomeRelatorio:
        nome,
      secao,
      liquidezBase:
        Math.max(
          0,
          liquidez
        ),
    });
  }

  return registros;
}

function funcaoCompativelUmPctV1(
  secao:
    | "venda"
    | "mecanica"
    | "alinhamento",
  funcao: unknown
) {
  const f =
    String(
      funcao ?? ""
    );

  if (
    secao === "venda"
  ) {
    return (
      f === "vendedor" ||
      f === "gerente"
    );
  }

  if (
    secao ===
    "mecanica"
  ) {
    return (
      f === "mecanico"
    );
  }

  return (
    f === "alinhador"
  );
}

async function importarRelatorioUmPctV1(
  file: File
) {
  if (
    !garantirCompetenciaAberta()
  ) {
    return;
  }

  setUmPorcentoImportacao({
    carregando: true,
    arquivoNome:
      file.name,
    mensagem: "",
    erro: "",
  });

  try {
    const XLSX =
      await import(
        "xlsx"
      );

    const buffer =
      await file.arrayBuffer();

    const workbook =
      XLSX.read(
        buffer,
        {
          type: "array",
        }
      );

    const matrizes:
      unknown[][][] = [];

    for (
      const sheetName of
      workbook.SheetNames
    ) {
      const sheet =
        workbook.Sheets[
          sheetName
        ];

      if (!sheet) {
        continue;
      }

      const matriz =
        XLSX.utils.sheet_to_json<
          unknown[]
        >(
          sheet,
          {
            header: 1,
            raw: true,
            defval: null,
          }
        ) as unknown[][];

      matrizes.push(
        matriz
      );
    }

    if (
      !matrizes.length
    ) {
      throw new Error(
        "A planilha não possui páginas válidas."
      );
    }

    const matrizCompleta =
      matrizes.flat();

    const periodo =
      periodoRelatorioUmPctV1(
        matrizCompleta
      );

    if (!periodo) {
      throw new Error(
        "Não consegui identificar o período do relatório."
      );
    }

    if (
      periodo.inicioMes !==
        Number(mes) ||
      periodo.inicioAno !==
        Number(ano) ||
      periodo.fimMes !==
        Number(mes) ||
      periodo.fimAno !==
        Number(ano)
    ) {
      throw new Error(
        "O relatório é do período " +
          periodo.label +
          ", mas a folha selecionada é " +
          String(mes).padStart(
            2,
            "0"
          ) +
          "/" +
          ano +
          "."
      );
    }

    const lojaRelatorio =
      lojaRelatorioUmPctV1(
        matrizCompleta
      );

    if (
      lojaRelatorio &&
      lojaRelatorio !==
        Number(lojaId)
    ) {
      throw new Error(
        "Este relatório pertence a outra loja. Selecione a loja correta antes de importar."
      );
    }

    const registros =
      registrosRelatorioUmPctV1(
        matrizCompleta
      );

    if (!registros.length) {
      throw new Error(
        "Não encontrei colaboradores com LIQ. S/ PNEUS no relatório."
      );
    }

    const funcionariosFolha =
      linhasPorQuadrante
        .flatMap(
          (grupo) =>
            grupo.linhas
        )
        .filter(
          (linha) =>
            [
              "gerente",
              "vendedor",
              "mecanico",
              "alinhador",
            ].includes(
              String(
                linha.funcao ||
                ""
              )
            )
        );

    const usados =
      new Set<number>();

    const correspondencias:
      Array<{
        funcionarioId: number;
        funcionarioNome:
          string;
        liquidezBase: number;
        nomeRelatorio:
          string;
      }> = [];

    const naoEncontrados:
      string[] = [];

    for (
      const registro of
      registros
    ) {
      const candidatos =
        funcionariosFolha
          .filter(
            (linha) =>
              !usados.has(
                Number(
                  linha.funcionarioId
                )
              ) &&
              funcaoCompativelUmPctV1(
                registro.secao,
                linha.funcao
              )
          )
          .map(
            (linha) => ({
              linha,
              score:
                scoreNomeUmPctV1(
                  registro.nomeRelatorio,
                  linha.nome
                ),
            })
          )
          .filter(
            (item) =>
              item.score >=
              0.82
          )
          .sort(
            (a, b) =>
              b.score -
              a.score
          );

      const melhor =
        candidatos[0];

      const segundo =
        candidatos[1];

      const confiavel =
        Boolean(
          melhor &&
          melhor.score >=
            0.82 &&
          (
            !segundo ||
            melhor.score -
              segundo.score >=
              0.07
          )
        );

      if (
        !confiavel ||
        !melhor
      ) {
        naoEncontrados.push(
          registro.nomeRelatorio
        );
        continue;
      }

      const funcionarioId =
        Number(
          melhor.linha
            .funcionarioId
        );

      usados.add(
        funcionarioId
      );

      correspondencias.push({
        funcionarioId,
        funcionarioNome:
          String(
            melhor.linha.nome ||
            ""
          ),
        liquidezBase:
          Number(
            registro.liquidezBase ||
            0
          ),
        nomeRelatorio:
          registro.nomeRelatorio,
      });
    }

    if (
      !correspondencias.length
    ) {
      throw new Error(
        "Nenhum nome do relatório pôde ser vinculado com segurança aos funcionários da folha."
      );
    }

    for (
      const item of
      correspondencias
    ) {
      await saveUmPorcentoMutation.mutateAsync({
        funcionarioId:
          item.funcionarioId,
        lojaId:
          Number(lojaId),
        ano:
          Number(ano),
        mes:
          Number(mes),
        liquidezBase:
          Number(
            item.liquidezBase
          ),
      });
    }

    await umPorcentoQuery.refetch();

    const atualDoEditor =
      correspondencias.find(
        (item) =>
          Number(
            item.funcionarioId
          ) ===
          Number(
            umPorcentoEditor.funcionarioId
          )
      );

    if (atualDoEditor) {
      setUmPorcentoEditor(
        (prev) => ({
          ...prev,
          liquidezBase:
            String(
              atualDoEditor.liquidezBase
            ),
        })
      );
    }

    const resumoNaoEncontrados =
      naoEncontrados.length
        ? " Não vinculados: " +
          naoEncontrados
            .slice(0, 6)
            .join(", ") +
          (
            naoEncontrados.length >
            6
              ? "..."
              : ""
          )
        : "";

    setUmPorcentoImportacao({
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
    });
  } catch (
    error: any
  ) {
    console.error(
      error
    );

    setUmPorcentoImportacao(
      (prev) => ({
        ...prev,
        carregando: false,
        mensagem: "",
        erro:
          error?.message ||
          "Erro ao importar o relatório.",
      })
    );
  }
}

`;

folha =
  folha.slice(
    0,
    handlerIndex
  ) +
  blocoImportacao +
  folha.slice(
    handlerIndex
  );

// ============================================================
// 3. AO ABRIR A CÉLULA, LIMPA O RESULTADO DA IMPORTAÇÃO ANTERIOR
// ============================================================

folha = substituirUma(
  folha,
  `function openUmPorcentoEditor(
  linha: LinhaComQuadrante
) {
  if (!garantirCompetenciaAberta()) {
    return;
  }

  const base =`,
  `function openUmPorcentoEditor(
  linha: LinhaComQuadrante
) {
  if (!garantirCompetenciaAberta()) {
    return;
  }

  setUmPorcentoImportacao({
    carregando: false,
    arquivoNome: "",
    mensagem: "",
    erro: "",
  });

  const base =`,
  "reset do importador 1%"
);

// ============================================================
// 4. INTERFACE DENTRO DO MODAL DE 1%
// ============================================================

const dialogMarker =
  `<DialogTitle className="text-[#D4AF37]">
              1% informativo`;

const dialogIndex =
  folha.indexOf(
    dialogMarker
  );

if (dialogIndex < 0) {
  falhar(
    "Não encontrei o modal 1% informativo."
  );
}

const footerIndex =
  folha.indexOf(
    "          <DialogFooter>",
    dialogIndex
  );

if (footerIndex < 0) {
  falhar(
    "Não encontrei o rodapé do modal 1%."
  );
}

const blocoInterface = `          {/* FOLHA_1PCT_IMPORT_XLSX_V1 */}
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
            <div className="mb-3">
              <p className="text-sm font-semibold text-white">
                Importar relatório mensal
              </p>

              <p className="mt-1 text-xs leading-relaxed text-white/40">
                Selecione o relatório Metas por Colaborador em Excel.
                O sistema usará LIQ. S/ PNEUS em Venda e Mecânica.
                No bloco Alinhamento, onde essa coluna não existe,
                será usada a coluna LIQUIDEZ.
              </p>
            </div>

            <Input
              type="file"
              accept=".xlsx,.xls"
              disabled={
                umPorcentoImportacao.carregando ||
                saveUmPorcentoMutation.isPending
              }
              onChange={async (event) => {
                const file =
                  event.currentTarget.files?.[0];

                event.currentTarget.value = "";

                if (!file) {
                  return;
                }

                await importarRelatorioUmPctV1(
                  file
                );
              }}
              className="cursor-pointer"
            />

            {umPorcentoImportacao.carregando && (
              <p className="mt-3 text-xs font-medium text-[#F2D675]">
                Lendo o relatório e atualizando os funcionários...
              </p>
            )}

            {umPorcentoImportacao.mensagem && (
              <div className="mt-3 rounded-lg border border-emerald-400/15 bg-emerald-400/[0.06] p-3 text-xs leading-relaxed text-emerald-300">
                {umPorcentoImportacao.mensagem}
              </div>
            )}

            {umPorcentoImportacao.erro && (
              <div className="mt-3 rounded-lg border border-red-400/20 bg-red-400/[0.06] p-3 text-xs leading-relaxed text-red-300">
                {umPorcentoImportacao.erro}
              </div>
            )}
          </div>

`;

folha =
  folha.slice(
    0,
    footerIndex
  ) +
  blocoInterface +
  folha.slice(
    footerIndex
  );

// ============================================================
// 5. VALIDAÇÕES
// ============================================================

const marcadores = [
  "FOLHA_1PCT_IMPORT_XLSX_V1",
  "importarRelatorioUmPctV1",
  "LIQ S PNEUS",
  "scoreNomeUmPctV1",
  'await import(',
  '"xlsx"',
  "Importar relatório mensal",
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
// 6. BACKUP + GRAVAÇÃO
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
    `.backup-folha-1pct-import-xlsx-v1-${carimbo}`
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

const final =
  usaCrLf
    ? folha.replace(
        /\n/g,
        "\r\n"
      )
    : folha;

const tmp =
  folhaPath +
  ".1pct-import.tmp";

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
      "FOLHA_1PCT_IMPORT_XLSX_V1"
    ) ||
    !conferir.includes(
      "importarRelatorioUmPctV1"
    )
  ) {
    falhar(
      "Arquivo temporário não passou na validação."
    );
  }

  fs.copyFileSync(
    tmp,
    folhaPath
  );

  const finalCheck =
    fs.readFileSync(
      folhaPath,
      "utf8"
    );

  if (
    !finalCheck.includes(
      "FOLHA_1PCT_IMPORT_XLSX_V1"
    )
  ) {
    falhar(
      "Pós-validação falhou."
    );
  }
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
  "✅ Importação mensal do 1% instalada."
);
console.log(
  "✅ Nenhuma regra de comissão, boleto ou PJ foi alterada."
);
console.log("");
console.log(
  "O importador agora:"
);
console.log(
  "• valida mês/ano do relatório"
);
console.log(
  "• valida a loja quando identificável"
);
console.log(
  "• usa LIQ. S/ PNEUS em Venda e Mecânica"
);
console.log(
  "• usa LIQUIDEZ em Alinhamento"
);
console.log(
  "• cruza nome + função"
);
console.log(
  "• tolera DE/DA/DO, acentos, espaços e sobrenomes adicionais"
);
console.log(
  "• não altera quem não tiver correspondência segura"
);
console.log("");
console.log(
  "Backup:"
);
console.log(
  backupDir
);
console.log("");
console.log(
  "⚠️ Nenhum commit foi executado."
);
console.log("");