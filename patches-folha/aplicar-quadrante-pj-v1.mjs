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

function contar(
  texto,
  trecho
) {
  return texto
    .split(trecho)
    .length - 1;
}

function substituirUma(
  texto,
  antigo,
  novo,
  rotulo
) {
  const total =
    contar(
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
  folha.includes(
    "FOLHA_QUADRANTE_PJ_V1"
  )
) {
  falhar(
    "O quadrante PJ V1 já parece estar instalado."
  );
}

if (
  !folha.includes(
    "FOLHA_PJ_EDITOR_V3"
  )
) {
  falhar(
    "O cadastro PJ V3 não foi encontrado. Não vou continuar."
  );
}

if (
  !folha.includes(
    "FOLHA_1PCT_HEADER_IMPORT_V1"
  )
) {
  falhar(
    "A estrutura atual do 1% não foi encontrada. Não vou continuar."
  );
}

// ============================================================
// 1. NOVO QUADRANTE PJ SOMENTE PARA EXIBIÇÃO
// ============================================================

folha = substituirUma(
  folha,
  `type QuadranteKey =
  | "gerente"`,
  `type QuadranteKey =
  | "pj" // FOLHA_QUADRANTE_PJ_V1
  | "gerente"`,
  "QuadranteKey PJ"
);

// ============================================================
// 2. TÍTULO
// ============================================================

folha = substituirUma(
  folha,
  `function getQuadranteTitulo(key: QuadranteKey) {
  switch (key) {
    case "gerente":`,
  `function getQuadranteTitulo(key: QuadranteKey) {
  switch (key) {
    case "pj":
      return "Funcionários PJ";
    case "gerente":`,
  "Título quadrante PJ"
);

// ============================================================
// 3. DESCRIÇÃO
// ============================================================

folha = substituirUma(
  folha,
  `function getQuadranteDescricao(key: QuadranteKey) {
  switch (key) {
    case "gerente":`,
  `function getQuadranteDescricao(key: QuadranteKey) {
  switch (key) {
    case "pj":
      return "Contrato PJ • mantém a regra de comissão da função original";
    case "gerente":`,
  "Descrição quadrante PJ"
);

// ============================================================
// 4. IDENTIFICA O NOVO QUADRANTE NA TABELA
// ============================================================

folha = substituirUma(
  folha,
  `  const isSupervisor = quadrante === "supervisor_pj";
  const isSupervisoraAci = quadrante === "supervisora_consultores_pj";
  const isPj = isSupervisor || isSupervisoraAci;`,
  `  const isSupervisor = quadrante === "supervisor_pj";
  const isSupervisoraAci = quadrante === "supervisora_consultores_pj";
  const isPjQuadrante = quadrante === "pj";
  const isPj = isSupervisor || isSupervisoraAci;`,
  "Flag isPjQuadrante"
);

// ============================================================
// 5. PJ NÃO EXIBE 1%
// ============================================================

folha = substituirUma(
  folha,
  `  const exibeUmPorcento =
    linhas.some((linha) =>`,
  `  const exibeUmPorcento =
    !isPjQuadrante &&
    linhas.some((linha) =>`,
  "Ocultar 1% do PJ"
);

// ============================================================
// 6. SEM1 A SEM5 DO PJ USAM O MESMO IMPORTADOR
// ============================================================

const ancoraSemana =
  `quadrante === "comissao_semanal" ? (`;

const totalAncoraSemana =
  contar(
    folha,
    ancoraSemana
  );

if (
  totalAncoraSemana < 4 ||
  totalAncoraSemana > 6
) {
  falhar(
    `Botões das semanas: esperava entre 4 e 6 ocorrências e encontrei ${totalAncoraSemana}.`
  );
}

folha =
  folha
    .split(
      ancoraSemana
    )
    .join(
      `(quadrante === "comissao_semanal" || isPjQuadrante) ? (`
    );

// ============================================================
// 7. ADIANTAMENTO PJ MANUAL
//    SEM BOTÃO DE PDF NO QUADRANTE PJ
// ============================================================

folha = substituirUma(
  folha,
  `                {isSupervisoraAci ? (
                  <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">Adiant.</th>
                ) : (
                  <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">
                    <button
                      type="button"
                      onClick={onOpenImportacaoAdiantamento}
                      className="inline-flex items-center gap-1 text-[#D4AF37] hover:text-[#F2D675] hover:underline underline-offset-4"
                      title="Importar PDF de adiantamento"
                    >
                      Adiant.
                      <span className="text-[10px] font-normal text-gray-400">PDF</span>
                    </button>
                  </th>
                )}`,
  `                {isPjQuadrante ? (
                  <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">
                    Adiantamento
                  </th>
                ) : isSupervisoraAci ? (
                  <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">Adiant.</th>
                ) : (
                  <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">
                    <button
                      type="button"
                      onClick={onOpenImportacaoAdiantamento}
                      className="inline-flex items-center gap-1 text-[#D4AF37] hover:text-[#F2D675] hover:underline underline-offset-4"
                      title="Importar PDF de adiantamento"
                    >
                      Adiant.
                      <span className="text-[10px] font-normal text-gray-400">PDF</span>
                    </button>
                  </th>
                )}`,
  "Cabeçalho Adiantamento PJ"
);

// ============================================================
// 8. HOLERITE DO PJ VIRA PAGAMENTO PJ MANUAL
// ============================================================

folha = substituirUma(
  folha,
  `                {!isPj && (
                  <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">
                    <button
                      type="button"
                      onClick={onOpenImportacaoHolerite}
                      className="inline-flex items-center gap-1 text-[#D4AF37] hover:text-[#F2D675] hover:underline underline-offset-4"
                      title="Importar PDF da folha mensal"
                    >
                      Holerite / Pagamento
                      <span className="text-[10px] font-normal text-gray-400">PDF</span>
                    </button>
                  </th>
                )}`,
  `                {isPjQuadrante ? (
                  <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em] text-[#F2D675]">
                    Pagamento PJ
                  </th>
                ) : !isPj && (
                  <th className="p-3 text-right text-[11px] font-bold uppercase tracking-[0.06em]">
                    <button
                      type="button"
                      onClick={onOpenImportacaoHolerite}
                      className="inline-flex items-center gap-1 text-[#D4AF37] hover:text-[#F2D675] hover:underline underline-offset-4"
                      title="Importar PDF da folha mensal"
                    >
                      Holerite
                      <span className="text-[10px] font-normal text-gray-400">PDF</span>
                    </button>
                  </th>
                )}`,
  "Cabeçalho Pagamento PJ"
);

// ============================================================
// 9. IMPORTAÇÃO DE 1% IGNORA PJs
// ============================================================

folha = substituirUma(
  folha,
  `    const funcionariosFolha =
      linhasPorQuadrante
        .flatMap(
          (grupo) =>
            grupo.linhas
        )
        .filter(
          (linha) =>
            [`,
  `    const funcionariosFolha =
      linhasPorQuadrante
        .flatMap(
          (grupo) =>
            grupo.linhas
        )
        .filter(
          (linha) =>
            !pjFuncionarioIds.has(
              Number(
                linha.funcionarioId
              )
            )
        )
        .filter(
          (linha) =>
            [`,
  "Excluir PJ da importação de 1%"
);

// ============================================================
// 10. QUADRANTE PJ É O PRIMEIRO
//
// IMPORTANTE:
// Não alteramos linha.quadrante original.
// Assim, vendedor continua vendedor,
// mecânico continua mecânico,
// gerente continua gerente etc.
//
// A separação PJ acontece SOMENTE na tela.
// ============================================================

folha = substituirUma(
  folha,
  `  const ordemQuadrantes: QuadranteKey[] = [
  "gerente",
  "comissao_semanal",
  "comissao_mensal",
  "alinhador",
  "recepcao",
  "consultor_vendas",
  "consultor_vendas_mensal",
  "supervisora_consultores_pj",
  "supervisor_pj",
  "salario_fixo",
];

  const linhasPorQuadrante = useMemo(() => {
  return ordemQuadrantes.map((key) => {
    let linhasQuadrante = linhas.filter((l) => l.quadrante === key);

    // Ordenação especial para salário fixo
    if (key === "salario_fixo") {
      linhasQuadrante = [...linhasQuadrante].sort((a, b) => {
        const funcaoCompare = a.funcao.localeCompare(b.funcao);

        if (funcaoCompare !== 0) {
          return funcaoCompare;
        }

        return a.nome.localeCompare(b.nome);
      });
    }

    return {
      key,
      titulo: getQuadranteTitulo(key),
      descricao: getQuadranteDescricao(key),
      linhas: linhasQuadrante,
    };
  });
}, [linhas]);`,
  `  const ordemQuadrantes: QuadranteKey[] = [
  "pj", // FOLHA_QUADRANTE_PJ_V1 — sempre primeiro
  "gerente",
  "comissao_semanal",
  "comissao_mensal",
  "alinhador",
  "recepcao",
  "consultor_vendas",
  "consultor_vendas_mensal",
  "supervisora_consultores_pj",
  "supervisor_pj",
  "salario_fixo",
];

  const linhasPorQuadrante = useMemo(() => {
  const ehPjNovoQuadrante = (
    linha: LinhaComQuadrante
  ) =>
    pjFuncionarioIds.has(
      Number(
        linha.funcionarioId
      )
    ) &&
    linha.quadrante !==
      "supervisor_pj" &&
    linha.quadrante !==
      "supervisora_consultores_pj";

  return ordemQuadrantes.map((key) => {
    let linhasQuadrante =
      key === "pj"
        ? linhas.filter(
            (linha) =>
              ehPjNovoQuadrante(
                linha
              )
          )
        : linhas.filter(
            (linha) =>
              linha.quadrante ===
                key &&
              !ehPjNovoQuadrante(
                linha
              )
          );

    // PJ e salário fixo ficam
    // organizados por função e nome.
    if (
      key === "pj" ||
      key === "salario_fixo"
    ) {
      linhasQuadrante =
        [...linhasQuadrante]
          .sort((a, b) => {
            const funcaoCompare =
              a.funcao.localeCompare(
                b.funcao
              );

            if (
              funcaoCompare !== 0
            ) {
              return funcaoCompare;
            }

            return a.nome.localeCompare(
              b.nome
            );
          });
    }

    return {
      key,
      titulo:
        getQuadranteTitulo(
          key
        ),
      descricao:
        getQuadranteDescricao(
          key
        ),
      linhas:
        linhasQuadrante,
    };
  });
}, [linhas, pjFuncionarioIds]);`,
  "Ordem e separação do quadrante PJ"
);

// ============================================================
// 11. VALIDAÇÕES
// ============================================================

const obrigatorios = [
  `| "pj" // FOLHA_QUADRANTE_PJ_V1`,
  `return "Funcionários PJ"`,
  `const isPjQuadrante = quadrante === "pj"`,
  `!isPjQuadrante &&`,
  `Pagamento PJ`,
  `"pj", // FOLHA_QUADRANTE_PJ_V1 — sempre primeiro`,
  `key === "pj"`,
  `!pjFuncionarioIds.has(`,
];

for (
  const marcador of
  obrigatorios
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
// 12. BACKUP
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
    `.backup-quadrante-pj-v1-${carimbo}`
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
// 13. GRAVAÇÃO SEGURA
// ============================================================

const final =
  usaCrLf
    ? folha.replace(
        /\n/g,
        "\r\n"
      )
    : folha;

const tmp =
  `${folhaPath}.quadrante-pj-v1.tmp`;

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

  for (
    const marcador of
    obrigatorios
  ) {
    if (
      !conferir.includes(
        marcador
      )
    ) {
      falhar(
        `Arquivo temporário não passou na validação: ${marcador}`
      );
    }
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
  "✅ Quadrante PJ V1 aplicado."
);
console.log(
  "✅ Funcionários marcados como PJ aparecem no primeiro quadrante."
);
console.log(
  "✅ A função original continua sendo usada nos cálculos de comissão."
);
console.log(
  "✅ SEM1 a SEM5 continuam usando o importador normal das semanas."
);
console.log(
  "✅ PJ não exibe nem recebe importação de 1%."
);
console.log(
  "✅ Adiantamento e Pagamento PJ ficam manuais no quadrante PJ."
);
console.log(
  "✅ Regra financeira dos R$ 6.500,00 não foi alterada."
);
console.log("");
console.log("Backup:");
console.log(backupDir);
console.log("");
console.log(
  "⚠️ Nenhum commit foi executado."
);
console.log("");