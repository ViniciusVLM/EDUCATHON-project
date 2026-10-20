/* ════════════════════════════════════════════
   EDUCATHON — API Client Service
   ════════════════════════════════════════════ */

import type {
  Activity,
  ActivityWithResponses,
  Progress,
  AuthResponse,
  AuthTeacher,
  Class,
  ClassWithStudents,
  Student,
  CriterionScore,
  DashboardSummary,
  ExamImportResult,
  BillingInfo,
  QuotaStatus,
  OrgOverview,
  StudentUser,
  StudentClass,
  StudentPortalActivity,
  StudentSubjectSummary,
} from '../types';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
  if (token) {
    try {
      localStorage.setItem('educathon_token', token);
    } catch {
      // Ignora erro em ambientes sem localStorage
    }
  } else {
    try {
      localStorage.removeItem('educathon_token');
    } catch {
      // Ignora erro
    }
  }
}

export function getAuthToken(): string | null {
  if (!authToken) {
    try {
      authToken = localStorage.getItem('educathon_token');
    } catch {
      authToken = null;
    }
  }
  return authToken;
}

export async function getHealth(): Promise<{
  status: string;
  name: string;
  aiMode: 'mock' | 'gemini';
  timestamp: string;
}> {
  return request('/health');
}

/**
 * Helper para fazer requests com tratamento de erro padrão e injeção do token JWT.
 */
