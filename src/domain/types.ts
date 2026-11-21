export type Category = "vocabulary" | "listening" | "reading";
export type Status = "mastered" | "review" | "unseen";
export type ListeningPart = 1 | 2 | 3 | 4;
export type ReadingPart = 5 | 6 | 7;

export interface Word {
  id: string;
  word: string;
  senses: { pos: string; meaning: string }[];
  example: string;
  translation: string;
  page: number;
  unit: number;
}

export interface CatalogOption {
  label: string;
  text: string;
  translation: string;
}

export interface Listening {
  id: string;
  part?: ListeningPart;
  topic: string;
  difficulty?: string | null;
  groupId?: string | null;
  prompt: string;
  promptZh: string;
  audioText?: string | null;
  audioTranslation?: string | null;
  image?: string | null;
  imageAlt?: string | null;
  imageCredit?: string | null;
  imageSource?: string | null;
  options: CatalogOption[];
  answer: string;
  explanation: string;
  keywords: string[];
}

export interface Reading {
  id: string;
  part: ReadingPart;
  topic: string;
  difficulty?: string | null;
  groupId?: string | null;
  passage?: string | null;
  prompt: string;
  promptZh: string;
  options: CatalogOption[];
  answer: string;
  explanation: string;
  evidence?: string | null;
  evidenceLocation?: string | null;
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
  kind: "card" | "quiz" | "listening" | "reading";
  rating?: Status;
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

export const listeningPartMeta: Record<
  ListeningPart,
  {
    part: ListeningPart;
    badge: string;
    title: string;
    shortTitle: string;
    subtitle: string;
  }
> = {
  1: {
    part: 1,
    badge: "PART 1",
    title: "圖片描述",
    shortTitle: "Part 1 圖片描述",
    subtitle: "看職場與生活照片，聽 A–D 四句英文敘述選出最符合畫面者",
  },
  2: {
    part: 2,
    badge: "PART 2",
    title: "應答問題",
    shortTitle: "Part 2 應答問題",
    subtitle: "聽一句問句或陳述，從 A–C 三個回應中選出最合適的答案",
  },
  3: {
    part: 3,
    badge: "PART 3",
    title: "簡短對話",
    shortTitle: "Part 3 簡短對話",
    subtitle: "聽雙人職場對話，搭配畫面上的題幹與四個選項作答",
  },
  4: {
    part: 4,
    badge: "PART 4",
    title: "簡短獨白",
    shortTitle: "Part 4 簡短獨白",
    subtitle: "聽廣播、公告或語音留言，搭配畫面上的題幹與四個選項作答",
  },
};

export const readingPartMeta: Record<
  ReadingPart,
  {
    part: ReadingPart;
    badge: string;
    title: string;
    shortTitle: string;
    subtitle: string;
  }
> = {
  5: {
    part: 5,
    badge: "PART 5",
    title: "單句填空",
    shortTitle: "Part 5 單句填空",
    subtitle: "商務單句文法、詞性、時態、連接詞與職場字彙搭配",
  },
  6: {
    part: 6,
    badge: "PART 6",
    title: "短文填空",
    shortTitle: "Part 6 短文填空",
    subtitle: "電子郵件、備忘錄與公告克漏字及整句插入題",
  },
  7: {
    part: 7,
    badge: "PART 7",
    title: "閱讀理解",
    shortTitle: "Part 7 閱讀理解",
    subtitle: "單篇、雙篇與三篇商務文件閱讀、細節定位與跨篇推論",
  },
};

export function splitDialogueTurns(
  audioText: string,
): { speaker: string | null; text: string }[] {
  const raw = String(audioText || "").trim();
  if (!raw) return [];
  const matches = [
    ...raw.matchAll(
      /\b(W|M|Woman|Man|Speaker)\s*:\s*([\s\S]*?)(?=\s+\b(?:W|M|Woman|Man|Speaker)\s*:|$)/gi,
    ),
  ];
  if (!matches.length) {
    return [{ speaker: null, text: raw }];
  }
  return matches
    .map((match) => ({
      speaker: match[1].toUpperCase(),
      text: match[2].trim(),
    }))
    .filter((turn) => Boolean(turn.text));
}

export function buildListeningSpeechSegments(question: Listening): {
  segments: string[];
  labels: string[];
} {
  const part = question.part ?? 2;
  if (part === 1) {
    return {
      segments: question.options.map((row) => `${row.label}. ${row.text}`),
      labels: question.options.map((row) => `選項 ${row.label}`),
    };
  }
  if (part === 3 || part === 4) {
    const turns = splitDialogueTurns(question.audioText || "");
    const turnSegments = turns.map((turn) => turn.text);
    const turnLabels = turns.map((_, idx) =>
      part === 3
        ? `對話第 ${idx + 1} 句`
        : turns.length > 1
          ? `獨白第 ${idx + 1} 段`
          : "獨白內容",
    );
    return {
      segments: [...turnSegments, question.prompt],
      labels: [...turnLabels, "題目問題"],
    };
  }
  return {
    segments: [
      question.audioText || question.prompt,
      ...question.options.map((row) => `${row.label}. ${row.text}`),
    ],
    labels: ["題目", ...question.options.map((row) => `選項 ${row.label}`)],
  };
}

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

export function pickGroupedSession<
  T extends { id: string; groupId?: string | null },
>(items: T[], limit = 10, random = Math.random): T[] {
  if (!items.length) return [];
  const groups: T[][] = [];
  const byGroupId = new Map<string, T[]>();
  for (const item of items) {
    if (item.groupId) {
      let group = byGroupId.get(item.groupId);
      if (!group) {
        group = [];
        byGroupId.set(item.groupId, group);
        groups.push(group);
      }
      group.push(item);
    } else {
      groups.push([item]);
    }
  }
  const shuffledGroups = shuffle(groups, random);
  const selected: T[] = [];
  for (const group of shuffledGroups) {
    if (selected.length >= limit) break;
    selected.push(...group);
  }
  return selected.slice(0, limit);
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
