import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

type PerfilAcesso =
  | "admin"
  | "gestor"
  | "rh_lider"
  | "rh_caixa"
  | "compras"
  | "financeiro";

type RoleBackend = "admin" | "gestor" | "rh" | "compras" | "financeiro";

type UserItem = {
  id: number;
  openId: string | null;
  name: string | null;
  email: string | null;
  role: string;
  lojaId: number | null;
  isActive: boolean;
  lastSignedIn?: Date | string | null;
};

type LojaItem = {
  id: number;
  nome: string;
};

const cardStyle: React.CSSProperties = {
  maxWidth: "1100px",
  margin: "20px auto",
  background: "#080808",
  border: "1px solid rgba(212,160,23,0.45)",
  borderRadius: "16px",
  padding: "24px",
  boxShadow: "0 0 20px rgba(0,0,0,0.35)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: "10px",
  border: "1px solid rgba(212,160,23,0.55)",
  background: "#111111",
  color: "#fff",
  outline: "none",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: "6px",
  color: "#f8fafc",
  fontSize: "14px",
};

const buttonStyle: React.CSSProperties = {
  padding: "12px 16px",
  borderRadius: "10px",
  border: "none",
  background: "#facc15",
  color: "#111",
  fontWeight: 700,
  cursor: "pointer",
};

const outlineButtonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: "10px",
  border: "1px solid #d4a017",
  background: "transparent",
  color: "#facc15",
  fontWeight: 700,
  cursor: "pointer",
};

const dangerButtonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: "10px",
  border: "1px solid #ef4444",
  background: "transparent",
  color: "#ef4444",
  fontWeight: 700,
  cursor: "pointer",
};

function perfilDoUsuario(user: UserItem): PerfilAcesso {
  if (user.role === "rh") {
    return Number(user.lojaId || 0) > 0 ? "rh_caixa" : "rh_lider";
  }

  if (
    user.role === "admin" ||
    user.role === "gestor" ||
    user.role === "compras" ||
    user.role === "financeiro"
  ) {
    return user.role;
  }

  return "gestor";
}

function roleBackendDoPerfil(perfil: PerfilAcesso): RoleBackend {
  if (perfil === "rh_lider" || perfil === "rh_caixa") return "rh";
  return perfil;
}

function nomePerfil(user: UserItem) {
  if (user.role === "rh" && Number(user.lojaId || 0) > 0) return "Caixa Líder";
  if (user.role === "rh") return "Líder RH";
  if (user.role === "admin") return "Admin";
  if (user.role === "gestor") return "Gestor";
  if (user.role === "compras") return "Compras";
  if (user.role === "financeiro") return "Financeiro";
  return user.role;
}

