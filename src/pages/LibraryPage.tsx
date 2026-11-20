import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useProgress } from "../contexts/ProgressContext";
import { useCatalog } from "../services/catalog";
import { errorMessage } from "../services/api";
import {
  createUuid,
  definition,
  type StudyEvent,
  type Word,
} from "../domain/types";
import { ErrorNotice, Loading } from "../components/Common";
import { WordDetails } from "../components/WordDetails";
export function LibraryPage() {
  const auth = useAuth();
  const progress = useProgress();
  const bank = useCatalog<Word>("vocabulary");
  const [query, setQuery] = useState(""),
    [unit, setUnit] = useState("all"),
    [pos, setPos] = useState("all"),
    [starredOnly, setStarredOnly] = useState(false),
    [page, setPage] = useState(0),
    [pendingIds, setPendingIds] = useState<Record<string, boolean>>({}),
    [loginPrompt, setLoginPrompt] = useState(false),
    [saveError, setSaveError] = useState<{
      message: string;
      event: StudyEvent;
    } | null>(null);
  const starredIds = new Set(
    progress.records
      .filter((row) => row.category === "vocabulary" && row.status === "review")
      .map((row) => row.entry_id),
  );
  const result = bank.entries.filter(
    (word) =>
      (unit === "all" || word.unit === Number(unit)) &&
      (pos === "all" || word.senses.some((sense) => sense.pos === pos)) &&
      (!starredOnly || starredIds.has(word.id)) &&
      `${word.word} ${definition(word)}`
        .toLowerCase()
        .includes(query.toLowerCase().trim()),
  );
  const totalPages = Math.max(1, Math.ceil(result.length / 20));
  const currentPage = Math.min(page, totalPages - 1);
  async function submitStarEvent(event: StudyEvent) {
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
  function toggleStar(word: Word) {
    if (!auth.user) {
      setLoginPrompt(true);
      return;
    }
    setLoginPrompt(false);
    const starred = starredIds.has(word.id);
    void submitStarEvent({
      event_id: createUuid(),
      entry_id: word.id,
      kind: "card",
      rating: starred ? "unseen" : "review",
    });
  }
  if (bank.loading) return <Loading />;
  if (bank.error)
    return <ErrorNotice message={bank.error} retry={bank.retry} />;
  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR WORD COLLECTION</p>
          <h1>單字庫</h1>
          <p>
            {bank.entries.length.toLocaleString()}{" "}
            個多益單字，隨時查找，也能按星號存下不熟的單字。
          </p>
        </div>
      </div>
      {bank.offline && (
        <ErrorNotice
          message="目前無法連線到題庫伺服器，已改用內建離線單字庫。"
          retry={bank.retry}
        />
      )}
      <div className="library-toolbar">
        <label>
          搜尋單字或中文
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <label>
          單元
          <select
            value={unit}
            onChange={(e) => {
              setUnit(e.target.value);
              setPage(0);
            }}
          >
            <option value="all">全部單元</option>
            {[...new Set(bank.entries.map((word) => word.unit))]
              .sort((a, b) => a - b)
              .map((item) => (
                <option key={item} value={item}>
                  單元 {item}
                </option>
              ))}
          </select>
        </label>
        <label>
          詞性
          <select
            value={pos}
            onChange={(e) => {
              setPos(e.target.value);
              setPage(0);
            }}
          >
            <option value="all">全部詞性</option>
            {[
              ...new Set(
                bank.entries.flatMap((word) =>
                  word.senses.map((sense) => sense.pos),
                ),
              ),
            ]
              .sort()
              .map((pos) => (
                <option key={pos}>{pos}</option>
              ))}
          </select>
        </label>
        <label className="review-toggle library-star-filter">
          <input
            type="checkbox"
            checked={starredOnly}
            onChange={(e) => {
              setStarredOnly(e.target.checked);
              setPage(0);
            }}
          />
          只看星號單字
          <span>{starredIds.size}</span>
        </label>
      </div>
      {!auth.user && loginPrompt && (
        <div className="notice library-auth-notice" role="alert">
          請先登入帳號，才能將不熟的單字存進資料庫。{" "}
          <Link className="text-button" to="/login" state={{ from: "/library" }}>
            前往登入 / 註冊
          </Link>
        </div>
      )}
      {saveError && (
        <ErrorNotice
          message={saveError.message}
          retry={() => void submitStarEvent(saveError.event)}
        />
      )}
      <p role="status">找到 {result.length.toLocaleString()} 個單字</p>
      <div className="study-panel word-list">
        {result.slice(currentPage * 20, currentPage * 20 + 20).map((word) => {
          const starred = starredIds.has(word.id);
          const saving = Boolean(pendingIds[word.id]);
          return (
            <div
              className={`word-row ${starred ? "is-starred" : ""}`}
              key={word.id}
            >
              <button
                type="button"
                className={`word-star-button ${starred ? "is-starred" : ""}`}
                aria-label={
                  starred
                    ? `取消標記 ${word.word} 為不熟`
                    : `標記 ${word.word} 為不熟`
                }
                aria-pressed={starred}
                title={
                  starred
                    ? "已標記為不熟（點擊取消）"
                    : "存下不熟的單字（點擊標記 ★）"
                }
                disabled={saving}
                onClick={() => toggleStar(word)}
              >
                {starred ? "★" : "☆"}
              </button>
              <details className="word-row-details">
                <summary className="word-row-summary">
                  <span className="list-number">
                    {word.id.replace(/^word-/, "")}
                  </span>
                  <strong className="list-word" lang="en">
                    {word.word}
                  </strong>
                  <span className="list-pos">
                    {[...new Set(word.senses.map((sense) => sense.pos))].join(
                      " / ",
                    )}
                  </span>
                  <span className="list-meaning">{definition(word)}</span>
                  <span className="expand-icon" aria-hidden="true">
                    +
                  </span>
                </summary>
                <div className="word-row-content">
                  <WordDetails word={word} />
                  <p className="word-source">
                    原始表第 {word.page} 頁 · 單元 {word.unit}
                  </p>
                </div>
              </details>
            </div>
          );
        })}
        {!result.length && (
          <p className="empty-state">
            {starredOnly ? (
              !auth.user ? (
                <>
                  登入帳號後即可標記並篩選不熟的單字。{" "}
                  <Link
                    className="text-button"
                    to="/login"
                    state={{ from: "/library" }}
                  >
                    前往登入 / 註冊
                  </Link>
                </>
              ) : starredIds.size === 0 ? (
                "目前還沒有標記為不熟的單字，點擊單字左側的 ☆ 即可加入。"
              ) : (
                "沒有找到符合的星號單字。"
              )
            ) : (
              "沒有找到符合的單字。"
            )}
          </p>
        )}
      </div>
      <div className="pagination">
        <button
          className="button secondary"
          disabled={currentPage === 0}
          onClick={() => setPage(currentPage - 1)}
        >
          上一頁
        </button>
        <span>
          {currentPage + 1} / {totalPages}
        </span>
        <button
          className="button secondary"
          disabled={currentPage + 1 >= totalPages}
          onClick={() => setPage(currentPage + 1)}
        >
          下一頁
        </button>
      </div>
    </section>
  );
}
