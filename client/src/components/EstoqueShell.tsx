import { useAuth } from "@/_core/hooks/useAuth";
import { ArrowLeft, ClipboardCheck, LayoutGrid, LogOut, Warehouse } from "lucide-react";
import { ReactNode } from "react";
import { useLocation } from "wouter";

// Módulo de Estoque: conferência diária (estoquista de cada loja) e painel do supervisor.
export default function EstoqueShell({ children }: { children: ReactNode }) {
  const { logout, user } = useAuth();
  const role = String(user?.role || "");
  const [location, navigate] = useLocation();
  const supervisor = ["estoque_supervisor", "admin", "gestor"].includes(role);
  const itens = [
    { label: "Conferência", rota: "/estoque", icon: ClipboardCheck },
    ...(supervisor ? [{ label: "Painel das lojas", rota: "/estoque/painel", icon: LayoutGrid }] : []),
  ];

  async function sair() {
    await logout();
    navigate("/");
  }

  return (
    <div className="min-h-[100dvh] bg-[#050505] text-white">
      <header className="sticky top-0 z-40 border-b border-[#D4AF37]/15 bg-[#080808]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-2.5 sm:px-6">
          <div className="flex items-center gap-2 pr-2">
            <div className="rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/[0.06] p-2"><Warehouse className="h-5 w-5 text-[#F2D675]" /></div>
            <div className="hidden sm:block">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#D4AF37]/60">Estoque</p>
              <p className="text-xs text-gray-500">{user?.name}</p>
            </div>
          </div>
          <nav className="flex flex-1 gap-1 overflow-x-auto">
            {itens.map((i) => {
              const ativo = location === i.rota;
              return (
                <button key={i.rota} type="button" onClick={() => navigate(i.rota)}
                  className={`flex h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-bold ${ativo ? "bg-[#D4AF37] text-black" : "text-gray-300 hover:bg-white/[0.05]"}`}>
                  <i.icon className="h-4 w-4" />{i.label}
                </button>
              );
            })}
          </nav>
          {["admin", "gestor"].includes(role) && (
            <button type="button" onClick={() => navigate("/")} className="hidden h-10 items-center gap-2 rounded-xl px-3 text-sm font-bold text-[#F2D675] hover:bg-[#D4AF37]/10 sm:flex">
              <ArrowLeft className="h-4 w-4" />Dashboard
            </button>
          )}
          <button type="button" onClick={() => void sair()} className="flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-bold text-gray-500 hover:bg-rose-400/[0.07] hover:text-rose-300">
            <LogOut className="h-4 w-4" /><span className="hidden sm:inline">Sair</span>
          </button>
        </div>
      </header>
      {children}
    </div>
  );
}
