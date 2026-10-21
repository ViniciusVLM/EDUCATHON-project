/**
 * Planos, cota mensal de IA e chave própria do Gemini.
 *
 * Quem "paga" (entidade de cobrança):
 *  - professor sem instituição → ele mesmo;
 *  - professor de uma instituição → a instituição (cota compartilhada).
 *
 * Os preços são ilustrativos e o pagamento é simulado: o protótipo só demonstra o fluxo.
 * Antes de cobrar de verdade é preciso validação jurídica e financeira (contrato, nota fiscal, LGPD).
 */
import { getDb } from '../database/db.js';
import { decryptSecret } from './secrets.js';

const FREE_TEACHER_QUOTA = () => Number(process.env.FREE_MONTHLY_QUOTA) || 50;
const FREE_ORG_QUOTA = () => Number(process.env.FREE_ORG_MONTHLY_QUOTA) || 200;

export const PLAN_CATALOG = [
  {
    id: 'gratuito',
    name: 'Gratuito',
    audience: 'todos',
    priceCents: 0,
    description: 'Para experimentar o Educathon com suas turmas.',
    features: ['Feedbacks com IA dentro da cota do mês', 'Leitura de provas em PDF, Word e foto', 'Portal do aluno com código da turma'],
  },
  {
    id: 'professor',
    name: 'Professor Premium',
    audience: 'professor',
    priceCents: 2990,
    monthlyQuota: 1000,
    description: 'Para quem corrige várias turmas por semana.',
    features: ['1.000 gerações de IA por mês', 'Questões objetivas com explicação do erro', 'Suporte por e-mail'],
  },
  {
    id: 'instituicao',
    name: 'Instituição',
    audience: 'instituicao',
    priceCents: 49900,
    monthlyQuota: 20000,
    description: 'Para escolas e redes que querem gerenciar professores e alunos.',
    features: ['20.000 gerações de IA por mês para toda a equipe', 'Painel da instituição com todos os usuários', 'Criação de acessos para professores e alunos'],
  },
];

export class QuotaError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'QuotaError';
    this.status = status;
    this.httpStatus = 402;
  }
}

function getPlan(id) {
  return PLAN_CATALOG.find((p) => p.id === id) || PLAN_CATALOG[0];
}

function isExpired(renewsAt) {
  if (!renewsAt) return false;
  const time = Date.parse(renewsAt.includes('T') ? renewsAt : `${renewsAt.replace(' ', 'T')}Z`);
  return Number.isFinite(time) && time < Date.now();
}

function quotaFor(planId, entityType) {
  if (planId === 'gratuito') return entityType === 'organization' ? FREE_ORG_QUOTA() : FREE_TEACHER_QUOTA();
  return getPlan(planId).monthlyQuota;
}

/**
 * Descobre quem paga pelo uso de IA do professor e com qual plano.
 */
export function getBillingEntity(teacherId) {
  const db = getDb();
  const teacher = db.prepare(`
    SELECT id, name, role, organization_id, plan, plan_renews_at, gemini_key_enc, gemini_key_last4
    FROM teachers WHERE id = ?
  `).get(teacherId);
  if (!teacher) return null;

  if (teacher.organization_id) {
    const org = db.prepare('SELECT * FROM organizations WHERE id = ?').get(teacher.organization_id);
    if (org) {
      const planId = isExpired(org.plan_renews_at) ? 'gratuito' : org.plan;
      return {
        type: 'organization',
        id: org.id,
        name: org.name,
        planId,
        renewsAt: planId === 'gratuito' ? null : org.plan_renews_at,
        keyEnc: org.gemini_key_enc,
        key: decryptSecret(org.gemini_key_enc),
        keyLast4: org.gemini_key_last4,
        canManage: teacher.role === 'org_admin',
        teacher,
      };
    }
  }

  const planId = isExpired(teacher.plan_renews_at) ? 'gratuito' : teacher.plan;
  return {
    type: 'teacher',
    id: teacher.id,
    name: teacher.name,
    planId,
    renewsAt: planId === 'gratuito' ? null : teacher.plan_renews_at,
    keyEnc: teacher.gemini_key_enc,
    key: decryptSecret(teacher.gemini_key_enc),
    keyLast4: teacher.gemini_key_last4,
    canManage: true,
    teacher,
  };
}

