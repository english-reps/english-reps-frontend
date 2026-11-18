import { Component, useEffect, useState, type ReactNode } from "react";
import { Navigate, NavLink, Outlet, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ProgressProvider } from "./contexts/ProgressContext";
import { AuthPage } from "./pages/AuthPage";
import { PracticePage } from "./pages/PracticePage";
import { ListeningPage } from "./pages/ListeningPage";
import { LibraryPage } from "./pages/LibraryPage";
import { ProgressPage } from "./pages/ProgressPage";
import { ErrorNotice, Loading } from "./components/Common";
import { ApiError, errorMessage, request } from "./services/api";
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
    [health, setHealth] = useState("檢查服務中…");
  useEffect(() => {
    const controller = new AbortController();
    request("/health/ready", { signal: controller.signal })
      .then(() => setHealth("服務已連線"))
      .catch((error) => {
        if (controller.signal.aborted) return;
        const waking =
          error instanceof ApiError &&
          (error.status === 502 ||
            error.status === 503 ||
            error.status === 504);
        setHealth(
          waking ? `後端喚醒中或暫時無回應（${error.status}）` : "服務暫時無法連線",
        );
      });
    return () => controller.abort();
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
