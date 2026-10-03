/**
 * Middlewares de Rate Limiting (Fase 5 — Endurecimento)
 * Protege contra força bruta em autenticação e abuso de cota do Gemini.
 * Configurável via variáveis de ambiente.
 */
import rateLimit from 'express-rate-limit';

const isTest =
  process.env.NODE_ENV === 'test' ||
  process.execArgv.includes('--test') ||
  process.env.NODE_TEST_CONTEXT !== undefined;

/**
 * Limiter estrito para rotas de autenticação (/api/auth/login e /api/auth/register).
 */
export const authLimiter = rateLimit({
  windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Muitas tentativas de autenticação a partir deste IP. Tente novamente mais tarde.',
  },
  skip: () => isTest && !process.env.TEST_RATE_LIMIT,
});

/**
 * Limiter para endpoints que consomem cota do Gemini (/generate e /regenerate).
 */
export const aiGenerateLimiter = rateLimit({
  windowMs: Number(process.env.GENERATE_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: Number(process.env.GENERATE_RATE_LIMIT_MAX) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Limite de geração de feedbacks por IA atingido temporariamente. Tente novamente em alguns minutos.',
  },
  skip: () => isTest && !process.env.TEST_RATE_LIMIT,
});
