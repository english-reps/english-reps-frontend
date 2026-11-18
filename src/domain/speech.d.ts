export class SpeechPlayer {
  constructor(options?: {
    synthesis?: SpeechSynthesis;
    Utterance?: typeof SpeechSynthesisUtterance;
    setTimer?: typeof setTimeout;
    clearTimer?: typeof clearTimeout;
  });
  readonly supported: boolean;
  stop(): void;
  play(
    text: string,
    options?: {
      rate?: number;
      onState?: (state: string) => void;
      onComplete?: () => void;
      onError?: (error: string) => void;
    },
  ): void;
}
