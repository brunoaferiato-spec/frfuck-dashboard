import { useState } from "react";

export default function AnaliseFuncionario() {
  const [selectedFuncionarioId, setSelectedFuncionarioId] = useState("");
  const [selectedAno, setSelectedAno] = useState("2026");

  const anos = ["2024", "2025", "2026", "2027"];

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(to bottom right, #000, #111, #000)", padding: "24px" }}>
      <div style={{ maxWidth: "1280px", margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: "32px", display: "flex", alignItems: "center", gap: "16px" }}>
          <button
            onClick={() => window.location.href = "/"}
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
            <h1 style={{ fontSize: "32px", fontWeight: "bold", color: "#fbbf24", marginBottom: "8px" }}>
              Análise de Funcionário
            </h1>
            <p style={{ color: "#9ca3af" }}>Desempenho e histórico de pagamentos</p>
          </div>
        </div>

        {/* Filtros */}
        <div style={{ background: "#111", border: "1px solid rgba(251, 191, 36, 0.3)", borderRadius: "8px", padding: "24px", marginBottom: "24px" }}>
          <h2 style={{ color: "#fbbf24", marginBottom: "16px", fontSize: "18px", fontWeight: "600" }}>
            Seleção de Funcionário
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <div>
              <label style={{ color: "#d1d5db", display: "block", marginBottom: "8px", fontSize: "14px" }}>
                ID Funcionário
              </label>
              <input
                type="text"
                placeholder="Ex: 123"
                value={selectedFuncionarioId}
                onChange={(e) => setSelectedFuncionarioId(e.target.value)}
                style={{
                  width: "100%",
                  background: "#1f2937",
                  border: "1px solid rgba(251, 191, 36, 0.3)",
                  color: "white",
                  padding: "8px 12px",
                  borderRadius: "4px",
                  fontSize: "14px",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div>
              <label style={{ color: "#d1d5db", display: "block", marginBottom: "8px", fontSize: "14px" }}>
                Ano
              </label>
              <select
                value={selectedAno}
                onChange={(e) => setSelectedAno(e.target.value)}
                style={{
                  width: "100%",
                  background: "#1f2937",
                  border: "1px solid rgba(251, 191, 36, 0.3)",
                  color: "white",
                  padding: "8px 12px",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                {anos.map((ano) => (
                  <option key={ano} value={ano}>
                    {ano}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Resumo */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "16px", marginBottom: "24px" }}>
          <div style={{ background: "#111", border: "1px solid rgba(251, 191, 36, 0.3)", borderRadius: "8px", padding: "20px" }}>
            <p style={{ color: "#9ca3af", fontSize: "14px", marginBottom: "8px" }}>Salário Total</p>
            <p style={{ color: "#fbbf24", fontSize: "24px", fontWeight: "bold" }}>R$ 0,00</p>
          </div>

          <div style={{ background: "#111", border: "1px solid rgba(251, 191, 36, 0.3)", borderRadius: "8px", padding: "20px" }}>
            <p style={{ color: "#9ca3af", fontSize: "14px", marginBottom: "8px" }}>Comissões</p>
            <p style={{ color: "#22c55e", fontSize: "24px", fontWeight: "bold" }}>R$ 0,00</p>
          </div>

          <div style={{ background: "#111", border: "1px solid rgba(251, 191, 36, 0.3)", borderRadius: "8px", padding: "20px" }}>
            <p style={{ color: "#9ca3af", fontSize: "14px", marginBottom: "8px" }}>Descontos</p>
            <p style={{ color: "#ef4444", fontSize: "24px", fontWeight: "bold" }}>R$ 0,00</p>
          </div>

          <div style={{ background: "#111", border: "1px solid rgba(251, 191, 36, 0.3)", borderRadius: "8px", padding: "20px" }}>
            <p style={{ color: "#9ca3af", fontSize: "14px", marginBottom: "8px" }}>Líquido</p>
            <p style={{ color: "#fbbf24", fontSize: "24px", fontWeight: "bold" }}>R$ 0,00</p>
          </div>
        </div>

        {/* Detalhes Mensais */}
        <div style={{ background: "#111", border: "1px solid rgba(251, 191, 36, 0.3)", borderRadius: "8px", padding: "24px" }}>
          <h2 style={{ color: "#fbbf24", marginBottom: "16px", fontSize: "18px", fontWeight: "600" }}>
            Histórico Mensal
          </h2>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(251, 191, 36, 0.3)" }}>
                  <th style={{ color: "#fbbf24", textAlign: "left", padding: "12px", fontWeight: "600" }}>Mês</th>
                  <th style={{ color: "#fbbf24", textAlign: "right", padding: "12px", fontWeight: "600" }}>Salário</th>
                  <th style={{ color: "#fbbf24", textAlign: "right", padding: "12px", fontWeight: "600" }}>Comissão</th>
                  <th style={{ color: "#fbbf24", textAlign: "right", padding: "12px", fontWeight: "600" }}>Vale</th>
                  <th style={{ color: "#fbbf24", textAlign: "right", padding: "12px", fontWeight: "600" }}>Desconto</th>
                  <th style={{ color: "#fbbf24", textAlign: "right", padding: "12px", fontWeight: "600" }}>Premiação</th>
                  <th style={{ color: "#fbbf24", textAlign: "right", padding: "12px", fontWeight: "600" }}>Líquido</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", color: "#9ca3af", padding: "32px 12px" }}>
                    Selecione um funcionário para visualizar o histórico
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
