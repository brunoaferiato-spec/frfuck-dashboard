import { useState } from "react";

const LOJAS = [
  { id: 1, nome: "Joinville" },
  { id: 2, nome: "Blumenau" },
  { id: 3, nome: "São José" },
  { id: 4, nome: "Florianópolis" },
];

export default function FolhaPagamento() {
  const [selectedLoja, setSelectedLoja] = useState("1");
  const [selectedAno, setSelectedAno] = useState("2026");
  const [selectedMes, setSelectedMes] = useState("3");
  const [folhas, setFolhas] = useState<any[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    funcionarioId: "",
    salarioBase: "",
    comissao: "",
    vale: "",
    desconto: "",
    premiacao: "",
    observacao: "",
  });

  const meses = [
    { id: "1", nome: "Janeiro" },
    { id: "2", nome: "Fevereiro" },
    { id: "3", nome: "Março" },
    { id: "4", nome: "Abril" },
    { id: "5", nome: "Maio" },
    { id: "6", nome: "Junho" },
    { id: "7", nome: "Julho" },
    { id: "8", nome: "Agosto" },
    { id: "9", nome: "Setembro" },
    { id: "10", nome: "Outubro" },
    { id: "11", nome: "Novembro" },
    { id: "12", nome: "Dezembro" },
  ];

  const anos = ["2024", "2025", "2026", "2027"];

  const handleAddFolha = () => {
    if (!formData.funcionarioId || !formData.salarioBase) {
      alert("Preencha os campos obrigatórios");
      return;
    }

    const newFolha = {
      id: Date.now(),
      lojaId: parseInt(selectedLoja),
      funcionarioId: formData.funcionarioId,
      ano: parseInt(selectedAno),
      mes: parseInt(selectedMes),
      salarioBase: parseFloat(formData.salarioBase),
      comissao: parseFloat(formData.comissao) || 0,
      vale: parseFloat(formData.vale) || 0,
      desconto: parseFloat(formData.desconto) || 0,
      premiacao: parseFloat(formData.premiacao) || 0,
      observacao: formData.observacao,
      createdAt: new Date().toISOString(),
    };

    setFolhas([...folhas, newFolha]);
    setFormData({
      funcionarioId: "",
      salarioBase: "",
      comissao: "",
      vale: "",
      desconto: "",
      premiacao: "",
      observacao: "",
    });
    setIsOpen(false);
  };

  const lojaFolhas = folhas.filter(f => f.lojaId === parseInt(selectedLoja) && f.ano === parseInt(selectedAno) && f.mes === parseInt(selectedMes));

  const calcularLiquido = (folha: any) => {
    return folha.salarioBase + folha.comissao + folha.premiacao - folha.vale - folha.desconto;
  };

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
              Folha de Pagamento
            </h1>
            <p style={{ color: "#9ca3af" }}>Gestão de salários, comissões e descontos</p>
          </div>
        </div>

        {/* Filtros */}
        <div style={{ background: "#111", border: "1px solid rgba(251, 191, 36, 0.3)", borderRadius: "8px", padding: "24px", marginBottom: "24px" }}>
          <h2 style={{ color: "#fbbf24", marginBottom: "16px", fontSize: "18px", fontWeight: "600" }}>
            Seleção de Período
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "16px", alignItems: "flex-end" }}>
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

            <div>
              <label style={{ color: "#d1d5db", display: "block", marginBottom: "8px", fontSize: "14px" }}>
                Mês
              </label>
              <select
                value={selectedMes}
                onChange={(e) => setSelectedMes(e.target.value)}
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
                {meses.map((mes) => (
                  <option key={mes.id} value={mes.id}>
                    {mes.nome}
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
              + Novo Lançamento
            </button>
          </div>
        </div>

        {/* Dialog para adicionar lançamento */}
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
            overflowY: "auto",
          }}>
            <div style={{
              background: "#111",
              border: "1px solid rgba(251, 191, 36, 0.3)",
              borderRadius: "8px",
              padding: "24px",
              maxWidth: "600px",
              width: "90%",
              margin: "20px auto",
            }}>
              <h3 style={{ color: "#fbbf24", marginBottom: "16px", fontSize: "18px", fontWeight: "600" }}>
                Novo Lançamento de Folha
              </h3>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
                <div>
                  <label style={{ color: "#d1d5db", display: "block", marginBottom: "8px", fontSize: "14px" }}>
                    ID Funcionário
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: 123"
                    value={formData.funcionarioId}
                    onChange={(e) => setFormData({ ...formData, funcionarioId: e.target.value })}
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
                    Salário Base (R$)
                  </label>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={formData.salarioBase}
                    onChange={(e) => setFormData({ ...formData, salarioBase: e.target.value })}
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
                    Comissão (R$)
                  </label>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={formData.comissao}
                    onChange={(e) => setFormData({ ...formData, comissao: e.target.value })}
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
                    Vale (R$)
                  </label>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={formData.vale}
                    onChange={(e) => setFormData({ ...formData, vale: e.target.value })}
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
                    Desconto (R$)
                  </label>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={formData.desconto}
                    onChange={(e) => setFormData({ ...formData, desconto: e.target.value })}
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
                    Premiação (R$)
                  </label>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={formData.premiacao}
                    onChange={(e) => setFormData({ ...formData, premiacao: e.target.value })}
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
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ color: "#d1d5db", display: "block", marginBottom: "8px", fontSize: "14px" }}>
                  Observação
                </label>
                <textarea
                  placeholder="Observações adicionais..."
                  value={formData.observacao}
                  onChange={(e) => setFormData({ ...formData, observacao: e.target.value })}
                  style={{
                    width: "100%",
                    background: "#1f2937",
                    border: "1px solid rgba(251, 191, 36, 0.3)",
                    color: "white",
                    padding: "8px 12px",
                    borderRadius: "4px",
                    fontSize: "14px",
                    boxSizing: "border-box",
                    minHeight: "80px",
                    fontFamily: "inherit",
                  }}
                />
              </div>

              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={handleAddFolha}
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
                  Salvar Lançamento
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

        {/* Tabela de Folhas */}
        <div style={{ background: "#111", border: "1px solid rgba(251, 191, 36, 0.3)", borderRadius: "8px", padding: "24px" }}>
          <h2 style={{ color: "#fbbf24", marginBottom: "8px", fontSize: "18px", fontWeight: "600" }}>
            Folhas de Pagamento
          </h2>
          <p style={{ color: "#9ca3af", marginBottom: "16px", fontSize: "14px" }}>
            {selectedMes}/{selectedAno} - Total: {lojaFolhas.length} lançamento(s)
          </p>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(251, 191, 36, 0.3)" }}>
                  <th style={{ color: "#fbbf24", textAlign: "left", padding: "12px", fontWeight: "600" }}>Func ID</th>
                  <th style={{ color: "#fbbf24", textAlign: "right", padding: "12px", fontWeight: "600" }}>Salário</th>
                  <th style={{ color: "#fbbf24", textAlign: "right", padding: "12px", fontWeight: "600" }}>Comissão</th>
                  <th style={{ color: "#fbbf24", textAlign: "right", padding: "12px", fontWeight: "600" }}>Vale</th>
                  <th style={{ color: "#fbbf24", textAlign: "right", padding: "12px", fontWeight: "600" }}>Desconto</th>
                  <th style={{ color: "#fbbf24", textAlign: "right", padding: "12px", fontWeight: "600" }}>Premiação</th>
                  <th style={{ color: "#fbbf24", textAlign: "right", padding: "12px", fontWeight: "600" }}>Líquido</th>
                </tr>
              </thead>
              <tbody>
                {lojaFolhas.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", color: "#9ca3af", padding: "32px 12px" }}>
                      Nenhum lançamento registrado
                    </td>
                  </tr>
                ) : (
                  lojaFolhas.map((folha) => (
                    <tr key={folha.id} style={{ borderBottom: "1px solid rgba(251, 191, 36, 0.2)" }}>
                      <td style={{ color: "white", padding: "12px" }}>{folha.funcionarioId}</td>
                      <td style={{ color: "#d1d5db", padding: "12px", textAlign: "right" }}>
                        R$ {folha.salarioBase.toFixed(2)}
                      </td>
                      <td style={{ color: "#d1d5db", padding: "12px", textAlign: "right" }}>
                        R$ {folha.comissao.toFixed(2)}
                      </td>
                      <td style={{ color: "#d1d5db", padding: "12px", textAlign: "right" }}>
                        R$ {folha.vale.toFixed(2)}
                      </td>
                      <td style={{ color: "#d1d5db", padding: "12px", textAlign: "right" }}>
                        R$ {folha.desconto.toFixed(2)}
                      </td>
                      <td style={{ color: "#d1d5db", padding: "12px", textAlign: "right" }}>
                        R$ {folha.premiacao.toFixed(2)}
                      </td>
                      <td style={{ color: "#fbbf24", padding: "12px", textAlign: "right", fontWeight: "600" }}>
                        R$ {calcularLiquido(folha).toFixed(2)}
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
