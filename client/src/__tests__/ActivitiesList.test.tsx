/**
 * Testes da página ActivitiesList.
 * Cobre: estado de loading, empty state e listagem de atividades.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
