export const STORAGE_KEY = 'english-reps.progress.v1';
export const SESSION_SIZE = 10;

export const definition = entry => entry.senses.map(sense => sense.meaning).join('；');

export function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function filterEntries(entries, { query = '', unit = 'all', pos = 'all', reviewOnly = false, records = {} } = {}) {
  const search = query.trim().toLocaleLowerCase();
  return entries.filter(entry =>
    (unit === 'all' || entry.unit === Number(unit)) &&
    (pos === 'all' || entry.senses.some(sense => sense.pos === pos)) &&
    (!reviewOnly || records[entry.id]?.status === 'review') &&
    (!search || `${entry.word} ${definition(entry)}`.toLocaleLowerCase().includes(search)),
  );
}

export function makeQuestion(entry, entries, random = Math.random) {
  const correct = definition(entry);
  const seen = new Set([correct]);
  const distractors = [];
  for (const candidate of shuffle(entries, random)) {
    const meaning = definition(candidate);
    if (candidate.id === entry.id || seen.has(meaning)) continue;
    seen.add(meaning);
    distractors.push({ id: candidate.id, meaning });
    if (distractors.length === 3) break;
  }
  return shuffle([{ id: entry.id, meaning: correct }, ...distractors], random);
}

export function loadProgress(storage, validIds) {
  try {
    const data = JSON.parse(storage.getItem(STORAGE_KEY) || '{}');
    if (!data || data.version !== 1 || !data.records || typeof data.records !== 'object') return {};
    const records = {};
    for (const [id, record] of Object.entries(data.records)) {
      if (!validIds.has(id) || !record || !['mastered', 'review', 'unseen'].includes(record.status)) continue;
      const attempts = Number.isSafeInteger(record.attempts) && record.attempts >= 0 ? record.attempts : 0;
      const correct = Number.isSafeInteger(record.correct) && record.correct >= 0 ? Math.min(record.correct, attempts) : 0;
      records[id] = { status: record.status, attempts, correct };
    }
    return records;
  } catch {
    return {};
  }
}

export function recordResult(records, id, mastered, isQuiz = false) {
  const previous = records[id] || { attempts: 0, correct: 0 };
  return {
    ...records,
    [id]: {
      status: mastered ? 'mastered' : 'review',
      attempts: previous.attempts + (isQuiz ? 1 : 0),
      correct: previous.correct + (isQuiz && mastered ? 1 : 0),
    },
  };
}

export function progressStats(records) {
  const values = Object.values(records);
  const answered = values.reduce((sum, record) => sum + record.attempts, 0);
  const correct = values.reduce((sum, record) => sum + record.correct, 0);
  return {
    mastered: values.filter(record => record.status === 'mastered').length,
    review: values.filter(record => record.status === 'review').length,
    answered,
    accuracy: answered ? Math.round(correct / answered * 100) : null,
  };
}
