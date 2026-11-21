import { Link } from "react-router-dom";
import type { Category } from "../domain/types";
import { useProgress } from "../contexts/ProgressContext";
import { useAuth } from "../contexts/AuthContext";

export function ErrorNotice({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="notice" role="alert">
      {message}{" "}
      {retry && (
        <button className="text-button" onClick={retry}>
          重試
        </button>
      )}
    </div>
  );
}

export function Loading() {
  return (
    <p className="loading" role="status">
      正在準備練習…
    </p>
  );
}

export function CollectionPanel({
  category,
  total,
}: {
  category: Category;
  total?: number;
}) {
  const { records, loading, error, refresh } = useProgress();
  const { user } = useAuth();
  const starredVocab = records.filter(
    (row) => row.category === "vocabulary" && row.status === "review",
  ).length;
  const starredListening = records.filter(
    (row) => row.category === "listening" && row.status === "review",
  ).length;
  const starredReading = records.filter(
    (row) => row.category === "reading" && row.status === "review",
  ).length;
  const isVocab = category === "vocabulary";
  const currentCount = isVocab
    ? starredVocab
    : category === "listening"
      ? starredListening
      : starredReading;
  const totalBankCount =
    total ??
    (category === "vocabulary" ? 1000 : category === "reading" ? 805 : 332);

  return (
    <aside className="sidebar">
      <section className="progress-panel collection-summary-panel">
        <div className="panel-heading">
          <h2>{isVocab ? "星號單字本" : "重要題庫收藏"}</h2>
          <span className="tiny-label">BOOKMARKS</span>
        </div>
        <div className="collection-highlight">
          <strong>{currentCount}</strong>
          <span>
            {isVocab
              ? "個已加星號的單字"
              : category === "listening"
                ? "題已存重要聽力題"
                : "題已存重要閱讀題"}
          </span>
        </div>
        <div className="stats collection-stats">
          <div>
            <span>目前題庫</span>
            <strong>{totalBankCount.toLocaleString()}</strong>
          </div>
          <div>
            <span>星號單字</span>
            <strong>{starredVocab}</strong>
          </div>
          <div>
            <span>重要聽讀</span>
            <strong>{starredListening + starredReading}</strong>
          </div>
        </div>
        <div className="collection-links">
          <Link
            to={isVocab ? "/progress?tab=words" : "/progress?tab=questions"}
            className="button secondary small"
          >
            前往{isVocab ? "星號單字清單" : "重要題庫清單"}
          </Link>
          <Link to="/mock-exam" className="button primary small">
            模擬多益正式考試
          </Link>
        </div>
        <p className="local-note">
          {user ? (
            "點擊 ★ 即可主動收藏，不會自動加入答錯題目。"
          ) : (
            <Link to="/login">登入以跨裝置儲存星號與模考紀錄</Link>
          )}
        </p>
        {loading && <p role="status">正在同步收藏…</p>}
        {error && <ErrorNotice message={error} retry={() => void refresh()} />}
      </section>
      <section className="note-panel">
        <p className="eyebrow">ACTIVE CURATION</p>
        <h2>只留你真正想複習的。</h2>
        <p>練習遇到不熟的單字或關鍵考題時按下 ★，集中到個人清單反覆精練。</p>
      </section>
    </aside>
  );
}
