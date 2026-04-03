import { useMemo, useState } from "react";

type Unidade = "Joinville" | "Blumenau";
type Funcao =
  | "Alinhador"
  | "Auxiliar de Alinhador"
  | "Vendedor de Alinhamento";

type CampoFinanceiro =
  | "premiacao"
  | "aluguel"
  | "inss"
  | "adiant"
  | "holerite";

interface Funcionario {
  id: number;
  nome: string;
  funcao: Funcao;
  unidade: Unidade;
}

interface RegistroMensal {
  funcionarioId: number;
  unidade: Unidade;
  ano: number;
  mes: number;
  liquidez: number;
}

interface Financeiro {
  funcionarioId: number;
  unidade: Unidade;
  ano: number;
  mes: number;
  premiacao: number;
  aluguel: number;
  inss: number;
  adiant: number;
  holerite: number;
}

interface ObservacaoRegistro {
  id: number;
  funcionarioId: number;
  unidade: Unidade;
  ano: number;
  mes: number;
  texto: string;
}

interface ValeParcela {
  id: number;
  grupoId: string;
  funcionarioId: number;
  unidade: Unidade;
  descricao: string;
  valor: number;
  parcelaAtual: number;
  totalParcelas: number;
  ano: number;
  mes: number;
}

interface Meta {
  unidade: Unidade;
  funcao: Funcao;
  regras: {
    minimo: number;
    percentual: number;
  }[];
}

const ANOS = [2026, 2027, 2028, 2029, 2030];
const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const funcionariosIniciais: Funcionario[] = [
  { id: 1, nome: "José", funcao: "Alinhador", unidade: "Joinville" },
  { id: 2, nome: "Paulo", funcao: "Auxiliar de Alinhador", unidade: "Joinville" },
  { id: 3, nome: "Lucas", funcao: "Vendedor de Alinhamento", unidade: "Blumenau" },
];

const metas: Meta[] = [
  {
    unidade: "Joinville",
    funcao: "Alinhador",
    regras: [
      { minimo: 0, percentual: 2 },
      { minimo: 100000, percentual: 2.5 },
      { minimo: 120000, percentual: 3 },
      { minimo: 140000, percentual: 3.5 },
      { minimo: 160000, percentual: 4 },
    ],
  },
  {
    unidade: "Joinville",
    funcao: "Auxiliar de Alinhador",
    regras: [
      { minimo: 0, percentual: 2 },
      { minimo: 100000, percentual: 2.5 },
      { minimo: 120000, percentual: 3 },
      { minimo: 140000, percentual: 3.5 },
      { minimo: 160000, percentual: 4 },
    ],
  },
  {
    unidade: "Blumenau",
    funcao: "Vendedor de Alinhamento",
    regras: [
      { minimo: 0, percentual: 6 },
      { minimo: 80000, percentual: 7 },
      { minimo: 90000, percentual: 8 },
      { minimo: 110000, percentual: 9 },
    ],
  },
];

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function getMesNumero(nomeMes: string) {
  return MESES.indexOf(nomeMes) + 1;
}

function getMesNome(numeroMes: number) {
  return MESES[numeroMes - 1] || "";
}

function avancarMes(ano: number, mes: number, quantidade: number) {
  const data = new Date(ano, mes - 1, 1);
  data.setMonth(data.getMonth() + quantidade);
  return {
    ano: data.getFullYear(),
    mes: data.getMonth() + 1,
  };
}

function ordenarCompetencia(aAno: number, aMes: number, bAno: number, bMes: number) {
  if (aAno !== bAno) return aAno - bAno;
  return aMes - bMes;
}

function formatarResumoMeta(meta: Meta | undefined) {
  if (!meta) return "Sem meta cadastrada";

  return meta.regras
    .map((regra, idx) => {
      const proxima = meta.regras[idx + 1];
      if (proxima) {
        return `${formatCurrency(regra.minimo)} até ${formatCurrency(
          proxima.minimo - 0.01
        )} = ${regra.percentual}%`;
      }
      return `A partir de ${formatCurrency(regra.minimo)} = ${regra.percentual}%`;
    })
    .join("\n");
}

