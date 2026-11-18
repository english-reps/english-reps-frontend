import { useEffect, useState } from "react";
import type { Category } from "../domain/types";
import { errorMessage, request } from "./api";

async function loadFallback<T>(category: Category): Promise<T[]> {
  if (category === "listening") {
    const data = await import("../../data/listening.js");
    return data.default.entries as unknown as T[];
  }
  const data = await import("../../data/vocabulary.json");
  return data.default.entries as unknown as T[];
}

export function useCatalog<T>(category: Category) {
  const [entries, setEntries] = useState<T[]>([]),
    [error, setError] = useState(""),
    [offline, setOffline] = useState(false),
    [loading, setLoading] = useState(true),
    [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setOffline(false);
    request<{ entries: T[] }>(`/catalog/${category}`, {
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) {
          setEntries(result.entries);
          setOffline(false);
        }
      })
      .catch(async (apiError) => {
        if (controller.signal.aborted) return;
        try {
          const fallback = await loadFallback<T>(category);
          if (!controller.signal.aborted) {
            setEntries(fallback);
            setOffline(true);
          }
        } catch {
          if (!controller.signal.aborted) setError(errorMessage(apiError));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [category, version]);
  return {
    entries,
    error,
    offline,
    loading,
    retry: () => setVersion(version + 1),
  };
}
