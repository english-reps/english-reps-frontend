// A generation counter makes callbacks from canceled audio harmless after navigation.
export class SpeechPlayer {
  constructor({
    synthesis,
    Utterance,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
  } = {}) {
    this.synthesis = synthesis;
    this.Utterance = Utterance;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.generation = 0;
    this.utterance = null;
    this.timer = null;
  }

  get supported() {
    return (
      typeof this.synthesis?.speak === "function" &&
      typeof this.Utterance === "function"
    );
  }

  stop() {
    this.generation++;
    this.clearTimer(this.timer);
    this.timer = null;
    if (this.utterance) this.synthesis?.cancel();
    this.utterance = null;
  }

  play(
    text,
    {
      rate = 1,
      onState = () => {},
      onComplete = () => {},
      onError = () => {},
    } = {},
  ) {
    this.stop();
    if (!this.supported) {
      onError("unsupported");
      return;
    }
    const generation = this.generation;
    let settled = false;
    const fail = (error) => {
      if (generation !== this.generation || settled) return;
      settled = true;
      this.stop();
      onError(error);
    };
    try {
      const utterance = new this.Utterance(text);
      this.utterance = utterance;
      utterance.lang = "en-US";
      utterance.rate = Math.min(1.25, Math.max(0.65, Number(rate) || 1));
      const voices = this.synthesis.getVoices?.() || [];
      const english = voices.filter((voice) => /^en[-_]/i.test(voice.lang));
      const voice =
        english.find((item) => /^en[-_]US$/i.test(item.lang)) || english[0];
      if (voice) utterance.voice = voice;
      utterance.onstart = () => {
        if (generation !== this.generation || settled) return;
        this.clearTimer(this.timer);
        onState("playing");
        // Some engines fail to send an end/error event; allow a clean retry.
        this.timer = this.setTimer(() => fail("timeout"), 90000);
      };
      utterance.onend = () => {
        if (generation !== this.generation || settled) return;
        settled = true;
        this.clearTimer(this.timer);
        this.timer = null;
        this.utterance = null;
        onComplete();
      };
      utterance.onerror = (event) => fail(event.error || "speech-error");
      onState("starting");
      this.timer = this.setTimer(() => fail("not-started"), 12000);
      this.synthesis.speak(utterance);
    } catch {
      fail("speech-error");
    }
  }
}
