export type Category = "vocabulary" | "listening";
export type Status = "mastered" | "review" | "unseen";
export interface Word {
  id: string;
  word: string;
  senses: { pos: string; meaning: string }[];
  example: string;
  translation: string;
  page: number;
  unit: number;
}
export interface Listening {
  id: string;
  topic: string;
  prompt: string;
  promptZh: string;
  options: { label: string; text: string; translation: string }[];
  answer: string;
  explanation: string;
  keywords: string[];
}
export interface User {
  id: string;
  email: string;
}
export interface Progress {
  entry_id: string;
  category: Category;
  status: Status;
  attempts: number;
  correct: number;
  updated_at: string;
}
export interface StudyEvent {
  event_id: string;
  entry_id: string;
  kind: "card" | "quiz" | "listening";
  rating?: "mastered" | "review";
  answer?: string;
}
export interface EventResult {
  correct: boolean | null;
  record: Progress;
}
export const topics: Record<string, string> = {
  workplace: "職場會議",
  travel: "交通旅行",
  service: "顧客服務",
};
export const definition = (word: Word) =>
  word.senses.map((sense) => sense.meaning).join("；");
export function shuffle<T>(items: T[], random = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function choices(word: Word, entries: Word[]) {
  const seen = new Set([definition(word)]);
  const wrong = shuffle(entries)
    .filter((entry) => {
      const meaning = definition(entry);
      if (seen.has(meaning)) return false;
      seen.add(meaning);
      return true;
    })
    .slice(0, 3);
  return shuffle([word, ...wrong]);
}
export function stats(records: Progress[]) {
  const attempts = records.reduce((sum, row) => sum + row.attempts, 0);
  const correct = records.reduce((sum, row) => sum + row.correct, 0);
  return {
    mastered: records.filter((row) => row.status === "mastered").length,
    review: records.filter((row) => row.status === "review").length,
    attempts,
    accuracy: attempts ? Math.round((correct / attempts) * 100) : null,
  };
}
export function createUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
