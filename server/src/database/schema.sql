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
