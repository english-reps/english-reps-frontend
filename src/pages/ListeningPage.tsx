import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useProgress } from "../contexts/ProgressContext";
import {
  shuffle,
  topics,
  type Listening,
  type StudyEvent,
} from "../domain/types";
import { SpeechPlayer } from "../domain/speech.js";
import { useCatalog } from "../services/catalog";
import { errorMessage } from "../services/api";
import { ErrorNotice, Loading, ProgressPanel } from "../components/Common";
export function ListeningPage() {
  const { user } = useAuth();
  const [generation, setGeneration] = useState(0);
  const bank = useCatalog<Listening>("listening"),
    progress = useProgress();
  const [topic, setTopic] = useState("all"),
    [review, setReview] = useState(false),
    [rate, setRate] = useState(1),
    [session, setSession] = useState<Listening[]>([]),
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
    begin();
  }, [bank.entries, topic, review]);
  if (bank.loading) return <Loading />;
  if (bank.error)
    return <ErrorNotice message={bank.error} retry={bank.retry} />;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">LISTEN A LITTLE EVERY DAY</p>
          <h1>讓英文，聽進日常。</h1>
          <p>30 題自編應答練習，先聽，再回答。</p>
        </div>
      </div>
      <div className="practice-layout">
        <div className="study-column">
          <div className="study-toolbar">
            <span>PART 2 STYLE · 應答練習</span>
            <button className="text-button" onClick={() => begin()}>
              ↻ 換一組題目
            </button>
          </div>
          <div className="range-bar listening-range">
            <label>
              練習主題
              <select value={topic} onChange={(e) => setTopic(e.target.value)}>
                <option value="all">全部主題 · 30 題</option>
                {Object.entries(topics).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
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
            <label>
              <input
                type="checkbox"
                checked={review}
                onChange={(e) => setReview(e.target.checked)}
              />
              只練錯題
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
                <h2>這一組，聽完也練完了！</h2>
                <p>
                  答對 {results.filter((row) => row.correct).length} /{" "}
                  {session.length} 題
                </p>
                <button className="button primary" onClick={() => begin()}>
                  再練一組
                </button>
                <button
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
        <ProgressPanel category="listening" />
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
    [heard, setHeard] = useState(false),
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
  function play() {
    if (playing) {
      player.stop();
      setPlaying(false);
      return;
    }
    setSpeechError("");
    setPlaying(true);
    player.play(
      [
        question.prompt,
        ...question.options.map((row) => `${row.label}. ${row.text}`),
      ].join(" ... "),
      {
        rate,
        onComplete: () => {
          setPlaying(false);
          setHeard(true);
        },
        onError: () => {
          setPlaying(false);
          setSpeechError("語音播放未完成，請確認裝置音量與英語語音後重試。");
        },
      },
    );
  }
  async function save(event: StudyEvent) {
    if (!heard || playing || busy || answer !== null) return;
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
  return (
    <div className="exercise-content">
      <div className="word-heading">
        <span className="word-number">
          {question.id.toUpperCase()} · {topics[question.topic]}
        </span>
        <span>自編應答題</span>
      </div>
      <div className="listening-center">
        <div className="listening-emblem" aria-hidden="true">
          ♫
        </div>
        <p className="eyebrow">LISTEN FIRST. ANSWER NEXT.</p>
        <h2>先聽，再選出最合適的回答</h2>
        <button
          className="button primary listening-play"
          disabled={!player.supported}
          onClick={play}
        >
          {playing
            ? "■ 停止播放"
            : heard
              ? "↻ 再聽一次"
              : "▶ 播放題目與 A／B／C"}
        </button>
        <p role="status">
          {!player.supported
            ? "此瀏覽器不支援語音播放，請使用 Safari、Chrome 或 Edge。"
            : playing
              ? "播放中，請聽完整的題目與三個回答。"
              : heard
                ? "已播放完成，請選擇回答。"
                : "按下播放開始，完整聽一次後才能作答。"}
        </p>
        {speechError && <p role="alert">{speechError}</p>}
      </div>
      <div className="listening-choices" role="group" aria-label="選擇回答">
        {question.options.map((option) => (
          <button
            key={option.label}
            className={`quiz-option ${answer !== null && option.label === question.answer ? "correct" : ""} ${answer === option.label && !correct ? "incorrect" : ""}`}
            disabled={!heard || playing || busy || answer !== null || !!pending}
            onClick={() =>
              void save({
                event_id: crypto.randomUUID(),
                entry_id: question.id,
                kind: "listening",
                answer: option.label,
              })
            }
          >
            <span className="option-letter">{option.label}</span>
            {answer === null ? `回答 ${option.label}` : option.text}
          </button>
        ))}
      </div>
      {busy && <p role="status">正在儲存…</p>}
      {error && (
        <ErrorNotice
          message={`${error} 尚未確認儲存。`}
          retry={pending ? () => void save(pending) : undefined}
        />
      )}{" "}
      {answer !== null && (
        <div className="listening-feedback" role="status">
          <p className="quiz-feedback">
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
