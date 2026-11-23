import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import test from 'node:test';

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const data = JSON.parse(read('banks/2026.json'));
const original = JSON.parse(read('banks/audit/2026-original.json'));
const {Bank, App} = runInNewContext([
  'upstream/src/js/00-core.js', 'upstream/src/js/20-types.js', 'upstream/src/js/35-scoring.js', 'bank.js'
].map(read).join('\n') + '\nApp.loc = value => value; ({Bank, App})');
const {questions} = data;

test('400 stable IDs, three question types, valid and unique answers', () => {
  assert.equal(questions.length, 400);
  assert.deepEqual(questions.map(q => q.id), original.questions.map(q => q.id));
  const result = Bank.merge([], questions, true, {restore: true});
  assert.deepEqual(Array.from(result.errors), []);
  assert.equal(result.duplicates, 0);
  assert.equal(result.added, 400);
  for (const question of result.bank) {
    assert.ok(Bank.active(question) && question.explanation && question.source, question.id);
    if (question.type !== 'truefalse') assert.equal(question.options.length, 4, question.id);
    const item = App.prepareQuestion(question, {shuffleOptions: false});
    const answer = item.kind === 'multiple' ? item.answer : item.answer[0];
    assert.equal(App.fractionOf(item, answer, App.scoring.DEFAULTS), 1, question.id);
  }
});

test('all syllabus points are represented and full papers meet both sets of quotas', () => {
  const coverage = (label, max) => {
    const points = new Set(questions.flatMap(q => Array.from(q.source.matchAll(label), m => Number(m[1]))));
    for (let point = 1; point <= max; point++) assert.ok(points.has(point), 'Missing point ' + point);
  };
  coverage(/理论知识点 (\d+)(?![\d–])/gu, 30);
  coverage(/中级鉴定点 (\d+)(?![\d–])/gu, 63);
  const chapters = Array.from(Bank.chapters);
  for (let round = 0; round < 20; round++) {
    const mock = Bank.mock(questions);
    assert.equal(mock.length, 200);
    assert.equal(new Set(mock.map(q => q.id)).size, 200);
    for (const [name, , weight] of chapters) {
      assert.equal(mock.filter(q => q.chapter === name).length, 200 * weight / 100, name);
    }
    assert.ok(mock.slice(0, 100).every(q => q.type === 'single'));
    assert.ok(mock.slice(100, 140).every(q => q.type === 'multiple'));
    assert.ok(mock.slice(140).every(q => q.type === 'truefalse'));
  }
  assert.equal(Bank.mock(questions.filter(q => q.type !== 'truefalse')).length, 0);
  assert.equal(Bank.mock(questions.filter(q => q.chapter !== '职业道德')).length, 0);
});
