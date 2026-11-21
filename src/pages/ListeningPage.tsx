import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useProgress } from "../contexts/ProgressContext";
import {
  buildListeningSpeechSegments,
  listeningPartMeta,
  pickGroupedSession,
  topics,
  type Listening,
  type ListeningPart,
} from "../domain/types";
import { SpeechPlayer } from "../domain/speech.js";
import { useCatalog } from "../services/catalog";
import { BookmarkButton } from "../components/BookmarkButton";
import { CollectionPanel, ErrorNotice, Loading } from "../components/Common";

function speechErrorMessage(code: string) {
  if (code === "unsupported")
    return "此瀏覽器不支援英語語音播放，已開放直接閱讀英文題目與選項作答。";
  if (code === "not-allowed")
    return "瀏覽器限制了語音播放，已解鎖作答；可確認音量與權限後重試，或顯示文字作答。";
  if (code === "not-started")
    return "語音引擎未順利啟動（可能無英文語音包或裝置處於靜音），已解鎖作答或可改看文字。";
  if (code === "network")
    return "雲端語音連線失敗，已解鎖作答；可重試播放或直接閱讀英文題目。";
  if (code === "timeout")
    return "語音播放逾時未完成，已解鎖作答；可重試播放或直接閱讀英文題目。";
  return "語音播放未完成，已解鎖作答；請確認裝置音量與英語語音後重試，或顯示文字作答。";
}

