import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { detectCategory, generateMockFeedback } from '../services/mockAi.js';
import { DEMO_RUBRIC_CRITERIA, DEMO_STUDENT_RESPONSES } from '../database/seed.js';

const QUESTION =
  'Explique como ocorre o processo da fotossíntese e qual a sua importância biológica para os fluxos de energia nos ecossistemas terrestres.';
const CRITERIA_TITLES = DEMO_RUBRIC_CRITERIA.map((c) => c.criterio);

function categoryOf(name) {
  const r = DEMO_STUDENT_RESPONSES.find((s) => s.student_name === name);
  assert.ok(r, `aluno ${name} não encontrado no seed`);
  return detectCategory(r.original_response, QUESTION, CRITERIA_TITLES);
}

describe('Mock — classificação das respostas do seed', () => {
  test('só a resposta sobre celulares e internet fica fora do tema', () => {
    const foraDoTema = DEMO_STUDENT_RESPONSES.filter(
      (r) => detectCategory(r.original_response, QUESTION, CRITERIA_TITLES) === 'fora_de_topico'
    ).map((r) => r.student_name);
    assert.deepEqual(foraDoTema, ['Rafaela Mendes']);
  });

  test('erro conceitual no tema é equívoco, não fora do tema', () => {
    assert.equal(categoryOf('Camila Duarte'), 'equivoco_conceitual');
  });

  test('linguagem informal com conteúdo correto é informal com acertos', () => {
    assert.equal(categoryOf('Bruno Carvalho'), 'informal_com_acertos');
  });

  test('variação de plural/singular não vira fora do tema', () => {
    const resp = 'As plantas transformam luz em energia e sustentam o ecossistema inteiro ao redor delas.';
    assert.notEqual(detectCategory(resp, QUESTION, CRITERIA_TITLES), 'fora_de_topico');
  });

  test('prompt injection: critérios avaliados pelo conteúdo legítimo, sem nota', async () => {
    const r = DEMO_STUDENT_RESPONSES.find((s) => detectCategory(s.original_response, QUESTION, CRITERIA_TITLES) === 'prompt_injection');
    assert.ok(r, 'o seed deve conter uma tentativa de prompt injection');
    const { parsed } = await generateMockFeedback({
      studentName: r.student_name,
      question: QUESTION,
      studentResponse: r.original_response,
      subject: 'Biologia',
      rubricCriteria: DEMO_RUBRIC_CRITERIA,
    });
    const atendidos = parsed.criterios_avaliacao.map((c) => c.atendido);
    assert.ok(atendidos.includes(true), 'algum critério coberto pelo conteúdo real deve ser atendido');
    assert.ok(atendidos.includes(false), 'nem todos os critérios podem ser marcados como atendidos');
    assert.doesNotMatch(parsed.feedback_completo, /\bnota\s*\d|\b10\b/i);
  });
});
