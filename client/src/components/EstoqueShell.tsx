import { useAuth } from "@/_core/hooks/useAuth";
import { ArrowLeft, BarChart3, CalendarDays, CalendarRange, ClipboardCheck, LayoutGrid, LogOut, ShoppingCart, Warehouse, type LucideIcon } from "lucide-react";
import { ReactNode } from "react";
import { useLocation } from "wouter";

// Módulo de Estoque. Computador: menu lateral com "Contagens" (o que o estoquista envia) e "Painéis" (supervisor).
// Celular: cabeçalho fino em cima e barra de abas embaixo, como aplicativo.

type Item = { label: string; curto: string; rota: string; icon: LucideIcon };

const CONTAGENS: Item[] = [
  { label: "Contagem diária", curto: "Diária", rota: "/estoque", icon: ClipboardCheck },
  { label: "Compras x OS", curto: "Compras x OS", rota: "/estoque/compras-os", icon: ShoppingCart },
  { label: "Contagem semanal", curto: "Semanal", rota: "/estoque/semanal", icon: CalendarDays },
];
const PAINEIS: Item[] = [
  { label: "Contagem diária", curto: "Diária", rota: "/estoque/painel", icon: LayoutGrid },
  { label: "Compras x OS", curto: "Compras x OS", rota: "/estoque/painel/compras-os", icon: BarChart3 },
  { label: "Contagem semanal", curto: "Semanal", rota: "/estoque/painel/semanal", icon: CalendarRange },
];

export default function EstoqueShell({ children }: { children: ReactNode }) {
  const { logout, user } = useAuth();
  const role = String(user?.role || "");
  const [location, navigate] = useLocation();
  const supervisor = ["estoque_supervisor", "admin", "gestor"].includes(role);
  const voltaDashboard = ["admin", "gestor"].includes(role);
  const noPainel = location.startsWith("/estoque/painel");
  const abas = supervisor && noPainel ? PAINEIS : CONTAGENS;

  async function sair() {
    await logout();
    navigate("/");
  }

  function Secao({ titulo, itens }: { titulo: string; itens: Item[] }) {
    return (
      <div>
        <p className="px-3 pb-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#D4AF37]/55">{titulo}</p>
        <div className="space-y-1">
          {itens.map((i) => {
            const ativo = location === i.rota;
            return (
              <button key={i.rota} type="button" onClick={() => navigate(i.rota)}
                className={`group flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-bold transition ${ativo ? "bg-[#D4AF37] text-black shadow-[0_8px_24px_-12px_rgba(212,175,55,0.8)]" : "text-gray-400 hover:bg-white/[0.04] hover:text-white"}`}>
                <i.icon className={`h-[18px] w-[18px] ${ativo ? "" : "text-gray-500 group-hover:text-[#F2D675]"}`} />{i.label}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#050505] text-white lg:flex">
      {/* Menu lateral (computador) */}
      <aside className="sticky top-0 hidden h-[100dvh] w-64 shrink-0 flex-col border-r border-white/[0.06] bg-[#080808] p-4 lg:flex">
        <div className="flex items-center gap-3 px-1">
          <div className="rounded-2xl border border-[#D4AF37]/25 bg-gradient-to-br from-[#D4AF37]/20 to-transparent p-2.5"><Warehouse className="h-5 w-5 text-[#F2D675]" /></div>
          <div className="min-w-0">
            <p className="text-sm font-black tracking-wide">Estoque</p>
            <p className="truncate text-xs text-gray-500">{user?.name}</p>
          </div>
        </div>
        <nav className="mt-8 space-y-7">
          <Secao titulo="Contagens" itens={CONTAGENS} />
          {supervisor && <Secao titulo="Painéis das lojas" itens={PAINEIS} />}
        </nav>
        <div className="mt-auto space-y-1 border-t border-white/[0.06] pt-3">
          {voltaDashboard && (
            <button type="button" onClick={() => navigate("/")} className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-bold text-[#F2D675] hover:bg-[#D4AF37]/10">
              <ArrowLeft className="h-4 w-4" />Voltar ao dashboard
            </button>
          )}
          <button type="button" onClick={() => void sair()} className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-bold text-gray-500 hover:bg-rose-400/[0.07] hover:text-rose-300">
            <LogOut className="h-4 w-4" />Sair
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Cabeçalho (celular) */}
        <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#080808]/90 backdrop-blur-xl lg:hidden">
          <div className="flex items-center gap-2 px-3 py-2.5">
            <div className="rounded-xl border border-[#D4AF37]/25 bg-[#D4AF37]/[0.08] p-2"><Warehouse className="h-4 w-4 text-[#F2D675]" /></div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black leading-4">Estoque</p>
              <p className="truncate text-[11px] text-gray-500">{user?.name}</p>
            </div>
            {supervisor && (
              <div className="flex rounded-xl border border-white/10 bg-black/40 p-0.5 text-xs font-black">
                <button type="button" onClick={() => navigate("/estoque")} className={`rounded-lg px-2.5 py-1.5 ${!noPainel ? "bg-[#D4AF37] text-black" : "text-gray-400"}`}>Contagens</button>
                <button type="button" onClick={() => navigate("/estoque/painel")} className={`rounded-lg px-2.5 py-1.5 ${noPainel ? "bg-[#D4AF37] text-black" : "text-gray-400"}`}>Painéis</button>
              </div>
            )}
            {voltaDashboard && (
              <button type="button" onClick={() => navigate("/")} aria-label="Dashboard" className="rounded-xl p-2 text-[#F2D675] hover:bg-[#D4AF37]/10"><ArrowLeft className="h-5 w-5" /></button>
            )}
            <button type="button" onClick={() => void sair()} aria-label="Sair" className="rounded-xl p-2 text-gray-500 hover:text-rose-300"><LogOut className="h-5 w-5" /></button>
          </div>
        </header>

        <div className="pb-24 lg:pb-0">{children}</div>

        {/* Abas embaixo (celular) */}
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08] bg-[#080808]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
          <div className="mx-auto grid max-w-md grid-cols-3">
            {abas.map((i) => {
              const ativo = location === i.rota;
              return (
                <button key={i.rota} type="button" onClick={() => navigate(i.rota)} className="flex h-16 flex-col items-center justify-center gap-1">
                  <span className={`flex h-8 w-14 items-center justify-center rounded-full transition ${ativo ? "bg-[#D4AF37] text-black" : "text-gray-500"}`}><i.icon className="h-5 w-5" /></span>
                  <span className={`text-[11px] font-bold ${ativo ? "text-[#F2D675]" : "text-gray-500"}`}>{i.curto}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
