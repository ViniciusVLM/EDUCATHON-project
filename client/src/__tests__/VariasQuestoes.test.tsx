/**
 * Envio de respostas e revisão de uma atividade com várias perguntas dissertativas.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import UploadResponses from '../pages/UploadResponses';
import * as api from '../services/api';
import { getActivityQuestions, getResponseAnswers } from '../services/questions';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../services/api', () => ({
  getActivity: vi.fn(),
  uploadCSV: vi.fn(),
  addManualResponses: vi.fn(),
  previewCSV: vi.fn(),
}));

const activity = {
  id: 9,
  title: 'Prova de Ecologia',
  question: 'O que é cadeia alimentar?',
  rubric: 'Quem come quem.',
  education_level: 'medio',
  created_at: '2026-10-20',
  question_type: 'dissertativa' as const,
  questions: JSON.stringify([
    { pergunta: 'O que é cadeia alimentar?', rubrica: 'Quem come quem.' },
    { pergunta: 'Papel dos decompositores?', rubrica: 'Reciclam nutrientes.' },
  ]),
  responses: [],
  stats: { total_students: 0, pending: 0, reviewed: 0, approved: 0 },
};

describe('ajudantes de várias perguntas', () => {
  it('lê a lista de perguntas e cai para a pergunta única', () => {
    expect(getActivityQuestions(activity)).toHaveLength(2);
    expect(getActivityQuestions({ ...activity, questions: null })).toEqual([
      { pergunta: 'O que é cadeia alimentar?', rubrica: 'Quem come quem.' },
    ]);
  });

  it('separa respostas guardadas e respostas marcadas no texto', () => {
    expect(getResponseAnswers({ answers: '["a",""]', original_response: '' }, 2)).toEqual(['a', '']);
    expect(getResponseAnswers({ answers: null, original_response: 'Questão 1: x\n\nQuestão 2: (sem resposta)' }, 2)).toEqual(['x', '']);
  });
});

describe('UploadResponses — várias perguntas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getActivity).mockResolvedValue(activity as never);
  });

  it('mostra uma caixa por pergunta e envia answers', async () => {
    const user = userEvent.setup();
    vi.mocked(api.addManualResponses).mockResolvedValue({ message: 'ok', count: 1 });
    render(
      <MemoryRouter initialEntries={['/upload/9']}>
        <Routes>
          <Route path="/upload/:activityId" element={<UploadResponses />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText(/Esta atividade tem 2 perguntas/i)).toBeInTheDocument();
    expect(screen.getByText(/resposta_1/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Digitar manualmente/i }));
    await user.type(screen.getByLabelText(/Nome do aluno 1/i), 'Ana');
    await user.type(screen.getByLabelText(/Papel dos decompositores/i), 'Reciclam a matéria.');
    await user.click(screen.getByRole('button', { name: /Enviar e gerar feedbacks/i }));

    await waitFor(() => expect(api.addManualResponses).toHaveBeenCalledWith(9, [
      { student_name: 'Ana', answers: ['', 'Reciclam a matéria.'] },
    ]));
    expect(mockNavigate).toHaveBeenCalledWith('/review/9');
  });
});
