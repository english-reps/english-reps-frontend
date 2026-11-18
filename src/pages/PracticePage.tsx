import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useProgress } from "../contexts/ProgressContext";
import { SpeechPlayer } from "../domain/speech.js";
import {
  choices,
  createUuid,
  definition,
  shuffle,
  type StudyEvent,
  type Word,
} from "../domain/types";
import { useCatalog } from "../services/catalog";
import { errorMessage } from "../services/api";
import { ErrorNotice, Loading, ProgressPanel } from "../components/Common";
import { WordDetails } from "../components/WordDetails";
export function PracticePage() {
  const { user } = useAuth();
  const [generation, setGeneration] = useState(0);
  const bank = useCatalog<Word>("vocabulary");
  const progress = useProgress();
  const [unit, setUnit] = useState("all"),
    [review, setReview] = useState(false),
    [quiz, setQuiz] = useState(false),
    [session, setSession] = useState<Word[] | null>(null),
    [index, setIndex] = useState(0),
    [score, setScore] = useState(0);
  function begin(only?: Word[]) {
    setGeneration((value) => value + 1);
    setSession(
      shuffle(
        only ||
          bank.entries.filter(
            (word) =>
              (unit === "all" || word.unit === Number(unit)) &&
              (!review ||
                progress.records.some(
                  (row) => row.entry_id === word.id && row.status === "review",
                )),
          ),
      ).slice(0, 10),
    );
    setIndex(0);
    setScore(0);
  }
  useEffect(() => {
    if (bank.loading || bank.error) return;
    begin();
  }, [bank.loading, bank.error, bank.entries, unit, review, quiz]); // Progress updates must not reshuffle an active round.
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
        (word) =>
          (unit === "all" || word.unit === Number(unit)) &&
          progress.records.some(
            (row) => row.entry_id === word.id && row.status === "review",
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
    unit,
    session?.length,
  ]);
  if (bank.loading) return <Loading />;
  if (bank.error)
    return <ErrorNotice message={bank.error} retry={bank.retry} />;
  if (session === null) return <Loading />;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR DAILY ENGLISH MOMENT</p>
          <h1>把單字，練成直覺。</h1>
          <p>今天，就從 10 個單字開始。</p>
        </div>
      </div>
      <div className="practice-layout">
        <div className="study-column">
          {bank.offline && (
            <ErrorNotice
              message="目前無法連線到題庫伺服器，已改用內建離線單字庫。"
              retry={bank.retry}
            />
          )}
          <div className="study-toolbar">
            <div className="mode-switch">
              <button
                className={!quiz ? "selected" : ""}
                aria-pressed={!quiz}
                onClick={() => setQuiz(false)}
              >
                單字卡
              </button>
              <button
                className={quiz ? "selected" : ""}
                aria-pressed={quiz}
                onClick={() => setQuiz(true)}
              >
                選擇測驗
              </button>
            </div>
            <button className="text-button" onClick={() => begin()}>
              ↻ 換一組單字
            </button>
          </div>
          <div className="range-bar">
            <label>
              練習範圍
              <select value={unit} onChange={(e) => setUnit(e.target.value)}>
                <option value="all">全部 1,000 字</option>
                {Array.from({ length: 20 }, (_, i) => (
                  <option value={i + 1} key={i}>
                    單元 {i + 1}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={review}
                onChange={(e) => setReview(e.target.checked)}
              />
              只練不熟的字
            </label>
          </div>
          <section className="study-panel">
            <div className="session-header">
              <span>{quiz ? "選擇測驗" : "單字卡練習"}</span>
              <span>
                {Math.min(index + 1, session.length)} / {session.length}
              </span>
            </div>
            {!session.length ? (
              <div className="empty-state">
                <h2>目前沒有符合的單字</h2>
                <p>可以選擇全部範圍，或先練習再標記不熟的字。</p>
                <button
                  className="button secondary"
                  onClick={() => {
                    setReview(false);
                    setUnit("all");
                  }}
                >
                  練習全部單字
                </button>
              </div>
            ) : index >= session.length ? (
              <div className="session-summary">
                <h2>這一組，練完了！</h2>
                <p>
                  {quiz
                    ? `答對 ${score} / ${session.length} 題`
                    : "每天一點，慢慢累積。"}
                </p>
                <button className="button primary" onClick={() => begin()}>
                  再練一組
                </button>
                <button
                  className="button secondary"
                  onClick={() =>
                    begin(
                      session.filter((word) =>
                        progress.records.some(
                          (row) =>
                            row.entry_id === word.id && row.status === "review",
                        ),
                      ),
                    )
                  }
                >
                  重練本組不熟的字
                </button>
              </div>
            ) : (
              <WordExercise
                key={`${generation}:${user?.id || "guest"}:${session[index].id}:${index}:${quiz}:${session.map((row) => row.id).join(",")}`}
                word={session[index]}
                entries={bank.entries}
                quiz={quiz}
                next={(correct) => {
                  setScore(score + Number(correct));
                  setIndex(index + 1);
                }}
              />
            )}
          </section>
        </div>
        <ProgressPanel category="vocabulary" />
      </div>
    </>
  );
}
function WordExercise({
  word,
  entries,
  quiz,
  next,
}: {
  word: Word;
  entries: Word[];
  quiz: boolean;
  next: (correct: boolean) => void;
}) {
  const { user } = useAuth();
  const progress = useProgress();
  const player = useMemo(() => {
    let synthesis, Utterance;
    try {
      synthesis = window.speechSynthesis;
      Utterance = window.SpeechSynthesisUtterance;
    } catch {}
    return new SpeechPlayer({ synthesis, Utterance });
  }, []);
  const [revealed, setRevealed] = useState(false),
    [options] = useState(() => choices(word, entries)),
    [answer, setAnswer] = useState<string | null>(null),
    [correct, setCorrect] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [speechError, setSpeechError] = useState(""),
    [pending, setPending] = useState<StudyEvent | null>(null);
  useEffect(
    () => () => {
      player.stop();
    },
    [player],
  );
  async function save(event: StudyEvent) {
    if (busy || answer !== null) return;
    setBusy(true);
    setError("");
    setPending(event);
    try {
      const result = user
        ? await progress.submit(event)
        : {
            correct: quiz
              ? event.answer === word.id
              : event.rating === "mastered",
          };
      setCorrect(Boolean(result.correct));
      setAnswer(event.answer || event.rating || "");
      setPending(null);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  function speak() {
    setSpeechError("");
    player.play(word.word, {
      onError: () => setSpeechError("此瀏覽器無法播放英語語音。"),
    });
  }
  return (
    <div className="exercise-content">
      <div className="word-heading">
        <span className="word-number">
          UNIT {word.unit} · {word.id.slice(5)}
        </span>
        <button
          className="text-button"
          onClick={speak}
          aria-label={`聽 ${word.word} 發音`}
        >
          ♪ 發音
        </button>
      </div>
      {speechError && <p role="alert">{speechError}</p>}
      <div className="word-center">
        <h2 className="main-word">{word.word}</h2>
        {!quiz && !revealed && (
          <button
            className="button secondary"
            onClick={() => setRevealed(true)}
          >
            查看解釋與例句
          </button>
        )}
      </div>
      {quiz ? (
        <div className="quiz-options">
          {options.map((option, index) => (
            <button
              key={option.id}
              className={`quiz-option ${answer !== null && option.id === word.id ? "correct" : ""} ${answer === option.id && !correct ? "incorrect" : ""}`}
              disabled={busy || answer !== null || !!pending}
              onClick={() =>
                void save({
                  event_id: createUuid(),
                  entry_id: word.id,
                  kind: "quiz",
                  answer: option.id,
                })
              }
            >
              <span className="option-letter">{"ABCD"[index]}</span>
              {definition(option)}
            </button>
          ))}
        </div>
      ) : (
        revealed && (
          <>
            <WordDetails word={word} />
            <div className="card-actions">
              <button
                className="button secondary"
                disabled={busy || answer !== null || !!pending}
                onClick={() =>
                  void save({
                    event_id: createUuid(),
                    entry_id: word.id,
                    kind: "card",
                    rating: "review",
                  })
                }
              >
                還不熟
              </button>
              <button
                className="button primary"
                disabled={busy || answer !== null || !!pending}
                onClick={() =>
                  void save({
                    event_id: createUuid(),
                    entry_id: word.id,
                    kind: "card",
                    rating: "mastered",
                  })
                }
              >
                記住了
              </button>
            </div>
          </>
        )
      )}
      {busy && <p role="status">正在儲存…</p>}
      {error && (
        <ErrorNotice
          message={`${error} 尚未確認儲存。`}
          retry={pending ? () => void save(pending) : undefined}
        />
      )}{" "}
      {answer !== null && (
        <div className="answer-feedback" role="status">
          {quiz && (
            <>
              <p className="quiz-feedback">
                {correct
                  ? "✓ 答對了！"
                  : `再練一次也沒關係，正解是「${definition(word)}」。`}
              </p>
              <WordDetails word={word} />
            </>
          )}
          <p>
            {user ? (
              "已儲存到你的帳號。"
            ) : (
              <Link to="/login">本次為訪客練習；登入以儲存進度。</Link>
            )}
          </p>
          <button className="button primary" onClick={() => next(correct)}>
            下一題 →
          </button>
        </div>
      )}
    </div>
  );
}
