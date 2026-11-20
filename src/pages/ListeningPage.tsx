import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useProgress } from "../contexts/ProgressContext";
import {
  createUuid,
  shuffle,
  topics,
  type Listening,
  type StudyEvent,
} from "../domain/types";
import { SpeechPlayer } from "../domain/speech.js";
import { useCatalog } from "../services/catalog";
import { errorMessage } from "../services/api";
import { ErrorNotice, Loading, ProgressPanel } from "../components/Common";

const stepLabels = ["題目", "選項 A", "選項 B", "選項 C"];

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
  const [topic, setTopic] = useState("all"),
    [review, setReview] = useState(false),
    [rate, setRate] = useState(1),
    [session, setSession] = useState<Listening[] | null>(null),
    [index, setIndex] = useState(0),
    [results, setResults] = useState<{ id: string; correct: boolean }[]>([]);
  function begin(items?: Listening[]) {
    setGeneration((value) => value + 1);
    setSession(
      shuffle(
        items ||
          bank.entries.filter(
            (row) =>
              (topic === "all" || row.topic === topic) &&
              (!review ||
                progress.records.some(
                  (record) =>
                    record.entry_id === row.id && record.status === "review",
                )),
          ),
      ).slice(0, 10),
    );
    setIndex(0);
    setResults([]);
  }
  useEffect(() => {
    if (bank.loading || bank.error) return;
    begin();
  }, [bank.loading, bank.error, bank.entries, topic, review]);
  useEffect(() => {
    if (
      !bank.loading &&
      review &&
      !progress.loading &&
      session !== null &&
      session.length === 0 &&
      bank.entries.length > 0
    ) {
      const hasReview = bank.entries.some(
        (row) =>
          (topic === "all" || row.topic === topic) &&
          progress.records.some(
            (record) =>
              record.entry_id === row.id && record.status === "review",
          ),
      );
      if (hasReview) begin();
    }
  }, [
    bank.loading,
    review,
    progress.loading,
    progress.records,
    bank.entries,
    topic,
    session?.length,
  ]);
  if (bank.loading) return <Loading />;
  if (bank.error)
    return <ErrorNotice message={bank.error} retry={bank.retry} />;
  if (session === null) return <Loading />;
  const reviewCount = progress.records.filter(
    (record) =>
      record.category === "listening" && record.status === "review",
  ).length;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">LISTEN A LITTLE EVERY DAY</p>
          <h1>讓英文，聽進日常。</h1>
          <p>
            {bank.entries.length.toLocaleString()}{" "}
            題自編應答練習，先聽，再回答。
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
          <div className="study-toolbar">
            <span className="listening-section-label">
              PART 2 STYLE<span>應答練習</span>
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
                  全部主題 · {bank.entries.length.toLocaleString()} 題
                </option>
                {[
                  ...new Set([
                    ...Object.keys(topics),
                    ...bank.entries.map((row) => row.topic),
                  ]),
                ].map((key) => (
                  <option key={key} value={key}>
                    {topics[key] || key}
                  </option>
                ))}
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
                checked={review}
                onChange={(e) => setReview(e.target.checked)}
              />
              只練錯題
              <span>{reviewCount}</span>
            </label>
          </div>
          <section className="study-panel">
            <div className="session-header">
              <span>聽一句問句，選一個回答</span>
              <span>
                {Math.min(index + 1, session.length)} / {session.length}
              </span>
            </div>
            {!session.length ? (
              <div className="empty-state">
                <h2>目前沒有符合的題目</h2>
                <p>先練習，答錯的題目會加入待複習。</p>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => {
                    setTopic("all");
                    setReview(false);
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
                            (result) => result.id === row.id && !result.correct,
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
                key={`${generation}:${user?.id || "guest"}:${session[index].id}:${index}:${session.map((row) => row.id).join(",")}`}
                question={session[index]}
                rate={rate}
                next={(correct) => {
                  setResults([...results, { id: session[index].id, correct }]);
                  setIndex(index + 1);
                }}
              />
            )}
          </section>
          <p className="local-note">
            自編練習，非 ETS 官方題目；使用裝置的英語合成語音。
          </p>
        </div>
        <ProgressPanel category="listening" total={bank.entries.length} />
      </div>
    </>
  );
}
function ListeningExercise({
  question,
  rate,
  next,
}: {
  question: Listening;
  rate: number;
  next: (correct: boolean) => void;
}) {
  const { user } = useAuth(),
    progress = useProgress();
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
    [answer, setAnswer] = useState<string | null>(null),
    [correct, setCorrect] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [pending, setPending] = useState<StudyEvent | null>(null);
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
    player.play(
      [
        question.prompt,
        ...question.options.map((row) => `${row.label}. ${row.text}`),
      ],
      {
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
      },
    );
  }
  async function save(event: StudyEvent) {
    if (!canAnswer || playing || busy || answer !== null) return;
    setBusy(true);
    setError("");
    setPending(event);
    try {
      const result = user
        ? await progress.submit(event)
        : { correct: event.answer === question.answer };
      setCorrect(Boolean(result.correct));
      setAnswer(event.answer!);
      setPending(null);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  const statusText = !player.supported
    ? "此瀏覽器不支援語音播放，已自動顯示英文題目與選項供直接作答。"
    : playing
      ? playState === "starting"
        ? `正在準備英語語音（${stepLabels[playStep] || "題目"}）…`
        : `正在播放：${stepLabels[playStep] || "題目"}（${playStep + 1} / 4）`
      : answer !== null
        ? "可搭配下方逐字稿，再聽一次題目與回答。"
        : speechError
          ? "語音未能完整播放，可直接閱讀文字或點選 A、B、C 作答。"
          : heard
            ? "已可作答，請選擇回答。"
            : attempted
              ? "播放已暫停，可重聽、顯示題目文字或直接選擇回答。"
              : "按下播放開始，先聽一次後選擇 A、B 或 C。";
  return (
    <div className="exercise-content">
      <div className="word-heading">
        <span className="word-number">
          {question.id.toUpperCase()} · {topics[question.topic] || question.topic}
        </span>
        <span className="listening-type">自編應答題</span>
      </div>
      <div className="listening-center">
        <div className="listening-emblem" aria-hidden="true">
          ♫
        </div>
        <p className="eyebrow">LISTEN FIRST. ANSWER NEXT.</p>
        <h2>先聽，再選出最合適的回答</h2>
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
                : "▶ 播放題目與 A／B／C"}
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
                    直接選擇 A／B／C
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
      {showFallbackText && (
        <div className="listening-fallback-text" aria-label="題目與選項文字">
          <p className="transcript-prompt">{question.prompt}</p>
          <ul>
            {question.options.map((row) => (
              <li key={row.label}>
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
            disabled={!canAnswer || playing || busy || answer !== null || !!pending}
            onClick={() =>
              void save({
                event_id: createUuid(),
                entry_id: question.id,
                kind: "listening",
                answer: option.label,
              })
            }
          >
            <span className="option-letter">{option.label}</span>
            {answer === null ? `回答 ${option.label}` : option.text}
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
          先完整播放一次或開啟文字題目後，即可選擇 A、B 或 C；作答後會顯示中文逐字稿與解析。
        </p>
      )}
      {busy && <p role="status">正在儲存…</p>}
      {error && (
        <ErrorNotice
          message={`${error} 尚未確認儲存。`}
          retry={pending ? () => void save(pending) : undefined}
        />
      )}{" "}
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
            <p className="transcript-prompt">{question.prompt}</p>
            <p className="example-zh">{question.promptZh}</p>
            {question.options.map((row) => (
              <div
                key={row.label}
                className={`transcript-response ${row.label === question.answer ? "is-answer" : ""}`}
              >
                <p>
                  {row.label}. {row.text}
                </p>
                <p className="example-zh">{row.translation}</p>
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
          <p>
            {user ? (
              "已儲存到你的帳號。"
            ) : (
              <Link to="/login">登入以儲存進度</Link>
            )}
          </p>
          <button
            type="button"
            className="button primary next-button"
            onClick={() => next(correct)}
          >
            下一題 →
          </button>
        </div>
      )}
    </div>
  );
}
