import { STORAGE_KEY, SESSION_SIZE, definition, shuffle, filterEntries, makeQuestion, loadProgress, recordResult, progressStats } from './lib.js';

const $ = selector => document.querySelector(selector);
const state = { entries: [], records: {}, view: 'practice', mode: 'cards', session: [], index: 0, revealed: false, answer: null, options: [], results: [], page: 1 };
const PAGE_SIZE = 30;
const node = (tag, className, text) => {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
};
const button = (text, className, action) => {
  const result = node('button', className, text);
  result.type = 'button';
  result.addEventListener('click', action);
  return result;
};

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, records: state.records }));
  } catch {
    $('#storage-notice').hidden = false;
  }
  renderStats();
}

function renderStats() {
  const stats = progressStats(state.records);
  const percent = Math.round(stats.mastered / state.entries.length * 100);
  $('#mastered-percent').replaceChildren(document.createTextNode(String(percent)), node('span', '', '%'));
  $('#progress-ring').style.setProperty('--progress', `${percent}%`);
  $('#mastered-caption').textContent = stats.mastered;
  $('#mastered-stat').textContent = stats.mastered;
  $('#review-stat').textContent = stats.review;
  $('#review-badge').textContent = stats.review;
  $('#accuracy-stat').textContent = stats.accuracy === null ? '—' : `${stats.accuracy}%`;
}

function beginSession(entries) {
  const pool = entries ?? filterEntries(state.entries, { unit: $('#practice-unit').value, reviewOnly: $('#review-only').checked, records: state.records });
  state.session = shuffle(pool).slice(0, SESSION_SIZE);
  state.index = 0;
  state.results = [];
  prepareWord();
}

function prepareWord() {
  state.revealed = false;
  state.answer = null;
  state.options = state.mode === 'quiz' && state.session[state.index] ? makeQuestion(state.session[state.index], state.entries) : [];
  renderExercise();
}

function speak(entry, control) {
  const utterance = new SpeechSynthesisUtterance(entry.word);
  utterance.lang = 'en-US';
  utterance.rate = 0.85;
  const voice = speechSynthesis.getVoices().find(item => item.lang.startsWith('en'));
  if (voice) utterance.voice = voice;
  utterance.onerror = event => {
    if (event.error !== 'interrupted' && event.error !== 'canceled') {
      control.textContent = '暫時無法發音';
      control.setAttribute('aria-label', '目前無法播放單字發音');
    }
  };
  speechSynthesis.cancel();
  speechSynthesis.speak(utterance);
}

function wordHeading(entry) {
  const heading = node('div', 'word-heading');
  heading.append(node('span', 'word-number', `WORD ${entry.id.slice(5)} · UNIT ${String(entry.unit).padStart(2, '0')}`));
  const audio = button('↗ 聽發音', 'audio-button', () => speak(entry, audio));
  audio.setAttribute('aria-label', `播放 ${entry.word} 的英文發音`);
  if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
    audio.disabled = true;
    audio.textContent = '此瀏覽器不支援發音';
  }
  heading.append(audio);
  return heading;
}

function explanation(entry) {
  const content = node('div', 'explanation');
  const senses = node('div', 'senses');
  for (const sense of entry.senses) {
    const line = node('p', 'sense');
    line.append(node('span', 'pos', sense.pos), document.createTextNode(sense.meaning));
    senses.append(line);
  }
  const example = node('div', 'example');
  const english = node('p', 'example-en', entry.example);
  english.lang = 'en';
  example.append(node('span', 'tiny-label', 'IN A SENTENCE'), english, node('p', 'example-zh', entry.translation));
  content.append(senses, example);
  return content;
}

