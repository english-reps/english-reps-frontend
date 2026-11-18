import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { STORAGE_KEY, filterEntries, definition, makeQuestion, shuffle, loadProgress, recordResult, progressStats } from '../public/lib.js';

const data = JSON.parse(await readFile(new URL('../public/data/vocabulary.json', import.meta.url), 'utf8'));
const entries = data.entries;
const validIds = new Set(entries.map(entry => entry.id));

test('all 1,000 source entries retain complete definitions, examples, and page references', () => {
  assert.equal(entries.length, 1000);
  assert.equal(validIds.size, 1000);
  assert.equal(data.source.pages, 100);
  assert.equal(entries[0].word, 'company');
  assert.equal(entries.at(-1).word, 'debrief');
  for (const entry of entries) {
    assert.match(entry.word, /^\p{L}[\p{L} '\-]*$/u);
    assert.ok(entry.senses.length);
    for (const sense of entry.senses) {
      assert.match(sense.pos, /^[a-z]+\.$/);
      assert.match(sense.meaning, /[\u3400-\u9fff]/);
    }
    assert.match(entry.example, /[a-z]/i);
    assert.match(entry.translation, /[\u3400-\u9fff]/);
    assert.ok(entry.page >= 1 && entry.page <= 100);
  }
  for (let page = 1; page <= 100; page++) assert.equal(entries.filter(entry => entry.page === page).length, 10);
  for (let unit = 1; unit <= 20; unit++) assert.equal(filterEntries(entries, { unit }).length, 50);
});

test('PDF line wrapping retains parenthetical meanings and joins hyphenated English words', () => {
  const volume = entries.find(entry => entry.word === 'Volume');
  assert.equal(definition(volume), '音量；量；（書）冊');
  assert.match(entries.find(entry => entry.word === 'interface').example, /operations\./);
  assert.match(entries.find(entry => entry.word === 'retention').example, /benefits packages\./);
  assert.match(definition(entries.find(entry => entry.word === 'franchise')), /系列作品/);
  assert.equal(entries.find(entry => entry.word === 'standard').senses.length, 2);
});

test('each vocabulary entry produces four distinct answers with exactly one correct choice', () => {
  for (const entry of entries) {
    const options = makeQuestion(entry, entries);
    assert.equal(options.length, 4);
    assert.equal(new Set(options.map(option => option.meaning)).size, 4);
    assert.equal(options.filter(option => option.id === entry.id).length, 1);
    assert.equal(options.find(option => option.id === entry.id).meaning, definition(entry));
  }
});

test('quiz distractors skip other entries with the same Chinese definition', () => {
  const sample = ['一', '一', '二', '二', '三', '四'].map((meaning, index) => ({ id: String(index), senses: [{ pos: 'n.', meaning }] }));
  const result = makeQuestion(sample[0], sample, () => 0.4);
  assert.equal(result.length, 4);
  assert.equal(result.filter(option => option.meaning === '一').length, 1);
});

test('search supports case-insensitive English, Chinese, units, and secondary parts of speech', () => {
  assert.ok(filterEntries(entries, { query: '  COMPANY  ' }).some(entry => entry.word === 'company'));
  assert.ok(filterEntries(entries, { query: '公司' }).some(entry => entry.word === 'company'));
  assert.ok(filterEntries(entries, { pos: 'adj.' }).some(entry => entry.word === 'standard'));
  assert.equal(filterEntries(entries, { query: 'does-not-exist-123' }).length, 0);
  assert.equal(filterEntries(entries, { unit: 21 }).length, 0);
  assert.ok(filterEntries(entries, { unit: '2', pos: 'n.' }).every(entry => entry.unit === 2 && entry.senses.some(sense => sense.pos === 'n.')));
});

test('review-only sessions include only marked entries within the selected unit', () => {
  const records = { [entries[0].id]: { status: 'review' }, [entries[50].id]: { status: 'review' }, [entries[1].id]: { status: 'mastered' } };
  assert.deepEqual(filterEntries(entries, { unit: '1', reviewOnly: true, records }).map(entry => entry.id), [entries[0].id]);
  assert.equal(filterEntries(entries, { reviewOnly: true }).length, 0);
});

test('shuffling preserves all entries without mutating the original list', () => {
  const original = [...entries];
  const result = shuffle(entries, () => 0);
  assert.deepEqual(entries, original);
  assert.notDeepEqual(result, original);
  assert.deepEqual(new Set(result), new Set(original));
});

test('flashcard ratings update mastery without affecting quiz accuracy', () => {
  const records = recordResult({}, entries[0].id, true);
  assert.deepEqual(progressStats(records), { mastered: 1, review: 0, answered: 0, accuracy: null });
  const review = recordResult(records, entries[0].id, false);
  assert.deepEqual(progressStats(review), { mastered: 0, review: 1, answered: 0, accuracy: null });
  assert.equal(records[entries[0].id].status, 'mastered');
});

test('quiz results accumulate accuracy and preserve history when mastering a previously missed word', () => {
  let records = recordResult({}, entries[0].id, false, true);
  records = recordResult(records, entries[0].id, true, true);
  records = recordResult(records, entries[1].id, true, true);
  assert.deepEqual(progressStats(records), { mastered: 2, review: 0, answered: 3, accuracy: 67 });
  assert.equal(records[entries[0].id].attempts, 2);
});

test('valid progress survives serialization and ignores invalid records', () => {
  const original = recordResult({}, entries[0].id, false, true);
  const storage = { getItem: key => {
    assert.equal(key, STORAGE_KEY);
    return JSON.stringify({ version: 1, records: { ...original, missing: { status: 'mastered' }, [entries[1].id]: null, [entries[2].id]: { status: 'other' } } });
  } };
  assert.deepEqual(loadProgress(storage, validIds), original);
});

test('broken, blocked, or incompatible browser storage starts with empty progress', () => {
  for (const value of ['{broken', 'null', '[]', '{"version":2,"records":{}}']) assert.deepEqual(loadProgress({ getItem: () => value }, validIds), {});
  assert.deepEqual(loadProgress({ getItem: () => { throw new Error('SecurityError'); } }, validIds), {});
});

test('malformed saved counters cannot create invalid percentages or lose review status', () => {
  const records = loadProgress({ getItem: () => JSON.stringify({ version: 1, records: {
    [entries[0].id]: { status: 'review', attempts: -1, correct: 50 },
    [entries[1].id]: { status: 'mastered', attempts: 2, correct: 12 },
    [entries[2].id]: { status: 'unseen', attempts: 1, correct: 0 },
  } }) }, validIds);
  assert.deepEqual(progressStats(records), { mastered: 1, review: 1, answered: 3, accuracy: 67 });
});
