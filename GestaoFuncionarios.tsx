import { useState } from "react";

const LOJAS = [
  { id: 1, nome: "Joinville" },
  { id: 2, nome: "Blumenau" },
  { id: 3, nome: "São José" },
  { id: 4, nome: "Florianópolis" },
];

const FUNCOES = [
  { id: "mecanico", nome: "Mecânico" },
  { id: "vendedor", nome: "Vendedor" },
  { id: "consultor_vendas", nome: "Consultor de Vendas" },
  { id: "alinhador", nome: "Alinhador" },
  { id: "recepcionista", nome: "Recepcionista" },
  { id: "auxiliar_estoque", nome: "Auxiliar de Estoque" },
  { id: "lider_estoque", nome: "Líder de Estoque" },
  { id: "auxiliar_caixa", nome: "Auxiliar de Caixa" },
  { id: "administrativo", nome: "Administrativo" },
];

export default function GestaoFuncionarios() {
  const [selectedLoja, setSelectedLoja] = useState("1");
  const [isOpen, setIsOpen] = useState(false);
  const [funcionarios, setFuncionarios] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    nome: "",
    funcao: "mecanico",
    dataAdmissao: new Date().toISOString().split("T")[0],
  });

  const handleAddFuncionario = () => {
    if (!formData.nome.trim()) {
      alert("Preencha o nome do funcionário");
      return;
    }

    const newFuncionario = {
      id: Date.now(),
      lojaId: parseInt(selectedLoja),
      nome: formData.nome,
      funcao: formData.funcao,
      dataAdmissao: formData.dataAdmissao,
      status: "ativo",
    };

    setFuncionarios([...funcionarios, newFuncionario]);
    setFormData({
      nome: "",
      funcao: "mecanico",
      dataAdmissao: new Date().toISOString().split("T")[0],
    });
    setIsOpen(false);
  };

  const lojaFuncionarios = funcionarios.filter(f => f.lojaId === parseInt(selectedLoja));

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
              Gestão de Funcionários
            </h1>
            <p style={{ color: "#9ca3af" }}>Admissão, demissão e histórico de funcionários</p>
          </div>
        </div>

        {/* Filtros */}
        <div style={{ background: "#111", border: "1px solid rgba(251, 191, 36, 0.3)", borderRadius: "8px", padding: "24px", marginBottom: "24px" }}>
          <h2 style={{ color: "#fbbf24", marginBottom: "16px", fontSize: "18px", fontWeight: "600" }}>
            Seleção de Loja
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "16px", alignItems: "flex-end" }}>
            <div>
              <label style={{ color: "#d1d5db", display: "block", marginBottom: "8px", fontSize: "14px" }}>
                Loja
              </label>
              <select
                value={selectedLoja}
                onChange={(e) => setSelectedLoja(e.target.value)}
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
                {LOJAS.map((loja) => (
                  <option key={loja.id} value={loja.id}>
                    {loja.nome}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => setIsOpen(true)}
              style={{
                background: "#fbbf24",
                color: "black",
                border: "none",
                padding: "8px 16px",
                borderRadius: "4px",
                cursor: "pointer",
                fontWeight: "600",
                fontSize: "14px",
              }}
            >
              + Novo Funcionário
            </button>
          </div>
        </div>

        {/* Dialog para adicionar funcionário */}
        {isOpen && (
          <div style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}>
            <div style={{
              background: "#111",
              border: "1px solid rgba(251, 191, 36, 0.3)",
              borderRadius: "8px",
              padding: "24px",
              maxWidth: "500px",
              width: "90%",
            }}>
              <h3 style={{ color: "#fbbf24", marginBottom: "16px", fontSize: "18px", fontWeight: "600" }}>
                Novo Funcionário
              </h3>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ color: "#d1d5db", display: "block", marginBottom: "8px", fontSize: "14px" }}>
                  Nome Completo
                </label>
                <input
                  type="text"
                  placeholder="Ex: João Silva"
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
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

              <div style={{ marginBottom: "16px" }}>
                <label style={{ color: "#d1d5db", display: "block", marginBottom: "8px", fontSize: "14px" }}>
                  Função
                </label>
                <select
                  value={formData.funcao}
                  onChange={(e) => setFormData({ ...formData, funcao: e.target.value })}
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
                  {FUNCOES.map((funcao) => (
                    <option key={funcao.id} value={funcao.id}>
                      {funcao.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ color: "#d1d5db", display: "block", marginBottom: "8px", fontSize: "14px" }}>
                  Data de Admissão
                </label>
                <input
                  type="date"
                  value={formData.dataAdmissao}
                  onChange={(e) => setFormData({ ...formData, dataAdmissao: e.target.value })}
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

              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={handleAddFuncionario}
                  style={{
                    flex: 1,
                    background: "#fbbf24",
                    color: "black",
                    border: "none",
                    padding: "8px 16px",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontWeight: "600",
                    fontSize: "14px",
                  }}
                >
                  Salvar
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "1px solid rgba(251, 191, 36, 0.3)",
                    color: "#fbbf24",
                    padding: "8px 16px",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontWeight: "600",
                    fontSize: "14px",
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tabela de Funcionários */}
        <div style={{ background: "#111", border: "1px solid rgba(251, 191, 36, 0.3)", borderRadius: "8px", padding: "24px" }}>
          <h2 style={{ color: "#fbbf24", marginBottom: "8px", fontSize: "18px", fontWeight: "600" }}>
            Funcionários - {LOJAS.find(l => l.id === parseInt(selectedLoja))?.nome}
          </h2>
          <p style={{ color: "#9ca3af", marginBottom: "16px", fontSize: "14px" }}>
            Total: {lojaFuncionarios.length} funcionário(s)
          </p>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(251, 191, 36, 0.3)" }}>
                  <th style={{ color: "#fbbf24", textAlign: "left", padding: "12px", fontWeight: "600" }}>Nome</th>
                  <th style={{ color: "#fbbf24", textAlign: "left", padding: "12px", fontWeight: "600" }}>Função</th>
                  <th style={{ color: "#fbbf24", textAlign: "left", padding: "12px", fontWeight: "600" }}>Data Admissão</th>
                  <th style={{ color: "#fbbf24", textAlign: "left", padding: "12px", fontWeight: "600" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {lojaFuncionarios.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: "center", color: "#9ca3af", padding: "32px 12px" }}>
                      Nenhum funcionário registrado
                    </td>
                  </tr>
                ) : (
                  lojaFuncionarios.map((func) => (
                    <tr key={func.id} style={{ borderBottom: "1px solid rgba(251, 191, 36, 0.2)" }}>
                      <td style={{ color: "white", padding: "12px", fontWeight: "600" }}>{func.nome}</td>
                      <td style={{ color: "#d1d5db", padding: "12px" }}>
                        {FUNCOES.find(f => f.id === func.funcao)?.nome || func.funcao}
                      </td>
                      <td style={{ color: "#d1d5db", padding: "12px" }}>
                        {new Date(func.dataAdmissao).toLocaleDateString('pt-BR')}
                      </td>
                      <td style={{ color: "#d1d5db", padding: "12px" }}>
                        <span style={{
                          background: func.status === "ativo" ? "rgba(34, 197, 94, 0.2)" : "rgba(239, 68, 68, 0.2)",
                          color: func.status === "ativo" ? "#22c55e" : "#ef4444",
                          padding: "4px 8px",
                          borderRadius: "4px",
                          fontSize: "12px",
                        }}>
                          {func.status === "ativo" ? "Ativo" : "Inativo"}
                        </span>
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
