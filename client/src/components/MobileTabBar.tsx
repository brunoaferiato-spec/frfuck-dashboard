import { useAuth } from "@/_core/hooks/useAuth";
import {
  Boxes,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  ShieldCheck,
  ShoppingCart,
  UserCog,
  WalletCards,
  X,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

export type ItemTab = {
  label: string;
  icon: LucideIcon;
  ativo?: boolean;
  destaque?: "perigo";
  onClick: () => void;
};

// Barra fixa no rodapé do celular, no estilo de aplicativo.
// Mostra até 4 atalhos; o restante fica no botão "Mais", que abre uma folha inferior.
export function MobileTabBar({
  itens,
  ocultarAPartirDe = "md",
}: {
  itens: ItemTab[];
  ocultarAPartirDe?: "md" | "xl";
}) {
  const [maisAberto, setMaisAberto] = useState(false);
  const principais = itens.slice(0, 4);
  const extras = itens.slice(4);
  const extraAtivo = extras.some((item) => item.ativo);
  const ocultar = ocultarAPartirDe === "xl" ? "xl:hidden" : "md:hidden";

  function tocar(item: ItemTab) {
    setMaisAberto(false);
    item.onClick();
  }

  return (
    <>
      {/* Espaço para o conteúdo não ficar escondido atrás da barra. */}
      <div aria-hidden className={`h-[calc(72px+env(safe-area-inset-bottom))] ${ocultar}`} />

      <nav
        className={`fixed inset-x-0 bottom-0 z-[80] border-t border-[#D4AF37]/15 bg-[#070707]/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_40px_rgba(0,0,0,0.55)] backdrop-blur-xl ${ocultar}`}
      >
        <div className="mx-auto flex max-w-xl items-stretch justify-around px-1">
          {principais.map((item) => (
            <BotaoTab key={item.label} item={item} onClick={() => tocar(item)} />
          ))}
          {extras.length > 0 && (
            <BotaoTab
              item={{ label: "Mais", icon: MoreHorizontal, ativo: extraAtivo || maisAberto, onClick: () => undefined }}
              onClick={() => setMaisAberto((aberto) => !aberto)}
            />
          )}
        </div>
      </nav>

      {maisAberto && (
        <div className={`fixed inset-0 z-[85] ${ocultar}`}>
          <button
            type="button"
            aria-label="Fechar"
            className="absolute inset-0 h-full w-full bg-black/70 backdrop-blur-[2px]"
            onClick={() => setMaisAberto(false)}
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-[#D4AF37]/20 bg-[#0b0b0b] px-4 pb-[calc(88px+env(safe-area-inset-bottom))] pt-3 shadow-2xl">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/15" />
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#D4AF37]/70">Mais opções</p>
              <button
                type="button"
                aria-label="Fechar"
                onClick={() => setMaisAberto(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.05] text-gray-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              {extras.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    type="button"
                    key={item.label}
                    onClick={() => tocar(item)}
                    className={`flex min-h-[52px] items-center gap-3 rounded-2xl px-4 text-left text-[15px] font-bold transition active:scale-[0.98] ${
                      item.ativo
                        ? "bg-[#D4AF37] text-black"
                        : item.destaque === "perigo"
                        ? "bg-white/[0.03] text-rose-300"
                        : "bg-white/[0.03] text-gray-200"
                    }`}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function BotaoTab({ item, onClick }: { item: ItemTab; onClick: () => void }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[60px] min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 text-[10.5px] font-bold transition active:scale-95 ${
        item.ativo ? "text-[#F2D675]" : "text-gray-500"
      }`}
    >
      <span
        className={`flex h-8 w-14 items-center justify-center rounded-full transition ${
          item.ativo ? "bg-[#D4AF37]/15" : ""
        }`}
      >
        <Icon className="h-[21px] w-[21px]" />
      </span>
      <span className="max-w-full truncate">{item.label}</span>
    </button>
  );
}

// Atalhos dos módulos principais (Início, Folha, Compras, RH...), conforme o perfil.
export function useItensModulos(): ItemTab[] {
  const { user, logout } = useAuth();
  const [location, navigate] = useLocation();
  const role = String(user?.role || "");
  const gestao = ["admin", "gestor"].includes(role);

  const itens: (ItemTab & { visivel: boolean })[] = [
    { label: "Início", icon: LayoutDashboard, visivel: true, ativo: location === "/", onClick: () => navigate("/") },
    { label: "Folha", icon: WalletCards, visivel: role !== "compras", ativo: location.startsWith("/folha"), onClick: () => navigate("/folha-pagamento") },
    {
      label: "Compras",
      icon: ShoppingCart,
      visivel: ["compras", "admin", "gestor"].includes(role),
      ativo: location.startsWith("/compras"),
      onClick: () => navigate("/compras/pecas"),
    },
    { label: "RH", icon: ShieldCheck, visivel: gestao, ativo: location.startsWith("/rh"), onClick: () => navigate("/rh/gestao") },
    { label: "Estoque", icon: Boxes, visivel: gestao, ativo: location.startsWith("/estoque"), onClick: () => navigate("/estoque/painel") },
    { label: "Usuários", icon: UserCog, visivel: gestao, ativo: location === "/usuarios", onClick: () => navigate("/usuarios") },
    {
      label: "Sair",
      icon: LogOut,
      visivel: true,
      destaque: "perigo",
      onClick: () => {
        void logout().then(() => navigate("/"));
      },
    },
  ];

  return itens.filter((item) => item.visivel);
}
