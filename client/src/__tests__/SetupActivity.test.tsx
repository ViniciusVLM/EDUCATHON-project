/**
 * Testes da página SetupActivity (Fase 4: critérios de rubrica).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import SetupActivity from '../pages/SetupActivity';
import * as api from '../services/api';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../services/api', () => ({
  createActivity: vi.fn(),
  getClasses: vi.fn().mockResolvedValue([]),
}));

const mockCreateActivity = vi.mocked(api.createActivity);

function renderSetup() {
  return render(
    <MemoryRouter>
      <SetupActivity />
    </MemoryRouter>
  );
}

describe('SetupActivity — Critérios de Rubrica', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('permite adicionar e remover critérios dinamicamente', async () => {
    const user = userEvent.setup();
    renderSetup();

    const addBtn = screen.getByRole('button', { name: /\+ Adicionar Critério/i });
    expect(screen.queryByPlaceholderText(/Explicação do processo biológico/i)).not.toBeInTheDocument();

    // Adiciona critério 1
    await user.click(addBtn);
    expect(screen.getByPlaceholderText(/Explicação do processo biológico/i)).toBeInTheDocument();

    // Remove critério
    const removeBtn = screen.getByTitle(/Remover critério/i);
    await user.click(removeBtn);
    expect(screen.queryByPlaceholderText(/Explicação do processo biológico/i)).not.toBeInTheDocument();
  });

  it('valida pesos positivos e envia rubricCriteria para a API', async () => {
    const user = userEvent.setup();
    mockCreateActivity.mockResolvedValue({ message: 'OK', id: 42 });

    renderSetup();

    // Preenche campos obrigatórios
    await user.type(screen.getByLabelText(/Título da Atividade/i), 'Atividade de Genética');
    await user.type(screen.getByLabelText(/Pergunta feita aos alunos/i), 'O que é DNA?');
    await user.type(screen.getByLabelText(/Rubrica \/ Gabarito/i), 'Estrutura de dupla hélice');

    // Adiciona critério com peso inválido (0)
    await user.click(screen.getByRole('button', { name: /\+ Adicionar Critério/i }));
    const criterionInput = screen.getByPlaceholderText(/Explicação do processo biológico/i);
    const weightInput = screen.getByRole('spinbutton');

    await user.type(criterionInput, 'Conceito de dupla hélice');
    await user.clear(weightInput);
    await user.type(weightInput, '0');

    await user.click(screen.getByRole('button', { name: /Próximo → Enviar Respostas/i }));

    // Deve exibir mensagem de erro sobre peso positivo
    expect(screen.getByText(/deve ser um número positivo maior que zero/i)).toBeInTheDocument();
    expect(mockCreateActivity).not.toHaveBeenCalled();

    // Corrige o peso para 2 e envia
    await user.clear(weightInput);
    await user.type(weightInput, '2');

    await user.click(screen.getByRole('button', { name: /Próximo → Enviar Respostas/i }));

    await waitFor(() => {
      expect(mockCreateActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Atividade de Genética',
          question: 'O que é DNA?',
          rubric: 'Estrutura de dupla hélice',
          rubricCriteria: [
            { criterio: 'Conceito de dupla hélice', peso: 2 },
          ],
        })
      );
      expect(mockNavigate).toHaveBeenCalledWith('/upload/42');
    });
  });
});
