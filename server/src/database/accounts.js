/**
 * Helpers de banco para instituições, contas de aluno e códigos de turma.
 * Mantidos fora do db.js para não misturar com o fluxo de correção.
 */
import { getDb } from './db.js';
import { generateJoinCode } from '../services/secrets.js';

// ──────────────────────────────────────────
// Instituições
// ──────────────────────────────────────────

export function createOrganizationForTeacher(teacherId, name) {
  const db = getDb();
  return db.transaction(() => {
    const result = db.prepare('INSERT INTO organizations (name) VALUES (?)').run(name.trim());
    db.prepare("UPDATE teachers SET organization_id = ?, role = 'org_admin' WHERE id = ?")
      .run(result.lastInsertRowid, teacherId);
    return { id: Number(result.lastInsertRowid), name: name.trim() };
  })();
}

export function getOrganization(orgId) {
  return getDb().prepare('SELECT id, name, plan, plan_renews_at, created_at FROM organizations WHERE id = ?').get(orgId);
}

/** Professores da instituição com contagens do mês (sem conteúdo de alunos: minimização de dados). */
export function listOrgTeachers(orgId) {
  return getDb().prepare(`
    SELECT t.id, t.name, t.email, t.role, t.created_at,
      (SELECT COUNT(*) FROM classes c WHERE c.teacher_id = t.id) AS classes,
      (SELECT COUNT(*) FROM activities a WHERE a.teacher_id = t.id) AS activities,
      (SELECT COALESCE(SUM(u.units), 0) FROM ai_usage u
        WHERE u.teacher_id = t.id AND u.organization_id = t.organization_id
          AND u.created_at >= datetime('now', 'start of month')) AS usage_month
    FROM teachers t
    WHERE t.organization_id = ?
    ORDER BY CASE t.role WHEN 'org_admin' THEN 0 ELSE 1 END, t.name ASC
  `).all(orgId);
}

export function listOrgClasses(orgId) {
  return getDb().prepare(`
    SELECT c.id, c.name, c.school_year, c.join_code, t.name AS teacher_name, t.id AS teacher_id,
      (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id) AS student_count,
      (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id AND s.account_id IS NOT NULL) AS accounts_linked
    FROM classes c
    JOIN teachers t ON t.id = c.teacher_id
    WHERE t.organization_id = ?
    ORDER BY c.name ASC
  `).all(orgId);
}

/** Alunos com conta ativa em turmas da instituição. */
export function listOrgStudentAccounts(orgId) {
  return getDb().prepare(`
    SELECT sa.id, sa.name, sa.email, c.id AS class_id, c.name AS class_name
    FROM students s
    JOIN student_accounts sa ON sa.id = s.account_id
    JOIN classes c ON c.id = s.class_id
    JOIN teachers t ON t.id = c.teacher_id
    WHERE t.organization_id = ?
    ORDER BY sa.name ASC, c.name ASC
  `).all(orgId);
}

export function getOrgClass(orgId, classId) {
  return getDb().prepare(`
    SELECT c.* FROM classes c JOIN teachers t ON t.id = c.teacher_id
    WHERE c.id = ? AND t.organization_id = ?
  `).get(classId, orgId) || null;
}

export function getOrgTeacher(orgId, teacherId) {
  return getDb().prepare('SELECT id, name, email, role FROM teachers WHERE id = ? AND organization_id = ?')
    .get(teacherId, orgId) || null;
}

export function removeTeacherFromOrg(orgId, teacherId) {
  return getDb().prepare(`
    UPDATE teachers SET organization_id = NULL, role = 'teacher'
    WHERE id = ? AND organization_id = ?
  `).run(teacherId, orgId);
}

// ──────────────────────────────────────────
// Código da turma
// ──────────────────────────────────────────

/** Gera (ou troca) o código da turma. Tenta de novo no caso raro de colisão. */
export function rotateJoinCode(classId) {
  const db = getDb();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateJoinCode();
    try {
      db.prepare('UPDATE classes SET join_code = ? WHERE id = ?').run(code, classId);
      return code;
    } catch (err) {
      if (!String(err.message).includes('UNIQUE')) throw err;
    }
  }
  throw new Error('Não foi possível gerar um código único para a turma.');
}

