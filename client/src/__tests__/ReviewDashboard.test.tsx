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
  approveAllFeedbacks: vi.fn().mockResolvedValue({ message: '2 feedback(s) aprovado(s).', approved: 2 }),
  getActivityInsights: vi.fn().mockResolvedValue(null),
  regenerateFeedback: vi.fn().mockResolvedValue({ message: 'OK', feedbackId: 10 }),
  setActivityAiGrade: vi.fn().mockResolvedValue({ message: 'Nota sugerida ligada.', aiGradeEnabled: true }),
}));

const mockGetActivity = vi.mocked(api.getActivity);
const mockUpdateFeedback = vi.mocked(api.updateFeedback);
const mockApproveFeedback = vi.mocked(api.approveFeedback);
const mockApproveAll = vi.mocked(api.approveAllFeedbacks);

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
        <Route path="/upload/:activityId" element={<p>upload aberto</p>} />
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
    expect(screen.getByRole('button', { name: /^✓ Atendido/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /✗ Não atendido/i })).toBeInTheDocument();

    // Professor clica no segundo critério para corrigir para atendido
    const toggleBtn = screen.getByRole('button', { name: /✗ Não atendido/i });
    await user.click(toggleBtn);

    // Agora ambos devem constar como atendidos na interface
    const attendedButtons = screen.getAllByRole('button', { name: /^✓ Atendido/i });
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
    const editor = screen.getByRole('textbox', { name: /Texto do feedback/i });
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
      expect(mockApproveFeedback).toHaveBeenCalledWith(201, expect.any(Number));
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
      // Uma chamada só ao servidor, que aprova todos numa transação
      expect(mockApproveAll).toHaveBeenCalledWith(1);
    });
    expect(mockApproveFeedback).not.toHaveBeenCalled();
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
      expect(mockApproveFeedback).toHaveBeenCalledWith(201, expect.any(Number));
    });
  });

  it('navega entre alunos com os atalhos Alt+ArrowRight e Alt+ArrowLeft', async () => {
    mockGetActivity.mockResolvedValue(multiStudentActivity);

    renderDashboard();

    // Espera o painel do aluno (e o atalho de teclado) estar pronto antes de apertar
    expect(await screen.findByText('As plantas usam a luz do sol e água para crescer.')).toBeInTheDocument();

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

describe('ReviewDashboard — Nota do professor e questão objetiva', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('salva só a nota sem mexer no texto (aceita vírgula)', async () => {
    const user = userEvent.setup();
    mockGetActivity.mockResolvedValue(sampleActivity);
    renderDashboard();

    const grade = await screen.findByLabelText(/Nota \(0 a 10\)/i);
    await user.type(grade, '8,5');
    await user.click(screen.getByRole('button', { name: /Salvar edição/i }));

    await waitFor(() => expect(mockUpdateFeedback).toHaveBeenCalledWith(201, { teacherGrade: 8.5 }));
  });

  it('recusa nota fora de 0 a 10', async () => {
    const user = userEvent.setup();
    mockGetActivity.mockResolvedValue(sampleActivity);
    renderDashboard();

    const grade = await screen.findByLabelText(/Nota \(0 a 10\)/i);
    await user.type(grade, '12');
    await user.click(screen.getByRole('button', { name: /Salvar edição/i }));

    expect(await screen.findByText(/A nota deve ser um número de 0 a 10/i)).toBeInTheDocument();
    expect(mockUpdateFeedback).not.toHaveBeenCalled();
  });

  it('mostra alternativa marcada e gabarito em questão objetiva', async () => {
    mockGetActivity.mockResolvedValue({
      ...sampleActivity,
      question_type: 'objetiva',
      options: JSON.stringify([
        { letra: 'A', texto: 'Cloroplasto' },
        { letra: 'B', texto: 'Centríolo' },
      ]),
      correct_option: 'A',
      responses: [
        {
          ...sampleActivity.responses[0],
          original_response: 'B',
          criteria_scores: null,
          auto_result: JSON.stringify({ escolhida: 'B', correta: 'A', acertou: false }),
        },
      ],
    });
    renderDashboard();

    expect(await screen.findByText(/✗ Marcou B/)).toBeInTheDocument();
    expect(screen.getByText(/Múltipla escolha · gabarito/i)).toBeInTheDocument();
    expect(screen.getByText('marcada')).toBeInTheDocument();
    expect(screen.getByText('gabarito')).toBeInTheDocument();
    expect(screen.queryByText(/Critérios da rubrica/i)).not.toBeInTheDocument();
  });
});

describe('ReviewDashboard — Nota sugerida pela IA', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mostra a sugestão só como sugestão e usa ao clicar, salvando como nota do professor', async () => {
    const user = userEvent.setup();
    mockGetActivity.mockResolvedValue({
      ...sampleActivity,
      ai_grade_enabled: 1,
      responses: [{ ...sampleActivity.responses[0], ai_grade: 6.5, ai_grade_reason: 'Citou luz e água; faltou CO2.' }],
    });
    renderDashboard();

    expect(await screen.findByText('Sugestão da IA')).toBeInTheDocument();
    expect(screen.getByText('Citou luz e água; faltou CO2.')).toBeInTheDocument();
    expect(screen.getByText(/Nota sugerida pela IA: ligada/i)).toBeInTheDocument();
    const grade = screen.getByLabelText(/Nota \(0 a 10\)/i);
    expect(grade).toHaveValue('');

    await user.click(screen.getByRole('button', { name: /Usar sugestão/i }));
    expect(grade).toHaveValue('6,5');
    await user.click(screen.getByRole('button', { name: /Salvar edição/i }));
    await waitFor(() => expect(mockUpdateFeedback).toHaveBeenCalledWith(201, { teacherGrade: 6.5 }));
  });

  it('liga a nota sugerida numa atividade que estava desligada', async () => {
    const user = userEvent.setup();
    mockGetActivity.mockResolvedValue(sampleActivity);
    renderDashboard();

    expect(await screen.findByText(/Nota sugerida pela IA: desligada/i)).toBeInTheDocument();
    expect(screen.queryByText('Sugestão da IA')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ligar' }));
    await waitFor(() => expect(api.setActivityAiGrade).toHaveBeenCalledWith(1, true));
    expect(await screen.findByText(/Nota sugerida pela IA: ligada/i)).toBeInTheDocument();
    expect(screen.getByText(/Use "Regenerar"/)).toBeInTheDocument();
  });
});

