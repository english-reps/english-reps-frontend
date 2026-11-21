import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { App } from "./App";
import words from "../data/vocabulary.json";
import listening from "../data/listening.js";
import reading from "../data/reading.json";
import {
  buildLocalMockExam,
  gradeLocalMockExam,
  type Listening,
  type MockExam,
  type Reading,
} from "./domain/types";
import { resetCsrf } from "./services/api";
import { resetWakeState } from "./services/wake";

let signedIn = false;
let events: Record<string, unknown>[];
let mockExamsDb: MockExam[];
let failSave = false;
let failListeningCatalog = false;
const user = { id: "owner-1", email: "learner@example.com" };
const listeningById = new Map(
  (listening.entries as Listening[]).map((item) => [item.id, item]),
);
const readingById = new Map(
  (reading.entries as Reading[]).map((item) => [item.id, item]),
);
const allById = new Map<string, Listening | Reading>([
  ...listeningById.entries(),
  ...readingById.entries(),
]);

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

beforeEach(() => {
  signedIn = false;
  events = [];
  mockExamsDb = [];
  failSave = false;
  failListeningCatalog = false;
  sessionStorage.clear();
  resetCsrf();
  resetWakeState();
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: undefined,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      const method = (init?.method || "GET").toUpperCase();
      if (path.endsWith("/health/ready")) return json({ status: "ready" });
      if (path.endsWith("/auth/me"))
        return signedIn
          ? json(user)
          : json({ error: { message: "請先登入" } }, 401);
      if (path.endsWith("/auth/csrf")) return json({ csrf_token: "csrf" });
      if (path.endsWith("/auth/login") || path.endsWith("/auth/register")) {
        signedIn = true;
        return json({ user, csrf_token: "after-login" });
      }
      if (path.endsWith("/auth/logout")) {
        signedIn = false;
        return new Response(null, { status: 204 });
      }
      if (path.endsWith("/catalog/vocabulary"))
        return json({ entries: words.entries });
      if (path.endsWith("/catalog/listening")) {
        if (failListeningCatalog)
          return json({ error: { message: "unavailable" } }, 503);
        return json({ entries: listening.entries });
      }
      if (path.endsWith("/catalog/reading"))
        return json({ entries: reading.entries });
      if (path.endsWith("/mock-exams") && method === "GET") {
        return json({ exams: mockExamsDb });
      }
      if (path.endsWith("/mock-exams") && method === "POST") {
        const body = JSON.parse(String(init?.body));
        const exam = buildLocalMockExam(
          body.section,
          listening.entries as Listening[],
          reading.entries as Reading[],
          () => 0.25,
        );
        mockExamsDb = [exam, ...mockExamsDb];
        return json({ exam }, 201);
      }
      const mockSubmitMatch = /\/mock-exams\/([^/]+)\/submit$/.exec(path);
      if (mockSubmitMatch && method === "POST") {
        const id = mockSubmitMatch[1];
        const existing = mockExamsDb.find((row) => row.id === id);
        if (!existing)
          return json({ error: { message: "not found" } }, 404);
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        const merged: MockExam = {
          ...existing,
          answers: body.answers ?? existing.answers,
          flagged_ids: body.flagged_ids ?? existing.flagged_ids,
          played_keys: body.played_keys ?? existing.played_keys,
          current_index: body.current_index ?? existing.current_index,
          remaining_seconds:
            body.remaining_seconds ?? existing.remaining_seconds,
        };
        const completed = gradeLocalMockExam(merged, allById);
        mockExamsDb = mockExamsDb.map((row) =>
          row.id === id ? completed : row,
        );
        return json({ exam: completed });
      }
      const mockIdMatch = /\/mock-exams\/([^/]+)$/.exec(path);
      if (mockIdMatch) {
        const id = mockIdMatch[1];
        const existing = mockExamsDb.find((row) => row.id === id);
        if (!existing)
          return json({ error: { message: "not found" } }, 404);
        if (method === "GET") return json({ exam: existing });
        if (method === "PATCH") {
          const body = JSON.parse(String(init?.body));
          const updated: MockExam = {
            ...existing,
            ...body,
            updated_at: new Date().toISOString(),
          };
          mockExamsDb = mockExamsDb.map((row) =>
            row.id === id ? updated : row,
          );
          return json({ exam: updated });
        }
        if (method === "DELETE") {
          mockExamsDb = mockExamsDb.filter((row) => row.id !== id);
          return new Response(null, { status: 204 });
        }
      }
      if (path.endsWith("/progress/events")) {
        const body = JSON.parse(String(init?.body));
        events.push(body);
        if (failSave) throw new TypeError("network");
        const entryId = String(body.entry_id);
        const inferredCategory = entryId.startsWith("word-")
          ? "vocabulary"
          : listeningById.has(entryId)
            ? "listening"
            : "reading";
        return json({
          correct: body.kind === "card" ? null : true,
          record: {
            entry_id: entryId,
            category: inferredCategory,
            status: body.kind === "card" ? body.rating : "mastered",
            attempts: body.kind === "card" ? 0 : 1,
            correct: body.kind === "card" ? 0 : 1,
            updated_at: new Date().toISOString(),
          },
        });
      }
      if (path.endsWith("/progress"))
        return json({
          records: signedIn
            ? [
                {
                  entry_id: "word-0001",
                  category: "vocabulary",
                  status: "review",
                  attempts: 0,
                  correct: 0,
                  updated_at: new Date().toISOString(),
                },
              ]
            : [],
        });
      throw new Error(`Unexpected request ${method} ${path}`);
    }),
  );
});

