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
}

export interface StudentResponse {
  id: number;
  activity_id: number;
  student_name: string;
  original_response: string;
  created_at: string;
  // Joined feedback fields
  feedback_id: number | null;
  ai_feedback_json: string | null;
  ai_feedback_text: string | null;
  teacher_feedback: string | null;
  status: 'pendente' | 'revisado' | 'aprovado' | null;
  generated_at: string | null;
  approved_at: string | null;
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
}

export interface Progress {
  status: 'idle' | 'processing' | 'complete';
  total: number;
  processed: number;
  errors: number;
}

export type FilterType = 'todos' | 'pendente' | 'aprovado';