export function getClassByJoinCode(code) {
  return getDb().prepare(`
    SELECT c.id, c.name, c.school_year, t.name AS teacher_name
    FROM classes c JOIN teachers t ON t.id = c.teacher_id
    WHERE c.join_code = ?
  `).get(code) || null;
}

// ──────────────────────────────────────────
// Contas de aluno
// ──────────────────────────────────────────

export function createStudentAccount({ name, email, passwordHash, googleUid = null, emailVerified = false }) {
  const normalizedEmail = email.toLowerCase().trim();
  const result = getDb().prepare(`
    INSERT INTO student_accounts (name, email, password_hash, google_uid, email_verified) VALUES (?, ?, ?, ?, ?)
  `).run(name.trim(), normalizedEmail, passwordHash, googleUid, emailVerified ? 1 : 0);
  return { id: Number(result.lastInsertRowid), name: name.trim(), email: normalizedEmail };
}

export function getStudentAccountByEmail(email) {
  return getDb().prepare('SELECT * FROM student_accounts WHERE email = ?').get(String(email).toLowerCase().trim()) || null;
}

export function getStudentAccountByGoogleUid(uid) {
  return getDb().prepare('SELECT * FROM student_accounts WHERE google_uid = ?').get(uid) || null;
}

/**
 * Liga o login com Google a uma conta existente. A senha antiga deixa de valer (quem criou a conta
 * antes pode não ser o dono do e-mail) e o e-mail passa a contar como verificado.
 */
export function linkStudentGoogle(accountId, uid, unusableHash) {
  return getDb().prepare(`
    UPDATE student_accounts
    SET google_uid = ?, password_hash = ?, email_verified = 1, session_epoch = session_epoch + 1
    WHERE id = ? AND google_uid IS NULL
  `).run(uid, unusableHash, accountId);
}

export function getStudentAccount(accountId) {
  return getDb().prepare('SELECT id, name, email, email_verified, created_at FROM student_accounts WHERE id = ?').get(accountId) || null;
}

/**
 * Coloca o aluno na turma.
 * Só quando o e-mail da conta é VERIFICADO (Google ou acesso criado pela instituição), a conta é
 * ligada ao cadastro que o professor fez com o mesmo e-mail, e respostas antigas com esse e-mail
 * passam a aparecer no portal. Com e-mail não verificado, cria um cadastro separado: assim ninguém
 * consegue ver as notas de um colega só digitando o e-mail dele.
 * Nunca liga por nome (evita que alguém veja o feedback de um colega com nome parecido).
 */
export function joinClass(accountId, classId) {
  const db = getDb();
  const account = getStudentAccount(accountId);
  if (!account) throw new Error('Conta de aluno não encontrada.');

  return db.transaction(() => {
    const existing = db.prepare('SELECT id FROM students WHERE class_id = ? AND account_id = ?').get(classId, accountId);
    if (existing) return { studentId: existing.id, alreadyMember: true };

    const roster = account.email_verified ? db.prepare(`
      SELECT id FROM students
      WHERE class_id = ? AND account_id IS NULL AND email IS NOT NULL AND lower(email) = ?
      ORDER BY id ASC LIMIT 1
    `).get(classId, account.email) : null;

    let studentId;
    if (roster) {
      db.prepare('UPDATE students SET account_id = ? WHERE id = ?').run(accountId, roster.id);
      studentId = roster.id;
    } else {
      // E-mail não verificado não é gravado no cadastro: respostas enviadas pelo professor
      // com aquele e-mail não podem ser puxadas por quem só digitou o e-mail de outra pessoa.
      const created = db.prepare('INSERT INTO students (class_id, name, email, account_id, self_joined) VALUES (?, ?, ?, ?, 1)')
        .run(classId, account.name, account.email_verified ? account.email : null, accountId);
      studentId = Number(created.lastInsertRowid);
    }

    if (account.email_verified) db.prepare(`
      UPDATE student_responses SET student_id = ?
      WHERE student_id IS NULL AND email IS NOT NULL AND lower(email) = ?
        AND activity_id IN (SELECT id FROM activities WHERE class_id = ?)
    `).run(studentId, account.email, classId);

    return { studentId, alreadyMember: false };
  })();
}

