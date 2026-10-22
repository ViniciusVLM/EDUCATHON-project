/* ════════════════════════════════════════════
   EDUCATHON — TypeScript Types
   ════════════════════════════════════════════ */

export interface Activity {
  id: number;
  title: string;
  question: string;
  rubric: string;
  education_level: string;
  created_at: string;
  // ── Fase 4.1, 5.1 e 5.2 ──
  subject?: string;
  class_id?: number | null;
  class_name?: string | null;
  class_code?: string | null;
  teacher_id?: number | null;
  due_date?: string | null;
  updated_at?: string | null;
  is_archived?: number; // 0 = ativo, 1 = arquivado
  rubric_criteria?: string | null; // JSON: [{criterio: string, peso: number}]
  // ── Questões objetivas ──
  question_type?: 'dissertativa' | 'objetiva';
  options?: string | null; // JSON: [{letra, texto}]
  correct_option?: string | null;
  // ── Várias questões dissertativas ──
  questions?: string | null; // JSON: [{pergunta, rubrica}] (só quando há mais de uma)
  ai_grade_enabled?: number; // 1 = a IA sugere uma nota (só o professor vê)
}

/** Uma pergunta de uma atividade com várias questões dissertativas. */
export interface ActivityQuestion {
  pergunta: string;
  rubrica: string;
}

export interface ObjectiveOption {
  letra: string;
  texto: string;
}

/** Correção automática de questão objetiva (pelo gabarito do professor). */
export interface ObjectiveResult {
  escolhida: string | null;
  correta: string;
  acertou: boolean;
}

export interface StudentResponse {
  id: number;
  activity_id: number;
  student_name: string;
  original_response: string;
  created_at: string;
  // ── Fase 4.2 ──
  student_id?: number | null;
  email?: string | null;
  submission_method?: 'csv' | 'manual' | null;
  word_count?: number | null;
  answers?: string | null; // JSON: uma resposta por questão (atividades com várias perguntas)
  ai_grade?: number | null; // nota sugerida pela IA (só o professor vê)
  ai_grade_reason?: string | null;
  updated_at?: string | null;
  // Joined feedback fields
  feedback_id: number | null;
  ai_feedback_json: string | null;
  ai_feedback_text: string | null;
  teacher_feedback: string | null;
  status: 'pendente' | 'revisado' | 'aprovado' | null;
  generated_at: string | null;
  approved_at: string | null;
  // ── Fase 4.3 (vindos do JOIN) ──
  ai_model?: string | null;
  teacher_rating?: -1 | 0 | 1 | null;
  criteria_scores?: string | null; // JSON: [{criterio, atendido: boolean}]
  sent_to_student_at?: string | null;
  // Nota de 0 a 10 lançada pelo professor (a IA nunca preenche)
  teacher_grade?: number | null;
  auto_result?: string | null; // JSON: ObjectiveResult
}

export interface ActivityStats {
  total_students: number;
  total_feedbacks: number;
  pending: number;
  reviewed: number;
  approved: number;
}

export interface ActivityWithResponses extends Activity {
  responses: StudentResponse[];
  stats: ActivityStats;
}

export interface FeedbackParsed {
  pontos_fortes: string;
  lacunas: string;
  sugestao_melhoria: string;
  feedback_completo: string;
  criterios_avaliacao?: CriterionScore[];
  nota_sugerida?: number;
  justificativa_nota?: string;
  /** Atividades com várias perguntas: o rascunho de cada questão */
  questoes?: (Omit<FeedbackParsed, 'questoes'> & { numero: number; sem_resposta?: boolean })[];
}

export interface Progress {
  status: 'idle' | 'processing' | 'complete' | 'error';
  total: number;
  processed: number;
  errors: number;
  /** Motivo da última falha (ex.: 'gemini_daily_quota' quando a cota do Gemini acabou) */
  last_error?: string | null;
}

// ── Fase 4.4: novas entidades ─────────────────────────────────────────────

export interface Teacher {
  id: number;
  name: string;
  email: string;
  created_at: string;
}

export interface Class {
  id: number;
  teacher_id: number;
  name: string;
  join_code?: string | null;
  code?: string | null;
  grade_level?: string | null;
  school_year?: string | null;
  created_at?: string;
  student_count?: number;
}

export interface ClassWithStudents extends Class {
  students: Student[];
}

