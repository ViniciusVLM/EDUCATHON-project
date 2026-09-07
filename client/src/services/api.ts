/* ════════════════════════════════════════════
   EDUCATHON — API Client Service
   ════════════════════════════════════════════ */

import type { Activity, ActivityWithResponses, Progress } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

/**
 * Helper para fazer requests com tratamento de erro padrão.
 */
async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Erro desconhecido' }));
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

export async function updateFeedback(feedbackId: number, teacherFeedback: string): Promise<{
  message: string;
  status: string;
}> {
  return request(`/feedback/${feedbackId}`, {
    method: 'PATCH',
    body: JSON.stringify({ teacherFeedback }),
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
  const response = await fetch(`${API_BASE}/activities/${activityId}/export`);

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
