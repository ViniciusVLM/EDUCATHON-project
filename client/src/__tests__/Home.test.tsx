/**
 * Testes da página Home.
 * Verifica se renderiza os elementos principais e se a navegação é acionada.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Home from '../pages/Home';

// Mock do useNavigate para não depender do roteador real
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function renderHome() {
  return render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>
  );
}

describe('Home', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
  });

  it('renderiza o título principal', () => {
    renderHome();
    expect(screen.getByText(/Copiloto Pedagógico/i)).toBeInTheDocument();
  });

  it('renderiza o botão "Nova Correção"', () => {
    renderHome();
    expect(screen.getByRole('button', { name: /Nova Correção/i })).toBeInTheDocument();
  });

  it('renderiza o botão "Ver Atividades"', () => {
    renderHome();
    expect(screen.getByRole('button', { name: /Ver Atividades/i })).toBeInTheDocument();
  });

  it('navega para /setup ao clicar em "Nova Correção"', async () => {
    renderHome();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Nova Correção/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/setup');
  });

  it('navega para /activities ao clicar em "Ver Atividades"', async () => {
    renderHome();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Ver Atividades/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/activities');
  });

  it('renderiza os 3 cards de features', () => {
    renderHome();
    expect(screen.getByText('Configure')).toBeInTheDocument();
    expect(screen.getByText('Envie')).toBeInTheDocument();
    expect(screen.getByText('Revise')).toBeInTheDocument();
  });
});