function renderExercise() {
  const root = $('#exercise');
  root.replaceChildren();
  const total = state.session.length;
  $('#session-label').textContent = state.mode === 'cards' ? '單字卡練習' : '英翻中 · 選擇測驗';
  $('#session-count').textContent = total ? `${String(Math.min(state.index + 1, total)).padStart(2, '0')} / ${String(total).padStart(2, '0')}` : '00 / 00';
  $('#session-bar').style.width = total ? `${state.index / total * 100}%` : '0%';
  $('#session-progress').setAttribute('aria-valuemax', total || 10);
  $('#session-progress').setAttribute('aria-valuenow', state.index);

  if (!total) {
    const empty = node('div', 'empty-state');
    empty.append(node('span', 'empty-icon', '✧'), node('h2', '', '這個範圍還沒有不熟的字'), node('p', '', '先練習幾個單字，或換成全部單元試試。'), button('開始全部單字', 'button primary', () => {
      $('#practice-unit').value = 'all';
      $('#review-only').checked = false;
      beginSession();
    }));
    root.append(empty);
    return;
  }
  if (state.index >= total) {
    renderSummary(root);
    return;
  }

  const entry = state.session[state.index];
  root.append(wordHeading(entry));
  const center = node('div', `word-center ${state.mode === 'quiz' ? 'quiz-word' : ''}`);
  const word = node('h2', 'main-word', entry.word);
  word.lang = 'en';
  center.append(node('p', 'word-prompt', state.mode === 'cards' ? '看見這個字，你想到什麼？' : '選出這個單字的中文意思'), word);
  if (state.mode === 'cards') {
    center.append(node('span', 'word-pos', [...new Set(entry.senses.map(sense => sense.pos))].join(' / ')));
    const reveal = button(state.revealed ? '收起解釋 ↑' : '查看解釋 ↓', 'reveal-button', () => {
      state.revealed = !state.revealed;
      renderExercise();
      $('#card-reveal').focus({ preventScroll: true });
    });
    reveal.id = 'card-reveal';
    reveal.setAttribute('aria-expanded', String(state.revealed));
    reveal.setAttribute('aria-controls', 'card-explanation');
    center.append(reveal);
    root.append(center);
    const detail = explanation(entry);
    detail.id = 'card-explanation';
    detail.hidden = !state.revealed;
    root.append(detail);
    if (!state.revealed) root.append(node('p', 'card-hint', '先試著回想，再看看答案。'));
    const actions = node('div', 'card-actions');
    for (const [known, label, style] of [[false, '↻ 還不熟', 'secondary'], [true, '✓ 記住了', 'primary']]) {
      const action = button(label, `button ${style}`, () => finishCard(known));
      action.disabled = !state.revealed;
      actions.append(action);
    }
    root.append(actions);
  } else {
    root.append(center);
    renderQuiz(root, entry);
  }
}

function renderQuiz(root, entry) {
  const options = node('div', 'quiz-options');
  state.options.forEach((option, index) => {
    const choice = button('', 'quiz-option', () => {
      if (state.answer !== null) return;
      state.answer = option.id;
      const correct = option.id === entry.id;
      state.records = recordResult(state.records, entry.id, correct, true);
      state.results.push({ id: entry.id, correct });
      persist();
      renderExercise();
      $('#next-question').focus({ preventScroll: true });
    });
    choice.append(node('span', 'option-letter', String.fromCharCode(65 + index)), node('span', '', option.meaning));
    choice.setAttribute('aria-label', `${String.fromCharCode(65 + index)}. ${option.meaning}`);
    if (state.answer !== null) {
      choice.disabled = true;
      if (option.id === entry.id) choice.classList.add('correct');
      else if (option.id === state.answer) choice.classList.add('incorrect');
      if (option.id === entry.id || option.id === state.answer) choice.append(node('span', 'option-result', option.id === entry.id ? '✓' : '×'));
    }
    options.append(choice);
  });
  root.append(options);
  if (state.answer !== null) {
    const correct = state.answer === entry.id;
    const feedback = node('p', `quiz-feedback ${correct ? 'is-correct' : 'is-incorrect'}`, correct ? '✓ 答對了！又多記住一個單字。' : `再記一次：${entry.word} 是「${definition(entry)}」。`);
    feedback.setAttribute('role', 'status');
    root.append(feedback, explanation(entry));
    const next = button(state.index === state.session.length - 1 ? '查看練習結果 →' : '下一個單字 →', 'button primary next-button', () => {
      state.index++;
      prepareWord();
      focusExercise();
    });
    next.id = 'next-question';
    root.append(next);
  } else {
    root.append(node('p', 'card-hint quiz-hint', '不用怕答錯，不熟的字會留下來陪你再練。'));
  }
}

