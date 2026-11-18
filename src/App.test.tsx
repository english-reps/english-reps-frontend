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
  resetCsrf();
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
      if (path.endsWith("/catalog/listening"))
        return json({ entries: listening.entries });
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
it("listening navigation opens the real page, gates answers until audio ends and hides transcripts until answered", async () => {
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
  const question = listening.entries.find((row) =>
    utterances[0].text.startsWith(row.prompt),
  )!;
  expect(screen.queryByText(question.prompt)).not.toBeInTheDocument();
  utterances[0].onend?.(new Event("end") as SpeechSynthesisEvent);
  await waitFor(() => expect(option).toBeEnabled());
  fireEvent.click(option);
  expect(await screen.findByText(question.prompt)).toBeInTheDocument();
  expect(events).toHaveLength(0); // Guest practice never writes account data.
});
it("library search finds English and Chinese and supports direct routes", async () => {
  open("/library");
  await screen.findByText("找到 1,000 個單字");
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
