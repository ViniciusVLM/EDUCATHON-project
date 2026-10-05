/**
 * Testes de componente da página Dashboard (/painel).
 * Valida:
 * 1. Estado de carregamento (esqueleto animado).
 * 2. Estado vazio para novo professor (com convite para criar a 1ª atividade).
 * 3. Estado populado (saudação, atalhos, pendências, atividades recentes, prazos, fila e anéis).
 * 4. Estado de erro e recuperação ao clicar em "Tentar novamente".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from '../pages/Dashboard';
import { AuthProvider } from '../contexts/AuthContext';
import * as api from '../services/api';
import type { DashboardSummary } from '../types';

// Mock do módulo de API
vi.mock('../services/api', () => ({
  getDashboardSummary: vi.fn(),
  getAuthToken: vi.fn(() => 'fake-token'),
  setAuthToken: vi.fn(),
  getMe: vi.fn().mockResolvedValue({
    teacher: { id: 1, name: 'Profa. Mariana Silva', email: 'mariana@escola.org' },
  }),
}));

const mockSummaryPopulated: DashboardSummary = {
  teacher: { id: 1, name: 'Profa. Mariana Silva' },
  metrics: {
    total_activities: 3,
    total_students: 35,
    total_feedbacks: 30,
    pending_review: 5,
    reviewed: 5,
    approved: 20,
    generation_errors: 1,
  },
  pending_review_items: [
    {
      activity_id: 101,
      activity_title: 'Redação Dissertativa',
      type: 'pending_feedback',
      count: 4,
    },
    {
      activity_id: 102,
      activity_title: 'Física Clássica',
      type: 'generation_error',
      count: 1,
    },
    {
      activity_id: 103,
      activity_title: 'Química Orgânica',
      type: 'generation_complete',
      count: 10,
    },
  ],
  recent_activities: [
    {
      id: 101,
      title: 'Redação Dissertativa',
      subject: 'Língua Portuguesa',
      class_name: '3º Ano A',
      due_date: '2026-10-18T23:59:00',
      created_at: '2026-10-01T10:00:00',
      total_students: 20,
      pending_review: 4,
      approved: 16,
    },
  ],
  deadlines: [
    {
      activity_id: 101,
      title: 'Redação Dissertativa',
      subject: 'Língua Portuguesa',
      class_name: '3º Ano A',
      due_date: '2026-10-18T23:59:00',
    },
  ],
  review_queue: [
    {
      activity_id: 101,
      title: 'Redação Dissertativa',
      total: 20,
      approved: 16,
      pending: 4,
      progress_percent: 80,
    },
  ],
};

const mockSummaryEmpty: DashboardSummary = {
  teacher: { id: 2, name: 'Prof. Carlos Santos' },
  metrics: {
    total_activities: 0,
    total_students: 0,
    total_feedbacks: 0,
    pending_review: 0,
    reviewed: 0,
    approved: 0,
    generation_errors: 0,
  },
  pending_review_items: [],
  recent_activities: [],
  deadlines: [],
  review_queue: [],
};

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={['/painel']}>
      <AuthProvider>
        <Dashboard />
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('Dashboard Component (/painel)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exibe o estado de carregamento (esqueleto) enquanto busca os dados', () => {
    // Retorna uma Promise pendente para manter em loading
    vi.mocked(api.getDashboardSummary).mockReturnValue(new Promise(() => {}));

    renderDashboard();

    expect(screen.getByTestId('dashboard-loading-skeleton')).toBeInTheDocument();
    expect(screen.getByLabelText(/Carregando painel/i)).toBeInTheDocument();
  });

  it('exibe o estado vazio com convite para criar a primeira atividade para novo professor', async () => {
    vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummaryEmpty);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-empty-state')).toBeInTheDocument();
    });

    expect(screen.getByText(/Bem-vindo\(a\) ao seu novo painel!/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Criar primeira atividade/i })).toBeInTheDocument();
    expect(screen.getByText(/A IA nunca dá nota; o professor decide/i)).toBeInTheDocument();
  });

  it('exibe o painel populado com saudação, atalhos, pendências, prazos e anéis', async () => {
    vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummaryPopulated);

    renderDashboard();

    // 1. Saudação personalizada com primeiro nome
    await waitFor(() => {
      expect(screen.getByText(/Olá, Profa.! O que vamos corrigir hoje\?/i)).toBeInTheDocument();
    });

    // 2. Linha de atalhos
    const shortcuts = screen.getByRole('region', { name: /Atalhos rápidos/i });
    expect(within(shortcuts).getByRole('link', { name: /Nova atividade/i })).toBeInTheDocument();
    expect(within(shortcuts).getByRole('link', { name: /Organize suas atividades/i })).toBeInTheDocument();
    expect(within(shortcuts).getByRole('link', { name: /Gere feedback com IA/i })).toBeInTheDocument();
    expect(within(shortcuts).getByRole('link', { name: /Revise e aprove/i })).toBeInTheDocument();

    // 3. Pendências de revisão
    expect(screen.getByText('Pendências de revisão')).toBeInTheDocument();
    expect(screen.getByText('4 resposta(s) para revisar')).toBeInTheDocument();
    expect(screen.getByText('1 falha(s) na geração')).toBeInTheDocument();

    // 4. Atividades recentes com chips de disciplina e turma
    expect(screen.getByText('Atividades recentes')).toBeInTheDocument();
    expect(screen.getByText('Língua Portuguesa')).toBeInTheDocument();
    expect(screen.getByText('3º Ano A')).toBeInTheDocument();

    // 5. Prazos com dias da semana
    expect(screen.getByText('Prazos')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /Dias da semana atual/i })).toBeInTheDocument();

    // 6. Fila de revisão com progresso
    expect(screen.getByText('Fila de revisão')).toBeInTheDocument();
    expect(screen.getByText(/16 de 20 aprovados \(80%\)/i)).toBeInTheDocument();

    // 7. Dois anéis de progresso
    expect(screen.getByText('Aprovados')).toBeInTheDocument();
    expect(screen.getByText('Gerações com erro')).toBeInTheDocument();
  });

  it('exibe o estado de erro e permite tentar novamente', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getDashboardSummary).mockRejectedValueOnce(new Error('Erro de conexão ao servidor'));

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-error-state')).toBeInTheDocument();
    });

    expect(screen.getByText(/Erro de conexão ao servidor/i)).toBeInTheDocument();

    // Ao clicar em tentar novamente, deve chamar getDashboardSummary novamente
    vi.mocked(api.getDashboardSummary).mockResolvedValueOnce(mockSummaryPopulated);
    const retryBtn = screen.getByRole('button', { name: /Tentar novamente/i });
    await user.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-content')).toBeInTheDocument();
    });

    expect(api.getDashboardSummary).toHaveBeenCalledTimes(2);
  });

  it('verifica que os atalhos rápidos e pendências possuem links corretos para as páginas', async () => {
    vi.mocked(api.getDashboardSummary).mockResolvedValue(mockSummaryPopulated);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-content')).toBeInTheDocument();
    });

    const shortcuts = screen.getByRole('region', { name: /Atalhos rápidos/i });
    expect(within(shortcuts).getByRole('link', { name: /Nova atividade/i })).toHaveAttribute('href', '/setup');
    expect(within(shortcuts).getByRole('link', { name: /Organize suas atividades/i })).toHaveAttribute('href', '/activities');
    expect(within(shortcuts).getByRole('link', { name: /Gere feedback com IA/i })).toHaveAttribute('href', '/setup');
    expect(within(shortcuts).getByRole('link', { name: /Revise e aprove/i })).toHaveAttribute('href', '/activities');

    // Valida links de revisão e retry na lista de pendências
    const reviewBtns = screen.getAllByRole('link', { name: /Revisar/i });
    expect(reviewBtns.length).toBeGreaterThan(0);
    expect(reviewBtns[0]).toHaveAttribute('href', '/review/101');

    const retryBtn = screen.getByRole('link', { name: /Tentar de novo/i });
    expect(retryBtn).toHaveAttribute('href', '/upload/102');
  });
});
