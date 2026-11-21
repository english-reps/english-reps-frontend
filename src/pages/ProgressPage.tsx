import { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useProgress } from "../contexts/ProgressContext";
import { SpeechPlayer } from "../domain/speech.js";
import {
  buildListeningSpeechSegments,
  createUuid,
  definition,
  listeningPartMeta,
  readingPartMeta,
  stats,
  topics,
  type Listening,
  type Progress,
  type Reading,
  type Status,
  type StudyEvent,
  type Word,
} from "../domain/types";
import { errorMessage } from "../services/api";
import { useCatalog } from "../services/catalog";
import { ErrorNotice, Loading } from "../components/Common";
import { WordDetails } from "../components/WordDetails";

export function ProgressPage() {
  const auth = useAuth(),
    progress = useProgress(),
    location = useLocation();
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
  const [pendingIds, setPendingIds] = useState<Record<string, boolean>>({}),
    [speechError, setSpeechError] = useState(""),
    [saveError, setSaveError] = useState<{
      message: string;
      event: StudyEvent;
    } | null>(null);
  useEffect(
    () => () => {
      player.stop();
    },
    [player],
  );
  if (auth.loading) return <Loading />;
  if (!auth.user)
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  const summary = stats(progress.records);
  const wordsById = new Map(vocabBank.entries.map((word) => [word.id, word]));
  const listeningById = new Map(
    listeningBank.entries.map((item) => [item.id, item]),
  );
  const readingById = new Map(
    readingBank.entries.map((item) => [item.id, item]),
  );
  const reviewRows = progress.records.filter((row) => row.status === "review");
  async function submitReviewEvent(event: StudyEvent) {
    if (pendingIds[event.entry_id]) return;
    setPendingIds((previous) => ({ ...previous, [event.entry_id]: true }));
    setSaveError(null);
    try {
      await progress.submit(event);
    } catch (error) {
      setSaveError({
        message: `${errorMessage(error)} 尚未確認儲存。`,
        event,
      });
    } finally {
      setPendingIds((previous) => {
        const next = { ...previous };
        delete next[event.entry_id];
        return next;
      });
    }
  }
  function updateReviewStatus(row: Progress, rating: Status) {
    void submitReviewEvent({
      event_id: createUuid(),
      entry_id: row.entry_id,
      kind: "card",
      rating,
    });
  }
  function speak(text: string | string[]) {
    setSpeechError("");
    player.play(text, {
      onError: () => setSpeechError("此瀏覽器無法播放英語語音。"),
    });
  }
  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR PROGRESS, EVERYWHERE.</p>
          <h1>我的學習進度</h1>
          <p>{auth.user.email}</p>
        </div>
        <button
          className="button secondary"
          disabled={progress.loading}
          onClick={() => void progress.refresh()}
        >
          更新進度
        </button>
      </div>
      {progress.error && (
        <ErrorNotice
          message={progress.error}
          retry={() => void progress.refresh()}
        />
      )}
      <div className="progress-cards">
        <section className="progress-panel">
          <h2>已掌握</h2>
          <strong>{summary.mastered}</strong>
          <p>個單字、聽力與閱讀題</p>
        </section>
        <section className="progress-panel">
          <h2>待複習</h2>
          <strong>{summary.review}</strong>
          <p>個單字、聽力與閱讀題</p>
        </section>
        <section className="progress-panel">
          <h2>測驗正確率</h2>
          <strong>
            {summary.accuracy === null ? "—" : `${summary.accuracy}%`}
          </strong>
          <p>累計 {summary.attempts} 次作答</p>
        </section>
      </div>
      <section className="study-panel progress-detail-panel">
        <div className="review-list-header">
          <div>
            <h2>待複習清單</h2>
            <p className="review-list-subtitle">
              點擊題目即可展開看例句、聽發音與解析；熟悉後可標記「已記住」或直接從清單移除。
            </p>
          </div>
          <span className="review-count-badge">{reviewRows.length} 題</span>
        </div>
        {saveError && (
          <ErrorNotice
            message={saveError.message}
            retry={() => void submitReviewEvent(saveError.event)}
          />
        )}
        {speechError && <p role="alert">{speechError}</p>}
        {!reviewRows.length ? (
          <p className="review-empty-note">
            先開始練習，或在單字庫點擊 ★ 標記不熟的題目，都會出現在這裡。
          </p>
        ) : (
          <div className="word-list review-list">
            {reviewRows.map((row) => {
              const saving = Boolean(pendingIds[row.entry_id]);
              const word = wordsById.get(row.entry_id);
              const question = listeningById.get(row.entry_id);
              const readingItem = readingById.get(row.entry_id);
              const metaText =
                row.attempts > 0
                  ? `作答 ${row.attempts} 次（答對 ${row.correct} 次）`
                  : "已標記為不熟";
              if (row.category === "vocabulary" && word) {
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
                        <span className="list-meaning">
                          {definition(word)}
                          <small className="review-item-meta">
                            {" "}
                            · {metaText}
                          </small>
                        </span>
                        <span className="expand-icon" aria-hidden="true">
                          +
                        </span>
                      </summary>
                      <div className="word-row-content">
                        <div className="review-detail-toolbar">
                          <span className="word-source">
                            單字 · 原始表第 {word.page} 頁 · 單元 {word.unit} ·{" "}
                            {metaText}
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
                        className="button primary small"
                        disabled={saving}
                        aria-label={`將 ${word.word} 標記為已記住`}
                        onClick={() => updateReviewStatus(row, "mastered")}
                      >
                        已記住
                      </button>
                      <button
                        type="button"
                        className="button secondary small"
                        disabled={saving}
                        aria-label={`從待複習移除 ${word.word}`}
                        onClick={() => updateReviewStatus(row, "unseen")}
                      >
                        移除
                      </button>
                    </div>
                  </div>
                );
              }
              if (row.category === "listening" && question) {
                const qPart = question.part ?? 2;
                const partInfo = listeningPartMeta[qPart];
                return (
                  <div className="review-item-row" key={row.entry_id}>
                    <details className="word-row-details review-item-details">
                      <summary className="word-row-summary review-listening-summary">
                        <span className="list-number">
                          {question.id.replace(/^listen-/, "L")}
                        </span>
                        <strong
                          className="list-word review-listening-prompt"
                          lang="en"
                        >
                          {question.prompt}
                        </strong>
                        <span className="list-pos">
                          {partInfo.badge} ·{" "}
                          {topics[question.topic] || question.topic}
                        </span>
                        <span className="list-meaning">
                          {question.promptZh ||
                            question.audioTranslation ||
                            question.explanation}
                          <small className="review-item-meta">
                            {" "}
                            · {metaText}
                          </small>
                        </span>
                        <span className="expand-icon" aria-hidden="true">
                          +
                        </span>
                      </summary>
                      <div className="word-row-content">
                        <div className="review-detail-toolbar">
                          <span className="word-source">
                            聽力題（{partInfo.shortTitle}）·{" "}
                            {question.id.toUpperCase()} ·{" "}
                            {topics[question.topic] || question.topic} ·{" "}
                            {metaText}
                          </span>
                          <button
                            type="button"
                            className="audio-button"
                            onClick={() =>
                              speak(
                                buildListeningSpeechSegments(question).segments,
                              )
                            }
                            aria-label={`播放 ${question.id} 題目與選項`}
                          >
                            ♪ 播放題目
                          </button>
                        </div>
                        {qPart === 1 && question.image && (
                          <div className="part1-image-frame review-part1-image">
                            <img
                              src={question.image}
                              alt={question.imageAlt || "Part 1 圖片描述照片"}
                              className="part1-image"
                            />
                          </div>
                        )}
                        <div className="listening-transcript review-listening-transcript">
                          {(qPart === 3 || qPart === 4) &&
                            question.audioText && (
                              <div className="transcript-dialogue-block">
                                <p className="transcript-prompt" lang="en">
                                  {question.audioText}
                                </p>
                                {question.audioTranslation && (
                                  <p className="example-zh">
                                    {question.audioTranslation}
                                  </p>
                                )}
                              </div>
                            )}
                          {question.options.map((option) => (
                            <div
                              key={option.label}
                              className={`transcript-response ${option.label === question.answer ? "is-answer" : ""}`}
                            >
                              <p lang="en">
                                {option.label}. {option.text}
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
                          <p>{question.explanation}</p>
                        </div>
                      </div>
                    </details>
                    <div className="review-row-actions">
                      <button
                        type="button"
                        className="button primary small"
                        disabled={saving}
                        aria-label={`將 ${question.id} 標記為已記住`}
                        onClick={() => updateReviewStatus(row, "mastered")}
                      >
                        已記住
                      </button>
                      <button
                        type="button"
                        className="button secondary small"
                        disabled={saving}
                        aria-label={`從待複習移除 ${question.id}`}
                        onClick={() => updateReviewStatus(row, "unseen")}
                      >
                        移除
                      </button>
                    </div>
                  </div>
                );
              }
              if (row.category === "reading" && readingItem) {
                const partInfo = readingPartMeta[readingItem.part];
                return (
                  <div className="review-item-row" key={row.entry_id}>
                    <details className="word-row-details review-item-details">
                      <summary className="word-row-summary review-listening-summary">
                        <span className="list-number">{readingItem.id}</span>
                        <strong
                          className="list-word review-listening-prompt"
                          lang="en"
                        >
                          {readingItem.prompt}
                        </strong>
                        <span className="list-pos">
                          {partInfo.badge} · {readingItem.topic}
                        </span>
                        <span className="list-meaning">
                          {readingItem.promptZh || readingItem.explanation}
                          <small className="review-item-meta">
                            {" "}
                            · {metaText}
                          </small>
                        </span>
                        <span className="expand-icon" aria-hidden="true">
                          +
                        </span>
                      </summary>
                      <div className="word-row-content">
                        <div className="review-detail-toolbar">
                          <span className="word-source">
                            閱讀題（{partInfo.shortTitle}）·{" "}
                            {readingItem.id.toUpperCase()} · {readingItem.topic}{" "}
                            · {metaText}
                          </span>
                        </div>
                        {readingItem.passage && (
                          <div
                            className="reading-passage-body review-reading-passage"
                            lang="en"
                          >
                            {readingItem.passage}
                          </div>
                        )}
                        <div className="listening-transcript review-listening-transcript">
                          {readingItem.options.map((option) => (
                            <div
                              key={option.label}
                              className={`transcript-response ${option.label === readingItem.answer ? "is-answer" : ""}`}
                            >
                              <p lang="en">
                                {option.label}. {option.text}
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
                          <p>{readingItem.explanation}</p>
                        </div>
                      </div>
                    </details>
                    <div className="review-row-actions">
                      <button
                        type="button"
                        className="button primary small"
                        disabled={saving}
                        aria-label={`將 ${readingItem.id} 標記為已記住`}
                        onClick={() => updateReviewStatus(row, "mastered")}
                      >
                        已記住
                      </button>
                      <button
                        type="button"
                        className="button secondary small"
                        disabled={saving}
                        aria-label={`從待複習移除 ${readingItem.id}`}
                        onClick={() => updateReviewStatus(row, "unseen")}
                      >
                        移除
                      </button>
                    </div>
                  </div>
                );
              }
              return (
                <div
                  className="review-item-row review-item-fallback"
                  key={row.entry_id}
                >
                  <div className="review-fallback-title">
                    <strong>
                      {row.category === "vocabulary"
                        ? "單字"
                        : row.category === "reading"
                          ? "閱讀"
                          : "聽力"}{" "}
                      {row.entry_id}
                    </strong>
                    <span className="review-item-meta"> · {metaText}</span>
                  </div>
                  <div className="review-row-actions">
                    <button
                      type="button"
                      className="button primary small"
                      disabled={saving}
                      aria-label={`將 ${row.entry_id} 標記為已記住`}
                      onClick={() => updateReviewStatus(row, "mastered")}
                    >
                      已記住
                    </button>
                    <button
                      type="button"
                      className="button secondary small"
                      disabled={saving}
                      aria-label={`從待複習移除 ${row.entry_id}`}
                      onClick={() => updateReviewStatus(row, "unseen")}
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
    </section>
  );
}
