/**
 * Testes do ThemeContext.
 * Verifica: persistência em localStorage, atributo data-theme no <html>
 * e respeito ao prefers-color-scheme.
 *
 * Nota: jsdom não implementa window.matchMedia — usamos Object.defineProperty
 * para adicionar o mock quando necessário.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext';

// Componente auxiliar que expõe o estado do contexto
function ThemeConsumer() {
  const { theme, toggleTheme } = useTheme();
  return (
    <>
      <p data-testid="theme-value">{theme}</p>
      <button type="button" onClick={toggleTheme} id="btn-toggle-theme">
        Alternar tema
      </button>
    </>
  );
}

function renderWithTheme() {
  return render(
    <ThemeProvider>
      <ThemeConsumer />
    </ThemeProvider>
  );
}

/** Helper que instala um mock de matchMedia no jsdom */
function mockMatchMedia(prefersDark: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: query.includes('dark') ? prefersDark : !prefersDark,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe('ThemeContext', () => {
  beforeEach(() => {
    // Limpa localStorage e atributo antes de cada teste
    try { localStorage.clear(); } catch { /* ignora */ }
    document.documentElement.removeAttribute('data-theme');
    // Remove qualquer mock de matchMedia anterior
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: undefined,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('o tema padrão é "light" quando não há preferência salva e matchMedia não está disponível', () => {
    // matchMedia = undefined (jsdom padrão), sem nada no localStorage
    renderWithTheme();
    expect(screen.getByTestId('theme-value').textContent).toBe('light');
  });

  it('aplica o atributo data-theme no <html>', () => {
    renderWithTheme();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('toggleTheme alterna de light para dark', async () => {
    const user = userEvent.setup();
    renderWithTheme();
    await user.click(screen.getByRole('button', { name: /Alternar tema/i }));
    expect(screen.getByTestId('theme-value').textContent).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('toggleTheme alterna de dark para light', async () => {
    localStorage.setItem('educathon_theme', 'dark');
    document.documentElement.setAttribute('data-theme', 'dark');
    const user = userEvent.setup();
    renderWithTheme();
    await user.click(screen.getByRole('button', { name: /Alternar tema/i }));
    expect(screen.getByTestId('theme-value').textContent).toBe('light');
  });

  it('persiste o tema escolhido no localStorage', async () => {
    const user = userEvent.setup();
    renderWithTheme();
    await user.click(screen.getByRole('button', { name: /Alternar tema/i }));
    expect(localStorage.getItem('educathon_theme')).toBe('dark');
  });

  it('carrega o tema salvo do localStorage na inicialização', () => {
    localStorage.setItem('educathon_theme', 'dark');
    document.documentElement.setAttribute('data-theme', 'dark');
    renderWithTheme();
    expect(screen.getByTestId('theme-value').textContent).toBe('dark');
  });

  it('usa prefers-color-scheme: dark quando não há nada salvo', () => {
    mockMatchMedia(true); // simula SO em modo escuro
    renderWithTheme();
    expect(screen.getByTestId('theme-value').textContent).toBe('dark');
  });

  it('usa prefers-color-scheme: light quando não há nada salvo e SO é claro', () => {
    mockMatchMedia(false); // simula SO em modo claro
    renderWithTheme();
    expect(screen.getByTestId('theme-value').textContent).toBe('light');
  });

  it('não lança erro quando localStorage não está disponível', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('QuotaExceeded');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded');
    });

    // matchMedia = undefined → não deve lançar TypeError
    expect(() => renderWithTheme()).not.toThrow();
  });
});
