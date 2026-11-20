export const UPSTREAM_UNAVAILABLE_EVENT = "english-reps:upstream-unavailable";
export const BACKEND_READY_EVENT = "english-reps:backend-ready";

const VALID_WAKE_URL = /^https:\/\/[A-Za-z0-9.-]+(?::\d+)?\/api\/v1\/health\/live$/;

let cachedWakeUrl: string | undefined;
let wakeUrlRequest: Promise<string> | undefined;
let inFlightWake: Promise<boolean> | undefined;

export function isGatewayStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504;
}

export function resetWakeState() {
  cachedWakeUrl = undefined;
  wakeUrlRequest = undefined;
  inFlightWake = undefined;
}

export async function loadWakeUrl(signal?: AbortSignal): Promise<string> {
  if (cachedWakeUrl !== undefined) return cachedWakeUrl;
  if (!wakeUrlRequest) {
    wakeUrlRequest = fetch("/api-wake-config.json", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          if (response.status === 404) cachedWakeUrl = "";
          return "";
        }
        const data = (await response.json()) as { wake_url?: unknown };
        const value =
          typeof data?.wake_url === "string" ? data.wake_url.trim() : "";
        const valid = VALID_WAKE_URL.test(value) ? value : "";
        cachedWakeUrl = valid;
        return valid;
      })
      .catch(() => "")
      .finally(() => {
        wakeUrlRequest = undefined;
      });
  }
  return wakeUrlRequest;
}

export async function triggerDirectWake(signal?: AbortSignal): Promise<boolean> {
  const wakeUrl = await loadWakeUrl(signal);
  if (!wakeUrl || signal?.aborted) return false;
  if (!inFlightWake) {
    inFlightWake = fetch(wakeUrl, {
      method: "GET",
      mode: "no-cors",
      cache: "no-store",
      credentials: "omit",
      signal,
    })
      .then(() => true)
      .catch(() => false)
      .finally(() => {
        inFlightWake = undefined;
      });
  }
  return inFlightWake;
}

export function sleepAbortable(
  ms: number,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timer = window.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timer);
      resolve();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
