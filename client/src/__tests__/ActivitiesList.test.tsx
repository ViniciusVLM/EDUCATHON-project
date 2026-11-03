/**
 * Testes da página ActivitiesList.
 * Cobre: estado de loading, empty state e listagem de atividades.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ActivitiesList from '../pages/ActivitiesList';
import * as api from '../services/api';
import type { Activity } from '../types';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../services/api', () => ({
  getActivities: vi.fn(),
  setActivityArchived: vi.fn(),
  duplicateActivity: vi.fn(),
  getClasses: vi.fn(),
}));

const mockGetActivities = vi.mocked(api.getActivities);

function renderActivitiesList() {
  return render(
    <MemoryRouter>
      <ActivitiesList />
    </MemoryRouter>
  );
}

describe('ActivitiesList', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
  });

  it('exibe spinner enquanto carrega', () => {
    mockGetActivities.mockImplementation(() => new Promise(() => {})); // pendente para sempre
    renderActivitiesList();
    expect(document.querySelector('.spinner')).toBeInTheDocument();
  });

  it('exibe empty state quando não há atividades', async () => {
    mockGetActivities.mockResolvedValue([]);
    renderActivitiesList();
    await waitFor(() => {
      expect(screen.getByText(/Nenhuma atividade ainda/i)).toBeInTheDocument();
    });
  });

  it('exibe lista quando há atividades', async () => {
    const activities: Activity[] = [
      {
        id: 1,
        title: 'Redação sobre IA',
        question: 'Qual o impacto?',
        rubric: 'Espera análise crítica',
        education_level: 'medio',
        created_at: '2026-09-01T10:00:00.000Z',
      },
    ];
    mockGetActivities.mockResolvedValue(activities);
    renderActivitiesList();
    await waitFor(() => {
      expect(screen.getByText('Redação sobre IA')).toBeInTheDocument();
    });
  });

  it('exibe toast de erro quando a API falha', async () => {
    mockGetActivities.mockRejectedValue(new Error('Falha na rede'));
    renderActivitiesList();
    await waitFor(() => {
      expect(screen.getByText(/Falha na rede/i)).toBeInTheDocument();
    });
  });

  it('navega para /setup ao clicar em "Nova Atividade"', async () => {
    mockGetActivities.mockResolvedValue([]);
    renderActivitiesList();
    const user = userEvent.setup();
    await waitFor(() => screen.getByText(/Nenhuma atividade ainda/i));
    await user.click(screen.getByRole('button', { name: /Criar a primeira/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/setup');
  });
});

describe('ActivitiesList — busca e arquivadas', () => {
  const base = {
    question: 'q',
    rubric: 'r',
    education_level: 'medio',
    created_at: '2026-09-01T10:00:00.000Z',
  };
  const list: Activity[] = [
    { ...base, id: 1, title: 'Fotossíntese', subject: 'Biologia', is_archived: 0 },
    { ...base, id: 2, title: 'Revolução Francesa', subject: 'História', is_archived: 0 },
    { ...base, id: 3, title: 'Prova antiga', subject: 'História', is_archived: 1 },
  ];

  beforeEach(() => {
    mockNavigate.mockReset();
    vi.mocked(api.setActivityArchived).mockReset();
  });

  it('busca sem diferenciar acentos e esconde as arquivadas por padrão', async () => {
    const user = userEvent.setup();
    mockGetActivities.mockResolvedValue(list);
    renderActivitiesList();

    expect(await screen.findByText('Fotossíntese')).toBeInTheDocument();
    expect(screen.queryByText('Prova antiga')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ativas (2)' })).toBeInTheDocument();

    await user.type(screen.getByLabelText('Buscar atividades'), 'historia');
    expect(screen.getByText('Revolução Francesa')).toBeInTheDocument();
    expect(screen.queryByText('Fotossíntese')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Arquivadas (1)' }));
    expect(screen.getByText('Prova antiga')).toBeInTheDocument();
  });

  it('arquiva com confirmação e move a atividade para "Arquivadas"', async () => {
    const user = userEvent.setup();
    mockGetActivities.mockResolvedValue(list);
    vi.mocked(api.setActivityArchived).mockResolvedValue({ message: 'Atividade arquivada.', archived: true });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderActivitiesList();

    await screen.findByText('Fotossíntese');
    await user.click(document.getElementById('btn-archive-1') as HTMLElement);

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('nada é apagado'));
    await waitFor(() => expect(api.setActivityArchived).toHaveBeenCalledWith(1, true));
    expect(await screen.findByText('Atividade arquivada.')).toBeInTheDocument();
    expect(screen.queryByText('Fotossíntese')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Arquivadas (2)' })).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
  it('reaplica a atividade em outra turma e leva ao envio de respostas', async () => {
    const user = userEvent.setup();
    mockGetActivities.mockResolvedValue(list);
    vi.mocked(api.getClasses).mockResolvedValue([
      { id: 5, teacher_id: 1, name: '9º A' },
      { id: 6, teacher_id: 1, name: '9º B' },
    ] as never);
    vi.mocked(api.duplicateActivity).mockResolvedValue({ message: 'ok', id: 42 });
    renderActivitiesList();

    await screen.findByText('Fotossíntese');
    await user.click(document.getElementById('btn-duplicate-1') as HTMLElement);
    const form = await screen.findByRole('form', { name: 'Reaplicar atividade' });
    expect(within(form).getByDisplayValue('Fotossíntese (cópia)')).toBeInTheDocument();
    await screen.findByRole('option', { name: '9º B' });
    await user.selectOptions(within(form).getByRole('combobox'), '6');
    await user.click(within(form).getByRole('button', { name: /Criar cópia/ }));

    await waitFor(() => expect(api.duplicateActivity).toHaveBeenCalledWith(1, { title: 'Fotossíntese (cópia)', classId: 6 }));
    expect(mockNavigate).toHaveBeenCalledWith('/upload/42');
  });
  it('abas indicam qual está ativa e, sem a lista de turmas, a cópia fica sem turma com aviso', async () => {
    const user = userEvent.setup();
    mockGetActivities.mockResolvedValue([{ ...list[0], class_id: 5 }, list[1], list[2]]);
    vi.mocked(api.getClasses).mockRejectedValue(new Error('falhou'));
    vi.mocked(api.duplicateActivity).mockResolvedValue({ message: 'ok', id: 43 });
    renderActivitiesList();

    expect(await screen.findByRole('button', { name: 'Ativas (2)' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Arquivadas (1)' })).toHaveAttribute('aria-pressed', 'false');

    await user.click(document.getElementById('btn-duplicate-1') as HTMLElement);
    expect(await screen.findByText(/Não foi possível carregar suas turmas/)).toBeInTheDocument();
    const form = screen.getByRole('form', { name: 'Reaplicar atividade' });
    expect(within(form).getByRole('heading')).toHaveFocus();
    await user.click(within(form).getByRole('button', { name: /Criar cópia/ }));
    await waitFor(() => expect(api.duplicateActivity).toHaveBeenCalledWith(1, { title: 'Fotossíntese (cópia)', classId: null }));
  });
});
