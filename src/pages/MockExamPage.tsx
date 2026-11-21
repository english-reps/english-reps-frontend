import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { SpeechPlayer } from "../domain/speech.js";
import {
  accentForMockKey,
  buildListeningGroupSpeechSegments,
  buildLocalMockExam,
  formatCountdown,
  gradeLocalMockExam,
  listeningPartMeta,
  readingPartMeta,
  topics,
  type Listening,
  type ListeningPart,
  type MockExam,
  type MockSection,
  type Reading,
  type ReadingPart,
} from "../domain/types";
import { errorMessage } from "../services/api";
import { useCatalog } from "../services/catalog";
import {
  createMockExam,
  deleteMockExam,
  listMockExams,
  submitMockExam,
  updateMockExam,
  type MockExamPatch,
} from "../services/mockExams";
import { BookmarkButton } from "../components/BookmarkButton";
import { ErrorNotice, Loading } from "../components/Common";

const GUEST_STORAGE_KEY = "english-reps:guest-mock-exams";

interface ExamUnit {
  key: string;
  groupId: string | null;
  part: number;
  startIndex: number;
  endIndex: number;
  questionIds: string[];
  listeningItems: Listening[];
  readingItems: Reading[];
}

function buildExamUnits(
  exam: MockExam,
  listeningById: Map<string, Listening>,
  readingById: Map<string, Reading>,
): ExamUnit[] {
  const units: ExamUnit[] = [];
  for (let idx = 0; idx < exam.question_ids.length; idx++) {
    const id = exam.question_ids[idx];
    const listeningItem =
      exam.section === "listening" ? listeningById.get(id) : undefined;
    const readingItem =
      exam.section === "reading" ? readingById.get(id) : undefined;
    const item = listeningItem || readingItem;
    const gid = item?.groupId || null;
    const part = item?.part ?? (exam.section === "listening" ? 2 : 5);
    const prev = units[units.length - 1];
    if (gid && prev && prev.groupId === gid) {
      prev.endIndex = idx;
      prev.questionIds.push(id);
      if (listeningItem) prev.listeningItems.push(listeningItem);
      if (readingItem) prev.readingItems.push(readingItem);
    } else {
      units.push({
        key: gid || id,
        groupId: gid,
        part,
        startIndex: idx,
        endIndex: idx,
        questionIds: [id],
        listeningItems: listeningItem ? [listeningItem] : [],
        readingItems: readingItem ? [readingItem] : [],
      });
    }
  }
  return units;
}

function questionRangeLabel(unit: ExamUnit): string {
  return unit.startIndex === unit.endIndex
    ? `第 ${unit.startIndex + 1} 題`
    : `第 ${unit.startIndex + 1}–${unit.endIndex + 1} 題`;
}

function loadGuestExams(): MockExam[] {
  try {
    const raw = sessionStorage.getItem(GUEST_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as MockExam[]) : [];
  } catch {
    return [];
  }
}

