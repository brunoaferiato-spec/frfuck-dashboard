import { useMemo, useState } from "react";

type Unidade =
  | "Joinville"
  | "Blumenau"
  | "São José"
  | "Florianópolis";

type Funcao =
  | "Gerente"
  | "Vendedor"
  | "Mecânico"
  | "Alinhador"
  | "Auxiliar de Alinhador"
  | "Vendedor de Alinhamento"
  | "Consultor de Vendas"
  | "Recepção"
  | "Caixa"
  | "Caixa Líder"
  | "Auxiliar de Limpeza"
  | "Estoquista"
  | "Estoquista Líder"
  | "Auxiliar de Mecânico"
  | "Administrativo";

interface Funcionario {
  id: number;
  nome: string;
  funcao: Funcao;
  unidade: Unidade;
  tipoMetaConsultor?: "tipo1" | "tipo2";
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
  { id: 3, nome: "José", funcao: "Alinhador", unidade: "Joinville" },
  { id: 4, nome: "Paulo", funcao: "Auxiliar de Alinhador", unidade: "Joinville" },
  { id: 5, nome: "Lucas", funcao: "Consultor de Vendas", unidade: "Joinville", tipoMetaConsultor: "tipo1" },

  { id: 6, nome: "Marcos", funcao: "Vendedor", unidade: "Blumenau" },
  { id: 7, nome: "Pedro", funcao: "Mecânico", unidade: "Blumenau" },
  { id: 8, nome: "Ana", funcao: "Vendedor de Alinhamento", unidade: "Blumenau" },
  { id: 9, nome: "Carlos B", funcao: "Consultor de Vendas", unidade: "Blumenau", tipoMetaConsultor: "tipo2" },

  { id: 10, nome: "Ricardo", funcao: "Gerente", unidade: "Florianópolis" },
  { id: 11, nome: "Julia", funcao: "Recepção", unidade: "Florianópolis" },
  { id: 12, nome: "Patrícia", funcao: "Recepção", unidade: "Florianópolis" },

  { id: 13, nome: "Felipe", funcao: "Gerente", unidade: "São José" },
  { id: 14, nome: "Bruna", funcao: "Recepção", unidade: "São José" },

  { id: 15, nome: "Marta", funcao: "Caixa", unidade: "Joinville" },
  { id: 16, nome: "André", funcao: "Administrativo", unidade: "Joinville" },
];

