import { expect, it, vi } from "vitest";
import { SpeechPlayer } from "./speech.js";
function engine(voices: Partial<SpeechSynthesisVoice>[] = [], paused = false) {
  const utterances: SpeechSynthesisUtterance[] = [];
  const rawSynthesis = {
    paused,
    speak: (value: SpeechSynthesisUtterance) => utterances.push(value),
    cancel: vi.fn(),
    resume: vi.fn(() => {
      rawSynthesis.paused = false;
    }),
    getVoices: () => voices as SpeechSynthesisVoice[],
  };
  const synthesis = rawSynthesis as unknown as SpeechSynthesis;
  class Utterance {
    text: string;
    constructor(text: string) {
      this.text = text;
    }
  }
  const player = new SpeechPlayer({
    synthesis,
    Utterance: Utterance as unknown as typeof SpeechSynthesisUtterance,
  });
  return { player, utterances, synthesis };
}
it("cancel and replay ignore completion from an old utterance", () => {
  const { player, utterances } = engine();
  const complete = vi.fn();
  player.play("first", { onComplete: complete });
  player.stop();
  utterances[0].onend?.({} as SpeechSynthesisEvent);
  expect(complete).not.toHaveBeenCalled();
  player.play("second", { onComplete: complete });
  utterances[1].onend?.({} as SpeechSynthesisEvent);
  expect(complete).toHaveBeenCalledOnce();
});
it("start timeout reports failure and permits an explicit retry without false completion", () => {
  vi.useFakeTimers();
  const { player, synthesis } = engine(),
    failure = vi.fn(),
    complete = vi.fn();
  player.play("question", { onError: failure, onComplete: complete });
  vi.advanceTimersByTime(12000);
  expect(failure).toHaveBeenCalledWith("not-started");
  expect(complete).not.toHaveBeenCalled();
  expect(synthesis.cancel).toHaveBeenCalled();
  player.stop();
  vi.useRealTimers();
});
it("unsupported engines return actionable failure", () => {
  const error = vi.fn();
  const player = new SpeechPlayer();
  expect(player.supported).toBe(false);
  player.play("question", { onError: error });
  expect(error).toHaveBeenCalledWith("unsupported");
});
it("prefers local English voices over remote voices and resumes paused synthesis", () => {
  const remoteVoice = {
    name: "Google US English",
    lang: "en-US",
    localService: false,
  };
  const localVoice = {
    name: "Samantha",
    lang: "en-US",
    localService: true,
  };
  const { player, utterances, synthesis } = engine(
    [remoteVoice, localVoice],
    true,
  );
  player.play("When will the staff meeting begin?");
  expect(synthesis.resume).toHaveBeenCalledOnce();
  expect(utterances[0].voice).toBe(localVoice);
});
it("plays string segments sequentially, tracks steps, and cancels cleanly mid-pause", () => {
  vi.useFakeTimers();
  const { player, utterances } = engine(),
    steps: number[] = [],
    complete = vi.fn();
  player.play(["Prompt?", "A. Yes.", "B. No."], {
    pauseMs: 250,
    onStep: (index) => steps.push(index),
    onComplete: complete,
  });
  expect(utterances).toHaveLength(1);
  expect(utterances[0].text).toBe("Prompt?");
  utterances[0].onend?.({} as SpeechSynthesisEvent);
  expect(complete).not.toHaveBeenCalled();
  vi.advanceTimersByTime(250);
  expect(utterances).toHaveLength(2);
  expect(utterances[1].text).toBe("A. Yes.");
  utterances[1].onend?.({} as SpeechSynthesisEvent);
  player.stop();
  vi.advanceTimersByTime(250);
  expect(utterances).toHaveLength(2);
  expect(complete).not.toHaveBeenCalled();
  player.play(["Only one", "Two"], { pauseMs: 100, onComplete: complete });
  utterances[2].onend?.({} as SpeechSynthesisEvent);
  vi.advanceTimersByTime(100);
  utterances[3].onend?.({} as SpeechSynthesisEvent);
  expect(complete).toHaveBeenCalledOnce();
  expect(steps).toEqual([0, 1]);
  vi.useRealTimers();
});
it("does not invoke timer helpers with SpeechPlayer as receiver (prevents browser Illegal invocation)", () => {
  const utterances: SpeechSynthesisUtterance[] = [];
  class Utterance {
    text: string;
    constructor(text: string) {
      this.text = text;
    }
  }
  const synthesis = {
    speak: (value: SpeechSynthesisUtterance) => utterances.push(value),
    cancel: vi.fn(),
    getVoices: () => [],
  } as unknown as SpeechSynthesis;
  const player = new SpeechPlayer({
    synthesis,
    Utterance: Utterance as unknown as typeof SpeechSynthesisUtterance,
    setTimer: function strictSet(
      this: unknown,
      cb: () => void,
      ms?: number,
    ) {
      if (this && this !== globalThis) throw new TypeError("Illegal invocation");
      return setTimeout(cb, ms);
    },
    clearTimer: function strictClear(this: unknown, id: unknown) {
      if (this && this !== globalThis) throw new TypeError("Illegal invocation");
      clearTimeout(id as ReturnType<typeof setTimeout>);
    },
  });
  player.stop();
  player.play("Test");
  utterances[0].onstart?.({} as SpeechSynthesisEvent);
  utterances[0].onend?.({} as SpeechSynthesisEvent);
  player.stop();
});
it("selects matching TOEIC accent voice (US/UK/AU/CA) and falls back cleanly", () => {
  const usVoice = { name: "Samantha", lang: "en-US", localService: true };
  const ukVoice = { name: "Daniel", lang: "en-GB", localService: true };
  const auVoice = { name: "Karen", lang: "en-AU", localService: true };
  const { player, utterances } = engine([usVoice, ukVoice, auVoice]);
  player.play("Good morning.", { accent: "en-GB" });
  expect(utterances[0].lang).toBe("en-GB");
  expect(utterances[0].voice).toBe(ukVoice);
  player.play("Welcome aboard.", { accent: "en-CA" });
  expect(utterances[1].lang).toBe("en-CA");
  expect(utterances[1].voice).toBe(usVoice);
});
