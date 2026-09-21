import { useAuth } from "@/_core/hooks/useAuth";
import { ArrowLeft, Boxes, CircleDot, LogOut, Menu, Package, ShoppingCart, Wrench, X } from "lucide-react";
import { ReactNode, useState } from "react";
import { useLocation } from "wouter";

const itens = [
  { label: "Pneus", rota: "/compras/pneus", icon: CircleDot },
  { label: "Peças", rota: "/compras/pecas", icon: Wrench },
  { label: "Insumos", rota: "/compras/insumos", icon: Boxes },
];

export default function ComprasShell({ children }: { children: ReactNode }) {
  const { logout } = useAuth();
  const [location, navigate] = useLocation();
  const [menuAberto, setMenuAberto] = useState(false);

  async function sair() {
    await logout();
    navigate("/");
  }

  function navegar(rota: string) {
    setMenuAberto(false);
    navigate(rota);
  }

  const menu = (
    <>
      <div className="border-b border-[#D4AF37]/15 px-4 py-5">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/[0.06] p-2.5">
            <ShoppingCart className="h-5 w-5 text-[#F2D675]" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#D4AF37]/60">
              COMPRAS
            </p>
            <p className="mt-1 text-xs text-gray-600">Gestão de abastecimento</p>
          </div>
        </div>
      </div>

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {itens.map((item) => {
          const Icon = item.icon;
          const ativo = location === item.rota;
          return (
            <button
              type="button"
              key={item.rota}
              onClick={() => navegar(item.rota)}
              className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3.5 text-left text-sm font-bold transition ${
                ativo
                  ? "bg-[#D4AF37] text-black"
                  : "text-gray-300 hover:bg-white/[0.05] hover:text-white"
              }`}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="space-y-1 border-t border-white/[0.06] p-3">
        <button
          type="button"
          onClick={() => navegar("/")}
          className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3.5 text-left text-sm font-bold text-[#F2D675] transition hover:bg-[#D4AF37]/10"
        >
          <ArrowLeft className="h-5 w-5" />
          Dashboard principal
        </button>

        <button
          type="button"
          onClick={() => void sair()}
          className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3.5 text-left text-sm font-bold text-gray-500 transition hover:bg-rose-400/[0.07] hover:text-rose-300"
        >
          <LogOut className="h-5 w-5" />
          Sair
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-[100dvh] min-h-0 overflow-hidden bg-[#050505] text-white">
      <aside className="hidden h-full w-[220px] shrink-0 flex-col border-r border-[#D4AF37]/15 bg-[#080808] md:flex">
        {menu}
      </aside>

      {menuAberto && (
        <div className="fixed inset-0 z-[90] md:hidden">
          <button
            type="button"
            aria-label="Fechar menu"
            className="absolute inset-0 h-full w-full bg-black/75"
            onClick={() => setMenuAberto(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-[84vw] max-w-[320px] flex-col border-r border-[#D4AF37]/20 bg-[#080808] shadow-2xl">
            <button
              type="button"
              aria-label="Fechar menu"
              onClick={() => setMenuAberto(false)}
              className="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-gray-300"
            >
              <X className="h-5 w-5" />
            </button>
            {menu}
          </aside>
        </div>
      )}

      <div className="min-h-0 min-w-0 flex-1 overflow-auto">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-[#D4AF37]/15 bg-[#080808]/95 px-3 backdrop-blur md:hidden">
          <button
            type="button"
            onClick={() => setMenuAberto(true)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/[0.05] text-[#F2D675]"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#D4AF37]/60">
              Compras
            </p>
            <p className="text-sm font-black text-white">
              {itens.find((item) => item.rota === location)?.label || "Compras"}
            </p>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