export default function FolhaPagamento() {
  const [unidade, setUnidade] = useState<Unidade>("Joinville");
  const [ano, setAno] = useState<number>(2026);
  const [mes, setMes] = useState<string>("Março");

  const funcionariosDaUnidade = useMemo(() => {
    return funcionariosIniciais.filter((f) => f.unidade === unidade);
  }, [unidade]);

  const gerentes = funcionariosDaUnidade.filter((f) => f.funcao === "Gerente");

  const comissaoSemanal = funcionariosDaUnidade.filter(
    (f) => f.funcao === "Vendedor" || f.funcao === "Mecânico"
  );

  const metaMensal = funcionariosDaUnidade.filter(
    (f) =>
      f.funcao === "Alinhador" ||
      f.funcao === "Auxiliar de Alinhador" ||
      f.funcao === "Vendedor de Alinhamento"
  );

  const consultores = funcionariosDaUnidade.filter(
    (f) => f.funcao === "Consultor de Vendas"
  );

  const recepcao = funcionariosDaUnidade.filter(
    (f) => f.funcao === "Recepção"
  );

  const salarioFixo = funcionariosDaUnidade.filter(
    (f) =>
      f.funcao === "Caixa" ||
      f.funcao === "Caixa Líder" ||
      f.funcao === "Auxiliar de Limpeza" ||
      f.funcao === "Estoquista" ||
      f.funcao === "Estoquista Líder" ||
      f.funcao === "Auxiliar de Mecânico" ||
      f.funcao === "Administrativo"
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(to bottom right, #000, #111, #000)",
        padding: "24px",
      }}
    >
      <div style={{ maxWidth: "1700px", margin: "0 auto" }}>
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
              Folha central com todos os quadrantes
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
                <option value="São José">São José</option>
                <option value="Florianópolis">Florianópolis</option>
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

        {gerentes.length > 0 && (
          <QuadranteCard title={`Gerente • ${unidade} • ${mes}/${ano}`}>
            <MiniInfo text="Quadrante do gerente será o primeiro e só aparece quando houver gerente cadastrado na unidade." />
            <SimpleTable
              headers={["Nome", "Função", "Status"]}
              rows={gerentes.map((f) => [f.nome, f.funcao, "Preparado para regra do gerente"])}
            />
          </QuadranteCard>
        )}

        {comissaoSemanal.length > 0 && (
          <QuadranteCard title={`Comissão Semanal • ${unidade} • ${mes}/${ano}`}>
            <MiniInfo text="Quadrante semanal para vendedor e mecânico." />
            <SimpleTable
              headers={["Nome", "Função", "Modelo"]}
              rows={comissaoSemanal.map((f) => [f.nome, f.funcao, "Semanal por liquidez"])}
            />
          </QuadranteCard>
        )}

        {metaMensal.length > 0 && (
          <QuadranteCard title={`Meta Mensal • ${unidade} • ${mes}/${ano}`}>
            <MiniInfo text="Quadrante mensal para alinhador, auxiliar de alinhador e vendedor de alinhamento." />
            <SimpleTable
              headers={["Nome", "Função", "Modelo"]}
              rows={metaMensal.map((f) => [f.nome, f.funcao, "Mensal por liquidez"])}
            />
          </QuadranteCard>
        )}

        {consultores.length > 0 && (
          <QuadranteCard title={`Consultor de Vendas • ${unidade} • ${mes}/${ano}`}>
            <MiniInfo text="Quadrante do consultor com tipo 1 e tipo 2 de meta." />
            <SimpleTable
              headers={["Nome", "Função", "Tipo de meta"]}
              rows={consultores.map((f) => [
                f.nome,
                f.funcao,
                f.tipoMetaConsultor === "tipo1"
                  ? "Valor por carro"
                  : "Blocos de 25 + bônus",
              ])}
            />
          </QuadranteCard>
        )}

        {recepcao.length > 0 && (
          <QuadranteCard title={`Recepção • ${unidade} • ${mes}/${ano}`}>
            <MiniInfo text="Recepção ficará por cidade e também poderá ter regra específica por funcionária." />
            <SimpleTable
              headers={["Nome", "Função", "Modelo"]}
              rows={recepcao.map((f) => [
                f.nome,
                f.funcao,
                unidade === "São José" || unidade === "Florianópolis"
                  ? "Vendas fechadas + entradas"
                  : "Vendas fechadas",
              ])}
            />
          </QuadranteCard>
        )}

        {salarioFixo.length > 0 && (
          <QuadranteCard title={`Salário Fixo • ${unidade} • ${mes}/${ano}`}>
            <MiniInfo text="Quadrante para funções fixas. O boleto será baseado nas regras do fixo." />
            <SimpleTable
              headers={["Nome", "Função", "Modelo"]}
              rows={salarioFixo.map((f) => [f.nome, f.funcao, "Fixo"])}
            />
          </QuadranteCard>
        )}
      </div>
    </div>
  );
}

function QuadranteCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={cardStyle}>
      <h2 style={sectionTitleStyle}>{title}</h2>
      {children}
    </div>
  );
}

function MiniInfo({ text }: { text: string }) {
  return (
    <p
      style={{
        color: "#9ca3af",
        marginTop: 0,
        marginBottom: "16px",
      }}
    >
      {text}
    </p>
  );
}

function SimpleTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "900px" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(251, 191, 36, 0.3)" }}>
            {headers.map((header) => (
              <th key={header} style={thStyle}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={index}
              style={{ borderBottom: "1px solid rgba(251, 191, 36, 0.1)" }}
            >
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} style={tdStyle}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
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