function open(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

it("protected progress routes to login, shows starred words tab with remove only, and clears on logout", async () => {
  open("/progress");
  await screen.findByRole("heading", { name: "歡迎回來" });
  fireEvent.change(screen.getByLabelText("電子信箱"), {
    target: { value: user.email },
  });
  fireEvent.change(screen.getByLabelText("密碼（12～128 字元）"), {
    target: { value: "a-long-test-password" },
  });
  fireEvent.click(screen.getByRole("button", { name: "登入" }));
  await screen.findByRole("heading", { name: "我的收藏與模考紀錄" });
  expect(
    screen.queryByRole("heading", { name: "匯入這個瀏覽器的舊進度" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText("測驗正確率")).not.toBeInTheDocument();
  expect(await screen.findByText("company")).toBeInTheDocument();
  expect(screen.getAllByText(/公司；陪伴/).length).toBeGreaterThan(0);
  expect(
    screen.queryByRole("button", { name: /標記為已記住/ }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "登出" }));
  await screen.findByRole("heading", { name: "歡迎回來" });
  expect(screen.queryByText("company")).not.toBeInTheDocument();
});

it("a failed bookmark save stays retryable and resends exactly the same event ID", async () => {
  signedIn = true;
  failSave = true;
  open("/practice");
  fireEvent.click(
    await screen.findByRole("button", { name: "查看解釋與例句" }),
  );
  const starButtons = screen.getAllByRole("button", { name: /加入星號單字/ });
  fireEvent.click(starButtons[0]);
  await screen.findByRole("button", { name: "重試" });
  failSave = false;
  fireEvent.click(screen.getByRole("button", { name: "重試" }));
  await waitFor(() =>
    expect(
      screen.getAllByRole("button", { name: /從星號單字移除/ }).length,
    ).toBeGreaterThan(0),
  );
  expect(events).toHaveLength(2);
  expect(events[0].event_id).toBe(events[1].event_id);
});

it("listening navigation opens the real page, plays 4 sequential segments, gates until end, and hides transcripts until answered", async () => {
  const utterances: SpeechSynthesisUtterance[] = [];
  vi.stubGlobal(
    "SpeechSynthesisUtterance",
    class {
      text: string;
      constructor(text: string) {
        this.text = text;
      }
    },
  );
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: {
      speak: (utterance: SpeechSynthesisUtterance) =>
        utterances.push(utterance),
      cancel: vi.fn(),
      getVoices: () => [],
    },
  });
  open("/practice");
  fireEvent.click(screen.getByRole("link", { name: "聽力練習" }));
  const play = await screen.findByRole("button", {
    name: "▶ 播放題目與 A／B／C",
  });
  const option = screen.getByRole("button", { name: "A 回答 A" });
  expect(option).toBeDisabled();
  fireEvent.click(play);
  expect(utterances).toHaveLength(1);
  const question = listening.entries.find(
    (row) => row.prompt === utterances[0].text,
  )!;
  expect(question).toBeDefined();
  expect(screen.queryByText(question.prompt)).not.toBeInTheDocument();
  for (let step = 0; step < 4; step++) {
    await waitFor(() => expect(utterances).toHaveLength(step + 1));
    expect(option).toBeDisabled();
    utterances[step].onend?.(new Event("end") as SpeechSynthesisEvent);
  }
  await waitFor(() => expect(option).toBeEnabled());
  fireEvent.click(option);
  expect(await screen.findByText(question.prompt)).toBeInTheDocument();
  expect(events).toHaveLength(0);
});

