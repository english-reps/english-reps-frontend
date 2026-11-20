import { beforeEach, expect, it, vi } from "vitest";
import { loadWakeUrl, resetWakeState, triggerDirectWake } from "./wake";

beforeEach(() => {
  resetWakeState();
});

it("loads and validates HTTPS wake_url from /api-wake-config.json and caches it", async () => {
  const fetcher = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        wake_url:
          "https://english-reps-api-staging-uvmg.onrender.com/api/v1/health/live",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );
  vi.stubGlobal("fetch", fetcher);

  await expect(loadWakeUrl()).resolves.toBe(
    "https://english-reps-api-staging-uvmg.onrender.com/api/v1/health/live",
  );
  await expect(loadWakeUrl()).resolves.toBe(
    "https://english-reps-api-staging-uvmg.onrender.com/api/v1/health/live",
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("rejects non-HTTPS or unexpected paths in wake_url", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ wake_url: "http://api:8000/api/v1/health/live" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
  await expect(loadWakeUrl()).resolves.toBe("");
});

it("sends a credential-free no-cors wake request and deduplicates concurrent triggers", async () => {
  let resolveWake!: (value: Response) => void;
  const wakePromise = new Promise<Response>((resolve) => {
    resolveWake = resolve;
  });
  const fetcher = vi.fn((input: string) => {
    if (input === "/api-wake-config.json") {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            wake_url:
              "https://english-reps-api-staging-uvmg.onrender.com/api/v1/health/live",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    }
    return wakePromise;
  });
  vi.stubGlobal("fetch", fetcher);

  const first = triggerDirectWake();
  const second = triggerDirectWake();
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(fetcher).toHaveBeenLastCalledWith(
    "https://english-reps-api-staging-uvmg.onrender.com/api/v1/health/live",
    expect.objectContaining({
      method: "GET",
      mode: "no-cors",
      cache: "no-store",
      credentials: "omit",
    }),
  );

  resolveWake(new Response(null, { status: 200 }));
  await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
});
