import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useProgress } from "../contexts/ProgressContext";
import { stats } from "../domain/types";
import { ErrorNotice, Loading } from "../components/Common";
export function ProgressPage() {
  const auth = useAuth(),
    progress = useProgress(),
    location = useLocation();
  if (auth.loading) return <Loading />;
  if (!auth.user)
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  const summary = stats(progress.records);
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
          <p>個單字與聽力題</p>
        </section>
        <section className="progress-panel">
          <h2>待複習</h2>
          <strong>{summary.review}</strong>
          <p>個單字與聽力題</p>
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
        <h2>待複習清單</h2>
        {!summary.review && (
          <p>先開始練習，或在單字庫點擊 ★ 標記不熟的題目，都會出現在這裡。</p>
        )}
        <ul>
          {progress.records
            .filter((row) => row.status === "review")
            .map((row) => (
              <li key={row.entry_id}>
                <Link
                  to={
                    row.category === "vocabulary" ? "/practice" : "/listening"
                  }
                >
                  {row.category === "vocabulary" ? "單字" : "聽力"}{" "}
                  {row.entry_id}
                </Link>{" "}
                ·{" "}
                {row.attempts > 0 ? `作答 ${row.attempts} 次` : "已標記為不熟"}
              </li>
            ))}
        </ul>
      </section>
    </section>
  );
}