function focusExercise() {
  const heading = $('#exercise h2');
  if (heading) {
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }
}

function finishCard(known) {
  if (!state.revealed) return;
  const entry = state.session[state.index];
  state.records = recordResult(state.records, entry.id, known);
  state.results.push({ id: entry.id, correct: known });
  persist();
  state.index++;
  prepareWord();
  focusExercise();
}

function renderSummary(root) {
  const correct = state.results.filter(result => result.correct).length;
  const wrong = state.results.filter(result => !result.correct).map(result => result.id);
  const summary = node('div', 'session-summary');
  summary.append(node('span', 'summary-seal', '✓'), node('p', 'eyebrow', 'ONE SMALL STEP, WELL DONE.'), node('h2', '', '今天的這一組，完成了！'), node('p', 'summary-description', state.mode === 'quiz' ? `這次答對 ${correct} / ${state.session.length} 題。每一次練習，都讓單字更熟悉。` : `這次記住了 ${correct} 個單字，${wrong.length} 個留待複習。`));
  const actions = node('div', 'summary-actions');
  actions.append(button('再練 10 個單字 →', 'button primary', () => { beginSession(); focusExercise(); }));
  if (wrong.length) actions.append(button('複習這次不熟的字', 'button secondary', () => { beginSession(state.entries.filter(entry => wrong.includes(entry.id))); focusExercise(); }));
  summary.append(actions);
  root.append(summary);
}

function setView(view) {
  state.view = view;
  $('#practice-view').hidden = view !== 'practice';
  $('#library-view').hidden = view !== 'library';
  for (const name of ['practice', 'library']) {
    const control = $(`#nav-${name}`);
    control.classList.toggle('active', name === view);
    if (name === view) control.setAttribute('aria-current', 'page');
    else control.removeAttribute('aria-current');
  }
  $('#page-title').replaceChildren(document.createTextNode(view === 'practice' ? '把單字，練成直覺' : '你的英文，從這裡累積'), node('span', '', '。'));
  $('#page-description').textContent = view === 'practice' ? '不用一次記住全部。今天，就從 10 個單字開始。' : '1,000 個單字、中英例句。隨時查找，把不熟的字留下來。';
  if (view === 'library') renderLibrary();
}

function renderLibrary() {
  const filtered = filterEntries(state.entries, { query: $('#word-search').value, unit: $('#library-unit').value, pos: $('#pos-filter').value });
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  state.page = Math.min(state.page, pages);
  $('#result-count').textContent = `共 ${filtered.length.toLocaleString()} 個單字`;
  $('#page-count').textContent = `第 ${state.page} / ${pages} 頁`;
  $('#previous-page').disabled = state.page === 1;
  $('#next-page').disabled = state.page === pages;
  const list = $('#word-list');
  list.replaceChildren();
  if (!filtered.length) {
    const empty = node('div', 'empty-state');
    empty.append(node('h2', '', '找不到符合的單字'), node('p', '', '試試其他拼法、中文解釋，或放寬篩選範圍。'), button('清除篩選', 'button secondary', () => {
      $('#word-search').value = '';
      $('#library-unit').value = 'all';
      $('#pos-filter').value = 'all';
      state.page = 1;
      renderLibrary();
    }));
    list.append(empty);
    return;
  }
  for (const entry of filtered.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE)) {
    const detail = node('details', 'word-row');
    const summary = node('summary', 'word-row-summary');
    const word = node('strong', 'list-word', entry.word);
    word.lang = 'en';
    summary.append(node('span', 'list-number', entry.id.slice(5)), word, node('span', 'list-pos', [...new Set(entry.senses.map(sense => sense.pos))].join(' / ')), node('span', 'list-meaning', definition(entry)), node('span', 'expand-icon', '+'));
    detail.append(summary);
    const content = node('div', 'word-row-content');
    content.append(explanation(entry));
    const actions = node('div', 'word-row-actions');
    const source = node('span', 'word-source', `單元 ${String(entry.unit).padStart(2, '0')} · 原表第 ${entry.page} 頁`);
    const review = button('', 'button secondary small', () => {
      const isReview = state.records[entry.id]?.status === 'review';
      if (isReview) {
        const record = state.records[entry.id];
        state.records = { ...state.records, [entry.id]: { ...record, status: 'unseen' } };
      } else state.records = recordResult(state.records, entry.id, false);
      persist();
      updateReviewButton();
    });
    function updateReviewButton() {
      const isReview = state.records[entry.id]?.status === 'review';
      review.textContent = isReview ? '✓ 已加入待複習' : '+ 加入待複習';
      review.setAttribute('aria-pressed', String(isReview));
      review.setAttribute('aria-label', `${isReview ? '移除' : '加入'} ${entry.word} ${isReview ? '的待複習標記' : '至待複習'}`);
    }
    updateReviewButton();
    actions.append(source, review);
    content.append(actions);
    detail.append(content);
    list.append(detail);
  }
}

