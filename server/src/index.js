import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { getDb } from './database/db.js';
import { resetOrphanJobs } from './services/queue.js';
import activitiesRouter from './routes/activities.js';
import studentsRouter from './routes/students.js';
import feedbackRouter from './routes/feedback.js';
import csvRouter from './routes/csv.js';
import authRouter from './routes/auth.js';
import classesRouter from './routes/classes.js';
import dashboardRouter from './routes/dashboard.js';
import { requireAuth } from './middleware/auth.js';
import { checkGeminiApiKeyOnStartup } from './services/gemini.js';
import { configureTrustProxy } from './services/config.js';

const app = express();
const PORT = process.env.PORT || 3001;

// ──────────────────────────────────────────
// Configurações do servidor (Proxy & IA)
// ──────────────────────────────────────────
configureTrustProxy(app);
checkGeminiApiKeyOnStartup();

// ──────────────────────────────────────────
// Middlewares
// ──────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
  : ['http://localhost:5173', 'http://127.0.0.1:5173'];

app.use(cors({
  origin: corsOrigins,
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  credentials: true,
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// ──────────────────────────────────────────
// Inicializa banco de dados e recupera jobs órfãos
// ──────────────────────────────────────────
getDb();
const recovered = resetOrphanJobs();
if (recovered && recovered.changes > 0) {
  console.log(`⚠️ ${recovered.changes} job(s) órfão(s) em processamento marcado(s) como erro.`);
}

// ──────────────────────────────────────────
// Rotas
// ──────────────────────────────────────────
// Health check público
app.get('/api/health', (req, res) => {
  const isMock = process.env.GEMINI_MOCK === 'true';
  res.json({
    status: 'ok',
    name: 'Educathon API — Copiloto Pedagógico',
    aiMode: isMock ? 'mock' : 'gemini',
    timestamp: new Date().toISOString(),
  });
});

// Rotas públicas de autenticação
app.use('/api/auth', authRouter);

// Rotas operacionais protegidas por autenticação
app.use('/api/dashboard', requireAuth, dashboardRouter);
app.use('/api/classes', requireAuth, classesRouter);
app.use('/api/activities', requireAuth, activitiesRouter);
app.use('/api/activities', requireAuth, studentsRouter);
app.use('/api', requireAuth, feedbackRouter);
app.use('/api', requireAuth, csvRouter);

// ──────────────────────────────────────────
// Tratamento de erros global
// ──────────────────────────────────────────
app.use((err, req, res, _next) => {
  if (err.type === 'entity.too.large' || err.status === 413) {
    return res.status(413).json({
      error: 'Tamanho da requisição excede o limite permitido (máximo 2MB).',
    });
  }

  console.error('❌ Erro não tratado:', err);
  res.status(500).json({
    error: 'Erro interno do servidor.',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// ──────────────────────────────────────────
// Inicializa servidor
// ──────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('🎓 ═══════════════════════════════════════════');
  console.log('   EDUCATHON — Copiloto Pedagógico');
  console.log('   Servidor rodando em http://localhost:' + PORT);
  console.log('   Health check: http://localhost:' + PORT + '/api/health');
  console.log('🎓 ═══════════════════════════════════════════');
  console.log('');
});
