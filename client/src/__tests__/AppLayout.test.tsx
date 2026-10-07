/**
 * Testes do AppLayout.
 * Verifica: renderização da sidebar, itens de navegação,
 * alternador de tema na topbar e menu do usuário.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AppLayout } from '../components/layout/AppLayout';
import { ThemeProvider } from '../contexts/ThemeContext';
import { AuthProvider } from '../contexts/AuthContext';

// Mock da API — simula professor logado
vi.mock('../services/api', () => ({
  getAuthToken: vi.fn(() => 'fake-token'),
  setAuthToken: vi.fn(),
  getMe: vi.fn().mockResolvedValue({
    teacher: { id: 1, name: 'Profa. Maria', email: 'maria@escola.org' },
  }),
  loginTeacher: vi.fn(),
  registerTeacher: vi.fn(),
}));

function renderLayout(children = <p>Conteúdo</p>) {
  return render(
    <MemoryRouter initialEntries={['/activities']}>
      <ThemeProvider>
        <AuthProvider>
          <AppLayout>{children}</AppLayout>
        </AuthProvider>
      </ThemeProvider>
    </MemoryRouter>
  );
}

describe('AppLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('renderiza a barra lateral com label de acessibilidade', () => {
    renderLayout();
    expect(screen.getByRole('complementary', { name: /Navegação principal/i })).toBeInTheDocument();
  });

  it('exibe os itens de navegação na sidebar', () => {
    renderLayout();
    const sidebar = screen.getByRole('complementary', { name: /Navegação principal/i });
    expect(within(sidebar).getByRole('link', { name: /Painel/i })).toBeInTheDocument();
    expect(within(sidebar).getByRole('link', { name: /Atividades/i })).toBeInTheDocument();
    expect(within(sidebar).getByRole('link', { name: /Turmas/i })).toBeInTheDocument();
    expect(within(sidebar).getByRole('link', { name: /Nova Atividade/i })).toBeInTheDocument();
  });

  it('renderiza o alternador de tema com dois botões', () => {
    renderLayout();
    const toggleGroup = screen.getByRole('group', { name: /Alternador de tema/i });
    expect(within(toggleGroup).getByRole('button', { name: /Tema claro/i })).toBeInTheDocument();
    expect(within(toggleGroup).getByRole('button', { name: /Tema escuro/i })).toBeInTheDocument();
  });

  it('botão "Tema claro" tem aria-pressed=true quando o tema é light', () => {
    renderLayout();
    const toggleGroup = screen.getByRole('group', { name: /Alternador de tema/i });
    const lightBtn = within(toggleGroup).getByRole('button', { name: /Tema claro/i });
    expect(lightBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('alterna para tema escuro ao clicar no botão escuro', async () => {
    const user = userEvent.setup();
    renderLayout();
    const toggleGroup = screen.getByRole('group', { name: /Alternador de tema/i });
    await user.click(within(toggleGroup).getByRole('button', { name: /Tema escuro/i }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('renderiza o botão de notificações', () => {
    renderLayout();
    expect(screen.getByRole('button', { name: /Notificações/i })).toBeInTheDocument();
  });

  it('renderiza o conteúdo filho dentro do layout', () => {
    renderLayout(<p>Olá, mundo!</p>);
    expect(screen.getByText('Olá, mundo!')).toBeInTheDocument();
  });

  it('abre o menu do usuário ao clicar no botão de perfil', async () => {
    const user = userEvent.setup();
    renderLayout();
    const userBtn = screen.getByRole('button', { name: /Menu do professor/i });
    await user.click(userBtn);
    expect(screen.getByRole('menuitem', { name: /Sair/i })).toBeInTheDocument();
  });

  it('renderiza a barra de navegação inferior para dispositivos móveis com os 4 links', () => {
    renderLayout();
    const bottomNav = screen.getByRole('navigation', { name: /Navegação inferior/i });
    expect(bottomNav).toBeInTheDocument();
    expect(within(bottomNav).getByRole('link', { name: /Painel/i })).toBeInTheDocument();
    expect(within(bottomNav).getByRole('link', { name: /Atividades/i })).toBeInTheDocument();
    expect(within(bottomNav).getByRole('link', { name: /Turmas/i })).toBeInTheDocument();
    expect(within(bottomNav).getByRole('link', { name: /Nova Atividade/i })).toBeInTheDocument();
  });
});