async function request<T>(url: string, options?: RequestInit, tokenOverride?: string | null): Promise<T> {
  const token = tokenOverride !== undefined ? tokenOverride : getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((options?.headers as Record<string, string>) || {}),
  };

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${url}`, {
      ...options,
      headers,
    });
  } catch {
    throw new Error('Não foi possível conectar ao servidor. Tente novamente em instantes.');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      error: 'Não foi possível conectar ao servidor. Tente novamente em instantes.',
    }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  // Para download de CSV
  if (response.headers.get('content-type')?.includes('text/csv')) {
    return response.text() as unknown as T;
  }

  return response.json();
}

// ──────────────────────────────────────────
// Activities
// ──────────────────────────────────────────

export async function createActivity(data: {
  title: string;
  question: string;
  rubric: string;
  educationLevel: string;
  subject?: string;
  classId?: number | null;
  dueDate?: string | null;
  rubricCriteria?: { criterio: string; peso: number }[];
  questionType?: 'dissertativa' | 'objetiva';
  options?: { texto: string }[];
  correctOption?: string;
  /** Perguntas 2, 3... de uma atividade dissertativa com várias perguntas */
  extraQuestions?: { question: string; rubric: string }[];
}): Promise<{ message: string; id: number }> {
  return request('/activities', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * Envia o arquivo de uma prova (PDF, .docx, foto ou .txt) para a IA ler e devolver
 * rascunhos de atividades. Nada é salvo: o professor revisa antes de criar.
 */
export async function importExam(fileName: string, dataBase64: string): Promise<ExamImportResult> {
  return request('/activities/import', {
    method: 'POST',
    body: JSON.stringify({ fileName, dataBase64 }),
  });
}

export async function getActivities(): Promise<Activity[]> {
  return request('/activities');
}

export async function getActivity(id: number): Promise<ActivityWithResponses> {
  return request(`/activities/${id}`);
}

// ──────────────────────────────────────────
// CSV Preview
// ──────────────────────────────────────────

export async function previewCSV(csvContent: string, questionCount = 1): Promise<{
  rows: { student_name: string; original_response: string; answers?: string[] }[];
  total: number;
}> {
  return request('/csv/preview', {
    method: 'POST',
    body: JSON.stringify({ csvContent, questionCount }),
  });
}

// ──────────────────────────────────────────
// Student Upload
// ──────────────────────────────────────────

export async function uploadCSV(activityId: number, csvContent: string): Promise<{
  message: string;
  count: number;
  studentIds: number[];
}> {
  return request(`/activities/${activityId}/upload`, {
    method: 'POST',
    body: JSON.stringify({ csvContent }),
  });
}

export async function addManualResponses(activityId: number, responses: {
  student_name: string;
  original_response?: string;
  /** Uma resposta por questão (atividades com várias perguntas) */
  answers?: string[];
}[]): Promise<{ message: string; count: number }> {
  return request(`/activities/${activityId}/manual`, {
    method: 'POST',
    body: JSON.stringify({ responses }),
  });
}

// ──────────────────────────────────────────
// Feedback
// ──────────────────────────────────────────

export async function generateFeedbacks(activityId: number): Promise<{
  message: string;
  total: number;
}> {
  return request(`/activities/${activityId}/generate`, {
    method: 'POST',
  });
}

export async function getProgress(activityId: number): Promise<Progress> {
  return request(`/activities/${activityId}/progress`);
}

export async function updateFeedback(
  feedbackId: number,
  data:
    | {
        teacherFeedback?: string;
        teacherRating?: -1 | 0 | 1 | null;
        criteriaScores?: CriterionScore[] | null;
        teacherGrade?: number | string | null;
      }
    | string
): Promise<{
  message: string;
  status: string;
  teacherGrade?: number | null;
}> {
  const body = typeof data === 'string' ? { teacherFeedback: data } : data;
  return request(`/feedback/${feedbackId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function approveFeedback(feedbackId: number): Promise<{
  message: string;
  status: string;
}> {
  return request(`/feedback/${feedbackId}/approve`, {
    method: 'POST',
  });
}

export async function regenerateFeedback(feedbackId: number): Promise<{
  message: string;
  feedbackId: number;
}> {
  return request(`/feedback/${feedbackId}/regenerate`, {
    method: 'POST',
  });
}

// ──────────────────────────────────────────
// Export
// ──────────────────────────────────────────

export async function exportCSV(activityId: number): Promise<void> {
  const token = getAuthToken();
  const response = await fetch(`${API_BASE}/activities/${activityId}/export`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Erro ao exportar' }));
    throw new Error(error.error);
  }

  // Trigger download
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `feedbacks_atividade_${activityId}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

// ──────────────────────────────────────────
// Auth (Fase 5.1)
// ──────────────────────────────────────────

export async function registerTeacher(data: {
  name: string;
  email: string;
  password: string;
}): Promise<AuthResponse> {
  const res = await request<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  setAuthToken(res.token);
  return res;
}

export async function loginTeacher(data: {
  email: string;
  password: string;
}): Promise<AuthResponse> {
  const res = await request<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  setAuthToken(res.token);
  return res;
}

export async function getMe(): Promise<{ teacher: AuthTeacher }> {
  return request<{ teacher: AuthTeacher }>('/auth/me');
}

// ──────────────────────────────────────────
// Classes & Students (Fase 5.2)
// ──────────────────────────────────────────

export async function getClasses(): Promise<Class[]> {
  return request<Class[]>('/classes');
}

export async function getClass(id: number): Promise<ClassWithStudents> {
  return request<ClassWithStudents>(`/classes/${id}`);
}

export async function createClass(data: {
  name: string;
  schoolYear?: string;
}): Promise<{ message: string; class: Class }> {
  return request<{ message: string; class: Class }>('/classes', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateClass(
  id: number,
  data: { name?: string; schoolYear?: string }
): Promise<{ message: string }> {
  return request<{ message: string }>(`/classes/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteClass(id: number): Promise<{ message: string }> {
  return request<{ message: string }>(`/classes/${id}`, {
    method: 'DELETE',
  });
}

export async function addStudent(
  classId: number,
  data: { name: string; email?: string }
): Promise<{ message: string; student: Student }> {
  return request<{ message: string; student: Student }>(`/classes/${classId}/students`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function addStudentsBatch(
  classId: number,
  students: { name: string; email?: string }[]
): Promise<{ message: string; count: number; students: Student[] }> {
  return request<{ message: string; count: number; students: Student[] }>(
    `/classes/${classId}/students`,
    {
      method: 'POST',
      body: JSON.stringify({ students }),
    }
  );
}

export async function deleteStudent(
  classId: number,
  studentId: number
): Promise<{ message: string }> {
  return request<{ message: string }>(`/classes/${classId}/students/${studentId}`, {
    method: 'DELETE',
  });
}

// ──────────────────────────────────────────
// Dashboard (Fase 6B)
// ──────────────────────────────────────────

export async function getDashboardSummary(): Promise<DashboardSummary> {
  return request<DashboardSummary>('/dashboard/summary');
}


// ──────────────────────────────────────────
// Código da turma, login com Google
// ──────────────────────────────────────────

export async function generateJoinCode(classId: number): Promise<{ message: string; joinCode: string }> {
  return request(`/classes/${classId}/join-code`, { method: 'POST' });
}

export async function loginTeacherWithGoogle(idToken: string): Promise<AuthResponse> {
  const res = await request<AuthResponse>('/auth/google', {
    method: 'POST',
    body: JSON.stringify({ idToken }),
  });
  setAuthToken(res.token);
  return res;
}

// ──────────────────────────────────────────
// Planos, cota e chave própria (pagamento SIMULADO)
// ──────────────────────────────────────────

export async function getBilling(): Promise<BillingInfo> {
  return request('/billing');
}

export async function simulateCheckout(plan: string, method: 'pix' | 'cartao'): Promise<{ message: string; status: QuotaStatus }> {
  return request('/billing/checkout', { method: 'POST', body: JSON.stringify({ plan, method }) });
}

export async function cancelPlan(): Promise<{ message: string; status: QuotaStatus }> {
  return request('/billing/cancel', { method: 'POST' });
}

export async function saveGeminiKey(apiKey: string): Promise<{ message: string; status: QuotaStatus }> {
  return request('/billing/api-key', { method: 'PUT', body: JSON.stringify({ apiKey }) });
}

export async function removeGeminiKey(): Promise<{ message: string; status: QuotaStatus }> {
  return request('/billing/api-key', { method: 'DELETE' });
}

// ──────────────────────────────────────────
// Instituição
// ──────────────────────────────────────────

export async function createOrganization(name: string): Promise<{ message: string; organization: { id: number; name: string } }> {
  return request('/org', { method: 'POST', body: JSON.stringify({ name }) });
}

export async function getOrganization(): Promise<OrgOverview> {
  return request('/org');
}

export async function createOrgTeacher(data: { name: string; email: string }): Promise<{ message: string; tempPassword: string }> {
  return request('/org/teachers', { method: 'POST', body: JSON.stringify(data) });
}

export async function removeOrgTeacher(teacherId: number): Promise<{ message: string }> {
  return request(`/org/teachers/${teacherId}`, { method: 'DELETE' });
}

export async function createOrgStudent(data: { name: string; email: string; classId: number }): Promise<{ message: string; tempPassword: string | null }> {
  return request('/org/students', { method: 'POST', body: JSON.stringify(data) });
}

export async function generateOrgJoinCode(classId: number): Promise<{ message: string; joinCode: string }> {
  return request(`/org/classes/${classId}/join-code`, { method: 'POST' });
}

// ──────────────────────────────────────────
// Portal do aluno (token separado do professor)
// ──────────────────────────────────────────

const STUDENT_TOKEN_KEY = 'educathon_student_token';

export function getStudentToken(): string | null {
  try {
    return localStorage.getItem(STUDENT_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStudentToken(token: string | null) {
  try {
    if (token) localStorage.setItem(STUDENT_TOKEN_KEY, token);
    else localStorage.removeItem(STUDENT_TOKEN_KEY);
  } catch {
    // Ignora ambientes sem localStorage
  }
}

interface StudentAuthResponse {
  message: string;
  student: StudentUser;
  token: string;
  joinedClass: { id: number; name: string } | null;
}

export async function registerStudent(data: {
  name: string;
  email: string;
  password: string;
  classCode: string;
}): Promise<StudentAuthResponse> {
  const res = await request<StudentAuthResponse>('/student-auth/register', { method: 'POST', body: JSON.stringify(data) }, null);
  setStudentToken(res.token);
  return res;
}

export async function loginStudent(data: { email: string; password: string }): Promise<StudentAuthResponse> {
  const res = await request<StudentAuthResponse>('/student-auth/login', { method: 'POST', body: JSON.stringify(data) }, null);
  setStudentToken(res.token);
  return res;
}

export async function loginStudentWithGoogle(idToken: string, classCode?: string): Promise<StudentAuthResponse> {
  const res = await request<StudentAuthResponse>(
    '/student-auth/google',
    { method: 'POST', body: JSON.stringify({ idToken, classCode: classCode || undefined }) },
    null
  );
  setStudentToken(res.token);
  return res;
}

export async function getStudentMe(): Promise<{ student: StudentUser; classes: StudentClass[] }> {
  return request('/student/me', undefined, getStudentToken());
}

export async function joinClassWithCode(classCode: string): Promise<{ message: string; class: StudentClass }> {
  return request('/student/join', { method: 'POST', body: JSON.stringify({ classCode }) }, getStudentToken());
}

export async function getStudentActivities(): Promise<{ subjects: StudentSubjectSummary[]; activities: StudentPortalActivity[] }> {
  return request('/student/activities', undefined, getStudentToken());
}

// ──────────────────────────────────────────
// Troca de senha (a sessão atual recebe um token novo; as outras saem)
// ──────────────────────────────────────────

export async function changeTeacherPassword(currentPassword: string, newPassword: string): Promise<{ message: string }> {
  const res = await request<{ message: string; token: string }>('/auth/password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  setAuthToken(res.token);
  return res;
}

export async function changeStudentPassword(currentPassword: string, newPassword: string): Promise<{ message: string }> {
  const res = await request<{ message: string; token: string }>(
    '/student/password',
    { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) },
    getStudentToken()
  );
  setStudentToken(res.token);
  return res;
}
