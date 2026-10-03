/**
 * Testes da página ReviewDashboard (Fase 4: exibição e correção de critérios).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
