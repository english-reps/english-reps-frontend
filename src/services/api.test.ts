import { beforeEach, expect, it, vi } from "vitest";
import { ApiError, request, resetCsrf } from "./api";
beforeEach(() => resetCsrf());
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
it("bootstraps CSRF and includes cookies and cancellation without putting credentials in storage", async () => {
  const signal = new AbortController().signal;
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(json({ csrf_token: "csrf-1" }))
    .mockResolvedValueOnce(json({ saved: true }));
  vi.stubGlobal("fetch", fetcher);
  await request("/progress/events", {
    method: "POST",
    body: { event_id: "same-id" },
    signal,
  });
  expect(fetcher).toHaveBeenLastCalledWith(
    "/api/v1/progress/events",
    expect.objectContaining({
      credentials: "same-origin",
      signal,
      headers: expect.objectContaining({ "X-CSRF-Token": "csrf-1" }),
    }),
  );
  expect(localStorage.length).toBe(0);
});
it("reports structured errors and expires authentication after a private 401", async () => {
  const expired = vi.fn();
  window.addEventListener("english-reps:session-expired", expired);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      json(
        {
          error: { message: "請先登入", code: "unauthenticated" },
          request_id: "r-1",
        },
        401,
      ),
    ),
  );
  await expect(request("/progress")).rejects.toMatchObject({
    status: 401,
    code: "unauthenticated",
    requestId: "r-1",
  });
  expect(expired).toHaveBeenCalledOnce();
  window.removeEventListener("english-reps:session-expired", expired);
});
it("handles empty logout responses and malformed server pages", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(json({ csrf_token: "csrf" }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response("<html>bad gateway</html>", { status: 502 }),
      ),
  );
  await expect(
    request("/auth/logout", { method: "POST" }),
  ).resolves.toBeUndefined();
  await expect(request("/catalog/listening")).rejects.toBeInstanceOf(ApiError);
});
