import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { User } from "../domain/types";
import { ApiError, request, resetCsrf, setCsrf } from "../services/api";
import { BACKEND_READY_EVENT, isGatewayStatus } from "../services/wake";
interface Auth {
  user: User | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  authenticate: (
    mode: "login" | "register",
    email: string,
    password: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
}
const Context = createContext<Auth | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const needsRecovery = useRef(false);
  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setUser(await request<User>("/auth/me"));
      needsRecovery.current = false;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
        needsRecovery.current = false;
      } else if (error instanceof ApiError && isGatewayStatus(error.status)) {
        needsRecovery.current = true;
        setError(
          `帳號服務正在喚醒或暫時無回應（HTTP ${error.status}），正在自動重試，可先訪客練習。`,
        );
      } else {
        needsRecovery.current = true;
        setError("帳號服務暫時無法連線。");
      }
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const expired = () => {
      setUser(null);
      resetCsrf();
      needsRecovery.current = false;
      setError("登入已過期，請重新登入。");
    };
    const recovered = () => {
      if (needsRecovery.current) void refresh();
    };
    window.addEventListener("english-reps:session-expired", expired);
    window.addEventListener(BACKEND_READY_EVENT, recovered);
    return () => {
      window.removeEventListener("english-reps:session-expired", expired);
      window.removeEventListener(BACKEND_READY_EVENT, recovered);
    };
  }, [refresh]);
  async function authenticate(
    mode: "login" | "register",
    email: string,
    password: string,
  ) {
    const result = await request<{ user: User; csrf_token: string }>(
      `/auth/${mode}`,
      { method: "POST", body: { email, password } },
    );
    setCsrf(result.csrf_token);
    setUser(result.user);
    setError("");
  }
  async function logout() {
    await request("/auth/logout", { method: "POST" });
    setUser(null);
    setError("");
    resetCsrf();
  }
  return (
    <Context.Provider
      value={{ user, loading, error, refresh, authenticate, logout }}
    >
      {children}
    </Context.Provider>
  );
}
export function useAuth() {
  const context = useContext(Context);
  if (!context) throw new Error("AuthProvider missing");
  return context;
}
