/**
 * Portal do aluno (/aluno): matérias, atividades das turmas, nota lançada pelo professor
 * e feedback aprovado. Nada aparece antes da aprovação do professor.
 */
import { useEffect, useMemo, useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mascot } from '../../components/ui/Mascot';
import { Window, toFileSlug } from '../../components/ui/Window';
import { Stamp } from '../../components/ui/Stamp';
import { Button } from '../../components/ui/Button';
import { IconAlertCircle, IconCheckCircle, IconLogout } from '../../components/ui/Icons';
import {
  getStudentMe,
  getStudentActivities,
  joinClassWithCode,
  getStudentToken,
  setStudentToken,
  changeStudentPassword,
} from '../../services/api';
import { ChangePasswordForm } from '../../components/auth/ChangePasswordForm';
import type { StudentClass, StudentPortalActivity, StudentSubjectSummary, StudentUser } from '../../types';

function formatGrade(grade: number) {
  return grade.toLocaleString('pt-BR', { minimumFractionDigits: grade % 1 ? 1 : 0, maximumFractionDigits: 1 });
}

function SituationStamp({ situation }: { situation: StudentPortalActivity['situation'] }) {
  if (situation === 'corrigida') return <Stamp tone="approved">Corrigida</Stamp>;
  if (situation === 'em_correcao') return <Stamp tone="reviewed">Em correção</Stamp>;
  return <Stamp tone="pending">Sem entrega</Stamp>;
}

