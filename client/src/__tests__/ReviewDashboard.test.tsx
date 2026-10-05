/**
 * Testes da página ReviewDashboard (Fase 4 e Fase 6D).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ReviewDashboard from '../pages/ReviewDashboard';
import * as api from '../services/api';
import type { ActivityWithResponses } from '../types';

vi.mock('../services/api', () => ({
  getActivity: vi.fn(),
  generateFeedbacks: vi.fn(),
  getProgress: vi.fn().mockResolvedValue({ status: 'complete', total: 1, processed: 1, errors: 0 }),
  updateFeedback: vi.fn().mockResolvedValue({ message: 'OK', status: 'revisado' }),
  approveFeedback: vi.fn().mockResolvedValue({ message: 'OK', status: 'aprovado' }),
  regenerateFeedback: vi.fn().mockResolvedValue({ message: 'OK', feedbackId: 10 }),
}));

const mockGetActivity = vi.mocked(api.getActivity);
const mockUpdateFeedback = vi.mocked(api.updateFeedback);
const mockApproveFeedback = vi.mocked(api.approveFeedback);

const sampleActivity: ActivityWithResponses = {
  id: 1,
  title: 'Atividade de Biologia',
  question: 'Explique a fotossíntese.',
  rubric: 'Citar luz, CO2 e glicose.',
  education_level: 'medio',
  created_at: '2026-09-01T10:00:00Z',
  stats: {
    total_students: 1,
    total_feedbacks: 1,
    pending: 1,
    reviewed: 0,
    approved: 0,
  },
  responses: [
    {
      id: 101,
      activity_id: 1,
      student_name: 'Beatriz Santos',
      original_response: 'As plantas usam a luz do sol e água para crescer.',
      created_at: '2026-09-01T10:00:00Z',
      feedback_id: 201,
      ai_feedback_json: JSON.stringify({
        pontos_fortes: 'Mencionou luz e água.',
        lacunas: 'Não citou CO2 e glicose.',
        sugestao_melhoria: 'Revise o ciclo de Calvin.',
        feedback_completo: 'Beatriz, parabéns pelo esforço! Você citou a luz do sol...',
      }),
      ai_feedback_text: 'Beatriz, parabéns pelo esforço! Você citou a luz do sol...',
      teacher_feedback: null,
      status: 'pendente',
      generated_at: '2026-09-01T10:05:00Z',
      approved_at: null,
      criteria_scores: JSON.stringify([
        {
          criterio: 'Mecanismo da fotossíntese',
          atendido: true,
          evidencia: 'usam a luz do sol e água',
        },
        {
          criterio: 'Fixação de carbono',
          atendido: false,
          evidencia: 'não citou CO2',
        },
      ]),
    },
  ],
};

const multiStudentActivity: ActivityWithResponses = {
  id: 1,
  title: 'Atividade de Biologia',
  question: 'Explique a fotossíntese.',
  rubric: 'Citar luz, CO2 e glicose.',
  education_level: 'medio',
  created_at: '2026-09-01T10:00:00Z',
  stats: {
    total_students: 2,
    total_feedbacks: 2,
    pending: 2,
    reviewed: 0,
    approved: 0,
  },
  responses: [
    {
      id: 101,
      activity_id: 1,
      student_name: 'Beatriz Santos',
      original_response: 'As plantas usam a luz do sol e água para crescer.',
      created_at: '2026-09-01T10:00:00Z',
      feedback_id: 201,
      ai_feedback_json: null,
      ai_feedback_text: 'Beatriz, parabéns pelo esforço!',
      teacher_feedback: null,
      status: 'pendente',
      generated_at: '2026-09-01T10:05:00Z',
      approved_at: null,
      criteria_scores: null,
    },
    {
      id: 102,
      activity_id: 1,
      student_name: 'Carlos Dias',
      original_response: 'Fotossíntese converte energia luminosa em glicose.',
      created_at: '2026-09-01T10:00:00Z',
      feedback_id: 202,
      ai_feedback_json: null,
      ai_feedback_text: 'Carlos, excelente!',
      teacher_feedback: null,
      status: 'pendente',
      generated_at: '2026-09-01T10:05:00Z',
      approved_at: null,
      criteria_scores: null,
    },
  ],
};

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={['/review/1']}>
      <Routes>
        <Route path="/review/:activityId" element={<ReviewDashboard />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ReviewDashboard — Critérios de Avaliação', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exibe critérios com evidências e permite ao professor alternar status e salvar', async () => {
    const user = userEvent.setup();
    mockGetActivity.mockResolvedValue(sampleActivity);

    renderDashboard();

    // Aguarda carregar
    await waitFor(() => {
      expect(screen.getByText('Mecanismo da fotossíntese')).toBeInTheDocument();
      expect(screen.getByText('Fixação de carbono')).toBeInTheDocument();
      expect(screen.getByText(/"usam a luz do sol e água"/i)).toBeInTheDocument();
    });

    // Critério 1 deve estar atendido e Critério 2 não atendido
    expect(screen.getByRole('button', { name: /✅ Atendido/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /❌ Não atendido/i })).toBeInTheDocument();

    // Professor clica no segundo critério para corrigir para atendido
    const toggleBtn = screen.getByRole('button', { name: /❌ Não atendido/i });
    await user.click(toggleBtn);

    // Agora ambos devem constar como atendidos na interface
    const attendedButtons = screen.getAllByRole('button', { name: /✅ Atendido/i });
    expect(attendedButtons.length).toBe(2);

    // Clica em Salvar Edição
    const saveBtn = screen.getByRole('button', { name: /Salvar Edição/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(mockUpdateFeedback).toHaveBeenCalledWith(
        201,
        expect.objectContaining({
          criteriaScores: [
            {
              criterio: 'Mecanismo da fotossíntese',
              atendido: true,
              evidencia: 'usam a luz do sol e água',
            },
            {
              criterio: 'Fixação de carbono',
              atendido: true, // alterado pelo professor
              evidencia: 'não citou CO2',
            },
          ],
        })
      );
    });
  });
});

describe('ReviewDashboard — Recursos da Fase 6D', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('alerta antes de descartar edição não salva ao trocar de aluno', async () => {
    const user = userEvent.setup();
    mockGetActivity.mockResolvedValue(multiStudentActivity);
    const confirmSpy = vi.spyOn(window, 'confirm');

    renderDashboard();

    await waitFor(() => {
      expect(screen.getAllByText('Beatriz Santos').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Carlos Dias').length).toBeGreaterThan(0);
    });

    // Edita o texto do feedback de Beatriz
    const editor = screen.getByRole('textbox');
    await user.type(editor, ' Nota adicional do professor.');

    // 1. Tenta trocar para Carlos, mas clica em Cancelar na confirmação
    confirmSpy.mockReturnValueOnce(false);
    const carlosCard = screen.getByRole('button', { name: /Carlos Dias/i });
    await user.click(carlosCard);

    expect(confirmSpy).toHaveBeenCalled();
    // Continua na resposta da Beatriz
    expect(screen.getByText('As plantas usam a luz do sol e água para crescer.')).toBeInTheDocument();

    // 2. Tenta trocar para Carlos e clica em OK (descartar)
    confirmSpy.mockReturnValueOnce(true);
    await user.click(carlosCard);

    // Agora exibe a resposta de Carlos
    expect(
      await screen.findByText('Fotossíntese converte energia luminosa em glicose.')
    ).toBeInTheDocument();
  });

  it('avança automaticamente para o próximo aluno não aprovado ao clicar em Aprovar', async () => {
    const user = userEvent.setup();
    mockGetActivity.mockResolvedValue(multiStudentActivity);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getAllByText('Beatriz Santos').length).toBeGreaterThan(0);
    });

    // Clica em Aprovar na Beatriz
    const approveBtn = screen.getByRole('button', { name: /Aprovar$/i });
    await user.click(approveBtn);

    await waitFor(() => {
      expect(mockApproveFeedback).toHaveBeenCalledWith(201);
      // Avança automaticamente para o próximo não aprovado (Carlos Dias)
      expect(screen.getByText('Fotossíntese converte energia luminosa em glicose.')).toBeInTheDocument();
    });
  });

  it('aprova todos os pendentes com confirmação prévia', async () => {
    const user = userEvent.setup();
    mockGetActivity.mockResolvedValue(multiStudentActivity);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Aprovar todos os pendentes/i })).toBeInTheDocument();
    });

    const approveAllBtn = screen.getByRole('button', { name: /Aprovar todos os pendentes/i });
    await user.click(approveAllBtn);

    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringContaining('aprovar todos os 2 feedbacks pendentes')
    );

    await waitFor(() => {
      expect(mockApproveFeedback).toHaveBeenCalledWith(201);
      expect(mockApproveFeedback).toHaveBeenCalledWith(202);
    });
  });

  it('executa atalho de teclado Alt+A para aprovar o aluno atual', async () => {
    mockGetActivity.mockResolvedValue(sampleActivity);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getAllByText('Beatriz Santos').length).toBeGreaterThan(0);
    });

    // Dispara atalho Alt+A no window
    fireEvent.keyDown(window, { key: 'a', altKey: true });

    await waitFor(() => {
      expect(mockApproveFeedback).toHaveBeenCalledWith(201);
    });
  });

  it('navega entre alunos com os atalhos Alt+ArrowRight e Alt+ArrowLeft', async () => {
    mockGetActivity.mockResolvedValue(multiStudentActivity);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getAllByText('Beatriz Santos').length).toBeGreaterThan(0);
    });

    // Pressiona Alt+ArrowRight para ir para Carlos Dias
    fireEvent.keyDown(window, { key: 'ArrowRight', altKey: true });

    await waitFor(() => {
      expect(screen.getByText('Fotossíntese converte energia luminosa em glicose.')).toBeInTheDocument();
    });

    // Pressiona Alt+ArrowLeft para voltar para Beatriz Santos
    fireEvent.keyDown(window, { key: 'ArrowLeft', altKey: true });

    await waitFor(() => {
      expect(screen.getByText('As plantas usam a luz do sol e água para crescer.')).toBeInTheDocument();
    });
  });
});
