import { loadProgress, recordResult, progressStats } from './lib.js';
import listeningBank from './data/listening.js';
import { LISTENING_STORAGE_KEY, TOPICS, validateListeningBank, createListeningSession, listeningScript, gradeListeningAnswer, SpeechPlayer } from './listening-lib.js';

const element = (tag, className, text) => {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
};
const button = (label, className, action) => {
  const result = element('button', className, label);
  result.type = 'button';
  result.addEventListener('click', action);
  return result;
};

export class ListeningPractice {
  constructor(root, onStorageError) {
    this.root = root;
    this.onStorageError = onStorageError;
    this.entries = [];
    this.records = {};
    this.active = false;
    this.loading = false;
    this.ready = false;
    // Restricted WebViews may throw when the speech API is accessed.
    let synthesis, Utterance;
    try { synthesis = window.speechSynthesis; Utterance = window.SpeechSynthesisUtterance; }
    catch { /* The listening page still opens with unsupported-audio guidance. */ }
    this.player = new SpeechPlayer({ synthesis, Utterance });
    this.$('#listening-retry').addEventListener('click', () => this.load());
    this.$('#listening-new-session').addEventListener('click', () => this.begin());
    for (const id of ['listening-topic', 'listening-review']) this.$(`#${id}`).addEventListener('change', () => this.begin());
    this.$('#listening-rate').addEventListener('change', () => this.stop());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.leave(); });
    window.addEventListener('pagehide', () => this.leave());
  }

  $(selector) { return this.root.querySelector(selector); }

  async enter() {
    this.active = true;
    if (!this.ready) await this.load();
  }

  leave() { this.active = false; this.stop(); }

  stop() {
    this.player.stop();
    this.playing = false;
    if (this.$('#listening-play')) this.updatePlayback('stopped');
  }

  async load() {
    if (this.loading) return;
    this.loading = true;
    this.$('#listening-loading').hidden = false;
    this.$('#listening-error').hidden = true;
    try {
      this.entries = validateListeningBank(listeningBank);
      try { this.records = loadProgress(window.localStorage, new Set(this.entries.map(entry => entry.id)), LISTENING_STORAGE_KEY); }
      catch { this.onStorageError(); }
      this.ready = true;
      this.$('#listening-content').hidden = false;
      this.begin();
    } catch (error) {
      console.error('Unable to load listening practice:', error);
      this.$('#listening-error').hidden = false;
    } finally {
      this.loading = false;
      this.$('#listening-loading').hidden = true;
    }
  }

  begin(entries) {
    if (!this.ready) return;
    this.stop();
    this.session = entries ? [...entries].slice(0, 10) : createListeningSession(this.entries, this.records, {
      topic: this.$('#listening-topic').value,
      reviewOnly: this.$('#listening-review').checked,
    });
    this.index = 0;
    this.results = [];
    this.prepare();
    this.renderStats();
  }

  prepare() {
    this.stop();
    this.heard = false;
    this.answer = null;
    this.render();
  }

  renderStats() {
    const stats = progressStats(this.records);
    this.$('#listening-practiced').textContent = `${Object.keys(this.records).length} / ${this.entries.length}`;
    this.$('#listening-attempts').textContent = stats.answered;
    this.$('#listening-accuracy').textContent = stats.accuracy === null ? '—' : `${stats.accuracy}%`;
    this.$('#listening-review-count').textContent = stats.review;
  }

  render() {
    const total = this.session.length;
    const root = this.$('#listening-exercise');
    root.replaceChildren();
    this.$('#listening-count').textContent = total ? `${String(Math.min(this.index + 1, total)).padStart(2, '0')} / ${String(total).padStart(2, '0')}` : '00 / 00';
    this.$('#listening-progress').setAttribute('aria-valuemax', String(total || 10));
    this.$('#listening-progress').setAttribute('aria-valuenow', String(this.index));
    this.$('#listening-bar').style.width = total ? `${this.index / total * 100}%` : '0%';
    if (!total) {
      const empty = element('div', 'empty-state');
      empty.append(element('h2', '', '這個主題沒有待複習的題目'), element('p', '', '先做一組練習，答錯的題目會加入待複習。也可以換成全部主題。'), button('練習全部主題', 'button primary', () => {
        this.$('#listening-topic').value = 'all';
        this.$('#listening-review').checked = false;
        this.begin();
      }));
      root.append(empty);
      return;
    }
    if (this.index >= total) { this.renderSummary(root); return; }

    const question = this.session[this.index];
    const top = element('div', 'word-heading');
    top.append(element('span', 'word-number', `QUESTION ${question.id.slice(7)} · ${TOPICS[question.topic]}`), element('span', 'listening-type', '自編應答題'));
    const center = element('div', 'listening-center');
    const emblem = element('div', 'listening-emblem', '♫');
    emblem.setAttribute('aria-hidden', 'true');
    center.append(emblem, element('p', 'eyebrow', 'LISTEN FIRST. ANSWER NEXT.'), element('h2', '', '先聽，再選出最合適的回答'));
    const play = button('▶ 播放題目與 A／B／C', 'button primary listening-play', () => {
      if (this.playing) this.stop();
      else this.play(question);
    });
    play.id = 'listening-play';
    play.setAttribute('aria-label', '播放題目與三個回答');
    const status = element('p', 'listening-audio-status');
    status.id = 'listening-audio-status';
    status.setAttribute('role', 'status');
    center.append(play, status);
    root.append(top, center);

    const options = element('div', 'listening-choices');
    options.setAttribute('role', 'group');
    options.setAttribute('aria-label', '選擇最合適的回答');
    for (const option of question.options) {
      const choice = button('', 'quiz-option listening-choice', () => this.submit(option.label));
      choice.dataset.choice = option.label;
      choice.setAttribute('aria-label', `選擇回答 ${option.label}`);
      choice.append(element('span', 'option-letter', option.label), element('span', '', this.answer === null ? `回答 ${option.label}` : option.text));
      if (this.answer !== null && option.label === question.answer) {
        choice.classList.add('correct');
        choice.append(element('span', 'option-result', '✓ 正解'));
      } else if (this.answer === option.label) {
        choice.classList.add('incorrect');
        choice.append(element('span', 'option-result', '×'));
      }
      options.append(choice);
    }
    root.append(options);
    if (this.answer === null) root.append(element('p', 'card-hint listening-instruction', '先完整播放一次，再選 A、B 或 C。需要時可調慢速度、重播。'));
    else this.renderFeedback(root, question);
    this.updatePlayback();
  }

  updatePlayback(state, error) {
    const play = this.$('#listening-play');
    if (!play) return;
    const status = this.$('#listening-audio-status');
    if (!this.player.supported) {
      play.disabled = true;
      status.textContent = '此瀏覽器不支援英語語音播放。請使用支援語音的 Safari、Chrome 或 Edge。';
    } else if (error) {
      play.textContent = '↻ 重試播放';
      status.textContent = '語音播放未完成。請確認裝置音量與英語語音功能，再按一次重試。';
    } else if (this.playing) {
      play.textContent = '■ 停止播放';
      play.setAttribute('aria-label', '停止播放');
      status.textContent = state === 'starting' ? '正在準備英語語音…' : '播放中，請聽題目與 A、B、C 三個回答。';
    } else {
      play.textContent = this.heard || this.answer !== null ? '↻ 再聽一次' : '▶ 播放題目與 A／B／C';
      play.setAttribute('aria-label', '播放題目與三個回答');
      status.textContent = this.heard ? '已播放完成，請選出最合適的回答。' : state === 'stopped' ? '已停止。請完整播放一次後作答。' : '按下播放開始。本頁不會自動播放聲音。';
      if (this.answer !== null) status.textContent = '可搭配下方逐字稿，重聽題目與回答。';
    }
    for (const choice of this.root.querySelectorAll('[data-choice]')) choice.disabled = !this.heard || this.playing || this.answer !== null;
  }

  play(question) {
    this.playing = true;
    this.player.play(listeningScript(question), {
      rate: Number(this.$('#listening-rate').value),
      onState: state => this.updatePlayback(state),
      onComplete: () => {
        this.playing = false;
        this.heard = true;
        this.updatePlayback('complete');
      },
      onError: error => {
        this.playing = false;
        this.updatePlayback('error', error);
      },
    });
  }

  submit(label) {
    if (!this.heard || this.playing || this.answer !== null) return;
    const question = this.session[this.index];
    const correct = gradeListeningAnswer(question, label);
    this.stop();
    this.answer = label;
    this.records = recordResult(this.records, question.id, correct, true);
    this.results.push({ id: question.id, correct });
    try { window.localStorage.setItem(LISTENING_STORAGE_KEY, JSON.stringify({ version: 1, records: this.records })); }
    catch { this.onStorageError(); }
    this.renderStats();
    this.render();
    this.$('#listening-feedback').focus({ preventScroll: true });
  }

  renderFeedback(root, question) {
    const correct = this.answer === question.answer;
    const feedback = element('div', 'listening-feedback');
    feedback.id = 'listening-feedback';
    feedback.tabIndex = -1;
    feedback.append(element('p', `quiz-feedback ${correct ? 'is-correct' : 'is-incorrect'}`, correct ? `✓ 答對了！正確答案是 ${question.answer}。` : `再聽一次也沒關係。正確答案是 ${question.answer}，本題已加入待複習。`));
    const transcript = element('div', 'listening-transcript');
    transcript.append(element('h3', '', '逐字稿與中文'), element('p', 'transcript-prompt', question.prompt), element('p', 'example-zh', question.promptZh));
    for (const option of question.options) {
      const line = element('div', `transcript-response${option.label === question.answer ? ' is-answer' : ''}`);
      line.append(element('p', '', `${option.label}. ${option.text}`), element('p', 'example-zh', option.translation));
      transcript.append(line);
    }
    const explanation = element('div', 'listening-explanation');
    explanation.append(element('h3', '', '為什麼選這個？'), element('p', '', question.explanation));
    const keywords = element('div', 'listening-keywords');
    keywords.setAttribute('aria-label', '本題重點單字');
    for (const word of question.keywords) keywords.append(element('span', '', word));
    const next = button(this.index === this.session.length - 1 ? '查看練習結果 →' : '下一題 →', 'button primary next-button', () => {
      this.index++;
      this.prepare();
      this.focusHeading();
    });
    next.id = 'listening-next';
    feedback.append(transcript, explanation, keywords, next);
    root.append(feedback);
  }

  focusHeading() {
    const heading = this.$('#listening-exercise h2');
    if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
  }

  renderSummary(root) {
    const correct = this.results.filter(result => result.correct).length;
    const wrong = new Set(this.results.filter(result => !result.correct).map(result => result.id));
    const summary = element('div', 'session-summary');
    summary.append(element('span', 'summary-seal', '✓'), element('p', 'eyebrow', 'ONE MORE REP, ONE STEP FORWARD.'), element('h2', '', '這一組，聽完也練完了！'), element('p', 'summary-description', `本次答對 ${correct} / ${this.session.length} 題，正確率 ${Math.round(correct / this.session.length * 100)}%。`));
    const actions = element('div', 'summary-actions');
    actions.append(button('再練一組 →', 'button primary', () => { this.begin(); this.focusHeading(); }));
    if (wrong.size) actions.append(button(`重練這次的 ${wrong.size} 道錯題`, 'button secondary', () => {
      this.begin(this.entries.filter(entry => wrong.has(entry.id)));
      this.focusHeading();
    }));
    summary.append(actions);
    root.append(summary);
  }
}