it("listening remains completable with English-only text fallback when speech errors or stops", async () => {
  const utterances: SpeechSynthesisUtterance[] = [];
  vi.stubGlobal(
    "SpeechSynthesisUtterance",
    class {
      text: string;
      constructor(text: string) {
        this.text = text;
      }
    },
  );
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: {
      speak: (utterance: SpeechSynthesisUtterance) =>
        utterances.push(utterance),
      cancel: vi.fn(),
      getVoices: () => [],
    },
  });
  open("/listening");
  const play = await screen.findByRole("button", {
    name: "▶ 播放題目與 A／B／C",
  });
  const optionB = screen.getByRole("button", { name: "B 回答 B" });
  expect(optionB).toBeDisabled();
  fireEvent.click(play);
  expect(utterances).toHaveLength(1);
  const question = listening.entries.find(
    (row) => row.prompt === utterances[0].text,
  )!;
  utterances[0].onerror?.({ error: "network" } as SpeechSynthesisErrorEvent);
  await waitFor(() => expect(optionB).toBeEnabled());
  expect(screen.queryByText(question.prompt)).not.toBeInTheDocument();
  expect(screen.queryByText(question.explanation)).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "顯示題目與選項文字" }),
  );
  expect(screen.getByText(question.prompt)).toBeInTheDocument();
  expect(screen.queryByText(question.promptZh)).not.toBeInTheDocument();
  expect(screen.queryByText(question.explanation)).not.toBeInTheDocument();
  fireEvent.click(optionB);
  expect(await screen.findByText(question.explanation)).toBeInTheDocument();
});

it("listening auto-unlocks with text fallback on unsupported browsers and falls back to bundled data when catalog API fails", async () => {
  failListeningCatalog = true;
  open("/listening");
  expect(
    await screen.findByText(/已改用內建離線聽力題庫/),
  ).toBeInTheDocument();
  expect(screen.queryByText("目前沒有符合的題目")).not.toBeInTheDocument();
  expect(
    screen.getByText(/此瀏覽器不支援語音播放/),
  ).toBeInTheDocument();
  const optionA = screen.getByRole("button", { name: "A 回答 A" });
  expect(optionA).toBeEnabled();
  const fallbackBox = screen.getByLabelText("題目與選項文字");
  expect(fallbackBox).toBeInTheDocument();
  fireEvent.click(optionA);
  expect(await screen.findByText("逐字稿與中文")).toBeInTheDocument();
});

it("answering listening or reading does not auto-save to important bank; user explicitly stars into important bank", async () => {
  signedIn = true;
  open("/listening");
  const optionC = await screen.findByRole("button", { name: "C 回答 C" });
  fireEvent.click(optionC);
  expect(await screen.findByText("逐字稿與中文")).toBeInTheDocument();
  // Answering does NOT automatically push into important bank
  expect(events).toHaveLength(0);
  // Explicitly clicking star adds it to Important Bank
  const starBtn = screen.getAllByRole("button", { name: /加入重要題庫/ })[0];
  fireEvent.click(starBtn);
  await waitFor(() =>
    expect(
      screen.getAllByRole("button", { name: /從重要題庫移除/ }).length,
    ).toBeGreaterThan(0),
  );
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ kind: "card", rating: "review" });
});

it("allows immediate one-click switch to English text while audio is stuck starting", async () => {
  vi.stubGlobal(
    "SpeechSynthesisUtterance",
    class {
      text: string;
      constructor(text: string) {
        this.text = text;
      }
    },
  );
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: {
      speak: vi.fn(),
      cancel: vi.fn(),
      getVoices: () => [],
    },
  });
  open("/listening");
  fireEvent.click(
    await screen.findByRole("button", { name: "▶ 播放題目與 A／B／C" }),
  );
  const escape = screen.getByRole("button", {
    name: "沒聽到聲音？停止並改看文字作答",
  });
  fireEvent.click(escape);
  expect(screen.getByLabelText("題目與選項文字")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "A 回答 A" })).toBeEnabled();
});

