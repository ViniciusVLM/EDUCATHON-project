/**
 * Área da instituição (/instituicao).
 * - Professor sem instituição: cria a instituição e vira administrador.
 * - Administrador: vê professores, turmas, alunos com conta e o uso de IA; cria acessos e códigos.
 * - Professor da instituição (não admin): vê só o nome da instituição.
 *
 * Por minimização de dados (LGPD), o painel não mostra respostas nem feedbacks dos alunos.
 */
import { useEffect, useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  createOrganization,
  getOrganization,
  createOrgTeacher,
  removeOrgTeacher,
  createOrgStudent,
  generateOrgJoinCode,
} from '../services/api';
import type { OrgOverview } from '../types';
import { Window } from '../components/ui/Window';
import { Button } from '../components/ui/Button';
import { Stamp } from '../components/ui/Stamp';
import { ProgressBar } from '../components/ui/ProgressBar';
import { Mascot } from '../components/ui/Mascot';
import { IconAlertCircle, IconCheckCircle } from '../components/ui/Icons';

type Tab = 'professores' | 'turmas' | 'alunos';

function plural(n: number, one: string, many: string) {
  return n === 1 ? one : many;
}

/** Mostra uma senha provisória uma única vez, com aviso. */
function TempPassword({ who, password, onClose }: { who: string; password: string; onClose: () => void }) {
  return (
    <div className="temp-pass" role="status">
      <p>
        <strong>Senha provisória de {who}:</strong> <code className="temp-pass__code">{password}</code>
      </p>
      <p className="input-hint">Ela não será mostrada de novo. Entregue pessoalmente e peça para trocar no primeiro acesso.</p>
      <Button variant="ghost" size="sm" onClick={onClose}>Já anotei</Button>
    </div>
  );
}

function CreateOrganization({ onCreated }: { onCreated: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await createOrganization(name.trim());
      await onCreated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar a instituição.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-container page-container-narrow animate-fade-in">
      <Window fileName="nova-instituicao.txt" tone="orange">
        <div className="org-create">
          <Mascot size={110} />
          <div>
            <h2 className="page-title">Área da instituição</h2>
            <p className="page-subtitle">
              Para escolas, redes e cursos (como um SENAC ou uma escola técnica): um plano de IA compartilhado,
              visão de todos os professores e alunos, e criação de acessos.
            </p>
            <form onSubmit={handleSubmit} className="org-create__form">
              <label htmlFor="org-name" className="input-label">Nome da instituição</label>
              <input
                id="org-name"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Escola Técnica Jardim das Flores"
                required
              />
              <Button type="submit" variant="primary" loading={loading} disabled={name.trim().length < 2} id="btn-create-org">
                Criar instituição e ser o administrador
              </Button>
            </form>
            {error && <div className="alert-box alert-box--error" role="alert"><IconAlertCircle size={18} /><span>{error}</span></div>}
            <p className="input-hint">Suas turmas e atividades continuam suas. A instituição passa a pagar o uso de IA da equipe.</p>
          </div>
        </div>
      </Window>
    </div>
  );
}

