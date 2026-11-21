function pickEnglishVoice(voices = [], accent = "en-US") {
  const english = voices.filter((voice) =>
    /^en([-_]|$)/i.test(voice?.lang || ""),
  );
  const normalized = String(accent || "en-US").replace("_", "-").toLowerCase();
  const matchesAccent = (voice) =>
    String(voice?.lang || "")
      .replace("_", "-")
      .toLowerCase() === normalized;
  const local = english.filter((voice) => voice.localService);
  return (
    local.find(matchesAccent) ||
    english.find(matchesAccent) ||
    local.find((voice) => /^en[-_]US$/i.test(voice.lang)) ||
    local[0] ||
    english.find((voice) => /^en[-_]US$/i.test(voice.lang)) ||
    english[0]
  );
}

// A generation counter makes callbacks from canceled audio harmless after navigation.
export class SpeechPlayer {
  constructor({
    synthesis,
    Utterance,
    setTimer = (callback, delay) => setTimeout(callback, delay),
    clearTimer = (id) => clearTimeout(id),
  } = {}) {
    this.synthesis = synthesis;
    this.Utterance = Utterance;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.generation = 0;
    this.utterance = null;
    this.timer = null;
    try {
      this.synthesis?.getVoices?.();
    } catch {}
  }

  get supported() {
    return (
      typeof this.synthesis?.speak === "function" &&
      typeof this.Utterance === "function"
    );
  }

  stop() {
    this.generation++;
    const clear = this.clearTimer;
    clear(this.timer);
    this.timer = null;
    const active = Boolean(
      this.utterance ||
        this.synthesis?.speaking ||
        this.synthesis?.pending ||
        this.synthesis?.paused,
    );
    this.utterance = null;
    if (active) {
      try {
        this.synthesis?.cancel?.();
      } catch {}
    }
  }

  play(
    input,
    {
      rate = 1,
      accent = "en-US",
      pauseMs = 250,
      onState = () => {},
      onStep = () => {},
      onComplete = () => {},
      onError = () => {},
    } = {},
  ) {
    this.stop();
    if (!this.supported) {
      onError("unsupported");
      return;
    }
    const segments = (Array.isArray(input) ? input : [input])
      .map((part) => String(part ?? "").trim())
      .filter(Boolean);
    if (!segments.length) {
      onComplete();
      return;
    }
    const generation = this.generation;
    const schedule = this.setTimer;
    const clear = this.clearTimer;
    let settled = false;
    const fail = (error) => {
      if (generation !== this.generation || settled) return;
      settled = true;
      this.stop();
      onError(error);
    };
    const speakAt = (index) => {
      if (generation !== this.generation || settled) return;
      try {
        if (this.synthesis.paused) this.synthesis.resume?.();
        const utterance = new this.Utterance(segments[index]);
        this.utterance = utterance;
        utterance.lang = accent || "en-US";
        utterance.rate = Math.min(1.25, Math.max(0.65, Number(rate) || 1));
        const voices = this.synthesis.getVoices?.() || [];
        const voice = pickEnglishVoice(voices, accent);
        if (voice) utterance.voice = voice;
        utterance.onstart = () => {
          if (generation !== this.generation || settled) return;
          clear(this.timer);
          onState("playing");
          onStep(index, segments.length);
          // Some engines fail to send an end/error event; allow a clean retry.
          this.timer = schedule(() => fail("timeout"), 45000);
        };
        utterance.onend = () => {
          if (generation !== this.generation || settled) return;
          clear(this.timer);
          this.timer = null;
          this.utterance = null;
          if (index + 1 < segments.length) {
            if (pauseMs > 0) {
              this.timer = schedule(() => speakAt(index + 1), pauseMs);
            } else {
              speakAt(index + 1);
            }
          } else {
            settled = true;
            onComplete();
          }
        };
        utterance.onerror = (event) => fail(event?.error || "speech-error");
        onState("starting");
        onStep(index, segments.length);
        this.timer = schedule(() => fail("not-started"), 12000);
        this.synthesis.speak(utterance);
      } catch {
        fail("speech-error");
      }
    };
    speakAt(0);
  }
}
