import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// DB_PATH pode ser sobrescrito por variável de ambiente (útil em testes com :memory:)
const DB_PATH = process.env.DB_PATH || join(__dirname, '..', '..', 'educathon.db');
const SCHEMA_PATH = join(__dirname, 'schema.sql');

/**
 * Lista de migrações de schema ordenadas.
 * Cada entrada tem um nome único e um array de SQLs a executar em transação.
 * Uma migração só roda se ainda NÃO estiver registrada em schema_migrations.
 *
 * ⚠️ Regra: nunca editar ou remover uma migração já aplicada em produção.
 *    Sempre adicione novas entradas ao final da lista.
 */
const MIGRATIONS = [
  // ── Fase 4.1: novos campos em activities ─────────────────────────────────
  {
    name: '004_activities_new_fields',
    sqls: [
      'ALTER TABLE activities ADD COLUMN subject TEXT',
      'ALTER TABLE activities ADD COLUMN class_id INTEGER',
      'ALTER TABLE activities ADD COLUMN due_date DATETIME',
      'ALTER TABLE activities ADD COLUMN updated_at DATETIME',
      'ALTER TABLE activities ADD COLUMN is_archived INTEGER DEFAULT 0',
      // JSON: [{criterio: string, peso: number}] — permite scoring por critério
      'ALTER TABLE activities ADD COLUMN rubric_criteria TEXT',
    ],
  },
  // ── Fase 4.2: novos campos em student_responses ───────────────────────────
  {
    name: '005_student_responses_new_fields',
    sqls: [
      'ALTER TABLE student_responses ADD COLUMN student_id INTEGER',
      'ALTER TABLE student_responses ADD COLUMN email TEXT',
      "ALTER TABLE student_responses ADD COLUMN submission_method TEXT CHECK(submission_method IN ('csv','manual'))",
      'ALTER TABLE student_responses ADD COLUMN word_count INTEGER',
      'ALTER TABLE student_responses ADD COLUMN updated_at DATETIME',
    ],
  },
  // ── Fase 4.3: novos campos em feedbacks ──────────────────────────────────
  {
    name: '006_feedbacks_new_fields',
    sqls: [
      // Registra qual modelo de IA gerou o feedback (essencial desde que o modelo é configurável)
      'ALTER TABLE feedbacks ADD COLUMN ai_model TEXT',
      // Avaliação do professor sobre a qualidade do feedback da IA: -1 (ruim), 0 (ok), 1 (ótimo)
      'ALTER TABLE feedbacks ADD COLUMN teacher_rating INTEGER',
      // JSON: [{criterio, atendido: boolean}] — ligado a rubric_criteria da atividade
      'ALTER TABLE feedbacks ADD COLUMN criteria_scores TEXT',
      // Preenchido quando o feedback é enviado ao aluno (Fase 5.3)
      'ALTER TABLE feedbacks ADD COLUMN sent_to_student_at DATETIME',
    ],
  },
  // ── Fase 5.1: vínculo de professor com atividades ─────────────────────────
  {
    name: '007_activities_teacher_id',
    sqls: [
      'ALTER TABLE activities ADD COLUMN teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL',
    ],
  },
  // ── Fase 3: unicidade de feedback por resposta ─────────────────────────────
  {
    name: '008_feedbacks_unique_student_response',
    sqls: [
      'DELETE FROM feedbacks WHERE id NOT IN (SELECT MAX(id) FROM feedbacks GROUP BY student_response_id)',
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_feedbacks_student_response_id ON feedbacks(student_response_id)',
    ],
  },
];

/**
 * Executa migrações pendentes de forma idempotente.
 * Registra cada migração em schema_migrations antes de prosseguir.
 */
function runMigrations(database) {
  const applied = new Set(
    database.prepare('SELECT name FROM schema_migrations').all().map((r) => r.name)
  );

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.name)) continue;

    console.log(`🔄 Aplicando migração: ${migration.name}`);
    database.transaction(() => {
      for (const sql of migration.sqls) {
        database.prepare(sql).run();
      }
      database.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(migration.name);
    })();
    console.log(`✅ Migração aplicada: ${migration.name}`);
  }
}

let db;

/**
 * Inicializa e retorna a conexão com o banco SQLite.
 * Cria as tabelas automaticamente se não existirem e aplica migrações pendentes.
 */
export function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    // Executa o schema para criar tabelas base
    const schema = readFileSync(SCHEMA_PATH, 'utf-8');
    db.exec(schema);

    // Aplica migrações de ALTER TABLE pendentes (idempotente)
    runMigrations(db);

    console.log('✅ Banco de dados SQLite conectado:', DB_PATH);
  }
  return db;
}

// ──────────────────────────────────────────
// Helpers: Teachers (Fase 5.1)
// ──────────────────────────────────────────

