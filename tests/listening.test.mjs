import test from 'node:test';
import assert from 'node:assert/strict';
import data from '../public/data/listening.js';
import { STORAGE_KEY, loadProgress, recordResult, progressStats } from '../public/lib.js';
import { LISTENING_STORAGE_KEY, TOPICS, validateListeningBank, createListeningSession, listeningScript, gradeListeningAnswer, SpeechPlayer } from '../public/listening-lib.js';

const entries = validateListeningBank(data);

test('30 original bilingual questions cover three topics and balanced answer labels', () => {
  assert.equal(entries.length, 30);
  assert.equal(data.source.count, 30);
  assert.equal(new Set(entries.map(entry => entry.prompt)).size, 30);
  for (const topic of Object.keys(TOPICS)) assert.equal(entries.filter(entry => entry.topic === topic).length, 10);
  for (const answer of 'ABC') assert.equal(entries.filter(entry => entry.answer === answer).length, 10);
  for (const entry of entries) {
    assert.match(entry.prompt, /[a-z]/i);
    assert.match(entry.promptZh, /[\u3400-\u9fff]/);
    assert.match(entry.explanation, /[\u3400-\u9fff]/);
    for (const option of entry.options) assert.match(option.translation, /[\u3400-\u9fff]/);
  }
});

test('incomplete, duplicated, or invalid questions are rejected before practice', () => {
  for (const mutate of [
    bank => { bank.entries[0].answer = 'D'; },
    bank => { bank.entries[1].id = bank.entries[0].id; },
    bank => { bank.entries[0].options[1].text = bank.entries[0].options[0].text; },
    bank => { bank.entries[0].promptZh = ''; },
    bank => { bank.entries[0].topic = 'unknown'; },
    bank => { bank.entries[0].options[0].label = 'B'; },
    bank => { bank.entries[0].keywords = []; },
  ]) {
    const bank = structuredClone(data);
    mutate(bank);
    assert.throws(() => validateListeningBank(bank));
  }
});

test('sessions use at most ten distinct questions and honor topic and review filters', () => {
  const original = [...entries];
  const session = createListeningSession(entries, {}, { random: () => 0.3 });
  assert.equal(session.length, 10);
  assert.equal(new Set(session.map(entry => entry.id)).size, 10);
  assert.deepEqual(entries, original);
  assert.ok(createListeningSession(entries, {}, { topic: 'travel' }).every(entry => entry.topic === 'travel'));
  const records = { [entries[0].id]: { status: 'review' }, [entries[10].id]: { status: 'review' }, [entries[1].id]: { status: 'mastered' } };
  assert.deepEqual(createListeningSession(entries, records, { topic: 'workplace', reviewOnly: true }).map(entry => entry.id), [entries[0].id]);
  assert.deepEqual(createListeningSession(entries, {}, { reviewOnly: true }), []);
});

test('spoken scripts include the prompt and all responses in A/B/C order without revealing the answer', () => {
  for (const entry of entries) {
    const script = listeningScript(entry);
    assert.ok(script.startsWith(entry.prompt));
    let previous = entry.prompt.length - 1;
    for (const option of entry.options) {
      const position = script.indexOf(`${option.label}. ${option.text}`);
      assert.ok(position > previous);
      previous = position;
    }
    assert.ok(!script.includes(entry.explanation));
    assert.ok(!script.includes(entry.promptZh));
  }
});

test('every question grades exactly one response as correct and rejects unknown choices', () => {
  for (const entry of entries) {
    assert.equal(entry.options.filter(option => gradeListeningAnswer(entry, option.label)).length, 1);
    assert.throws(() => gradeListeningAnswer(entry, 'D'));
  }
});

test('listening results survive reload and remain independent of vocabulary progress', () => {
  const saved = new Map([[STORAGE_KEY, JSON.stringify({ version: 1, records: { 'word-0001': { status: 'mastered', attempts: 4, correct: 3 } } })]]);
  let records = recordResult({}, entries[0].id, false, true);
  records = recordResult(records, entries[1].id, true, true);
  saved.set(LISTENING_STORAGE_KEY, JSON.stringify({ version: 1, records }));
  const storage = { getItem: key => saved.get(key) };
  const reloaded = loadProgress(storage, new Set(entries.map(entry => entry.id)), LISTENING_STORAGE_KEY);
  assert.deepEqual(reloaded, records);
  assert.deepEqual(progressStats(reloaded), { mastered: 1, review: 1, answered: 2, accuracy: 50 });
  assert.equal(loadProgress(storage, new Set(['word-0001']))['word-0001'].correct, 3);
  assert.deepEqual(createListeningSession(entries, reloaded, { reviewOnly: true }).map(entry => entry.id), [entries[0].id]);
  records = recordResult(reloaded, entries[0].id, true, true);
  assert.equal(progressStats(records).review, 0);
  assert.equal(records[entries[0].id].attempts, 2);
});

