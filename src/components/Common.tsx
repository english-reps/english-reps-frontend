import { Link } from "react-router-dom";
import { stats, type Category } from "../domain/types";
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
export function ProgressPanel({ category }: { category: Category }) {
  const { records, loading, error, refresh } = useProgress();
  const { user } = useAuth();
  const summary = stats(records.filter((row) => row.category === category));
  const total = category === "vocabulary" ? 1000 : 30;
  return (
    <aside className="sidebar">
      <section className="progress-panel">
        <div className="panel-heading">
          <h2>每一點進步，都算數</h2>
          <span className="tiny-label">YOUR PROGRESS</span>
        </div>
        <div className="progress-visual">
          <div
            className="progress-ring"
            style={
              {
                "--progress": `${(summary.mastered / total) * 100}%`,
              } as React.CSSProperties
            }
          >
            <div>
              <strong>
                {Math.round((summary.mastered / total) * 100)}
                <span>%</span>
              </strong>
              <small>掌握程度</small>
            </div>
          </div>
        </div>
        <div className="stats">
          <div>
            <span>已掌握</span>
            <strong>
              {summary.mastered} / {total}
            </strong>
          </div>
          <div>
            <span>待複習</span>
            <strong>{summary.review}</strong>
          </div>
          <div>
            <span>測驗正確率</span>
            <strong>
              {summary.accuracy === null ? "—" : `${summary.accuracy}%`}
            </strong>
          </div>
        </div>
        <p className="local-note">
          {user ? (
            "進度儲存在你的帳號，可跨裝置使用"
          ) : (
            <Link to="/login">登入以儲存與同步進度</Link>
          )}
        </p>
        {loading && <p role="status">正在同步進度…</p>}
        {error && <ErrorNotice message={error} retry={() => void refresh()} />}
      </section>
      <section className="note-panel">
        <p className="eyebrow">MAKE IT A HABIT</p>
        <h2>記不住，也沒關係。</h2>
        <p>每次練習 10 題，多見幾次就會慢慢熟悉。</p>
      </section>
    </aside>
  );
}
