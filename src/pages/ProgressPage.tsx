import { useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useProgress } from "../contexts/ProgressContext";
import { legacyImport } from "../services/legacy";
import { errorMessage } from "../services/api";
import { stats } from "../domain/types";
import { ErrorNotice, Loading } from "../components/Common";
export function ProgressPage() {
  const auth = useAuth(),
    progress = useProgress(),
    location = useLocation();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState(false);
  if (auth.loading) return <Loading />;
  if (!auth.user)
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  const summary = stats(progress.records);
  async function importOld() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const payload = legacyImport(window.localStorage, auth.user!.id);
      if (!payload) setMessage("這個瀏覽器沒有可匯入的舊進度。");
      else {
        await progress.importLegacy(payload);
        setMessage("已匯入到目前帳號。原本的瀏覽器紀錄保留。");
        setConfirm(false);
      }
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
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
      <section className="study-panel import-panel">
        <h2>匯入這個瀏覽器的舊進度</h2>
        <p>
          舊版進度只存在原本使用的瀏覽器。同一網域才讀得到；更換網址時請先保留原站資料。
        </p>
        <p>
          只在這些紀錄是你本人的情況下，才匯入到{" "}
          <strong>{auth.user.email}</strong>
          。匯入不會累加重複次數，帳號既有的掌握狀態優先保留。
        </p>
        <label>
          <input
            type="checkbox"
            checked={confirm}
            onChange={(e) => setConfirm(e.target.checked)}
          />
          我確認這些是我的學習紀錄
        </label>
        <button
          className="button primary"
          disabled={busy || !confirm}
          onClick={() => void importOld()}
        >
          {busy ? "匯入中…" : "匯入到目前帳號"}
        </button>
        {error && <ErrorNotice message={error} />}{" "}
        {message && <p role="status">{message}</p>}
      </section>
      <section className="study-panel import-panel">
        <h2>待複習清單</h2>
        {!summary.review && (
          <p>先開始練習，答錯或標記不熟的題目會出現在這裡。</p>
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
                · 作答 {row.attempts} 次
              </li>
            ))}
        </ul>
      </section>
    </section>
  );
}
