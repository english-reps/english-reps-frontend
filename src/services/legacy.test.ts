import { expect, it } from "vitest";
import { legacyImport } from "./legacy";
it("only imports valid legacy records, preserves source and reuses IDs for the same account and data", () => {
  const original = JSON.stringify({
    version: 1,
    records: {
      "word-0001": { status: "mastered", attempts: 2, correct: 5 },
      bad: { status: "review", attempts: 1, correct: 0 },
    },
  });
  localStorage.setItem("english-reps.progress.v1", original);
  const one = legacyImport(localStorage, "owner-a"),
    two = legacyImport(localStorage, "owner-a"),
    other = legacyImport(localStorage, "owner-b");
  expect(one?.records).toEqual([
    { entry_id: "word-0001", status: "mastered", attempts: 2, correct: 2 },
  ]);
  expect(one?.import_id).toBe(two?.import_id);
  expect(other?.import_id).not.toBe(one?.import_id);
  expect(localStorage.getItem("english-reps.progress.v1")).toBe(original);
});
it("malformed or absent browser data does not fabricate imports", () => {
  localStorage.setItem("english-reps.progress.v1", "broken");
  expect(legacyImport(localStorage, "owner")).toBeNull();
});
