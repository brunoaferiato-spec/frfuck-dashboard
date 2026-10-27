import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  Check,
  KeyRound,
  Mail,
  Pencil,
  Search,
  ShieldCheck,
  Store,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { EMPRESAS, empresaDaLoja } from "@shared/empresas";

type PerfilAcesso =
  | "admin"
  | "gestor"
  | "rh_lider"
  | "rh_caixa"
  | "compras"
  | "financeiro"
  | "pneus_leitura"
  | "estoque"
  | "estoque_supervisor";

type RoleBackend = "admin" | "gestor" | "rh" | "compras" | "financeiro" | "pneus_leitura" | "estoque" | "estoque_supervisor";

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

// O que cada perfil enxerga no sistema (mesmas regras das rotas e do servidor).
const PERFIS: Array<{ valor: PerfilAcesso; nome: string; descricao: string; cor: string }> = [
  { valor: "admin", nome: "Admin", descricao: "Acesso total, incluindo usuários e permissões.", cor: "border-[#D4AF37]/40 bg-[#D4AF37]/[0.10] text-[#F2D675]" },
  { valor: "gestor", nome: "Gestor", descricao: "Acesso total, incluindo usuários e permissões.", cor: "border-amber-300/30 bg-amber-300/[0.08] text-amber-200" },
  { valor: "rh_lider", nome: "Líder RH", descricao: "Visão gerencial do RH de todas as lojas.", cor: "border-sky-400/30 bg-sky-400/[0.08] text-sky-200" },
  { valor: "rh_caixa", nome: "Caixa Líder", descricao: "Somente o Meu Dia da própria loja.", cor: "border-violet-400/30 bg-violet-400/[0.08] text-violet-200" },
  { valor: "compras", nome: "Compras", descricao: "Somente o módulo de Compras (pneus, peças, insumos e manutenção).", cor: "border-emerald-400/30 bg-emerald-400/[0.08] text-emerald-200" },
  { valor: "pneus_leitura", nome: "Pneus (somente visualizar)", descricao: "Só vê planejamentos, cotações, pedidos e histórico de pneus das 6 lojas. Não altera nada.", cor: "border-sky-400/30 bg-sky-400/[0.08] text-sky-200" },
  { valor: "estoque", nome: "Estoque (loja)", descricao: "Estoquista: faz a conferência diária do estoque da própria loja.", cor: "border-orange-400/30 bg-orange-400/[0.08] text-orange-200" },
  { valor: "estoque_supervisor", nome: "Supervisor de estoque", descricao: "Painel das 6 lojas: vê as conferências, fotos e diferenças, e trata cada uma.", cor: "border-orange-300/40 bg-orange-300/[0.10] text-orange-100" },
  { valor: "financeiro", nome: "Financeiro", descricao: "Perfil financeiro.", cor: "border-white/15 bg-white/[0.05] text-gray-300" },
];

function perfilDoUsuario(user: UserItem): PerfilAcesso {
  if (user.role === "rh") {
    return Number(user.lojaId || 0) > 0 ? "rh_caixa" : "rh_lider";
  }

  if (
    user.role === "admin" ||
    user.role === "gestor" ||
    user.role === "compras" ||
    user.role === "financeiro" ||
    user.role === "pneus_leitura" ||
    user.role === "estoque" ||
    user.role === "estoque_supervisor"
  ) {
    return user.role;
  }

  return "gestor";
}

function roleBackendDoPerfil(perfil: PerfilAcesso): RoleBackend {
  if (perfil === "rh_lider" || perfil === "rh_caixa") return "rh";
  return perfil;
}

function iniciais(nome: string | null, email: string | null) {
  const base = String(nome || email || "?").trim();
  const partes = base.split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] || "") + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase() || "?";
}

