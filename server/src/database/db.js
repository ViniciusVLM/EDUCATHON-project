import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH = join(__dirname, '..', '..', 'educathon.db');
const SCHEMA_PATH = join(__dirname, 'schema.sql');

let db;

/**
 * Inicializa e retorna a conexão com o banco SQLite.
 * Cria as tabelas automaticamente se não existirem.
 */
export function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    // Executa o schema para criar tabelas
    const schema = readFileSync(SCHEMA_PATH, 'utf-8');
    db.exec(schema);

    console.log('✅ Banco de dados SQLite conectado:', DB_PATH);
  }
  return db;
}

// ──────────────────────────────────────────
// Helpers: Activities
// ──────────────────────────────────────────

export function createActivity({ title, question, rubric, educationLevel }) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO activities (title, question, rubric, education_level)
    VALUES (?, ?, ?, ?)
  `);
  const result = stmt.run(title, question, rubric, educationLevel || 'medio');
  return { id: result.lastInsertRowid };
}

export function getActivity(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM activities WHERE id = ?').get(id);
}

export function getAllActivities() {
  const db = getDb();
  return db.prepare('SELECT * FROM activities ORDER BY created_at DESC').all();
}

// ──────────────────────────────────────────
// Helpers: Student Responses
// ──────────────────────────────────────────

export function addResponses(activityId, responses) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO student_responses (activity_id, student_name, original_response)
    VALUES (?, ?, ?)
  `);

  const insertMany = db.transaction((items) => {
    const ids = [];
    for (const item of items) {
      const result = stmt.run(activityId, item.student_name, item.original_response);
      ids.push(result.lastInsertRowid);
    }
    return ids;
  });

  return insertMany(responses);
}

export function getResponsesByActivity(activityId) {
  const db = getDb();
  return db.prepare(`
    SELECT sr.*, f.id as feedback_id, f.ai_feedback_json, f.ai_feedback_text,
           f.teacher_feedback, f.status, f.generated_at, f.approved_at
    FROM student_responses sr
    LEFT JOIN feedbacks f ON f.student_response_id = sr.id
    WHERE sr.activity_id = ?
    ORDER BY sr.student_name ASC
  `).all(activityId);
}

export function getResponseCount(activityId) {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) as count FROM student_responses WHERE activity_id = ?').get(activityId);
  return row.count;
}

// ──────────────────────────────────────────
// Helpers: Feedbacks
// ──────────────────────────────────────────

export function saveFeedback(studentResponseId, aiFeedbackJson, aiFeedbackText) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO feedbacks (student_response_id, ai_feedback_json, ai_feedback_text, status, generated_at)
    VALUES (?, ?, ?, 'pendente', datetime('now'))
  `);
  const result = stmt.run(studentResponseId, aiFeedbackJson, aiFeedbackText);
  return { id: result.lastInsertRowid };
}

export function updateFeedback(feedbackId, teacherFeedback) {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE feedbacks
    SET teacher_feedback = ?, status = 'revisado'
    WHERE id = ?
  `);
  return stmt.run(teacherFeedback, feedbackId);
}

export function approveFeedback(feedbackId) {
  const db = getDb();
  // Se o professor não editou, usa o texto da IA como feedback final
  const feedback = db.prepare('SELECT * FROM feedbacks WHERE id = ?').get(feedbackId);
  if (!feedback) return null;

  const finalText = feedback.teacher_feedback || feedback.ai_feedback_text;
  const stmt = db.prepare(`
    UPDATE feedbacks
    SET teacher_feedback = ?, status = 'aprovado', approved_at = datetime('now')
    WHERE id = ?
  `);
  return stmt.run(finalText, feedbackId);
}

export function getFeedback(feedbackId) {
  const db = getDb();
  return db.prepare(`
    SELECT f.*, sr.student_name, sr.original_response
    FROM feedbacks f
    JOIN student_responses sr ON sr.id = f.student_response_id
    WHERE f.id = ?
  `).get(feedbackId);
}

export function getActivityStats(activityId) {
  const db = getDb();
  const stats = db.prepare(`
    SELECT
      COUNT(sr.id) as total_students,
      COUNT(f.id) as total_feedbacks,
      SUM(CASE WHEN f.status = 'pendente' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN f.status = 'revisado' THEN 1 ELSE 0 END) as reviewed,
      SUM(CASE WHEN f.status = 'aprovado' THEN 1 ELSE 0 END) as approved
    FROM student_responses sr
    LEFT JOIN feedbacks f ON f.student_response_id = sr.id
    WHERE sr.activity_id = ?
  `).get(activityId);
  return stats;
}

export function getExportData(activityId) {
  const db = getDb();
  return db.prepare(`
    SELECT sr.student_name, sr.original_response,
           COALESCE(f.teacher_feedback, f.ai_feedback_text) as feedback_final,
           f.status
    FROM student_responses sr
    LEFT JOIN feedbacks f ON f.student_response_id = sr.id
    WHERE sr.activity_id = ?
    ORDER BY sr.student_name ASC
  `).all(activityId);
}

export function deleteFeedbackByResponseId(studentResponseId) {
  const db = getDb();
  return db.prepare('DELETE FROM feedbacks WHERE student_response_id = ?').run(studentResponseId);
}
