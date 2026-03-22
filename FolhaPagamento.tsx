import React, { useEffect, useMemo, useState } from "react";

const LOJAS = [
  { id: 1, nome: "Joinville" },
  { id: 2, nome: "Blumenau" },
  { id: 3, nome: "São José" },
  { id: 4, nome: "Florianópolis" },
];

type RegistroFolha = {
  id: string;
  funcionario: string;
  lojaId: number;
  ano: number;
  mes: number;
  semana: number;
  liquidez: number;
  percentualComissao: number;
  valorComissao: number;
};

export default function FolhaPagamento() {
  const [selectedLoja, setSelectedLoja] = useState(1);
  const [ano, setAno] = useState(new Date().getFullYear());
  const [mes, setMes] = useState(new Date().getMonth() + 1);

  const [funcionario, setFuncionario] = useState("");
  const [semana, setSemana] = useState(1);
  const [liquidez, setLiquidez] = useState("");
  const [percentual, setPercentual] = useState("");

  const [registros, setRegistros] = useState<RegistroFolha[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem("frfuck_folha_pagamento");
    if (saved) {
      try {
        setRegistros(JSON.parse(saved));
      } catch {
        setRegistros([]);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("frfuck_folha_pagamento", JSON.stringify(registros));
  }, [registros]);

  const valorComissaoPreview = useMemo(() => {
    const liquidezNum = Number(liquidez) || 0;
    const percentualNum = Number(percentual) || 0;
    return (liquidezNum * percentualNum) / 100;
  }, [liquidez, percentual]);

  const registrosFiltrados = useMemo(() => {
    return registros.filter(
      (item) =>
        item.lojaId === selectedLoja &&
        item.ano === ano &&
        item.mes === mes
    );
  }, [registros, selectedLoja, ano, mes]);

  const handleAdicionar = () => {
    const liquidezNum = Number(liquidez);
    const percentualNum = Number(percentual);

    if (!funcionario.trim()) {
      alert("Informe o nome do funcionário.");
      return;
    }

    if (!liquidezNum && liquidezNum !== 0) {
      alert("Informe a liquidez.");
      return;
    }

    if (!percentualNum && percentualNum !== 0) {
      alert("Informe o percentual de comissão.");
      return;
    }

    const novoRegistro: RegistroFolha = {
      id: `${Date.now()}`,
      funcionario: funcionario.trim(),
      lojaId: selectedLoja,
      ano,
      mes,
      semana,
      liquidez: liquidezNum,
      percentualComissao: percentualNum,
      valorComissao: (liquidezNum * percentualNum) / 100,
    };

    setRegistros((prev) => [novoRegistro, ...prev]);

    setFuncionario("");
    setSemana(1);
    setLiquidez("");
    setPercentual("");
  };

  const handleRemover = (id: string) => {
    const ok = window.confirm("Deseja remover este registro?");
    if (!ok) return;
    setRegistros((prev) => prev.filter((item) => item.id !== id));
  };

  const totalLiquidez = registrosFiltrados.reduce((acc, item) => acc + item.liquidez, 0);
  const totalComissao = registrosFiltrados.reduce((acc, item) => acc + item.valorComissao, 0);

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>Folha de Pagamento</h1>
            <p style={styles.subtitle}>
              Gestão local de comissões e pagamentos
            </p>
          </div>
        </div>

        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Filtros</h2>

          <div style={styles.grid}>
            <div>
              <label style={styles.label}>Loja</label>
              <select
                style={styles.input}
                value={selectedLoja}
                onChange={(e) => setSelectedLoja(Number(e.target.value))}
              >
                {LOJAS.map((loja) => (
                  <option key={loja.id} value={loja.id}>
                    {loja.nome}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={styles.label}>Ano</label>
              <input
                style={styles.input}
                type="number"
                value={ano}
                onChange={(e) => setAno(Number(e.target.value))}
              />
            </div>

            <div>
              <label style={styles.label}>Mês</label>
              <select
                style={styles.input}
                value={mes}
                onChange={(e) => setMes(Number(e.target.value))}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {new Date(2026, m - 1).toLocaleDateString("pt-BR", {
                      month: "long",
                    })}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Adicionar folha</h2>

          <div style={styles.grid}>
            <div>
              <label style={styles.label}>Funcionário</label>
              <input
                style={styles.input}
                type="text"
                value={funcionario}
                onChange={(e) => setFuncionario(e.target.value)}
                placeholder="Nome do funcionário"
              />
            </div>

            <div>
              <label style={styles.label}>Semana</label>
              <select
                style={styles.input}
                value={semana}
                onChange={(e) => setSemana(Number(e.target.value))}
              >
                {[1, 2, 3, 4].map((s) => (
                  <option key={s} value={s}>
                    Semana {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={styles.label}>Liquidez (R$)</label>
              <input
                style={styles.input}
                type="number"
                value={liquidez}
                onChange={(e) => setLiquidez(e.target.value)}
                placeholder="0,00"
              />
            </div>

            <div>
              <label style={styles.label}>Percentual (%)</label>
              <input
                style={styles.input}
                type="number"
                value={percentual}
                onChange={(e) => setPercentual(e.target.value)}
                placeholder="0,00"
              />
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <p style={styles.preview}>
              Comissão calculada:{" "}
              <strong>R$ {valorComissaoPreview.toFixed(2)}</strong>
            </p>
          </div>

          <button style={styles.primaryButton} onClick={handleAdicionar}>
            Adicionar folha
          </button>
        </div>

        <div style={styles.card}>
          <div style={styles.summaryRow}>
            <h2 style={styles.cardTitle}>
              Registros - {LOJAS.find((l) => l.id === selectedLoja)?.nome}
            </h2>
            <div style={styles.summaryBox}>
              <span>Total liquidez: R$ {totalLiquidez.toFixed(2)}</span>
              <span>Total comissão: R$ {totalComissao.toFixed(2)}</span>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Funcionário</th>
                  <th style={styles.th}>Semana</th>
                  <th style={styles.th}>Liquidez</th>
                  <th style={styles.th}>Percentual</th>
                  <th style={styles.th}>Comissão</th>
                  <th style={styles.th}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {registrosFiltrados.length === 0 ? (
                  <tr>
                    <td style={styles.td} colSpan={6}>
                      Nenhum registro encontrado.
                    </td>
                  </tr>
                ) : (
                  registrosFiltrados.map((item) => (
                    <tr key={item.id}>
                      <td style={styles.td}>{item.funcionario}</td>
                      <td style={styles.td}>Semana {item.semana}</td>
                      <td style={styles.td}>R$ {item.liquidez.toFixed(2)}</td>
                      <td style={styles.td}>
                        {item.percentualComissao.toFixed(2)}%
                      </td>
                      <td style={styles.td}>
                        R$ {item.valorComissao.toFixed(2)}
                      </td>
                      <td style={styles.td}>
                        <button
                          style={styles.dangerButton}
                          onClick={() => handleRemover(item.id)}
                        >
                          Remover
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#0b0b0f",
    color: "#ffffff",
    padding: 24,
    fontFamily: "Arial, sans-serif",
  },
  container: {
    maxWidth: 1200,
    margin: "0 auto",
  },
  header: {
    marginBottom: 24,
  },
  title: {
    margin: 0,
    fontSize: 32,
    color: "#facc15",
  },
  subtitle: {
    marginTop: 8,
    color: "#a1a1aa",
  },
  card: {
    background: "#111827",
    border: "1px solid #374151",
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  cardTitle: {
    marginTop: 0,
    color: "#facc15",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 16,
  },
  label: {
    display: "block",
    marginBottom: 8,
    color: "#d1d5db",
    fontSize: 14,
  },
  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid #4b5563",
    background: "#1f2937",
    color: "#fff",
    boxSizing: "border-box",
  },
  primaryButton: {
    marginTop: 16,
    background: "#facc15",
    color: "#111827",
    border: "none",
    borderRadius: 8,
    padding: "12px 16px",
    cursor: "pointer",
    fontWeight: 700,
  },
  dangerButton: {
    background: "#dc2626",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "8px 10px",
    cursor: "pointer",
  },
  preview: {
    color: "#d1d5db",
    margin: 0,
  },
  summaryRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
  },
  summaryBox: {
    display: "flex",
    gap: 16,
    color: "#d1d5db",
    fontSize: 14,
    flexWrap: "wrap",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    marginTop: 16,
  },
  th: {
    textAlign: "left",
    padding: 12,
    borderBottom: "1px solid #374151",
    color: "#facc15",
    fontWeight: 700,
  },
  td: {
    padding: 12,
    borderBottom: "1px solid #374151",
    color: "#e5e7eb",
  },
};
