import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

// Botão flutuante para escolher modo claro ou escuro, em todas as telas.
// No celular fica acima da barra de navegação de baixo.
export default function BotaoTema() {
  const { theme, toggleTheme } = useTheme();
  if (!toggleTheme) return null;

  const escuro = theme === "dark";
  const rotulo = escuro ? "Mudar para modo claro" : "Mudar para modo escuro";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={rotulo}
      title={rotulo}
      className="fixed left-3 bottom-[calc(84px+env(safe-area-inset-bottom))] z-[79] flex h-10 w-10 items-center justify-center rounded-full border border-fr-d4af37/30 bg-fr-0b0b0b/90 text-fri-f2d675 shadow-lg backdrop-blur transition hover:border-fr-d4af37/60 hover:scale-105 xl:bottom-4 print:hidden"
    >
      {escuro ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
