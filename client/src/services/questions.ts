/**
 * Ajudantes para atividades com várias questões dissertativas.
 * O servidor guarda a lista em activity.questions e as respostas em response.answers (JSON).
 */
import type { Activity, ActivityQuestion, StudentResponse } from '../types';

export const MAX_QUESTIONS = 20;

/** Perguntas da atividade (sempre ao menos uma: a pergunta 1 vem de question/rubric). */
export function getActivityQuestions(activity: Pick<Activity, 'question' | 'rubric' | 'questions'>): ActivityQuestion[] {
  if (activity.questions) {
    try {
      const list = JSON.parse(activity.questions);
      if (Array.isArray(list) && list.length > 0) {
        return list.map((q) => ({ pergunta: String(q?.pergunta ?? ''), rubrica: String(q?.rubrica ?? '') }));
      }
    } catch {
      // cai para a pergunta única
    }
  }
  return [{ pergunta: activity.question, rubrica: activity.rubric }];
}

/** Separa "Questão 1: ...\n\nQuestão 2: ..." quando a resposta não veio separada. */
function splitByMarkers(text: string, count: number): string[] | null {
  const marker = /^[ \t]*(?:quest[ãa]o|q)[ \t]*(\d{1,2})[ \t]*[:.)\-–][ \t]*/gim;
  const hits: { num: number; start: number; contentStart: number }[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = marker.exec(text)) !== null) {
    const num = Number(m[1]);
    if (num > last && num <= count) {
      hits.push({ num, start: m.index, contentStart: m.index + m[0].length });
      last = num;
    }
  }
  if (hits.length < 2) return null;
  const answers = Array.from({ length: count }, () => '');
  hits.forEach((h, i) => {
    const end = i + 1 < hits.length ? hits[i + 1].start : text.length;
    const value = text.slice(h.contentStart, end).trim();
    answers[h.num - 1] = value === '(sem resposta)' ? '' : value;
  });
  return answers;
}

/** Respostas do aluno separadas por questão (sempre `count` itens). */
export function getResponseAnswers(
  response: Pick<StudentResponse, 'answers' | 'original_response'>,
  count: number
): string[] {
  if (response.answers) {
    try {
      const list = JSON.parse(response.answers);
      if (Array.isArray(list)) return Array.from({ length: count }, (_, i) => String(list[i] ?? ''));
    } catch {
      // tenta pelos marcadores
    }
  }
  const text = response.original_response || '';
  return splitByMarkers(text, count) ?? Array.from({ length: count }, (_, i) => (i === 0 ? text : ''));
}