function setup() {
  for (const id of ['practice-unit', 'library-unit']) {
    const select = $(`#${id}`);
    select.append(new Option('全部單元 · 1,000 字', 'all'));
    for (let unit = 1; unit <= 20; unit++) select.append(new Option(`單元 ${String(unit).padStart(2, '0')} · ${(unit - 1) * 50 + 1}–${unit * 50}`, String(unit)));
  }
  const parts = [...new Set(state.entries.flatMap(entry => entry.senses.map(sense => sense.pos)))];
  const labels = { 'n.': '名詞', 'v.': '動詞', 'adj.': '形容詞', 'adv.': '副詞', 'prep.': '介系詞', 'conj.': '連接詞', 'pron.': '代名詞', 'phr.': '片語' };
  for (const part of parts) $('#pos-filter').append(new Option(`${part} ${labels[part] || ''}`, part));
  $('#nav-practice').addEventListener('click', () => setView('practice'));
  $('#nav-library').addEventListener('click', () => setView('library'));
  for (const mode of ['cards', 'quiz']) $(`#mode-${mode}`).addEventListener('click', () => {
    if (state.mode === mode) return;
    state.mode = mode;
    for (const name of ['cards', 'quiz']) {
      $(`#mode-${name}`).classList.toggle('selected', name === mode);
      $(`#mode-${name}`).setAttribute('aria-pressed', String(name === mode));
    }
    beginSession();
  });
  $('#shuffle-session').addEventListener('click', () => beginSession());
  $('#practice-unit').addEventListener('change', () => beginSession());
  $('#review-only').addEventListener('change', () => beginSession());
  for (const id of ['word-search', 'library-unit', 'pos-filter']) $(`#${id}`).addEventListener(id === 'word-search' ? 'input' : 'change', () => { state.page = 1; renderLibrary(); });
  for (const [id, change] of [['previous-page', -1], ['next-page', 1]]) $(`#${id}`).addEventListener('click', () => {
    state.page += change;
    renderLibrary();
    $('#library-view').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('#word-list summary')?.focus({ preventScroll: true });
  });
  renderStats();
  beginSession();
}

async function init() {
  try {
    const response = await fetch('/data/vocabulary.json');
    if (!response.ok) throw new Error(`Vocabulary request failed: ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.entries) || data.entries.length !== 1000) throw new Error('Incomplete vocabulary data');
    state.entries = data.entries;
    try {
      const storage = window.localStorage;
      state.records = loadProgress(storage, new Set(state.entries.map(entry => entry.id)));
      const probe = 'english-reps.storage-check';
      storage.setItem(probe, '1');
      storage.removeItem(probe);
    } catch {
      $('#storage-notice').hidden = false;
    }
    setup();
    $('#loading').hidden = true;
    $('#app').hidden = false;
  } catch (error) {
    console.error('Unable to initialize English Reps:', error);
    $('#loading').hidden = true;
    $('#error').hidden = false;
  }
}

$('#retry-load').addEventListener('click', () => window.location.reload());
init();
