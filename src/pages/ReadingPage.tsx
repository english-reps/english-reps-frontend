import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useProgress } from "../contexts/ProgressContext";
import {
  groupItemsIntoUnits,
  pickUnitSession,
  readingPartMeta,
  type QuestionUnit,
  type Reading,
  type ReadingPart,
} from "../domain/types";
import { useCatalog } from "../services/catalog";
import { BookmarkButton } from "../components/BookmarkButton";
import { CollectionPanel, ErrorNotice, Loading } from "../components/Common";

export function ReadingPage() {
  const { user } = useAuth();
  const [generation, setGeneration] = useState(0);
  const bank = useCatalog<Reading>("reading"),
    progress = useProgress();
  const [selectedPart, setSelectedPart] = useState<"all" | ReadingPart>(5),
    [topic, setTopic] = useState("all"),
    [difficulty, setDifficulty] = useState("all"),
    [starredOnly, setStarredOnly] = useState(false),
    [session, setSession] = useState<QuestionUnit<Reading>[] | null>(null),
    [index, setIndex] = useState(0),
    [results, setResults] = useState<
      { unitKey: string; total: number; correct: number }[]
    >([]);

  const starredIdSet = useMemo(
    () =>
      new Set(
        progress.records
          .filter(
            (record) =>
              record.category === "reading" && record.status === "review",
          )
          .map((record) => record.entry_id),
      ),
    [progress.records],
  );

  const partEntries = useMemo(
    () =>
      bank.entries.filter(
        (row) => selectedPart === "all" || row.part === selectedPart,
      ),
    [bank.entries, selectedPart],
  );

  const availableTopics = useMemo(
    () => [...new Set(partEntries.map((row) => row.topic))],
    [partEntries],
  );

  function filterUnits(): QuestionUnit<Reading>[] {
    const units = groupItemsIntoUnits(partEntries);
    return units.filter((unit) => {
      const first = unit.items[0];
      if (topic !== "all" && first.topic !== topic) return false;
      if (
        difficulty !== "all" &&
        !unit.items.some((item) => (item.difficulty || "600") === difficulty)
      )
        return false;
      if (
        starredOnly &&
        !unit.items.some((item) => starredIdSet.has(item.id))
      )
        return false;
      return true;
    });
  }

  function begin(customUnits?: QuestionUnit<Reading>[]) {
    setGeneration((value) => value + 1);
    if (customUnits) {
      setSession(customUnits);
    } else {
      const filteredItems = filterUnits().flatMap((u) => u.items);
      setSession(pickUnitSession(filteredItems, 10));
    }
    setIndex(0);
    setResults([]);
  }

  useEffect(() => {
    if (bank.loading || bank.error) return;
    begin();
  }, [
    bank.loading,
    bank.error,
    bank.entries,
    selectedPart,
    topic,
    difficulty,
    starredOnly,
  ]);

  useEffect(() => {
    if (
      !bank.loading &&
      starredOnly &&
      !progress.loading &&
      session !== null &&
      session.length === 0 &&
      bank.entries.length > 0
    ) {
      if (filterUnits().length > 0) begin();
    }
  }, [
    bank.loading,
    starredOnly,
    progress.loading,
    progress.records,
    bank.entries,
    selectedPart,
    topic,
    difficulty,
    session?.length,
  ]);

  if (bank.loading) return <Loading />;
  if (bank.error)
    return <ErrorNotice message={bank.error} retry={bank.retry} />;
  if (session === null) return <Loading />;

  const starredUnitCount = groupItemsIntoUnits(bank.entries).filter((unit) =>
    unit.items.some((item) => starredIdSet.has(item.id)),
  ).length;

  const partCounts: Record<ReadingPart, number> = {
    5: bank.entries.filter((row) => row.part === 5).length,
    6: bank.entries.filter((row) => row.part === 6).length,
    7: bank.entries.filter((row) => row.part === 7).length,
  };
  const partUnitCounts: Record<ReadingPart, number> = {
    5: groupItemsIntoUnits(bank.entries.filter((row) => row.part === 5)).length,
    6: groupItemsIntoUnits(bank.entries.filter((row) => row.part === 6)).length,
    7: groupItemsIntoUnits(bank.entries.filter((row) => row.part === 7)).length,
  };

  const currentMeta =
    selectedPart === "all"
      ? {
          badge: "PARTS 5–7",
          title: "全題型混合閱讀",
          subtitle: "涵蓋單句填空、短文填空與單篇／多篇閱讀理解",
        }
      : readingPartMeta[selectedPart];

  function selectPart(nextPart: "all" | ReadingPart) {
    setSelectedPart(nextPart);
    setTopic("all");
  }

  const currentUnit = session[index];
  const totalSessionQuestions = session.reduce(
    (sum, u) => sum + u.items.length,
    0,
  );
  const totalCorrect = results.reduce((sum, r) => sum + r.correct, 0);

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">READ WITH PRECISION EVERY DAY</p>
          <h1>把多益閱讀，讀成直覺。</h1>
          <p>
            共 {bank.entries.length.toLocaleString()}{" "}
            題多益閱讀練習（Part 5–7），Part 6／7
            同頁顯示完整文章與全部子題，按 ★ 即可整組加入重要題庫。
          </p>
        </div>
      </div>
      <div className="practice-layout">
        <div className="study-column">
          {bank.offline && (
            <ErrorNotice
              message="目前無法連線到題庫伺服器，已改用內建離線閱讀題庫。"
              retry={bank.retry}
            />
          )}
          <div
            className="part-selector"
            role="tablist"
            aria-label="多益閱讀 Part 選擇"
          >
            {([5, 6, 7] as ReadingPart[]).map((part) => {
              const meta = readingPartMeta[part];
              const active = selectedPart === part;
              return (
                <button
                  type="button"
                  role="tab"
                  aria-selected={active}
                  key={part}
                  className={`part-tab ${active ? "active" : ""}`}
                  onClick={() => selectPart(part)}
                >
                  <span className="part-tab-badge">{meta.badge}</span>
                  <strong>{meta.title}</strong>
                  <small>
                    {part === 6 || part === 7
                      ? `${partUnitCounts[part]} 篇（${partCounts[part]} 題）`
                      : `${partCounts[part]} 題`}
                  </small>
                </button>
              );
            })}
            <button
              type="button"
              role="tab"
              aria-selected={selectedPart === "all"}
              className={`part-tab ${selectedPart === "all" ? "active" : ""}`}
              onClick={() => selectPart("all")}
            >
              <span className="part-tab-badge">ALL PARTS</span>
              <strong>全部混合</strong>
              <small>{bank.entries.length} 題</small>
            </button>
          </div>
          <div className="study-toolbar">
            <span className="listening-section-label">
              {currentMeta.badge} STYLE<span>{currentMeta.title}</span>
            </span>
            <button
              type="button"
              className="text-button"
              onClick={() => begin()}
            >
              ↻ 換一組題目
            </button>
          </div>
          <div className="range-bar listening-range">
            <label>
              練習主題
              <select value={topic} onChange={(e) => setTopic(e.target.value)}>
                <option value="all">
                  全部主題 · {partEntries.length.toLocaleString()} 題
                </option>
                {availableTopics.map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>
            </label>
            <label>
              難度分級
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
              >
                <option value="all">全部難度</option>
                <option value="400">TOEIC 400+ 基礎</option>
                <option value="600">TOEIC 600+ 核心</option>
                <option value="800">TOEIC 800+ 進階</option>
              </select>
            </label>
            <label className="review-toggle">
              <input
                type="checkbox"
                checked={starredOnly}
                onChange={(e) => setStarredOnly(e.target.checked)}
              />
              只練重要閱讀
              <span>{starredUnitCount}</span>
            </label>
          </div>
          <section className="study-panel">
            <div className="session-header">
              <span>{currentMeta.subtitle}</span>
              <span>
                {Math.min(index + 1, session.length)} / {session.length}
                {currentUnit && currentUnit.items.length > 1
                  ? `（本篇 ${currentUnit.items.length} 小題）`
                  : ""}
              </span>
            </div>
            {!session.length ? (
              <div className="empty-state">
                <h2>目前沒有符合的題目</h2>
                <p>先練習，遇到關鍵題目或題組可點擊 ★ 整組加入重要題庫。</p>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => {
                    setTopic("all");
                    setDifficulty("all");
                    setStarredOnly(false);
                  }}
                >
                  練習全部主題
                </button>
              </div>
            ) : index >= session.length ? (
              <div className="session-summary">
                <span className="summary-seal" aria-hidden="true">
                  ✓
                </span>
                <p className="eyebrow">ONE MORE REP, ONE STEP FORWARD.</p>
                <h2>這一組，讀完也練完了！</h2>
                <p className="summary-description">
                  答對 {totalCorrect} / {totalSessionQuestions} 小題
                </p>
                <div className="summary-actions">
                  <button
                    type="button"
                    className="button primary"
                    onClick={() => begin()}
                  >
                    再練一組
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={results.every((row) => row.correct === row.total)}
                    onClick={() =>
                      begin(
                        session.filter((unit) =>
                          results.some(
                            (result) =>
                              result.unitKey === unit.key &&
                              result.correct < result.total,
                          ),
                        ),
                      )
                    }
                  >
                    重練本次有錯的題組
                  </button>
                </div>
              </div>
            ) : (
              <ReadingUnitExercise
                key={`${generation}:${user?.id || "guest"}:${currentUnit.key}:${index}`}
                unit={currentUnit}
                next={(correctCount) => {
                  setResults([
                    ...results,
                    {
                      unitKey: currentUnit.key,
                      total: currentUnit.items.length,
                      correct: correctCount,
                    },
                  ]);
                  setIndex(index + 1);
                }}
              />
            )}
          </section>
          <p className="local-note">
            原創多益仿真題庫，非 ETS 官方題目。
          </p>
        </div>
        <CollectionPanel
          category="reading"
          total={bank.entries.length}
          entries={bank.entries}
        />
      </div>
    </>
  );
}

