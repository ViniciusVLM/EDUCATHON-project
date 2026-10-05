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

/**
 * Helper para fazer requests com tratamento de erro padrão e injeção do token JWT.
 */
async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const token = getAuthToken();
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
}): Promise<{ message: string; id: number }> {
  return request('/activities', {
    method: 'POST',
    body: JSON.stringify(data),
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

export async function previewCSV(csvContent: string): Promise<{
  rows: { student_name: string; original_response: string }[];
  total: number;
}> {
  return request('/csv/preview', {
    method: 'POST',
    body: JSON.stringify({ csvContent }),
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
  original_response: string;
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
      }
    | string
): Promise<{
  message: string;
  status: string;
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

