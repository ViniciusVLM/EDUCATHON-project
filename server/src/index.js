import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { getDb } from './database/db.js';
import activitiesRouter from './routes/activities.js';
import studentsRouter from './routes/students.js';
import feedbackRouter from './routes/feedback.js';
import csvRouter from './routes/csv.js';
import authRouter from './routes/auth.js';
import classesRouter from './routes/classes.js';
import { requireAuth } from './middleware/auth.js';

const app = express();
const PORT = process.env.PORT || 3001;

// ──────────────────────────────────────────
// Middlewares
// ──────────────────────────────────────────
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
  : ['http://localhost:5173', 'http://127.0.0.1:5173'];

app.use(cors({
  origin: corsOrigins,
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ──────────────────────────────────────────
// Inicializa banco de dados
// ──────────────────────────────────────────
getDb();

// ──────────────────────────────────────────
// Rotas
// ──────────────────────────────────────────
// Health check público
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    name: 'Educathon API — Copiloto Pedagógico',
    timestamp: new Date().toISOString(),
  });
});

// Rotas públicas de autenticação
app.use('/api/auth', authRouter);

// Rotas operacionais protegidas por autenticação
app.use('/api/classes', requireAuth, classesRouter);
app.use('/api/activities', requireAuth, activitiesRouter);
app.use('/api/activities', requireAuth, studentsRouter);
app.use('/api', requireAuth, feedbackRouter);
app.use('/api', requireAuth, csvRouter);

// ──────────────────────────────────────────
// Tratamento de erros global
// ──────────────────────────────────────────
app.use((err, req, res, _next) => {
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
