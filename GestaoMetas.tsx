import { useState, useMemo } from "react";

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
];

interface MetaFaixa {
  liquidezMinima: number;
  percentualComissao: number;
}

export default function GestaoMetas() {
  const [selectedLoja, setSelectedLoja] = useState("1");
  const [selectedFuncao, setSelectedFuncao] = useState("mecanico");
  const [isOpen, setIsOpen] = useState(false);
  const [novasFaixas, setNovasFaixas] = useState<MetaFaixa[]>([
    { liquidezMinima: 0, percentualComissao: 10 },
    { liquidezMinima: 8000, percentualComissao: 12 },
    { liquidezMinima: 10000, percentualComissao: 15 },
    { liquidezMinima: 20000, percentualComissao: 17 },
  ]);
  const [metas, setMetas] = useState<any[]>([]);

  const handleAddFaixa = () => {
    const newMeta = {
      id: Date.now(),
      lojaId: parseInt(selectedLoja),
      funcao: selectedFuncao,
      faixas: novasFaixas,
      updatedAt: new Date().toISOString(),
    };
    setMetas([...metas, newMeta]);
    setNovasFaixas([
      { liquidezMinima: 0, percentualComissao: 10 },
      { liquidezMinima: 8000, percentualComissao: 12 },
      { liquidezMinima: 10000, percentualComissao: 15 },
      { liquidezMinima: 20000, percentualComissao: 17 },
    ]);
    setIsOpen(false);
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
              Gestão de Metas
            </h1>
            <p style={{ color: "#9ca3af" }}>Configuração de comissões e metas por função</p>
          </div>
        </div>

        {/* Filtros */}
        <div style={{ background: "#111", border: "1px solid rgba(251, 191, 36, 0.3)", borderRadius: "8px", padding: "24px", marginBottom: "24px" }}>
          <h2 style={{ color: "#fbbf24", marginBottom: "16px", fontSize: "18px", fontWeight: "600" }}>
            Seleção de Loja e Função
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
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
                Função
              </label>
              <select
                value={selectedFuncao}
                onChange={(e) => setSelectedFuncao(e.target.value)}
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

            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <button
                onClick={() => setIsOpen(true)}
                style={{
                  width: "100%",
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
                + Adicionar Faixa
              </button>
            </div>
          </div>
        </div>

        {/* Dialog para adicionar faixa */}
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
              maxHeight: "80vh",
              overflowY: "auto",
            }}>
              <h3 style={{ color: "#fbbf24", marginBottom: "8px", fontSize: "18px", fontWeight: "600" }}>
                Adicionar Faixa de Comissão
              </h3>
              <p style={{ color: "#9ca3af", marginBottom: "16px", fontSize: "14px" }}>
                Adicione uma nova faixa de comissão para {FUNCOES.find(f => f.id === selectedFuncao)?.nome}
              </p>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ color: "#d1d5db", display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: "600" }}>
                  Faixas de Comissão
                </label>
                {novasFaixas.map((faixa, index) => (
                  <div key={index} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", padding: "12px", background: "#1f2937", borderRadius: "4px", border: "1px solid rgba(251, 191, 36, 0.2)", marginBottom: "8px" }}>
                    <div>
                      <label style={{ color: "#9ca3af", fontSize: "12px", display: "block", marginBottom: "4px" }}>
                        Liquidez Mínima (R$)
                      </label>
                      <input
                        type="number"
                        placeholder="0"
                        value={faixa.liquidezMinima}
                        onChange={(e) => {
                          const newFaixas = [...novasFaixas];
                          newFaixas[index].liquidezMinima = parseFloat(e.target.value) || 0;
                          setNovasFaixas(newFaixas);
                        }}
                        style={{
                          width: "100%",
                          background: "#374151",
                          border: "1px solid rgba(251, 191, 36, 0.3)",
                          color: "white",
                          padding: "6px 8px",
                          borderRadius: "4px",
                          fontSize: "14px",
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ color: "#9ca3af", fontSize: "12px", display: "block", marginBottom: "4px" }}>
                        Comissão (%)
                      </label>
                      <input
                        type="number"
                        placeholder="0"
                        step="0.1"
                        value={faixa.percentualComissao}
                        onChange={(e) => {
                          const newFaixas = [...novasFaixas];
                          newFaixas[index].percentualComissao = parseFloat(e.target.value) || 0;
                          setNovasFaixas(newFaixas);
                        }}
                        style={{
                          width: "100%",
                          background: "#374151",
                          border: "1px solid rgba(251, 191, 36, 0.3)",
                          color: "white",
                          padding: "6px 8px",
                          borderRadius: "4px",
                          fontSize: "14px",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={() => setNovasFaixas([...novasFaixas, { liquidezMinima: 0, percentualComissao: 0 }])}
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
                  + Adicionar Faixa
                </button>
                <button
                  onClick={handleAddFaixa}
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
                  Salvar Meta
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

        {/* Tabela de Metas */}
        <div style={{ background: "#111", border: "1px solid rgba(251, 191, 36, 0.3)", borderRadius: "8px", padding: "24px" }}>
          <h2 style={{ color: "#fbbf24", marginBottom: "8px", fontSize: "18px", fontWeight: "600" }}>
            Metas - {LOJAS.find(l => l.id === parseInt(selectedLoja))?.nome}
          </h2>
          <p style={{ color: "#9ca3af", marginBottom: "16px", fontSize: "14px" }}>
            2026/03 - Total: {metas.length} meta(s)
          </p>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(251, 191, 36, 0.3)" }}>
                  <th style={{ color: "#fbbf24", textAlign: "left", padding: "12px", fontWeight: "600" }}>Função</th>
                  <th style={{ color: "#fbbf24", textAlign: "left", padding: "12px", fontWeight: "600" }}>Faixas de Comissão</th>
                  <th style={{ color: "#fbbf24", textAlign: "left", padding: "12px", fontWeight: "600" }}>Data Atualização</th>
                </tr>
              </thead>
              <tbody>
                {metas.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={{ textAlign: "center", color: "#9ca3af", padding: "32px 12px" }}>
                      Nenhuma meta registrada
                    </td>
                  </tr>
                ) : (
                  metas.map((meta) => {
                    const faixas = Array.isArray(meta.faixas) ? meta.faixas : [];
                    return (
                      <tr key={meta.id} style={{ borderBottom: "1px solid rgba(251, 191, 36, 0.2)", hover: { background: "#1f2937" } }}>
                        <td style={{ color: "white", padding: "12px", fontWeight: "600" }}>
                          {FUNCOES.find(f => f.id === meta.funcao)?.nome || meta.funcao}
                        </td>
                        <td style={{ color: "#d1d5db", padding: "12px" }}>
                          {faixas.map((f: any, i: number) => (
                            <div key={i} style={{ fontSize: "14px" }}>
                              R$ {Number(f.liquidezMinima).toLocaleString('pt-BR')} → {Number(f.percentualComissao).toFixed(2)}%
                            </div>
                          ))}
                        </td>
                        <td style={{ color: "#d1d5db", padding: "12px" }}>
                          {meta.updatedAt ? new Date(meta.updatedAt).toLocaleDateString('pt-BR') : '-'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
