import { expect, it } from "vitest";
import words from "../../data/vocabulary.json";
import listening from "../../data/listening.js";
import reading from "../../data/reading.json";
import {
  buildListeningSpeechSegments,
  choices,
  definition,
  pickGroupedSession,
  stats,
  type Listening,
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
it("builds Part-specific speech segments and keeps grouped questions contiguous", () => {
  const p1 = listening.entries.find((row) => row.part === 1) as Listening;
  const p3 = listening.entries.find((row) => row.part === 3) as Listening;
  expect(buildListeningSpeechSegments(p1).segments).toHaveLength(4);
  const p3Speech = buildListeningSpeechSegments(p3);
  expect(p3Speech.segments.length).toBeGreaterThanOrEqual(2);
  expect(p3Speech.segments[0]).not.toMatch(/^[WM]:/i);
  expect(p3Speech.segments[p3Speech.segments.length - 1]).toBe(p3.prompt);

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
