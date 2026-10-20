/**
 * Planos, cota de IA, pagamento SIMULADO e chave própria do Gemini.
 * Montada em /api/billing com requireAuth.
 *
 * ⚠️ Protótipo: nenhum pagamento real é feito e nenhum dado de cartão chega ao servidor.
 */
import { Router } from 'express';
import {
  PLAN_CATALOG,
  getQuotaStatus,
  activatePlan,
  cancelPlan,
  listPayments,
  planAvailableFor,
  saveEntityKey,
} from '../services/plans.js';
import { encryptSecret, lastFour } from '../services/secrets.js';
import { isGeminiApiKeyPlaceholder } from '../services/gemini.js';

const router = Router();

function forbidIfCannotManage(status, res) {
  if (status.canManage) return false;
  res.status(403).json({ error: 'Só o administrador da instituição pode mudar o plano ou a chave.' });
  return true;
}

/** GET /api/billing */
router.get('/', (req, res) => {
  const status = getQuotaStatus(req.teacher.id);
  if (!status) return res.status(404).json({ error: 'Professor não encontrado.' });
  const audience = status.entity.type === 'organization' ? 'instituicao' : 'professor';
  res.json({
    ...status,
    catalog: PLAN_CATALOG.filter((p) => p.audience === 'todos' || p.audience === audience).map((p) => ({
      ...p,
      monthlyQuota: p.id === 'gratuito'
        ? (status.entity.type === 'organization'
          ? Number(process.env.FREE_ORG_MONTHLY_QUOTA) || 200
          : Number(process.env.FREE_MONTHLY_QUOTA) || 50)
        : p.monthlyQuota,
    })),
    payments: status.canManage ? listPayments(req.teacher.id) : [],
    simulated: true,
  });
});

/**
 * POST /api/billing/checkout
 * Body: { plan: 'professor' | 'instituicao', method: 'pix' | 'cartao' }
 * Simula um pagamento aprovado e ativa o plano por 30 dias.
 */
router.post('/checkout', (req, res) => {
  const status = getQuotaStatus(req.teacher.id);
  if (forbidIfCannotManage(status, res)) return;

  const { plan, method } = req.body || {};
  if (!['pix', 'cartao'].includes(method)) {
    return res.status(400).json({ error: 'Escolha Pix ou cartão.' });
  }
  if (!planAvailableFor(plan, status.entity.type)) {
    return res.status(400).json({ error: 'Este plano não está disponível para a sua conta.' });
  }

  activatePlan(req.teacher.id, plan, method);
  res.status(201).json({
    message: 'Pagamento simulado aprovado! Plano ativado por 30 dias.',
    simulated: true,
    status: getQuotaStatus(req.teacher.id),
  });
});

/** POST /api/billing/cancel — volta para o plano gratuito. */
router.post('/cancel', (req, res) => {
  const status = getQuotaStatus(req.teacher.id);
  if (forbidIfCannotManage(status, res)) return;
  cancelPlan(req.teacher.id);
  res.json({ message: 'Plano cancelado. Você voltou para o plano gratuito.', status: getQuotaStatus(req.teacher.id) });
});

/**
 * PUT /api/billing/api-key
 * Cadastra a chave paga do Gemini do professor (ou da instituição). Body: { apiKey }
 * A chave é guardada criptografada e nunca volta para o navegador.
 */
router.put('/api-key', (req, res) => {
  const status = getQuotaStatus(req.teacher.id);
  if (forbidIfCannotManage(status, res)) return;

  const apiKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey.trim() : '';
  if (apiKey.length < 20 || apiKey.length > 200 || isGeminiApiKeyPlaceholder(apiKey) || /\s/.test(apiKey)) {
    return res.status(400).json({ error: 'Chave inválida. Ela começa com "AIza" ou "AQ." e é gerada no Google AI Studio.' });
  }

  saveEntityKey(req.teacher.id, encryptSecret(apiKey), lastFour(apiKey));
  res.json({
    message: 'Chave salva. As próximas gerações usam a sua chave e não contam na cota da plataforma.',
    status: getQuotaStatus(req.teacher.id),
  });
});

/** DELETE /api/billing/api-key */
router.delete('/api-key', (req, res) => {
  const status = getQuotaStatus(req.teacher.id);
  if (forbidIfCannotManage(status, res)) return;
  saveEntityKey(req.teacher.id, null, null);
  res.json({ message: 'Chave removida. Voltamos a usar a cota da plataforma.', status: getQuotaStatus(req.teacher.id) });
});

export default router;
