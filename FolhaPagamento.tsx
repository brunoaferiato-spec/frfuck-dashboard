import { useMemo, useState } from "react";

type Unidade = "Joinville" | "Blumenau";
type Funcao = "Vendedor" | "Mecânico";

interface FuncionarioFolha {
  id: number;
  nome: string;
  funcao: Funcao;
  unidade: Unidade;
  sem1: number;
  sem2: number;
  sem3: number;
  sem4: number;
  premiacao: number;
  vale: number;
  aluguel: number;
  inss: number;
  adiantamento: number;
  holerite: number;
  observacoes: string[];
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

const dadosIniciais: FuncionarioFolha[] = [
  {
    id: 1,
    nome: "João",
    funcao: "Vendedor",
    unidade: "Joinville",
    sem1: 0,
    sem2: 0,
    sem3: 0,
    sem4: 0,
    premiacao: 0,
    vale: 0,
    aluguel: 0,
    inss: 0,
    adiantamento: 0,
    holerite: 0,
    observacoes: [],
  },
  {
    id: 2,
    nome: "Carlos",
    funcao: "Mecânico",
    unidade: "Joinville",
    sem1: 0,
    sem2: 0,
    sem3: 0,
    sem4: 0,
    premiacao: 0,
    vale: 0,
    aluguel: 0,
    inss: 0,
    adiantamento: 0,
    holerite: 0,
    observacoes: [],
  },
  {
    id: 3,
    nome: "Marcos",
    funcao: "Vendedor",
    unidade: "Blumenau",
    sem1: 0,
    sem2: 0,
    sem3: 0,
    sem4: 0,
    premiacao: 0,
    vale: 0,
    aluguel: 0,
    inss: 0,
    adiantamento: 0,
    holerite: 0,
    observacoes: [],
  },
  {
    id: 4,
    nome: "Pedro",
    funcao: "Mecânico",
    unidade: "Blumenau",
    sem1: 0,
    sem2: 0,
    sem3: 0,
    sem4: 0,
    premiacao: 0,
    vale: 0,
    aluguel: 0,
    inss: 0,
    adiantamento: 0,
    holerite: 0,
    observacoes: [],
  },
];

function getPercentual(funcao: Funcao, liquidez: number): number {
  if (funcao === "Vendedor") {
    if (liquidez >= 47000) return 8;
    if (liquidez >= 40000) return 7;
    if (liquidez >= 33000) return 6;
    return 5;
  }

  if (funcao === "Mecânico") {
    if (liquidez >= 20000) return 17;
    if (liquidez >= 10000) return 15;
    if (liquidez >= 8000) return 12;
    return 10;
  }

  return 0;
}

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function FolhaPagamento() {
  const [unidade, setUnidade] = useState<Unidade>("Joinville");
  const [ano, setAno] = useState<number>(2026);
  const [mes, setMes] = useState<string>("Março");
  const [registros, setRegistros] = useState<FuncionarioFolha[]>(dadosIniciais);

  const filtrados = useMemo(() => {
    return registros.filter((item) => item.unidade === unidade);
  }, [registros, unidade]);

  const atualizarSemana = (
    id: number,
    campo: "sem1" | "sem2" | "sem3" | "sem4",
    label: string
  ) => {
    const atual = registros.find((item) => item.id === id);
    if (!atual) return;

    const valor = window.prompt(`Digite o valor de ${label}:`, String(atual[campo] || 0));
    if (valor === null) return;

    const numero = Number(valor.replace(",", ".")) || 0;

    setRegistros((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [campo]: numero } : item))
    );
  };

  const atualizarCampoValor = (
    id: number,
    campo: "premiacao" | "vale" | "aluguel" | "inss" | "adiantamento" | "holerite",
    label: string
  ) => {
    const atual = registros.find((item) => item.id === id);
    if (!atual) return;

    const valor = window.prompt(`Digite o valor de ${label}:`, String(atual[campo] || 0));
    if (valor === null) return;

    const numero = Number(valor.replace(",", ".")) || 0;

    setRegistros((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [campo]: numero } : item))
    );
  };

  const gerenciarObservacoes = (id: number) => {
    const atual = registros.find((item) => item.id === id);
    if (!atual) return;

    const listaAtual =
      atual.observacoes.length > 0
        ? atual.observacoes.map((obs, i) => `${i + 1}. ${obs}`).join("\n")
        : "Nenhuma observação.";

    const acao = window.prompt(
      `Observações atuais:\n\n${listaAtual}\n\nDigite:\n1 para adicionar\n2 para excluir`,
      "1"
    );

    if (acao === null) return;

    if (acao === "1") {
      const novaObs = window.prompt("Digite a nova observação:");
      if (!novaObs) return;

      setRegistros((prev) =>
        prev.map((item) =>
          item.id === id
            ? { ...item, observacoes: [...item.observacoes, novaObs] }
            : item
        )
      );
    }

    if (acao === "2") {
      if (atual.observacoes.length === 0) {
        window.alert("Não há observações para excluir.");
        return;
      }

      const indice = window.prompt(
        `Digite o número da observação que deseja excluir:\n\n${listaAtual}`
      );
      if (!indice) return;

      const indiceNumero = Number(indice) - 1;
      if (Number.isNaN(indiceNumero) || indiceNumero < 0 || indiceNumero >= atual.observacoes.length) {
        window.alert("Índice inválido.");
        return;
      }

      setRegistros((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                observacoes: item.observacoes.filter((_, i) => i !== indiceNumero),
              }
            : item
        )
      );
    }
  };

  const verDetalhePercentual = (
    funcao: Funcao,
    semana: string,
    liquidez: number,
    percentual: number
  ) => {
    const valorComissao = liquidez * (percentual / 100);

    let metaTexto = "";

    if (funcao === "Vendedor") {
      metaTexto =
        "Meta Vendedor:\nAté 32.999 = 5%\n33.000 = 6%\n40.000 = 7%\n47.000 = 8%";
    } else {
      metaTexto =
        "Meta Mecânico:\nAté 7.999 = 10%\n8.000 = 12%\n10.000 = 15%\n20.000 = 17%";
    }

    window.alert(
      `${semana}\n\nFunção: ${funcao}\nLiquidez: ${formatCurrency(
        liquidez
      )}\nPercentual: ${percentual}%\nComissão: ${formatCurrency(valorComissao)}\n\n${metaTexto}`
    );
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(to bottom right, #000, #111, #000)",
        padding: "24px",
      }}
    >
      <div style={{ maxWidth: "1600px", margin: "0 auto" }}>
        <div style={{ marginBottom: "32px", display: "flex", alignItems: "center", gap: "16px" }}>
          <button
            onClick={() => (window.location.href = "/")}
            style={{
              background: "transparent",
              border: "none",
              color: "#fbbf24",
              cursor: "pointer",
              fontSize: "20px",
              padding: "8px",
            }}
          >
            ← Voltar
          </button>

          <div>
            <h1
              style={{
                fontSize: "32px",
                fontWeight: "bold",
                color: "#fbbf24",
                marginBottom: "8px",
              }}
            >
              Folha de Pagamento
            </h1>
            <p style={{ color: "#9ca3af" }}>
              Joinville e Blumenau • Mecânico e Vendedor • Comissão semanal
            </p>
          </div>
        </div>

        <div style={cardStyle}>
          <h2 style={sectionTitleStyle}>Filtros</h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "16px",
              alignItems: "end",
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
          <h2 style={sectionTitleStyle}>
            Comissão Semanal • {unidade} • {mes}/{ano}
          </h2>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "1700px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(251, 191, 36, 0.3)" }}>
                  <th style={thStyle}>Nome</th>
                  <th style={thStyle}>Função</th>
                  <th style={thStyle}>Sem 1</th>
                  <th style={thStyle}>%</th>
                  <th style={thStyle}>Sem 2</th>
                  <th style={thStyle}>%</th>
                  <th style={thStyle}>Sem 3</th>
                  <th style={thStyle}>%</th>
                  <th style={thStyle}>Sem 4</th>
                  <th style={thStyle}>%</th>
                  <th style={thStyle}>Total Liquidez</th>
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
                {filtrados.map((item) => {
                  const perc1 = getPercentual(item.funcao, item.sem1);
                  const perc2 = getPercentual(item.funcao, item.sem2);
                  const perc3 = getPercentual(item.funcao, item.sem3);
                  const perc4 = getPercentual(item.funcao, item.sem4);

                  const com1 = item.sem1 * (perc1 / 100);
                  const com2 = item.sem2 * (perc2 / 100);
                  const com3 = item.sem3 * (perc3 / 100);
                  const com4 = item.sem4 * (perc4 / 100);

                  const totalLiquidez = item.sem1 + item.sem2 + item.sem3 + item.sem4;
                  const totalComissao = com1 + com2 + com3 + com4;

                  const boleto =
                    totalComissao +
                    item.premiacao -
                    item.vale -
                    item.aluguel -
                    item.inss -
                    item.adiantamento -
                    item.holerite;

                  return (
                    <tr
                      key={item.id}
                      style={{ borderBottom: "1px solid rgba(251, 191, 36, 0.1)" }}
                    >
                      <td style={tdStyle}>{item.nome}</td>
                      <td style={tdStyle}>{item.funcao}</td>

                      <td style={tdStyle}>
                        <button
                          onClick={() => atualizarSemana(item.id, "sem1", "Semana 1")}
                          style={moneyActionStyle}
                        >
                          {formatCurrency(item.sem1)}
                        </button>
                      </td>
                      <td style={tdStyle}>
                        <button
                          onClick={() =>
                            verDetalhePercentual(item.funcao, "Semana 1", item.sem1, perc1)
                          }
                          style={valueButtonStyle}
                        >
                          {perc1}%
                        </button>
                      </td>

                      <td style={tdStyle}>
                        <button
                          onClick={() => atualizarSemana(item.id, "sem2", "Semana 2")}
                          style={moneyActionStyle}
                        >
                          {formatCurrency(item.sem2)}
                        </button>
                      </td>
                      <td style={tdStyle}>
                        <button
                          onClick={() =>
                            verDetalhePercentual(item.funcao, "Semana 2", item.sem2, perc2)
                          }
                          style={valueButtonStyle}
                        >
                          {perc2}%
                        </button>
                      </td>

                      <td style={tdStyle}>
                        <button
                          onClick={() => atualizarSemana(item.id, "sem3", "Semana 3")}
                          style={moneyActionStyle}
                        >
                          {formatCurrency(item.sem3)}
                        </button>
                      </td>
                      <td style={tdStyle}>
                        <button
                          onClick={() =>
                            verDetalhePercentual(item.funcao, "Semana 3", item.sem3, perc3)
                          }
                          style={valueButtonStyle}
                        >
                          {perc3}%
                        </button>
                      </td>

                      <td style={tdStyle}>
                        <button
                          onClick={() => atualizarSemana(item.id, "sem4", "Semana 4")}
                          style={moneyActionStyle}
                        >
                          {formatCurrency(item.sem4)}
                        </button>
                      </td>
                      <td style={tdStyle}>
                        <button
                          onClick={() =>
                            verDetalhePercentual(item.funcao, "Semana 4", item.sem4, perc4)
                          }
                          style={valueButtonStyle}
                        >
                          {perc4}%
                        </button>
                      </td>

                      <td style={tdStyle}>{formatCurrency(totalLiquidez)}</td>
                      <td style={tdStyle}>{formatCurrency(totalComissao)}</td>

                      <td style={tdStyle}>
                        <button
                          onClick={() => atualizarCampoValor(item.id, "premiacao", "Premiação")}
                          style={moneyActionStyle}
                        >
                          {formatCurrency(item.premiacao)}
                        </button>
                      </td>

                      <td style={tdStyle}>
                        <button
                          onClick={() => atualizarCampoValor(item.id, "vale", "Vale")}
                          style={moneyActionStyle}
                        >
                          {formatCurrency(item.vale)}
                        </button>
                      </td>

                      <td style={tdStyle}>
                        <button
                          onClick={() => atualizarCampoValor(item.id, "aluguel", "Aluguel")}
                          style={moneyActionStyle}
                        >
                          {formatCurrency(item.aluguel)}
                        </button>
                      </td>

                      <td style={tdStyle}>
                        <button
                          onClick={() => atualizarCampoValor(item.id, "inss", "INSS")}
                          style={moneyActionStyle}
                        >
                          {formatCurrency(item.inss)}
                        </button>
                      </td>

                      <td style={tdStyle}>
                        <button
                          onClick={() =>
                            atualizarCampoValor(item.id, "adiantamento", "Adiantamento")
                          }
                          style={moneyActionStyle}
                        >
                          {formatCurrency(item.adiantamento)}
                        </button>
                      </td>

                      <td style={tdStyle}>
                        <button
                          onClick={() => atualizarCampoValor(item.id, "holerite", "Holerite")}
                          style={moneyActionStyle}
                        >
                          {formatCurrency(item.holerite)}
                        </button>
                      </td>

                      <td
                        style={{
                          ...tdStyle,
                          color: boleto < 0 ? "#f87171" : "#d1d5db",
                          fontWeight: 700,
                        }}
                      >
                        {formatCurrency(boleto)}
                      </td>

                      <td style={tdStyle}>
                        <button
                          onClick={() => gerenciarObservacoes(item.id)}
                          style={{
                            ...moneyActionStyle,
                            background: item.observacoes.length > 0
                              ? "rgba(239, 68, 68, 0.18)"
                              : "rgba(251, 191, 36, 0.08)",
                            color: item.observacoes.length > 0 ? "#f87171" : "#fbbf24",
                          }}
                        >
                          {item.observacoes.length > 0 ? "OBS" : "Adicionar"}
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {filtrados.length === 0 && (
                  <tr>
                    <td colSpan={20} style={emptyTdStyle}>
                      Nenhum funcionário cadastrado para esta unidade
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

const primaryButtonStyle: React.CSSProperties = {
  background: "#fbbf24",
  color: "black",
  border: "none",
  padding: "10px 16px",
  borderRadius: "4px",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: "14px",
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
