#!/usr/bin/env node
/**
 * Script de Avaliação Pedagógica Automatizada (Fase 4).
 * Avalia o gerador de feedback contra regras objetivas:
 * 1. Sem nota numérica ou conceito
 * 2. Começa pelo nome do aluno
 * 3. Contém entre 3 e 6 frases
 * 4. Não repete a pergunta original
 *
 * Suporta modo mock via flag --mock ou quando GEMINI_API_KEY não estiver configurada.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import 'dotenv/config';

import { generateFeedback, resetModel } from '../src/services/gemini.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const datasetPath = join(__dirname, 'dataset.json');
const dataset = JSON.parse(readFileSync(datasetPath, 'utf8'));

const isMockMode =
  process.argv.includes('--mock') ||
  !process.env.GEMINI_API_KEY ||
  process.env.GEMINI_API_KEY === 'your_gemini_api_key_here';

console.log(`\n======================================================`);
console.log(`🎯 EDUCATHON — Bateria de Avaliação da Qualidade do Feedback`);
console.log(`Modo de execução: ${isMockMode ? '🧪 MOCK (Simulação Determinística)' : '🤖 LIVE (Gemini API)'}`);
console.log(`Total de amostras no dataset: ${dataset.length}`);
console.log(`======================================================\n`);

if (isMockMode) {
  process.env.GEMINI_MOCK = 'true';
}

/**
 * Validador das 4 regras objetivas.
 */
function verifyObjectiveRules(sample, parsed) {
  const violations = [];
  const feedback = parsed.feedback_completo || '';

  // Regra 1: Sem nota numérica ou conceitos
  const numericGradePatterns = [
    /\bnota\s*[:=]?\s*\d+(\.\d+)?/i,
    /\b\d+(\.\d+)?\s*\/\s*10\b/,
    /\b\d+\s*(pontos|pts)\b/i,
    /\bconceito\s*[A-Fa-f][+-]?\b/i,
    /\b[0-9]{1,2}\s*de\s*10\b/i,
    /\b10\s*de\s*10\b/i,
  ];

  for (const pattern of numericGradePatterns) {
    if (pattern.test(feedback)) {
      violations.push(`Regra 1 violada: Contém menção a nota ou pontuação (${pattern})`);
      break;
    }
  }

  // Regra 2: Começa pelo nome do aluno
  const firstName = sample.studentName.split(' ')[0].toLowerCase();
  const trimmedLower = feedback.trim().toLowerCase();
  if (!trimmedLower.startsWith(firstName)) {
    violations.push(
      `Regra 2 violada: Feedback não começa com o nome do aluno '${sample.studentName}' (início: '${feedback.slice(0, 25)}...')`
    );
  }

  // Regra 3: Entre 3 e 6 frases
  const sentences = feedback
    .trim()
    .split(/[.!?]+(?:\s+|$)/)
    .filter((s) => s.trim().length > 0);
  const sentenceCount = sentences.length;
  if (sentenceCount < 3 || sentenceCount > 6) {
    violations.push(
      `Regra 3 violada: Esperado entre 3 e 6 frases, mas foram detectadas ${sentenceCount} frases.`
    );
  }

  // Regra 4: Sem repetir a pergunta original
  const cleanQuestion = sample.question.toLowerCase().trim();
  if (feedback.toLowerCase().includes(cleanQuestion)) {
    violations.push('Regra 4 violada: O texto repete a pergunta original na íntegra.');
  }

  return {
    passed: violations.length === 0,
    sentenceCount,
    violations,
  };
}

async function runEvaluation() {
  let passedCount = 0;
  let failedCount = 0;
  const results = [];

  for (let i = 0; i < dataset.length; i++) {
    const sample = dataset[i];
    process.stdout.write(`[${i + 1}/${dataset.length}] Testando: ${sample.studentName} (${sample.category})... `);

    try {
      const result = await generateFeedback({
        studentName: sample.studentName,
        question: sample.question,
        rubric: sample.rubric,
        studentResponse: sample.studentResponse,
        educationLevel: sample.educationLevel,
        subject: sample.subject,
        rubricCriteria: sample.rubricCriteria,
      });

      const validation = verifyObjectiveRules(sample, result.parsed);

      if (validation.passed) {
        console.log(`✅ OK (${validation.sentenceCount} frases)`);
        passedCount++;
      } else {
        console.log(`❌ FALHOU`);
        for (const v of validation.violations) {
          console.log(`   ⚠️  ${v}`);
        }
        failedCount++;
      }

      results.push({
        sampleId: sample.id,
        category: sample.category,
        studentName: sample.studentName,
        passed: validation.passed,
        violations: validation.violations,
        feedback: result.parsed.feedback_completo,
      });
    } catch (err) {
      console.log(`❌ ERRO DE EXECUÇÃO: ${err.message}`);
      failedCount++;
      results.push({
        sampleId: sample.id,
        category: sample.category,
        studentName: sample.studentName,
        passed: false,
        violations: [`Erro de execução: ${err.message}`],
      });
    }
  }

  console.log(`\n======================================================`);
  console.log(`📊 RESULTADO DA AVALIAÇÃO:`);
  console.log(`   Aprovados: ${passedCount}/${dataset.length}`);
  console.log(`   Falhas:    ${failedCount}/${dataset.length}`);
  console.log(`======================================================\n`);

  resetModel();

  if (failedCount > 0) {
    process.exit(1);
  }
}

runEvaluation().catch((err) => {
  console.error('Falha crítica na avaliação:', err);
  process.exit(1);
});
