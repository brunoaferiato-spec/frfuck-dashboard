import { useMemo, useState } from "react";

type Unidade =
  | "Joinville"
  | "Blumenau"
  | "São José"
  | "Florianópolis"
  | "ACI Promoções"
  | "Contrato PJ";

type TipoMeta =
  | "semanal_liquidez"
  | "mensal_liquidez"
  | "semanal_quantidade_valor"
  | "semanal_quantidade_blocos"
  | "valor_fixo_unidade"
  | "pj_resultado_loja"
  | "hibrida_gerente";

interface Faixa {
  id: number;
  de: number;
  ate: number | "";
  valor: number;
}

interface Bonus {
  id: number;
  gatilho: number;
  valor: number;
  descricao: string;
}

interface Meta {
  id: number;
  unidade: Unidade;
  funcao: string;
  tipoMeta: TipoMeta;
  funcionario: string;
  observacao: string;
  valorBase: number;
  faixas: Faixa[];
  bonus: Bonus[];
  blocoQuantidade: number;
  blocoValor: number;
  valorFixo: number;
  metaGrupo: number;
  bonusGrupo: number;
  recordeGrupo: number;
  percentualRecorde: number;
  valorBaseSecundario: number;
  faixasSecundarias: Faixa[];
}

const UNIDADES: Unidade[] = [
  "Joinville",
  "Blumenau",
  "São José",
  "Florianópolis",
  "ACI Promoções",
  "Contrato PJ",
];

const FUNCOES = [
  "Vendedor",
  "Mecânico",
  "Consultor de Vendas",
  "Recepção",
  "Alinhador",
  "Auxiliar de Alinhador",
  "Vendedor de Alinhamento",
  "Supervisor de Vendas",
  "Gerente",
  "Caixa",
  "Caixa Líder",
  "Auxiliar de Limpeza",
  "Estoquista",
  "Estoquista Líder",
  "Auxiliar de Mecânico",
  "Administrativo",
];

const TIPOS_META: { value: TipoMeta; label: string }[] = [
  { value: "semanal_liquidez", label: "Semanal por liquidez" },
  { value: "mensal_liquidez", label: "Mensal por liquidez" },
  { value: "semanal_quantidade_valor", label: "Semanal por quantidade + valor unitário" },
  { value: "semanal_quantidade_blocos", label: "Semanal por blocos de quantidade" },
  { value: "valor_fixo_unidade", label: "Valor fixo por unidade" },
  { value: "pj_resultado_loja", label: "PJ por resultado da loja" },
  { value: "hibrida_gerente", label: "Meta híbrida gerente" },
];

function createEmptyFaixa(): Faixa {
  return {
    id: Date.now() + Math.floor(Math.random() * 1000),
    de: 0,
    ate: "",
    valor: 0,
  };
}

function createEmptyBonus(): Bonus {
  return {
    id: Date.now() + Math.floor(Math.random() * 1000),
    gatilho: 0,
    valor: 0,
    descricao: "",
  };
}

function createInitialMeta(): Omit<Meta, "id"> {
  return {
    unidade: "Joinville",
    funcao: "Vendedor",
    tipoMeta: "semanal_liquidez",
    funcionario: "",
    observacao: "",
    valorBase: 0,
    faixas: [createEmptyFaixa()],
    bonus: [],
    blocoQuantidade: 25,
    blocoValor: 100,
    valorFixo: 0,
    metaGrupo: 0,
    bonusGrupo: 0,
    recordeGrupo: 0,
    percentualRecorde: 0,
    valorBaseSecundario: 0,
    faixasSecundarias: [createEmptyFaixa()],
  };
}

