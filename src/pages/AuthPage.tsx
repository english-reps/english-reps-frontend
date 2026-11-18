import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { errorMessage } from "../services/api";
export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const { user, loading, authenticate } = useAuth();
  const navigate = useNavigate(),
    location = useLocation();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const destination =
    typeof location.state?.from === "string" &&
    location.state.from.startsWith("/") &&
    !location.state.from.startsWith("//")
      ? location.state.from
      : "/practice";
  if (user && !loading) return <Navigate to={destination} replace />;
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await authenticate(mode, email, password);
      navigate(destination, { replace: true });
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="auth-panel study-panel">
      <p className="eyebrow">YOUR PROGRESS, EVERYWHERE.</p>
      <h1>{mode === "login" ? "歡迎回來" : "建立你的練習帳號"}</h1>
      <p>儲存單字、聽力與錯題進度，換裝置也能接著練。</p>
      <form onSubmit={submit}>
        <label htmlFor="email">電子信箱</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <label htmlFor="password">密碼（12～128 字元）</label>
        <input
          id="password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          required
          minLength={12}
          maxLength={128}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p role="alert">{error}</p>}
        <button className="button primary" disabled={busy || loading}>
          {busy ? "處理中…" : mode === "login" ? "登入" : "註冊並開始練習"}
        </button>
      </form>
      <p>
        {mode === "login" ? (
          <Link to="/register" state={location.state}>
            還沒有帳號？建立帳號
          </Link>
        ) : (
          <Link to="/login" state={location.state}>
            已有帳號？登入
          </Link>
        )}
      </p>
      <p className="local-note">目前尚未提供密碼重設，請妥善保存密碼。</p>
    </section>
  );
}
