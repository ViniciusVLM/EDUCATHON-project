/**
 * Planos (pagamento simulado), instituição e portal do aluno.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import * as api from '../services/api';
import Plans from '../pages/Plans';
import Institution from '../pages/Institution';
import StudentPortal from '../pages/student/StudentPortal';
import { StudentRegister } from '../pages/student/StudentAuth';
import type { BillingInfo, OrgOverview, StudentPortalActivity } from '../types';

const authState: { teacher: Record<string, unknown> | null } = { teacher: null };
const mockRefresh = vi.fn();
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ teacher: authState.teacher, refreshTeacher: mockRefresh }),
}));

vi.mock('../services/api', () => ({
  getBilling: vi.fn(),
  simulateCheckout: vi.fn(),
  cancelPlan: vi.fn(),
  saveGeminiKey: vi.fn(),
  removeGeminiKey: vi.fn(),
  createOrganization: vi.fn(),
  getOrganization: vi.fn(),
  createOrgTeacher: vi.fn(),
  removeOrgTeacher: vi.fn(),
  createOrgStudent: vi.fn(),
  generateOrgJoinCode: vi.fn(),
  getStudentMe: vi.fn(),
  getStudentActivities: vi.fn(),
  joinClassWithCode: vi.fn(),
  getStudentToken: vi.fn(),
  setStudentToken: vi.fn(),
  registerStudent: vi.fn(),
  loginStudent: vi.fn(),
  loginStudentWithGoogle: vi.fn(),
  changeStudentPassword: vi.fn(),
}));

const billing: BillingInfo = {
  entity: { type: 'teacher', id: 1, name: 'Profa. Lia' },
  plan: { id: 'gratuito', name: 'Gratuito', renewsAt: null },
  canManage: true,
  ownKey: { configured: false, last4: null },
  quota: 50,
  used: 50,
  usedWithOwnKey: 0,
  remaining: 0,
  simulated: true,
  payments: [],
  catalog: [
    { id: 'gratuito', name: 'Gratuito', audience: 'todos', priceCents: 0, monthlyQuota: 50, description: 'Para experimentar.', features: ['A'] },
    { id: 'professor', name: 'Professor Premium', audience: 'professor', priceCents: 2990, monthlyQuota: 1000, description: 'Para quem corrige muito.', features: ['B'] },
  ],
};

describe('Planos e pagamento simulado', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mostra cota esgotada e assina pelo checkout simulado', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getBilling).mockResolvedValueOnce(billing).mockResolvedValueOnce({
      ...billing,
      plan: { id: 'professor', name: 'Professor Premium', renewsAt: '2026-11-20 10:00:00' },
      quota: 1000,
      remaining: 950,
    });
    vi.mocked(api.simulateCheckout).mockResolvedValue({ message: 'Pagamento simulado aprovado! Plano ativado por 30 dias.', status: {} as never });

    render(<MemoryRouter><Plans /></MemoryRouter>);

    expect(await screen.findByText(/A cota acabou/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Assinar \(simulado\)/i }));

    const dialog = screen.getByRole('dialog', { name: /Assinar Professor Premium/i });
    expect(within(dialog).getByText(/nada é cobrado/i)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('tab', { name: 'Cartão' }));
    expect(within(dialog).getByLabelText(/Número do cartão/i)).toHaveAttribute('readonly');
    await user.click(within(dialog).getByRole('button', { name: /Simular pagamento aprovado/i }));

    await waitFor(() => expect(api.simulateCheckout).toHaveBeenCalledWith('professor', 'cartao'));
    expect(await screen.findByText(/Plano ativado por 30 dias/i)).toBeInTheDocument();
  });

  it('salva a chave própria do Gemini e limpa o campo', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getBilling).mockResolvedValue({ ...billing, used: 3, remaining: 47 });
    vi.mocked(api.saveGeminiKey).mockResolvedValue({ message: 'Chave salva.', status: {} as never });

    render(<MemoryRouter><Plans /></MemoryRouter>);
    const input = await screen.findByLabelText(/Chave da API do Gemini/i);
    expect(input).toHaveAttribute('type', 'password');
    await user.type(input, 'AIzaChaveDeTeste123456789');
    await user.click(screen.getByRole('button', { name: /Salvar chave/i }));

    await waitFor(() => expect(api.saveGeminiKey).toHaveBeenCalledWith('AIzaChaveDeTeste123456789'));
    expect(await screen.findByText('Chave salva.')).toBeInTheDocument();
  });

  it('professor de instituição não vê botões de assinatura', async () => {
    vi.mocked(api.getBilling).mockResolvedValue({
      ...billing,
      entity: { type: 'organization', id: 3, name: 'Escola X' },
      canManage: false,
      remaining: 10,
      used: 190,
      quota: 200,
    });
    render(<MemoryRouter><Plans /></MemoryRouter>);
    expect(await screen.findByText(/gerenciado pelo administrador/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Assinar/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Chave da API do Gemini/i)).not.toBeInTheDocument();
  });
});

const overview: OrgOverview = {
  organization: { id: 3, name: 'Escola Técnica Modelo', plan: 'gratuito', plan_renews_at: null, created_at: '' },
  quota: { ...billing, entity: { type: 'organization', id: 3, name: 'Escola Técnica Modelo' }, quota: 200, used: 12, remaining: 188 },
  totals: { teachers: 2, classes: 1, studentsOnRoster: 30, studentAccounts: 4 },
  teachers: [
    { id: 1, name: 'Coord. Marta', email: 'marta@x.org', role: 'org_admin', classes: 0, activities: 0, usage_month: 0 },
    { id: 2, name: 'Prof. Davi', email: 'davi@x.org', role: 'teacher', classes: 1, activities: 3, usage_month: 12 },
  ],
  classes: [{ id: 9, name: 'ADM T1', school_year: null, join_code: 'ADM-2345', teacher_name: 'Prof. Davi', teacher_id: 2, student_count: 30, accounts_linked: 4 }],
  students: [],
};

describe('Área da instituição', () => {
  beforeEach(() => vi.clearAllMocks());

  it('professor sem instituição pode criar uma', async () => {
    const user = userEvent.setup();
    authState.teacher = { id: 1, name: 'Marta', email: 'm@x.org', role: 'teacher', organization: null };
    vi.mocked(api.createOrganization).mockResolvedValue({ message: 'ok', organization: { id: 3, name: 'Escola' } });

    render(<MemoryRouter><Institution /></MemoryRouter>);
    await user.type(screen.getByLabelText(/Nome da instituição/i), 'Escola Técnica Modelo');
    await user.click(screen.getByRole('button', { name: /Criar instituição/i }));

    await waitFor(() => expect(api.createOrganization).toHaveBeenCalledWith('Escola Técnica Modelo'));
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('administrador vê a equipe e cria acesso com senha provisória', async () => {
    const user = userEvent.setup();
    authState.teacher = { id: 1, name: 'Marta', email: 'm@x.org', role: 'org_admin', organization: { id: 3, name: 'Escola Técnica Modelo' } };
    vi.mocked(api.getOrganization).mockResolvedValue(overview);
    vi.mocked(api.createOrgTeacher).mockResolvedValue({ message: 'Acesso criado para Ana.', tempPassword: 'Xy7kP2mQ9a' });

    render(<MemoryRouter><Institution /></MemoryRouter>);
    expect(await screen.findByText('Prof. Davi')).toBeInTheDocument();
    expect(screen.getByText(/12/, { selector: '.usage__big strong' })).toBeInTheDocument();

    await user.type(screen.getByLabelText('Nome'), 'Ana');
    await user.type(screen.getByLabelText('E-mail'), 'ana@x.org');
    await user.click(screen.getByRole('button', { name: /Criar acesso/i }));

    expect(await screen.findByText('Xy7kP2mQ9a')).toBeInTheDocument();
    expect(screen.getByText(/não será mostrada de novo/i)).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /Turmas/i }));
    expect(screen.getByText('ADM-2345')).toBeInTheDocument();
  });
});

const corrected: StudentPortalActivity = {
  id: 5,
  title: 'Quiz — Organelas',
  subject: 'Biologia',
  question: 'Qual organela faz fotossíntese?',
  questionType: 'objetiva',
  options: [{ letra: 'A', texto: 'Cloroplasto' }, { letra: 'B', texto: 'Centríolo' }],
  dueDate: null,
  classId: 1,
  className: '3º Ano B',
  teacherName: 'Prof. Demo',
  situation: 'corrigida',
  myAnswer: 'A',
  feedback: 'Mariana, você acertou!',
  grade: 9.5,
  criteria: [],
  objectiveResult: { escolhida: 'A', correta: 'A', acertou: true },
  approvedAt: '2026-10-19',
};

describe('Portal do aluno', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sem sessão, manda para o login do aluno', async () => {
    vi.mocked(api.getStudentToken).mockReturnValue(null);
    render(
      <MemoryRouter initialEntries={['/aluno']}>
        <Routes>
          <Route path="/aluno" element={<StudentPortal />} />
          <Route path="/aluno/entrar" element={<p>tela de login</p>} />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText('tela de login')).toBeInTheDocument();
  });

  it('mostra matérias, nota lançada pelo professor e feedback aprovado', async () => {
    vi.mocked(api.getStudentToken).mockReturnValue('tok');
    vi.mocked(api.getStudentMe).mockResolvedValue({
      student: { id: 1, name: 'Mariana Vasconcelos', email: 'm@a.org' },
      classes: [{ id: 1, name: '3º Ano B', school_year: '2026', teacher_name: 'Prof. Demo' }],
    });
    vi.mocked(api.getStudentActivities).mockResolvedValue({
      subjects: [{ subject: 'Biologia', activities: 2, corrected: 1, gradesCount: 1, average: 9.5 }],
      activities: [
        corrected,
        { ...corrected, id: 6, title: 'Fotossíntese', questionType: 'dissertativa', options: [], situation: 'em_correcao', feedback: null, grade: null, objectiveResult: null, myAnswer: 'As plantas...' },
      ],
    });

    render(<MemoryRouter><StudentPortal /></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: /Oi, Mariana!/i })).toBeInTheDocument();
    expect(screen.getByText('Média 9,5')).toBeInTheDocument();
    expect(screen.getByLabelText('Nota 9,5')).toBeInTheDocument();
    expect(screen.getByText('Mariana, você acertou!')).toBeInTheDocument();
    expect(screen.getByText('Em correção')).toBeInTheDocument();
    expect(screen.getByText('Trocar minha senha')).toBeInTheDocument();
  });

  it('entra em outra turma com o código', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getStudentToken).mockReturnValue('tok');
    vi.mocked(api.getStudentMe).mockResolvedValue({ student: { id: 1, name: 'Theo', email: 't@a.org' }, classes: [] });
    vi.mocked(api.getStudentActivities).mockResolvedValue({ subjects: [], activities: [] });
    vi.mocked(api.joinClassWithCode).mockResolvedValue({ message: 'Você entrou na turma 7º C!', class: {} as never });

    render(<MemoryRouter><StudentPortal /></MemoryRouter>);
    const input = await screen.findByLabelText('Código da turma');
    await user.type(input, 'abc-2345');
    await user.click(screen.getByRole('button', { name: /Entrar na turma/i }));

    await waitFor(() => expect(api.joinClassWithCode).toHaveBeenCalledWith('ABC-2345'));
    expect(await screen.findByText(/Você entrou na turma 7º C!/)).toBeInTheDocument();
  });

  it('cadastro já vem com o código do link do professor', async () => {
    const user = userEvent.setup();
    vi.mocked(api.registerStudent).mockResolvedValue({} as never);
    render(
      <MemoryRouter initialEntries={['/aluno/cadastro?codigo=bio-2026']}>
        <Routes>
          <Route path="/aluno/cadastro" element={<StudentRegister />} />
          <Route path="/aluno" element={<p>portal</p>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByLabelText(/Código da turma/i)).toHaveValue('BIO-2026');
    await user.type(screen.getByLabelText(/Nome completo/i), 'Theo Lima');
    await user.type(screen.getByLabelText(/^E-mail/i), 'theo@a.org');
    await user.type(screen.getByLabelText(/^Senha/i), 'senha-forte');
    await user.type(screen.getByLabelText(/Confirmar senha/i), 'senha-forte');
    await user.click(screen.getByRole('button', { name: /Criar conta e entrar na turma/i }));

    await waitFor(() => expect(api.registerStudent).toHaveBeenCalledWith({
      name: 'Theo Lima', email: 'theo@a.org', password: 'senha-forte', classCode: 'BIO-2026',
    }));
    expect(await screen.findByText('portal')).toBeInTheDocument();
  });
});