export default function MetaMensal() {
  const [unidade, setUnidade] = useState<Unidade>("Joinville");
  const [ano, setAno] = useState<number>(2026);
  const [mes, setMes] = useState<string>("Março");

  const [funcionarios] = useState<Funcionario[]>(funcionariosIniciais);
  const [registros, setRegistros] = useState<RegistroMensal[]>([]);
  const [financeiro, setFinanceiro] = useState<Financeiro[]>([]);
  const [observacoes, setObservacoes] = useState<ObservacaoRegistro[]>([]);
  const [vales, setVales] = useState<ValeParcela[]>([]);

  const mesNumero = getMesNumero(mes);

  const filtrados = useMemo(() => {
    return funcionarios.filter((f) => f.unidade === unidade);
  }, [funcionarios, unidade]);

  function buscarMeta(funcao: Funcao, unidadeAtual: Unidade) {
    return metas.find((m) => m.funcao === funcao && m.unidade === unidadeAtual);
  }

  function calcularPercentual(meta: Meta | undefined, valor: number) {
    if (!meta) return 0;

    let perc = 0;
    for (const regra of meta.regras) {
      if (valor >= regra.minimo) perc = regra.percentual;
    }
    return perc;
  }

  function getRegistro(funcionarioId: number): RegistroMensal {
    return (
      registros.find(
        (r) =>
          r.funcionarioId === funcionarioId &&
          r.unidade === unidade &&
          r.ano === ano &&
          r.mes === mesNumero
      ) || {
        funcionarioId,
        unidade,
        ano,
        mes: mesNumero,
        liquidez: 0,
      }
    );
  }

  function getFinanceiro(funcionarioId: number): Financeiro {
    return (
      financeiro.find(
        (f) =>
          f.funcionarioId === funcionarioId &&
          f.unidade === unidade &&
          f.ano === ano &&
          f.mes === mesNumero
      ) || {
        funcionarioId,
        unidade,
        ano,
        mes: mesNumero,
        premiacao: 0,
        aluguel: 0,
        inss: 0,
        adiant: 0,
        holerite: 0,
      }
    );
  }

  function getObservacoesDoMes(funcionarioId: number) {
    return observacoes.filter(
      (obs) =>
        obs.funcionarioId === funcionarioId &&
        obs.unidade === unidade &&
        obs.ano === ano &&
        obs.mes === mesNumero
    );
  }

  function getValesDoMes(funcionarioId: number) {
    return vales.filter(
      (vale) =>
        vale.funcionarioId === funcionarioId &&
        vale.unidade === unidade &&
        vale.ano === ano &&
        vale.mes === mesNumero
    );
  }

  function getTotalValeDoMes(funcionarioId: number) {
    return getValesDoMes(funcionarioId).reduce((acc, vale) => acc + vale.valor, 0);
  }

  function atualizarLiquidez(funcionarioId: number) {
    const atual = getRegistro(funcionarioId);
    const valor = window.prompt("Digite a liquidez:", String(atual.liquidez || 0));
    if (valor === null) return;

    const numero = Number(valor.replace(",", ".")) || 0;

    setRegistros((prev) => {
      const existe = prev.find(
        (r) =>
          r.funcionarioId === funcionarioId &&
          r.unidade === unidade &&
          r.ano === ano &&
          r.mes === mesNumero
      );

      if (existe) {
        return prev.map((r) =>
          r.funcionarioId === funcionarioId &&
          r.unidade === unidade &&
          r.ano === ano &&
          r.mes === mesNumero
            ? { ...r, liquidez: numero }
            : r
        );
      }

      return [...prev, { funcionarioId, unidade, ano, mes: mesNumero, liquidez: numero }];
    });
  }

  function atualizarCampo(funcionarioId: number, campo: CampoFinanceiro, label: string) {
    const atual = getFinanceiro(funcionarioId);
    const valor = window.prompt(`Digite o valor de ${label}:`, String(atual[campo] || 0));
    if (valor === null) return;

    const numero = Number(valor.replace(",", ".")) || 0;

    setFinanceiro((prev) => {
      const existe = prev.find(
        (f) =>
          f.funcionarioId === funcionarioId &&
          f.unidade === unidade &&
          f.ano === ano &&
          f.mes === mesNumero
      );

      if (existe) {
        return prev.map((f) =>
          f.funcionarioId === funcionarioId &&
          f.unidade === unidade &&
          f.ano === ano &&
          f.mes === mesNumero
            ? { ...f, [campo]: numero }
            : f
        );
      }

      return [
        ...prev,
        {
          funcionarioId,
          unidade,
          ano,
          mes: mesNumero,
          premiacao: 0,
          aluguel: 0,
          inss: 0,
          adiant: 0,
          holerite: 0,
          [campo]: numero,
        } as Financeiro,
      ];
    });
  }

  function gerenciarObservacoes(funcionarioId: number) {
    const lista = getObservacoesDoMes(funcionarioId);

    const listaTexto =
      lista.length > 0
        ? lista.map((obs, i) => `${i + 1}. ${obs.texto}`).join("\n")
        : "Nenhuma observação.";

    const acao = window.prompt(
      `Observações de ${mes}/${ano}:\n\n${listaTexto}\n\nDigite:\n1 para adicionar\n2 para excluir`,
      "1"
    );

    if (acao === null) return;

    if (acao === "1") {
      const texto = window.prompt("Digite a nova observação:");
      if (!texto) return;

      setObservacoes((prev) => [
        ...prev,
        {
          id: Date.now() + Math.floor(Math.random() * 1000),
          funcionarioId,
          unidade,
          ano,
          mes: mesNumero,
          texto,
        },
      ]);
    }

    if (acao === "2") {
      if (lista.length === 0) {
        window.alert("Não há observações para excluir.");
        return;
      }

      const indice = window.prompt(
        `Digite o número da observação que deseja excluir:\n\n${listaTexto}`
      );
      if (!indice) return;

      const indiceNumero = Number(indice) - 1;
      if (Number.isNaN(indiceNumero) || indiceNumero < 0 || indiceNumero >= lista.length) {
        window.alert("Índice inválido.");
        return;
      }

      const alvo = lista[indiceNumero];
      setObservacoes((prev) => prev.filter((item) => item.id !== alvo.id));
    }
  }

  function gerenciarVales(funcionarioId: number, nomeFuncionario: string) {
    const lista = getValesDoMes(funcionarioId);

    const textoLista =
      lista.length > 0
        ? lista
            .map(
              (vale, i) =>
                `${i + 1}. ${vale.descricao} - ${formatCurrency(vale.valor)} (Parcela ${vale.parcelaAtual}/${vale.totalParcelas})`
            )
            .join("\n")
        : "Nenhum vale neste mês.";

    const acao = window.prompt(
      `Vales de ${nomeFuncionario} em ${mes}/${ano}:\n\n${textoLista}\n\nDigite:\n1 para adicionar vale\n2 para excluir vale`,
      "1"
    );

    if (acao === null) return;

    if (acao === "1") {
      const descricao = window.prompt("Descrição do vale:");
      if (!descricao) return;

      const valorTexto = window.prompt("Valor total do vale:");
      if (!valorTexto) return;

      const valor = Number(valorTexto.replace(",", ".")) || 0;
      if (valor <= 0) {
        window.alert("Valor inválido.");
        return;
      }

      const parcelasTexto = window.prompt("Quantidade de parcelas:", "1");
      if (!parcelasTexto) return;

      const totalParcelas = Number(parcelasTexto) || 1;
      if (totalParcelas <= 0) {
        window.alert("Quantidade de parcelas inválida.");
        return;
      }

      const grupoId = `vale_${funcionarioId}_${Date.now()}`;
      const novosVales: ValeParcela[] = [];

      for (let i = 0; i < totalParcelas; i++) {
        const destino = avancarMes(ano, mesNumero, i);

        novosVales.push({
          id: Date.now() + i + Math.floor(Math.random() * 1000),
          grupoId,
          funcionarioId,
          unidade,
          descricao,
          valor: Number((valor / totalParcelas).toFixed(2)),
          parcelaAtual: i + 1,
          totalParcelas,
          ano: destino.ano,
          mes: destino.mes,
        });
      }

      setVales((prev) => [...prev, ...novosVales]);
    }

    if (acao === "2") {
      if (lista.length === 0) {
        window.alert("Não há vales para excluir.");
        return;
      }

      const indice = window.prompt(
        `Digite o número do vale que deseja excluir:\n\n${textoLista}`
      );
      if (!indice) return;

      const indiceNumero = Number(indice) - 1;
      if (Number.isNaN(indiceNumero) || indiceNumero < 0 || indiceNumero >= lista.length) {
        window.alert("Índice inválido.");
        return;
      }

      const valeSelecionado = lista[indiceNumero];

      setVales((prev) =>
        prev.filter((vale) => {
          if (vale.grupoId !== valeSelecionado.grupoId) return true;

          const comparacao = ordenarCompetencia(
            vale.ano,
            vale.mes,
            valeSelecionado.ano,
            valeSelecionado.mes
          );

          return comparacao < 0;
        })
      );
    }
  }

  function handleBoletoNegativo(funcionarioId: number, nomeFuncionario: string, boleto: number) {
    if (boleto >= 0) {
      window.alert(`Boleto atual: ${formatCurrency(boleto)}`);
      return;
    }

    const confirmar = window.confirm(
      `O boleto de ${nomeFuncionario} está negativo em ${formatCurrency(
        boleto
      )}.\n\nDeseja adicionar isso como vale no mês seguinte?`
    );

    if (!confirmar) return;

    const proximoMes = avancarMes(ano, mesNumero, 1);

    const novoVale: ValeParcela = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      grupoId: `negativo_${funcionarioId}_${Date.now()}`,
      funcionarioId,
      unidade,
      descricao: `Negativo do mês ${mes}/${ano}`,
      valor: Math.abs(Number(boleto.toFixed(2))),
      parcelaAtual: 1,
      totalParcelas: 1,
      ano: proximoMes.ano,
      mes: proximoMes.mes,
    };

    setVales((prev) => [...prev, novoVale]);

    window.alert(
      `Vale criado para ${getMesNome(proximoMes.mes)}/${proximoMes.ano} no valor de ${formatCurrency(
        novoVale.valor
      )}.`
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#000", color: "white", padding: 20 }}>
      <div style={{ maxWidth: 1500, margin: "0 auto" }}>
        <div style={{ marginBottom: 24, display: "flex", alignItems: "center", gap: 16 }}>
          <button
            onClick={() => (window.location.href = "/")}
            style={{
              background: "transparent",
              border: "none",
              color: "#fbbf24",
              cursor: "pointer",
              fontSize: 20,
            }}
          >
            ← Voltar
          </button>

          <div>
            <h1 style={{ color: "#fbbf24", fontSize: 32, margin: 0 }}>Meta Mensal</h1>
            <p style={{ color: "#9ca3af", marginTop: 8 }}>
              Alinhador • Auxiliar de Alinhador • Vendedor de Alinhamento
            </p>
          </div>
        </div>

        <div style={cardStyle}>
          <h2 style={sectionTitleStyle}>Filtros</h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 16,
            }}
          >
            <div>
              <label style={labelStyle}>Unidade</label>
              <select
                value={unidade}
                onChange={(e) => setUnidade(e.target.value as Unidade)}
                style={inputStyle}
              >
                <option value="Joinville">Joinville</option>
                <option value="Blumenau">Blumenau</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>Ano</label>
              <select
                value={ano}
                onChange={(e) => setAno(Number(e.target.value))}
                style={inputStyle}
              >
                {ANOS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Mês</label>
              <select
                value={mes}
                onChange={(e) => setMes(e.target.value)}
                style={inputStyle}
              >
                {MESES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div style={cardStyle}>
          <h2 style={sectionTitleStyle}>Comissão Mensal • {unidade} • {mes}/{ano}</h2>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 1400, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(251, 191, 36, 0.3)" }}>
                  <th style={thStyle}>Nome</th>
                  <th style={thStyle}>Função</th>
                  <th style={thStyle}>Total Liquidez</th>
                  <th style={thStyle}>%</th>
                  <th style={thStyle}>Total Comissão</th>
                  <th style={thStyle}>Premiação</th>
                  <th style={thStyle}>Vale</th>
                  <th style={thStyle}>Aluguel</th>
                  <th style={thStyle}>INSS</th>
                  <th style={thStyle}>Adiant.</th>
                  <th style={thStyle}>Holerite</th>
                  <th style={thStyle}>Boleto</th>
                  <th style={thStyle}>Observação</th>
                </tr>
              </thead>

              <tbody>
                {filtrados.map((f) => {
                  const registro = getRegistro(f.id);
                  const meta = buscarMeta(f.funcao, f.unidade);
                  const perc = calcularPercentual(meta, registro.liquidez);
                  const comissao = registro.liquidez * (perc / 100);

                  const fin = getFinanceiro(f.id);
                  const totalVale = getTotalValeDoMes(f.id);
                  const totalObs = getObservacoesDoMes(f.id).length;

                  const boleto =
                    comissao +
                    fin.premiacao -
                    totalVale -
                    fin.aluguel -
                    fin.inss -
                    fin.adiant -
                    fin.holerite;

                  return (
                    <tr key={f.id} style={{ borderBottom: "1px solid rgba(251, 191, 36, 0.1)" }}>
                      <td style={tdStyle}>{f.nome}</td>
                      <td style={tdStyle}>{f.funcao}</td>

                      <td style={tdStyle}>
                        <button onClick={() => atualizarLiquidez(f.id)} style={moneyActionStyle}>
                          {formatCurrency(registro.liquidez)}
                        </button>
                      </td>

                      <td style={tdStyle}>
                        <button
                          onClick={() =>
                            alert(
                              `Funcionário: ${f.nome}\nFunção: ${f.funcao}\nLiquidez: ${formatCurrency(
                                registro.liquidez
                              )}\nPercentual: ${perc}%\nComissão: ${formatCurrency(
                                comissao
                              )}\n\n${formatarResumoMeta(meta)}`
                            )
                          }
                          style={valueButtonStyle}
                        >
                          {perc}%
                        </button>
                      </td>

                      <td style={tdStyle}>{formatCurrency(comissao)}</td>

                      <td style={tdStyle}>
                        <button
                          onClick={() => atualizarCampo(f.id, "premiacao", "Premiação")}
                          style={moneyActionStyle}
                        >
                          {formatCurrency(fin.premiacao)}
                        </button>
                      </td>

                      <td style={tdStyle}>
                        <button
                          onClick={() => gerenciarVales(f.id, f.nome)}
                          style={moneyActionStyle}
                        >
                          {formatCurrency(totalVale)}
                        </button>
                      </td>

                      <td style={tdStyle}>
                        <button
                          onClick={() => atualizarCampo(f.id, "aluguel", "Aluguel")}
                          style={moneyActionStyle}
                        >
                          {formatCurrency(fin.aluguel)}
                        </button>
                      </td>

                      <td style={tdStyle}>
                        <button
                          onClick={() => atualizarCampo(f.id, "inss", "INSS")}
                          style={moneyActionStyle}
                        >
                          {formatCurrency(fin.inss)}
                        </button>
                      </td>

                      <td style={tdStyle}>
                        <button
                          onClick={() => atualizarCampo(f.id, "adiant", "Adiantamento")}
                          style={moneyActionStyle}
                        >
                          {formatCurrency(fin.adiant)}
                        </button>
                      </td>

                      <td style={tdStyle}>
                        <button
                          onClick={() => atualizarCampo(f.id, "holerite", "Holerite")}
                          style={moneyActionStyle}
                        >
                          {formatCurrency(fin.holerite)}
                        </button>
                      </td>

                      <td style={tdStyle}>
                        <button
                          onClick={() => handleBoletoNegativo(f.id, f.nome, boleto)}
                          style={{
                            ...moneyActionStyle,
                            color: boleto < 0 ? "#f87171" : "#d1d5db",
                            borderColor:
                              boleto < 0
                                ? "rgba(248, 113, 113, 0.35)"
                                : "rgba(251, 191, 36, 0.25)",
                            background:
                              boleto < 0
                                ? "rgba(248, 113, 113, 0.12)"
                                : "rgba(251, 191, 36, 0.08)",
                          }}
                        >
                          {formatCurrency(boleto)}
                        </button>
                      </td>

                      <td style={tdStyle}>
                        <button
                          onClick={() => gerenciarObservacoes(f.id)}
                          style={{
                            ...moneyActionStyle,
                            background:
                              totalObs > 0
                                ? "rgba(239, 68, 68, 0.18)"
                                : "rgba(251, 191, 36, 0.08)",
                            color: totalObs > 0 ? "#f87171" : "#fbbf24",
                          }}
                        >
                          {totalObs > 0 ? "OBS" : "Adicionar"}
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {filtrados.length === 0 && (
                  <tr>
                    <td colSpan={13} style={emptyTdStyle}>
                      Nenhum funcionário nessa unidade
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "#111",
  border: "1px solid rgba(251, 191, 36, 0.3)",
  borderRadius: "8px",
  padding: "24px",
  marginBottom: "24px",
};

const sectionTitleStyle: React.CSSProperties = {
  color: "#fbbf24",
  marginBottom: "12px",
  fontSize: "22px",
  fontWeight: 700,
};

const labelStyle: React.CSSProperties = {
  color: "#d1d5db",
  display: "block",
  marginBottom: "8px",
  fontSize: "14px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#1f2937",
  border: "1px solid rgba(251, 191, 36, 0.3)",
  color: "white",
  padding: "8px 12px",
  borderRadius: "4px",
  fontSize: "14px",
  boxSizing: "border-box",
};

const moneyActionStyle: React.CSSProperties = {
  background: "rgba(251, 191, 36, 0.08)",
  border: "1px solid rgba(251, 191, 36, 0.25)",
  color: "#fbbf24",
  padding: "8px 10px",
  borderRadius: "4px",
  cursor: "pointer",
  fontWeight: 600,
  minWidth: "110px",
};

const valueButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid rgba(251, 191, 36, 0.25)",
  color: "#fbbf24",
  padding: "8px 10px",
  borderRadius: "4px",
  cursor: "pointer",
  fontWeight: 700,
  minWidth: "70px",
};

const thStyle: React.CSSProperties = {
  color: "#fbbf24",
  textAlign: "left",
  padding: "12px",
  fontWeight: 700,
};

const tdStyle: React.CSSProperties = {
  color: "#d1d5db",
  padding: "12px",
  verticalAlign: "middle",
};

const emptyTdStyle: React.CSSProperties = {
  textAlign: "center",
  color: "#9ca3af",
  padding: "32px 12px",
};
