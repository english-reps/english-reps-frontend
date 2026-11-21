import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useProgress } from "../contexts/ProgressContext";
import {
  buildListeningGroupSpeechSegments,
  groupItemsIntoUnits,
  listeningPartMeta,
  pickUnitSession,
  topics,
  type Listening,
  type ListeningPart,
  type QuestionUnit,
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
    [session, setSession] = useState<QuestionUnit<Listening>[] | null>(null),
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
              record.category === "listening" && record.status === "review",
          )
          .map((record) => record.entry_id),
      ),
    [progress.records],
  );

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

  function filterUnits(): QuestionUnit<Listening>[] {
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

  function begin(customUnits?: QuestionUnit<Listening>[]) {
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

  const partCounts: Record<ListeningPart, number> = {
    1: bank.entries.filter((row) => (row.part ?? 2) === 1).length,
    2: bank.entries.filter((row) => (row.part ?? 2) === 2).length,
    3: bank.entries.filter((row) => (row.part ?? 2) === 3).length,
    4: bank.entries.filter((row) => (row.part ?? 2) === 4).length,
  };

  const partUnitCounts: Record<ListeningPart, number> = {
    1: groupItemsIntoUnits(
      bank.entries.filter((row) => (row.part ?? 2) === 1),
    ).length,
    2: groupItemsIntoUnits(
      bank.entries.filter((row) => (row.part ?? 2) === 2),
    ).length,
    3: groupItemsIntoUnits(
      bank.entries.filter((row) => (row.part ?? 2) === 3),
    ).length,
    4: groupItemsIntoUnits(
      bank.entries.filter((row) => (row.part ?? 2) === 4),
    ).length,
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
          <p className="eyebrow">LISTEN A LITTLE EVERY DAY</p>
          <h1>讓英文，聽進日常。</h1>
          <p>
            共 {bank.entries.length.toLocaleString()}{" "}
            題多益聽力練習（Part 1–4），Part 3／4
            以整組對話同頁作答，按 ★ 即可整組加入重要題庫。
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
                  <small>
                    {part === 3 || part === 4
                      ? `${partUnitCounts[part]} 組（${partCounts[part]} 題）`
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
              <span>{starredUnitCount}</span>
            </label>
          </div>
          <section className="study-panel">
            <div className="session-header">
              <span>{currentMeta.subtitle}</span>
              <span>
                {Math.min(index + 1, session.length)} / {session.length}
                {currentUnit && currentUnit.items.length > 1
                  ? `（本組 ${currentUnit.items.length} 小題）`
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
                <h2>這一組，聽完也練完了！</h2>
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
              <ListeningUnitExercise
                key={`${generation}:${user?.id || "guest"}:${currentUnit.key}:${index}`}
                unit={currentUnit}
                rate={rate}
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
            原創多益仿真題庫，非 ETS 官方題目；使用裝置的英語合成語音。
          </p>
        </div>
        <CollectionPanel
          category="listening"
          total={bank.entries.length}
          entries={bank.entries}
        />
      </div>
    </>
  );
}

function ListeningUnitExercise({
  unit,
  rate,
  next,
}: {
  unit: QuestionUnit<Listening>;
  rate: number;
  next: (correctCount: number) => void;
}) {
  const first = unit.items[0];
  const isGroup = unit.items.length > 1;
  const qPart: ListeningPart = first.part ?? 2;
  const partInfo = listeningPartMeta[qPart];
  const isPrintedOptionsPart = qPart === 3 || qPart === 4;
  const unitIds = useMemo(() => unit.items.map((item) => item.id), [unit.items]);

  const speechData = useMemo(
    () => buildListeningGroupSpeechSegments(unit.items),
    [unit.items],
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
    [attempted, setAttempted] = useState(false),
    [heard, setHeard] = useState(false),
    [showText, setShowText] = useState(false),
    [speechError, setSpeechError] = useState(""),
    [answers, setAnswers] = useState<Record<string, string>>({}),
    [submitted, setSubmitted] = useState(false);

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

  // For Part 3 & 4 (multi-question sets), allow selecting options while/after listening like real TOEIC
  const canAnswer =
    isPrintedOptionsPart ||
    heard ||
    !player.supported ||
    Boolean(speechError) ||
    showText;
  const showFallbackText =
    !submitted && (showText || !player.supported);

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
      },
      onError: (code) => {
        setPlaying(false);
        setPlayState("");
        setSpeechError(speechErrorMessage(code));
      },
    });
  }

  function choose(questionId: string, optionLabel: string) {
    if (!canAnswer || submitted) return;
    if (!isGroup) {
      if (playing) return;
      setAnswers({ [questionId]: optionLabel });
      setSubmitted(true);
      return;
    }
    setAnswers((prev) => ({ ...prev, [questionId]: optionLabel }));
  }

  function submitGroup() {
    if (submitted) return;
    player.stop();
    setPlaying(false);
    setPlayState("");
    setSubmitted(true);
  }

  const totalSteps = speechData.segments.length;
  const currentStepLabel = speechData.labels[playStep] || "題目";
  const optionLabelsText = qPart === 2 ? "A、B 或 C" : "A、B、C 或 D";
  const optionSlashText = qPart === 2 ? "A／B／C" : "A／B／C／D";

  const playButtonIdleLabel =
    qPart === 1
      ? "▶ 播放 A／B／C／D 四個敘述"
      : qPart === 3
        ? `▶ 播放整組對話與 ${unit.items.length} 個問題`
        : qPart === 4
          ? `▶ 播放整段獨白與 ${unit.items.length} 個問題`
          : "▶ 播放題目與 A／B／C";

  const statusText = !player.supported
    ? "此瀏覽器不支援語音播放，已自動顯示英文題目與選項供直接作答。"
    : playing
      ? playState === "starting"
        ? `正在準備英語語音（${currentStepLabel}）…`
        : `正在播放：${currentStepLabel}（${playStep + 1} / ${totalSteps}）`
      : submitted
        ? "可搭配下方逐字稿，再聽一次完整內容。"
        : speechError
          ? `語音未能完整播放，可直接閱讀文字或點選 ${optionLabelsText} 作答。`
          : heard
            ? isGroup
              ? `音檔播放完畢，請完成下方全部 ${unit.items.length} 小題後送出對答案。`
              : "已可作答，請選擇回答。"
            : attempted
              ? "播放已暫停，可重聽、顯示題目文字或直接選擇回答。"
              : isGroup
                ? `按下播放收聽整段${qPart === 3 ? "對話" : "獨白"}，可邊聽邊作答下方 ${unit.items.length} 小題。`
                : `按下播放開始，先聽一次後選擇 ${optionLabelsText}。`;

  const answeredInGroup = unit.items.filter((q) => Boolean(answers[q.id])).length;
  const correctInGroup = unit.items.filter(
    (q) => answers[q.id] === q.answer,
  ).length;
  const singleCorrect = !isGroup && answers[first.id] === first.answer;

  return (
    <div className="exercise-content">
      <div className="word-heading">
        <span className="word-number">
          {(unit.groupId || first.id).toUpperCase()} ·{" "}
          {topics[first.topic] || first.topic}
          {first.difficulty ? ` · TOEIC ${first.difficulty}+` : ""}
        </span>
        <div className="heading-actions">
          <BookmarkButton
            entryIds={unitIds}
            category="listening"
            itemLabel={unit.groupId || first.id}
            compact
          />
          <span className="listening-type">
            {partInfo.shortTitle}
            {isGroup ? ` · 共 ${unit.items.length} 小題` : ""}
          </span>
        </div>
      </div>

      {qPart === 1 && first.image && (
        <figure className="part1-figure">
          <div className="part1-image-frame">
            <img
              src={first.image}
              alt={first.imageAlt || "Part 1 圖片描述照片"}
              className="part1-image"
            />
          </div>
          {first.imageCredit && (
            <figcaption className="part1-credit">
              Photo by{" "}
              {first.imageSource ? (
                <a
                  href={first.imageSource}
                  target="_blank"
                  rel="noreferrer"
                >
                  {first.imageCredit}
                </a>
              ) : (
                first.imageCredit
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
              ? `聽一段雙人對話，完成下方 ${unit.items.length} 個問題`
              : qPart === 4
                ? `聽一段獨白或公告，完成下方 ${unit.items.length} 個問題`
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
        {!submitted && player.supported && (
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
                  {showText
                    ? "隱藏逐字稿文字"
                    : isPrintedOptionsPart
                      ? "顯示對話／獨白英文文字"
                      : "顯示題目與選項文字"}
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
              <button
                type="button"
                className="text-button"
                onClick={() => setShowText(true)}
              >
                無法播音或安靜環境？改看文字作答
              </button>
            )}
          </div>
        )}
      </div>

      {showFallbackText && (
        <div className="listening-fallback-text" aria-label="題目與選項文字">
          {isPrintedOptionsPart && first.audioText ? (
            <p className="transcript-prompt" lang="en">
              {first.audioText}
            </p>
          ) : (
            <>
              <p className="transcript-prompt" lang="en">
                {first.prompt}
              </p>
              <ul>
                {first.options.map((row) => (
                  <li key={row.label} lang="en">
                    {row.label}. {row.text}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {!isGroup ? (
        <>
          <div className="listening-choices" role="group" aria-label="選擇回答">
            {first.options.map((option) => (
              <button
                type="button"
                key={option.label}
                className={`quiz-option listening-choice ${submitted && option.label === first.answer ? "correct" : ""} ${submitted && answers[first.id] === option.label && !singleCorrect ? "incorrect" : ""}`}
                disabled={!canAnswer || playing || submitted}
                onClick={() => choose(first.id, option.label)}
              >
                <span className="option-letter">{option.label}</span>
                {!submitted && !isPrintedOptionsPart
                  ? `回答 ${option.label}`
                  : option.text}
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
          {!submitted && (
            <p className="card-hint listening-instruction">
              先完整播放一次或開啟文字題目後，即可選擇 {optionLabelsText}
              ；作答後會顯示中文逐字稿與解析。
            </p>
          )}
          {submitted && (
            <div className="listening-feedback" role="status">
              <p
                className={`quiz-feedback ${singleCorrect ? "is-correct" : "is-incorrect"}`}
              >
                {singleCorrect
                  ? "✓ 答對了！"
                  : `再聽一次也沒關係。正確答案是 ${first.answer}。`}
              </p>
              <div className="listening-transcript">
                <h3>逐字稿與中文</h3>
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
              </div>
              <div className="listening-keywords">
                {first.keywords.map((word) => (
                  <span key={word}>{word}</span>
                ))}
              </div>
              <div className="feedback-actions">
                <BookmarkButton
                  entryIds={unitIds}
                  category="listening"
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
        <div className="group-questions-stack">
          {submitted && first.audioText && (
            <div className="listening-feedback group-transcript-box" role="status">
              <p
                className={`quiz-feedback ${correctInGroup === unit.items.length ? "is-correct" : "is-incorrect"}`}
              >
                本題組答對 {correctInGroup} / {unit.items.length} 小題
              </p>
              <div className="listening-transcript">
                <h3>整段逐字稿與中文</h3>
                <p className="transcript-prompt" lang="en">
                  {first.audioText}
                </p>
                {first.audioTranslation && (
                  <p className="example-zh">{first.audioTranslation}</p>
                )}
              </div>
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
                      aria-pressed={!submitted ? chosen === option.label : undefined}
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
                    <strong>解析：</strong>
                    {q.explanation}
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
                onClick={submitGroup}
              >
                送出本題組答案（對答案）
              </button>
            </div>
          ) : (
            <div className="feedback-actions group-footer-actions">
              <BookmarkButton
                entryIds={unitIds}
                category="listening"
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
      )}
    </div>
  );
}