function ultimoAcesso(valor: Date | string | null | undefined) {
  if (!valor) return "Nunca acessou";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "—";
  return `Último acesso ${data.toLocaleDateString("pt-BR")} às ${data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

const campo =
  "h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-[#D4AF37]/50";
const rotulo = "mb-1.5 block text-[10px] font-black uppercase tracking-[0.1em] text-gray-500";

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
  const [messageErro, setMessageErro] = useState(false);
  const [busca, setBusca] = useState("");
  const [filtroPerfil, setFiltroPerfil] = useState<"todos" | PerfilAcesso>("todos");
  const [excluindo, setExcluindo] = useState<UserItem | null>(null);

  const usersQuery = trpc.auth.listUsers.useQuery(undefined, {
    retry: false,
  });

  const lojasQuery = trpc.lojas.list.useQuery(undefined, {
    retry: false,
  });

  function avisar(texto: string, erro = false) {
    setMessage(texto);
    setMessageErro(erro);
  }

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: (data: { message?: string }) => {
      avisar(data.message || "Usuário criado com sucesso");
      resetForm();
      usersQuery.refetch();
    },
    onError: (error: { message?: string }) => {
      avisar(error.message || "Erro ao criar usuário", true);
    },
  });

  const updateMutation = trpc.auth.updateUser.useMutation({
    onSuccess: (data: { message?: string }) => {
      avisar(data.message || "Usuário atualizado com sucesso");
      resetForm();
      usersQuery.refetch();
    },
    onError: (error: { message?: string }) => {
      avisar(error.message || "Erro ao atualizar usuário", true);
    },
  });

  const deleteMutation = trpc.auth.deleteUser.useMutation({
    onSuccess: (data: { message?: string }) => {
      avisar(data.message || "Usuário excluído com sucesso");
      setExcluindo(null);
      usersQuery.refetch();
    },
    onError: (error: { message?: string }) => {
      avisar(error.message || "Erro ao excluir usuário", true);
      setExcluindo(null);
    },
  });

  const salvando = registerMutation.isPending || updateMutation.isPending;

  const users = useMemo(() => {
    return (usersQuery.data || []) as UserItem[];
  }, [usersQuery.data]);

  const lojas = useMemo(() => {
    return (lojasQuery.data || []) as LojaItem[];
  }, [lojasQuery.data]);

  const usuariosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return users.filter((user) => {
      if (filtroPerfil !== "todos" && perfilDoUsuario(user) !== filtroPerfil) return false;
      if (!termo) return true;
      return `${user.name || ""} ${user.email || ""}`.toLowerCase().includes(termo);
    });
  }, [users, busca, filtroPerfil]);

  const ativos = users.filter((u) => u.isActive).length;
  const contagemPerfil = useMemo(() => {
    const m: Record<string, number> = {};
    for (const u of users) {
      const p = perfilDoUsuario(u);
      m[p] = (m[p] || 0) + 1;
    }
    return m;
  }, [users]);

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

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");

    if (perfil === "rh_caixa" && !lojaId) {
      avisar("Selecione a loja da Caixa Líder.", true);
      return;
    }
    if (perfil === "estoque" && !lojaId) {
      avisar("Selecione a loja do estoquista.", true);
      return;
    }

    const role = roleBackendDoPerfil(perfil);
    const lojaIdBackend = perfil === "rh_caixa" || perfil === "estoque" ? Number(lojaId) : null;

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

  const perfilSelecionado = PERFIS.find((p) => p.valor === perfil);

  return (
    <main className="min-h-screen bg-[#050505] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(212,175,55,0.08),transparent_40%)]" />

      <div className="relative mx-auto max-w-7xl">
        <button
          type="button"
          onClick={() => setLocation("/")}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#D4AF37]/25 bg-[#D4AF37]/[0.04] px-4 text-xs font-black text-[#F2D675] transition hover:bg-[#D4AF37]/10"
        >
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </button>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-[#D4AF37]/70">
              <ShieldCheck className="h-4 w-4" />
              Administração
            </p>
            <h1 className="mt-2 text-3xl font-black sm:text-4xl">Usuários e acessos</h1>
            <p className="mt-2 text-sm text-gray-500">Cadastre logins e defina exatamente qual área cada pessoa pode acessar.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="rounded-2xl border border-white/[0.08] bg-[#0b0b0b] px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.1em] text-gray-600">Usuários</p>
              <p className="mt-1 text-2xl font-black text-white">{users.length}</p>
            </div>
            <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.03] px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.1em] text-gray-600">Ativos</p>
              <p className="mt-1 text-2xl font-black text-emerald-300">{ativos}</p>
            </div>
            <div className="rounded-2xl border border-rose-400/15 bg-rose-400/[0.03] px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.1em] text-gray-600">Inativos</p>
              <p className="mt-1 text-2xl font-black text-rose-300">{users.length - ativos}</p>
            </div>
          </div>
        </div>

        {message && (
          <div className={`mt-6 flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${messageErro ? "border-rose-400/25 bg-rose-400/[0.05] text-rose-200" : "border-emerald-400/25 bg-emerald-400/[0.05] text-emerald-200"}`}>
            <span>{message}</span>
            <button type="button" onClick={() => setMessage("")} className="text-current opacity-60 hover:opacity-100"><X className="h-4 w-4" /></button>
          </div>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-[400px_1fr]">
          {/* ---------- Formulário ---------- */}
          <section className="h-fit rounded-3xl border border-[#D4AF37]/20 bg-[#0a0a0a] p-5 sm:p-6 lg:sticky lg:top-6">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#D4AF37]/25 bg-[#D4AF37]/[0.06]">
                {editingUserId ? <Pencil className="h-5 w-5 text-[#F2D675]" /> : <UserPlus className="h-5 w-5 text-[#F2D675]" />}
              </div>
              <div>
                <h2 className="text-lg font-black">{editingUserId ? "Editar usuário" : "Novo usuário"}</h2>
                <p className="text-xs text-gray-500">{editingUserId ? "Atualize os dados e o nível de acesso." : "Preencha os dados de acesso."}</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div>
                <label className={rotulo}>Nome</label>
                <input type="text" placeholder="Nome completo" value={name} onChange={(e) => setName(e.target.value)} className={campo} required />
              </div>

              <div>
                <label className={rotulo}>Email</label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-gray-600" />
                  <input type="email" placeholder="email@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} className={`${campo} pl-9`} required />
                </div>
              </div>

              <div>
                <label className={rotulo}>Senha {editingUserId ? "(deixe em branco para manter)" : ""}</label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-gray-600" />
                  <input type="password" placeholder={editingUserId ? "••••••" : "Mínimo 6 caracteres"} value={password} onChange={(e) => setPassword(e.target.value)} className={`${campo} pl-9`} required={!editingUserId} />
                </div>
              </div>

              <div>
                <label className={rotulo}>Perfil de acesso</label>
                <div className="grid grid-cols-2 gap-2">
                  {PERFIS.map((p) => (
                    <button
                      key={p.valor}
                      type="button"
                      onClick={() => {
                        setPerfil(p.valor);
                        if (p.valor !== "rh_caixa" && p.valor !== "estoque") setLojaId("");
                      }}
                      className={`flex h-10 items-center justify-between rounded-xl border px-3 text-xs font-black transition ${perfil === p.valor ? p.cor : "border-white/10 text-gray-500 hover:border-white/20 hover:text-gray-300"}`}
                    >
                      {p.nome}
                      {perfil === p.valor && <Check className="h-3.5 w-3.5" />}
                    </button>
                  ))}
                </div>
                {perfilSelecionado && <p className="mt-2 text-[11px] leading-5 text-gray-500">{perfilSelecionado.descricao}</p>}
              </div>

              {perfil === "estoque" && (
                <div>
                  <label className={rotulo}>Loja do estoquista</label>
                  <div className="relative">
                    <Store className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-gray-600" />
                    <select value={lojaId} onChange={(e) => setLojaId(e.target.value)} className={`${campo} pl-9`} required>
                      <option value="">Selecione a loja</option>
                      {EMPRESAS.map((e) => (
                        <option key={e.lojaId} value={String(e.lojaId)}>{e.loja}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {perfil === "rh_caixa" && (
                <div>
                  <label className={rotulo}>Loja da Caixa Líder</label>
                  <div className="relative">
                    <Store className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-gray-600" />
                    <select value={lojaId} onChange={(e) => setLojaId(e.target.value)} className={`${campo} pl-9`} required>
                      <option value="">Selecione a loja</option>
                      {lojas.map((loja) => (
                        <option key={loja.id} value={String(loja.id)}>
                          {loja.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {editingUserId && (
                <div>
                  <label className={rotulo}>Status</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setIsActive(true)} className={`h-10 rounded-xl border text-xs font-black ${isActive ? "border-emerald-400/30 bg-emerald-400/[0.08] text-emerald-200" : "border-white/10 text-gray-500"}`}>Ativo</button>
                    <button type="button" onClick={() => setIsActive(false)} className={`h-10 rounded-xl border text-xs font-black ${!isActive ? "border-rose-400/30 bg-rose-400/[0.08] text-rose-200" : "border-white/10 text-gray-500"}`}>Inativo</button>
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={salvando} className="h-11 flex-1 rounded-xl bg-[#D4AF37] text-sm font-black text-black transition hover:bg-[#e2bf4a] disabled:cursor-not-allowed disabled:opacity-60">
                  {salvando ? "Salvando..." : editingUserId ? "Salvar alterações" : "Criar usuário"}
                </button>
                {editingUserId && (
                  <button type="button" onClick={resetForm} className="h-11 rounded-xl border border-white/10 px-4 text-sm font-black text-gray-400 hover:text-white">
                    Cancelar
                  </button>
                )}
              </div>
            </form>
          </section>

          {/* ---------- Lista ---------- */}
          <section className="rounded-3xl border border-white/[0.08] bg-[#090909] p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-lg font-black">
                <Users className="h-5 w-5 text-[#D4AF37]" />
                Usuários cadastrados
              </h2>
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-gray-600" />
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou email" className="h-10 w-full rounded-xl border border-white/10 bg-black/40 pl-9 pr-3 text-sm text-white outline-none placeholder:text-gray-600 focus:border-[#D4AF37]/50" />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => setFiltroPerfil("todos")} className={`rounded-full border px-3 py-1 text-[11px] font-black ${filtroPerfil === "todos" ? "border-[#D4AF37]/40 bg-[#D4AF37]/[0.10] text-[#F2D675]" : "border-white/10 text-gray-500"}`}>
                Todos ({users.length})
              </button>
              {PERFIS.filter((p) => contagemPerfil[p.valor]).map((p) => (
                <button key={p.valor} type="button" onClick={() => setFiltroPerfil(p.valor)} className={`rounded-full border px-3 py-1 text-[11px] font-black ${filtroPerfil === p.valor ? p.cor : "border-white/10 text-gray-500"}`}>
                  {p.nome} ({contagemPerfil[p.valor]})
                </button>
              ))}
            </div>

            {usersQuery.isLoading && <p className="mt-6 text-sm text-gray-500">Carregando usuários...</p>}

            {usersQuery.error && (
              <div className="mt-4 rounded-xl border border-rose-400/25 bg-rose-400/[0.05] px-4 py-3 text-sm text-rose-200">{usersQuery.error.message}</div>
            )}

            {!usersQuery.isLoading && usuariosFiltrados.length === 0 && (
              <div className="mt-6 rounded-2xl border border-white/[0.06] p-8 text-center text-sm text-gray-500">
                {users.length === 0 ? "Nenhum usuário cadastrado." : "Nenhum usuário encontrado com esse filtro."}
              </div>
            )}

            <div className="mt-4 space-y-2">
              {usuariosFiltrados.map((user) => {
                const loja = lojas.find((item) => Number(item.id) === Number(user.lojaId));
                const p = PERFIS.find((x) => x.valor === perfilDoUsuario(user));
                const emEdicao = editingUserId === user.id;

                return (
                  <div
                    key={user.id}
                    className={`flex flex-wrap items-center gap-4 rounded-2xl border px-4 py-3 transition ${emEdicao ? "border-[#D4AF37]/45 bg-[#D4AF37]/[0.05]" : "border-white/[0.07] bg-[#0c0c0c] hover:border-white/15"} ${user.isActive ? "" : "opacity-60"}`}
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#D4AF37]/25 bg-[#D4AF37]/[0.08] text-sm font-black text-[#F2D675]">
                      {iniciais(user.name, user.email)}
                    </div>

                    <div className="min-w-[200px] flex-1">
                      <p className="font-black text-white">{user.name || "Sem nome"}</p>
                      <p className="truncate text-xs text-gray-500">{user.email || "Sem email"}</p>
                      <p className="mt-0.5 text-[10px] text-gray-600">{ultimoAcesso(user.lastSignedIn)}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.04em] ${p?.cor || "border-white/10 text-gray-400"}`}>{p?.nome || user.role}</span>
                      {(user.role === "rh" || user.role === "estoque") && Number(user.lojaId || 0) > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-black text-gray-300">
                          <Store className="h-3 w-3" />
                          {loja?.nome || empresaDaLoja(user.lojaId)?.loja || `Loja ${user.lojaId}`}
                        </span>
                      )}
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${user.isActive ? "bg-emerald-400/[0.10] text-emerald-300" : "bg-rose-400/[0.10] text-rose-300"}`}>
                        {user.isActive ? "Ativo" : "Inativo"}
                      </span>
                    </div>

                    <div className="flex gap-1.5">
                      <button type="button" onClick={() => handleEdit(user)} title="Editar" className="flex h-9 items-center gap-1.5 rounded-xl border border-[#D4AF37]/25 px-3 text-xs font-black text-[#F2D675] transition hover:bg-[#D4AF37]/10">
                        <Pencil className="h-3.5 w-3.5" />
                        Editar
                      </button>
                      <button type="button" onClick={() => { setMessage(""); setExcluindo(user); }} title="Excluir" className="flex h-9 w-9 items-center justify-center rounded-xl border border-rose-400/25 text-rose-300 transition hover:bg-rose-400/10">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>

      {excluindo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-md rounded-3xl border border-rose-500/20 bg-[#0a0a0a] p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-rose-300/70">Excluir usuário</p>
                <p className="mt-2 text-sm font-bold text-white">
                  Tem certeza que deseja excluir {excluindo.name || excluindo.email || `o usuário ${excluindo.id}`}?
                </p>
                <p className="mt-1 text-xs text-gray-500">Para só bloquear o acesso sem apagar, edite e marque como Inativo.</p>
              </div>
              <button type="button" onClick={() => setExcluindo(null)} className="rounded-xl border border-white/10 p-2 text-gray-500"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setExcluindo(null)} className="h-10 rounded-xl border border-white/10 px-4 text-xs font-black text-gray-400">Cancelar</button>
              <button type="button" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate({ id: excluindo.id })} className="h-10 rounded-xl border border-rose-500/30 bg-rose-500/[0.12] px-4 text-xs font-black text-rose-200 disabled:opacity-50">
                <Trash2 className="mr-2 inline h-4 w-4" />
                {deleteMutation.isPending ? "Excluindo..." : "Excluir"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