export default function Institution() {
  const { teacher, refreshTeacher } = useAuth();
  const [data, setData] = useState<OrgOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState<Tab>('professores');
  const [temp, setTemp] = useState<{ who: string; password: string } | null>(null);

  const [teacherForm, setTeacherForm] = useState({ name: '', email: '' });
  const [studentForm, setStudentForm] = useState({ name: '', email: '', classId: '' });
  const [busy, setBusy] = useState('');

  const isAdmin = teacher?.role === 'org_admin';

  async function load() {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    try {
      setData(await getOrganization());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar a instituição.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [isAdmin]);

  if (!teacher?.organization) {
    return (
      <CreateOrganization
        onCreated={async () => {
          await refreshTeacher();
        }}
      />
    );
  }

  if (!isAdmin) {
    return (
      <div className="page-container page-container-narrow animate-fade-in">
        <Window fileName="instituicao.txt">
          <h2 className="page-title">{teacher.organization.name}</h2>
          <p className="page-subtitle">
            Você faz parte desta instituição. O plano de IA e os acessos são gerenciados pelo administrador.
          </p>
          <Link to="/planos" className="ui-btn ui-btn--ghost ui-btn--md">Ver uso de IA da instituição</Link>
        </Window>
      </div>
    );
  }

  async function handleCreateTeacher(e: FormEvent) {
    e.preventDefault();
    setBusy('teacher');
    setError('');
    try {
      const res = await createOrgTeacher({ name: teacherForm.name.trim(), email: teacherForm.email.trim() });
      setTemp({ who: teacherForm.name.trim(), password: res.tempPassword });
      setNotice(res.message);
      setTeacherForm({ name: '', email: '' });
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar o acesso.');
    } finally {
      setBusy('');
    }
  }

  async function handleCreateStudent(e: FormEvent) {
    e.preventDefault();
    setBusy('student');
    setError('');
    try {
      const res = await createOrgStudent({
        name: studentForm.name.trim(),
        email: studentForm.email.trim(),
        classId: Number(studentForm.classId),
      });
      if (res.tempPassword) setTemp({ who: studentForm.name.trim(), password: res.tempPassword });
      setNotice(res.message);
      setStudentForm({ name: '', email: '', classId: studentForm.classId });
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar o acesso do aluno.');
    } finally {
      setBusy('');
    }
  }

  async function handleRemoveTeacher(id: number, name: string) {
    if (!window.confirm(`Remover ${name} da instituição? A conta e as turmas dele continuam existindo.`)) return;
    try {
      const res = await removeOrgTeacher(id);
      setNotice(res.message);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível remover.');
    }
  }

  async function handleCode(classId: number) {
    try {
      await generateOrgJoinCode(classId);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível gerar o código.');
    }
  }

  if (loading) {
    return (
      <div className="page-container page-container--center"><div className="spinner spinner-lg" /></div>
    );
  }

  if (!data) {
    return (
      <div className="page-container">
        <div className="alert-box alert-box--error" role="alert"><IconAlertCircle size={18} /><span>{error || 'Instituição não encontrada.'}</span></div>
      </div>
    );
  }

  const q = data.quota;

  return (
    <div className="page-container animate-fade-in org-page">
      <div className="page-header-row">
        <div className="page-header-row__text">
          <p className="org-page__kicker">Painel da instituição</p>
          <h2 className="page-title">{data.organization.name}</h2>
          <p className="page-subtitle">
            Você é o administrador. Aqui você vê a equipe, as turmas e o uso de IA; respostas e feedbacks continuam visíveis só para cada professor.
          </p>
        </div>
        <Link to="/planos" className="ui-btn ui-btn--primary ui-btn--md">Plano: {q.plan.name}</Link>
      </div>

      {notice && (
        <div className="alert-box alert-box--success" role="status">
          <IconCheckCircle size={18} /><span style={{ flex: 1 }}>{notice}</span>
          <Button variant="ghost" size="sm" onClick={() => setNotice('')} aria-label="Fechar aviso">✕</Button>
        </div>
      )}
      {error && (
        <div className="alert-box alert-box--error" role="alert">
          <IconAlertCircle size={18} /><span style={{ flex: 1 }}>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => setError('')} aria-label="Fechar erro">✕</Button>
        </div>
      )}
      {temp && <TempPassword who={temp.who} password={temp.password} onClose={() => setTemp(null)} />}

      <div className="org-stats">
        <div className="org-stat org-stat--blue"><span className="org-stat__num">{data.totals.teachers}</span><span className="org-stat__label">{plural(data.totals.teachers, 'professor', 'professores')}</span></div>
        <div className="org-stat"><span className="org-stat__num">{data.totals.classes}</span><span className="org-stat__label">{plural(data.totals.classes, 'turma', 'turmas')}</span></div>
        <div className="org-stat"><span className="org-stat__num">{data.totals.studentsOnRoster}</span><span className="org-stat__label">{plural(data.totals.studentsOnRoster, 'aluno nas listas', 'alunos nas listas')}</span></div>
        <div className="org-stat org-stat--green"><span className="org-stat__num">{data.totals.studentAccounts}</span><span className="org-stat__label">{plural(data.totals.studentAccounts, 'aluno com conta', 'alunos com conta')}</span></div>
      </div>

      <Window fileName="uso-de-ia.txt" tone="blue" className="usage-win">
        {q.quota === null ? (
          <p className="usage__text">Chave própria do Gemini ativa (•••• {q.ownKey.last4}). {q.usedWithOwnKey} geração(ões) neste mês, sem limite da plataforma.</p>
        ) : (
          <>
            <p className="usage__big"><strong>{q.used}</strong> de {q.quota.toLocaleString('pt-BR')} gerações de IA usadas pela equipe neste mês</p>
            <ProgressBar value={q.used} max={q.quota || 1} color={q.remaining === 0 ? 'red' : 'green'} label="Uso de IA da instituição" showLabel={false} />
          </>
        )}
      </Window>

      <div className="filter-tabs org-tabs" role="tablist" aria-label="Seções da instituição">
        {(['professores', 'turmas', 'alunos'] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`filter-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'professores' ? `Professores (${data.teachers.length})` : t === 'turmas' ? `Turmas (${data.classes.length})` : `Alunos com conta (${data.totals.studentAccounts})`}
          </button>
        ))}
      </div>

      {tab === 'professores' && (
        <div className="org-grid">
          <Window fileName="equipe.csv">
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr><th>Professor</th><th>Turmas</th><th>Atividades</th><th>IA no mês</th><th /></tr>
                </thead>
                <tbody>
                  {data.teachers.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <div className="table-cell-strong">{t.name} {t.role === 'org_admin' && <Stamp tone="info">Admin</Stamp>}</div>
                        <div className="student-row__email">{t.email}</div>
                      </td>
                      <td>{t.classes}</td>
                      <td>{t.activities}</td>
                      <td>{t.usage_month}</td>
                      <td>
                        {t.id !== teacher.id && (
                          <Button variant="ghost" size="sm" onClick={() => handleRemoveTeacher(t.id, t.name)}>Remover</Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Window>
          <Window fileName="novo-professor.txt" tone="orange">
            <h3 className="org-form__title">Criar acesso de professor</h3>
            <form onSubmit={handleCreateTeacher} className="form-grid">
              <div className="input-group">
                <label className="input-label" htmlFor="t-name">Nome</label>
                <input id="t-name" className="input" value={teacherForm.name} onChange={(e) => setTeacherForm({ ...teacherForm, name: e.target.value })} required />
              </div>
              <div className="input-group">
                <label className="input-label" htmlFor="t-email">E-mail</label>
                <input id="t-email" type="email" className="input" value={teacherForm.email} onChange={(e) => setTeacherForm({ ...teacherForm, email: e.target.value })} required />
              </div>
              <Button type="submit" variant="primary" loading={busy === 'teacher'} id="btn-create-org-teacher">Criar acesso</Button>
              <p className="input-hint">Geramos uma senha provisória. O professor também pode entrar com Google se o e-mail for o mesmo.</p>
            </form>
          </Window>
        </div>
      )}

      {tab === 'turmas' && (
        <Window fileName="turmas.csv">
          {data.classes.length === 0 ? (
            <p className="usage__text">Ainda não há turmas. Os professores criam as turmas na área “Turmas”.</p>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr><th>Turma</th><th>Professor</th><th>Alunos</th><th>Com conta</th><th>Código</th></tr>
                </thead>
                <tbody>
                  {data.classes.map((c) => (
                    <tr key={c.id}>
                      <td className="table-cell-strong">{c.name}</td>
                      <td>{c.teacher_name}</td>
                      <td>{c.student_count}</td>
                      <td>{c.accounts_linked}</td>
                      <td>
                        {c.join_code ? <code className="org-code">{c.join_code}</code> : null}{' '}
                        <Button variant="ghost" size="sm" onClick={() => handleCode(c.id)}>
                          {c.join_code ? 'Trocar' : 'Gerar código'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Window>
      )}

      {tab === 'alunos' && (
        <div className="org-grid">
          <Window fileName="alunos.csv">
            {data.students.length === 0 ? (
              <p className="usage__text">Nenhum aluno com conta ainda. Eles entram com o código da turma ou por um acesso criado aqui.</p>
            ) : (
              <div className="table-wrapper">
                <table className="table">
                  <thead><tr><th>Aluno</th><th>Turma</th></tr></thead>
                  <tbody>
                    {data.students.map((s) => (
                      <tr key={`${s.id}-${s.class_id}`}>
                        <td>
                          <div className="table-cell-strong">{s.name}</div>
                          <div className="student-row__email">{s.email}</div>
                        </td>
                        <td>{s.class_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Window>
          <Window fileName="novo-aluno.txt" tone="orange">
            <h3 className="org-form__title">Criar acesso de aluno</h3>
            {data.classes.length === 0 ? (
              <p className="usage__text">Crie uma turma primeiro.</p>
            ) : (
              <form onSubmit={handleCreateStudent} className="form-grid">
                <div className="input-group">
                  <label className="input-label" htmlFor="s-class">Turma</label>
                  <select id="s-class" className="select" value={studentForm.classId} onChange={(e) => setStudentForm({ ...studentForm, classId: e.target.value })} required>
                    <option value="">Escolha a turma</option>
                    {data.classes.map((c) => (
                      <option key={c.id} value={c.id}>{c.name} — {c.teacher_name}</option>
                    ))}
                  </select>
                </div>
                <div className="input-group">
                  <label className="input-label" htmlFor="s-name">Nome do aluno</label>
                  <input id="s-name" className="input" value={studentForm.name} onChange={(e) => setStudentForm({ ...studentForm, name: e.target.value })} required />
                </div>
                <div className="input-group">
                  <label className="input-label" htmlFor="s-email">E-mail do aluno</label>
                  <input id="s-email" type="email" className="input" value={studentForm.email} onChange={(e) => setStudentForm({ ...studentForm, email: e.target.value })} required />
                </div>
                <Button type="submit" variant="primary" loading={busy === 'student'} id="btn-create-org-student">Criar acesso</Button>
                <p className="input-hint">Para alunos menores de idade, confirme a autorização dos responsáveis conforme a LGPD.</p>
              </form>
            )}
          </Window>
        </div>
      )}
    </div>
  );
}
