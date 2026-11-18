import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./AuthContext";
import type { EventResult, Progress, StudyEvent } from "../domain/types";
import { errorMessage, request } from "../services/api";
interface Data {
  records: Progress[];
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  submit: (event: StudyEvent) => Promise<EventResult>;
}
const Context = createContext<Data | null>(null);
export function ProgressProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [saved, setSaved] = useState<{ owner: string; records: Progress[] }>({
    owner: "",
    records: [],
  });
  const [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const current = useRef(user?.id);
  current.current = user?.id;
  const revision = useRef(0),
    refreshNumber = useRef(0);
  const owner = user?.id;
  const refresh = useCallback(async () => {
    if (!owner) {
      setSaved({ owner: "", records: [] });
      return;
    }
    setLoading(true);
    setError("");
    const startedAt = revision.current,
      number = ++refreshNumber.current;
    try {
      const data = await request<{ records: Progress[] }>("/progress");
      if (
        current.current === owner &&
        startedAt === revision.current &&
        number === refreshNumber.current
      )
        setSaved({ owner, records: data.records });
    } catch (error) {
      if (current.current === owner) setError(errorMessage(error));
    } finally {
      if (current.current === owner) setLoading(false);
    }
  }, [owner]);
  useEffect(() => {
    setSaved({ owner: "", records: [] });
    setError("");
    setLoading(false);
    void refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);
  async function submit(event: StudyEvent) {
    if (!owner) throw new Error("Login required");
    const result = await request<EventResult>("/progress/events", {
      method: "POST",
      body: event,
    });
    if (current.current !== owner) throw new Error("Account changed");
    revision.current++;
    setSaved((previous) => ({
      owner,
      records: [
        ...(previous.owner === owner ? previous.records : []).filter(
          (row) => row.entry_id !== result.record.entry_id,
        ),
        result.record,
      ],
    }));
    return result;
  }
  return (
    <Context.Provider
      value={{
        records: saved.owner === owner ? saved.records : [],
        loading,
        error,
        refresh,
        submit,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useProgress() {
  const value = useContext(Context);
  if (!value) throw new Error("ProgressProvider missing");
  return value;
}