function audioHarness(voices = [{ lang: 'en-US', name: 'English' }]) {
  const utterances = [];
  const timers = new Map();
  let canceled = 0;
  let sequence = 0;
  const synthesis = { speak: utterance => utterances.push(utterance), cancel: () => canceled++, getVoices: () => voices };
  class Utterance { constructor(text) { this.text = text; } }
  const player = new SpeechPlayer({ synthesis, Utterance, setTimer: (callback, delay) => {
    const id = ++sequence;
    timers.set(id, { callback, delay });
    return id;
  }, clearTimer: id => timers.delete(id) });
  return { player, utterances, timers, synthesis, get canceled() { return canceled; } };
}

test('audio uses an English voice and reports completion only after the end event', () => {
  const audio = audioHarness([{ lang: 'zh-TW' }, { lang: 'en-GB' }, { lang: 'en-US' }]);
  const states = [];
  let complete = 0;
  audio.player.play('Listen carefully.', { rate: 0.8, onState: state => states.push(state), onComplete: () => complete++ });
  const utterance = audio.utterances[0];
  assert.equal(utterance.text, 'Listen carefully.');
  assert.equal(utterance.voice.lang, 'en-US');
  assert.equal(utterance.rate, 0.8);
  assert.equal(complete, 0);
  utterance.onstart();
  assert.deepEqual(states, ['starting', 'playing']);
  utterance.onend();
  utterance.onend();
  assert.equal(complete, 1);
  assert.equal(audio.timers.size, 0);
});

test('stop and replay ignore all stale completion and error callbacks', () => {
  const audio = audioHarness();
  let complete = 0;
  let errors = 0;
  const callbacks = { onComplete: () => complete++, onError: () => errors++ };
  audio.player.play('First question.', callbacks);
  const first = audio.utterances[0];
  audio.player.stop();
  first.onend();
  first.onerror({ error: 'canceled' });
  assert.equal(complete, 0);
  assert.equal(errors, 0);
  audio.player.play('Second question.', callbacks);
  first.onend();
  assert.equal(complete, 0);
  audio.utterances[1].onend();
  assert.equal(complete, 1);
  assert.equal(audio.canceled, 1);
});

test('unsupported speech and engine errors do not report a successful listen', () => {
  let error;
  let complete = 0;
  new SpeechPlayer().play('Test.', { onError: value => { error = value; }, onComplete: () => complete++ });
  assert.equal(error, 'unsupported');
  const audio = audioHarness();
  audio.player.play('Test.', { onError: value => { error = value; }, onComplete: () => complete++ });
  audio.utterances[0].onerror({ error: 'voice-unavailable' });
  audio.utterances[0].onend();
  assert.equal(error, 'voice-unavailable');
  assert.equal(complete, 0);
  assert.equal(audio.timers.size, 0);
});

test('audio start and playback timeouts stop the engine and permit retry', () => {
  const audio = audioHarness();
  const errors = [];
  audio.player.play('Test.', { onError: error => errors.push(error) });
  const startup = [...audio.timers.values()][0];
  assert.equal(startup.delay, 12000);
  startup.callback();
  assert.deepEqual(errors, ['not-started']);
  audio.player.play('Try again.', { onError: error => errors.push(error) });
  audio.utterances[1].onstart();
  const playback = [...audio.timers.values()][0];
  assert.equal(playback.delay, 90000);
  playback.callback();
  assert.deepEqual(errors, ['not-started', 'timeout']);
  assert.equal(audio.timers.size, 0);
});

test('an initially empty voice list keeps the English language hint, and synchronous errors are handled', () => {
  const audio = audioHarness([]);
  audio.player.play('Test.');
  assert.equal(audio.utterances[0].lang, 'en-US');
  assert.equal(audio.utterances[0].voice, undefined);
  let error;
  audio.synthesis.speak = () => { throw new Error('Blocked'); };
  audio.player.play('Test.', { onError: value => { error = value; } });
  assert.equal(error, 'speech-error');
  assert.equal(audio.timers.size, 0);
});
