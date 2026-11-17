import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Window } from 'happy-dom';
import { ListeningPractice } from '../public/listening.js';
import { LISTENING_STORAGE_KEY } from '../public/listening-lib.js';
import { STORAGE_KEY } from '../public/lib.js';

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const bank = JSON.parse(await readFile(new URL('../public/data/listening.json', import.meta.url), 'utf8'));
const vocabulary = JSON.parse(await readFile(new URL('../public/data/vocabulary.json', import.meta.url), 'utf8'));
const tick = () => new Promise(resolve => setImmediate(resolve));

function page(t, { supported = true, saved = {}, blockedStorage = false } = {}) {
  const window = new Window({ url: 'https://english-reps.test', settings: {
    disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true,
  } });
  window.document.write(html);
  const utterances = [];
  let cancellations = 0;
  if (supported) {
    window.speechSynthesis = { speak: utterance => utterances.push(utterance), cancel: () => cancellations++, getVoices: () => [{ lang: 'en-US' }] };
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  }
  for (const [key, value] of Object.entries(saved)) window.localStorage.setItem(key, value);
  if (blockedStorage) Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage blocked'); } });
  const globals = ['window', 'document', 'fetch', 'Option', 'localStorage'];
  const original = Object.fromEntries(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  // Happy DOM omits the browser's Option() convenience constructor.
  function Option(text, value) {
    const option = window.document.createElement('option');
    option.textContent = text;
    option.value = value;
    return option;
  }
  Object.assign(globalThis, { window, document: window.document, Option, fetch: async url => ({ ok: true, json: async () => structuredClone(url === '/data/vocabulary.json' ? vocabulary : bank) }) });
  if (!blockedStorage) globalThis.localStorage = window.localStorage;
  const root = window.document.querySelector('#listening-view');
  let storageWarnings = 0;
  let practice;
  t.after(async () => {
    practice?.leave();
    window.dispatchEvent(new window.Event('pagehide'));
    await window.happyDOM.abort();
    for (const key of globals) {
      if (original[key]) Object.defineProperty(globalThis, key, original[key]);
      else delete globalThis[key];
    }
  });
  return {
    window, root, utterances,
    get storageWarnings() { return storageWarnings; },
    get cancellations() { return cancellations; },
    async start() {
      practice = new ListeningPractice(root, () => storageWarnings++);
      await practice.enter();
      return practice;
    },
  };
}

test('UI hides transcripts and blocks answers until a complete listen; repeated clicks cannot double-score', async t => {
  const browser = page(t);
  const practice = await browser.start();
  const question = practice.session[0];
  assert.equal(browser.root.textContent.includes(question.prompt), false);
  assert.ok([...browser.root.querySelectorAll('[data-choice]')].every(control => control.disabled));
  browser.root.querySelector('#listening-play').click();
  assert.equal(browser.utterances.length, 1);
  assert.match(browser.utterances[0].text, /A\. /);
  browser.utterances[0].onstart();
  assert.equal(browser.root.querySelector('[data-choice]').disabled, true);
  browser.utterances[0].onend();
  const choice = browser.root.querySelector(`[data-choice="${question.answer}"]`);
  assert.equal(choice.disabled, false);
  choice.click();
  assert.ok(browser.root.textContent.includes(question.prompt));
  assert.ok(browser.root.querySelector('#listening-feedback'));
  browser.root.querySelector(`[data-choice="${question.answer}"]`).click();
  const records = JSON.parse(browser.window.localStorage.getItem(LISTENING_STORAGE_KEY)).records;
  assert.equal(records[question.id].attempts, 1);
  assert.equal(records[question.id].correct, 1);
});

test('changing speed and leaving the page cancel speech without unlocking choices', async t => {
  const browser = page(t);
  await browser.start();
  browser.root.querySelector('#listening-play').click();
  const old = browser.utterances[0];
  old.onstart();
  const rate = browser.root.querySelector('#listening-rate');
  rate.value = '0.8';
  rate.dispatchEvent(new browser.window.Event('change'));
  old.onend();
  assert.ok([...browser.root.querySelectorAll('[data-choice]')].every(control => control.disabled));
  browser.root.querySelector('#listening-play').click();
  assert.equal(browser.utterances[1].rate, 0.8);
  browser.window.dispatchEvent(new browser.window.Event('pagehide'));
  browser.utterances[1].onend();
  assert.ok([...browser.root.querySelectorAll('[data-choice]')].every(control => control.disabled));
  assert.equal(browser.cancellations, 2);
});

test('a full round shows the right score and can replay only this round’s missed question', async t => {
  const browser = page(t);
  const practice = await browser.start();
  const missed = practice.session[0].id;
  for (let index = 0; index < 10; index++) {
    const question = practice.session[index];
    browser.root.querySelector('#listening-play').click();
    browser.utterances.at(-1).onend();
    const answer = index === 0 ? question.options.find(option => option.label !== question.answer).label : question.answer;
    browser.root.querySelector(`[data-choice="${answer}"]`).click();
    browser.root.querySelector('#listening-next').click();
  }
  assert.match(browser.root.querySelector('.summary-description').textContent, /9 \/ 10.*90%/);
  const retry = [...browser.root.querySelectorAll('.summary-actions button')].find(control => control.textContent.includes('重練'));
  retry.click();
  assert.equal(practice.session.length, 1);
  assert.equal(practice.session[0].id, missed);
  assert.ok([...browser.root.querySelectorAll('[data-choice]')].every(control => control.disabled));
});

test('review filters have an actionable empty state and saved progress survives a fresh page', async t => {
  const saved = { version: 1, records: { 'listen-001': { status: 'review', attempts: 2, correct: 1 } } };
  const browser = page(t, { saved: { [LISTENING_STORAGE_KEY]: JSON.stringify(saved) } });
  const practice = await browser.start();
  assert.equal(browser.root.querySelector('#listening-attempts').textContent, '2');
  assert.equal(browser.root.querySelector('#listening-accuracy').textContent, '50%');
  const topic = browser.root.querySelector('#listening-topic');
  topic.value = 'travel';
  const review = browser.root.querySelector('#listening-review');
  review.checked = true;
  review.dispatchEvent(new browser.window.Event('change'));
  assert.match(browser.root.querySelector('#listening-exercise .empty-state').textContent, /沒有待複習/);
  browser.root.querySelector('#listening-exercise .empty-state button').click();
  assert.equal(practice.session.length, 10);
  assert.equal(review.checked, false);
  assert.equal(topic.value, 'all');
});

test('unsupported audio and failed speech do not enable scoring, while blocked storage still allows practice', async t => {
  const browser = page(t, { blockedStorage: true });
  await browser.start();
  browser.root.querySelector('#listening-play').click();
  browser.utterances[0].onerror({ error: 'voice-unavailable' });
  assert.match(browser.root.querySelector('#listening-audio-status').textContent, /未完成/);
  assert.ok([...browser.root.querySelectorAll('[data-choice]')].every(control => control.disabled));
  browser.root.querySelector('#listening-play').click();
  browser.utterances[1].onend();
  browser.root.querySelector('[data-choice="A"]').click();
  assert.ok(browser.root.querySelector('#listening-feedback'));
  assert.ok(browser.storageWarnings >= 1);
});

test('a browser without speech support displays guidance and disables play', async t => {
  const browser = page(t, { supported: false });
  await browser.start();
  assert.equal(browser.root.querySelector('#listening-play').disabled, true);
  assert.match(browser.root.querySelector('#listening-audio-status').textContent, /不支援/);
});

test('a failed listening download can be retried without losing the rest of the page', async t => {
  const browser = page(t);
  t.mock.method(console, 'error', () => {});
  globalThis.fetch = async () => ({ ok: false });
  await browser.start();
  assert.equal(browser.root.querySelector('#listening-error').hidden, false);
  assert.equal(browser.root.querySelector('#listening-content').hidden, true);
  globalThis.fetch = async () => ({ ok: true, json: async () => structuredClone(bank) });
  browser.root.querySelector('#listening-retry').click();
  await tick();
  assert.equal(browser.root.querySelector('#listening-error').hidden, true);
  assert.equal(browser.root.querySelector('#listening-content').hidden, false);
});

test('the actual app opens listening from navigation and preserves existing vocabulary progress', async t => {
  const vocabProgress = JSON.stringify({ version: 1, records: { 'word-0001': { status: 'mastered', attempts: 1, correct: 1 } } });
  const browser = page(t, { saved: { [STORAGE_KEY]: vocabProgress } });
  await import(`../public/app.js?integration=${Date.now()}`);
  await tick();
  const $ = selector => browser.window.document.querySelector(selector);
  assert.equal($('#app').hidden, false);
  assert.equal($('#mastered-stat').textContent, '1');
  $('#nav-listening').click();
  await tick();
  assert.equal($('#listening-view').hidden, false);
  assert.equal($('#practice-view').hidden, true);
  assert.equal($('#nav-listening').getAttribute('aria-current'), 'page');
  assert.match($('#page-title').textContent, /聽進日常/);
  $('#nav-library').click();
  assert.equal($('#library-view').hidden, false);
  assert.equal($('#listening-view').hidden, true);
  assert.match($('#result-count').textContent, /1,000/);
  assert.equal(browser.window.localStorage.getItem(STORAGE_KEY), vocabProgress);
});
