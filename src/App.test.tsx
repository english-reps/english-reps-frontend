import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { App } from "./App";
import words from "../data/vocabulary.json";
import listening from "../data/listening.js";
import { resetCsrf } from "./services/api";
let signedIn = false;
let events: Record<string, unknown>[];
let failSave = false;
let failListeningCatalog = false;
const user = { id: "owner-1", email: "learner@example.com" };
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
beforeEach(() => {
  signedIn = false;
  events = [];
  failSave = false;
  failListeningCatalog = false;
  resetCsrf();
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: undefined,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
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
      if (path.endsWith("/progress/events")) {
        const body = JSON.parse(String(init?.body));
        events.push(body);
        if (failSave) throw new TypeError("network");
        return json({
          correct: body.kind === "card" ? null : true,
          record: {
            entry_id: body.entry_id,
            category: body.kind === "listening" ? "listening" : "vocabulary",
            status: "mastered",
            attempts: 1,
            correct: 1,
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
                  attempts: 2,
                  correct: 1,
                  updated_at: new Date().toISOString(),
                },
              ]
            : [],
        });
      if (path.endsWith("/progress/import")) return json({ records: [] });
      throw new Error(`Unexpected request ${path}`);
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
it("protected progress routes to login, then returns to private progress and clears it on logout", async () => {
  open("/progress");
  await screen.findByRole("heading", { name: "歡迎回來" });
  fireEvent.change(screen.getByLabelText("電子信箱"), {
    target: { value: user.email },
  });
  fireEvent.change(screen.getByLabelText("密碼（12～128 字元）"), {
    target: { value: "a-long-test-password" },
  });
  fireEvent.click(screen.getByRole("button", { name: "登入" }));
  await screen.findByRole("heading", { name: "我的學習進度" });
  expect(await screen.findByText(/單字 word-0001/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "登出" }));
  await screen.findByRole("heading", { name: "歡迎回來" });
  expect(screen.queryByText(/單字 word-0001/)).not.toBeInTheDocument();
});
it("a failed save stays retryable and resends exactly the same event ID", async () => {
  signedIn = true;
  failSave = true;
  open("/practice");
  fireEvent.click(
    await screen.findByRole("button", { name: "查看解釋與例句" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "記住了" }));
  await screen.findByRole("button", { name: "重試" });
  expect(screen.queryByText("已儲存到你的帳號。")).not.toBeInTheDocument();
  failSave = false;
  fireEvent.click(screen.getByRole("button", { name: "重試" }));
  await screen.findByText("已儲存到你的帳號。");
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
  expect(events).toHaveLength(0); // Guest practice never writes account data.
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
  // Simulate browser synthesis failure (e.g. cloud TTS network error).
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
it("stopping listening playback early offers unlock and text fallback, and signed-in answers save to account", async () => {
  signedIn = true;
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
  fireEvent.click(
    await screen.findByRole("button", { name: "▶ 播放題目與 A／B／C" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "■ 停止播放" }));
  const optionC = screen.getByRole("button", { name: "C 回答 C" });
  expect(optionC).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "直接選擇 A／B／C" }));
  expect(optionC).toBeEnabled();
  fireEvent.click(optionC);
  await screen.findByText("已儲存到你的帳號。");
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ kind: "listening", answer: "C" });
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
it("legacy import requires explicit acknowledgement and leaves browser data intact", async () => {
  signedIn = true;
  const original = JSON.stringify({
    version: 1,
    records: { "word-0001": { status: "mastered", attempts: 3, correct: 2 } },
  });
  localStorage.setItem("english-reps.progress.v1", original);
  open("/progress");
  const button = await screen.findByRole("button", { name: "匯入到目前帳號" });
  expect(button).toBeDisabled();
  fireEvent.click(
    screen.getByRole("checkbox", { name: "我確認這些是我的學習紀錄" }),
  );
  fireEvent.click(button);
  await screen.findByText("已匯入到目前帳號。原本的瀏覽器紀錄保留。");
  expect(localStorage.getItem("english-reps.progress.v1")).toBe(original);
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