export function createTeacher({ name, email, passwordHash }) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO teachers (name, email, password_hash)
    VALUES (?, ?, ?)
  `);
  const normalizedEmail = email.toLowerCase().trim();
  const result = stmt.run(name.trim(), normalizedEmail, passwordHash);
  return { id: result.lastInsertRowid, name: name.trim(), email: normalizedEmail };
}

export function getTeacherByEmail(email) {
  const db = getDb();
  return db.prepare('SELECT * FROM teachers WHERE email = ?').get(email.toLowerCase().trim());
}

export function getTeacherById(id) {
  const db = getDb();
  return db.prepare('SELECT id, name, email, created_at FROM teachers WHERE id = ?').get(id);
}

// ──────────────────────────────────────────
// Helpers: Classes & Students (Fase 5.2)
// ──────────────────────────────────────────

export function createClass({ teacherId, name, schoolYear }) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO classes (teacher_id, name, school_year)
    VALUES (?, ?, ?)
  `);
  const result = stmt.run(teacherId, name.trim(), schoolYear ? schoolYear.trim() : null);
  return { id: result.lastInsertRowid, teacher_id: teacherId, name: name.trim(), school_year: schoolYear || null };
}

export function getClassesByTeacher(teacherId) {
  const db = getDb();
  return db.prepare(`
    SELECT c.*, COUNT(s.id) as student_count
    FROM classes c
    LEFT JOIN students s ON s.class_id = c.id
    WHERE c.teacher_id = ?
    GROUP BY c.id
    ORDER BY c.name ASC
  `).all(teacherId);
}

export function getClassById(id, teacherId = null) {
  const db = getDb();
  const query = teacherId
    ? 'SELECT * FROM classes WHERE id = ? AND teacher_id = ?'
    : 'SELECT * FROM classes WHERE id = ?';
  const params = teacherId ? [id, teacherId] : [id];
  const cls = db.prepare(query).get(...params);
  if (!cls) return null;

  const students = db.prepare('SELECT * FROM students WHERE class_id = ? ORDER BY name ASC').all(id);
  return { ...cls, students };
}

export function updateClass(id, teacherId, { name, schoolYear }) {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE classes
    SET name = COALESCE(?, name),
        school_year = COALESCE(?, school_year)
    WHERE id = ? AND teacher_id = ?
  `);
  return stmt.run(
    name !== undefined ? name.trim() : null,
    schoolYear !== undefined ? schoolYear.trim() : null,
    id,
    teacherId
  );
}

export function deleteClass(id, teacherId) {
  const db = getDb();
  return db.prepare('DELETE FROM classes WHERE id = ? AND teacher_id = ?').run(id, teacherId);
}

export function createStudent({ classId, name, email }) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO students (class_id, name, email)
    VALUES (?, ?, ?)
  `);
  const normalizedEmail = email ? email.toLowerCase().trim() : null;
  const result = stmt.run(classId, name.trim(), normalizedEmail);
  return { id: result.lastInsertRowid, class_id: classId, name: name.trim(), email: normalizedEmail };
}

