import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

type Role = "admin" | "gestor" | "rh" | "compras" | "financeiro";

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

const cardStyle: React.CSSProperties = {
  maxWidth: "1100px",
  margin: "20px auto",
  background: "#07152b",
  border: "1px solid #d4a017",
  borderRadius: "16px",
  padding: "24px",
  boxShadow: "0 0 20px rgba(0,0,0,0.35)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: "10px",
  border: "1px solid #d4a017",
  background: "#0b1730",
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

export default function Usuarios() {
  const [, setLocation] = useLocation();

  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("gestor");
  const [isActive, setIsActive] = useState(true);
  const [message, setMessage] = useState("");

  const usersQuery = trpc.auth.listUsers.useQuery(undefined, {
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
    registerMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending;

  const users = useMemo(() => {
    return (usersQuery.data || []) as UserItem[];
  }, [usersQuery.data]);

  function resetForm() {
    setEditingUserId(null);
    setName("");
    setEmail("");
    setPassword("");
    setRole("gestor");
    setIsActive(true);
  }

  function handleEdit(user: UserItem) {
    setEditingUserId(user.id);
    setName(user.name || "");
    setEmail(user.email || "");
    setPassword("");
    setRole((user.role as Role) || "gestor");
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

    if (editingUserId) {
      updateMutation.mutate({
        id: editingUserId,
        name,
        email,
        password: password.trim() ? password : undefined,
        role,
        lojaId: null,
        isActive,
      });
      return;
    }

    registerMutation.mutate({
      name,
      email,
      password,
      role,
      lojaId: null,
    });
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#000",
        color: "#fff",
        padding: "20px",
      }}
    >
      <div style={{ maxWidth: "1100px", margin: "0 auto 10px auto" }}>
        <button
          onClick={() => setLocation("/")}
          style={outlineButtonStyle}
        >
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
            ? "Atualize os dados do usuário selecionado."
            : "Cadastre um novo login para acessar o sistema."}
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
            />
          </div>

          <div>
            <label style={labelStyle}>Perfil</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              style={inputStyle}
            >
              <option value="admin">Admin</option>
              <option value="gestor">Gestor</option>
              <option value="rh">RH</option>
              <option value="compras">Compras</option>
              <option value="financeiro">Financeiro</option>
            </select>
          </div>

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
              <button
                type="button"
                onClick={resetForm}
                style={outlineButtonStyle}
              >
                Cancelar edição
              </button>
            )}
          </div>
        </form>

        {message && (
          <div
            style={{
              marginTop: "18px",
              padding: "12px 14px",
              borderRadius: "10px",
              background: "#0b1730",
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
          {users.map((user) => (
            <div
              key={user.id}
              style={{
                border: "1px solid rgba(250, 204, 21, 0.25)",
                borderRadius: "14px",
                padding: "16px",
                background: "#0b1730",
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
                  Perfil: {user.role}
                </div>

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
          ))}
        </div>
      </div>
    </div>
  );
}