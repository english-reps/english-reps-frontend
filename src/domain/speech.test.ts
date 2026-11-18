import { expect, it, vi } from "vitest";
import { SpeechPlayer } from "./speech.js";
function engine() {
  const utterances: SpeechSynthesisUtterance[] = [];
  const synthesis = {
    speak: (value: SpeechSynthesisUtterance) => utterances.push(value),
    cancel: vi.fn(),
    getVoices: () => [],
  } as unknown as SpeechSynthesis;
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
