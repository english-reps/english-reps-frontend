import { shuffle, SESSION_SIZE } from './lib.js';

export const LISTENING_STORAGE_KEY = 'english-reps.listening.v1';
export const TOPICS = { workplace: '職場會議', travel: '交通旅行', service: '顧客服務' };

export function validateListeningBank(data) {
  if (data?.version !== 1 || !Array.isArray(data.entries) || !data.entries.length) throw new Error('Invalid listening question bank');
  const ids = new Set();
  const text = value => typeof value === 'string' && value.trim().length > 0;
  for (const entry of data.entries) {
    if (!/^listen-\d{3,}$/.test(entry.id) || ids.has(entry.id) || !Object.hasOwn(TOPICS, entry.topic)) throw new Error('Invalid question identity or topic');
    ids.add(entry.id);
    if (![entry.prompt, entry.promptZh, entry.explanation].every(text)) throw new Error('Incomplete listening explanation');
    if (!Array.isArray(entry.options) || entry.options.length !== 3) throw new Error('Listening questions need three options');
    if (entry.options.some((option, index) => option.label !== 'ABC'[index] || !text(option.text) || !text(option.translation))) throw new Error('Invalid listening options');
    if (new Set(entry.options.map(option => option.text.trim().toLowerCase())).size !== 3 || !entry.options.some(option => option.label === entry.answer)) throw new Error('Invalid listening answer');
    if (!Array.isArray(entry.keywords) || !entry.keywords.length || !entry.keywords.every(text)) throw new Error('Missing listening keywords');
  }
  return data.entries;
}

export function createListeningSession(entries, records, { topic = 'all', reviewOnly = false, random = Math.random } = {}) {
  return shuffle(entries.filter(entry =>
    (topic === 'all' || entry.topic === topic) && (!reviewOnly || records[entry.id]?.status === 'review'),
  ), random).slice(0, SESSION_SIZE);
}

export function listeningScript(question) {
  return [`${question.prompt}`, ...question.options.map(option => `${option.label}. ${option.text}`)].join(' ... ');
}

export function gradeListeningAnswer(question, label) {
  if (!question.options.some(option => option.label === label)) throw new Error('Invalid answer choice');
  return label === question.answer;
}

// A generation counter makes callbacks from canceled audio harmless after navigation.
export class SpeechPlayer {
  constructor({ synthesis, Utterance, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
    this.synthesis = synthesis;
    this.Utterance = Utterance;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.generation = 0;
    this.utterance = null;
    this.timer = null;
  }

  get supported() { return typeof this.synthesis?.speak === 'function' && typeof this.Utterance === 'function'; }

  stop() {
    this.generation++;
    this.clearTimer(this.timer);
    this.timer = null;
    if (this.utterance) this.synthesis?.cancel();
    this.utterance = null;
  }

  play(text, { rate = 1, onState = () => {}, onComplete = () => {}, onError = () => {} } = {}) {
    this.stop();
    if (!this.supported) { onError('unsupported'); return; }
    const generation = this.generation;
    let settled = false;
    const fail = error => {
      if (generation !== this.generation || settled) return;
      settled = true;
      this.stop();
      onError(error);
    };
    try {
      const utterance = new this.Utterance(text);
      this.utterance = utterance;
      utterance.lang = 'en-US';
      utterance.rate = Math.min(1.25, Math.max(0.65, Number(rate) || 1));
      const voices = this.synthesis.getVoices?.() || [];
      const english = voices.filter(voice => /^en[-_]/i.test(voice.lang));
      const voice = english.find(item => /^en[-_]US$/i.test(item.lang)) || english[0];
      if (voice) utterance.voice = voice;
      utterance.onstart = () => {
        if (generation !== this.generation || settled) return;
        this.clearTimer(this.timer);
        onState('playing');
        // Some engines fail to send an end/error event; allow a clean retry.
        this.timer = this.setTimer(() => fail('timeout'), 90000);
      };
      utterance.onend = () => {
        if (generation !== this.generation || settled) return;
        settled = true;
        this.clearTimer(this.timer);
        this.timer = null;
        this.utterance = null;
        onComplete();
      };
      utterance.onerror = event => fail(event.error || 'speech-error');
      onState('starting');
      this.timer = this.setTimer(() => fail('not-started'), 12000);
      this.synthesis.speak(utterance);
    } catch {
      fail('speech-error');
    }
  }
}
