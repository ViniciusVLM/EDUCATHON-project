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
  createClass: vi.fn(),
  importExam: vi.fn(),
  getClasses: vi.fn().mockResolvedValue([]),
}));

const mockCreateActivity = vi.mocked(api.createActivity);
const mockImportExam = vi.mocked(api.importExam);
const mockCreateClass = vi.mocked(api.createClass);
const mockGetClasses = vi.mocked(api.getClasses);

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


describe('SetupActivity — Preencher a partir da prova', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClasses.mockResolvedValue([
      { id: 5, teacher_id: 1, name: '8º Ano B', student_count: 30 },
    ]);
  });

  const importResult = {
    fileName: 'prova.pdf',
    sourceType: 'pdf' as const,
    exam: {
      title: 'Prova de Ciências',
      subject: 'Ciências',
      educationLevel: 'fundamental' as const,
      dueDate: '2026-11-20',
      classText: '8º ano B',
    },
    suggestedClassId: 5,
    questions: [
      {
        number: '1',
        title: 'Prova de Ciências — Questão 1: Fotossíntese',
        question: 'Explique a fotossíntese.',
        rubric: 'Luz, CO2, glicose e oxigênio.',
        rubricFromDocument: true,
        criteria: [{ criterio: 'Fontes de energia', peso: 2 }],
      },
      {
        number: '3',
        title: 'Prova de Ciências — Questão 3: Transporte de água',
        question: 'Descreva o caminho da água da raiz às folhas.',
        rubric: 'Raiz, xilema, transpiração.',
        rubricFromDocument: false,
        criteria: [],
      },
    ],
    ignoredObjectiveQuestions: 1,
    warnings: [],
  };

  async function uploadExam(user: ReturnType<typeof userEvent.setup>) {
    renderSetup();
    await waitFor(() => expect(screen.getByRole('option', { name: /8º Ano B/ })).toBeInTheDocument());
    const file = new File(['%PDF-1.7'], 'prova.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByLabelText(/Arquivo da prova/i), file);
    await screen.findByText(/2 questões encontradas/i);
  }

  it('preenche o formulário, a turma e cria uma atividade por questão', async () => {
    const user = userEvent.setup();
    mockImportExam.mockResolvedValue(importResult);
    mockCreateActivity.mockResolvedValueOnce({ message: 'OK', id: 10 }).mockResolvedValueOnce({ message: 'OK', id: 11 });

    await uploadExam(user);

    expect(mockImportExam).toHaveBeenCalledWith('prova.pdf', expect.any(String));
    expect(screen.getByText(/1 questão de verdadeiro\/falso ou de ligar colunas foi ignorada/i)).toBeInTheDocument();
    expect(screen.getByText(/identificada e selecionada/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Turma/i, { selector: 'select' })).toHaveValue('5');
    expect(screen.getByLabelText(/Disciplina/i)).toHaveValue('Ciências');
    expect(screen.getByLabelText(/Pergunta feita aos alunos/i)).toHaveValue('Explique a fotossíntese.');

    // Segunda questão: rubrica sugerida pela IA
    await user.click(screen.getByRole('tab', { name: /Questão 3/i }));
    expect(screen.getByLabelText(/Pergunta feita aos alunos/i)).toHaveValue('Descreva o caminho da água da raiz às folhas.');
    expect(screen.getByText(/sugerida pela IA/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Criar 2 atividades/i }));

    await waitFor(() => {
      expect(mockCreateActivity).toHaveBeenCalledTimes(2);
      expect(mockNavigate).toHaveBeenCalledWith('/activities', expect.anything());
    });
    expect(mockCreateActivity).toHaveBeenNthCalledWith(1, expect.objectContaining({
      title: 'Prova de Ciências — Questão 1: Fotossíntese',
      classId: 5,
      educationLevel: 'fundamental',
      dueDate: '2026-11-20',
      rubricCriteria: [{ criterio: 'Fontes de energia', peso: 2 }],
    }));
  });

  it('permite desmarcar questões e cria só as marcadas', async () => {
    const user = userEvent.setup();
    mockImportExam.mockResolvedValue(importResult);
    mockCreateActivity.mockResolvedValue({ message: 'OK', id: 20 });

    await uploadExam(user);
    await user.click(screen.getByRole('checkbox', { name: /questão 3/i }));
    await user.click(screen.getByRole('button', { name: /Criar 1 atividade/i }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/upload/20'));
    expect(mockCreateActivity).toHaveBeenCalledTimes(1);
  });

  it('oferece criar a turma lida na prova quando ela não existe', async () => {
    const user = userEvent.setup();
    mockImportExam.mockResolvedValue({
      ...importResult,
      exam: { ...importResult.exam, classText: '9º ano A' },
      suggestedClassId: null,
    });
    mockCreateClass.mockResolvedValue({
      message: 'OK',
      class: { id: 9, teacher_id: 1, name: '9º ano A' },
    });

    await uploadExam(user);
    await user.click(screen.getByRole('button', { name: /Criar turma “9º ano A”/i }));

    await waitFor(() => {
      expect(mockCreateClass).toHaveBeenCalledWith({ name: '9º ano A' });
      expect(screen.getByLabelText(/Turma/i, { selector: 'select' })).toHaveValue('9');
    });
  });

  it('mostra o erro do servidor quando a leitura falha', async () => {
    const user = userEvent.setup();
    mockImportExam.mockRejectedValue(new Error('Não encontramos questões dissertativas neste arquivo.'));

    renderSetup();
    const file = new File(['abc'], 'lista.txt', { type: 'text/plain' });
    await user.upload(screen.getByLabelText(/Arquivo da prova/i), file);

    expect(await screen.findByText(/Não encontramos questões dissertativas/i)).toBeInTheDocument();
  });
});

describe('SetupActivity — Questão de múltipla escolha', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exige gabarito e cria a atividade objetiva com as alternativas', async () => {
    const user = userEvent.setup();
    mockCreateActivity.mockResolvedValue({ message: 'OK', id: 77 });
    renderSetup();

    await user.click(screen.getByRole('radio', { name: /Múltipla escolha/i }));
    expect(screen.queryByRole('button', { name: /\+ Adicionar Critério/i })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/Título da Atividade/i), 'Quiz de células');
    await user.type(screen.getByLabelText(/Pergunta feita aos alunos/i), 'Qual organela faz fotossíntese?');
    await user.click(screen.getAllByRole('button', { name: /Remover alternativa/i })[3]);
    await user.click(screen.getAllByRole('button', { name: /Remover alternativa/i })[2]);
    await user.type(screen.getByLabelText(/Texto da alternativa A/i), 'Cloroplasto');
    await user.type(screen.getByLabelText(/Texto da alternativa B/i), 'Centríolo');

    await user.click(screen.getByRole('button', { name: /Próximo/i }));
    expect(await screen.findByText(/Marque qual alternativa é a correta/i)).toBeInTheDocument();
    expect(mockCreateActivity).not.toHaveBeenCalled();

    await user.click(screen.getByRole('radio', { name: /Alternativa A é a correta/i }));
    await user.click(screen.getByRole('button', { name: /Próximo/i }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/upload/77'));
    expect(mockCreateActivity).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Quiz de células',
      questionType: 'objetiva',
      options: [{ texto: 'Cloroplasto' }, { texto: 'Centríolo' }],
      correctOption: 'A',
      rubricCriteria: undefined,
    }));
  });
});
