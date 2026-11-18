import { createUuid, type Status } from "../domain/types";
export interface LegacyImport {
  import_id: string;
  records: {
    entry_id: string;
    status: Status;
    attempts: number;
    correct: number;
  }[];
}
export function legacyImport(
  storage: Storage,
  owner: string,
): LegacyImport | null {
  const records: LegacyImport["records"] = [];
  for (const [key, pattern] of [
    ["english-reps.progress.v1", /^word-\d{4}$/],
    ["english-reps.listening.v1", /^listen-\d{3}$/],
  ] as const) {
    let data;
    try {
      data = JSON.parse(storage.getItem(key) || "{}");
    } catch {
      continue;
    }
    if (data.version !== 1 || !data.records || typeof data.records !== "object")
      continue;
    for (const [entry_id, value] of Object.entries(data.records)) {
      const row = value as Record<string, unknown> | null;
      if (
        !pattern.test(entry_id) ||
        !row ||
        !["mastered", "review", "unseen"].includes(String(row.status))
      )
        continue;
      const attempts =
        Number.isSafeInteger(row.attempts) && Number(row.attempts) >= 0
          ? Math.min(Number(row.attempts), 1_000_000)
          : 0;
      const correct =
        Number.isSafeInteger(row.correct) && Number(row.correct) >= 0
          ? Math.min(Number(row.correct), attempts)
          : 0;
      records.push({
        entry_id,
        status: row.status as Status,
        attempts,
        correct,
      });
    }
  }
  if (!records.length) return null;
  const fingerprint = JSON.stringify(records);
  const key = `english-reps.import.v1.${owner}`;
  let existing;
  try {
    existing = JSON.parse(storage.getItem(key) || "{}");
  } catch {
    existing = {};
  }
  const import_id =
    existing.fingerprint === fingerprint &&
    typeof existing.import_id === "string"
      ? existing.import_id
      : createUuid();
  storage.setItem(key, JSON.stringify({ fingerprint, import_id }));
  return { import_id, records };
}
