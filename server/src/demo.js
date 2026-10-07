#!/usr/bin/env node
/**
 * Launcher do Servidor em Modo Demonstração (Fase 7 / Etapa E).
 *
 * Define GEMINI_MOCK=true no processo de forma multiplataforma (Windows PowerShell, Linux, macOS)
 * sem exigir cross-env ou novas dependências.
 */
import crypto from 'node:crypto';

process.env.GEMINI_MOCK = 'true';

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  console.warn(
    '⚠️ AVISO: JWT_SECRET não definido no .env. Gerado segredo temporário aleatório em memória para demonstração.\n' +
    '  Atenção: sessões e tokens JWT perderão a validade ao reiniciar o servidor.'
  );
}

console.log('🚀 Iniciando Educathon em MODO DEMONSTRAÇÃO (IA Simulada Determinística)...');
console.log('   Sem consumo de cota ou chamadas externas à Gemini API.');

await import('./index.js');

