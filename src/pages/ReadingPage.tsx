import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useProgress } from "../contexts/ProgressContext";
import {
  pickGroupedSession,
  readingPartMeta,
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
    [session, setSession] = useState<Reading[] | null>(null),
    [index, setIndex] = useState(0),
    [results, setResults] = useState<{ id: string; correct: boolean }[]>([]);

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

  function filterPool() {
    return partEntries.filter(
      (row) =>
        (topic === "all" || row.topic === topic) &&
        (difficulty === "all" || (row.difficulty || "600") === difficulty) &&
        (!starredOnly ||
          progress.records.some(
            (record) =>
              record.entry_id === row.id && record.status === "review",
          )),
    );
  }

  function begin(items?: Reading[]) {
    setGeneration((value) => value + 1);
    setSession(pickGroupedSession(items || filterPool(), 10));
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
      const hasStarred = filterPool().length > 0;
      if (hasStarred) begin();
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

  const starredCount = progress.records.filter(
    (record) => record.category === "reading" && record.status === "review",
  ).length;

  const partCounts: Record<ReadingPart, number> = {
    5: bank.entries.filter((row) => row.part === 5).length,
    6: bank.entries.filter((row) => row.part === 6).length,
    7: bank.entries.filter((row) => row.part === 7).length,
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

  const currentQuestion = session[index];

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">READ WITH PRECISION EVERY DAY</p>
          <h1>把多益閱讀，讀成直覺。</h1>
          <p>
            共 {bank.entries.length.toLocaleString()}{" "}
            題多益閱讀練習（Part 5–7），重要考題可按 ★ 加入重要題庫。
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
                  <small>{partCounts[part]} 題</small>
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
              <span>{starredCount}</span>
            </label>
          </div>
          <section className="study-panel">
            <div className="session-header">
              <span>{currentMeta.subtitle}</span>
              <span>
                {Math.min(index + 1, session.length)} / {session.length}
              </span>
            </div>
            {!session.length ? (
              <div className="empty-state">
                <h2>目前沒有符合的題目</h2>
                <p>先練習，遇到關鍵題目可點擊 ★ 加入重要題庫。</p>
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
                  答對 {results.filter((row) => row.correct).length} /{" "}
                  {session.length} 題
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
                    disabled={results.every((row) => row.correct)}
                    onClick={() =>
                      begin(
                        session.filter((row) =>
                          results.some(
                            (result) =>
                              result.id === row.id && !result.correct,
                          ),
                        ),
                      )
                    }
                  >
                    重練本次錯題
                  </button>
                </div>
              </div>
            ) : (
              <ReadingExercise
                key={`${generation}:${user?.id || "guest"}:${currentQuestion.id}:${index}:${session.map((row) => row.id).join(",")}`}
                question={currentQuestion}
                next={(correct) => {
                  setResults([
                    ...results,
                    { id: currentQuestion.id, correct },
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
        <CollectionPanel category="reading" total={bank.entries.length} />
      </div>
    </>
  );
}

function ReadingExercise({
  question,
  next,
}: {
  question: Reading;
  next: (correct: boolean) => void;
}) {
  const partInfo = readingPartMeta[question.part];
  const [answer, setAnswer] = useState<string | null>(null),
    [correct, setCorrect] = useState(false);

  function choose(optionLabel: string) {
    if (answer !== null) return;
    setCorrect(optionLabel === question.answer);
    setAnswer(optionLabel);
  }

  return (
    <div className="exercise-content">
      <div className="word-heading">
        <span className="word-number">
          {question.id.toUpperCase()} · {question.topic}
          {question.difficulty ? ` · TOEIC ${question.difficulty}+` : ""}
        </span>
        <div className="heading-actions">
          <BookmarkButton
            entryId={question.id}
            category="reading"
            itemLabel={question.id}
            compact
          />
          <span className="listening-type">
            {partInfo.shortTitle}
            {question.groupId ? ` · ${question.groupId}` : ""}
          </span>
        </div>
      </div>

      {question.passage && (
        <article className="reading-passage" aria-label="閱讀文章">
          <div className="reading-passage-header">
            <span className="tiny-label">
              {question.part === 6 ? "PASSAGE · 短文填空" : "PASSAGE · 閱讀文件"}
            </span>
            {question.groupId && (
              <span className="reading-group-tag">題組 {question.groupId}</span>
            )}
          </div>
          <div className="reading-passage-body" lang="en">
            {question.passage}
          </div>
        </article>
      )}

      <div className="reading-prompt-box">
        <span className="tiny-label">
          {question.part === 5 ? "SENTENCE" : "QUESTION"}
        </span>
        <p className="reading-prompt-text" lang="en">
          {question.prompt}
        </p>
      </div>

      <div className="listening-choices" role="group" aria-label="選擇答案">
        {question.options.map((option) => (
          <button
            type="button"
            key={option.label}
            className={`quiz-option listening-choice ${answer !== null && option.label === question.answer ? "correct" : ""} ${answer === option.label && !correct ? "incorrect" : ""}`}
            disabled={answer !== null}
            onClick={() => choose(option.label)}
          >
            <span className="option-letter">{option.label}</span>
            <span lang="en">{option.text}</span>
            {answer !== null && (
              <span className="option-result">
                {option.label === question.answer
                  ? "✓ 正解"
                  : answer === option.label
                    ? "×"
                    : ""}
              </span>
            )}
          </button>
        ))}
      </div>

      {answer !== null && (
        <div className="listening-feedback" role="status">
          <p
            className={`quiz-feedback ${correct ? "is-correct" : "is-incorrect"}`}
          >
            {correct
              ? "✓ 答對了！"
              : `沒關係，看解析把考點記起來。正確答案是 ${question.answer}。`}
          </p>
          <div className="listening-transcript">
            <h3>題目與中文解析</h3>
            <p className="transcript-prompt" lang="en">
              {question.prompt}
            </p>
            {question.promptZh && (
              <p className="example-zh">{question.promptZh}</p>
            )}
            {question.options.map((row) => (
              <div
                key={row.label}
                className={`transcript-response ${row.label === question.answer ? "is-answer" : ""}`}
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
            <p>{question.explanation}</p>
            {question.evidence && (
              <div className="reading-evidence">
                <strong>
                  關鍵證據句
                  {question.evidenceLocation
                    ? `（${question.evidenceLocation}）`
                    : ""}
                  ：
                </strong>
                <blockquote lang="en">{question.evidence}</blockquote>
              </div>
            )}
          </div>
          <div className="listening-keywords">
            {question.keywords.map((word) => (
              <span key={word}>{word}</span>
            ))}
          </div>
          <div className="feedback-actions">
            <BookmarkButton
              entryId={question.id}
              category="reading"
              itemLabel={question.id}
            />
            <button
              type="button"
              className="button primary next-button"
              onClick={() => next(correct)}
            >
              下一題 →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
