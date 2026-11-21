export class SpeechPlayer {
  constructor(options?: {
    synthesis?: SpeechSynthesis;
    Utterance?: typeof SpeechSynthesisUtterance;
    setTimer?: (callback: () => void, delay?: number) => unknown;
    clearTimer?: (id: unknown) => void;
  });
  readonly supported: boolean;
  stop(): void;
  play(
    input: string | string[],
    options?: {
      rate?: number;
      accent?: string;
      pauseMs?: number;
      onState?: (state: string) => void;
      onStep?: (index: number, total: number) => void;
      onComplete?: () => void;
      onError?: (error: string) => void;
    },
  ): void;
}