export default function GestaoMetas() {
  const [filtroUnidade, setFiltroUnidade] = useState<string>("todas");
  const [filtroFuncao, setFiltroFuncao] = useState<string>("todas");
  const [filtroTipo, setFiltroTipo] = useState<string>("todos");

  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [metas, setMetas] = useState<Meta[]>([]);
  const [form, setForm] = useState<Omit<Meta, "id">>(createInitialMeta());

  const metasFiltradas = useMemo(() => {
    return metas.filter((meta) => {
      const okUnidade = filtroUnidade === "todas" || meta.unidade === filtroUnidade;
      const okFuncao = filtroFuncao === "todas" || meta.funcao === filtroFuncao;
      const okTipo = filtroTipo === "todos" || meta.tipoMeta === filtroTipo;
      return okUnidade && okFuncao && okTipo;
    });
  }, [metas, filtroUnidade, filtroFuncao, filtroTipo]);

  const resetForm = () => {
    setForm(createInitialMeta());
    setEditingId(null);
    setIsOpen(false);
  };

  const handleSave = () => {
    if (!form.funcao.trim()) {
      alert("Selecione a função.");
      return;
    }

    if (editingId) {
      setMetas((prev) =>
        prev.map((meta) => (meta.id === editingId ? { id: editingId, ...form } : meta))
      );
    } else {
      setMetas((prev) => [...prev, { id: Date.now(), ...form }]);
    }

    resetForm();
  };

  const handleEdit = (meta: Meta) => {
    setEditingId(meta.id);
    setForm({
      unidade: meta.unidade,
      funcao: meta.funcao,
      tipoMeta: meta.tipoMeta,
      funcionario: meta.funcionario,
      observacao: meta.observacao,
      valorBase: meta.valorBase,
      faixas: meta.faixas,
      bonus: meta.bonus,
      blocoQuantidade: meta.blocoQuantidade,
      blocoValor: meta.blocoValor,
      valorFixo: meta.valorFixo,
      metaGrupo: meta.metaGrupo,
      bonusGrupo: meta.bonusGrupo,
      recordeGrupo: meta.recordeGrupo,
      percentualRecorde: meta.percentualRecorde,
      valorBaseSecundario: meta.valorBaseSecundario,
      faixasSecundarias: meta.faixasSecundarias,
    });
    setIsOpen(true);
  };

  const handleDelete = (id: number) => {
    const confirmar = window.confirm("Deseja excluir esta meta?");
    if (!confirmar) return;
    setMetas((prev) => prev.filter((meta) => meta.id !== id));
  };

  const updateFaixa = (
    campo: "faixas" | "faixasSecundarias",
    id: number,
    key: keyof Faixa,
    value: number | ""
  ) => {
    setForm((prev) => ({
      ...prev,
      [campo]: prev[campo].map((item) =>
        item.id === id ? { ...item, [key]: value } : item
      ),
    }));
  };

  const addFaixa = (campo: "faixas" | "faixasSecundarias") => {
    setForm((prev) => ({
      ...prev,
      [campo]: [...prev[campo], createEmptyFaixa()],
    }));
  };

  const removeFaixa = (campo: "faixas" | "faixasSecundarias", id: number) => {
    setForm((prev) => ({
      ...prev,
      [campo]: prev[campo].filter((item) => item.id !== id),
    }));
  };

  const updateBonus = (id: number, key: keyof Bonus, value: number | string) => {
    setForm((prev) => ({
      ...prev,
      bonus: prev.bonus.map((item) =>
        item.id === id ? { ...item, [key]: value } : item
      ),
    }));
  };

  const addBonus = () => {
    setForm((prev) => ({
      ...prev,
      bonus: [...prev.bonus, createEmptyBonus()],
    }));
  };

  const removeBonus = (id: number) => {
    setForm((prev) => ({
      ...prev,
      bonus: prev.bonus.filter((item) => item.id !== id),
    }));
  };

  const renderFaixas = (
    titulo: string,
    campo: "faixas" | "faixasSecundarias",
    labelValor: string
  ) => (
    <div style={sectionCardStyle}>
      <h3 style={sectionTitleStyle}>{titulo}</h3>

      {form[campo].map((faixa) => (
        <div
          key={faixa.id}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr auto",
            gap: "8px",
            marginBottom: "8px",
          }}
        >
          <input
            type="number"
            value={faixa.de}
            onChange={(e) =>
              updateFaixa(campo, faixa.id, "de", Number(e.target.value) || 0)
            }
            placeholder="De"
            style={inputStyle}
          />
          <input
            type="number"
            value={faixa.ate}
            onChange={(e) =>
              updateFaixa(
                campo,
                faixa.id,
                "ate",
                e.target.value === "" ? "" : Number(e.target.value)
              )
            }
            placeholder="Até (vazio = acima)"
            style={inputStyle}
          />
          <input
            type="number"
            value={faixa.valor}
            onChange={(e) =>
              updateFaixa(campo, faixa.id, "valor", Number(e.target.value) || 0)
            }
            placeholder={labelValor}
            style={inputStyle}
          />
          <button
            onClick={() => removeFaixa(campo, faixa.id)}
            style={dangerButtonStyle}
          >
            Excluir
          </button>
        </div>
      ))}

      <button onClick={() => addFaixa(campo)} style={secondaryButtonStyle}>
        + Adicionar faixa
      </button>
    </div>
  );

  const renderBonus = () => (
    <div style={sectionCardStyle}>
      <h3 style={sectionTitleStyle}>Bônus / Prêmios</h3>

      {form.bonus.map((bonus) => (
        <div
          key={bonus.id}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 2fr auto",
            gap: "8px",
            marginBottom: "8px",
          }}
        >
          <input
            type="number"
            value={bonus.gatilho}
            onChange={(e) =>
              updateBonus(bonus.id, "gatilho", Number(e.target.value) || 0)
            }
            placeholder="Gatilho"
            style={inputStyle}
          />
          <input
            type="number"
            value={bonus.valor}
            onChange={(e) =>
              updateBonus(bonus.id, "valor", Number(e.target.value) || 0)
            }
            placeholder="Valor"
            style={inputStyle}
          />
          <input
            type="text"
            value={bonus.descricao}
            onChange={(e) => updateBonus(bonus.id, "descricao", e.target.value)}
            placeholder="Descrição"
            style={inputStyle}
          />
          <button onClick={() => removeBonus(bonus.id)} style={dangerButtonStyle}>
            Excluir
          </button>
        </div>
      ))}

      <button onClick={addBonus} style={secondaryButtonStyle}>
        + Adicionar bônus
      </button>
    </div>
  );

  const resumoMeta = (meta: Meta) => {
    switch (meta.tipoMeta) {
      case "semanal_liquidez":
      case "mensal_liquidez":
        return `Base: ${meta.valorBase}% | ${meta.faixas.length} faixa(s)`;
      case "semanal_quantidade_valor":
        return `Base: R$ ${meta.valorBase}/unid | ${meta.faixas.length} faixa(s) | ${meta.bonus.length} bônus`;
      case "semanal_quantidade_blocos":
        return `A cada ${meta.blocoQuantidade} = R$ ${meta.blocoValor} | ${meta.bonus.length} bônus`;
      case "valor_fixo_unidade":
        return `R$ ${meta.valorFixo} por unidade`;
      case "pj_resultado_loja":
        return `Fixo: R$ ${meta.valorFixo} | ${meta.faixas.length} meta(s) loja | bônus grupo`;
      case "hibrida_gerente":
        return `Meta vendas + meta gerente`;
      default:
        return "-";
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(to bottom right, #000, #111, #000)",
        padding: "24px",
      }}
    >
      <div style={{ maxWidth: "1400px", margin: "0 auto" }}>
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
              Gestão de Metas
            </h1>
            <p style={{ color: "#9ca3af" }}>
              Cadastre, edite e organize as regras de comissão e premiação
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
                value={filtroUnidade}
                onChange={(e) => setFiltroUnidade(e.target.value)}
                style={inputStyle}
              >
                <option value="todas">Todas</option>
                {UNIDADES.map((unidade) => (
                  <option key={unidade} value={unidade}>
                    {unidade}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Função</label>
              <select
                value={filtroFuncao}
                onChange={(e) => setFiltroFuncao(e.target.value)}
                style={inputStyle}
              >
                <option value="todas">Todas</option>
                {FUNCOES.map((funcao) => (
                  <option key={funcao} value={funcao}>
                    {funcao}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Tipo de meta</label>
              <select
                value={filtroTipo}
                onChange={(e) => setFiltroTipo(e.target.value)}
                style={inputStyle}
              >
                <option value="todos">Todos</option>
                {TIPOS_META.map((tipo) => (
                  <option key={tipo.value} value={tipo.value}>
                    {tipo.label}
                  </option>
                ))}
              </select>
            </div>

            <button onClick={() => setIsOpen(true)} style={primaryButtonStyle}>
              + Nova meta
            </button>
          </div>
        </div>

        {isOpen && (
          <div style={overlayStyle}>
            <div style={modalStyle}>
              <h2 style={{ ...sectionTitleStyle, marginBottom: "16px" }}>
                {editingId ? "Editar meta" : "Nova meta"}
              </h2>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "16px",
                  marginBottom: "16px",
                }}
              >
                <div>
                  <label style={labelStyle}>Unidade</label>
                  <select
                    value={form.unidade}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, unidade: e.target.value as Unidade }))
                    }
                    style={inputStyle}
                  >
                    {UNIDADES.map((unidade) => (
                      <option key={unidade} value={unidade}>
                        {unidade}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Função</label>
                  <select
                    value={form.funcao}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, funcao: e.target.value }))
                    }
                    style={inputStyle}
                  >
                    {FUNCOES.map((funcao) => (
                      <option key={funcao} value={funcao}>
                        {funcao}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Tipo de meta</label>
                  <select
                    value={form.tipoMeta}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, tipoMeta: e.target.value as TipoMeta }))
                    }
                    style={inputStyle}
                  >
                    {TIPOS_META.map((tipo) => (
                      <option key={tipo.value} value={tipo.value}>
                        {tipo.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Funcionário específico (opcional)</label>
                  <input
                    type="text"
                    value={form.funcionario}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, funcionario: e.target.value }))
                    }
                    placeholder="Deixe vazio para meta geral"
                    style={inputStyle}
                  />
                </div>
              </div>

              {(form.tipoMeta === "semanal_liquidez" ||
                form.tipoMeta === "mensal_liquidez") && (
                <>
                  <div style={sectionCardStyle}>
                    <h3 style={sectionTitleStyle}>Base da comissão</h3>
                    <input
                      type="number"
                      value={form.valorBase}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          valorBase: Number(e.target.value) || 0,
                        }))
                      }
                      placeholder="% inicial"
                      style={inputStyle}
                    />
                  </div>

                  {renderFaixas("Faixas da meta", "faixas", "%")}
                </>
              )}

              {form.tipoMeta === "semanal_quantidade_valor" && (
                <>
                  <div style={sectionCardStyle}>
                    <h3 style={sectionTitleStyle}>Base por unidade</h3>
                    <input
                      type="number"
                      value={form.valorBase}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          valorBase: Number(e.target.value) || 0,
                        }))
                      }
                      placeholder="Valor base por unidade"
                      style={inputStyle}
                    />
                  </div>

                  {renderFaixas("Faixas por quantidade", "faixas", "Valor por unidade")}
                  {renderBonus()}
                </>
              )}

              {form.tipoMeta === "semanal_quantidade_blocos" && (
                <>
                  <div style={sectionCardStyle}>
                    <h3 style={sectionTitleStyle}>Regra por blocos</h3>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "16px",
                      }}
                    >
                      <input
                        type="number"
                        value={form.blocoQuantidade}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            blocoQuantidade: Number(e.target.value) || 0,
                          }))
                        }
                        placeholder="A cada X unidades"
                        style={inputStyle}
                      />
                      <input
                        type="number"
                        value={form.blocoValor}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            blocoValor: Number(e.target.value) || 0,
                          }))
                        }
                        placeholder="Ganha R$"
                        style={inputStyle}
                      />
                    </div>
                  </div>

                  {renderBonus()}
                </>
              )}

              {form.tipoMeta === "valor_fixo_unidade" && (
                <div style={sectionCardStyle}>
                  <h3 style={sectionTitleStyle}>Valor fixo por unidade</h3>
                  <input
                    type="number"
                    value={form.valorFixo}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        valorFixo: Number(e.target.value) || 0,
                      }))
                    }
                    placeholder="Ex.: 1.50"
                    style={inputStyle}
                  />
                </div>
              )}

              {form.tipoMeta === "pj_resultado_loja" && (
                <>
                  <div style={sectionCardStyle}>
                    <h3 style={sectionTitleStyle}>Base PJ</h3>
                    <input
                      type="number"
                      value={form.valorFixo}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          valorFixo: Number(e.target.value) || 0,
                        }))
                      }
                      placeholder="Valor fixo"
                      style={inputStyle}
                    />
                  </div>

                  {renderFaixas("Faixas por faturamento da loja", "faixas", "Prêmio")}

                  <div style={sectionCardStyle}>
                    <h3 style={sectionTitleStyle}>Bônus de grupo e recorde</h3>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(2, 1fr)",
                        gap: "12px",
                      }}
                    >
                      <input
                        type="number"
                        value={form.metaGrupo}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            metaGrupo: Number(e.target.value) || 0,
                          }))
                        }
                        placeholder="Meta grupo"
                        style={inputStyle}
                      />
                      <input
                        type="number"
                        value={form.bonusGrupo}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            bonusGrupo: Number(e.target.value) || 0,
                          }))
                        }
                        placeholder="Bônus grupo"
                        style={inputStyle}
                      />
                      <input
                        type="number"
                        value={form.recordeGrupo}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            recordeGrupo: Number(e.target.value) || 0,
                          }))
                        }
                        placeholder="Recorde atual"
                        style={inputStyle}
                      />
                      <input
                        type="number"
                        value={form.percentualRecorde}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            percentualRecorde: Number(e.target.value) || 0,
                          }))
                        }
                        placeholder="% sobre recorde"
                        style={inputStyle}
                      />
                    </div>
                  </div>
                </>
              )}

              {form.tipoMeta === "hibrida_gerente" && (
                <>
                  <div style={sectionCardStyle}>
                    <h3 style={sectionTitleStyle}>Meta vendas</h3>
                    <input
                      type="number"
                      value={form.valorBase}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          valorBase: Number(e.target.value) || 0,
                        }))
                      }
                      placeholder="% inicial meta vendas"
                      style={inputStyle}
                    />
                  </div>

                  {renderFaixas("Faixas da meta vendas", "faixas", "%")}

                  <div style={sectionCardStyle}>
                    <h3 style={sectionTitleStyle}>Meta gerente</h3>
                    <input
                      type="number"
                      value={form.valorBaseSecundario}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          valorBaseSecundario: Number(e.target.value) || 0,
                        }))
                      }
                      placeholder="% inicial meta gerente"
                      style={inputStyle}
                    />
                  </div>

                  {renderFaixas("Faixas da meta gerente", "faixasSecundarias", "%")}
                </>
              )}

              <div style={sectionCardStyle}>
                <h3 style={sectionTitleStyle}>Observação</h3>
                <textarea
                  value={form.observacao}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, observacao: e.target.value }))
                  }
                  placeholder="Observações sobre esta meta"
                  style={{ ...inputStyle, minHeight: "90px", resize: "vertical" }}
                />
              </div>

              <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
                <button onClick={handleSave} style={primaryButtonStyle}>
                  {editingId ? "Salvar alterações" : "Salvar meta"}
                </button>
                <button onClick={resetForm} style={secondaryButtonStyle}>
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        <div style={cardStyle}>
          <h2 style={sectionTitleStyle}>Metas cadastradas</h2>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(251, 191, 36, 0.3)" }}>
                  <th style={thStyle}>Unidade</th>
                  <th style={thStyle}>Função</th>
                  <th style={thStyle}>Tipo</th>
                  <th style={thStyle}>Funcionário</th>
                  <th style={thStyle}>Resumo</th>
                  <th style={thStyle}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {metasFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={emptyTdStyle}>
                      Nenhuma meta cadastrada
                    </td>
                  </tr>
                ) : (
                  metasFiltradas.map((meta) => (
                    <tr
                      key={meta.id}
                      style={{ borderBottom: "1px solid rgba(251, 191, 36, 0.15)" }}
                    >
                      <td style={tdStyle}>{meta.unidade}</td>
                      <td style={tdStyle}>{meta.funcao}</td>
                      <td style={tdStyle}>
                        {TIPOS_META.find((tipo) => tipo.value === meta.tipoMeta)?.label}
                      </td>
                      <td style={tdStyle}>{meta.funcionario || "Geral"}</td>
                      <td style={tdStyle}>{resumoMeta(meta)}</td>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", gap: "8px" }}>
                          <button onClick={() => handleEdit(meta)} style={secondaryButtonStyle}>
                            Editar
                          </button>
                          <button onClick={() => handleDelete(meta.id)} style={dangerButtonStyle}>
                            Excluir
                          </button>
                        </div>
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

const cardStyle: React.CSSProperties = {
  background: "#111",
  border: "1px solid rgba(251, 191, 36, 0.3)",
  borderRadius: "8px",
  padding: "24px",
  marginBottom: "24px",
};

const sectionCardStyle: React.CSSProperties = {
  background: "#161616",
  border: "1px solid rgba(251, 191, 36, 0.15)",
  borderRadius: "8px",
  padding: "16px",
  marginBottom: "16px",
};

const sectionTitleStyle: React.CSSProperties = {
  color: "#fbbf24",
  marginBottom: "12px",
  fontSize: "18px",
  fontWeight: 600,
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
  fontWeight: 600,
  fontSize: "14px",
};

const secondaryButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid rgba(251, 191, 36, 0.3)",
  color: "#fbbf24",
  padding: "10px 16px",
  borderRadius: "4px",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: "14px",
};

const dangerButtonStyle: React.CSSProperties = {
  background: "rgba(239, 68, 68, 0.15)",
  border: "1px solid rgba(239, 68, 68, 0.35)",
  color: "#f87171",
  padding: "10px 12px",
  borderRadius: "4px",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: "14px",
};

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: "rgba(0, 0, 0, 0.75)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
  padding: "20px",
};

const modalStyle: React.CSSProperties = {
  background: "#111",
  border: "1px solid rgba(251, 191, 36, 0.3)",
  borderRadius: "8px",
  padding: "24px",
  width: "100%",
  maxWidth: "1100px",
  maxHeight: "90vh",
  overflowY: "auto",
};

const thStyle: React.CSSProperties = {
  color: "#fbbf24",
  textAlign: "left",
  padding: "12px",
  fontWeight: 600,
};

const tdStyle: React.CSSProperties = {
  color: "#d1d5db",
  padding: "12px",
  verticalAlign: "top",
};

const emptyTdStyle: React.CSSProperties = {
  textAlign: "center",
  color: "#9ca3af",
  padding: "32px 12px",
};