describe('ReviewDashboard — atividade sem respostas', () => {
  it('explica e leva para o envio de respostas', async () => {
    const user = userEvent.setup();
    mockGetActivity.mockResolvedValue({
      ...sampleActivity,
      responses: [],
      stats: { total_students: 0, total_feedbacks: 0, pending: 0, reviewed: 0, approved: 0 },
    });
    renderDashboard();
    expect(await screen.findByText('Esta atividade ainda não tem respostas')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Enviar respostas dos alunos/i }));
    expect(await screen.findByText('upload aberto')).toBeInTheDocument();
  });
});

describe('ReviewDashboard — cota do Gemini esgotada', () => {
  it('explica que a cota acabou em vez de um erro genérico', async () => {
    mockGetActivity.mockResolvedValue({
      ...sampleActivity,
      responses: [{ ...sampleActivity.responses[0], feedback_id: null, ai_feedback_text: null, ai_feedback_json: null, status: null }],
    });
    vi.mocked(api.getProgress).mockResolvedValueOnce({ status: 'error', total: 3, processed: 1, errors: 1, last_error: 'gemini_daily_quota' });
    renderDashboard();
    expect(await screen.findByText('A cota gratuita do Gemini acabou por hoje.')).toBeInTheDocument();
    expect(screen.getByText(/parou para não gastar tentativas/i)).toBeInTheDocument();
  });
});