it("library search finds English and Chinese and supports direct routes", async () => {
  open("/library");
  await screen.findByText("找到 1,000 個單字");
  const companyRow = screen.getByText("company").closest("summary");
  expect(companyRow?.querySelector(".list-number")).toHaveTextContent("0001");
  expect(companyRow?.querySelector(".list-word")).toHaveTextContent("company");
  expect(companyRow?.querySelector(".list-pos")).toHaveTextContent("n.");
  expect(companyRow?.querySelector(".list-meaning")).toHaveTextContent(
    "公司；陪伴",
  );
  expect(companyRow?.querySelector(".expand-icon")).toHaveTextContent("+");
  fireEvent.change(screen.getByLabelText("搜尋單字或中文"), {
    target: { value: "乘客" },
  });
  expect(await screen.findByText("passenger")).toBeInTheDocument();
  expect(
    screen.queryByText("company", { exact: true }),
  ).not.toBeInTheDocument();
});

it("library star button toggles review/unseen progress, filters starred words, and retries failed saves", async () => {
  signedIn = true;
  open("/library");
  await screen.findByText("找到 1,000 個單字");
  const companyStar = await screen.findByRole("button", {
    name: "取消標記 company 為不熟",
  });
  expect(companyStar).toHaveAttribute("aria-pressed", "true");
  expect(companyStar).toHaveTextContent("★");

  const passengerStar = screen.getByRole("button", {
    name: "標記 passenger 為不熟",
  });
  expect(passengerStar).toHaveAttribute("aria-pressed", "false");
  expect(passengerStar).toHaveTextContent("☆");
  fireEvent.click(passengerStar);

  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "取消標記 passenger 為不熟" }),
    ).toHaveAttribute("aria-pressed", "true"),
  );
  expect(events[0]).toMatchObject({
    entry_id: "word-0002",
    kind: "card",
    rating: "review",
  });

  fireEvent.click(screen.getByRole("checkbox", { name: /只看星號單字/ }));
  expect(await screen.findByText("找到 2 個單字")).toBeInTheDocument();

  failSave = true;
  fireEvent.click(
    screen.getByRole("button", { name: "取消標記 company 為不熟" }),
  );
  const retryButton = await screen.findByRole("button", { name: "重試" });
  expect(screen.getByText(/尚未確認儲存/)).toBeInTheDocument();
  expect(events).toHaveLength(2);
  expect(events[1]).toMatchObject({
    entry_id: "word-0001",
    kind: "card",
    rating: "unseen",
  });

  failSave = false;
  fireEvent.click(retryButton);
  expect(await screen.findByText("找到 1 個單字")).toBeInTheDocument();
  expect(events).toHaveLength(3);
  expect(events[2].event_id).toBe(events[1].event_id);
  expect(screen.getByText("passenger")).toBeInTheDocument();
  expect(
    screen.queryByText("company", { exact: true }),
  ).not.toBeInTheDocument();
});

it("guest clicking star in library prompts login and returns to library after signing in", async () => {
  open("/library");
  await screen.findByText("找到 1,000 個單字");
  fireEvent.click(
    screen.getByRole("button", { name: "標記 company 為不熟" }),
  );
  expect(events).toHaveLength(0);
  expect(
    await screen.findByText(/請先登入帳號，才能將不熟的單字存進資料庫/),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("link", { name: "前往登入 / 註冊" }));
  await screen.findByRole("heading", { name: "歡迎回來" });
  fireEvent.change(screen.getByLabelText("電子信箱"), {
    target: { value: user.email },
  });
  fireEvent.change(screen.getByLabelText("密碼（12～128 字元）"), {
    target: { value: "a-long-test-password" },
  });
  fireEvent.click(screen.getByRole("button", { name: "登入" }));
  await screen.findByRole("heading", { name: "單字庫" });
  expect(
    await screen.findByRole("button", { name: "取消標記 company 為不熟" }),
  ).toHaveTextContent("★");
});

it("displays cold-start guidance and keeps guest listening usable when API gateway returns 502", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) => {
      if (
        path.endsWith("/health/ready") ||
        path.endsWith("/auth/me") ||
        path.endsWith("/catalog/listening")
      ) {
        return new Response("<html>502 Bad Gateway</html>", { status: 502 });
      }
      throw new Error(`Unexpected request ${path}`);
    }),
  );
  open("/listening");
  expect(
    await screen.findByText(/帳號服務正在喚醒或暫時無回應（HTTP 502）/),
  ).toBeInTheDocument();
  expect(
    await screen.findByText(/後端喚醒中或暫時無回應（502）/),
  ).toBeInTheDocument();
  expect(
    await screen.findByText(/已改用內建離線聽力題庫/),
  ).toBeInTheDocument();
});