export default function Usuarios() {
  const [, setLocation] = useLocation();

  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [perfil, setPerfil] = useState<PerfilAcesso>("gestor");
  const [lojaId, setLojaId] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [message, setMessage] = useState("");

  const usersQuery = trpc.auth.listUsers.useQuery(undefined, {
    retry: false,
  });

  const lojasQuery = trpc.lojas.list.useQuery(undefined, {
    retry: false,
  });

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: (data: { message?: string }) => {
      setMessage(data.message || "Usuário criado com sucesso");
      resetForm();
      usersQuery.refetch();
    },
    onError: (error: { message?: string }) => {
      setMessage(error.message || "Erro ao criar usuário");
    },
  });

  const updateMutation = trpc.auth.updateUser.useMutation({
    onSuccess: (data: { message?: string }) => {
      setMessage(data.message || "Usuário atualizado com sucesso");
      resetForm();
      usersQuery.refetch();
    },
    onError: (error: { message?: string }) => {
      setMessage(error.message || "Erro ao atualizar usuário");
    },
  });

  const deleteMutation = trpc.auth.deleteUser.useMutation({
    onSuccess: (data: { message?: string }) => {
      setMessage(data.message || "Usuário excluído com sucesso");
      usersQuery.refetch();
    },
    onError: (error: { message?: string }) => {
      setMessage(error.message || "Erro ao excluir usuário");
    },
  });

  const loading =
    usersQuery.isLoading ||
    lojasQuery.isLoading ||
    registerMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending;

  const users = useMemo(() => {
    return (usersQuery.data || []) as UserItem[];
  }, [usersQuery.data]);

  const lojas = useMemo(() => {
    return (lojasQuery.data || []) as LojaItem[];
  }, [lojasQuery.data]);

  function resetForm() {
    setEditingUserId(null);
    setName("");
    setEmail("");
    setPassword("");
    setPerfil("gestor");
    setLojaId("");
    setIsActive(true);
  }

  function handleEdit(user: UserItem) {
    setEditingUserId(user.id);
    setName(user.name || "");
    setEmail(user.email || "");
    setPassword("");
    setPerfil(perfilDoUsuario(user));
    setLojaId(user.lojaId ? String(user.lojaId) : "");
    setIsActive(Boolean(user.isActive));
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleDelete(user: UserItem) {
    const confirmed = window.confirm(
      `Tem certeza que deseja excluir o usuário ${user.name || user.email || user.id}?`
    );
    if (!confirmed) return;

    setMessage("");
    deleteMutation.mutate({ id: user.id });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");

    if (perfil === "rh_caixa" && !lojaId) {
      setMessage("Selecione a loja da Caixa Líder.");
      return;
    }

    const role = roleBackendDoPerfil(perfil);
    const lojaIdBackend = perfil === "rh_caixa" ? Number(lojaId) : null;

    if (editingUserId) {
      updateMutation.mutate({
        id: editingUserId,
        name,
        email,
        password: password.trim() ? password : undefined,
        role,
        lojaId: lojaIdBackend,
        isActive,
      });
      return;
    }

    registerMutation.mutate({
      name,
      email,
      password,
      role,
      lojaId: lojaIdBackend,
    });
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#050505",
        color: "#fff",
        padding: "20px",
      }}
    >
      <div style={{ maxWidth: "1100px", margin: "0 auto 10px auto" }}>
        <button onClick={() => setLocation("/")} style={outlineButtonStyle}>
          ← Voltar para Dashboard
        </button>
      </div>

      <div style={cardStyle}>
        <h1
          style={{
            color: "#facc15",
            fontSize: "28px",
            marginBottom: "8px",
          }}
        >
          {editingUserId ? "Editar usuário" : "Criar usuário"}
        </h1>

        <p style={{ color: "#cbd5e1", marginBottom: "24px" }}>
          {editingUserId
            ? "Atualize os dados e o nível de acesso do usuário selecionado."
            : "Cadastre um novo login e defina exatamente qual área ele poderá acessar."}
        </p>

        <form
          onSubmit={handleSubmit}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "16px",
          }}
        >
          <div>
            <label style={labelStyle}>Nome</label>
            <input
              type="text"
              placeholder="Nome completo"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle}
              required
            />
          </div>

          <div>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              placeholder="email@empresa.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
              required
            />
          </div>

          <div>
            <label style={labelStyle}>
              Senha {editingUserId ? "(deixe em branco para manter)" : ""}
            </label>
            <input
              type="password"
              placeholder="Digite a senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
              required={!editingUserId}
            />
          </div>

          <div>
            <label style={labelStyle}>Perfil de acesso</label>
            <select
              value={perfil}
              onChange={(e) => {
                const novoPerfil = e.target.value as PerfilAcesso;
                setPerfil(novoPerfil);
                if (novoPerfil !== "rh_caixa") setLojaId("");
              }}
              style={inputStyle}
            >
              <option value="admin">Admin</option>
              <option value="gestor">Gestor</option>
              <option value="rh_lider">Líder RH</option>
              <option value="rh_caixa">Caixa Líder</option>
              <option value="compras">Compras</option>
              <option value="financeiro">Financeiro</option>
            </select>
          </div>

          {perfil === "rh_caixa" && (
            <div>
              <label style={labelStyle}>Loja da Caixa Líder</label>
              <select
                value={lojaId}
                onChange={(e) => setLojaId(e.target.value)}
                style={inputStyle}
                required
              >
                <option value="">Selecione a loja</option>
                {lojas.map((loja) => (
                  <option key={loja.id} value={String(loja.id)}>
                    {loja.nome}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label style={labelStyle}>Status</label>
            <select
              value={isActive ? "ativo" : "inativo"}
              onChange={(e) => setIsActive(e.target.value === "ativo")}
              style={inputStyle}
            >
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
            </select>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "end",
              gap: "10px",
              gridColumn: "1 / -1",
            }}
          >
            <button
              type="submit"
              disabled={loading}
              style={{
                ...buttonStyle,
                opacity: loading ? 0.7 : 1,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading
                ? "Salvando..."
                : editingUserId
                ? "Atualizar usuário"
                : "Criar usuário"}
            </button>

            {editingUserId && (
              <button type="button" onClick={resetForm} style={outlineButtonStyle}>
                Cancelar edição
              </button>
            )}
          </div>
        </form>

        <div
          style={{
            marginTop: "18px",
            padding: "12px 14px",
            borderRadius: "10px",
            background: "#111111",
            border: "1px solid rgba(212,160,23,0.35)",
            color: "#cbd5e1",
            fontSize: "13px",
            lineHeight: 1.6,
          }}
        >
          <strong style={{ color: "#facc15" }}>Regra de acesso:</strong>{" "}
          Caixa Líder fica vinculada a uma única loja e entra somente em “Meu Dia”.
          Líder RH possui visão gerencial e não fica vinculada a uma loja específica.
        </div>

        {message && (
          <div
            style={{
              marginTop: "18px",
              padding: "12px 14px",
              borderRadius: "10px",
              background: "#111111",
              border: "1px solid #d4a017",
              color: "#facc15",
            }}
          >
            {message}
          </div>
        )}
      </div>

      <div style={cardStyle}>
        <h2
          style={{
            color: "#facc15",
            fontSize: "24px",
            marginBottom: "18px",
          }}
        >
          Usuários cadastrados
        </h2>

        {usersQuery.isLoading && <p>Carregando usuários...</p>}

        {usersQuery.error && (
          <div
            style={{
              padding: "12px 14px",
              borderRadius: "10px",
              background: "#2a0f0f",
              border: "1px solid #ef4444",
              color: "#fecaca",
              marginBottom: "14px",
            }}
          >
            {usersQuery.error.message}
          </div>
        )}

        {!usersQuery.isLoading && users.length === 0 && (
          <p style={{ color: "#cbd5e1" }}>Nenhum usuário cadastrado.</p>
        )}

        <div style={{ display: "grid", gap: "14px" }}>
          {users.map((user) => {
            const loja = lojas.find((item) => Number(item.id) === Number(user.lojaId));

            return (
              <div
                key={user.id}
                style={{
                  border: "1px solid rgba(250, 204, 21, 0.25)",
                  borderRadius: "14px",
                  padding: "16px",
                  background: "#111111",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "16px",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ flex: 1, minWidth: "220px" }}>
                  <div
                    style={{
                      fontSize: "18px",
                      fontWeight: 700,
                      color: "#fff",
                      marginBottom: "6px",
                    }}
                  >
                    {user.name || "Sem nome"}
                  </div>

                  <div style={{ color: "#cbd5e1", marginBottom: "4px" }}>
                    {user.email || "Sem email"}
                  </div>

                  <div style={{ color: "#facc15", marginBottom: "4px" }}>
                    Perfil: {nomePerfil(user)}
                  </div>

                  {user.role === "rh" && Number(user.lojaId || 0) > 0 && (
                    <div style={{ color: "#cbd5e1", marginBottom: "4px" }}>
                      Loja: {loja?.nome || `Loja ${user.lojaId}`}
                    </div>
                  )}

                  <div style={{ color: user.isActive ? "#86efac" : "#fca5a5" }}>
                    Status: {user.isActive ? "Ativo" : "Inativo"}
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: "10px",
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => handleEdit(user)}
                    style={outlineButtonStyle}
                  >
                    Editar
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(user)}
                    style={dangerButtonStyle}
                  >
                    Excluir
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
