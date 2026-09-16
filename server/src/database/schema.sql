-- Educathon: Schema do Banco de Dados SQLite
-- Copiloto de Diagnóstico e Feedback Pedagógico

CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  question TEXT NOT NULL,
  rubric TEXT NOT NULL,
  education_level TEXT DEFAULT 'medio',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS student_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id INTEGER NOT NULL,
  student_name TEXT NOT NULL,
  original_response TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS feedbacks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_response_id INTEGER NOT NULL,
  ai_feedback_json TEXT,
  ai_feedback_text TEXT,
  teacher_feedback TEXT,
  status TEXT DEFAULT 'pendente' CHECK(status IN ('pendente', 'revisado', 'aprovado')),
  generated_at DATETIME,
  approved_at DATETIME,
  FOREIGN KEY (student_response_id) REFERENCES student_responses(id) ON DELETE CASCADE
);

-- Rastreia o progresso de geração de feedbacks por atividade.
-- Substitui o Map em memória do queue.js, sobrevivendo a restarts do servidor.
CREATE TABLE IF NOT EXISTS processing_jobs (
  activity_id INTEGER PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'idle' CHECK(status IN ('idle', 'processing', 'complete', 'error')),
  total INTEGER NOT NULL DEFAULT 0,
  processed INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE
);

-- Rastreia migrações de schema aplicadas.
-- Permite ALTER TABLE idempotente: só roda se a migração ainda não estiver registrada.
CREATE TABLE IF NOT EXISTS schema_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ── Fase 5: pré-requisito de autenticação ──────────────────────────────────

CREATE TABLE IF NOT EXISTS teachers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  school_year TEXT,
  FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT,
  class_id INTEGER,
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL
);
