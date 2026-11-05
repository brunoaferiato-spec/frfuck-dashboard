import { useAuth } from "@/_core/hooks/useAuth";
import { ArrowLeft, BellRing, Boxes, Car, CircleDot, Hammer, LogOut, ShieldCheck, ShoppingCart, Store, Wrench } from "lucide-react";
import { MobileTabBar, type ItemTab } from "@/components/MobileTabBar";
import { trpc } from "@/lib/trpc";
import { ReactNode } from "react";
import { useLocation } from "wouter";

const itens = [
  { label: "Pneus", rota: "/compras/pneus", icon: CircleDot },
  { label: "Peças", rota: "/compras/pecas", icon: Wrench },
  { label: "Amortecedores", curto: "Amortec.", rota: "/compras/amortecedores", icon: Car },
  { label: "Garantias", rota: "/compras/garantias", icon: ShieldCheck },
  { label: "Insumos de estoque", rota: "/compras/insumos/estoque", icon: Boxes },
  { label: "Insumos de loja", rota: "/compras/insumos/loja", icon: Store },
  { label: "Manutenção", rota: "/compras/manutencao", icon: Hammer },
];

// Aviso das garantias de pneu em todas as telas de Compras, até cada garantia ser finalizada.
function AvisoGarantias({ onAbrir }: { onAbrir: () => void }) {
  const avisosQ = trpc.compras.garantias.avisos.useQuery(undefined, { refetchInterval: 5 * 60 * 1000, retry: false });
  const a = avisosQ.data;
  if (!a || !a.total) return null;
  const urgente = a.vencidas > 0;
  const partes = [
    a.vencidas ? `${a.vencidas} com prazo vencido (pneu novo ou reembolso)` : "",
    a.venceLogo ? `${a.venceLogo} vence(m) em até 7 dias` : "",
    a.cobrar ? `${a.cobrar} para cobrar o fornecedor` : "",
    a.naoEnviadas ? `${a.naoEnviadas} ainda não enviada(s)` : "",
    a.avisarCliente ? `${a.avisarCliente} com laudo: avisar o cliente` : "",
    a.guardaVencida ? `${a.guardaVencida} com 60 dias de guarda vencidos` : "",
  ].filter(Boolean);
  return (
    <button
      type="button"
      onClick={onAbrir}
      className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2.5 text-left text-xs font-bold ${
        urgente ? "border-rose-400/30 bg-rose-500/[0.10] text-rose-100" : partes.length ? "border-amber-400/25 bg-amber-400/[0.07] text-amber-100" : "border-white/[0.06] bg-white/[0.02] text-gray-400"
      }`}
    >
      <BellRing className="h-4 w-4 shrink-0" />
      <span className="font-black">Garantias: {a.total} em andamento</span>
      {partes.map((p) => <span key={p}>• {p}</span>)}
      <span className="ml-auto underline">Ver garantias</span>
    </button>
  );
}

export default function ComprasShell({ children }: { children: ReactNode }) {
  const { logout, user } = useAuth();
  // Perfil Compras não tem dashboard principal: só o módulo de Compras.
  const somenteCompras = ["compras", "pneus_leitura"].includes(String(user?.role || ""));
  // Perfil de visualização de pneus: menu só com Pneus e sem avisos de outras áreas.
  const somentePneus = String(user?.role || "") === "pneus_leitura";
  const itensMenu = somentePneus ? itens.filter((i) => i.rota === "/compras/pneus") : itens;
  const [location, navigate] = useLocation();

  async function sair() {
    await logout();
    navigate("/");
  }

  function navegar(rota: string) {
    navigate(rota);
  }

  const rotaAtiva = (rota: string) =>
    location === rota || (rota === "/compras/insumos/estoque" && location === "/compras/insumos");

  // Celular: os módulos de Compras ficam na barra inferior; o resto em "Mais".
  const itensTab: ItemTab[] = [
    ...itensMenu.map((item) => ({
      label: (item as { curto?: string }).curto || item.label,
      icon: item.icon,
      ativo: rotaAtiva(item.rota),
      onClick: () => navegar(item.rota),
    })),
    ...(!somenteCompras ? [{ label: "Dashboard principal", icon: ArrowLeft, onClick: () => navegar("/") }] : []),
    { label: "Sair", icon: LogOut, destaque: "perigo" as const, onClick: () => void sair() },
  ];

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
        {itensMenu.map((item) => {
          const Icon = item.icon;
          const ativo = rotaAtiva(item.rota);
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
        {!somenteCompras && (
          <button
            type="button"
            onClick={() => navegar("/")}
            className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3.5 text-left text-sm font-bold text-[#F2D675] transition hover:bg-[#D4AF37]/10"
          >
            <ArrowLeft className="h-5 w-5" />
            Dashboard principal
          </button>
        )}

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

      <div className="min-h-0 min-w-0 flex-1 overflow-auto">
        <header className="sticky top-0 z-40 flex min-h-14 items-center gap-3 border-b border-[#D4AF37]/15 bg-[#080808]/90 px-4 pb-2.5 pt-[calc(10px+env(safe-area-inset-top))] backdrop-blur-xl md:hidden">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/[0.06]">
            <ShoppingCart className="h-[18px] w-[18px] text-[#F2D675]" />
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#D4AF37]/60">
              Compras
            </p>
            <p className="truncate text-base font-black leading-tight text-white">
              {itens.find((item) => rotaAtiva(item.rota))?.label || "Compras"}
            </p>
          </div>
        </header>
        {location !== "/compras/garantias" && !somentePneus && <AvisoGarantias onAbrir={() => navigate("/compras/garantias")} />}
        {children}
        <MobileTabBar itens={itensTab} />
      </div>
    </div>
  );
}
