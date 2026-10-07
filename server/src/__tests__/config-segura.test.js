import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { validateJwtSecret, JWT_EXAMPLE_VALUE } from '../services/auth.js';
import { configureTrustProxy } from '../services/config.js';
import { isGeminiApiKeyPlaceholder, checkGeminiApiKeyOnStartup } from '../services/gemini.js';

describe('ETAPA B — Configuração Segura: JWT_SECRET', () => {
  test('segredo curto recusado', () => {
    // Fora do ambiente de teste (inTestEnv = false), segredos com < 32 caracteres devem ser recusados
    assert.throws(
      () => validateJwtSecret('senha-curta-de-19-carac', false),
      (err) => {
        assert.match(err.message, /JWT_SECRET inseguro|pelo menos 32 caracteres/i);
        return true;
      }
    );

    // Segredo com 31 caracteres
    assert.throws(
      () => validateJwtSecret('a'.repeat(31), false),
      (err) => {
        assert.match(err.message, /JWT_SECRET inseguro|pelo menos 32 caracteres/i);
        return true;
      }
    );
  });

  test('placeholder recusado', () => {
    // 1. Igual ao valor do .env.example
    assert.throws(
      () => validateJwtSecret(JWT_EXAMPLE_VALUE, false),
      (err) => {
        assert.match(err.message, /placeholder|inseguro/i);
        return true;
      }
    );

    // 2. Contendo "substitua" (mesmo se tiver >= 32 chars)
    assert.throws(
      () => validateJwtSecret('substitua_este_segredo_longo_por_outro_de_64_caracteres_hex', false),
      (err) => {
        assert.match(err.message, /placeholder|inseguro/i);
        return true;
      }
    );

    // 3. Contendo "your_" (mesmo se tiver >= 32 chars)
    assert.throws(
      () => validateJwtSecret('your_secret_key_with_many_characters_here_1234567890', false),
      (err) => {
        assert.match(err.message, /placeholder|inseguro/i);
        return true;
      }
    );
  });

  test('segredo de 64 hex aceito', () => {
    const validHex64 = 'c0a80101b0b1b2b3c0c1c2c3d0d1d2d3e0e1e2e3f0f1f2f3a1a2a3a4b1b2b3b4';
    assert.doesNotThrow(() => {
      const res = validateJwtSecret(validHex64, false);
      assert.equal(res, validHex64);
    });
  });

  test('fallback mantido exclusivamente em ambiente de teste', () => {
    // Quando inTestEnv é true e secret é ausente, retorna fallback seguro para testes
    const fallback = validateJwtSecret(undefined, true);
    assert.equal(fallback, 'segredo-somente-para-testes');
  });
});

describe('ETAPA B — Configuração Segura: Trust Proxy', () => {
  test('trust proxy aplicado quando a variável existe', () => {
    // Salto numérico (ex.: 1 para 1 proxy reverso)
    const appHops = express();
    configureTrustProxy(appHops, '1');
    assert.equal(appHops.get('trust proxy'), 1);

    // Valor booleano verdadeiro
    const appTrue = express();
    configureTrustProxy(appTrue, 'true');
    assert.equal(appTrue.get('trust proxy'), true);

    // Múltiplos saltos numéricos
    const appHops2 = express();
    configureTrustProxy(appHops2, 2);
    assert.equal(appHops2.get('trust proxy'), 2);

    // Identificador de rede / IP
    const appLoopback = express();
    configureTrustProxy(appLoopback, 'loopback');
    assert.equal(appLoopback.get('trust proxy'), 'loopback');
  });

  test('trust proxy padrão permanece desligado quando não definida ou desativada', () => {
    const appDefault = express();
    configureTrustProxy(appDefault, undefined);
    assert.equal(appDefault.get('trust proxy'), false);

    const appEmpty = express();
    configureTrustProxy(appEmpty, '');
    assert.equal(appEmpty.get('trust proxy'), false);

    const appDisabled = express();
    configureTrustProxy(appDisabled, 'false');
    assert.equal(appDisabled.get('trust proxy'), false);
  });
});

describe('ETAPA B — Configuração Segura: Validação de GEMINI_API_KEY', () => {
  test('identifica chaves ausentes ou placeholders', () => {
    assert.equal(isGeminiApiKeyPlaceholder(undefined), true);
    assert.equal(isGeminiApiKeyPlaceholder(''), true);
    assert.equal(isGeminiApiKeyPlaceholder('your_gemini_api_key_here'), true);
    assert.equal(isGeminiApiKeyPlaceholder('sua_chave_aqui'), true);
    assert.equal(isGeminiApiKeyPlaceholder('invalid_key_without_correct_prefix'), true);
  });

  test('reconhece chaves válidas no padrão AIza e no novo padrão AQ. do Google AI Studio', () => {
    assert.equal(isGeminiApiKeyPlaceholder('AIzaSyD-ExemploDeChaveValidaDoGoogle123'), false);
    assert.equal(isGeminiApiKeyPlaceholder('AQ.AbCdEf123456789NovoFormatoDoGoogleAIStudio'), false);
  });

  test('checkGeminiApiKeyOnStartup emite aviso claro sem derrubar o processo', () => {
    let warningLogged = false;
    const originalWarn = console.warn;
    console.warn = (..._args) => {
      warningLogged = true;
    };

    try {
      const oldKey = process.env.GEMINI_API_KEY;
      const oldMock = process.env.GEMINI_MOCK;
      delete process.env.GEMINI_MOCK;
      process.env.GEMINI_API_KEY = 'your_gemini_api_key_here';

      assert.doesNotThrow(() => {
        checkGeminiApiKeyOnStartup();
      });
      assert.equal(warningLogged, true);

      process.env.GEMINI_API_KEY = oldKey;
      if (oldMock !== undefined) process.env.GEMINI_MOCK = oldMock;
    } finally {
      console.warn = originalWarn;
    }
  });
});