function ReadingUnitExercise({
  unit,
  next,
}: {
  unit: QuestionUnit<Reading>;
  next: (correctCount: number) => void;
}) {
  const first = unit.items[0];
  const isGroup = unit.items.length > 1;
  const partInfo = readingPartMeta[first.part];
  const unitIds = useMemo(() => unit.items.map((item) => item.id), [unit.items]);

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  function choose(questionId: string, optionLabel: string) {
    if (submitted) return;
    if (!isGroup) {
      setAnswers({ [questionId]: optionLabel });
      setSubmitted(true);
      return;
    }
    setAnswers((prev) => ({ ...prev, [questionId]: optionLabel }));
  }

  const answeredInGroup = unit.items.filter((q) => Boolean(answers[q.id])).length;
  const correctInGroup = unit.items.filter(
    (q) => answers[q.id] === q.answer,
  ).length;
  const singleCorrect = !isGroup && answers[first.id] === first.answer;

  return (
    <div className="exercise-content">
      <div className="word-heading">
        <span className="word-number">
          {(unit.groupId || first.id).toUpperCase()} · {first.topic}
          {first.difficulty ? ` · TOEIC ${first.difficulty}+` : ""}
        </span>
        <div className="heading-actions">
          <BookmarkButton
            entryIds={unitIds}
            category="reading"
            itemLabel={unit.groupId || first.id}
            compact
          />
          <span className="listening-type">
            {partInfo.shortTitle}
            {isGroup ? ` · 共 ${unit.items.length} 小題` : ""}
          </span>
        </div>
      </div>

      {!isGroup ? (
        <>
          {first.passage && (
            <article className="reading-passage" aria-label="閱讀文章">
              <div className="reading-passage-header">
                <span className="tiny-label">
                  {first.part === 6
                    ? "PASSAGE · 短文填空"
                    : "PASSAGE · 閱讀文件"}
                </span>
              </div>
              <div className="reading-passage-body" lang="en">
                {first.passage}
              </div>
            </article>
          )}
          <div className="reading-prompt-box">
            <span className="tiny-label">
              {first.part === 5 ? "SENTENCE" : "QUESTION"}
            </span>
            <p className="reading-prompt-text" lang="en">
              {first.prompt}
            </p>
          </div>
          <div className="listening-choices" role="group" aria-label="選擇答案">
            {first.options.map((option) => (
              <button
                type="button"
                key={option.label}
                className={`quiz-option listening-choice ${submitted && option.label === first.answer ? "correct" : ""} ${submitted && answers[first.id] === option.label && !singleCorrect ? "incorrect" : ""}`}
                disabled={submitted}
                onClick={() => choose(first.id, option.label)}
              >
                <span className="option-letter">{option.label}</span>
                <span lang="en">{option.text}</span>
                {submitted && (
                  <span className="option-result">
                    {option.label === first.answer
                      ? "✓ 正解"
                      : answers[first.id] === option.label
                        ? "×"
                        : ""}
                  </span>
                )}
              </button>
            ))}
          </div>
          {submitted && (
            <div className="listening-feedback" role="status">
              <p
                className={`quiz-feedback ${singleCorrect ? "is-correct" : "is-incorrect"}`}
              >
                {singleCorrect
                  ? "✓ 答對了！"
                  : `沒關係，看解析把考點記起來。正確答案是 ${first.answer}。`}
              </p>
              <div className="listening-transcript">
                <h3>題目與中文解析</h3>
                <p className="transcript-prompt" lang="en">
                  {first.prompt}
                </p>
                {first.promptZh && (
                  <p className="example-zh">{first.promptZh}</p>
                )}
                {first.options.map((row) => (
                  <div
                    key={row.label}
                    className={`transcript-response ${row.label === first.answer ? "is-answer" : ""}`}
                  >
                    <p lang="en">
                      {row.label}. {row.text}
                    </p>
                    {row.translation && (
                      <p className="example-zh">{row.translation}</p>
                    )}
                  </div>
                ))}
              </div>
              <div className="listening-explanation">
                <h3>為什麼選這個？</h3>
                <p>{first.explanation}</p>
                {first.evidence && (
                  <div className="reading-evidence">
                    <strong>
                      關鍵證據句
                      {first.evidenceLocation
                        ? `（${first.evidenceLocation}）`
                        : ""}
                      ：
                    </strong>
                    <blockquote lang="en">{first.evidence}</blockquote>
                  </div>
                )}
              </div>
              <div className="listening-keywords">
                {first.keywords.map((word) => (
                  <span key={word}>{word}</span>
                ))}
              </div>
              <div className="feedback-actions">
                <BookmarkButton
                  entryIds={unitIds}
                  category="reading"
                  itemLabel={first.id}
                />
                <button
                  type="button"
                  className="button primary next-button"
                  onClick={() => next(singleCorrect ? 1 : 0)}
                >
                  下一題 →
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="group-reading-layout">
          {first.passage && (
            <article
              className="reading-passage group-passage-pane"
              aria-label="閱讀文章"
            >
              <div className="reading-passage-header">
                <span className="tiny-label">
                  {first.part === 6
                    ? "PASSAGE · 短文填空"
                    : "PASSAGE · 閱讀文件"}
                </span>
                {unit.groupId && (
                  <span className="reading-group-tag">
                    題組 {unit.groupId}（{unit.items.length} 小題）
                  </span>
                )}
              </div>
              <div className="reading-passage-body" lang="en">
                {first.passage}
              </div>
            </article>
          )}

          <div className="group-questions-stack">
            {submitted && (
              <div className="listening-feedback group-summary-bar" role="status">
                <p
                  className={`quiz-feedback ${correctInGroup === unit.items.length ? "is-correct" : "is-incorrect"}`}
                >
                  本篇答對 {correctInGroup} / {unit.items.length} 小題
                </p>
              </div>
            )}

            {unit.items.map((q, subIdx) => {
              const chosen = answers[q.id];
              const isRight = chosen === q.answer;
              return (
                <div className="group-subquestion-card" key={q.id}>
                  <div className="group-subquestion-head">
                    <span className="tiny-label">
                      第 {subIdx + 1} 小題（{q.id}）
                    </span>
                    {submitted && (
                      <span
                        className={`mock-verdict-pill ${isRight ? "is-correct" : "is-wrong"}`}
                      >
                        {isRight
                          ? `✓ 答對（${chosen}）`
                          : `✗ 正解 ${q.answer}`}
                      </span>
                    )}
                  </div>
                  <p className="reading-prompt-text" lang="en">
                    {q.prompt}
                  </p>
                  {submitted && q.promptZh && (
                    <p className="example-zh">{q.promptZh}</p>
                  )}
                  <div
                    className="listening-choices group-sub-choices"
                    role="group"
                    aria-label={`第 ${subIdx + 1} 小題選項`}
                  >
                    {q.options.map((option) => (
                      <button
                        type="button"
                        key={option.label}
                        className={`quiz-option listening-choice ${!submitted && chosen === option.label ? "is-selected" : ""} ${submitted && option.label === q.answer ? "correct" : ""} ${submitted && chosen === option.label && !isRight ? "incorrect" : ""}`}
                        aria-pressed={
                          !submitted ? chosen === option.label : undefined
                        }
                        disabled={submitted}
                        onClick={() => choose(q.id, option.label)}
                      >
                        <span className="option-letter">{option.label}</span>
                        <span lang="en">{option.text}</span>
                        {submitted && (
                          <span className="option-result">
                            {option.label === q.answer
                              ? "✓ 正解"
                              : chosen === option.label
                                ? "×"
                                : ""}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                  {submitted && (
                    <div className="group-sub-explanation">
                      <p>
                        <strong>解析：</strong>
                        {q.explanation}
                      </p>
                      {q.evidence && (
                        <div className="reading-evidence">
                          <strong>
                            關鍵證據句
                            {q.evidenceLocation
                              ? `（${q.evidenceLocation}）`
                              : ""}
                            ：
                          </strong>
                          <blockquote lang="en">{q.evidence}</blockquote>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {!submitted ? (
              <div className="group-submit-bar">
                <span>
                  已選 {answeredInGroup} / {unit.items.length} 小題
                </span>
                <button
                  type="button"
                  className="button primary"
                  disabled={answeredInGroup < unit.items.length}
                  onClick={() => setSubmitted(true)}
                >
                  送出本題組答案（對答案）
                </button>
              </div>
            ) : (
              <div className="feedback-actions group-footer-actions">
                <BookmarkButton
                  entryIds={unitIds}
                  category="reading"
                  itemLabel={unit.groupId || first.id}
                />
                <button
                  type="button"
                  className="button primary next-button"
                  onClick={() => next(correctInGroup)}
                >
                  下一組 →
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
