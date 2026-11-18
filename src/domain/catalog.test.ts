import { expect, it } from "vitest";
import words from "../../data/vocabulary.json";
import listening from "../../data/listening.js";
import { choices, definition, stats, type Word } from "./types";
it("retains all source words and bilingual listening items with stable IDs", () => {
  expect(words.entries).toHaveLength(1000);
  expect(listening.entries).toHaveLength(30);
  expect(
    new Set([...words.entries, ...listening.entries].map((row) => row.id)).size,
  ).toBe(1030);
  for (const word of words.entries) {
    expect(word.example).not.toBe("");
    expect(word.translation).not.toBe("");
    expect(word.senses.length).toBeGreaterThan(0);
  }
  for (const topic of ["workplace", "travel", "service"])
    expect(listening.entries.filter((row) => row.topic === topic)).toHaveLength(
      10,
    );
  for (const label of ["A", "B", "C"])
    expect(
      listening.entries.filter((row) => row.answer === label),
    ).toHaveLength(10);
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
