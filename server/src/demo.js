#!/usr/bin/env node
/**
 * Launcher do Servidor em Modo Demonstração (Fase 7 / Etapa E).
 *
 * Define GEMINI_MOCK=true no processo de forma multiplataforma (Windows PowerShell, Linux, macOS)
 * sem exigir cross-env ou novas dependências.
 */
process.env.GEMINI_MOCK = 'true';

console.log('🚀 Iniciando Educathon em MODO DEMONSTRAÇÃO (IA Simulada Determinística)...');
console.log('   Sem consumo de cota ou chamadas externas à Gemini API.');

await import('./index.js');