function saveGuestExams(exams: MockExam[]) {
  try {
    sessionStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(exams));
  } catch {}
}

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("zh-TW", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function partBadgeLabel(section: MockSection, part: number): string {
  if (section === "listening") {
    const meta = listeningPartMeta[part as ListeningPart];
    return meta ? meta.shortTitle : `Part ${part}`;
  }
  const meta = readingPartMeta[part as ReadingPart];
  return meta ? meta.shortTitle : `Part ${part}`;
}

export function MockExamPage() {
  const { user } = useAuth();
  const { examId } = useParams<{ examId?: string }>();
  const navigate = useNavigate();
  const listeningBank = useCatalog<Listening>("listening");
  const readingBank = useCatalog<Reading>("reading");

  const [exams, setExams] = useState<MockExam[]>([]);
  const [loadingExams, setLoadingExams] = useState(true);
  const [error, setError] = useState("");
  const [creatingSection, setCreatingSection] = useState<MockSection | null>(
    null,
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setError("");
    if (!user) {
      setExams(loadGuestExams());
      setLoadingExams(false);
      return;
    }
    setLoadingExams(true);
    try {
      const list = await listMockExams();
      setExams(list);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoadingExams(false);
    }
  }, [user]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const listeningById = useMemo(
    () => new Map(listeningBank.entries.map((item) => [item.id, item])),
    [listeningBank.entries],
  );
  const readingById = useMemo(
    () => new Map(readingBank.entries.map((item) => [item.id, item])),
    [readingBank.entries],
  );

  const catalogLoading = listeningBank.loading || readingBank.loading;
  const catalogError = listeningBank.error || readingBank.error;

  const upsertExam = useCallback(
    (updated: MockExam) => {
      setExams((prev) => {
        const next = [
          updated,
          ...prev.filter((item) => item.id !== updated.id),
        ];
        if (!user) saveGuestExams(next);
        return next;
      });
    },
    [user],
  );

  const removeExamLocally = useCallback(
    (id: string) => {
      setExams((prev) => {
        const next = prev.filter((item) => item.id !== id);
        if (!user) saveGuestExams(next);
        return next;
      });
    },
    [user],
  );

  async function handleStart(section: MockSection) {
    if (creatingSection) return;
    setCreatingSection(section);
    setError("");
    try {
      let created: MockExam;
      if (user) {
        created = await createMockExam(section);
      } else {
        created = buildLocalMockExam(
          section,
          listeningBank.entries,
          readingBank.entries,
        );
      }
      upsertExam(created);
      navigate(`/mock-exam/${created.id}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCreatingSection(null);
    }
  }

  async function handleDelete(id: string) {
    if (deletingId) return;
    setDeletingId(id);
    setError("");
    try {
      if (user) {
        await deleteMockExam(id);
      }
      removeExamLocally(id);
      setConfirmDeleteId(null);
      if (examId === id) {
        navigate("/mock-exam", { replace: true });
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setDeletingId(null);
    }
  }

  if (catalogLoading || loadingExams) return <Loading />;
  if (catalogError) {
    return (
      <ErrorNotice
        message={catalogError}
        retry={() => {
          listeningBank.retry();
          readingBank.retry();
        }}
      />
    );
  }

  if (examId) {
    const active = exams.find((item) => item.id === examId);
    if (!active) {
      return (
        <section className="empty-state">
          <h1>找不到這場模擬測驗</h1>
          <p>這筆測驗進度可能已被刪除，或屬於另一個帳號。</p>
          <Link to="/mock-exam" className="button primary">
            回到模擬測驗首頁
          </Link>
        </section>
      );
    }
    if (active.status === "in_progress") {
      return (
        <MockExamRunner
          key={active.id}
          exam={active}
          isSignedIn={Boolean(user)}
          listeningById={listeningById}
          readingById={readingById}
          onExamChange={upsertExam}
          onDelete={() => void handleDelete(active.id)}
          deleting={deletingId === active.id}
          onPauseExit={() => navigate("/mock-exam")}
        />
      );
    }
    return (
      <MockExamReview
        key={active.id}
        exam={active}
        listeningById={listeningById}
        readingById={readingById}
        onDelete={() => void handleDelete(active.id)}
        deleting={deletingId === active.id}
        onRetake={() => void handleStart(active.section)}
      />
    );
  }

  const inProgressExams = exams.filter((item) => item.status === "in_progress");
  const completedExams = exams.filter((item) => item.status === "completed");

  return (
    <section className="mock-lobby">
      <div className="page-heading">
        <div>
          <p className="eyebrow">TOEIC OFFICIAL FORMAT SIMULATION</p>
          <h1>模擬多益正式考試</h1>
          <p>
            比照新制多益正式考試規格，聽力（45 分鐘 / 100 題）與閱讀（75 分鐘 /
            100 題）分開施測，Part 3、4、6、7 以整組同頁作答。
          </p>
        </div>
      </div>

      {!user && (
        <div className="notice mock-guest-banner" role="status">
          目前為訪客模式：模擬考進度僅暫存於此瀏覽器分頁，關閉分頁後不保留。
          <Link to="/login" state={{ from: "/mock-exam" }}>
            登入帳號
          </Link>
          即可跨裝置保存測驗進度、歷史成績與收藏重要題庫。
        </div>
      )}

      {error && <ErrorNotice message={error} retry={() => void loadAll()} />}

      {inProgressExams.length > 0 && (
        <section
          className="study-panel mock-resume-section"
          aria-label="進行中的模擬測驗"
        >
          <div className="mock-section-heading">
            <div>
              <p className="eyebrow">IN PROGRESS</p>
              <h2>尚未完成的模擬測驗</h2>
            </div>
            <span className="review-count-badge">
              {inProgressExams.length} 場
            </span>
          </div>
          <div className="mock-history-list">
            {inProgressExams.map((exam) => {
              const answeredCount = Object.keys(exam.answers).length;
              return (
                <div className="mock-history-card is-active" key={exam.id}>
                  <div className="mock-history-main">
                    <div className="mock-history-badges">
                      <span className={`mock-section-pill is-${exam.section}`}>
                        {exam.section === "listening"
                          ? "聽力模擬考"
                          : "閱讀模擬考"}
                      </span>
                      <span className="mock-status-pill">作答中</span>
                    </div>
                    <p className="mock-history-meta">
                      已作答 {answeredCount} / {exam.total_questions} 題 ·
                      剩餘時間{" "}
                      <strong>{formatCountdown(exam.remaining_seconds)}</strong>
                    </p>
                    <small className="mock-history-date">
                      上次更新：{formatDateTime(exam.updated_at)}
                    </small>
                  </div>
                  <div className="mock-history-actions">
                    <button
                      type="button"
                      className="button primary small"
                      onClick={() => navigate(`/mock-exam/${exam.id}`)}
                    >
                      繼續作答
                    </button>
                    {confirmDeleteId === exam.id ? (
                      <>
                        <button
                          type="button"
                          className="button danger small"
                          disabled={deletingId === exam.id}
                          onClick={() => void handleDelete(exam.id)}
                        >
                          {deletingId === exam.id ? "刪除中…" : "確定刪除"}
                        </button>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          取消
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="button secondary small"
                        onClick={() => setConfirmDeleteId(exam.id)}
                      >
                        刪除進度
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="mock-start-grid">
        <article className="study-panel mock-start-card">
          <div className="mock-card-top">
            <span className="part-tab-badge">LISTENING · 45 MIN</span>
            <h2>多益聽力正式模擬考</h2>
            <p className="mock-card-desc">
              隨機抽取 100 題、限時 45 分鐘、滿分 495 分。
            </p>
          </div>
          <ul className="mock-spec-list">
            <li>
              <strong>Part 1 照片描述</strong>：6 題（四選一，不顯示文字）
            </li>
            <li>
              <strong>Part 2 應答問題</strong>：25 題（三選一，不顯示文字）
            </li>
            <li>
              <strong>Part 3 簡短對話</strong>：13 組 × 3 題（共 39 題，整組同頁作答）
            </li>
            <li>
              <strong>Part 4 簡短獨白</strong>：10 段 × 3 題（共 30 題，整組同頁作答）
            </li>
          </ul>
          <p className="mock-card-note">
            輪換美／英／澳／加四國口音，預設限播一次並保留語音異常防呆；作答中可標記整個題組，考完與錯題一起檢討。
          </p>
          <button
            type="button"
            className="button primary"
            disabled={creatingSection !== null}
            onClick={() => void handleStart("listening")}
          >
            {creatingSection === "listening"
              ? "正在組卷…"
              : "開始聽力模擬考（100 題）"}
          </button>
        </article>

        <article className="study-panel mock-start-card">
          <div className="mock-card-top">
            <span className="part-tab-badge">READING · 75 MIN</span>
            <h2>多益閱讀正式模擬考</h2>
            <p className="mock-card-desc">
              隨機抽取 100 題、限時 75 分鐘、滿分 495 分。
            </p>
          </div>
          <ul className="mock-spec-list">
            <li>
              <strong>Part 5 句子填空</strong>：30 題（文法、詞性與商業字彙）
            </li>
            <li>
              <strong>Part 6 段落填空</strong>：4 篇 × 4 題（共 16 題，整篇同頁作答）
            </li>
            <li>
              <strong>Part 7 閱讀理解</strong>：54 題（單篇 29 題＋多篇 25 題，整篇同頁作答）
            </li>
          </ul>
          <p className="mock-card-note">
            75 分鐘內可自由切換題號與分配節奏；作答中可將不確定的整組加星號標記，交卷後統一計分，再自行決定是否整組加入重要題庫。
          </p>
          <button
            type="button"
            className="button primary"
            disabled={creatingSection !== null}
            onClick={() => void handleStart("reading")}
          >
            {creatingSection === "reading"
              ? "正在組卷…"
              : "開始閱讀模擬考（100 題）"}
          </button>
        </article>
      </div>

      <section className="study-panel mock-history-section">
        <div className="mock-section-heading">
          <div>
            <p className="eyebrow">HISTORY &amp; REVIEW</p>
            <h2>歷史模擬考紀錄</h2>
          </div>
          <Link to="/progress?tab=exams" className="text-button">
            在「我的進度」查看全部 →
          </Link>
        </div>
        {!completedExams.length ? (
          <p className="review-empty-note">
            目前還沒有完成的模擬測驗；考完交卷後，成績與錯題檢討都會保存在這裡。
          </p>
        ) : (
          <div className="mock-history-list">
            {completedExams.map((exam) => (
              <div className="mock-history-card" key={exam.id}>
                <div className="mock-history-main">
                  <div className="mock-history-badges">
                    <span className={`mock-section-pill is-${exam.section}`}>
                      {exam.section === "listening"
                        ? "聽力模擬考"
                        : "閱讀模擬考"}
                    </span>
                    <strong className="mock-history-score">
                      {exam.scaled_score ?? "—"} <span>/ 495</span>
                    </strong>
                    <span className="mock-history-raw">
                      答對 {exam.correct_count ?? 0} / {exam.total_questions} 題
                    </span>
                  </div>
                  <p className="mock-history-meta">
                    錯題／未答 {exam.wrong_ids?.length ?? 0} 小題 · 考中標記{" "}
                    {exam.flagged_ids.length} 小題
                  </p>
                  <small className="mock-history-date">
                    完成時間：
                    {formatDateTime(exam.completed_at || exam.updated_at)}
                  </small>
                </div>
                <div className="mock-history-actions">
                  <button
                    type="button"
                    className="button primary small"
                    onClick={() => navigate(`/mock-exam/${exam.id}`)}
                  >
                    檢討錯題與標記
                  </button>
                  {confirmDeleteId === exam.id ? (
                    <>
                      <button
                        type="button"
                        className="button danger small"
                        disabled={deletingId === exam.id}
                        onClick={() => void handleDelete(exam.id)}
                      >
                        {deletingId === exam.id ? "刪除中…" : "確定刪除"}
                      </button>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => setConfirmDeleteId(null)}
                      >
                        取消
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="button secondary small"
                      onClick={() => setConfirmDeleteId(exam.id)}
                    >
                      刪除紀錄
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

function MockExamRunner({
  exam: initialExam,
  isSignedIn,
  listeningById,
  readingById,
  onExamChange,
  onDelete,
  deleting,
  onPauseExit,
}: {
  exam: MockExam;
  isSignedIn: boolean;
  listeningById: Map<string, Listening>;
  readingById: Map<string, Reading>;
  onExamChange: (exam: MockExam) => void;
  onDelete: () => void;
  deleting: boolean;
  onPauseExit: () => void;
}) {
  const [exam, setExam] = useState<MockExam>(initialExam);
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [saveError, setSaveError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showNavigator, setShowNavigator] = useState(
    initialExam.section === "reading",
  );

  const units = useMemo(
    () => buildExamUnits(exam, listeningById, readingById),
    [exam.question_ids, exam.section, listeningById, readingById],
  );

  const currentUnitIndex = useMemo(() => {
    const found = units.findIndex(
      (u) => exam.current_index >= u.startIndex && exam.current_index <= u.endIndex,
    );
    return found >= 0 ? found : 0;
  }, [exam.current_index, units]);

  const currentUnit = units[currentUnitIndex];

  const player = useMemo(() => {
    let synthesis, Utterance;
    try {
      synthesis = window.speechSynthesis;
      Utterance = window.SpeechSynthesisUtterance;
    } catch {}
    return new SpeechPlayer({ synthesis, Utterance });
  }, []);
  const [playing, setPlaying] = useState(false);
  const [playState, setPlayState] = useState("");
  const [playStep, setPlayStep] = useState(0);
  const [speechError, setSpeechError] = useState("");
  const [emergencyText, setEmergencyText] = useState(false);

  const examRef = useRef(exam);
  examRef.current = exam;
  const dirtyRef = useRef(false);
  const submittingRef = useRef(false);

  const persistProgress = useCallback(
    async (snapshot?: MockExam) => {
      const target = snapshot || examRef.current;
      if (target.status !== "in_progress") return;
      onExamChange(target);
      if (!isSignedIn) {
        setSaveState("saved");
        dirtyRef.current = false;
        return;
      }
      setSaveState("saving");
      setSaveError("");
      const patch: MockExamPatch = {
        answers: target.answers,
        flagged_ids: target.flagged_ids,
        played_keys: target.played_keys,
        current_index: target.current_index,
        remaining_seconds: target.remaining_seconds,
      };
      try {
        await updateMockExam(target.id, patch);
        dirtyRef.current = false;
        setSaveState("saved");
      } catch (err) {
        setSaveState("error");
        setSaveError(errorMessage(err));
      }
    },
    [isSignedIn, onExamChange],
  );

  const handleSubmit = useCallback(async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSaveError("");
    player.stop();
    const target = examRef.current;
    try {
      let completed: MockExam;
      if (isSignedIn) {
        completed = await submitMockExam(target.id, {
          answers: target.answers,
          flagged_ids: target.flagged_ids,
          played_keys: target.played_keys,
          current_index: target.current_index,
          remaining_seconds: target.remaining_seconds,
        });
      } else {
        const lookup = new Map<string, Listening | Reading>([
          ...listeningById.entries(),
          ...readingById.entries(),
        ]);
        completed = gradeLocalMockExam(target, lookup);
      }
      onExamChange(completed);
    } catch (err) {
      setSaveError(errorMessage(err));
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [isSignedIn, listeningById, onExamChange, player, readingById]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setExam((prev) => {
        if (prev.status !== "in_progress") return prev;
        if (prev.remaining_seconds <= 1) {
          const zeroed = { ...prev, remaining_seconds: 0 };
          examRef.current = zeroed;
          void handleSubmit();
          return zeroed;
        }
        return { ...prev, remaining_seconds: prev.remaining_seconds - 1 };
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [handleSubmit]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (examRef.current.status === "in_progress") {
        void persistProgress(examRef.current);
      }
    }, 20000);
    return () => window.clearInterval(interval);
  }, [persistProgress]);

  useEffect(() => {
    if (!dirtyRef.current) return;
    const timeout = window.setTimeout(() => {
      void persistProgress(examRef.current);
    }, 600);
    return () => window.clearTimeout(timeout);
  }, [
    exam.answers,
    exam.flagged_ids,
    exam.played_keys,
    exam.current_index,
    persistProgress,
  ]);

  useEffect(() => {
    player.stop();
    setPlaying(false);
    setPlayState("");
    setPlayStep(0);
    setSpeechError("");
    setEmergencyText(false);
    return () => {
      player.stop();
    };
  }, [currentUnit?.key, player]);

  if (!currentUnit) return <Loading />;

  const isMultiUnit = currentUnit.questionIds.length > 1;
  const isUnitFlagged = currentUnit.questionIds.every((id) =>
    exam.flagged_ids.includes(id),
  );
  const answeredCount = Object.keys(exam.answers).length;
  const unansweredCount = exam.total_questions - answeredCount;
  const flaggedUnitCount = units.filter((u) =>
    u.questionIds.some((id) => exam.flagged_ids.includes(id)),
  ).length;

  const audioKey = currentUnit.key;
  const audioPlayed = Boolean(audioKey && exam.played_keys.includes(audioKey));
  const currentAccent = accentForMockKey(audioKey);
  const speechData = useMemo(
    () =>
      exam.section === "listening" && currentUnit.listeningItems.length > 0
        ? buildListeningGroupSpeechSegments(currentUnit.listeningItems)
        : { segments: [], labels: [] },
    [currentUnit.listeningItems, exam.section],
  );

  function updateExamState(updater: (prev: MockExam) => MockExam) {
    dirtyRef.current = true;
    setExam((prev) => {
      const next = { ...updater(prev), updated_at: new Date().toISOString() };
      examRef.current = next;
      return next;
    });
  }

  function selectAnswer(questionId: string, label: string) {
    updateExamState((prev) => ({
      ...prev,
      answers: { ...prev.answers, [questionId]: label },
    }));
  }

  function toggleUnitFlag() {
    const ids = currentUnit.questionIds;
    updateExamState((prev) => {
      const allFlagged = ids.every((id) => prev.flagged_ids.includes(id));
      const nextFlags = allFlagged
        ? prev.flagged_ids.filter((id) => !ids.includes(id))
        : [...new Set([...prev.flagged_ids, ...ids])];
      return {
        ...prev,
        flagged_ids: nextFlags,
      };
    });
  }

  function goToUnit(nextUnitIdx: number) {
    const clamped = Math.max(0, Math.min(units.length - 1, nextUnitIdx));
    const targetStart = units[clamped].startIndex;
    updateExamState((prev) => ({ ...prev, current_index: targetStart }));
  }

  function goToQuestionIndex(qIdx: number) {
    const targetUnitIdx = units.findIndex(
      (u) => qIdx >= u.startIndex && qIdx <= u.endIndex,
    );
    if (targetUnitIdx >= 0) goToUnit(targetUnitIdx);
  }

  function playCurrentAudio() {
    if (!currentUnit.listeningItems.length) return;
    if (playing) {
      player.stop();
      setPlaying(false);
      setPlayState("");
      return;
    }
    setSpeechError("");
    setPlayStep(0);
    setPlayState("starting");
    setPlaying(true);
    player.play(speechData.segments, {
      rate: 1,
      accent: currentAccent.code,
      onState: (state) => setPlayState(state),
      onStep: (step) => setPlayStep(step),
      onComplete: () => {
        setPlaying(false);
        setPlayState("");
        if (audioKey && !examRef.current.played_keys.includes(audioKey)) {
          updateExamState((prev) => ({
            ...prev,
            played_keys: [...prev.played_keys, audioKey],
          }));
        }
      },
      onError: () => {
        setPlaying(false);
        setPlayState("");
        setSpeechError(
          "語音播放異常，可使用下方「緊急重播」或「顯示英文文字（防呆）」繼續作答。",
        );
      },
    });
  }

  async function handlePause() {
    player.stop();
    await persistProgress(examRef.current);
    onPauseExit();
  }

  const isLowTime = exam.remaining_seconds <= 300;
  const firstListening = currentUnit.listeningItems[0];
  const firstReading = currentUnit.readingItems[0];
  const isPrintedListening =
    exam.section === "listening" &&
    (currentUnit.part === 3 || currentUnit.part === 4);

  return (
    <section className="mock-runner">
      <header className="mock-topbar">
        <div className="mock-topbar-left">
          <span className={`mock-section-pill is-${exam.section}`}>
            {exam.section === "listening" ? "聽力模擬考" : "閱讀模擬考"}
          </span>
          <span className="mock-part-indicator">
            {partBadgeLabel(exam.section, currentUnit.part)}
          </span>
          <span className="mock-progress-text">
            <strong>{questionRangeLabel(currentUnit)}</strong> / 共{" "}
            {exam.total_questions} 題 · 已作答 {answeredCount} 題 · 標記{" "}
            {flaggedUnitCount} 題組
          </span>
        </div>
        <div className="mock-topbar-right">
          <div
            className={`mock-timer ${isLowTime ? "is-low" : ""}`}
            aria-label="剩餘時間"
          >
            ⏱ {formatCountdown(exam.remaining_seconds)}
          </div>
          <button
            type="button"
            className="button secondary small"
            onClick={() => setShowNavigator((v) => !v)}
          >
            {showNavigator ? "隱藏題號卡" : "題號卡 (1–100)"}
          </button>
          <button
            type="button"
            className="button secondary small"
            disabled={submitting}
            onClick={() => void handlePause()}
          >
            暫停並保存
          </button>
          <button
            type="button"
            className="button primary small"
            disabled={submitting}
            onClick={() => setConfirmSubmit(true)}
          >
            {submitting ? "批改中…" : "交卷計分"}
          </button>
        </div>
      </header>

      <div className="mock-save-bar">
        <span>
          {saveState === "saving"
            ? "正在自動保存進度…"
            : saveState === "saved"
              ? "進度已自動保存"
              : "作答與標記會自動保存"}
        </span>
        <div>
          {confirmDelete ? (
            <span className="inline-confirm">
              確定刪除這場進行中的測驗？
              <button
                type="button"
                className="text-button is-danger"
                disabled={deleting}
                onClick={onDelete}
              >
                {deleting ? "刪除中…" : "確定刪除"}
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => setConfirmDelete(false)}
              >
                取消
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="text-button"
              onClick={() => setConfirmDelete(true)}
            >
              刪除這次測驗進度
            </button>
          )}
        </div>
      </div>

      {saveError && (
        <ErrorNotice
          message={saveError}
          retry={() => void persistProgress(examRef.current)}
        />
      )}

      {confirmSubmit && (
        <div className="mock-confirm-banner" role="alert">
          <div>
            <strong>確定現在交卷計分？</strong>
            <p>
              目前已完成 {answeredCount} / {exam.total_questions} 題
              {unansweredCount > 0
                ? `（還有 ${unansweredCount} 題未作答，未答題將計為錯誤）`
                : "（全部題目已作答）"}
              。交卷後即可查看分數並一起檢討錯題與標記星號題組。
            </p>
          </div>
          <div className="mock-confirm-actions">
            <button
              type="button"
              className="button primary small"
              disabled={submitting}
              onClick={() => void handleSubmit()}
            >
              {submitting ? "批改中…" : "確定交卷"}
            </button>
            <button
              type="button"
              className="button secondary small"
              disabled={submitting}
              onClick={() => setConfirmSubmit(false)}
            >
              繼續作答
            </button>
          </div>
        </div>
      )}

      <div className={`mock-workspace ${showNavigator ? "with-nav" : ""}`}>
        <section className="study-panel mock-question-panel">
          <div className="session-header mock-question-header">
            <span>
              {questionRangeLabel(currentUnit)} ·{" "}
              {partBadgeLabel(exam.section, currentUnit.part)}
              {isMultiUnit
                ? ` · 題組 ${currentUnit.groupId || currentUnit.key}（共 ${currentUnit.questionIds.length} 小題）`
                : ""}
            </span>
            <button
              type="button"
              className={`mock-flag-button ${isUnitFlagged ? "is-flagged" : ""}`}
              aria-pressed={isUnitFlagged}
              onClick={toggleUnitFlag}
            >
              <span aria-hidden="true">{isUnitFlagged ? "★" : "☆"}</span>
              <span>
                {isUnitFlagged
                  ? isMultiUnit
                    ? "已標記本題組（考後檢討）"
                    : "已標記（考後檢討）"
                  : isMultiUnit
                    ? "標記本題組（考後檢討）"
                    : "標記本題（考後檢討）"}
              </span>
            </button>
          </div>

          {exam.section === "listening" && firstListening && (
            <div className="exercise-content">
              {currentUnit.part === 1 && firstListening.image && (
                <figure className="part1-figure">
                  <div className="part1-image-frame">
                    <img
                      src={firstListening.image}
                      alt={firstListening.imageAlt || "Part 1 圖片描述照片"}
                      className="part1-image"
                    />
                  </div>
                </figure>
              )}

              <div className="listening-center">
                <div className="mock-accent-pill">
                  考場語音：{currentAccent.label}
                </div>
                <p className="eyebrow">OFFICIAL LISTENING SIMULATION</p>
                <h2>
                  {currentUnit.part === 1
                    ? "看圖片，聽四句敘述選出最符合的選項"
                    : currentUnit.part === 2
                      ? "聽問句或陳述，選出最合適的回應"
                      : currentUnit.part === 3
                        ? `聽簡短對話，同時作答下方第 ${currentUnit.startIndex + 1}–${currentUnit.endIndex + 1} 題`
                        : `聽簡短獨白，同時作答下方第 ${currentUnit.startIndex + 1}–${currentUnit.endIndex + 1} 題`}
                </h2>
                <button
                  type="button"
                  className="button primary listening-play"
                  disabled={!player.supported || (audioPlayed && !playing)}
                  onClick={playCurrentAudio}
                >
                  {playing
                    ? "■ 停止播放"
                    : audioPlayed
                      ? "✓ 本段音檔已播放完畢（限播一次）"
                      : isMultiUnit
                        ? `▶ 播放本組音檔與 ${currentUnit.questionIds.length} 個問題（限播一次）`
                        : "▶ 播放本題音檔（限播一次）"}
                </button>
                <p className="listening-audio-status" role="status">
                  {!player.supported
                    ? "此瀏覽器不支援語音播放，已啟用文字防呆供繼續作答。"
                    : playing
                      ? playState === "starting"
                        ? `正在準備語音（${speechData.labels[playStep] || "題目"}）…`
                        : `正在播放：${speechData.labels[playStep] || "題目"}（${playStep + 1} / ${speechData.segments.length}）`
                      : audioPlayed
                        ? "本段音檔已播放完成，請確認答案後前往下一組。"
                        : "按下播放開始聽題；正式考預設每段音檔僅播放一次。"}
                </p>
                {speechError && (
                  <p className="listening-error" role="alert">
                    {speechError}
                  </p>
                )}
                <div className="listening-fallback-actions">
                  {audioPlayed && !playing && player.supported && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={playCurrentAudio}
                    >
                      語音異常？緊急重播一次
                    </button>
                  )}
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setEmergencyText((v) => !v)}
                  >
                    {emergencyText
                      ? "隱藏防呆英文文字"
                      : "沒聽到聲音？顯示英文文字（防呆）"}
                  </button>
                </div>
              </div>

              {(emergencyText || !player.supported) && (
                <div
                  className="listening-fallback-text"
                  aria-label="防呆英文文字"
                >
                  <p className="transcript-prompt" lang="en">
                    {isPrintedListening && firstListening.audioText
                      ? firstListening.audioText
                      : firstListening.prompt}
                  </p>
                  {!isPrintedListening && (
                    <ul>
                      {firstListening.options.map((opt) => (
                        <li key={opt.label} lang="en">
                          {opt.label}. {opt.text}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {!isMultiUnit ? (
                <div
                  className="listening-choices"
                  role="group"
                  aria-label="模擬考作答選項"
                >
                  {firstListening.options.map((option) => (
                    <button
                      type="button"
                      key={option.label}
                      className={`quiz-option listening-choice ${exam.answers[firstListening.id] === option.label ? "is-selected" : ""}`}
                      aria-pressed={
                        exam.answers[firstListening.id] === option.label
                      }
                      onClick={() => selectAnswer(firstListening.id, option.label)}
                    >
                      <span className="option-letter">{option.label}</span>
                      <span lang="en">
                        {isPrintedListening
                          ? option.text
                          : `選項 ${option.label}`}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="group-questions-stack">
                  {currentUnit.listeningItems.map((q, offset) => {
                    const qNumber = currentUnit.startIndex + offset + 1;
                    const chosen = exam.answers[q.id];
                    return (
                      <div className="group-subquestion-card" key={q.id}>
                        <div className="group-subquestion-head">
                          <span className="tiny-label">
                            QUESTION #{qNumber}
                          </span>
                          {chosen && (
                            <span className="mock-answered-pill">
                              已選 {chosen}
                            </span>
                          )}
                        </div>
                        <p className="reading-prompt-text" lang="en">
                          {q.prompt}
                        </p>
                        <div
                          className="listening-choices group-sub-choices"
                          role="group"
                          aria-label={`第 ${qNumber} 題作答選項`}
                        >
                          {q.options.map((option) => (
                            <button
                              type="button"
                              key={option.label}
                              className={`quiz-option listening-choice ${chosen === option.label ? "is-selected" : ""}`}
                              aria-pressed={chosen === option.label}
                              onClick={() => selectAnswer(q.id, option.label)}
                            >
                              <span className="option-letter">
                                {option.label}
                              </span>
                              <span lang="en">{option.text}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {exam.section === "reading" && firstReading && (
            <div className="exercise-content">
              {!isMultiUnit ? (
                <>
                  {firstReading.passage && (
                    <article
                      className="reading-passage"
                      aria-label="模擬考閱讀文章"
                    >
                      <div className="reading-passage-header">
                        <span className="tiny-label">PASSAGE · 閱讀文件</span>
                      </div>
                      <div className="reading-passage-body" lang="en">
                        {firstReading.passage}
                      </div>
                    </article>
                  )}
                  <div className="reading-prompt-box">
                    <span className="tiny-label">
                      QUESTION #{currentUnit.startIndex + 1}
                    </span>
                    <p className="reading-prompt-text" lang="en">
                      {firstReading.prompt}
                    </p>
                  </div>
                  <div
                    className="listening-choices"
                    role="group"
                    aria-label="模擬考作答選項"
                  >
                    {firstReading.options.map((option) => (
                      <button
                        type="button"
                        key={option.label}
                        className={`quiz-option listening-choice ${exam.answers[firstReading.id] === option.label ? "is-selected" : ""}`}
                        aria-pressed={
                          exam.answers[firstReading.id] === option.label
                        }
                        onClick={() =>
                          selectAnswer(firstReading.id, option.label)
                        }
                      >
                        <span className="option-letter">{option.label}</span>
                        <span lang="en">{option.text}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="group-reading-layout">
                  {firstReading.passage && (
                    <article
                      className="reading-passage group-passage-pane"
                      aria-label="模擬考閱讀文章"
                    >
                      <div className="reading-passage-header">
                        <span className="tiny-label">
                          {currentUnit.part === 6
                            ? "PASSAGE · 短文填空"
                            : "PASSAGE · 閱讀文件"}
                        </span>
                        <span className="reading-group-tag">
                          {questionRangeLabel(currentUnit)}（
                          {currentUnit.questionIds.length} 小題）
                        </span>
                      </div>
                      <div className="reading-passage-body" lang="en">
                        {firstReading.passage}
                      </div>
                    </article>
                  )}

                  <div className="group-questions-stack">
                    {currentUnit.readingItems.map((q, offset) => {
                      const qNumber = currentUnit.startIndex + offset + 1;
                      const chosen = exam.answers[q.id];
                      return (
                        <div className="group-subquestion-card" key={q.id}>
                          <div className="group-subquestion-head">
                            <span className="tiny-label">
                              QUESTION #{qNumber}
                            </span>
                            {chosen && (
                              <span className="mock-answered-pill">
                                已選 {chosen}
                              </span>
                            )}
                          </div>
                          <p className="reading-prompt-text" lang="en">
                            {q.prompt}
                          </p>
                          <div
                            className="listening-choices group-sub-choices"
                            role="group"
                            aria-label={`第 ${qNumber} 題作答選項`}
                          >
                            {q.options.map((option) => (
                              <button
                                type="button"
                                key={option.label}
                                className={`quiz-option listening-choice ${chosen === option.label ? "is-selected" : ""}`}
                                aria-pressed={chosen === option.label}
                                onClick={() => selectAnswer(q.id, option.label)}
                              >
                                <span className="option-letter">
                                  {option.label}
                                </span>
                                <span lang="en">{option.text}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="mock-nav-footer">
            <button
              type="button"
              className="button secondary"
              disabled={currentUnitIndex === 0}
              onClick={() => goToUnit(currentUnitIndex - 1)}
            >
              {currentUnitIndex > 0 &&
              units[currentUnitIndex - 1].questionIds.length > 1
                ? "← 上一組"
                : "← 上一題"}
            </button>
            {currentUnitIndex < units.length - 1 ? (
              <button
                type="button"
                className="button primary"
                onClick={() => goToUnit(currentUnitIndex + 1)}
              >
                {units[currentUnitIndex + 1].questionIds.length > 1
                  ? "下一組 →"
                  : "下一題 →"}
              </button>
            ) : (
              <button
                type="button"
                className="button primary"
                onClick={() => setConfirmSubmit(true)}
              >
                完成並交卷計分
              </button>
            )}
          </div>
        </section>

        {showNavigator && (
          <aside className="study-panel mock-navigator" aria-label="題號導覽卡">
            <div className="mock-navigator-header">
              <h3>答題卡（1–{exam.total_questions}）</h3>
              <small>綠＝已作答 · ★＝已標記 · 點擊跳至該題組</small>
            </div>
            <div className="mock-navigator-grid">
              {exam.question_ids.map((id, idx) => {
                const answered = Boolean(exam.answers[id]);
                const flagged = exam.flagged_ids.includes(id);
                const active =
                  idx >= currentUnit.startIndex && idx <= currentUnit.endIndex;
                return (
                  <button
                    type="button"
                    key={id}
                    className={`mock-nav-cell ${active ? "is-current" : ""} ${answered ? "is-answered" : ""} ${flagged ? "is-flagged" : ""}`}
                    aria-label={`跳至第 ${idx + 1} 題${answered ? "（已作答）" : "（未作答）"}${flagged ? "（已標記）" : ""}`}
                    onClick={() => goToQuestionIndex(idx)}
                  >
                    {idx + 1}
                    {flagged && (
                      <span className="nav-star" aria-hidden="true">
                        ★
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </aside>
        )}
      </div>
    </section>
  );
}

function MockExamReview({
  exam,
  listeningById,
  readingById,
  onDelete,
  deleting,
  onRetake,
}: {
  exam: MockExam;
  listeningById: Map<string, Listening>;
  readingById: Map<string, Reading>;
  onDelete: () => void;
  deleting: boolean;
  onRetake: () => void;
}) {
  const [filter, setFilter] = useState<"review" | "wrong" | "flagged" | "all">(
    "review",
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [speechError, setSpeechError] = useState("");
  const player = useMemo(() => {
    let synthesis, Utterance;
    try {
      synthesis = window.speechSynthesis;
      Utterance = window.SpeechSynthesisUtterance;
    } catch {}
    return new SpeechPlayer({ synthesis, Utterance });
  }, []);

  useEffect(() => () => player.stop(), [player]);

  const wrongSet = useMemo(
    () => new Set(exam.wrong_ids || []),
    [exam.wrong_ids],
  );
  const flaggedSet = useMemo(
    () => new Set(exam.flagged_ids || []),
    [exam.flagged_ids],
  );

  const units = useMemo(
    () => buildExamUnits(exam, listeningById, readingById),
    [exam, listeningById, readingById],
  );

  const annotatedUnits = useMemo(
    () =>
      units.map((unit) => {
        const wrongCount = unit.questionIds.filter((id) =>
          wrongSet.has(id),
        ).length;
        const isFlagged = unit.questionIds.some((id) => flaggedSet.has(id));
        return {
          unit,
          wrongCount,
          correctCount: unit.questionIds.length - wrongCount,
          hasWrong: wrongCount > 0,
          isFlagged,
        };
      }),
    [flaggedSet, units, wrongSet],
  );

  const filteredUnits = useMemo(
    () =>
      annotatedUnits.filter((entry) => {
        if (filter === "wrong") return entry.hasWrong;
        if (filter === "flagged") return entry.isFlagged;
        if (filter === "review") return entry.hasWrong || entry.isFlagged;
        return true;
      }),
    [annotatedUnits, filter],
  );

  const combinedUnitCount = annotatedUnits.filter(
    (entry) => entry.hasWrong || entry.isFlagged,
  ).length;
  const wrongUnitCount = annotatedUnits.filter((entry) => entry.hasWrong).length;
  const flaggedUnitCount = annotatedUnits.filter(
    (entry) => entry.isFlagged,
  ).length;
  const elapsedSeconds = Math.max(
    0,
    exam.duration_seconds - exam.remaining_seconds,
  );

  function speakListeningUnit(unit: ExamUnit) {
    setSpeechError("");
    const accent = accentForMockKey(unit.key);
    player.play(buildListeningGroupSpeechSegments(unit.listeningItems).segments, {
      accent: accent.code,
      onError: () => setSpeechError("此瀏覽器無法播放英語語音。"),
    });
  }

  return (
    <section className="mock-review">
      <div className="page-heading">
        <div>
          <p className="eyebrow">MOCK EXAM REPORT &amp; REVIEW</p>
          <h1>
            {exam.section === "listening"
              ? "聽力模擬考成績與檢討"
              : "閱讀模擬考成績與檢討"}
          </h1>
          <p>
            完成時間：{formatDateTime(exam.completed_at || exam.updated_at)} ·
            用時 {formatCountdown(elapsedSeconds)}
          </p>
        </div>
        <div className="mock-report-actions">
          <Link to="/mock-exam" className="button secondary small">
            ← 回到模擬考首頁
          </Link>
          <button
            type="button"
            className="button primary small"
            onClick={onRetake}
          >
            再考一次
          </button>
          {confirmDelete ? (
            <>
              <button
                type="button"
                className="button danger small"
                disabled={deleting}
                onClick={onDelete}
              >
                {deleting ? "刪除中…" : "確定刪除此紀錄"}
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => setConfirmDelete(false)}
              >
                取消
              </button>
            </>
          ) : (
            <button
              type="button"
              className="button secondary small"
              onClick={() => setConfirmDelete(true)}
            >
              刪除這次測驗
            </button>
          )}
        </div>
      </div>

      <div className="mock-score-banner">
        <div className="mock-score-main">
          <span className="tiny-label">ESTIMATED TOEIC SCORE</span>
          <strong>
            {exam.scaled_score ?? "—"} <span>/ 495</span>
          </strong>
          <p>
            答對 {exam.correct_count ?? 0} / {exam.total_questions} 小題 ·
            錯題／未答 {wrongSet.size} 小題 · 考中標記 {flaggedUnitCount} 題組
          </p>
        </div>
        {exam.part_stats && exam.part_stats.length > 0 && (
          <div className="mock-part-breakdown">
            {exam.part_stats.map((stat) => (
              <div className="mock-part-stat-box" key={stat.part}>
                <span>Part {stat.part}</span>
                <strong>
                  {stat.correct} / {stat.total}
                </strong>
                <small>
                  {stat.total
                    ? `${Math.round((stat.correct / stat.total) * 100)}%`
                    : "—"}
                </small>
              </div>
            ))}
          </div>
        )}
      </div>

      <section className="study-panel mock-review-panel">
        <div className="mock-review-toolbar">
          <div className="mode-switch" role="tablist" aria-label="檢討題目篩選">
            <button
              type="button"
              role="tab"
              aria-selected={filter === "review"}
              className={filter === "review" ? "selected" : ""}
              onClick={() => setFilter("review")}
            >
              錯題＋標記 ({combinedUnitCount})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filter === "wrong"}
              className={filter === "wrong" ? "selected" : ""}
              onClick={() => setFilter("wrong")}
            >
              只看錯題 ({wrongUnitCount})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filter === "flagged"}
              className={filter === "flagged" ? "selected" : ""}
              onClick={() => setFilter("flagged")}
            >
              只看考中標記 ({flaggedUnitCount})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filter === "all"}
              className={filter === "all" ? "selected" : ""}
              onClick={() => setFilter("all")}
            >
              全部 ({units.length})
            </button>
          </div>
          <p className="mock-review-hint">
            錯題不會自動存入重要題庫；需要長期複習的題目或題組，請點擊右上角的 ★
            自行整組加入「重要題庫」。
          </p>
        </div>

        {speechError && <p role="alert">{speechError}</p>}

        {!filteredUnits.length ? (
          <p className="review-empty-note">這個篩選條件下沒有題目。</p>
        ) : (
          <div className="mock-review-list">
            {filteredUnits.map(({ unit, wrongCount, correctCount, isFlagged }) => {
              const isMulti = unit.questionIds.length > 1;
              const firstL = unit.listeningItems[0];
              const firstR = unit.readingItems[0];
              const items: (Listening | Reading)[] =
                exam.section === "listening"
                  ? unit.listeningItems
                  : unit.readingItems;
              if (!items.length) return null;

              return (
                <article className="mock-review-card" key={unit.key}>
                  <div className="mock-review-card-header">
                    <div className="mock-review-card-meta">
                      <span className="mock-review-num">
                        {questionRangeLabel(unit)}
                      </span>
                      <span className="mock-part-indicator">
                        {partBadgeLabel(exam.section, unit.part)}
                      </span>
                      <span
                        className={`mock-verdict-pill ${wrongCount > 0 ? "is-wrong" : "is-correct"}`}
                      >
                        {isMulti
                          ? `答對 ${correctCount} / ${unit.questionIds.length} 小題`
                          : wrongCount > 0
                            ? exam.answers[unit.questionIds[0]]
                              ? `答錯（你選 ${exam.answers[unit.questionIds[0]]}）`
                              : "未作答"
                            : `✓ 答對（${exam.answers[unit.questionIds[0]]}）`}
                      </span>
                      {isFlagged && (
                        <span className="mock-flagged-pill">★ 考中標記</span>
                      )}
                    </div>
                    <BookmarkButton
                      entryIds={unit.questionIds}
                      category={exam.section}
                      itemLabel={`${questionRangeLabel(unit)} (${unit.groupId || unit.key})`}
                      compact
                    />
                  </div>

                  {firstL && (
                    <div className="mock-review-body">
                      <div className="review-detail-toolbar">
                        <span className="word-source">
                          {unit.groupId || firstL.id} ·{" "}
                          {topics[firstL.topic] || firstL.topic}
                        </span>
                        <button
                          type="button"
                          className="audio-button"
                          onClick={() => speakListeningUnit(unit)}
                        >
                          ♪ {isMulti ? "重聽整組音檔" : "重聽本題"}
                        </button>
                      </div>
                      {unit.part === 1 && firstL.image && (
                        <div className="part1-image-frame review-part1-image">
                          <img
                            src={firstL.image}
                            alt={firstL.imageAlt || "Part 1 圖片描述照片"}
                            className="part1-image"
                          />
                        </div>
                      )}
                      {(unit.part === 3 || unit.part === 4) &&
                        firstL.audioText && (
                          <div className="transcript-dialogue-block">
                            <p className="transcript-prompt" lang="en">
                              {firstL.audioText}
                            </p>
                            {firstL.audioTranslation && (
                              <p className="example-zh">
                                {firstL.audioTranslation}
                              </p>
                            )}
                          </div>
                        )}
                    </div>
                  )}

                  {firstR && (
                    <div className="mock-review-body">
                      <span className="word-source">
                        {unit.groupId || firstR.id} · {firstR.topic}
                      </span>
                      {firstR.passage && (
                        <div
                          className="reading-passage-body review-reading-passage"
                          lang="en"
                        >
                          {firstR.passage}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="mock-review-sublist">
                    {items.map((item, offset) => {
                      const qNum = unit.startIndex + offset + 1;
                      const userAnswer = exam.answers[item.id] || null;
                      const isWrong = wrongSet.has(item.id);
                      const readingItem =
                        exam.section === "reading"
                          ? (item as Reading)
                          : undefined;
                      return (
                        <div
                          className={
                            isMulti ? "mock-review-subcard" : "mock-review-single"
                          }
                          key={item.id}
                        >
                          {isMulti && (
                            <div className="group-subquestion-head">
                              <span className="tiny-label">
                                第 {qNum} 題（{item.id}）
                              </span>
                              <span
                                className={`mock-verdict-pill ${isWrong ? "is-wrong" : "is-correct"}`}
                              >
                                {!userAnswer
                                  ? "未作答"
                                  : isWrong
                                    ? `答錯（你選 ${userAnswer}）`
                                    : `✓ 答對（${userAnswer}）`}
                              </span>
                            </div>
                          )}
                          <p className="transcript-prompt" lang="en">
                            {item.prompt}
                          </p>
                          {item.promptZh && (
                            <p className="example-zh">{item.promptZh}</p>
                          )}
                          <div className="listening-transcript review-listening-transcript">
                            {item.options.map((opt) => {
                              const isCorrectOpt = opt.label === item.answer;
                              const isUserWrong =
                                userAnswer === opt.label && !isCorrectOpt;
                              return (
                                <div
                                  key={opt.label}
                                  className={`transcript-response ${isCorrectOpt ? "is-answer" : ""} ${isUserWrong ? "is-user-wrong" : ""}`}
                                >
                                  <p lang="en">
                                    {opt.label}. {opt.text}
                                    {isCorrectOpt && " ✓ 正解"}
                                    {isUserWrong && " ✗ 你的作答"}
                                  </p>
                                  {opt.translation && (
                                    <p className="example-zh">
                                      {opt.translation}
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          <div className="listening-explanation">
                            <h3>解析</h3>
                            <p>{item.explanation}</p>
                            {readingItem?.evidence && (
                              <div className="reading-evidence">
                                <strong>
                                  關鍵證據句
                                  {readingItem.evidenceLocation
                                    ? `（${readingItem.evidenceLocation}）`
                                    : ""}
                                  ：
                                </strong>
                                <blockquote lang="en">
                                  {readingItem.evidence}
                                </blockquote>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}
