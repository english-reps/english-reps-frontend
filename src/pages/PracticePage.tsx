import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useProgress } from "../contexts/ProgressContext";
import { SpeechPlayer } from "../domain/speech.js";
import { choices, definition, shuffle, type Word } from "../domain/types";
import { useCatalog } from "../services/catalog";
import { BookmarkButton } from "../components/BookmarkButton";
import { CollectionPanel, ErrorNotice, Loading } from "../components/Common";
import { WordDetails } from "../components/WordDetails";

export function PracticePage() {
  const { user } = useAuth();
  const [generation, setGeneration] = useState(0);
  const bank = useCatalog<Word>("vocabulary");
  const progress = useProgress();
  const [unit, setUnit] = useState("all"),
    [starredOnly, setStarredOnly] = useState(false),
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
              (!starredOnly ||
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
  }, [bank.loading, bank.error, bank.entries, unit, starredOnly, quiz]);

  useEffect(() => {
    if (
      !bank.loading &&
      starredOnly &&
      !progress.loading &&
      session !== null &&
      session.length === 0 &&
      bank.entries.length > 0
    ) {
      const hasStarred = bank.entries.some(
        (word) =>
          (unit === "all" || word.unit === Number(unit)) &&
          progress.records.some(
            (row) => row.entry_id === word.id && row.status === "review",
          ),
      );
      if (hasStarred) begin();
    }
  }, [
    bank.loading,
    starredOnly,
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

  const starredCount = progress.records.filter(
    (row) => row.category === "vocabulary" && row.status === "review",
  ).length;

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR DAILY ENGLISH MOMENT</p>
          <h1>把單字，練成直覺。</h1>
          <p>今天，就從 10 個單字開始；遇到不熟的字按 ★ 加入星號單字。</p>
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
                <option value="all">
                  全部 {bank.entries.length.toLocaleString()} 字
                </option>
                {[...new Set(bank.entries.map((word) => word.unit))]
                  .sort((a, b) => a - b)
                  .map((item) => (
                    <option value={item} key={item}>
                      單元 {item}
                    </option>
                  ))}
              </select>
            </label>
            <label className="review-toggle">
              <input
                type="checkbox"
                checked={starredOnly}
                onChange={(e) => setStarredOnly(e.target.checked)}
              />
              只練星號單字
              <span>{starredCount}</span>
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
                <p>可以選擇全部範圍，或先在練習／單字庫點擊 ★ 收藏單字。</p>
                <button
                  className="button secondary"
                  onClick={() => {
                    setStarredOnly(false);
                    setUnit("all");
                  }}
                >
                  練習全部單字
                </button>
              </div>
            ) : index >= session.length ? (
              <div className="session-summary">
                <span className="summary-seal" aria-hidden="true">
                  ✓
                </span>
                <h2>這一組，練完了！</h2>
                <p className="summary-description">
                  {quiz
                    ? `答對 ${score} / ${session.length} 題`
                    : "每天一點，慢慢累積。"}
                </p>
                <div className="summary-actions">
                  <button className="button primary" onClick={() => begin()}>
                    再練一組
                  </button>
                  <button
                    className="button secondary"
                    disabled={
                      !session.some((word) =>
                        progress.records.some(
                          (row) =>
                            row.entry_id === word.id && row.status === "review",
                        ),
                      )
                    }
                    onClick={() =>
                      begin(
                        session.filter((word) =>
                          progress.records.some(
                            (row) =>
                              row.entry_id === word.id &&
                              row.status === "review",
                          ),
                        ),
                      )
                    }
                  >
                    重練本組星號單字
                  </button>
                </div>
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
        <CollectionPanel category="vocabulary" total={bank.entries.length} />
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
    [speechError, setSpeechError] = useState("");

  useEffect(
    () => () => {
      player.stop();
    },
    [player],
  );

  function choose(optionId: string) {
    if (answer !== null) return;
    setCorrect(optionId === word.id);
    setAnswer(optionId);
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
        <div className="heading-actions">
          <BookmarkButton
            entryId={word.id}
            category="vocabulary"
            itemLabel={word.word}
            compact
          />
          <button
            className="text-button"
            onClick={speak}
            aria-label={`聽 ${word.word} 發音`}
          >
            ♪ 發音
          </button>
        </div>
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
              disabled={answer !== null}
              onClick={() => choose(option.id)}
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
              <BookmarkButton
                entryId={word.id}
                category="vocabulary"
                itemLabel={word.word}
              />
              <button
                type="button"
                className="button primary"
                onClick={() => next(true)}
              >
                下一題 →
              </button>
            </div>
          </>
        )
      )}
      {answer !== null && (
        <div className="answer-feedback" role="status">
          <p
            className={`quiz-feedback ${correct ? "is-correct" : "is-incorrect"}`}
          >
            {correct
              ? "✓ 答對了！"
              : `再練一次也沒關係，正解是「${definition(word)}」。`}
          </p>
          <WordDetails word={word} />
          <div className="feedback-actions">
            <BookmarkButton
              entryId={word.id}
              category="vocabulary"
              itemLabel={word.word}
            />
            <button
              type="button"
              className="button primary"
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
