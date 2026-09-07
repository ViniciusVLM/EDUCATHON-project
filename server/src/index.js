import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { getDb } from './database/db.js';
import activitiesRouter from './routes/activities.js';
import studentsRouter from './routes/students.js';
import feedbackRouter from './routes/feedback.js';

// Carrega variáveis de ambiente
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// ──────────────────────────────────────────
// Middlewares
// ──────────────────────────────────────────
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
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
app.use('/api/activities', activitiesRouter);
app.use('/api/activities', studentsRouter);
app.use('/api', feedbackRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    name: 'Educathon API — Copiloto Pedagógico',
    timestamp: new Date().toISOString(),
  });
});

// ──────────────────────────────────────────
// Tratamento de erros global
// ──────────────────────────────────────────
app.use((err, req, res, next) => {
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
