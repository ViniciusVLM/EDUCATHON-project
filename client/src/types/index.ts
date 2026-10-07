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
}

export interface Progress {
  status: 'idle' | 'processing' | 'complete' | 'error';
  total: number;
  processed: number;
  errors: number;
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

