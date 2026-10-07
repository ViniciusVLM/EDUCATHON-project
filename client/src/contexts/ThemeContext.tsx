/**
 * ThemeContext — alternador de tema claro/escuro.
 *
 * Ordem de prioridade na primeira visita:
 *   1. Valor salvo em localStorage ('educathon_theme')
 *   2. prefers-color-scheme do sistema operacional
 *   3. Padrão: 'light'
 *
 * O tema é aplicado como atributo data-theme no <html> para
 * não precisar re-renderizar a árvore inteira.
 *
 * O bloco de script inline em index.html evita o "flash" de
 * tema errado no carregamento (ver comentário em index.html).
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = 'educathon_theme';

function getInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // localStorage indisponível (ex.: SSR ou modo privativo restrito)
  }
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  }
  return 'light';
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Ignora falha de escrita
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Inicializa a partir do que o script anti-flash já aplicou (ou calcula de novo)
  const [theme, setThemeState] = useState<Theme>(() => {
    const attr = document.documentElement.getAttribute('data-theme') as Theme | null;
    if (attr === 'light' || attr === 'dark') return attr;
    return getInitialTheme();
  });

  // Sincroniza o DOM sempre que o estado mudar
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  const toggleTheme = useCallback(() => setThemeState((prev) => (prev === 'light' ? 'dark' : 'light')), []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme deve ser utilizado dentro de ThemeProvider');
  return ctx;
}
