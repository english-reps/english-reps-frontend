import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useProgress } from "../contexts/ProgressContext";
import { createUuid, type Category, type StudyEvent } from "../domain/types";
import { errorMessage } from "../services/api";

export function BookmarkButton({
  entryId,
  entryIds,
  category,
  itemLabel,
  compact = false,
}: {
  entryId?: string;
  entryIds?: string[];
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
    events: StudyEvent[];
  } | null>(null);

  const ids = entryIds?.length
    ? [...new Set(entryIds)]
    : entryId
      ? [entryId]
      : [];
  const isGroup = ids.length > 1;
  const starred =
    ids.length > 0 &&
    ids.every((id) =>
      progress.records.some(
        (row) => row.entry_id === id && row.status === "review",
      ),
    );
  const collectionName = category === "vocabulary" ? "星號單字" : "重要題庫";
  const subject = itemLabel || ids[0] || "";

  async function submitEvents(batch: StudyEvent[]) {
    if (busy || !batch.length) return;
    setBusy(true);
    setFailed(null);
    const remaining: StudyEvent[] = [];
    let lastError: unknown = null;
    try {
      for (const event of batch) {
        try {
          await progress.submit(event);
        } catch (error) {
          lastError = error;
          remaining.push(event);
        }
      }
      if (remaining.length > 0) {
        setFailed({
          message: `${errorMessage(lastError)} 尚未確認儲存。`,
          events: remaining,
        });
      }
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
    const targetRating = starred ? "unseen" : "review";
    const batch: StudyEvent[] = ids.map((id) => ({
      event_id: createUuid(),
      entry_id: id,
      kind: "card",
      rating: targetRating,
    }));
    void submitEvents(batch);
  }

  const labelText = busy
    ? "儲存中…"
    : starred
      ? isGroup
        ? `整組已存${collectionName}`
        : `已存${collectionName}`
      : isGroup
        ? `整組加入${collectionName}`
        : `加入${collectionName}`;

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
        disabled={busy || !ids.length}
        onClick={handleClick}
      >
        <span aria-hidden="true">{starred ? "★" : "☆"}</span>
        <span>{labelText}</span>
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
            onClick={() => void submitEvents(failed.events)}
          >
            重試
          </button>
        </span>
      )}
    </div>
  );
}