function ActivityCard({ activity }: { activity: StudentPortalActivity }) {
  const [open, setOpen] = useState(activity.situation === 'corrigida');
  const result = activity.objectiveResult;

  return (
    <Window
      as="article"
      fileName={`${toFileSlug(activity.title)}.txt`}
      tone={activity.situation === 'corrigida' ? 'orange' : 'neutral'}
      barExtra={<SituationStamp situation={activity.situation} />}
      className="portal-activity"
    >
      <div className="portal-activity__head">
        <div>
          <h3 className="portal-activity__title">{activity.title}</h3>
          <p className="portal-activity__meta">
            {activity.subject} · {activity.className} · {activity.teacherName}
            {activity.questionType === 'objetiva' ? ' · múltipla escolha' : ''}
            {activity.questions.length > 1 ? ` · ${activity.questions.length} perguntas` : ''}
          </p>
        </div>
        {typeof activity.grade === 'number' && (
          <div className="portal-grade" aria-label={`Nota ${formatGrade(activity.grade)}`}>
            <span className="portal-grade__label">Nota</span>
            <span className="portal-grade__value">{formatGrade(activity.grade)}</span>
          </div>
        )}
      </div>

      <button type="button" className="portal-activity__toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? 'Esconder detalhes' : 'Ver detalhes'}
      </button>

      {open && (
        <div className="portal-activity__body">
          {activity.questions.length > 1 ? (
            <ol className="review-multi">
              {activity.questions.map((q) => (
                <li key={q.numero} className="review-multi__item">
                  <p className="review-multi__question">
                    <span className="multi-answers__num">{q.numero}</span> {q.pergunta}
                  </p>
                  {activity.situation !== 'sem_entrega' && (
                    q.resposta?.trim() ? (
                      <p className="review-multi__answer"><strong>Sua resposta:</strong> {q.resposta}</p>
                    ) : (
                      <p className="review-multi__answer review-multi__answer--blank">Você deixou em branco.</p>
                    )
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p className="portal-activity__question"><strong>Pergunta:</strong> {activity.question}</p>
          )}

          {activity.questionType === 'objetiva' && activity.options.length > 0 && (
            <ul className="portal-options" aria-label="Alternativas">
              {activity.options.map((o) => {
                const isChosen = result?.escolhida === o.letra;
                const isCorrect = result?.correta === o.letra;
                return (
                  <li
                    key={o.letra}
                    className={`portal-options__item${isCorrect ? ' portal-options__item--correct' : ''}${isChosen && !isCorrect ? ' portal-options__item--wrong' : ''}`}
                  >
                    <span className="portal-options__letter">{o.letra}</span>
                    <span>{o.texto}</span>
                    <span className="portal-options__tags">
                      {isChosen && <span className="portal-options__tag">sua resposta</span>}
                      {isCorrect && <span className="portal-options__tag">gabarito</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {activity.myAnswer && activity.questionType !== 'objetiva' && activity.questions.length <= 1 && (
            <div className="portal-activity__answer">
              <strong>Sua resposta</strong>
              <p>{activity.myAnswer}</p>
            </div>
          )}

          {activity.situation === 'corrigida' && activity.feedback && (
            <div className="portal-feedback">
              <strong>Feedback do professor</strong>
              <p>{activity.feedback}</p>
              {activity.criteria.length > 0 && activity.questionType !== 'objetiva' && (
                <ul className="portal-criteria">
                  {activity.criteria.map((c) => (
                    <li key={c.criterio} className={c.atendido ? 'is-ok' : 'is-miss'}>
                      {c.atendido ? '✓' : '✗'} {c.criterio}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {activity.situation === 'em_correcao' && (
            <p className="portal-activity__note">Seu professor ainda está revisando esta atividade. O feedback aparece aqui quando ele aprovar.</p>
          )}
          {activity.situation === 'sem_entrega' && (
            <p className="portal-activity__note">Ainda não há resposta sua registrada nesta atividade.</p>
          )}
        </div>
      )}
    </Window>
  );
}

export default function StudentPortal() {
  const navigate = useNavigate();
  const [student, setStudent] = useState<StudentUser | null>(null);
  const [classes, setClasses] = useState<StudentClass[]>([]);
  const [subjects, setSubjects] = useState<StudentSubjectSummary[]>([]);
  const [activities, setActivities] = useState<StudentPortalActivity[]>([]);
  const [filter, setFilter] = useState<string>('todas');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [joinMsg, setJoinMsg] = useState('');
  const [joining, setJoining] = useState(false);

  async function load() {
    const [me, list] = await Promise.all([getStudentMe(), getStudentActivities()]);
    setStudent(me.student);
    setClasses(me.classes);
    setSubjects(list.subjects);
    setActivities(list.activities);
  }

  useEffect(() => {
    if (!getStudentToken()) {
      navigate('/aluno/entrar', { replace: true });
      return;
    }
    load()
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : '';
        if (/sess[ãa]o|token|login/i.test(msg)) {
          setStudentToken(null);
          navigate('/aluno/entrar', { replace: true });
          return;
        }
        setError(msg || 'Não foi possível carregar suas atividades.');
      })
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(
    () => (filter === 'todas' ? activities : activities.filter((a) => a.subject === filter)),
    [activities, filter]
  );

  async function handleJoin(e: FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setJoining(true);
    setJoinMsg('');
    try {
      const res = await joinClassWithCode(code.trim());
      setJoinMsg(res.message);
      setCode('');
      await load();
    } catch (err: unknown) {
      setJoinMsg(err instanceof Error ? err.message : 'Não foi possível entrar na turma.');
    } finally {
      setJoining(false);
    }
  }

  function handleLogout() {
    setStudentToken(null);
    navigate('/aluno/entrar');
  }

  const firstName = student?.name.split(' ')[0] || '';

  return (
    <div className="edu-shell portal">
      <header className="edu-nav">
        <Link to="/aluno" className="edu-nav__logo" aria-label="Educathon — portal do aluno">
          <span className="edu-nav__logo-mark" aria-hidden="true"><Mascot variant="head" size={30} /></span>
          <span className="edu-nav__logo-text">Educathon</span>
        </Link>
        <span className="portal__badge">Portal do aluno</span>
        <div className="edu-nav__actions">
          <button type="button" className="portal__logout" onClick={handleLogout}>
            <IconLogout size={16} /> Sair
          </button>
        </div>
      </header>

      <main className="edu-content portal__content" id="main-content">
        {loading && <p className="portal__loading">Carregando suas atividades...</p>}
        {error && (
          <div className="alert-box alert-box--error" role="alert"><IconAlertCircle size={18} /><span>{error}</span></div>
        )}

        {!loading && student && (
          <>
            <section className="portal-hero">
              <div>
                <h1 className="portal-hero__title">Oi, <em>{firstName}!</em></h1>
                <p className="portal-hero__text">
                  {classes.length === 0
                    ? 'Você ainda não está em nenhuma turma. Digite o código que seu professor passou.'
                    : `Você está em ${classes.length === 1 ? '1 turma' : `${classes.length} turmas`}: ${classes.map((c) => c.name).join(', ')}.`}
                </p>
                <form className="portal-join" onSubmit={handleJoin}>
                  <label htmlFor="join-code" className="portal-join__label">Código da turma</label>
                  <input
                    id="join-code"
                    className="input input--code"
                    placeholder="ABC-1234"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    autoComplete="off"
                  />
                  <Button type="submit" variant="primary" loading={joining}>Entrar na turma</Button>
                </form>
                {joinMsg && <p className="portal-join__msg" role="status">{joinMsg}</p>}
              </div>
              <Mascot size={150} className="portal-hero__mascot" />
            </section>

            <section aria-labelledby="materias-title" className="portal-section">
              <h2 id="materias-title" className="portal-section__title">Minhas matérias</h2>
              {subjects.length === 0 ? (
                <p className="portal-activity__note">Quando seus professores criarem atividades, as matérias aparecem aqui.</p>
              ) : (
                <div className="portal-subjects">
                  <button
                    type="button"
                    className={`portal-subject${filter === 'todas' ? ' portal-subject--on' : ''}`}
                    onClick={() => setFilter('todas')}
                    aria-pressed={filter === 'todas'}
                  >
                    <span className="portal-subject__name">Todas</span>
                    <span className="portal-subject__meta">{activities.length} atividades</span>
                  </button>
                  {subjects.map((s) => (
                    <button
                      key={s.subject}
                      type="button"
                      className={`portal-subject${filter === s.subject ? ' portal-subject--on' : ''}`}
                      onClick={() => setFilter(s.subject)}
                      aria-pressed={filter === s.subject}
                    >
                      <span className="portal-subject__name">{s.subject}</span>
                      <span className="portal-subject__meta">
                        {s.corrected}/{s.activities} corrigidas
                      </span>
                      <span className="portal-subject__avg">
                        {s.average !== null ? `Média ${formatGrade(s.average)}` : 'Sem notas ainda'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section aria-labelledby="atividades-title" className="portal-section">
              <h2 id="atividades-title" className="portal-section__title">
                Atividades {filter !== 'todas' ? `de ${filter}` : ''}
              </h2>
              {visible.length === 0 ? (
                <p className="portal-activity__note">Nenhuma atividade por aqui ainda.</p>
              ) : (
                <div className="portal-activities">
                  {visible.map((a) => (
                    <ActivityCard key={a.id} activity={a} />
                  ))}
                </div>
              )}
              <details className="portal-password">
                <summary>Trocar minha senha</summary>
                <ChangePasswordForm idPrefix="student-pass" onSubmit={changeStudentPassword} />
              </details>
              <p className="portal-footnote">
                <IconCheckCircle size={14} /> A nota é sempre lançada pelo seu professor. A IA ajuda a escrever o feedback, mas não dá nota.
              </p>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
