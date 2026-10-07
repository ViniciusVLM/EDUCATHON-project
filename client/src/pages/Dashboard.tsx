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
  ProgressRing,
  IconPlus,
  IconFolder,
  IconSparkles,
  IconCheckCircle,
  IconAlertCircle,
  IconClock,
  IconBell,
  IconCap,
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
      <div className="dashboard" data-testid="dashboard-empty-state">
        <div className="dashboard-header">
          <div>
            <h1 className="dashboard-greeting__title">
              Olá, {firstName}! O que vamos corrigir hoje?
            </h1>
            <p className="dashboard-greeting__subtitle">
              Seu copiloto pedagógico pronto para acelerar suas avaliações com IA.
            </p>
          </div>
          <span className="dashboard-header__badge">
            ✨ A IA nunca dá nota; o professor decide
          </span>
        </div>

        <Card className="dashboard-empty">
          <div className="dashboard-empty__icon" aria-hidden="true">
            <IconCap size={36} />
          </div>
          <h2 className="dashboard-empty__title">Bem-vindo(a) ao seu novo painel!</h2>
          <p className="dashboard-empty__text">
            Você ainda não possui nenhuma atividade criada. Cadastre sua primeira avaliação para
            receber respostas dos estudantes e gerar feedbacks pedagógicos personalizados com IA.
          </p>

          <Link to="/setup" style={{ textDecoration: 'none' }}>
            <Button variant="purple" size="lg" icon={<IconPlus size={20} />}>
              Criar primeira atividade
            </Button>
          </Link>

          <p className="dashboard-empty__notice">
            💡 Dica: cada resposta de aluno recebe um rascunho de devolutiva detalhado para você revisar, ajustar e aprovar.
          </p>
        </Card>
      </div>
    );
  }

  // ── ESTADO POPULADO ──
  const { metrics, pending_review_items, recent_activities, deadlines, review_queue } = summary;

  // Cálculos de porcentagem para anéis
  const totalBase = metrics.total_feedbacks > 0 ? metrics.total_feedbacks : metrics.total_students;
  const approvedPercent = totalBase > 0 ? Math.round((metrics.approved / totalBase) * 100) : 0;
  const errorPercent = totalBase > 0 ? Math.round((metrics.generation_errors / totalBase) * 100) : 0;

  return (
    <div className="dashboard" data-testid="dashboard-content">
      {/* ── 1. Saudação ── */}
      <header className="dashboard-header">
        <div>
          <h1 className="dashboard-greeting__title">
            Olá, {firstName}! O que vamos corrigir hoje?
          </h1>
          <p className="dashboard-greeting__subtitle">
            Seu copiloto pedagógico pronto para acelerar suas avaliações com IA.
          </p>
        </div>
        <span className="dashboard-header__badge">
          ✨ A IA nunca dá nota; o professor decide
        </span>
      </header>

      {/* ── 2. Linha de Atalhos ── */}
      <section className="dashboard-shortcuts" aria-label="Atalhos rápidos">
        {/* Cartão tracejado com "+" */}
        <Link
          to="/setup"
          className="dashboard-shortcut-card dashboard-shortcut-card--dashed"
          aria-label="Nova atividade"
          id="shortcut-new-activity"
        >
          <div className="dashboard-shortcut-card__icon-wrap dashboard-shortcut-card__icon-wrap--dashed" aria-hidden="true">
            <IconPlus size={22} />
          </div>
          <span className="dashboard-shortcut-card__title">Nova atividade</span>
          <span className="dashboard-shortcut-card__desc">Configurar e criar</span>
        </Link>

        {/* 3 cartões com ilustrações originais */}
        <Link
          to="/activities"
          className="dashboard-shortcut-card"
          aria-label="Organize suas atividades"
          id="shortcut-activities"
        >
          <Card as="div" variant="hover" style={{ width: '100%', height: '100%', padding: 'var(--space-4)' }}>
            <div className="dashboard-shortcut-card__icon-wrap dashboard-shortcut-card__icon-wrap--purple" aria-hidden="true">
              <IconFolder size={20} />
            </div>
            <p className="dashboard-shortcut-card__title">Organize suas atividades</p>
            <p className="dashboard-shortcut-card__desc">Acesse turmas e histórico</p>
          </Card>
        </Link>

        <Link
          to="/setup"
          className="dashboard-shortcut-card"
          aria-label="Gere feedback com IA"
          id="shortcut-ai-feedback"
        >
          <Card as="div" variant="hover" style={{ width: '100%', height: '100%', padding: 'var(--space-4)' }}>
            <div className="dashboard-shortcut-card__icon-wrap dashboard-shortcut-card__icon-wrap--blue" aria-hidden="true">
              <IconSparkles size={20} />
            </div>
            <p className="dashboard-shortcut-card__title">Gere feedback com IA</p>
            <p className="dashboard-shortcut-card__desc">Copiloto sob medida</p>
          </Card>
        </Link>

        <Link
          to="/activities"
          className="dashboard-shortcut-card"
          aria-label="Revise e aprove"
          id="shortcut-review-approve"
        >
          <Card as="div" variant="hover" style={{ width: '100%', height: '100%', padding: 'var(--space-4)' }}>
            <div className="dashboard-shortcut-card__icon-wrap dashboard-shortcut-card__icon-wrap--green" aria-hidden="true">
              <IconCheckCircle size={20} />
            </div>
            <p className="dashboard-shortcut-card__title">Revise e aprove</p>
            <p className="dashboard-shortcut-card__desc">Você dá a palavra final</p>
          </Card>
        </Link>
      </section>

      {/* ── Grade Principal do Painel ── */}
      <div className="dashboard-main-grid">
        {/* Coluna Esquerda: Pendências, Atividades Recentes e Fila */}
        <div className="dashboard-col">
          {/* ── 3. Pendências de Revisão ── */}
          <Card id="section-pendings">
            <div className="dashboard-section-header">
              <h2 className="dashboard-section-header__title">
                <IconBell size={18} />
                Pendências de revisão
              </h2>
              {pending_review_items.length > 0 && (
                <span className="dashboard-section-header__count" data-testid="pending-count-badge">
                  {pending_review_items.length}
                </span>
              )}
            </div>

            {pending_review_items.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', textAlign: 'center', padding: '1rem' }}>
                🎉 Nenhuma pendência no momento. Todas as correções estão em dia!
              </p>
            ) : (
              <div className="dashboard-pendings-list">
                {pending_review_items.map((item, idx) => (
                  <div key={`${item.activity_id}-${item.type}-${idx}`} className="dashboard-pending-item">
                    <div className="dashboard-pending-item__info">
                      {item.type === 'generation_error' && (
                        <Chip color="pink" size="sm">Erro IA</Chip>
                      )}
                      {item.type === 'pending_feedback' && (
                        <Chip color="amber" size="sm">Aguardando</Chip>
                      )}
                      {item.type === 'generation_complete' && (
                        <Chip color="green" size="sm">Concluído</Chip>
                      )}

                      <div className="dashboard-pending-item__text">
                        <span className="dashboard-pending-item__title">{item.activity_title}</span>
                        <span className="dashboard-pending-item__badge-label">
                          {item.type === 'pending_feedback' && `${item.count} resposta(s) para revisar`}
                          {item.type === 'generation_error' && `${item.count} falha(s) na geração`}
                          {item.type === 'generation_complete' && `${item.count} feedback(s) prontos para revisão`}
                        </span>
                      </div>
                    </div>

                    <Link
                      to={item.type === 'generation_error' ? `/upload/${item.activity_id}` : `/review/${item.activity_id}`}
                      style={{ textDecoration: 'none' }}
                    >
                      <Button variant="ghost" size="sm">
                        {item.type === 'generation_error' ? 'Tentar de novo' : 'Revisar'}
                      </Button>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* ── 4. Atividades Recentes ── */}
          <Card id="section-recent-activities">
            <div className="dashboard-section-header">
              <h2 className="dashboard-section-header__title">
                <IconFolder size={18} />
                Atividades recentes
              </h2>
              <Link to="/setup" style={{ textDecoration: 'none' }}>
                <Button variant="ghost" size="sm" icon={<IconPlus size={14} />}>
                  + Nova atividade
                </Button>
              </Link>
            </div>

            {recent_activities.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', textAlign: 'center', padding: '1rem' }}>
                Nenhuma atividade recente encontrada.
              </p>
            ) : (
              <div className="dashboard-recent-list">
                {recent_activities.map((act) => (
                  <div key={act.id} className="dashboard-recent-item">
                    <div className="dashboard-recent-item__top">
                      <Link to={`/review/${act.id}`} className="dashboard-recent-item__title">
                        {act.title}
                      </Link>

                      <div className="dashboard-recent-item__chips">
                        {act.subject && <Chip color="purple" size="sm">{act.subject}</Chip>}
                        {act.class_name && <Chip color="blue" size="sm">{act.class_name}</Chip>}
                        {act.pending_review > 0 ? (
                          <Chip color="amber" size="sm">{act.pending_review} pendente(s)</Chip>
                        ) : (
                          <Chip color="green" size="sm">Revisado</Chip>
                        )}
                      </div>
                    </div>

                    <div className="dashboard-recent-item__bottom">
                      <span>{act.total_students} aluno(s) cadastrado(s)</span>
                      <span>Criado em {formatDueDate(act.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* ── 6. Fila de Revisão ── */}
          <Card id="section-review-queue">
            <div className="dashboard-section-header">
              <h2 className="dashboard-section-header__title">
                <IconCheckCircle size={18} />
                Fila de revisão
              </h2>
            </div>

            {review_queue.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', textAlign: 'center', padding: '1rem' }}>
                Nenhuma atividade com respostas pendentes na fila.
              </p>
            ) : (
              <div className="dashboard-queue-list">
                {review_queue.map((q) => (
                  <div key={q.activity_id} className="dashboard-queue-item">
                    <div className="dashboard-queue-item__row">
                      <span className="dashboard-queue-item__title">{q.title}</span>
                      <Link to={`/review/${q.activity_id}`} style={{ textDecoration: 'none' }}>
                        <Button variant="purple" size="sm">
                          Revisar
                        </Button>
                      </Link>
                    </div>

                    <ProgressBar
                      value={q.approved}
                      max={q.total}
                      variant="purple"
                      label={`Progresso de aprovação: ${q.approved} de ${q.total}`}
                    />

                    <span className="dashboard-queue-item__meta">
                      {q.approved} de {q.total} aprovados ({q.progress_percent}%)
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Coluna Direita: Anéis e Prazos */}
        <div className="dashboard-col">
          {/* ── 7. Dois Anéis de Progresso ── */}
          <Card className="dashboard-rings-card" id="section-progress-rings">
            <div className="dashboard-ring-box">
              <ProgressRing
                value={approvedPercent}
                size={86}
                strokeWidth={9}
                variant="success"
                label={`Taxa de aprovação: ${approvedPercent}%`}
              />
              <span className="dashboard-ring-box__label">Aprovados</span>
              <span className="dashboard-ring-box__sub">{metrics.approved} feedbacks</span>
            </div>

            <div className="dashboard-ring-box">
              <ProgressRing
                value={errorPercent}
                size={86}
                strokeWidth={9}
                variant={metrics.generation_errors > 0 ? 'danger' : 'purple'}
                label={`Taxa de erros: ${errorPercent}%`}
              />
              <span className="dashboard-ring-box__label">Gerações com erro</span>
              <span className="dashboard-ring-box__sub">
                {metrics.generation_errors > 0 ? `${metrics.generation_errors} falha(s)` : '0 falhas'}
              </span>
            </div>
          </Card>

          {/* ── 5. Prazos (com semana atual) ── */}
          <Card id="section-deadlines">
            <div className="dashboard-section-header">
              <h2 className="dashboard-section-header__title">
                <IconClock size={18} />
                Prazos
              </h2>
            </div>

            {/* Barra da semana atual */}
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

            {/* Lista de atividades com prazo */}
            {deadlines.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', textAlign: 'center', padding: '1rem' }}>
                Nenhuma atividade com prazo cadastrado.
              </p>
            ) : (
              <div className="dashboard-deadlines-list">
                {deadlines.map((dl) => (
                  <div key={dl.activity_id} className="dashboard-deadline-item">
                    <span className="dashboard-deadline-item__title">{dl.title}</span>
                    <span className="dashboard-deadline-item__date">
                      {formatDueDate(dl.due_date)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