function usageThisMonth(entity) {
  const db = getDb();
  const column = entity.type === 'organization' ? 'organization_id' : 'teacher_id';
  const extra = entity.type === 'teacher' ? ' AND organization_id IS NULL' : '';
  const row = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN own_key = 0 THEN units ELSE 0 END), 0) AS platform,
      COALESCE(SUM(CASE WHEN own_key = 1 THEN units ELSE 0 END), 0) AS own
    FROM ai_usage
    WHERE ${column} = ? AND created_at >= datetime('now', 'start of month')${extra}
  `).get(entity.id);
  return { platform: row.platform, own: row.own };
}

/**
 * Situação da cota do professor (ou da instituição dele) no mês atual.
 */
export function getQuotaStatus(teacherId) {
  const entity = getBillingEntity(teacherId);
  if (!entity) return null;

  const plan = getPlan(entity.planId);
  const usage = usageThisMonth(entity);
  // Só conta como chave própria se ela puder ser lida (se a chave de criptografia mudou,
  // a chave salva deixa de valer e o uso volta para a cota da plataforma).
  const ownKey = Boolean(entity.key);
  const keyUnreadable = Boolean(entity.keyEnc) && !entity.key;
  const quota = quotaFor(entity.planId, entity.type);

  return {
    entity: { type: entity.type, id: entity.id, name: entity.name },
    plan: { id: plan.id, name: plan.name, renewsAt: entity.renewsAt },
    canManage: entity.canManage,
    ownKey: { configured: ownKey, last4: ownKey ? entity.keyLast4 : null, unreadable: keyUnreadable },
    // Com chave própria, a plataforma não limita: o custo vai para a conta Google de quem cadastrou.
    quota: ownKey ? null : quota,
    used: usage.platform,
    usedWithOwnKey: usage.own,
    remaining: ownKey ? null : Math.max(0, quota - usage.platform),
  };
}

/**
 * Reserva `units` gerações: confere a cota e já registra o uso, no mesmo instante (sem await
 * no meio), para que pedidos simultâneos não passem todos pela mesma sobra de cota.
 * Quem chamou devolve com recordUsage(teacherId, kind, -n) o que não chegar a usar.
 */
export function reserveQuota(teacherId, kind, units) {
  assertQuota(teacherId, units);
  recordUsage(teacherId, kind, units);
}

/**
 * Garante que há cota para `units` gerações. Lança QuotaError (HTTP 402) se não houver.
 */
export function assertQuota(teacherId, units = 1) {
  const status = getQuotaStatus(teacherId);
  if (!status || status.remaining === null) return status;
  if (status.remaining >= units) return status;

  const who = status.entity.type === 'organization'
    ? `A cota de IA da instituição ${status.entity.name}`
    : 'Sua cota de IA';
  const next = status.canManage
    ? 'Assine um plano ou cadastre a sua própria chave do Gemini em "Planos".'
    : 'Peça ao administrador da instituição para ampliar o plano.';
  const detail = status.remaining > 0
    ? ` Restam ${status.remaining} geração(ões) e esta ação precisa de ${units}.`
    : '';
  throw new QuotaError(`${who} deste mês acabou.${detail} ${next}`, status);
}

/**
 * Registra uso de IA. `units` negativo devolve unidades reservadas que não foram usadas.
 */
export function recordUsage(teacherId, kind, units = 1) {
  if (!units) return;
  const entity = getBillingEntity(teacherId);
  if (!entity) return;
  getDb().prepare(`
    INSERT INTO ai_usage (teacher_id, organization_id, kind, units, own_key)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    teacherId,
    entity.type === 'organization' ? entity.id : null,
    kind,
    units,
    entity.key ? 1 : 0
  );
}

/**
 * Chave do Gemini a usar para o professor: a dele (ou da instituição) se houver; senão null,
 * e o servidor usa a GEMINI_API_KEY da plataforma.
 */
export function resolveGeminiKey(teacherId) {
  const entity = getBillingEntity(teacherId);
  return entity?.key || null;
}

/**
 * Ativa um plano por 30 dias e registra o "pagamento" simulado.
 */
export function activatePlan(teacherId, planId, method) {
  const entity = getBillingEntity(teacherId);
  const plan = getPlan(planId);
  const db = getDb();
  const table = entity.type === 'organization' ? 'organizations' : 'teachers';

  db.transaction(() => {
    db.prepare(`UPDATE ${table} SET plan = ?, plan_renews_at = datetime('now', '+30 days') WHERE id = ?`)
      .run(plan.id, entity.id);
    db.prepare(`
      INSERT INTO simulated_payments (teacher_id, organization_id, plan, amount_cents, method)
      VALUES (?, ?, ?, ?, ?)
    `).run(teacherId, entity.type === 'organization' ? entity.id : null, plan.id, plan.priceCents, method);
  })();
}

export function cancelPlan(teacherId) {
  const entity = getBillingEntity(teacherId);
  const table = entity.type === 'organization' ? 'organizations' : 'teachers';
  getDb().prepare(`UPDATE ${table} SET plan = 'gratuito', plan_renews_at = NULL WHERE id = ?`).run(entity.id);
}

export function listPayments(teacherId) {
  const entity = getBillingEntity(teacherId);
  const db = getDb();
  if (entity.type === 'organization') {
    return db.prepare(`
      SELECT id, plan, amount_cents, method, status, created_at FROM simulated_payments
      WHERE organization_id = ? ORDER BY id DESC LIMIT 12
    `).all(entity.id);
  }
  return db.prepare(`
    SELECT id, plan, amount_cents, method, status, created_at FROM simulated_payments
    WHERE teacher_id = ? AND organization_id IS NULL ORDER BY id DESC LIMIT 12
  `).all(entity.id);
}

export function saveEntityKey(teacherId, encrypted, last4) {
  const entity = getBillingEntity(teacherId);
  const table = entity.type === 'organization' ? 'organizations' : 'teachers';
  getDb().prepare(`UPDATE ${table} SET gemini_key_enc = ?, gemini_key_last4 = ? WHERE id = ?`)
    .run(encrypted, last4, entity.id);
}

export function planAvailableFor(planId, entityType) {
  const plan = PLAN_CATALOG.find((p) => p.id === planId);
  if (!plan || plan.id === 'gratuito') return false;
  if (entityType === 'organization') return plan.audience === 'instituicao';
  return plan.audience === 'professor';
}