it("progress page manages starred words (remove only), important questions bank, and mock exam history", async () => {
  signedIn = true;
  open("/progress");
  await screen.findByRole("heading", { name: "我的收藏與模考紀錄" });
  expect(await screen.findByText("company")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "聽 company 發音" }),
  ).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "從星號單字移除 company" }),
  );
  await waitFor(() =>
    expect(screen.queryByText("company")).not.toBeInTheDocument(),
  );
  expect(events[0]).toMatchObject({
    entry_id: "word-0001",
    kind: "card",
    rating: "unseen",
  });

  // Switch to Important Questions Bank tab
  fireEvent.click(screen.getByRole("tab", { name: /重要題庫/ }));
  expect(
    await screen.findByRole("heading", { name: "重要題庫（聽力＋閱讀）" }),
  ).toBeInTheDocument();

  // Switch to Mock Exam History tab
  fireEvent.click(screen.getByRole("tab", { name: /模擬考紀錄/ }));
  expect(
    await screen.findByRole("heading", { name: "模擬多益考試紀錄" }),
  ).toBeInTheDocument();
});

it("automatically wakes a sleeping backend via direct wake_url and recovers auth and offline catalog", async () => {
  const wakeUrl =
    "https://english-reps-api-staging-uvmg.onrender.com/api/v1/health/live";
  let backendAwake = false;
  let directWakeCalls = 0;

  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      if (path === "/api-wake-config.json") {
        return json({ wake_url: wakeUrl });
      }
      if (path === wakeUrl) {
        expect(init).toMatchObject({
          method: "GET",
          mode: "no-cors",
          credentials: "omit",
          cache: "no-store",
        });
        directWakeCalls++;
        backendAwake = true;
        return new Response(null, { status: 200 });
      }
      if (!backendAwake) {
        return new Response("<html>502 Bad Gateway</html>", { status: 502 });
      }
      if (path.endsWith("/health/ready")) return json({ status: "ready" });
      if (path.endsWith("/auth/me")) return json(user);
      if (path.endsWith("/progress")) return json({ records: [] });
      if (path.endsWith("/catalog/listening"))
        return json({ entries: listening.entries });
      throw new Error(`Unexpected request ${path}`);
    }),
  );

  open("/listening");
  expect(await screen.findByText("服務已連線")).toBeInTheDocument();
  expect(await screen.findByText(user.email)).toBeInTheDocument();
  await waitFor(() =>
    expect(
      screen.queryByText(/帳號服務正在喚醒或暫時無回應/),
    ).not.toBeInTheDocument(),
  );
  await waitFor(() =>
    expect(screen.queryByText(/已改用內建離線聽力題庫/)).not.toBeInTheDocument(),
  );
  expect(directWakeCalls).toBe(1);
});

it("supports switching between TOEIC Listening Parts 1-4 and Reading Parts 5-7 and starring reading questions", async () => {
  signedIn = true;
  open("/listening");
  await screen.findByRole("button", { name: "A 回答 A" });

  fireEvent.click(screen.getByRole("tab", { name: /圖片描述/ }));
  expect(
    await screen.findByRole("img", { name: /Part 1/i }),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "D 回答 D" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("tab", { name: /簡短對話/ }));
  expect(
    await screen.findByText("聽雙人對話，選出題目的最佳答案"),
  ).toBeInTheDocument();

  fireEvent.click(screen.getByRole("link", { name: "閱讀練習" }));
  expect(
    await screen.findByRole("heading", { name: "把多益閱讀，讀成直覺。" }),
  ).toBeInTheDocument();

  fireEvent.click(screen.getByRole("tab", { name: /短文填空/ }));
  expect(await screen.findByLabelText("閱讀文章")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("tab", { name: /閱讀理解/ }));
  expect(await screen.findByLabelText("閱讀文章")).toBeInTheDocument();
  const optionsGroup = screen.getByRole("group", { name: "選擇答案" });
  const firstChoice = optionsGroup.querySelector("button")!;
  fireEvent.click(firstChoice);
  // Answering does not auto-save into important bank
  expect(events).toHaveLength(0);
  // Starring saves to important bank
  fireEvent.click(screen.getAllByRole("button", { name: /加入重要題庫/ })[0]);
  await waitFor(() =>
    expect(
      screen.getAllByRole("button", { name: /從重要題庫移除/ }).length,
    ).toBeGreaterThan(0),
  );
  expect(events[0]).toMatchObject({ kind: "card", rating: "review" });
});

