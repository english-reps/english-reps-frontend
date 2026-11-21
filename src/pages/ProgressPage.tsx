import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useProgress } from "../contexts/ProgressContext";
import { SpeechPlayer } from "../domain/speech.js";
import {
  buildListeningGroupSpeechSegments,
  createUuid,
  definition,
  formatCountdown,
  groupItemsIntoUnits,
  listeningPartMeta,
  readingPartMeta,
  topics,
  type Listening,
  type ListeningPart,
  type MockExam,
  type Progress,
  type Reading,
  type ReadingPart,
  type StudyEvent,
  type Word,
} from "../domain/types";
import { errorMessage } from "../services/api";
import { useCatalog } from "../services/catalog";
import { deleteMockExam, listMockExams } from "../services/mockExams";
import { ErrorNotice, Loading } from "../components/Common";
import { WordDetails } from "../components/WordDetails";

type ProgressTab = "words" | "questions" | "exams";

interface ImportantUnit {
  key: string;
  category: "listening" | "reading";
  part: number;
  groupId: string | null;
  entryIds: string[];
  listeningItems: Listening[];
  readingItems: Reading[];
}

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("zh-TW", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function ProgressPage() {
  const auth = useAuth(),
    progress = useProgress(),
    location = useLocation(),
    navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = ((): ProgressTab => {
    const raw = searchParams.get("tab");
    if (raw === "questions" || raw === "exams") return raw;
    return "words";
  })();

  const vocabBank = useCatalog<Word>("vocabulary");
  const listeningBank = useCatalog<Listening>("listening");
  const readingBank = useCatalog<Reading>("reading");

  const player = useMemo(() => {
    let synthesis, Utterance;
    try {
      synthesis = window.speechSynthesis;
      Utterance = window.SpeechSynthesisUtterance;
    } catch {}
    return new SpeechPlayer({ synthesis, Utterance });
  }, []);

  const [tab, setTab] = useState<ProgressTab>(initialTab),
    [questionCategoryFilter, setQuestionCategoryFilter] = useState<
      "all" | "listening" | "reading"
    >("all"),
    [questionPartFilter, setQuestionPartFilter] = useState<string>("all"),
    [pendingKeys, setPendingKeys] = useState<Record<string, boolean>>({}),
    [speechError, setSpeechError] = useState(""),
    [saveError, setSaveError] = useState<{
      message: string;
      key: string;
      events: StudyEvent[];
    } | null>(null),
    [exams, setExams] = useState<MockExam[]>([]),
    [loadingExams, setLoadingExams] = useState(false),
    [examsError, setExamsError] = useState(""),
    [confirmDeleteExamId, setConfirmDeleteExamId] = useState<string | null>(
      null,
    ),
    [deletingExamId, setDeletingExamId] = useState<string | null>(null);

  useEffect(() => {
    const raw = searchParams.get("tab");
    if (raw === "words" || raw === "questions" || raw === "exams") {
      setTab(raw);
    }
  }, [searchParams]);

  const loadExams = useCallback(async () => {
    if (!auth.user) {
      setExams([]);
      return;
    }
    setLoadingExams(true);
    setExamsError("");
    try {
      const list = await listMockExams();
      setExams(list);
    } catch (err) {
      setExamsError(errorMessage(err));
    } finally {
      setLoadingExams(false);
    }
  }, [auth.user]);

  useEffect(() => {
    void loadExams();
  }, [loadExams]);

  useEffect(
    () => () => {
      player.stop();
    },
    [player],
  );

  const wordsById = useMemo(
    () => new Map(vocabBank.entries.map((word) => [word.id, word])),
    [vocabBank.entries],
  );

  const starredWordRows = useMemo(
    () =>
      progress.records.filter(
        (row) => row.category === "vocabulary" && row.status === "review",
      ),
    [progress.records],
  );

  const importantUnits = useMemo(() => {
    const starredListeningIds = new Set(
      progress.records
        .filter(
          (row) => row.category === "listening" && row.status === "review",
        )
        .map((row) => row.entry_id),
    );
    const starredReadingIds = new Set(
      progress.records
        .filter((row) => row.category === "reading" && row.status === "review")
        .map((row) => row.entry_id),
    );

    const units: ImportantUnit[] = [];
    const seenIds = new Set<string>();

    for (const unit of groupItemsIntoUnits(listeningBank.entries)) {
      if (unit.items.some((item) => starredListeningIds.has(item.id))) {
        const ids = unit.items.map((item) => item.id);
        ids.forEach((id) => seenIds.add(id));
        units.push({
          key: `listening:${unit.key}`,
          category: "listening",
          part: unit.items[0].part ?? 2,
          groupId: unit.groupId,
          entryIds: ids,
          listeningItems: unit.items,
          readingItems: [],
        });
      }
    }

    for (const unit of groupItemsIntoUnits(readingBank.entries)) {
      if (unit.items.some((item) => starredReadingIds.has(item.id))) {
        const ids = unit.items.map((item) => item.id);
        ids.forEach((id) => seenIds.add(id));
        units.push({
          key: `reading:${unit.key}`,
          category: "reading",
          part: unit.items[0].part,
          groupId: unit.groupId,
          entryIds: ids,
          listeningItems: [],
          readingItems: unit.items,
        });
      }
    }

    // Fallback for any starred ID not yet loaded or missing from catalog
    for (const row of progress.records) {
      if (
        (row.category === "listening" || row.category === "reading") &&
        row.status === "review" &&
        !seenIds.has(row.entry_id)
      ) {
        units.push({
          key: `${row.category}:${row.entry_id}`,
          category: row.category,
          part: row.category === "listening" ? 2 : 5,
          groupId: null,
          entryIds: [row.entry_id],
          listeningItems: [],
          readingItems: [],
        });
      }
    }
    return units;
  }, [listeningBank.entries, progress.records, readingBank.entries]);

  if (auth.loading) return <Loading />;
  if (!auth.user)
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  const filteredImportantUnits = importantUnits.filter((unit) => {
    if (
      questionCategoryFilter !== "all" &&
      unit.category !== questionCategoryFilter
    )
      return false;
    if (
      questionPartFilter !== "all" &&
      unit.part !== Number(questionPartFilter)
    )
      return false;
    return true;
  });

  function switchTab(next: ProgressTab) {
    setTab(next);
    setSearchParams({ tab: next }, { replace: true });
  }

  async function submitRemoveBatch(key: string, events: StudyEvent[]) {
    if (pendingKeys[key] || !events.length) return;
    setPendingKeys((previous) => ({ ...previous, [key]: true }));
    setSaveError(null);
    const remaining: StudyEvent[] = [];
    let lastError: unknown = null;
    try {
      for (const event of events) {
        try {
          await progress.submit(event);
        } catch (error) {
          lastError = error;
          remaining.push(event);
        }
      }
      if (remaining.length > 0) {
        setSaveError({
          message: `${errorMessage(lastError)} 尚未確認儲存。`,
          key,
          events: remaining,
        });
      }
    } finally {
      setPendingKeys((previous) => {
        const next = { ...previous };
        delete next[key];
        return next;
      });
    }
  }

  function removeWordBookmark(row: Progress) {
    void submitRemoveBatch(row.entry_id, [
      {
        event_id: createUuid(),
        entry_id: row.entry_id,
        kind: "card",
        rating: "unseen",
      },
    ]);
  }

  function removeImportantUnit(unit: ImportantUnit) {
    const batch: StudyEvent[] = unit.entryIds.map((id) => ({
      event_id: createUuid(),
      entry_id: id,
      kind: "card",
      rating: "unseen",
    }));
    void submitRemoveBatch(unit.key, batch);
  }

  async function handleDeleteExam(id: string) {
    if (deletingExamId) return;
    setDeletingExamId(id);
    setExamsError("");
    try {
      await deleteMockExam(id);
      setExams((prev) => prev.filter((item) => item.id !== id));
      setConfirmDeleteExamId(null);
    } catch (err) {
      setExamsError(errorMessage(err));
    } finally {
      setDeletingExamId(null);
    }
  }

  function speak(text: string | string[]) {
    setSpeechError("");
    player.play(text, {
      onError: () => setSpeechError("此瀏覽器無法播放英語語音。"),
    });
  }

  const inProgressExams = exams.filter((item) => item.status === "in_progress");
  const completedExams = exams.filter((item) => item.status === "completed");

  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR BOOKMARKS &amp; MOCK EXAMS</p>
          <h1>我的收藏與模考紀錄</h1>
          <p>{auth.user.email}</p>
        </div>
        <button
          className="button secondary"
          disabled={progress.loading || loadingExams}
          onClick={() => {
            void progress.refresh();
            void loadExams();
          }}
        >
          重新整理
        </button>
      </div>

      {progress.error && (
        <ErrorNotice
          message={progress.error}
          retry={() => void progress.refresh()}
        />
      )}

      <div
        className="part-selector progress-tab-bar"
        role="tablist"
        aria-label="收藏與紀錄分頁"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "words"}
          className={`part-tab ${tab === "words" ? "active" : ""}`}
          onClick={() => switchTab("words")}
        >
          <span className="part-tab-badge">STARRED WORDS</span>
          <strong>星號單字</strong>
          <small>{starredWordRows.length} 個單字</small>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "questions"}
          className={`part-tab ${tab === "questions" ? "active" : ""}`}
          onClick={() => switchTab("questions")}
        >
          <span className="part-tab-badge">IMPORTANT BANK</span>
          <strong>重要題庫</strong>
          <small>{importantUnits.length} 題／組（聽力＋閱讀）</small>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "exams"}
          className={`part-tab ${tab === "exams" ? "active" : ""}`}
          onClick={() => switchTab("exams")}
        >
          <span className="part-tab-badge">MOCK HISTORY</span>
          <strong>模擬考紀錄</strong>
          <small>{exams.length} 場測驗</small>
        </button>
      </div>

      {saveError && (
        <ErrorNotice
          message={saveError.message}
          retry={() => void submitRemoveBatch(saveError.key, saveError.events)}
        />
      )}
      {speechError && <p role="alert">{speechError}</p>}

      {tab === "words" && (
        <section className="study-panel progress-detail-panel">
          <div className="review-list-header">
            <div>
              <h2>星號單字清單</h2>
              <p className="review-list-subtitle">
                只保留你在「單字練習」或「單字庫」主動按 ★
                收藏的單字；點開可看例句與發音，熟悉後直接移除。
              </p>
            </div>
            <span className="review-count-badge">
              {starredWordRows.length} 個
            </span>
          </div>
          {!starredWordRows.length ? (
            <div className="empty-state">
              <p className="review-empty-note">
                目前還沒有星號單字。到「單字練習」或「單字庫」點擊 ★
                即可加入。
              </p>
              <Link to="/library" className="button secondary small">
                前往單字庫
              </Link>
            </div>
          ) : (
            <div className="word-list review-list">
              {starredWordRows.map((row) => {
                const saving = Boolean(pendingKeys[row.entry_id]);
                const word = wordsById.get(row.entry_id);
                if (!word) {
                  return (
                    <div
                      className="review-item-row review-item-fallback"
                      key={row.entry_id}
                    >
                      <div className="review-fallback-title">
                        <strong>單字 {row.entry_id}</strong>
                      </div>
                      <div className="review-row-actions">
                        <button
                          type="button"
                          className="button secondary small"
                          disabled={saving}
                          aria-label={`從星號單字移除 ${row.entry_id}`}
                          onClick={() => removeWordBookmark(row)}
                        >
                          移除
                        </button>
                      </div>
                    </div>
                  );
                }
                const posText = [
                  ...new Set(word.senses.map((sense) => sense.pos)),
                ].join(" / ");
                return (
                  <div className="review-item-row" key={row.entry_id}>
                    <details className="word-row-details review-item-details">
                      <summary className="word-row-summary review-word-summary">
                        <span className="list-number">
                          {word.id.replace(/^word-/, "")}
                        </span>
                        <strong className="list-word" lang="en">
                          {word.word}
                        </strong>
                        <span className="list-pos">{posText}</span>
                        <span className="list-meaning">{definition(word)}</span>
                        <span className="expand-icon" aria-hidden="true">
                          +
                        </span>
                      </summary>
                      <div className="word-row-content">
                        <div className="review-detail-toolbar">
                          <span className="word-source">
                            單字 · 原始表第 {word.page} 頁 · 單元 {word.unit}
                          </span>
                          <button
                            type="button"
                            className="audio-button"
                            onClick={() => speak(word.word)}
                            aria-label={`聽 ${word.word} 發音`}
                          >
                            ♪ 發音
                          </button>
                        </div>
                        <WordDetails word={word} />
                      </div>
                    </details>
                    <div className="review-row-actions">
                      <button
                        type="button"
                        className="button secondary small"
                        disabled={saving}
                        aria-label={`從星號單字移除 ${word.word}`}
                        onClick={() => removeWordBookmark(row)}
                      >
                        移除
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {tab === "questions" && (
        <section className="study-panel progress-detail-panel">
          <div className="review-list-header">
            <div>
              <h2>重要題庫（聽力＋閱讀）</h2>
              <p className="review-list-subtitle">
                只保留你在聽力練習、閱讀練習或模擬考檢討頁主動按 ★
                收藏的單題或完整題組；展開即可一次複習文章／對話與全部小題，並可整組移除。
              </p>
            </div>
            <span className="review-count-badge">
              {filteredImportantUnits.length} 題／組
            </span>
          </div>

          <div className="important-bank-filters">
            <div className="mode-switch" role="group" aria-label="篩選題庫類別">
              <button
                type="button"
                className={questionCategoryFilter === "all" ? "selected" : ""}
                onClick={() => {
                  setQuestionCategoryFilter("all");
                  setQuestionPartFilter("all");
                }}
              >
                全部 ({importantUnits.length})
              </button>
              <button
                type="button"
                className={
                  questionCategoryFilter === "listening" ? "selected" : ""
                }
                onClick={() => {
                  setQuestionCategoryFilter("listening");
                  setQuestionPartFilter("all");
                }}
              >
                聽力 (
                {
                  importantUnits.filter((u) => u.category === "listening")
                    .length
                }
                )
              </button>
              <button
                type="button"
                className={
                  questionCategoryFilter === "reading" ? "selected" : ""
                }
                onClick={() => {
                  setQuestionCategoryFilter("reading");
                  setQuestionPartFilter("all");
                }}
              >
                閱讀 (
                {importantUnits.filter((u) => u.category === "reading").length})
              </button>
            </div>
            <label className="select-label">
              依 Part 篩選
              <select
                value={questionPartFilter}
                onChange={(e) => setQuestionPartFilter(e.target.value)}
              >
                <option value="all">全部 Part</option>
                {(questionCategoryFilter === "all" ||
                  questionCategoryFilter === "listening") && (
                  <>
                    <option value="1">Part 1 圖片描述</option>
                    <option value="2">Part 2 應答問題</option>
                    <option value="3">Part 3 簡短對話</option>
                    <option value="4">Part 4 簡短獨白</option>
                  </>
                )}
                {(questionCategoryFilter === "all" ||
                  questionCategoryFilter === "reading") && (
                  <>
                    <option value="5">Part 5 單句填空</option>
                    <option value="6">Part 6 短文填空</option>
                    <option value="7">Part 7 閱讀理解</option>
                  </>
                )}
              </select>
            </label>
          </div>

          {!filteredImportantUnits.length ? (
            <div className="empty-state">
              <p className="review-empty-note">
                目前沒有符合條件的重要題庫。到「聽力練習」、「閱讀練習」或「模擬考檢討頁」點擊
                ★ 即可整組加入。
              </p>
              <div className="summary-actions">
                <Link to="/listening" className="button secondary small">
                  前往聽力練習
                </Link>
                <Link to="/reading" className="button secondary small">
                  前往閱讀練習
                </Link>
              </div>
            </div>
          ) : (
            <div className="word-list review-list">
              {filteredImportantUnits.map((unit) => {
                const saving = Boolean(pendingKeys[unit.key]);
                const isMulti = unit.entryIds.length > 1;
                const displayId = unit.groupId || unit.entryIds[0];

                if (unit.category === "listening" && unit.listeningItems.length) {
                  const first = unit.listeningItems[0];
                  const partInfo =
                    listeningPartMeta[unit.part as ListeningPart];
                  return (
                    <div className="review-item-row" key={unit.key}>
                      <details className="word-row-details review-item-details">
                        <summary className="word-row-summary review-listening-summary">
                          <span className="list-number">
                            {displayId.replace(/^listen-/, "L")}
                          </span>
                          <strong
                            className="list-word review-listening-prompt"
                            lang="en"
                          >
                            {isMulti
                              ? `${topics[first.topic] || first.topic}（共 ${unit.listeningItems.length} 小題）`
                              : first.prompt}
                          </strong>
                          <span className="list-pos">
                            {partInfo.badge} ·{" "}
                            {topics[first.topic] || first.topic}
                          </span>
                          <span className="list-meaning">
                            {isMulti
                              ? first.audioTranslation || first.prompt
                              : first.promptZh ||
                                first.audioTranslation ||
                                first.explanation}
                          </span>
                          <span className="expand-icon" aria-hidden="true">
                            +
                          </span>
                        </summary>
                        <div className="word-row-content">
                          <div className="review-detail-toolbar">
                            <span className="word-source">
                              聽力（{partInfo.shortTitle}）·{" "}
                              {displayId.toUpperCase()} ·{" "}
                              {topics[first.topic] || first.topic}
                              {isMulti
                                ? ` · 共 ${unit.listeningItems.length} 小題`
                                : ""}
                            </span>
                            <button
                              type="button"
                              className="audio-button"
                              onClick={() =>
                                speak(
                                  buildListeningGroupSpeechSegments(
                                    unit.listeningItems,
                                  ).segments,
                                )
                              }
                              aria-label={`播放 ${displayId} 音檔`}
                            >
                              ♪ {isMulti ? "播放整組音檔" : "播放題目"}
                            </button>
                          </div>
                          {unit.part === 1 && first.image && (
                            <div className="part1-image-frame review-part1-image">
                              <img
                                src={first.image}
                                alt={first.imageAlt || "Part 1 圖片描述照片"}
                                className="part1-image"
                              />
                            </div>
                          )}
                          {(unit.part === 3 || unit.part === 4) &&
                            first.audioText && (
                              <div className="transcript-dialogue-block">
                                <p className="transcript-prompt" lang="en">
                                  {first.audioText}
                                </p>
                                {first.audioTranslation && (
                                  <p className="example-zh">
                                    {first.audioTranslation}
                                  </p>
                                )}
                              </div>
                            )}
                          <div className="mock-review-sublist">
                            {unit.listeningItems.map((q, idx) => (
                              <div
                                key={q.id}
                                className={
                                  isMulti ? "mock-review-subcard" : undefined
                                }
                              >
                                {isMulti && (
                                  <p className="transcript-prompt" lang="en">
                                    {idx + 1}. {q.prompt}
                                  </p>
                                )}
                                {isMulti && q.promptZh && (
                                  <p className="example-zh">{q.promptZh}</p>
                                )}
                                <div className="listening-transcript review-listening-transcript">
                                  {q.options.map((option) => (
                                    <div
                                      key={option.label}
                                      className={`transcript-response ${option.label === q.answer ? "is-answer" : ""}`}
                                    >
                                      <p lang="en">
                                        {option.label}. {option.text}
                                        {option.label === q.answer && " ✓ 正解"}
                                      </p>
                                      {option.translation && (
                                        <p className="example-zh">
                                          {option.translation}
                                        </p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                                <div className="listening-explanation">
                                  <h3>解析</h3>
                                  <p>{q.explanation}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </details>
                      <div className="review-row-actions">
                        <button
                          type="button"
                          className="button secondary small"
                          disabled={saving}
                          aria-label={`從重要題庫移除 ${displayId}`}
                          onClick={() => removeImportantUnit(unit)}
                        >
                          {isMulti ? "移除整組" : "移除"}
                        </button>
                      </div>
                    </div>
                  );
                }

                if (unit.category === "reading" && unit.readingItems.length) {
                  const first = unit.readingItems[0];
                  const partInfo = readingPartMeta[unit.part as ReadingPart];
                  return (
                    <div className="review-item-row" key={unit.key}>
                      <details className="word-row-details review-item-details">
                        <summary className="word-row-summary review-listening-summary">
                          <span className="list-number">{displayId}</span>
                          <strong
                            className="list-word review-listening-prompt"
                            lang="en"
                          >
                            {isMulti
                              ? `${first.topic}（共 ${unit.readingItems.length} 小題）`
                              : first.prompt}
                          </strong>
                          <span className="list-pos">
                            {partInfo.badge} · {first.topic}
                          </span>
                          <span className="list-meaning">
                            {isMulti
                              ? first.prompt
                              : first.promptZh || first.explanation}
                          </span>
                          <span className="expand-icon" aria-hidden="true">
                            +
                          </span>
                        </summary>
                        <div className="word-row-content">
                          <div className="review-detail-toolbar">
                            <span className="word-source">
                              閱讀（{partInfo.shortTitle}）·{" "}
                              {displayId.toUpperCase()} · {first.topic}
                              {isMulti
                                ? ` · 共 ${unit.readingItems.length} 小題`
                                : ""}
                            </span>
                          </div>
                          {first.passage && (
                            <div
                              className="reading-passage-body review-reading-passage"
                              lang="en"
                            >
                              {first.passage}
                            </div>
                          )}
                          <div className="mock-review-sublist">
                            {unit.readingItems.map((q, idx) => (
                              <div
                                key={q.id}
                                className={
                                  isMulti ? "mock-review-subcard" : undefined
                                }
                              >
                                {isMulti && (
                                  <p className="transcript-prompt" lang="en">
                                    {idx + 1}. {q.prompt}
                                  </p>
                                )}
                                {isMulti && q.promptZh && (
                                  <p className="example-zh">{q.promptZh}</p>
                                )}
                                <div className="listening-transcript review-listening-transcript">
                                  {q.options.map((option) => (
                                    <div
                                      key={option.label}
                                      className={`transcript-response ${option.label === q.answer ? "is-answer" : ""}`}
                                    >
                                      <p lang="en">
                                        {option.label}. {option.text}
                                        {option.label === q.answer && " ✓ 正解"}
                                      </p>
                                      {option.translation && (
                                        <p className="example-zh">
                                          {option.translation}
                                        </p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                                <div className="listening-explanation">
                                  <h3>解析</h3>
                                  <p>{q.explanation}</p>
                                  {q.evidence && (
                                    <div className="reading-evidence">
                                      <strong>
                                        關鍵證據句
                                        {q.evidenceLocation
                                          ? `（${q.evidenceLocation}）`
                                          : ""}
                                        ：
                                      </strong>
                                      <blockquote lang="en">
                                        {q.evidence}
                                      </blockquote>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </details>
                      <div className="review-row-actions">
                        <button
                          type="button"
                          className="button secondary small"
                          disabled={saving}
                          aria-label={`從重要題庫移除 ${displayId}`}
                          onClick={() => removeImportantUnit(unit)}
                        >
                          {isMulti ? "移除整組" : "移除"}
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    className="review-item-row review-item-fallback"
                    key={unit.key}
                  >
                    <div className="review-fallback-title">
                      <strong>
                        {unit.category === "reading" ? "閱讀" : "聽力"}{" "}
                        {displayId}
                      </strong>
                    </div>
                    <div className="review-row-actions">
                      <button
                        type="button"
                        className="button secondary small"
                        disabled={saving}
                        aria-label={`從重要題庫移除 ${displayId}`}
                        onClick={() => removeImportantUnit(unit)}
                      >
                        移除
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {tab === "exams" && (
        <section className="study-panel progress-detail-panel">
          <div className="review-list-header">
            <div>
              <h2>模擬多益考試紀錄</h2>
              <p className="review-list-subtitle">
                保存每次聽力與閱讀正式模擬考的進度、成績、錯題與考中標記；可隨時繼續、點進去檢討或刪除紀錄。
              </p>
            </div>
            <Link to="/mock-exam" className="button primary small">
              ＋ 開始新模擬考
            </Link>
          </div>

          {examsError && (
            <ErrorNotice message={examsError} retry={() => void loadExams()} />
          )}
          {loadingExams && <Loading />}

          {!loadingExams && exams.length === 0 ? (
            <div className="empty-state">
              <p className="review-empty-note">
                目前還沒有模擬考紀錄，立即來一場 100 題限時模擬考吧！
              </p>
              <Link to="/mock-exam" className="button primary small">
                前往模擬正式考試
              </Link>
            </div>
          ) : (
            <div className="mock-history-list">
              {inProgressExams.map((exam) => (
                <div className="mock-history-card is-active" key={exam.id}>
                  <div className="mock-history-main">
                    <div className="mock-history-badges">
                      <span className={`mock-section-pill is-${exam.section}`}>
                        {exam.section === "listening"
                          ? "聽力模擬考"
                          : "閱讀模擬考"}
                      </span>
                      <span className="mock-status-pill">進行中</span>
                    </div>
                    <p className="mock-history-meta">
                      已作答 {Object.keys(exam.answers).length} /{" "}
                      {exam.total_questions} 題 · 剩餘{" "}
                      <strong>{formatCountdown(exam.remaining_seconds)}</strong>
                    </p>
                    <small className="mock-history-date">
                      上次更新：{formatDateTime(exam.updated_at)}
                    </small>
                  </div>
                  <div className="mock-history-actions">
                    <button
                      type="button"
                      className="button primary small"
                      onClick={() => navigate(`/mock-exam/${exam.id}`)}
                    >
                      繼續作答
                    </button>
                    {confirmDeleteExamId === exam.id ? (
                      <>
                        <button
                          type="button"
                          className="button danger small"
                          disabled={deletingExamId === exam.id}
                          onClick={() => void handleDeleteExam(exam.id)}
                        >
                          {deletingExamId === exam.id ? "刪除中…" : "確定刪除"}
                        </button>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => setConfirmDeleteExamId(null)}
                        >
                          取消
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="button secondary small"
                        onClick={() => setConfirmDeleteExamId(exam.id)}
                      >
                        刪除進度
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {completedExams.map((exam) => (
                <div className="mock-history-card" key={exam.id}>
                  <div className="mock-history-main">
                    <div className="mock-history-badges">
                      <span className={`mock-section-pill is-${exam.section}`}>
                        {exam.section === "listening"
                          ? "聽力模擬考"
                          : "閱讀模擬考"}
                      </span>
                      <strong className="mock-history-score">
                        {exam.scaled_score ?? "—"} <span>/ 495</span>
                      </strong>
                      <span className="mock-history-raw">
                        答對 {exam.correct_count ?? 0} / {exam.total_questions}{" "}
                        題
                      </span>
                    </div>
                    <p className="mock-history-meta">
                      錯題／未答 {exam.wrong_ids?.length ?? 0} 小題 · 考中標記{" "}
                      {exam.flagged_ids.length} 小題
                    </p>
                    {exam.part_stats && exam.part_stats.length > 0 && (
                      <div className="mock-inline-parts">
                        {exam.part_stats.map((stat) => (
                          <span key={stat.part}>
                            P{stat.part}: {stat.correct}/{stat.total}
                          </span>
                        ))}
                      </div>
                    )}
                    <small className="mock-history-date">
                      完成時間：
                      {formatDateTime(exam.completed_at || exam.updated_at)}
                    </small>
                  </div>
                  <div className="mock-history-actions">
                    <button
                      type="button"
                      className="button primary small"
                      onClick={() => navigate(`/mock-exam/${exam.id}`)}
                    >
                      檢討錯題與標記
                    </button>
                    {confirmDeleteExamId === exam.id ? (
                      <>
                        <button
                          type="button"
                          className="button danger small"
                          disabled={deletingExamId === exam.id}
                          onClick={() => void handleDeleteExam(exam.id)}
                        >
                          {deletingExamId === exam.id ? "刪除中…" : "確定刪除"}
                        </button>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => setConfirmDeleteExamId(null)}
                        >
                          取消
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="button secondary small"
                        onClick={() => setConfirmDeleteExamId(exam.id)}
                      >
                        刪除紀錄
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </section>
  );
}
