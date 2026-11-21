import { expect, it } from "vitest";
import words from "../../data/vocabulary.json";
import listening from "../../data/listening.js";
import reading from "../../data/reading.json";
import {
  buildListeningGroupSpeechSegments,
  buildListeningSpeechSegments,
  buildLocalMockExam,
  choices,
  definition,
  gradeLocalMockExam,
  groupItemsIntoUnits,
  pickGroupedSession,
  pickUnitSession,
  stats,
  type Listening,
  type Reading,
  type Word,
} from "./types";
it("retains all source words, listening Parts 1-4, and reading Parts 5-7 with unique IDs", () => {
  expect(words.entries).toHaveLength(1000);
  expect(listening.entries).toHaveLength(332);
  expect(reading.entries).toHaveLength(805);
  expect(
    new Set(
      [...words.entries, ...listening.entries, ...reading.entries].map(
        (row) => row.id,
      ),
    ).size,
  ).toBe(2137);
  for (const word of words.entries) {
    expect(word.example).not.toBe("");
    expect(word.translation).not.toBe("");
    expect(word.senses.length).toBeGreaterThan(0);
  }
  expect(listening.entries.filter((row) => row.part === 1)).toHaveLength(25);
  expect(listening.entries.filter((row) => row.part === 2)).toHaveLength(139);
  expect(listening.entries.filter((row) => row.part === 3)).toHaveLength(90);
  expect(listening.entries.filter((row) => row.part === 4)).toHaveLength(78);
  expect(reading.entries.filter((row) => row.part === 5)).toHaveLength(328);
  expect(reading.entries.filter((row) => row.part === 6)).toHaveLength(120);
  expect(reading.entries.filter((row) => row.part === 7)).toHaveLength(357);
  for (const topic of ["workplace", "travel", "service"])
    expect(listening.entries.filter((row) => row.topic === topic)).toHaveLength(
      10,
    );
});
it("builds whole-group speech segments and keeps complete question units intact", () => {
  const p1 = listening.entries.find((row) => row.part === 1) as Listening;
  const p3Units = groupItemsIntoUnits(
    listening.entries.filter((row) => row.part === 3) as Listening[],
  );
  expect(p3Units).toHaveLength(30);
  expect(p3Units[0].items).toHaveLength(3);
  expect(buildListeningSpeechSegments(p1).segments).toHaveLength(4);
  const p3GroupSpeech = buildListeningGroupSpeechSegments(p3Units[0].items);
  expect(p3GroupSpeech.segments[0]).not.toMatch(/^[WM]:/i);
  expect(p3GroupSpeech.segments.slice(-3)).toEqual(
    p3Units[0].items.map((q, i) => `Question ${i + 1}. ${q.prompt}`),
  );

  // pickUnitSession never chops a Part 6 (4-question) group in half
  const p6Session = pickUnitSession(
    reading.entries.filter((row) => row.part === 6) as Reading[],
    10,
    () => 0.42,
  );
  expect(p6Session.every((unit) => unit.items.length === 4)).toBe(true);
  expect(p6Session.length).toBe(3);

  const grouped = pickGroupedSession(
    listening.entries.filter((row) => row.part === 3) as Listening[],
    6,
    () => 0.42,
  );
  expect(grouped).toHaveLength(6);
  expect(grouped[0].groupId).toBe(grouped[1].groupId);
  expect(grouped[1].groupId).toBe(grouped[2].groupId);
});
it("every word has four distinct definitions and exactly one correct answer", () => {
  for (const word of words.entries) {
    const result = choices(word as Word, words.entries);
    expect(result).toHaveLength(4);
    expect(new Set(result.map(definition)).size).toBe(4);
    expect(result.filter((row) => row.id === word.id)).toHaveLength(1);
  }
});
it("empty progress has no invented accuracy", () => {
  expect(stats([])).toEqual({
    mastered: 0,
    review: 0,
    attempts: 0,
    accuracy: null,
  });
});
it("builds official 100-question Listening and Reading mock exams and grades them accurately", () => {
  const listeningExam = buildLocalMockExam(
    "listening",
    listening.entries as Listening[],
    reading.entries as Reading[],
    () => 0.37,
  );
  expect(listeningExam.question_ids).toHaveLength(100);
  expect(listeningExam.duration_seconds).toBe(2700);
  const listeningById = new Map(
    (listening.entries as Listening[]).map((q) => [q.id, q]),
  );
  const lCounts = [1, 2, 3, 4].map(
    (p) =>
      listeningExam.question_ids.filter(
        (id) => (listeningById.get(id)?.part ?? 2) === p,
      ).length,
  );
  expect(lCounts).toEqual([6, 25, 39, 30]);

  const readingExam = buildLocalMockExam(
    "reading",
    listening.entries as Listening[],
    reading.entries as Reading[],
    () => 0.37,
  );
  expect(readingExam.question_ids).toHaveLength(100);
  expect(readingExam.duration_seconds).toBe(4500);
  const readingById = new Map(
    (reading.entries as Reading[]).map((q) => [q.id, q]),
  );
  const rCounts = [5, 6, 7].map(
    (p) =>
      readingExam.question_ids.filter((id) => readingById.get(id)?.part === p)
        .length,
  );
  expect(rCounts).toEqual([30, 16, 54]);

  const firstId = readingExam.question_ids[0];
  const firstItem = readingById.get(firstId)!;
  const graded = gradeLocalMockExam(
    { ...readingExam, answers: { [firstId]: firstItem.answer } },
    readingById,
  );
  expect(graded.status).toBe("completed");
  expect(graded.correct_count).toBe(1);
  expect(graded.wrong_ids).toHaveLength(99);
  expect(graded.scaled_score).toBeGreaterThanOrEqual(5);
});
