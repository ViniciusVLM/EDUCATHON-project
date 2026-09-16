/**
 * Testes unitários do parser de CSV.
 * Usa node:test (built-in, sem dependências extras).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV } from '../services/parser.js';

describe('parseCSV — colunas com nomes padrão', () => {
  test('reconhece nome_aluno + resposta (vírgula)', () => {
    const csv = 'nome_aluno,resposta\nJoão,Minha resposta';
    const rows = parseCSV(csv);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].student_name, 'João');
    assert.equal(rows[0].original_response, 'Minha resposta');
  });

  test('reconhece nome + texto', () => {
    const csv = 'nome,texto\nMaria,Texto da Maria';
    const rows = parseCSV(csv);
    assert.equal(rows[0].student_name, 'Maria');
    assert.equal(rows[0].original_response, 'Texto da Maria');
  });

  test('reconhece student_name + response', () => {
    const csv = 'student_name,response\nAna,Answer here';
    const rows = parseCSV(csv);
    assert.equal(rows[0].student_name, 'Ana');
  });

  test('reconhece aluno + answer', () => {
    const csv = 'aluno,answer\nPedro,Resposta do Pedro';
    const rows = parseCSV(csv);
    assert.equal(rows[0].student_name, 'Pedro');
  });

  test('reconhece estudante + original_response', () => {
    const csv = 'estudante,original_response\nLucia,Resposta da Lucia';
    const rows = parseCSV(csv);
    assert.equal(rows[0].student_name, 'Lucia');
  });

  test('reconhece coluna opcional de email', () => {
    const csv = 'nome_aluno,resposta,email\nBeatriz,Texto da Beatriz,beatriz@escola.com';
    const rows = parseCSV(csv);
    assert.equal(rows[0].student_name, 'Beatriz');
    assert.equal(rows[0].email, 'beatriz@escola.com');
  });
});

describe('parseCSV — delimitador ponto-e-vírgula', () => {
  test('parseia CSV com delimitador ;', () => {
    const csv = 'nome_aluno;resposta\nCarlos;Minha resposta com ponto e vírgula';
    const rows = parseCSV(csv);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].student_name, 'Carlos');
  });

  test('parseia múltiplos alunos com ;', () => {
    const csv = 'nome_aluno;resposta\nAluno A;Resp A\nAluno B;Resp B\nAluno C;Resp C';
    const rows = parseCSV(csv);
    assert.equal(rows.length, 3);
    assert.equal(rows[2].student_name, 'Aluno C');
  });
});

describe('parseCSV — linhas vazias e dados incompletos', () => {
  test('ignora linhas com nome vazio', () => {
    const csv = 'nome_aluno,resposta\n,Resposta sem nome\nJoão,Resposta válida';
    const rows = parseCSV(csv);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].student_name, 'João');
  });

  test('ignora linhas com resposta vazia', () => {
    const csv = 'nome_aluno,resposta\nJoão,\nMaria,Resposta da Maria';
    const rows = parseCSV(csv);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].student_name, 'Maria');
  });

  test('ignora linhas completamente vazias', () => {
    const csv = 'nome_aluno,resposta\nJoão,Resposta\n\n\nMaria,Outra resposta';
    const rows = parseCSV(csv);
    assert.equal(rows.length, 2);
  });
});

describe('parseCSV — erros esperados', () => {
  test('lança erro em CSV sem coluna de nome', () => {
    const csv = 'coluna_estranha,resposta\nJoão,Resposta';
    assert.throws(() => parseCSV(csv), /Coluna de nome do aluno não encontrada/);
  });

  test('lança erro em CSV sem coluna de resposta', () => {
    const csv = 'nome_aluno,coluna_estranha\nJoão,Resposta';
    assert.throws(() => parseCSV(csv), /Coluna de resposta não encontrada/);
  });

  test('lança erro em CSV vazio', () => {
    const csv = 'nome_aluno,resposta\n';
    assert.throws(() => parseCSV(csv), /vazio|não contém|nenhuma/i);
  });

  test('lança erro quando todos os registros são inválidos', () => {
    const csv = 'nome_aluno,resposta\n,\n,';
    assert.throws(() => parseCSV(csv), /Nenhuma resposta válida/);
  });
});
