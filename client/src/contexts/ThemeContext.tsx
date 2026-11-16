import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  toggleTheme?: () => void;
  switchable: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  switchable?: boolean;
}

// Escolha do usuário fica salva neste navegador (o index.html lê a mesma chave
// antes do React carregar, para não piscar o tema errado).
const CHAVE_TEMA = "theme";

function lerTemaSalvo(): Theme | null {
  try {
    const salvo = localStorage.getItem(CHAVE_TEMA);
    return salvo === "light" || salvo === "dark" ? salvo : null;
  } catch {
    return null;
  }
}

export function ThemeProvider({
  children,
  defaultTheme = "light",
  switchable = false,
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() =>
    switchable ? lerTemaSalvo() || defaultTheme : defaultTheme
  );

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.classList.toggle("light", theme === "light");

    // Cor da barra do navegador/celular e controles nativos acompanham o tema.
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#050505" : "#f3f1ec");
    document
      .querySelector('meta[name="color-scheme"]')
      ?.setAttribute("content", theme);

    if (switchable) {
      try {
        localStorage.setItem(CHAVE_TEMA, theme);
      } catch {
        // navegador sem armazenamento: o tema vale só nesta visita
      }
    }
  }, [theme, switchable]);

  const toggleTheme = switchable
    ? () => {
        setTheme(prev => (prev === "light" ? "dark" : "light"));
      }
    : undefined;

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, switchable }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
