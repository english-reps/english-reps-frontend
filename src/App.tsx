import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { Navigate, NavLink, Outlet, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ProgressProvider } from "./contexts/ProgressContext";
import { AuthPage } from "./pages/AuthPage";
import { PracticePage } from "./pages/PracticePage";
import { ListeningPage } from "./pages/ListeningPage";
import { ReadingPage } from "./pages/ReadingPage";
import { MockExamPage } from "./pages/MockExamPage";
import { LibraryPage } from "./pages/LibraryPage";
import { ProgressPage } from "./pages/ProgressPage";
import { ErrorNotice, Loading } from "./components/Common";
import { ApiError, errorMessage, request } from "./services/api";
import {
  BACKEND_READY_EVENT,
  isGatewayStatus,
  sleepAbortable,
  triggerDirectWake,
  UPSTREAM_UNAVAILABLE_EVENT,
} from "./services/wake";

const WAKE_POLL_INTERVAL_MS = 4000;
const MAX_WAKE_ATTEMPTS = 24;

class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main>
        <h1>頁面暫時無法顯示</h1>
        <button
          className="button primary"
          onClick={() => window.location.reload()}
        >
          重新載入
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
function Layout() {
  const auth = useAuth(),
    [logoutError, setLogoutError] = useState(""),
    [busy, setBusy] = useState(false),
    [health, setHealth] = useState("檢查服務中…"),
    wakingRef = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    async function wakeAndRecover(initialStatus: number) {
      if (wakingRef.current || signal.aborted) return;
      wakingRef.current = true;
      let lastStatus = initialStatus;
      try {
        setHealth(
          `後端喚醒中或暫時無回應（${lastStatus}），正在自動喚醒並重新連線…`,
        );
        let wakePromise: Promise<boolean> | undefined =
          triggerDirectWake(signal);
        for (
          let attempt = 1;
          attempt <= MAX_WAKE_ATTEMPTS && !signal.aborted;
          attempt++
        ) {
          if (wakePromise) {
            const waitController = new AbortController();
            const abortWait = () => waitController.abort();
            signal.addEventListener("abort", abortWait, { once: true });
            let wakeResolved: "woke" | "none" | "timeout";
            try {
              wakeResolved = await Promise.race([
                wakePromise.then((woke): "woke" | "none" =>
                  woke ? "woke" : "none",
                ),
                sleepAbortable(
                  WAKE_POLL_INTERVAL_MS,
                  waitController.signal,
                ).then((): "timeout" => "timeout"),
              ]);
            } finally {
              waitController.abort();
              signal.removeEventListener("abort", abortWait);
            }
            if (wakeResolved === "woke") {
              wakePromise = undefined;
            } else if (wakeResolved === "none") {
              wakePromise = undefined;
              await sleepAbortable(WAKE_POLL_INTERVAL_MS, signal);
            }
          } else {
            if (attempt === 6 || attempt === 12) {
              wakePromise = triggerDirectWake(signal);
            }
            await sleepAbortable(WAKE_POLL_INTERVAL_MS, signal);
          }
          if (signal.aborted) return;
          try {
            await request("/health/ready", { signal });
            if (signal.aborted) return;
            setHealth("服務已連線");
            window.dispatchEvent(new Event(BACKEND_READY_EVENT));
            return;
          } catch (error) {
            if (signal.aborted) return;
            if (error instanceof ApiError && isGatewayStatus(error.status)) {
              lastStatus = error.status;
              setHealth(
                `後端喚醒中或暫時無回應（${lastStatus}），正在自動喚醒並重新連線…`,
              );
              continue;
            }
            setHealth("服務暫時無法連線");
            return;
          }
        }
        if (!signal.aborted)
          setHealth(`後端喚醒逾時或暫時無回應（${lastStatus}）`);
      } finally {
        wakingRef.current = false;
      }
    }

    const onUpstreamUnavailable = (event: Event) => {
      const status =
        event instanceof CustomEvent &&
        typeof event.detail?.status === "number"
          ? event.detail.status
          : 502;
      void wakeAndRecover(status);
    };
    window.addEventListener(UPSTREAM_UNAVAILABLE_EVENT, onUpstreamUnavailable);

    request("/health/ready", { signal })
      .then(() => {
        if (!signal.aborted) setHealth("服務已連線");
      })
      .catch((error) => {
        if (signal.aborted) return;
        if (error instanceof ApiError && isGatewayStatus(error.status)) {
          void wakeAndRecover(error.status);
        } else {
          setHealth("服務暫時無法連線");
        }
      });
    return () => {
      window.removeEventListener(
        UPSTREAM_UNAVAILABLE_EVENT,
        onUpstreamUnavailable,
      );
      controller.abort();
    };
  }, []);
  async function logout() {
    setBusy(true);
    setLogoutError("");
    try {
      await auth.logout();
    } catch (error) {
      setLogoutError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <a className="skip-link" href="#main">
        跳至主要內容
      </a>
      <header className="site-header">
        <div className="header-inner">
          <NavLink className="brand" to="/practice">
            <span className="brand-mark">
              er<span>.</span>
            </span>
            <span>
              English Reps<small>A LITTLE EVERY DAY.</small>
            </span>
          </NavLink>
          <nav aria-label="主要導覽">
            {[
              ["/practice", "單字練習"],
              ["/listening", "聽力練習"],
              ["/reading", "閱讀練習"],
              ["/mock-exam", "模擬測驗"],
              ["/library", "單字庫"],
              ["/progress", "我的進度"],
            ].map(([path, label]) => (
              <NavLink
                className={({ isActive }) =>
                  `nav-button ${isActive ? "active" : ""}`
                }
                to={path}
                key={path}
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="account-nav">
            {auth.loading ? (
              <span>連線中…</span>
            ) : auth.user ? (
              <>
                <span className="account-email">{auth.user.email}</span>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => void logout()}
                >
                  {busy ? "登出中…" : "登出"}
                </button>
              </>
            ) : (
              <NavLink to="/login" className="button secondary small">
                登入 / 註冊
              </NavLink>
            )}
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        {auth.error && (
          <ErrorNotice message={auth.error} retry={() => void auth.refresh()} />
        )}{" "}
        {logoutError && <ErrorNotice message={logoutError} />}
        {auth.loading ? <Loading /> : <Outlet />}
      </main>
      <footer className="site-footer">
        <span>English Reps · 每天一點英文進步</span>
        <span role="status">{health}</span>
      </footer>
    </>
  );
}
export function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ProgressProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route
                index
                element={
                  <Navigate
                    to={
                      window.location.hash === "#listening"
                        ? "/listening"
                        : window.location.hash === "#reading"
                          ? "/reading"
                          : window.location.hash === "#mock-exam"
                            ? "/mock-exam"
                            : window.location.hash === "#library"
                              ? "/library"
                              : "/practice"
                    }
                    replace
                  />
                }
              />
              <Route path="practice" element={<PracticePage />} />
              <Route path="listening" element={<ListeningPage />} />
              <Route path="reading" element={<ReadingPage />} />
              <Route path="mock-exam" element={<MockExamPage />} />
              <Route path="mock-exam/:examId" element={<MockExamPage />} />
              <Route path="library" element={<LibraryPage />} />
              <Route path="progress" element={<ProgressPage />} />
              <Route path="login" element={<AuthPage mode="login" />} />
              <Route path="register" element={<AuthPage mode="register" />} />
              <Route
                path="*"
                element={
                  <section className="empty-state">
                    <h1>找不到這個頁面</h1>
                    <NavLink to="/practice">回到單字練習</NavLink>
                  </section>
                }
              />
            </Route>
          </Routes>
        </ProgressProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
