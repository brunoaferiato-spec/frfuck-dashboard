import { useState } from "react";

type Unidade = "Joinville" | "Blumenau";

type Funcao =
  | "Alinhador"
  | "Auxiliar de Alinhador"
  | "Vendedor de Alinhamento";

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

interface Meta {
  unidade: Unidade;
  funcao: Funcao;
  regras: {
    minimo: number;
    percentual: number;
  }[];
}

const funcionarios: Funcionario[] = [
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
];

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function MetaMensal() {
  const [registros, setRegistros] = useState<RegistroMensal[]>([]);
  const [financeiro, setFinanceiro] = useState<Financeiro[]>([]);

  function buscarMeta(funcao: Funcao, unidade: Unidade) {
    return metas.find((m) => m.funcao === funcao && m.unidade === unidade);
  }

  function calcularPercentual(meta: Meta | undefined, valor: number) {
    if (!meta) return 0;

    let perc = 0;

    for (const regra of meta.regras) {
      if (valor >= regra.minimo) perc = regra.percentual;
    }

    return perc;
  }

  function getRegistro(funcionarioId: number) {
    return (
      registros.find((r) => r.funcionarioId === funcionarioId) || {
        funcionarioId,
        unidade: "Joinville",
        ano: 2026,
        mes: 3,
        liquidez: 0,
      }
    );
  }

  function atualizarLiquidez(funcionarioId: number) {
    const valor = prompt("Digite a liquidez:");
    if (!valor) return;

    const numero = Number(valor);

    setRegistros((prev) => {
      const existe = prev.find((r) => r.funcionarioId === funcionarioId);

      if (existe) {
        return prev.map((r) =>
          r.funcionarioId === funcionarioId
            ? { ...r, liquidez: numero }
            : r
        );
      }

      return [...prev, { ...getRegistro(funcionarioId), liquidez: numero }];
    });
  }

  function getFinanceiro(funcionarioId: number) {
    return (
      financeiro.find((f) => f.funcionarioId === funcionarioId) || {
        funcionarioId,
        unidade: "Joinville",
        ano: 2026,
        mes: 3,
        premiacao: 0,
        aluguel: 0,
        inss: 0,
        adiant: 0,
        holerite: 0,
      }
    );
  }

  function atualizarCampo(funcionarioId: number, campo: keyof Financeiro) {
    const valor = prompt("Digite o valor:");
    if (!valor) return;

    const numero = Number(valor);

    setFinanceiro((prev) => {
      const existe = prev.find((f) => f.funcionarioId === funcionarioId);

      if (existe) {
        return prev.map((f) =>
          f.funcionarioId === funcionarioId
            ? { ...f, [campo]: numero }
            : f
        );
      }

      return [...prev, { ...getFinanceiro(funcionarioId), [campo]: numero }];
    });
  }

  return (
    <div style={{ padding: 20, color: "white", background: "#000" }}>
      <h1 style={{ color: "#fbbf24" }}>Meta Mensal</h1>

      <table style={{ width: "100%", marginTop: 20 }}>
        <thead>
          <tr>
            <th>Nome</th>
            <th>Função</th>
            <th>Liquidez</th>
            <th>%</th>
            <th>Comissão</th>
            <th>Premiação</th>
            <th>Aluguel</th>
            <th>INSS</th>
            <th>Adiant.</th>
            <th>Holerite</th>
            <th>Boleto</th>
          </tr>
        </thead>

        <tbody>
          {funcionarios.map((f) => {
            const registro = getRegistro(f.id);
            const meta = buscarMeta(f.funcao, f.unidade);

            const perc = calcularPercentual(meta, registro.liquidez);
            const comissao = registro.liquidez * (perc / 100);

            const fin = getFinanceiro(f.id);

            const boleto =
              comissao +
              fin.premiacao -
              fin.aluguel -
              fin.inss -
              fin.adiant -
              fin.holerite;

            return (
              <tr key={f.id}>
                <td>{f.nome}</td>
                <td>{f.funcao}</td>

                <td>
                  <button onClick={() => atualizarLiquidez(f.id)}>
                    {formatCurrency(registro.liquidez)}
                  </button>
                </td>

                <td>
                  <button
                    onClick={() =>
                      alert(
                        `Liquidez: ${formatCurrency(
                          registro.liquidez
                        )}\nPercentual: ${perc}%\nComissão: ${formatCurrency(
                          comissao
                        )}`
                      )
                    }
                  >
                    {perc}%
                  </button>
                </td>

                <td>{formatCurrency(comissao)}</td>

                <td>
                  <button onClick={() => atualizarCampo(f.id, "premiacao")}>
                    {formatCurrency(fin.premiacao)}
                  </button>
                </td>

                <td>
                  <button onClick={() => atualizarCampo(f.id, "aluguel")}>
                    {formatCurrency(fin.aluguel)}
                  </button>
                </td>

                <td>
                  <button onClick={() => atualizarCampo(f.id, "inss")}>
                    {formatCurrency(fin.inss)}
                  </button>
                </td>

                <td>
                  <button onClick={() => atualizarCampo(f.id, "adiant")}>
                    {formatCurrency(fin.adiant)}
                  </button>
                </td>

                <td>
                  <button onClick={() => atualizarCampo(f.id, "holerite")}>
                    {formatCurrency(fin.holerite)}
                  </button>
                </td>

                <td>{formatCurrency(boleto)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