export function createStudentsBatch(classId, students) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO students (class_id, name, email)
    VALUES (?, ?, ?)
  `);

  const insertMany = db.transaction((items) => {
    const created = [];
    for (const item of items) {
      if (!item.name || !item.name.trim()) continue;
      const normalizedEmail = item.email ? item.email.toLowerCase().trim() : null;
      const result = stmt.run(classId, item.name.trim(), normalizedEmail);
      created.push({ id: result.lastInsertRowid, class_id: classId, name: item.name.trim(), email: normalizedEmail });
    }
    return created;
  });

  return insertMany(students);
}

export function getStudentsByClass(classId) {
  const db = getDb();
  return db.prepare('SELECT * FROM students WHERE class_id = ? ORDER BY name ASC').all(classId);
}

export function deleteStudent(studentId) {
  const db = getDb();
  return db.prepare('DELETE FROM students WHERE id = ?').run(studentId);
}

/**
 * Remove um aluno garantindo que ele pertence à turma informada.
 * Impede IDOR: professor A não pode apagar aluno da turma de professor B.
 * Retorna o resultado do run() — changes === 0 significa que o aluno
 * não existe ou não pertence à turma especificada.
 */
export function deleteStudentFromClass(studentId, classId) {
  const db = getDb();
  return db.prepare('DELETE FROM students WHERE id = ? AND class_id = ?').run(studentId, classId);
}

// ──────────────────────────────────────────
// Helpers: Activities
// ──────────────────────────────────────────

export function createActivity({
  title,
  question,
  rubric,
  educationLevel,
  subject,
  classId,
  dueDate,
  rubricCriteria,
  teacherId,
}) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO activities (title, question, rubric, education_level, subject, class_id, due_date, rubric_criteria, teacher_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    title,
    question,
    rubric,
    educationLevel || 'medio',
    subject || null,
    classId || null,
    dueDate || null,
    rubricCriteria
      ? (typeof rubricCriteria === 'string' ? rubricCriteria : JSON.stringify(rubricCriteria))
      : null,
    teacherId || null
  );
  return { id: result.lastInsertRowid };
}

export function getActivity(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM activities WHERE id = ?').get(id);
}

/**
 * Lista atividades do professor logado.
 * IDOR fix: removido o filtro `OR teacher_id IS NULL` que expunha
 * atividades sem dono a todos os professores autenticados.
 * As rotas já estão atrás de requireAuth, então teacherId nunca é null
 * num contexto de request real.
 */
export function getAllActivities(teacherId) {
  const db = getDb();
  return db.prepare('SELECT * FROM activities WHERE teacher_id = ? ORDER BY created_at DESC').all(teacherId);
}

/**
 * Retorna uma atividade se e somente se o teacher_id coincidir.
 * Usar em rotas que precisam checar posse antes de agir.
 */
export function getActivityIfOwned(activityId, teacherId) {
  const db = getDb();
  return db.prepare('SELECT * FROM activities WHERE id = ? AND teacher_id = ?').get(activityId, teacherId);
}

// ──────────────────────────────────────────
// Helpers: Student Responses
// ──────────────────────────────────────────

export function addResponses(activityId, responses, defaultMethod = 'manual') {
  const db = getDb();
  const activity = db.prepare('SELECT id, class_id FROM activities WHERE id = ?').get(activityId);

  // Se a atividade possui uma turma associada, busca os alunos cadastrados para reconciliação
  let registeredStudents = [];
  if (activity?.class_id) {
    registeredStudents = db.prepare('SELECT id, name, email FROM students WHERE class_id = ?').all(activity.class_id);
  }

  const normalize = (str) =>
    (str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  const stmt = db.prepare(`
    INSERT INTO student_responses (
      activity_id, student_name, original_response, student_id, email, submission_method, word_count
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((items) => {
    const ids = [];
    for (const item of items) {
      const text = item.original_response || '';
      const wordCount = item.word_count !== undefined && item.word_count !== null
        ? item.word_count
        : (text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0);
      const method = item.submission_method || defaultMethod;

      let matchedStudentId = item.student_id || null;
      let studentEmail = item.email ? item.email.trim().toLowerCase() : null;

      // Reconciliação com alunos cadastrados da turma
      if (!matchedStudentId && registeredStudents.length > 0) {
        const itemNormName = normalize(item.student_name);
        const itemEmail = studentEmail;

        const matched = registeredStudents.find((s) => {
          if (itemEmail && s.email && s.email.toLowerCase() === itemEmail) {
            return true;
          }
          return normalize(s.name) === itemNormName;
        });

        if (matched) {
          matchedStudentId = matched.id;
          if (!studentEmail && matched.email) {
            studentEmail = matched.email;
          }
        }
      }

      const result = stmt.run(
        activityId,
        item.student_name,
        text,
        matchedStudentId,
        studentEmail,
        method,
        wordCount
      );
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
           f.teacher_feedback, f.status, f.generated_at, f.approved_at,
           f.ai_model, f.teacher_rating, f.criteria_scores, f.sent_to_student_at
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

export function saveFeedback(studentResponseId, aiFeedbackJson, aiFeedbackText, aiModel = null, criteriaScores = null) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO feedbacks (student_response_id, ai_feedback_json, ai_feedback_text, ai_model, criteria_scores, status, generated_at)
    VALUES (?, ?, ?, ?, ?, 'pendente', datetime('now'))
  `);
  const formattedCriteria = criteriaScores !== null && criteriaScores !== undefined
    ? (typeof criteriaScores === 'string' ? criteriaScores : JSON.stringify(criteriaScores))
    : null;
  const result = stmt.run(studentResponseId, aiFeedbackJson, aiFeedbackText, aiModel, formattedCriteria);
  return { id: result.lastInsertRowid };
}

export function updateFeedback(feedbackId, teacherFeedback, teacherRating = null, criteriaScores = null) {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE feedbacks
    SET teacher_feedback = COALESCE(?, teacher_feedback),
        teacher_rating = COALESCE(?, teacher_rating),
        criteria_scores = COALESCE(?, criteria_scores),
        status = 'revisado'
    WHERE id = ?
  `);
  return stmt.run(
    teacherFeedback !== undefined ? teacherFeedback : null,
    teacherRating !== undefined ? teacherRating : null,
    criteriaScores !== null && criteriaScores !== undefined
      ? (typeof criteriaScores === 'string' ? criteriaScores : JSON.stringify(criteriaScores))
      : null,
    feedbackId
  );
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
