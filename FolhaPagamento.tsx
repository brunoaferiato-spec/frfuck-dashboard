import { useMemo, useState } from "react";

type Unidade = "Joinville" | "Blumenau";
type Funcao = "Vendedor" | "Mecânico";
type CampoFinanceiro =
  | "premiacao"
  | "aluguel"
  | "inss"
  | "adiantamento"
  | "holerite";

interface Funcionario {
  id: number;
  nome: string;
  funcao: Funcao;
  unidade: Unidade;
}

interface SemanaRegistro {
  funcionarioId: number;
  unidade: Unidade;
  ano: number;
  mes: number;
  sem1: number;
  sem2: number;
  sem3: number;
  sem4: number;
}

interface FinanceiroRegistro {
  funcionarioId: number;
  unidade: Unidade;
  ano: number;
  mes: number;
  premiacao: number;
  aluguel: number;
  inss: number;
  adiantamento: number;
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
  { id: 1, nome: "João", funcao: "Vendedor", unidade: "Joinville" },
  { id: 2, nome: "Carlos", funcao: "Mecânico", unidade: "Joinville" },
  { id: 3, nome: "Marcos", funcao: "Vendedor", unidade: "Blumenau" },
  { id: 4, nome: "Pedro", funcao: "Mecânico", unidade: "Blumenau" },
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

export default function FolhaPagamento() {
  const [unidade, setUnidade] = useState<Unidade>("Joinville");
  const [ano, setAno] = useState<number>(2026);
  const [mes, setMes] = useState<string>("Março");

  const [funcionarios] = useState<Funcionario[]>(funcionariosIniciais);
  const [semanas, setSemanas] = useState<SemanaRegistro[]>([]);
  const [financeiro, setFinanceiro] = useState<FinanceiroRegistro[]>([]);
  const [observacoes, setObservacoes] = useState<ObservacaoRegistro[]>([]);
  const [vales, setVales] = useState<ValeParcela[]>([]);

  const mesNumero = getMesNumero(mes);

  const filtrados = useMemo(() => {
    return funcionarios.filter((item) => item.unidade === unidade);
  }, [funcionarios, unidade]);

  const getSemanaRegistro = (funcionarioId: number): SemanaRegistro => {
    return (
      semanas.find(
        (item) =>
          item.funcionarioId === funcionarioId &&
          item.unidade === unidade &&
          item.ano === ano &&
          item.mes === mesNumero
      ) || {
        funcionarioId,
        unidade,
        ano,
        mes: mesNumero,
        sem1: 0,
        sem2: 0,
        sem3: 0,
        sem4: 0,
      }
    );
  };

  const getFinanceiroRegistro = (funcionarioId: number): FinanceiroRegistro => {
    return (
      financeiro.find(
        (item) =>
          item.funcionarioId === funcionarioId &&
          item.unidade === unidade &&
          item.ano === ano &&
          item.mes === mesNumero
      ) || {
        funcionarioId,
        unidade,
        ano,
        mes: mesNumero,
        premiacao: 0,
        aluguel: 0,
        inss: 0,
        adiantamento: 0,
        holerite: 0,
      }
    );
  };

  const getObservacoesDoMes = (funcionarioId: number) => {
    return observacoes.filter(
      (obs) =>
        obs.funcionarioId === funcionarioId &&
        obs.unidade === unidade &&
        obs.ano === ano &&
        obs.mes === mesNumero
    );
  };

  const getValesDoMes = (funcionarioId: number) => {
    return vales.filter(
      (vale) =>
        vale.funcionarioId === funcionarioId &&
        vale.unidade === unidade &&
        vale.ano === ano &&
        vale.mes === mesNumero
    );
  };

  const getTotalValeDoMes = (funcionarioId: number) => {
    return getValesDoMes(funcionarioId).reduce((acc, vale) => acc + vale.valor, 0);
  };

  const atualizarSemana = (
    funcionarioId: number,
    campo: "sem1" | "sem2" | "sem3" | "sem4",
    label: string
  ) => {
    const atual = getSemanaRegistro(funcionarioId);
    const valor = window.prompt(`Digite o valor de ${label}:`, String(atual[campo] || 0));
    if (valor === null) return;

    const numero = Number(valor.replace(",", ".")) || 0;

    setSemanas((prev) => {
      const existe = prev.find(
        (item) =>
          item.funcionarioId === funcionarioId &&
          item.unidade === unidade &&
          item.ano === ano &&
          item.mes === mesNumero
      );

      if (existe) {
        return prev.map((item) =>
          item.funcionarioId === funcionarioId &&
          item.unidade === unidade &&
          item.ano === ano &&
          item.mes === mesNumero
            ? { ...item, [campo]: numero }
            : item
        );
      }

      return [
        ...prev,
        {
          funcionarioId,
          unidade,
          ano,
          mes: mesNumero,
          sem1: 0,
          sem2: 0,
          sem3: 0,
          sem4: 0,
          [campo]: numero,
        } as SemanaRegistro,
      ];
    });
  };

  const atualizarCampoValor = (
    funcionarioId: number,
    campo: CampoFinanceiro,
    label: string
  ) => {
    const atual = getFinanceiroRegistro(funcionarioId);
    const valor = window.prompt(`Digite o valor de ${label}:`, String(atual[campo] || 0));
    if (valor === null) return;

    const numero = Number(valor.replace(",", ".")) || 0;

    setFinanceiro((prev) => {
      const existe = prev.find(
        (item) =>
          item.funcionarioId === funcionarioId &&
          item.unidade === unidade &&
          item.ano === ano &&
          item.mes === mesNumero
      );

      if (existe) {
        return prev.map((item) =>
          item.funcionarioId === funcionarioId &&
          item.unidade === unidade &&
          item.ano === ano &&
          item.mes === mesNumero
            ? { ...item, [campo]: numero }
            : item
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
          adiantamento: 0,
          holerite: 0,
          [campo]: numero,
        } as FinanceiroRegistro,
      ];
    });
  };

  const gerenciarObservacoes = (funcionarioId: number) => {
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
  };

  const gerenciarVales = (funcionarioId: number, nomeFuncionario: string) => {
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
  };

  const handleBoletoNegativo = (
    funcionarioId: number,
    nomeFuncionario: string,
    boleto: number
  ) => {
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
                {filtrados.map((funcionario) => {
                  const semana = getSemanaRegistro(funcionario.id);
                  const financeiroAtual = getFinanceiroRegistro(funcionario.id);

                  const perc1 = getPercentual(funcionario.funcao, semana.sem1);
                  const perc2 = getPercentual(funcionario.funcao, semana.sem2);
                  const perc3 = getPercentual(funcionario.funcao, semana.sem3);
                  const perc4 = getPercentual(funcionario.funcao, semana.sem4);

                  const com1 = semana.sem1 * (perc1 / 100);
                  const com2 = semana.sem2 * (perc2 / 100);
                  const com3 = semana.sem3 * (perc3 / 100);
                  const com4 = semana.sem4 * (perc4 / 100);

                  const totalLiquidez =
                    semana.sem1 + semana.sem2 + semana.sem3 + semana.sem4;
                  const totalComissao = com1 + com2 + com3 + com4;
                  const totalVale = getTotalValeDoMes(funcionario.id);
                  const totalObs = getObservacoesDoMes(funcionario.id).length;

                  const boleto =
                    totalComissao +
                    financeiroAtual.premiacao -
                    totalVale -
                    financeiroAtual.aluguel -
                    financeiroAtual.inss -
                    financeiroAtual.adiantamento -
                    financeiroAtual.holerite;

                  return (
                    <tr
                      key={funcionario.id}
                      style={{ borderBottom: "1px solid rgba(251, 191, 36, 0.1)" }}
                    >
                      <td style={tdStyle}>{funcionario.nome}</td>
                      <td style={tdStyle}>{funcionario.funcao}</td>

                      <td style={tdStyle}>
                        <button
                          onClick={() => atualizarSemana(funcionario.id, "sem1", "Semana 1")}
                          style={moneyActionStyle}
                        >
                          {formatCurrency(semana.sem1)}
                        </button>
                      </td>
                      <td style={tdStyle}>
                        <button
                          onClick={() =>
                            verDetalhePercentual(
                              funcionario.funcao,
                              "Semana 1",
                              semana.sem1,
                              perc1
                            )
                          }
                          style={valueButtonStyle}
                        >
                          {perc1}%
                        </button>
                      </td>

                      <td style={tdStyle}>
                        <button
                          onClick={() => atualizarSemana(funcionario.id, "sem2", "Semana 2")}
                          style={moneyActionStyle}
                        >
                          {formatCurrency(semana.sem2)}
                        </button>
                      </td>
                      <td style={tdStyle}>
                        <button
                          onClick={() =>
                            verDetalhePercentual(
                              funcionario.funcao,
                              "Semana 2",
                              semana.sem2,
                              perc2
                            )
                          }
                          style={valueButtonStyle}
                        >
                          {perc2}%
                        </button>
                      </td>

                      <td style={tdStyle}>
                        <button
                          onClick={() => atualizarSemana(funcionario.id, "sem3", "Semana 3")}
                          style={moneyActionStyle}
                        >
                          {formatCurrency(semana.sem3)}
                        </button>
                      </td>
                      <td style={tdStyle}>
                        <button
                          onClick={() =>
                            verDetalhePercentual(
                              funcionario.funcao,
                              "Semana 3",
                              semana.sem3,
                              perc3
                            )
                          }
                          style={valueButtonStyle}
                        >
                          {perc3}%
                        </button>
                      </td>

                      <td style={tdStyle}>
                        <button
                          onClick={() => atualizarSemana(funcionario.id, "sem4", "Semana 4")}
                          style={moneyActionStyle}
                        >
                          {formatCurrency(semana.sem4)}
                        </button>
                      </td>
                      <td style={tdStyle}>
                        <button
                          onClick={() =>
                            verDetalhePercentual(
                              funcionario.funcao,
                              "Semana 4",
                              semana.sem4,
                              perc4
                            )
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
                          onClick={() =>
                            atualizarCampoValor(funcionario.id, "premiacao", "Premiação")
                          }
                          style={moneyActionStyle}
                        >
                          {formatCurrency(financeiroAtual.premiacao)}
                        </button>
                      </td>

                      <td style={tdStyle}>
                        <button
                          onClick={() => gerenciarVales(funcionario.id, funcionario.nome)}
                          style={moneyActionStyle}
                        >
                          {formatCurrency(totalVale)}
                        </button>
                      </td>

                      <td style={tdStyle}>
                        <button
                          onClick={() =>
                            atualizarCampoValor(funcionario.id, "aluguel", "Aluguel")
                          }
                          style={moneyActionStyle}
                        >
                          {formatCurrency(financeiroAtual.aluguel)}
                        </button>
                      </td>

                      <td style={tdStyle}>
                        <button
                          onClick={() => atualizarCampoValor(funcionario.id, "inss", "INSS")}
                          style={moneyActionStyle}
                        >
                          {formatCurrency(financeiroAtual.inss)}
                        </button>
                      </td>

                      <td style={tdStyle}>
                        <button
                          onClick={() =>
                            atualizarCampoValor(
                              funcionario.id,
                              "adiantamento",
                              "Adiantamento"
                            )
                          }
                          style={moneyActionStyle}
                        >
                          {formatCurrency(financeiroAtual.adiantamento)}
                        </button>
                      </td>

                      <td style={tdStyle}>
                        <button
                          onClick={() =>
                            atualizarCampoValor(funcionario.id, "holerite", "Holerite")
                          }
                          style={moneyActionStyle}
                        >
                          {formatCurrency(financeiroAtual.holerite)}
                        </button>
                      </td>

                      <td style={tdStyle}>
                        <button
                          onClick={() =>
                            handleBoletoNegativo(funcionario.id, funcionario.nome, boleto)
                          }
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
                          onClick={() => gerenciarObservacoes(funcionario.id)}
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
