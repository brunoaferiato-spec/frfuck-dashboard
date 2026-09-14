import type { ReactNode } from "react";
import { useLocation } from "wouter";
import {
  Archive,
  ArrowLeft,
  BriefcaseBusiness,
  CalendarDays,
  ClipboardCheck,
  FileWarning,
  HardHat,
  LayoutDashboard,
  LogOut,
  Users,
  WalletCards,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";

function formatarDataCabecalho() {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());
}

export default function RHGestaoShell({ children }: { children: ReactNode }) {
  const { logout } = useAuth();
  const [location, navigate] = useLocation();

  const menu = [
    { label: "Visão Geral", icon: LayoutDashboard, rota: "/rh/gestao", exact: true },
    { label: "Ponto", icon: ClipboardCheck, rota: "/rh/gestao/detalhes" },
    { label: "Caixa", icon: WalletCards, rota: "/rh/caixa" },
    { label: "Documentos", icon: Archive, rota: "/rh/documentos" },
    { label: "EPIs", icon: HardHat, rota: "/rh/epis" },
    { label: "Férias", icon: CalendarDays, rota: "/rh/ferias" },
    { label: "Experiência", icon: BriefcaseBusiness, rota: "/rh/experiencia" },
    { label: "Rescisões", icon: FileWarning, rota: "/rh/rescisoes" },
    { label: "Funcionários", icon: Users, rota: "/rh/funcionarios" },
  ];

  function itemAtivo(item: (typeof menu)[number]) {
    if (item.exact) return location === item.rota;
    return location === item.rota || location.startsWith(`${item.rota}/`);
  }

  async function sair() {
    await logout();
    navigate("/");
  }

  return (
    <div className="flex h-[100dvh] min-h-0 overflow-hidden bg-[#050505] text-white">
      <aside className="flex h-full w-[205px] shrink-0 flex-col border-r border-[#D4AF37]/15 bg-[#080808]">
        <div className="shrink-0 border-b border-white/[0.06] px-4 py-4">
          <p className="text-[9px] font-black uppercase tracking-[0.25em] text-gray-600">
            Liderança de RH
          </p>
          <h1 className="mt-1 text-xl font-black text-[#F2D675]">Gestão RH</h1>
          <p className="mt-1 text-[10px] capitalize text-gray-600">
            {formatarDataCabecalho()}
          </p>
        </div>

        <nav className="min-h-0 flex-1 space-y-1 px-2 py-3">
          {menu.map((item) => {
            const Icon = item.icon;
            const ativo = itemAtivo(item);

            return (
              <button
                type="button"
                key={item.label}
                onClick={() => navigate(item.rota)}
                className={`flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-left text-xs font-bold transition ${
                  ativo
                    ? "bg-[#D4AF37] text-black"
                    : "text-gray-400 hover:bg-white/[0.05] hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="shrink-0 space-y-1 border-t border-white/[0.06] p-2">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-left text-xs font-bold text-[#F2D675] transition hover:bg-[#D4AF37]/10"
          >
            <ArrowLeft className="h-4 w-4" />
            Dashboard principal
          </button>

          <button
            type="button"
            onClick={sair}
            className="flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-left text-xs font-bold text-gray-500 transition hover:bg-rose-400/[0.07] hover:text-rose-300"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </aside>

      <div className="min-h-0 min-w-0 flex-1 overflow-auto bg-[#050505]">
        {children}
      </div>
    </div>
  );
}
