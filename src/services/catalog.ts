import { useEffect, useState } from "react";
import type { Category } from "../domain/types";
import { errorMessage, request } from "./api";
export function useCatalog<T>(category: Category) {
  const [entries, setEntries] = useState<T[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    request<{ entries: T[] }>(`/catalog/${category}`, {
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) setEntries(result.entries);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(errorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [category, version]);
  return { entries, error, loading, retry: () => setVersion(version + 1) };
}