/**
 * Depois que o e-mail da conta é verificado (login com Google), refaz a ligação com a lista
 * das turmas em que o aluno já tinha entrado: troca o cadastro criado por ele pelo cadastro do
 * professor com o mesmo e-mail (se houver) e puxa as respostas enviadas com esse e-mail.
 */
export function relinkVerifiedAccount(accountId) {
  const db = getDb();
  const account = getStudentAccount(accountId);
  if (!account?.email_verified) return;

  db.transaction(() => {
    const ownRows = db.prepare('SELECT id, class_id FROM students WHERE account_id = ? AND self_joined = 1').all(accountId);
    for (const row of ownRows) {
      const roster = db.prepare(`
        SELECT id FROM students
        WHERE class_id = ? AND account_id IS NULL AND email IS NOT NULL AND lower(email) = ?
        ORDER BY id ASC LIMIT 1
      `).get(row.class_id, account.email);

      let studentId = row.id;
      if (roster) {
        db.prepare('UPDATE student_responses SET student_id = ? WHERE student_id = ?').run(roster.id, row.id);
        db.prepare('DELETE FROM students WHERE id = ?').run(row.id);
        db.prepare('UPDATE students SET account_id = ? WHERE id = ?').run(accountId, roster.id);
        studentId = roster.id;
      } else {
        db.prepare('UPDATE students SET email = ? WHERE id = ?').run(account.email, row.id);
      }

      db.prepare(`
        UPDATE student_responses SET student_id = ?
        WHERE student_id IS NULL AND email IS NOT NULL AND lower(email) = ?
          AND activity_id IN (SELECT id FROM activities WHERE class_id = ?)
      `).run(studentId, account.email, row.class_id);
    }
  })();
}

export function listStudentClasses(accountId) {
  return getDb().prepare(`
    SELECT c.id, c.name, c.school_year, t.name AS teacher_name
    FROM students s
    JOIN classes c ON c.id = s.class_id
    JOIN teachers t ON t.id = c.teacher_id
    WHERE s.account_id = ?
    ORDER BY c.name ASC
  `).all(accountId);
}

/**
 * Atividades das turmas do aluno com a situação da entrega dele.
 * Feedback, nota e correção automática só aparecem depois que o professor APROVA.
 */
export function listStudentActivities(accountId) {
  const rows = getDb().prepare(`
    SELECT a.id, a.title, a.subject, a.question, a.question_type, a.options, a.due_date, a.created_at,
           a.questions,
           c.id AS class_id, c.name AS class_name, t.name AS teacher_name,
           sr.id AS response_id, sr.original_response, sr.answers,
           f.status AS feedback_status,
           CASE WHEN f.status = 'aprovado' THEN f.teacher_feedback END AS feedback,
           CASE WHEN f.status = 'aprovado' THEN f.teacher_grade END AS grade,
           CASE WHEN f.status = 'aprovado' THEN f.criteria_scores END AS criteria_scores,
           CASE WHEN f.status = 'aprovado' THEN f.auto_result END AS auto_result,
           CASE WHEN f.status = 'aprovado' THEN f.approved_at END AS approved_at
    FROM students s
    JOIN classes c ON c.id = s.class_id
    JOIN teachers t ON t.id = c.teacher_id
    JOIN activities a ON a.class_id = c.id AND (a.is_archived = 0 OR a.is_archived IS NULL)
    LEFT JOIN student_responses sr ON sr.activity_id = a.id AND sr.student_id = s.id
    LEFT JOIN feedbacks f ON f.student_response_id = sr.id
    WHERE s.account_id = ?
    ORDER BY a.created_at DESC, a.id DESC, sr.id DESC
  `).all(accountId);

  // Uma linha por atividade (se houver mais de uma entrega, vale a mais recente)
  const seen = new Set();
  const result = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    result.push(row);
  }
  return result;
}
