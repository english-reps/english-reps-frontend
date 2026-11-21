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

export type MockSection = "listening" | "reading";
export type MockExamStatus = "in_progress" | "completed";
export type ToeicAccent = "en-US" | "en-GB" | "en-AU" | "en-CA";

export interface MockExamPartStat {
  part: number;
  total: number;
  correct: number;
}

export interface MockExam {
  id: string;
  section: MockSection;
  status: MockExamStatus;
  question_ids: string[];
  answers: Record<string, string>;
  flagged_ids: string[];
  played_keys: string[];
  current_index: number;
  duration_seconds: number;
  remaining_seconds: number;
  total_questions: number;
  correct_count: number | null;
  scaled_score: number | null;
  wrong_ids: string[] | null;
  part_stats: MockExamPartStat[] | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export const TOEIC_ACCENTS: { code: ToeicAccent; label: string }[] = [
  { code: "en-US", label: "美式 (US)" },
  { code: "en-GB", label: "英式 (UK)" },
  { code: "en-AU", label: "澳式 (AU)" },
  { code: "en-CA", label: "加式 (CA)" },
];

export function accentForMockKey(key: string): {
  code: ToeicAccent;
  label: string;
} {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return TOEIC_ACCENTS[hash % TOEIC_ACCENTS.length];
}

export function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function groupByKey<T extends { id: string; groupId?: string | null }>(
  items: T[],
): T[][] {
  const groups: T[][] = [];
  const byGid = new Map<string, T[]>();
  for (const item of items) {
    if (item.groupId) {
      let bucket = byGid.get(item.groupId);
      if (!bucket) {
        bucket = [];
        byGid.set(item.groupId, bucket);
        groups.push(bucket);
      }
      bucket.push(item);
    } else {
      groups.push([item]);
    }
  }
  return groups;
}

function classifyPart7(group: Reading[]): "single" | "double" | "triple" {
  const first = group[0];
  const passage = first.passage || "";
  const topic = first.topic || "";
  const keywords = (first.keywords || []).join(" ").toLowerCase();
  if (
    keywords.includes("triple") ||
    topic.includes("三篇") ||
    passage.includes("DOCUMENT 3")
  )
    return "triple";
  if (
    keywords.includes("double") ||
    topic.includes("雙篇") ||
    passage.includes("DOCUMENT 2")
  )
    return "double";
  return "single";
}

function pickExactGroups<T>(
  groups: T[][],
  targetQuestions: number,
  exactGroups: number | null,
  random = Math.random,
): T[][] | null {
  const pool = shuffle(groups, random);
  const failed = new Set<string>();
  const chosen: T[][] = [];
  function dfs(idx: number, remQ: number, remG: number | null): boolean {
    if (remQ === 0 && (remG === null || remG === 0)) return true;
    if (remQ < 0 || idx >= pool.length || (remG !== null && remG <= 0))
      return false;
    const key = `${idx}:${remQ}:${remG ?? "*"}`;
    if (failed.has(key)) return false;
    const sz = pool[idx].length;
    if (sz <= remQ) {
      chosen.push(pool[idx]);
      if (dfs(idx + 1, remQ - sz, remG === null ? null : remG - 1)) return true;
      chosen.pop();
    }
    if (dfs(idx + 1, remQ, remG)) return true;
    failed.add(key);
    return false;
  }
  return dfs(0, targetQuestions, exactGroups) ? chosen : null;
}

export function buildLocalMockExam(
  section: MockSection,
  listeningEntries: Listening[],
  readingEntries: Reading[],
  random = Math.random,
): MockExam {
  let questionIds: string[] = [];
  if (section === "listening") {
    const p1 = shuffle(
      listeningEntries.filter((q) => (q.part ?? 2) === 1),
      random,
    ).slice(0, 6);
    const p2 = shuffle(
      listeningEntries.filter((q) => (q.part ?? 2) === 2),
      random,
    ).slice(0, 25);
    const p3 = shuffle(
      groupByKey(listeningEntries.filter((q) => (q.part ?? 2) === 3)),
      random,
    )
      .slice(0, 13)
      .flat();
    const p4 = shuffle(
      groupByKey(listeningEntries.filter((q) => (q.part ?? 2) === 4)),
      random,
    )
      .slice(0, 10)
      .flat();
    questionIds = [...p1, ...p2, ...p3, ...p4].map((q) => q.id);
  } else {
    const p5 = shuffle(
      readingEntries.filter((q) => q.part === 5),
      random,
    ).slice(0, 30);
    const p6 = shuffle(
      groupByKey(readingEntries.filter((q) => q.part === 6)),
      random,
    )
      .slice(0, 4)
      .flat();
    const p7Groups = groupByKey(readingEntries.filter((q) => q.part === 7));
    const singles = p7Groups.filter((g) => classifyPart7(g) === "single");
    const doubles = p7Groups.filter((g) => classifyPart7(g) === "double");
    const triples = p7Groups.filter((g) => classifyPart7(g) === "triple");
    const pickedSingles =
      pickExactGroups(singles, 29, 10, random) ||
      pickExactGroups(singles, 29, null, random) ||
      [];
    pickedSingles.sort((a, b) => a.length - b.length);
    let pickedMulti: Reading[][] | null = null;
    for (const [dq, tq] of shuffle(
      [
        [10, 15],
        [8, 17],
        [12, 13],
        [13, 12],
      ],
      random,
    )) {
      const dp = pickExactGroups(doubles, dq, null, random);
      const tp = pickExactGroups(triples, tq, null, random);
      if (dp && tp) {
        pickedMulti = [...dp, ...tp];
        break;
      }
    }
    const p7 = [
      ...pickedSingles,
      ...(pickedMulti ||
        pickExactGroups([...doubles, ...triples], 25, null, random) ||
        []),
    ].flat();
    questionIds = [...p5, ...p6, ...p7].map((q) => q.id);
  }
  const duration = section === "listening" ? 45 * 60 : 75 * 60;
  const now = new Date().toISOString();
  return {
    id: createUuid(),
    section,
    status: "in_progress",
    question_ids: questionIds,
    answers: {},
    flagged_ids: [],
    played_keys: [],
    current_index: 0,
    duration_seconds: duration,
    remaining_seconds: duration,
    total_questions: questionIds.length,
    correct_count: null,
    scaled_score: null,
    wrong_ids: null,
    part_stats: null,
    created_at: now,
    updated_at: now,
    completed_at: null,
  };
}

export function estimateToeicSectionScore(
  section: MockSection,
  correct: number,
  total: number,
): number {
  if (total <= 0 || correct <= 0) return 5;
  const ratio = Math.min(1, Math.max(0, correct / total));
  let scaled =
    section === "listening"
      ? 5 + Math.round((Math.pow(ratio, 0.92) * 490) / 5) * 5
      : 5 + Math.round((Math.pow(ratio, 1.03) * 490) / 5) * 5;
  if (section === "listening" && correct >= total - 3) scaled = 495;
  if (section === "reading" && correct >= total - 1) scaled = 495;
  return Math.max(5, Math.min(495, scaled));
}

export function gradeLocalMockExam(
  exam: MockExam,
  entriesById: Map<string, Listening | Reading>,
): MockExam {
  let correctCount = 0;
  const wrongIds: string[] = [];
  const perPart = new Map<number, { total: number; correct: number }>();
  for (const id of exam.question_ids) {
    const item = entriesById.get(id);
    if (!item) {
      wrongIds.push(id);
      continue;
    }
    const part = item.part ?? (exam.section === "listening" ? 2 : 5);
    const stat = perPart.get(part) || { total: 0, correct: 0 };
    stat.total += 1;
    if (exam.answers[id] && exam.answers[id] === item.answer) {
      correctCount += 1;
      stat.correct += 1;
    } else {
      wrongIds.push(id);
    }
    perPart.set(part, stat);
  }
  const partStats: MockExamPartStat[] = [...perPart.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([part, stat]) => ({ part, ...stat }));
  const now = new Date().toISOString();
  return {
    ...exam,
    status: "completed",
    correct_count: correctCount,
    scaled_score: estimateToeicSectionScore(
      exam.section,
      correctCount,
      exam.question_ids.length,
    ),
    wrong_ids: wrongIds,
    part_stats: partStats,
    completed_at: now,
    updated_at: now,
  };
}