describe('ReviewDashboard — aba "A revisar" e tempo de revisão', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('a aba "A revisar" inclui os feedbacks editados e ainda não aprovados', async () => {
    const user = userEvent.setup();
    mockGetActivity.mockResolvedValue({
      ...multiStudentActivity,
      stats: { total_students: 3, total_feedbacks: 3, pending: 1, reviewed: 1, approved: 1 },
      responses: [
        { ...multiStudentActivity.responses[0], status: 'revisado', teacher_feedback: 'Editado pelo professor.' },
        { ...multiStudentActivity.responses[1], status: 'aprovado' },
        {
          ...multiStudentActivity.responses[1],
          id: 103,
          feedback_id: 203,
          student_name: 'Diana Lopes',
          status: 'pendente',
        },
      ],
    });
    renderDashboard();

    const tab = await screen.findByRole('button', { name: /A revisar \(2\)/ });
    await user.click(tab);

    const sidebar = document.querySelector('.review-sidebar') as HTMLElement;
    expect(sidebar).toHaveTextContent('Beatriz Santos');
    expect(sidebar).toHaveTextContent('Diana Lopes');
    expect(sidebar).not.toHaveTextContent('Carlos Dias');
  });

  it('envia o tempo de revisão do aluno ao aprovar', async () => {
    const user = userEvent.setup();
    let now = 1_000_000;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    mockGetActivity.mockResolvedValue(sampleActivity);

    renderDashboard();
    await waitFor(() => expect(screen.getAllByText('Beatriz Santos').length).toBeGreaterThan(0));

    now += 95_000; // o professor passou 95 s revisando
    await user.click(screen.getByRole('button', { name: /Aprovar$/i }));

    await waitFor(() => expect(mockApproveFeedback).toHaveBeenCalledWith(201, 95));
    nowSpy.mockRestore();
  });
  it('na aba "A revisar", aprovar abre o próximo aluno sem pular ninguém', async () => {
    const user = userEvent.setup();
    const base = multiStudentActivity.responses[0];
    const mk = (id: number, name: string, text: string, status: 'pendente' | 'aprovado') => ({
      ...base, id, feedback_id: id + 100, student_name: name, original_response: text, status,
    });
    const before = {
      ...multiStudentActivity,
      stats: { total_students: 3, total_feedbacks: 3, pending: 3, reviewed: 0, approved: 0 },
      responses: [mk(1, 'Ana', 'Resposta da Ana.', 'pendente'), mk(2, 'Bruno', 'Resposta do Bruno.', 'pendente'), mk(3, 'Caio', 'Resposta do Caio.', 'pendente')],
    };
    const after = { ...before, responses: [mk(1, 'Ana', 'Resposta da Ana.', 'aprovado'), before.responses[1], before.responses[2]] };
    mockGetActivity.mockResolvedValue(before);
    renderDashboard();

    await user.click(await screen.findByRole('button', { name: /A revisar \(3\)/ }));
    expect(await screen.findByText('Resposta da Ana.')).toBeInTheDocument();

    mockGetActivity.mockResolvedValue(after);
    await user.click(screen.getByRole('button', { name: /Aprovar$/i }));
    expect(await screen.findByText('Resposta do Bruno.')).toBeInTheDocument();
    expect(screen.queryByText('Resposta do Caio.')).not.toBeInTheDocument();
  });

  it('se a aprovação falhar, o tempo de revisão não se perde', async () => {
    const user = userEvent.setup();
    let now = 2_000_000;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    mockGetActivity.mockResolvedValue(sampleActivity);
    renderDashboard();
    await screen.findByText('As plantas usam a luz do sol e água para crescer.');

    now += 30_000;
    mockApproveFeedback.mockRejectedValueOnce(new Error('Servidor fora do ar.'));
    await user.click(screen.getByRole('button', { name: /Aprovar$/i }));
    expect(await screen.findByText('Servidor fora do ar.')).toBeInTheDocument();

    now += 20_000;
    await user.click(screen.getByRole('button', { name: /Aprovar$/i }));
    await waitFor(() => expect(mockApproveFeedback).toHaveBeenLastCalledWith(201, 50));
    nowSpy.mockRestore();
  });

  it('a aba "A revisar" não conta alunos que ainda não têm feedback', async () => {
    mockGetActivity.mockResolvedValue({
      ...multiStudentActivity,
      responses: [
        multiStudentActivity.responses[0],
        { ...multiStudentActivity.responses[1], feedback_id: null, ai_feedback_text: null, status: null },
      ],
    });
    renderDashboard();
    expect(await screen.findByRole('button', { name: /A revisar \(1\)/ })).toBeInTheDocument();
  });
  it('o professor avalia o rascunho da IA sem mudar o status; clicar de novo apaga', async () => {
    const user = userEvent.setup();
    mockGetActivity.mockResolvedValue(sampleActivity);
    renderDashboard();
    await screen.findByText('As plantas usam a luz do sol e água para crescer.');

    const helped = screen.getByRole('button', { name: 'Ajudou' });
    expect(helped).toHaveAttribute('aria-pressed', 'false');
    await user.click(helped);
    await waitFor(() => expect(mockUpdateFeedback).toHaveBeenCalledWith(201, { teacherRating: 1 }));
    expect(screen.getByRole('button', { name: 'Ajudou' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Ajudou' }));
    await waitFor(() => expect(mockUpdateFeedback).toHaveBeenLastCalledWith(201, { teacherRating: null }));
    expect(screen.getByRole('button', { name: 'Ajudou' })).toHaveAttribute('aria-pressed', 'false');
  });
});
