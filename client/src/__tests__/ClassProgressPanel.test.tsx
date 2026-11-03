/**
 * Evolução da turma (ClassProgressPanel).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ClassProgressPanel } from '../components/ClassProgressPanel';
import * as api from '../services/api';

vi.mock('../services/api', () => ({ getClassProgress: vi.fn() }));
const mockProgress = vi.mocked(api.getClassProgress);

function renderPanel(classId = 3) {
  return render(
    <MemoryRouter>
      <ClassProgressPanel classId={classId} />
    </MemoryRouter>
  );
}

describe('ClassProgressPanel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('só carrega ao abrir e mostra cada atividade e a mudança dos critérios repetidos', async () => {
    const user = userEvent.setup();
    mockProgress.mockResolvedValue({
      class_id: 3,
      class_name: '8º A',
      activities: [
        { activity_id: 10, title: 'Redação 1', date: '2026-09-10', is_archived: false, students: 4, approved: 4, criteria_percent: 38, objective_percent: null, average_grade: 5.5 },
        { activity_id: 11, title: 'Redação 2', date: '2026-10-20', is_archived: true, students: 4, approved: 2, criteria_percent: 75, objective_percent: null, average_grade: null },
      ],
      recurring_criteria: [
        { criterio: 'Clareza', change: 25, points: [{ activity_id: 10, title: 'Redação 1', percent: 50 }, { activity_id: 11, title: 'Redação 2', percent: 75 }] },
        { criterio: 'Fontes', change: -20, points: [{ activity_id: 10, title: 'Redação 1', percent: 60 }, { activity_id: 11, title: 'Redação 2', percent: 40 }] },
      ],
    });
    renderPanel();
    expect(mockProgress).not.toHaveBeenCalled();

    await user.click(screen.getByText('Evolução da turma'));
    expect(await screen.findByRole('link', { name: 'Redação 1' })).toHaveAttribute('href', '/review/10');
    expect(screen.getByText(/10\/09\/2026 · média 5,5/)).toBeInTheDocument();
    expect(screen.getByText(/20\/10\/2026 · média — · arquivada/)).toBeInTheDocument();
    expect(screen.getByText('melhorou 25 pontos')).toBeInTheDocument();
    expect(screen.getByText('caiu 20 pontos')).toBeInTheDocument();
    expect(screen.getByText(/50% → 75%/)).toBeInTheDocument();
    expect(mockProgress).toHaveBeenCalledWith(3);
  });

  it('turma sem atividades corrigidas explica o motivo', async () => {
    const user = userEvent.setup();
    mockProgress.mockResolvedValue({ class_id: 3, class_name: 'X', activities: [], recurring_criteria: [] });
    renderPanel();
    await user.click(screen.getByText('Evolução da turma'));
    expect(await screen.findByText(/Nenhuma atividade desta turma tem feedbacks/)).toBeInTheDocument();
  });

  it('mostra o erro do servidor', async () => {
    const user = userEvent.setup();
    mockProgress.mockRejectedValue(new Error('Turma não encontrada.'));
    renderPanel();
    await user.click(screen.getByText('Evolução da turma'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Turma não encontrada.');
  });
});
