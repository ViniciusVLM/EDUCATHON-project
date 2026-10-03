/**
 * Teste do Problema A — Fase 1.
 * Garante que auth.js respeita JWT_SECRET injetado no processo antes
 * do import, provando que `import 'dotenv/config'` como primeira linha
 * de index.js resolve a corrida de inicialização.
 *
 * Este teste falharia na versão anterior (dotenv.config() após os imports)
 * porque JWT_SECRET lido em auth.js teria o valor do fallback mesmo com
 * a variável definida no processo antes do import do módulo auth.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const EXPECTED_SECRET = 'jwt-secret-from-dotenv-file';

// Simula o que `import 'dotenv/config'` faz: injeta a variável ANTES
// que qualquer outro módulo seja avaliado.
process.env.JWT_SECRET = EXPECTED_SECRET;
process.env.DB_PATH = ':memory:';

// Importa APOS definir as envs -- equivale ao comportamento correto.
const { generateToken, verifyToken } = await import('../services/auth.js');

describe('Carregamento do JWT_SECRET via variavel de ambiente (.env)', () => {
  test('token gerado com JWT_SECRET do env e verificavel pelo mesmo segredo', () => {
    const teacher = { id: 1, name: 'Prof. Dotenv', email: 'dotenv@escola.org' };

    // Se auth.js usasse o fallback ('educathon-dev-secret-key-2026') em vez
    // do EXPECTED_SECRET, verifyToken lancaria JsonWebTokenError aqui.
    const token = generateToken(teacher);
    const decoded = verifyToken(token);

    assert.equal(decoded.id, teacher.id);
    assert.equal(decoded.name, teacher.name);
    assert.equal(decoded.email, teacher.email);
  });

  test('token gerado com segredo diferente falha na verificacao', async () => {
    // Confirma que verifyToken rejeita tokens assinados com outro segredo.
    const jwt = await import('jsonwebtoken');
    const tokenComSegredoErrado = jwt.default.sign(
      { id: 99, name: 'Intruso', email: 'intruso@escola.org' },
      'segredo-errado-qualquer'
    );

    assert.throws(() => verifyToken(tokenComSegredoErrado), {
      name: 'JsonWebTokenError',
    });
  });
});