it("supports full TOEIC Reading Mock Exam flow: start, flag, submit, review wrong + flagged, manually star to Important Bank, and delete", async () => {
  signedIn = true;
  open("/mock-exam");
  await screen.findByRole("heading", { name: "模擬多益正式考試" });

  fireEvent.click(
    screen.getByRole("button", { name: "開始閱讀模擬考（100 題）" }),
  );
  expect(await screen.findByText(/答題卡（1–100）/)).toBeInTheDocument();

  // Answer question #1 and flag it for post-exam review (must NOT pollute Important Bank)
  const choicesGroup = screen.getByRole("group", { name: "模擬考作答選項" });
  fireEvent.click(choicesGroup.querySelector("button")!);
  fireEvent.click(
    screen.getByRole("button", { name: /標記本題（考後檢討）/ }),
  );
  expect(
    await screen.findByRole("button", { name: /已標記（考後檢討）/ }),
  ).toBeInTheDocument();
  expect(events).toHaveLength(0);

  // Submit mock exam
  fireEvent.click(screen.getByRole("button", { name: "交卷計分" }));
  fireEvent.click(await screen.findByRole("button", { name: "確定交卷" }));

  expect(
    await screen.findByRole("heading", { name: "閱讀模擬考成績與檢討" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: /錯題＋標記/ })).toBeInTheDocument();
  expect(
    screen.getByRole("tab", { name: /只看考中標記 \(1\)/ }),
  ).toBeInTheDocument();
  // Wrong answers were NOT auto-added to Important Bank
  expect(events).toHaveLength(0);

  // Manually star one reviewed question into Important Bank
  const reviewStarBtn = screen.getAllByRole("button", {
    name: /加入重要題庫/,
  })[0];
  fireEvent.click(reviewStarBtn);
  await waitFor(() => expect(events).toHaveLength(1));
  expect(events[0]).toMatchObject({ kind: "card", rating: "review" });

  // Delete the mock exam record
  fireEvent.click(screen.getByRole("button", { name: "刪除這次測驗" }));
  fireEvent.click(await screen.findByRole("button", { name: "確定刪除此紀錄" }));
  expect(
    await screen.findByRole("heading", { name: "模擬多益正式考試" }),
  ).toBeInTheDocument();
  expect(mockExamsDb).toHaveLength(0);
});

it("supports Listening Mock Exam single-play with safety escape hatch, pause/resume, and deleting in-progress exam", async () => {
  signedIn = true;
  const utterances: SpeechSynthesisUtterance[] = [];
  vi.stubGlobal(
    "SpeechSynthesisUtterance",
    class {
      text: string;
      lang = "en-US";
      constructor(text: string) {
        this.text = text;
      }
    },
  );
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: {
      speak: (utterance: SpeechSynthesisUtterance) =>
        utterances.push(utterance),
      cancel: vi.fn(),
      getVoices: () => [],
    },
  });

  open("/mock-exam");
  await screen.findByRole("heading", { name: "模擬多益正式考試" });
  fireEvent.click(
    screen.getByRole("button", { name: "開始聽力模擬考（100 題）" }),
  );
  // Part 1 question #1 has photo and single-play button
  expect(
    await screen.findByRole("img", { name: /Part 1/i }),
  ).toBeInTheDocument();
  const playBtn = screen.getByRole("button", {
    name: "▶ 播放本題音檔（限播一次）",
  });
  fireEvent.click(playBtn);
  for (let step = 0; step < 4; step++) {
    await waitFor(() => expect(utterances).toHaveLength(step + 1));
    utterances[step].onend?.(new Event("end") as SpeechSynthesisEvent);
  }
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "✓ 本段音檔已播放完畢（限播一次）" }),
    ).toBeDisabled(),
  );
  // Emergency escape hatch is available after single play
  expect(
    screen.getByRole("button", { name: "語音異常？緊急重播一次" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "沒聽到聲音？顯示英文文字（防呆）" }),
  ).toBeInTheDocument();

  // Pause & save, verify it appears in "尚未完成的模擬測驗", then delete in-progress exam
  fireEvent.click(screen.getByRole("button", { name: "暫停並保存" }));
  expect(
    await screen.findByRole("heading", { name: "尚未完成的模擬測驗" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "繼續作答" }),
  ).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "刪除進度" }));
  fireEvent.click(await screen.findByRole("button", { name: "確定刪除" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("heading", { name: "尚未完成的模擬測驗" }),
    ).not.toBeInTheDocument(),
  );
  expect(mockExamsDb).toHaveLength(0);
});