export interface Student {
  id: number;
  name: string;
  email?: string | null;
  class_id?: number | null;
  created_at?: string;
  account_id?: number | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────

export type FilterType = 'todos' | 'pendente' | 'aprovado';

/** Parseia rubric_criteria de JSON string para array tipado */
export interface RubricCriterion {
  criterio: string;
  peso: number;
}

/** Parseia criteria_scores de JSON string para array tipado */
export interface CriterionScore {
  criterio: string;
  atendido: boolean;
  evidencia?: string;
}

// ── Fase 5.1: Autenticação ────────────────────────────────────────────────

export interface AuthTeacher {
  id: number;
  name: string;
  email: string;
  createdAt?: string;
  role?: 'teacher' | 'org_admin';
  organization?: { id: number; name: string } | null;
}

export interface AuthResponse {
  message: string;
  teacher: AuthTeacher;
  token: string;
}

// ── Fase 6B: Dashboard ──────────────────────────────────────────────────

export interface DashboardMetrics {
  total_activities: number;
  total_students: number;
  total_feedbacks: number;
  pending_review: number;
  reviewed: number;
  approved: number;
  generation_errors: number;
}

export interface DashboardPendingItem {
  activity_id: number;
  activity_title: string;
  type: 'pending_feedback' | 'generation_error' | 'generation_complete';
  count: number;
}

export interface DashboardRecentActivity {
  id: number;
  title: string;
  subject?: string | null;
  class_name?: string | null;
  due_date?: string | null;
  created_at: string;
  total_students: number;
  pending_review: number;
  approved: number;
}

export interface DashboardDeadline {
  activity_id: number;
  title: string;
  subject?: string | null;
  class_name?: string | null;
  due_date: string;
}

export interface DashboardReviewQueueItem {
  activity_id: number;
  title: string;
  total: number;
  approved: number;
  pending: number;
  progress_percent: number;
}

export interface DashboardSummary {
  teacher: {
    id: number;
    name: string;
  };
  metrics: DashboardMetrics;
  pending_review_items: DashboardPendingItem[];
  recent_activities: DashboardRecentActivity[];
  deadlines: DashboardDeadline[];
  review_queue: DashboardReviewQueueItem[];
}


// ── Leitura de provas (importar arquivo para o formulário de atividade) ──
export interface ExamImportQuestion {
  number: string;
  title: string;
  type?: 'dissertativa' | 'objetiva';
  options?: ObjectiveOption[];
  correctOption?: string | null;
  question: string;
  rubric: string;
  rubricFromDocument: boolean;
  criteria: { criterio: string; peso: number }[];
}

export interface ExamImportResult {
  fileName: string;
  sourceType: 'pdf' | 'docx' | 'image' | 'text';
  exam: {
    title: string | null;
    subject: string | null;
    educationLevel: 'fundamental' | 'medio' | 'superior' | null;
    dueDate: string | null;
    classText: string | null;
  };
  suggestedClassId: number | null;
  questions: ExamImportQuestion[];
  ignoredObjectiveQuestions: number;
  warnings: string[];
}


// ── Planos, cota de IA e chave própria ──────────────────────────────────
export interface QuotaStatus {
  entity: { type: 'teacher' | 'organization'; id: number; name: string };
  plan: { id: string; name: string; renewsAt: string | null };
  canManage: boolean;
  ownKey: { configured: boolean; last4: string | null; unreadable?: boolean };
  quota: number | null;
  used: number;
  usedWithOwnKey: number;
  remaining: number | null;
}

export interface PlanInfo {
  id: string;
  name: string;
  audience: 'todos' | 'professor' | 'instituicao';
  priceCents: number;
  monthlyQuota: number;
  description: string;
  features: string[];
}

export interface SimulatedPayment {
  id: number;
  plan: string;
  amount_cents: number;
  method: 'pix' | 'cartao';
  status: string;
  created_at: string;
}

export interface BillingInfo extends QuotaStatus {
  catalog: PlanInfo[];
  payments: SimulatedPayment[];
  simulated: boolean;
}

// ── Instituição ──────────────────────────────────────────────────────────
export interface OrgTeacher {
  id: number;
  name: string;
  email: string;
  role: 'teacher' | 'org_admin';
  classes: number;
  activities: number;
  usage_month: number;
}

export interface OrgClass {
  id: number;
  name: string;
  school_year: string | null;
  join_code: string | null;
  teacher_name: string;
  teacher_id: number;
  student_count: number;
  accounts_linked: number;
}

export interface OrgStudentAccount {
  id: number;
  name: string;
  email: string;
  class_id: number;
  class_name: string;
}

export interface OrgOverview {
  organization: { id: number; name: string; plan: string; plan_renews_at: string | null; created_at: string };
  quota: QuotaStatus;
  totals: { teachers: number; classes: number; studentsOnRoster: number; studentAccounts: number };
  teachers: OrgTeacher[];
  classes: OrgClass[];
  students: OrgStudentAccount[];
}

// ── Portal do aluno ──────────────────────────────────────────────────────
export interface StudentUser {
  id: number;
  name: string;
  email: string;
}

export interface StudentClass {
  id: number;
  name: string;
  school_year: string | null;
  teacher_name: string;
}

export interface StudentPortalActivity {
  id: number;
  title: string;
  subject: string;
  question: string;
  questionType: 'dissertativa' | 'objetiva';
  /** Várias perguntas: cada uma com a resposta do aluno (vazio quando é uma pergunta só) */
  questions: { numero: number; pergunta: string; resposta: string | null }[];
  options: ObjectiveOption[];
  dueDate: string | null;
  classId: number;
  className: string;
  teacherName: string;
  situation: 'sem_entrega' | 'em_correcao' | 'corrigida';
  myAnswer: string | null;
  feedback: string | null;
  grade: number | null;
  criteria: { criterio: string; atendido: boolean }[];
  objectiveResult: ObjectiveResult | null;
  approvedAt: string | null;
}

export interface StudentSubjectSummary {
  subject: string;
  activities: number;
  corrected: number;
  gradesCount: number;
  average: number | null;
}

// ── Leitura de provas respondidas (PDF/fotos) ───────────────────────────
export interface AnswerSheetStudent {
  name: string;
  page: number | null;
  answers: string[];
  note: string | null;
}

export interface AnswerSheetsResult {
  fileName: string;
  questionCount: number;
  questions: string[];
  students: AnswerSheetStudent[];
  warnings: string[];
}