export function ListeningPage() {
  const { user } = useAuth();
  const [generation, setGeneration] = useState(0);
  const bank = useCatalog<Listening>("listening"),
    progress = useProgress();
  const [selectedPart, setSelectedPart] = useState<"all" | ListeningPart>(2),
    [topic, setTopic] = useState("all"),
    [difficulty, setDifficulty] = useState("all"),
    [starredOnly, setStarredOnly] = useState(false),
    [rate, setRate] = useState(1),
    [session, setSession] = useState<Listening[] | null>(null),
    [index, setIndex] = useState(0),
    [results, setResults] = useState<{ id: string; correct: boolean }[]>([]),
    [heardGroups, setHeardGroups] = useState<Record<string, boolean>>({});

  const partEntries = useMemo(
    () =>
      bank.entries.filter(
        (row) => selectedPart === "all" || (row.part ?? 2) === selectedPart,
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

  function begin(items?: Listening[]) {
    setGeneration((value) => value + 1);
    setSession(pickGroupedSession(items || filterPool(), 10));
    setIndex(0);
    setResults([]);
    setHeardGroups({});
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
    (record) =>
      record.category === "listening" && record.status === "review",
  ).length;

  const partCounts: Record<ListeningPart, number> = {
    1: bank.entries.filter((row) => (row.part ?? 2) === 1).length,
    2: bank.entries.filter((row) => (row.part ?? 2) === 2).length,
    3: bank.entries.filter((row) => (row.part ?? 2) === 3).length,
    4: bank.entries.filter((row) => (row.part ?? 2) === 4).length,
  };

  const currentMeta =
    selectedPart === "all"
      ? {
          badge: "PARTS 1–4",
          title: "全題型混合聽力",
          subtitle: "涵蓋圖片描述、應答問題、簡短對話與簡短獨白",
        }
      : listeningPartMeta[selectedPart];

  function selectPart(nextPart: "all" | ListeningPart) {
    setSelectedPart(nextPart);
    setTopic("all");
  }

  const currentQuestion = session[index];
  const currentGroupHeard = Boolean(
    currentQuestion?.groupId && heardGroups[currentQuestion.groupId],
  );

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">LISTEN A LITTLE EVERY DAY</p>
          <h1>讓英文，聽進日常。</h1>
          <p>
            共 {bank.entries.length.toLocaleString()}{" "}
            題多益聽力練習（Part 1–4），重要考題可按 ★ 加入重要題庫。
          </p>
        </div>
      </div>
      <div className="practice-layout">
        <div className="study-column">
          {bank.offline && (
            <ErrorNotice
              message="目前無法連線到題庫伺服器，已改用內建離線聽力題庫。"
              retry={bank.retry}
            />
          )}
          <div
            className="part-selector"
            role="tablist"
            aria-label="多益聽力 Part 選擇"
          >
            {([1, 2, 3, 4] as ListeningPart[]).map((part) => {
              const meta = listeningPartMeta[part];
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
                    {topics[key] || key}
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
            <label>
              播放速度
              <select
                value={rate}
                onChange={(e) => setRate(Number(e.target.value))}
              >
                <option value={0.8}>0.8× 慢速</option>
                <option value={1}>1× 一般</option>
                <option value={1.15}>1.15× 加速</option>
              </select>
            </label>
            <label className="review-toggle">
              <input
                type="checkbox"
                checked={starredOnly}
                onChange={(e) => setStarredOnly(e.target.checked)}
              />
              只練重要聽力
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
                <h2>這一組，聽完也練完了！</h2>
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
              <ListeningExercise
                key={`${generation}:${user?.id || "guest"}:${currentQuestion.id}:${index}:${session.map((row) => row.id).join(",")}`}
                question={currentQuestion}
                rate={rate}
                initialGroupHeard={currentGroupHeard}
                onGroupHeard={(groupId) =>
                  setHeardGroups((prev) => ({ ...prev, [groupId]: true }))
                }
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
            原創多益仿真題庫，非 ETS 官方題目；使用裝置的英語合成語音。
          </p>
        </div>
        <CollectionPanel category="listening" total={bank.entries.length} />
      </div>
    </>
  );
}

function ListeningExercise({
  question,
  rate,
  initialGroupHeard,
  onGroupHeard,
  next,
}: {
  question: Listening;
  rate: number;
  initialGroupHeard: boolean;
  onGroupHeard: (groupId: string) => void;
  next: (correct: boolean) => void;
}) {
  const qPart: ListeningPart = question.part ?? 2;
  const partInfo = listeningPartMeta[qPart];
  const isPrintedOptionsPart = qPart === 3 || qPart === 4;

  const speechData = useMemo(
    () => buildListeningSpeechSegments(question),
    [question],
  );

  const player = useMemo(() => {
    let synthesis, Utterance;
    try {
      synthesis = window.speechSynthesis;
      Utterance = window.SpeechSynthesisUtterance;
    } catch {}
    return new SpeechPlayer({ synthesis, Utterance });
  }, []);

  const [playing, setPlaying] = useState(false),
    [playState, setPlayState] = useState(""),
    [playStep, setPlayStep] = useState(0),
    [attempted, setAttempted] = useState(initialGroupHeard),
    [heard, setHeard] = useState(initialGroupHeard),
    [showText, setShowText] = useState(false),
    [speechError, setSpeechError] = useState(""),
    [answer, setAnswer] = useState<string | null>(null),
    [correct, setCorrect] = useState(false);

  useEffect(() => {
    function stop() {
      player.stop();
      setPlaying(false);
      setPlayState("");
    }
    function hidden() {
      if (document.hidden) stop();
    }
    stop();
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", stop);
    return () => {
      player.stop();
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", stop);
    };
  }, [player, rate]);

  const canAnswer =
    heard || !player.supported || Boolean(speechError) || showText;
  const showFallbackText =
    answer === null && (showText || !player.supported);

  function play() {
    if (playing) {
      player.stop();
      setPlaying(false);
      setPlayState("");
      return;
    }
    setSpeechError("");
    setAttempted(true);
    setPlayStep(0);
    setPlayState("starting");
    setPlaying(true);
    player.play(speechData.segments, {
      rate,
      onState: (state) => setPlayState(state),
      onStep: (step) => setPlayStep(step),
      onComplete: () => {
        setPlaying(false);
        setPlayState("");
        setHeard(true);
        if (question.groupId) {
          onGroupHeard(question.groupId);
        }
      },
      onError: (code) => {
        setPlaying(false);
        setPlayState("");
        setSpeechError(speechErrorMessage(code));
      },
    });
  }

  function choose(optionLabel: string) {
    if (!canAnswer || playing || answer !== null) return;
    setCorrect(optionLabel === question.answer);
    setAnswer(optionLabel);
  }

  const totalSteps = speechData.segments.length;
  const currentStepLabel = speechData.labels[playStep] || "題目";
  const optionLabelsText =
    qPart === 2 ? "A、B 或 C" : "A、B、C 或 D";
  const optionSlashText =
    qPart === 2 ? "A／B／C" : "A／B／C／D";

  const playButtonIdleLabel =
    qPart === 1
      ? "▶ 播放 A／B／C／D 四個敘述"
      : qPart === 3
        ? "▶ 播放對話與題目"
        : qPart === 4
          ? "▶ 播放獨白與題目"
          : "▶ 播放題目與 A／B／C";

  const statusText = !player.supported
    ? "此瀏覽器不支援語音播放，已自動顯示英文題目與選項供直接作答。"
    : playing
      ? playState === "starting"
        ? `正在準備英語語音（${currentStepLabel}）…`
        : `正在播放：${currentStepLabel}（${playStep + 1} / ${totalSteps}）`
      : answer !== null
        ? "可搭配下方逐字稿，再聽一次題目與回答。"
        : speechError
          ? `語音未能完整播放，可直接閱讀文字或點選 ${optionLabelsText} 作答。`
          : heard
            ? initialGroupHeard && !attempted
              ? "同組音檔已播放過，可直接作答或再聽一次。"
              : "已可作答，請選擇回答。"
            : attempted
              ? "播放已暫停，可重聽、顯示題目文字或直接選擇回答。"
              : `按下播放開始，先聽一次後選擇 ${optionLabelsText}。`;

  return (
    <div className="exercise-content">
      <div className="word-heading">
        <span className="word-number">
          {question.id.toUpperCase()} ·{" "}
          {topics[question.topic] || question.topic}
          {question.difficulty ? ` · TOEIC ${question.difficulty}+` : ""}
        </span>
        <div className="heading-actions">
          <BookmarkButton
            entryId={question.id}
            category="listening"
            itemLabel={question.id}
            compact
          />
          <span className="listening-type">
            {partInfo.shortTitle}
            {question.groupId ? ` · ${question.groupId}` : ""}
          </span>
        </div>
      </div>

      {qPart === 1 && question.image && (
        <figure className="part1-figure">
          <div className="part1-image-frame">
            <img
              src={question.image}
              alt={question.imageAlt || "Part 1 圖片描述照片"}
              className="part1-image"
            />
          </div>
          {question.imageCredit && (
            <figcaption className="part1-credit">
              Photo by{" "}
              {question.imageSource ? (
                <a
                  href={question.imageSource}
                  target="_blank"
                  rel="noreferrer"
                >
                  {question.imageCredit}
                </a>
              ) : (
                question.imageCredit
              )}{" "}
              (Pexels)
            </figcaption>
          )}
        </figure>
      )}

      <div className="listening-center">
        <div className="listening-emblem" aria-hidden="true">
          ♫
        </div>
        <p className="eyebrow">LISTEN FIRST. ANSWER NEXT.</p>
        <h2>
          {qPart === 1
            ? "看圖片，聽四句敘述選出最符合的選項"
            : qPart === 3
              ? "聽雙人對話，選出題目的最佳答案"
              : qPart === 4
                ? "聽一段獨白或公告，選出題目的最佳答案"
                : "先聽，再選出最合適的回答"}
        </h2>
        <button
          type="button"
          className="button primary listening-play"
          disabled={!player.supported}
          onClick={play}
        >
          {playing
            ? "■ 停止播放"
            : speechError
              ? "↻ 重試播放"
              : heard
                ? "↻ 再聽一次"
                : playButtonIdleLabel}
        </button>
        <p className="listening-audio-status" role="status">
          {statusText}
        </p>
        {speechError && (
          <p className="listening-error" role="alert">
            {speechError}
          </p>
        )}
        {answer === null && player.supported && (
          <div className="listening-fallback-actions">
            {playing ? (
              !canAnswer && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    player.stop();
                    setPlaying(false);
                    setPlayState("");
                    setShowText(true);
                  }}
                >
                  沒聽到聲音？停止並改看文字作答
                </button>
              )
            ) : speechError || attempted || showText ? (
              <>
                <button
                  type="button"
                  className="button secondary small"
                  onClick={() => setShowText((value) => !value)}
                >
                  {showText ? "隱藏題目文字" : "顯示題目與選項文字"}
                </button>
                {!canAnswer && (
                  <button
                    type="button"
                    className="button secondary small"
                    onClick={() => setHeard(true)}
                  >
                    直接選擇 {optionSlashText}
                  </button>
                )}
              </>
            ) : (
              !canAnswer && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setShowText(true)}
                >
                  無法播音或安靜環境？改看文字作答
                </button>
              )
            )}
          </div>
        )}
      </div>

      {isPrintedOptionsPart && (
        <div className="listening-printed-prompt">
          <span className="tiny-label">QUESTION</span>
          <p className="transcript-prompt" lang="en">
            {question.prompt}
          </p>
        </div>
      )}

      {showFallbackText && (
        <div className="listening-fallback-text" aria-label="題目與選項文字">
          {isPrintedOptionsPart && question.audioText ? (
            <p className="transcript-prompt" lang="en">
              {question.audioText}
            </p>
          ) : (
            <p className="transcript-prompt" lang="en">
              {question.prompt}
            </p>
          )}
          <ul>
            {question.options.map((row) => (
              <li key={row.label} lang="en">
                {row.label}. {row.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="listening-choices" role="group" aria-label="選擇回答">
        {question.options.map((option) => (
          <button
            type="button"
            key={option.label}
            className={`quiz-option listening-choice ${answer !== null && option.label === question.answer ? "correct" : ""} ${answer === option.label && !correct ? "incorrect" : ""}`}
            disabled={!canAnswer || playing || answer !== null}
            onClick={() => choose(option.label)}
          >
            <span className="option-letter">{option.label}</span>
            {answer === null && !isPrintedOptionsPart
              ? `回答 ${option.label}`
              : option.text}
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
      {answer === null && (
        <p className="card-hint listening-instruction">
          先完整播放一次或開啟文字題目後，即可選擇 {optionLabelsText}
          ；作答後會顯示中文逐字稿與解析。
        </p>
      )}
      {answer !== null && (
        <div className="listening-feedback" role="status">
          <p
            className={`quiz-feedback ${correct ? "is-correct" : "is-incorrect"}`}
          >
            {correct
              ? "✓ 答對了！"
              : `再聽一次也沒關係。正確答案是 ${question.answer}。`}
          </p>
          <div className="listening-transcript">
            <h3>逐字稿與中文</h3>
            {isPrintedOptionsPart && question.audioText && (
              <div className="transcript-dialogue-block">
                <p className="transcript-prompt" lang="en">
                  {question.audioText}
                </p>
                {question.audioTranslation && (
                  <p className="example-zh">{question.audioTranslation}</p>
                )}
              </div>
            )}
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
          </div>
          <div className="listening-keywords">
            {question.keywords.map((word) => (
              <span key={word}>{word}</span>
            ))}
          </div>
          <div className="feedback-actions">
            <BookmarkButton
              entryId={question.id}
              category="listening"
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
