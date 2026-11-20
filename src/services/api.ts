import { isGatewayStatus, UPSTREAM_UNAVAILABLE_EVENT } from "./wake";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "request_failed",
    public requestId?: string,
  ) {
    super(message);
  }
}
let csrf: string | undefined;
let csrfRequest: Promise<string> | undefined;
export function resetCsrf() {
  csrf = undefined;
  csrfRequest = undefined;
}
export function setCsrf(token: string) {
  csrf = token;
}
async function csrfToken(): Promise<string> {
  if (csrf) return csrf;
  if (!csrfRequest)
    csrfRequest = request<{ csrf_token: string }>("/auth/csrf")
      .then((result) => {
        csrf = result.csrf_token;
        return csrf;
      })
      .finally(() => {
        csrfRequest = undefined;
      });
  return csrfRequest;
}
export async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const method = options.method || "GET";
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET") headers["X-CSRF-Token"] = await csrfToken();
  const response = await fetch(`/api/v1${path}`, {
    method,
    credentials: "same-origin",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });
  if (response.status === 204) return undefined as T;
  let data;
  try {
    data = await response.json();
  } catch {
    const gatewayStatus = isGatewayStatus(response.status);
    if (gatewayStatus)
      window.dispatchEvent(
        new CustomEvent(UPSTREAM_UNAVAILABLE_EVENT, {
          detail: { status: response.status },
        }),
      );
    throw new ApiError(
      response.status || 502,
      gatewayStatus
        ? `後端服務正在喚醒或暫時無回應（HTTP ${response.status}），請稍候幾秒重試。`
        : "服務回應無法讀取，請稍後重試。",
      gatewayStatus ? "upstream_unavailable" : "request_failed",
    );
  }
  if (!response.ok) {
    if (
      response.status === 401 &&
      (!path.startsWith("/auth/") || path === "/auth/logout")
    )
      window.dispatchEvent(new Event("english-reps:session-expired"));
    if (response.status === 403) resetCsrf();
    throw new ApiError(
      response.status,
      data.error?.message || "請求失敗，請稍後重試。",
      data.error?.code,
      data.request_id,
    );
  }
  return data as T;
}
export function errorMessage(error: unknown) {
  return error instanceof ApiError
    ? error.message
    : "連線失敗，請確認網路後重試。";
}
