import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useProgress } from "../contexts/ProgressContext";
import { createUuid, type Category, type StudyEvent } from "../domain/types";
import { errorMessage } from "../services/api";

export function BookmarkButton({
  entryId,
  category,
  itemLabel,
  compact = false,
}: {
  entryId: string;
  category: Category;
  itemLabel?: string;
  compact?: boolean;
}) {
  const { user } = useAuth();
  const progress = useProgress();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  const [guestPrompt, setGuestPrompt] = useState(false);
  const [failed, setFailed] = useState<{
    message: string;
    event: StudyEvent;
  } | null>(null);

  const starred = progress.records.some(
    (row) => row.entry_id === entryId && row.status === "review",
  );
  const collectionName = category === "vocabulary" ? "星號單字" : "重要題庫";
  const subject = itemLabel || entryId;

  async function submitEvent(event: StudyEvent) {
    if (busy) return;
    setBusy(true);
    setFailed(null);
    try {
      await progress.submit(event);
    } catch (error) {
      setFailed({
        message: `${errorMessage(error)} 尚未確認儲存。`,
        event,
      });
    } finally {
      setBusy(false);
    }
  }

  function handleClick() {
    if (!user) {
      setGuestPrompt(true);
      return;
    }
    setGuestPrompt(false);
    void submitEvent({
      event_id: createUuid(),
      entry_id: entryId,
      kind: "card",
      rating: starred ? "unseen" : "review",
    });
  }

  return (
    <div className={`bookmark-control ${compact ? "is-compact" : ""}`}>
      <button
        type="button"
        className={`bookmark-button ${starred ? "is-starred" : ""}`}
        aria-pressed={starred}
        aria-label={
          starred
            ? `從${collectionName}移除 ${subject}`
            : `將 ${subject} 加入${collectionName}`
        }
        disabled={busy}
        onClick={handleClick}
      >
        <span aria-hidden="true">{starred ? "★" : "☆"}</span>
        <span>
          {busy
            ? "儲存中…"
            : starred
              ? `已存${collectionName}`
              : `加入${collectionName}`}
        </span>
      </button>
      {guestPrompt && (
        <span className="bookmark-inline-notice" role="status">
          請先
          <Link to="/login" state={{ from: location.pathname }}>
            登入帳號
          </Link>
          才能儲存至{collectionName}。
        </span>
      )}
      {failed && (
        <span className="bookmark-inline-notice is-error" role="alert">
          {failed.message}{" "}
          <button
            type="button"
            className="text-button"
            onClick={() => void submitEvent(failed.event)}
          >
            重試
          </button>
        </span>
      )}
    </div>
  );
}
