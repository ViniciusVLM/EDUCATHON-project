/**
 * Diagnóstico da turma (ClassInsights).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClassInsights } from '../components/ClassInsights';
import { formatDuration } from '../services/format';
import * as api from '../services/api';
import type { ActivityInsights } from '../types';

vi.mock('../services/api', () => ({
  getActivityInsights: vi.fn(),
}));

const mockInsights = vi.mocked(api.getActivityInsights);

const sample: ActivityInsights = {
  activity_id: 7,
  question_type: 'dissertativa',
  totals: { students: 10, with_feedback: 10, without_feedback: 0, pending: 4, edited: 1, approved: 5 },
  criteria: [
    { criterio: 'Condensação', atendidos: 3, avaliados: 10, percent: 30 },
    { criterio: 'Evaporação', atendidos: 9, avaliados: 10, percent: 90 },
  ],
  weakest_criterion: { criterio: 'Condensação', atendidos: 3, avaliados: 10, percent: 30 },
  grades: {
    count: 5,
    average: 6.8,
    min: 3,
    max: 9.5,
    distribution: [
      { label: '0 a 2', count: 0 },
      { label: '2 a 4', count: 1 },
      { label: '4 a 6', count: 0 },
      { label: '6 a 8', count: 2 },
      { label: '8 a 10', count: 2 },
    ],
  },
  ai_agreement: { compared: 4, average_difference: 0.8, within_one_point: 3 },
  teacher_edits: { approved: 5, edited: 2, percent: 40 },
  review_time: { timed: 5, total_seconds: 300, average_seconds: 60 },
  objective: null,
  attention: [{ response_id: 55, student_name: 'Bruno Lima', reasons: ['atendeu 0 de 2 critérios', 'nota 3'] }],
  attention_total: 1,
};

describe('ClassInsights', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('só busca o diagnóstico quando o professor abre o painel', async () => {
    const user = userEvent.setup();
    mockInsights.mockResolvedValue(sample);
    render(<ClassInsights activityId={7} refreshKey="a" />);
    expect(mockInsights).not.toHaveBeenCalled();

    await user.click(screen.getByText('Diagnóstico da turma'));
    expect(await screen.findByText('Condensação', { selector: 'strong' })).toBeInTheDocument();
    expect(mockInsights).toHaveBeenCalledWith(7);
    expect(screen.getByText(/3 de 10 alunos atenderam/)).toBeInTheDocument();
    expect(screen.getByText('6,8')).toBeInTheDocument();
    expect(screen.getByText(/diferença média de 0,8 ponto/)).toBeInTheDocument();
    expect(screen.getByText(/editou o texto da IA em 2 de 5/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /0 a 2: 0; 2 a 4: 1; 4 a 6: 0; 6 a 8: 2; 8 a 10: 2/ })).toBeInTheDocument();
  });

  it('compara o tempo medido com a estimativa manual do professor', async () => {
    const user = userEvent.setup();
    mockInsights.mockResolvedValue(sample);
    render(<ClassInsights activityId={7} refreshKey="a" />);
    await user.click(screen.getByText('Diagnóstico da turma'));

    const input = await screen.findByLabelText(/quantos minutos você levaria/i);
    await user.type(input, '6');
    // 1 min em vez de 6 min: 83% menos; 5 min economizados por aluno x 10 alunos = 50 min
    expect(screen.getByRole('status')).toHaveTextContent('cerca de 83% menos tempo');
    expect(screen.getByRole('status')).toHaveTextContent('50 min economizados nos 10 alunos');
    expect(localStorage.getItem('educathon_manual_minutes_per_answer')).toBe('6');
  });

  it('leva o professor ao aluno que pede atenção', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    mockInsights.mockResolvedValue(sample);
    render(<ClassInsights activityId={7} refreshKey="a" onSelectStudent={onSelect} />);
    await user.click(screen.getByText('Diagnóstico da turma'));
    await user.click(await screen.findByRole('button', { name: 'Bruno Lima' }));
    expect(onSelect).toHaveBeenCalledWith(55);
  });

  it('mostra o erro do servidor sem quebrar a tela', async () => {
    const user = userEvent.setup();
    mockInsights.mockRejectedValue(new Error('Atividade não encontrada.'));
    render(<ClassInsights activityId={7} refreshKey="a" />);
    await user.click(screen.getByText('Diagnóstico da turma'));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Atividade não encontrada.'));
  });

  it('formatDuration escreve tempos de forma legível', () => {
    expect(formatDuration(40)).toBe('40 s');
    expect(formatDuration(75)).toBe('1 min 15 s');
    expect(formatDuration(120)).toBe('2 min');
    expect(formatDuration(5400)).toBe('1 h 30 min');
  });
});
