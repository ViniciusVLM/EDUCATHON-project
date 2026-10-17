/**
 * Página principal do Painel (/painel).
 * Apresenta saudação, atalhos rápidos, pendências de revisão,
 * atividades recentes com chips, calendário de prazos,
 * fila de revisão com barras de progresso e anéis de progresso.
 *
 * Estados:
 *   - Carregando: esqueleto animado
 *   - Vazio: novo professor com convite acolhedor
 *   - Erro: mensagem amigável e botão de tentar de novo
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getDashboardSummary } from '../services/api';
import type { DashboardSummary } from '../types';
import {
  Card,
  Button,
  Chip,
  ProgressBar,
  Mascot,
  Stamp,
  Window,
  toFileSlug,
  IconPlus,
  IconAlertCircle,
  IconRefresh,
} from '../components/ui';

export default function Dashboard() {
  const { teacher } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getDashboardSummary();
      setSummary(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Não foi possível carregar os dados do painel.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  // Dias da semana atual (Dom a Sáb)
  const weekDays = useMemo(() => {
    const now = new Date();
    const currentDayOfWeek = now.getDay();
    const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() - currentDayOfWeek + i);
      days.push({
        name: dayNames[i],
        dateNumber: d.getDate(),
        isToday: d.toDateString() === now.toDateString(),
      });
    }
    return days;
  }, []);

  const firstName = useMemo(() => {
    const fullName = summary?.teacher?.name || teacher?.name || 'Professor(a)';
    return fullName.split(' ')[0];
  }, [summary?.teacher?.name, teacher?.name]);

  // Formata data amigável para prazos
  function formatDueDate(dateStr: string) {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    } catch {
      return dateStr;
    }
  }

  // ── ESTADO DE ERRO ──
  if (error && !loading) {
    return (
      <div className="dashboard" data-testid="dashboard-error-state">
        <Card className="dashboard-error">
          <div className="dashboard-error__icon">
            <IconAlertCircle size={44} />
          </div>
          <h2 className="page-title">Não foi possível carregar o painel</h2>
          <p className="page-subtitle">{error}</p>
          <Button
            variant="purple"
            onClick={fetchSummary}
            icon={<IconRefresh size={18} />}
          >
            Tentar novamente
          </Button>
        </Card>
      </div>
    );
  }

  // ── ESTADO CARREGANDO (ESQUELETO) ──
  if (loading) {
    return (
      <div className="dashboard" data-testid="dashboard-loading-skeleton" aria-busy="true" aria-label="Carregando painel">
        <div className="dashboard-header">
          <div style={{ width: '50%' }}>
            <div className="skeleton skeleton-title" style={{ marginBottom: '8px' }} />
            <div className="skeleton skeleton-text" style={{ width: '80%' }} />
          </div>
          <div className="skeleton" style={{ width: 140, height: 32, borderRadius: 999 }} />
        </div>

        <div className="dashboard-shortcuts">
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
        </div>

        <div className="dashboard-main-grid">
          <div className="dashboard-col">
            <div className="skeleton skeleton-section" />
            <div className="skeleton skeleton-section" />
          </div>
          <div className="dashboard-col">
            <div className="skeleton skeleton-section" style={{ height: 160 }} />
            <div className="skeleton skeleton-section" />
          </div>
        </div>
      </div>
    );
  }

  // ── ESTADO VAZIO (NOVO PROFESSOR) ──
  const isBrandNewTeacher = !summary || summary.metrics.total_activities === 0;

  if (isBrandNewTeacher) {
    return (
      <div className="painel" data-testid="dashboard-empty-state">
        <section className="painel-hero">
          <div>
            <h1 className="painel-hero__title">
              Olá, <em>{firstName}!</em>
            </h1>
            <p className="painel-hero__lead">
              Seu copiloto pedagógico está pronto. Crie a primeira atividade, envie as respostas
              da turma e receba um rascunho de feedback para cada aluno.
            </p>
            <div className="painel-hero__actions">
              <Link to="/setup" className="btn-link btn-link--primary">
                <IconPlus size={20} /> Criar primeira atividade
              </Link>
            </div>
            <span className="painel-hero__note">A IA nunca dá nota; o professor decide</span>
          </div>
          <div className="painel-hero__art">
            <Mascot size={230} />
          </div>
        </section>

        <Window fileName="bem-vindo.txt" className="dashboard-empty-window">
          <h2 className="section-title">Bem-vindo(a) ao seu novo painel!</h2>
          <ol className="list-plain" style={{ listStyle: 'decimal', paddingLeft: 22, gap: 6, fontWeight: 600 }}>
            <li>Cadastre a atividade com a pergunta, a rubrica e os critérios.</li>
            <li>Envie as respostas dos alunos (CSV ou digitando).</li>
            <li>Gere os rascunhos com IA, revise, edite e aprove.</li>
          </ol>
        </Window>
      </div>
    );
  }

  // ── ESTADO POPULADO ──
  const { metrics, pending_review_items, recent_activities, deadlines, review_queue } = summary;

  // Cálculos de porcentagem para anéis
  const totalBase = metrics.total_feedbacks > 0 ? metrics.total_feedbacks : metrics.total_students;
  const approvedPercent = totalBase > 0 ? Math.round((metrics.approved / totalBase) * 100) : 0;
  const errorPercent = totalBase > 0 ? Math.round((metrics.generation_errors / totalBase) * 100) : 0;

  const pendingTotal = Math.max(metrics.total_students - metrics.approved, 0);
  const firstToReview =
    review_queue.find((q) => q.pending > 0)?.activity_id ??
    pending_review_items.find((i) => i.type !== 'generation_error')?.activity_id ??
    review_queue[0]?.activity_id;
  const queueById = new Map(review_queue.map((q) => [q.activity_id, q]));
  const latestActivityId = recent_activities[0]?.id;

  return (
    <div className="painel" data-testid="dashboard-content">
      {/* ── 1. Saudação ── */}
      <header className="painel-hero">
        <div>
          <h1 className="painel-hero__title">
            Olá, <em>{firstName}!</em>
            <span className="sr-only"> O que vamos corrigir hoje?</span>
          </h1>
          <p className="painel-hero__lead">
            {pendingTotal > 0 ? (
              <>Você tem <strong>{pendingTotal} feedback(s)</strong> esperando revisão. </>
            ) : (
              <>Tudo em dia por aqui! </>
            )}
            A IA já faz o rascunho, a decisão final é sempre sua.
          </p>
          <div className="painel-hero__actions">
            {pendingTotal > 0 && firstToReview !== undefined && (
              <Link to={`/review/${firstToReview}`} className="btn-link btn-link--primary">
                Revisar pendentes →
              </Link>
            )}
            <Link to="/setup" className="btn-link btn-link--accent">
              <IconPlus size={18} /> Nova atividade
            </Link>
          </div>
          <span className="painel-hero__note">A IA nunca dá nota; o professor decide</span>
        </div>
        <div className="painel-hero__art">
          <Mascot size={240} />
        </div>
      </header>

      {/* ── 2. Atalhos (cada um leva a uma etapa diferente do fluxo) ── */}
      <section aria-label="Atalhos rápidos">
        <h2 className="section-title" style={{ fontSize: '1.4rem' }}>Atalhos</h2>
        <div className="quicklinks">
          <Link to="/setup" className="quicklinks__item quicklinks__item--accent" aria-label="Nova atividade" id="shortcut-new-activity">
            Nova atividade <span className="quicklinks__arrow" aria-hidden="true">↗</span>
          </Link>
          <Link
            to={latestActivityId !== undefined ? `/upload/${latestActivityId}` : '/activities'}
            className="quicklinks__item"
            aria-label="Enviar respostas"
            id="shortcut-upload"
          >
            Enviar respostas <span className="quicklinks__arrow" aria-hidden="true">↗</span>
          </Link>
          <Link
            to={firstToReview !== undefined ? `/review/${firstToReview}` : '/activities'}
            className="quicklinks__item"
            aria-label="Revisar e aprovar"
            id="shortcut-review-approve"
          >
            Revisar e aprovar <span className="quicklinks__arrow" aria-hidden="true">↗</span>
          </Link>
          <Link
            to={latestActivityId !== undefined ? `/export/${latestActivityId}` : '/activities'}
            className="quicklinks__item"
            aria-label="Exportar resultados"
            id="shortcut-export"
          >
            Exportar CSV <span className="quicklinks__arrow" aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>

      {/* ── 3. Atividades recentes (faixa pontilhada) ── */}
      <section className="band" id="section-recent-activities" aria-labelledby="titulo-recentes">
        <div className="section-head">
          <h2 className="section-title" id="titulo-recentes">Atividades recentes</h2>
          <Link to="/activities">Ver todas</Link>
        </div>

        {recent_activities.length === 0 ? (
          <p className="empty-line">Nenhuma atividade recente encontrada.</p>
        ) : (
          <div className="act-grid">
            {recent_activities.map((act) => {
              const q = queueById.get(act.id);
              const total = q?.total ?? act.total_students;
              const approved = q?.approved ?? act.approved;
              return (
                <Window key={act.id} as="article" fileName={`${toFileSlug(act.title)}.csv`}>
                  <h3 className="act-card__title">
                    <Link to={`/review/${act.id}`}>{act.title}</Link>
                  </h3>
                  <div className="act-card__meta">
                    {act.subject && <Chip color="purple" size="sm">{act.subject}</Chip>}
                    {act.class_name && <Chip color="blue" size="sm">{act.class_name}</Chip>}
                  </div>
                  <div className="act-card__row">
                    <span>Aprovação</span>
                    <span>{approved} de {total}</span>
                  </div>
                  <ProgressBar value={approved} max={Math.max(total, 1)} variant="purple" showLabel={false} label={`Aprovados: ${approved} de ${total}`} />
                  <p className="act-card__info">
                    {act.total_students} aluno(s) · criada em {formatDueDate(act.created_at)}
                  </p>
                  <div className="act-card__foot">
                    {act.pending_review > 0 ? (
                      <Stamp tone="pending">{act.pending_review} pendente(s)</Stamp>
                    ) : (
                      <Stamp tone="approved">Revisado</Stamp>
                    )}
                    <Link to={`/review/${act.id}`} className="btn-link btn-link--primary btn-link--sm">
                      Revisar
                    </Link>
                  </div>
                </Window>
              );
            })}
          </div>
        )}
      </section>

      {/* ── 4. Números ── */}
      <section className="stat-tiles" aria-label="Resumo" id="section-progress-rings">
        <div className="stat-tile stat-tile--blue">
          <span className="stat-tile__num">{metrics.total_students}</span>
          <span className="stat-tile__label">alunos<span className="stat-tile__sub">em {metrics.total_activities} atividade(s)</span></span>
        </div>
        <div className="stat-tile stat-tile--green">
          <span className="stat-tile__num" aria-label={`Taxa de aprovação: ${approvedPercent}%`}>{metrics.approved}</span>
          <span className="stat-tile__label">Aprovados<span className="stat-tile__sub">{approvedPercent}% prontos para exportar</span></span>
        </div>
        <div className="stat-tile stat-tile--red">
          <span className="stat-tile__num" aria-label={`Taxa de erros: ${errorPercent}%`}>{metrics.generation_errors}</span>
          <span className="stat-tile__label">Gerações com erro<span className="stat-tile__sub">{metrics.generation_errors > 0 ? 'tente gerar de novo' : 'nenhuma falha'}</span></span>
        </div>
      </section>

      {/* ── 5. Pendências, fila e prazos ── */}
      <div className="painel-grid">
        <div className="painel-col">
          <Window fileName="pendencias.txt" id="section-pendings"
            barExtra={pending_review_items.length > 0 ? (
              <span className="stamp stamp--pending" data-testid="pending-count-badge">{pending_review_items.length}</span>
            ) : null}
          >
            <h2 className="section-title" style={{ fontSize: '1.5rem' }}>Pendências de revisão</h2>
            {pending_review_items.length === 0 ? (
              <p className="empty-line">Nenhuma pendência no momento. Todas as correções estão em dia!</p>
            ) : (
              <ul className="list-plain">
                {pending_review_items.map((item, idx) => (
                  <li key={`${item.activity_id}-${item.type}-${idx}`} className="list-row">
                    <div className="list-row__main">
                      {item.type === 'generation_error' && <Stamp tone="error">Erro IA</Stamp>}
                      {item.type === 'pending_feedback' && <Stamp tone="info">Aguardando</Stamp>}
                      {item.type === 'generation_complete' && <Stamp tone="approved">Pronto</Stamp>}
                      <div className="list-row__text">
                        <span className="list-row__title">{item.activity_title}</span>
                        <span className="list-row__sub">
                          {item.type === 'pending_feedback' && `${item.count} resposta(s) para revisar`}
                          {item.type === 'generation_error' && `${item.count} falha(s) na geração`}
                          {item.type === 'generation_complete' && `${item.count} feedback(s) prontos para revisão`}
                        </span>
                      </div>
                    </div>
                    <Link
                      to={item.type === 'generation_error' ? `/upload/${item.activity_id}` : `/review/${item.activity_id}`}
                      className="btn-link btn-link--plain btn-link--sm"
                    >
                      {item.type === 'generation_error' ? 'Tentar de novo' : 'Revisar'}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Window>

          <Window fileName="fila-de-revisao.txt" id="section-review-queue">
            <h2 className="section-title" style={{ fontSize: '1.5rem' }}>Fila de revisão</h2>
            {review_queue.length === 0 ? (
              <p className="empty-line">Nenhuma atividade com respostas pendentes na fila.</p>
            ) : (
              <div>
                {review_queue.map((q) => (
                  <div key={q.activity_id} className="queue-item">
                    <div className="queue-item__row">
                      <span className="queue-item__title">{q.title}</span>
                      <Link to={`/review/${q.activity_id}`} className="btn-link btn-link--primary btn-link--sm">
                        Revisar
                      </Link>
                    </div>
                    <ProgressBar
                      value={q.approved}
                      max={Math.max(q.total, 1)}
                      variant="purple"
                      label={`Progresso de aprovação: ${q.approved} de ${q.total}`}
                    />
                    <span className="queue-item__meta">
                      {q.approved} de {q.total} aprovados ({q.progress_percent}%)
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Window>
        </div>

        <div className="painel-col">
          <Window fileName="prazos.txt" id="section-deadlines">
            <h2 className="section-title" style={{ fontSize: '1.5rem' }}>Prazos</h2>
            <div className="dashboard-week-strip" role="group" aria-label="Dias da semana atual">
              {weekDays.map((d, i) => (
                <div
                  key={i}
                  className={`dashboard-week-day${d.isToday ? ' dashboard-week-day--active' : ''}`}
                  title={d.isToday ? 'Hoje' : d.name}
                  aria-current={d.isToday ? 'date' : undefined}
                >
                  <span className="dashboard-week-day__name">{d.name}</span>
                  <span className="dashboard-week-day__num">{d.dateNumber}</span>
                </div>
              ))}
            </div>
            {deadlines.length === 0 ? (
              <p className="empty-line">Nenhuma atividade com prazo cadastrado.</p>
            ) : (
              <ul className="list-plain">
                {deadlines.map((dl) => (
                  <li key={dl.activity_id} className="list-row">
                    <span className="list-row__title">{dl.title}</span>
                    <Stamp tone="reviewed">{formatDueDate(dl.due_date)}</Stamp>
                  </li>
                ))}
              </ul>
            )}
          </Window>
        </div>
      </div>
    </div>
  );
}
