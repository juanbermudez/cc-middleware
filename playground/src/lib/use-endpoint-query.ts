import { useDeferredValue, useEffect, useState } from "react";

export function useEndpointQuery<T>(path: string) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const trimmedQuery = deferredQuery.trim();
    const params = new URLSearchParams();
    if (trimmedQuery) {
      params.set("q", trimmedQuery);
    }

    const url = params.size > 0 ? `${path}?${params.toString()}` : path;
    setLoading(true);
    setError(null);

    fetch(url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const text = await response.text();
          throw new Error(`${response.status} ${response.statusText}: ${text}`.trim());
        }
        return response.json() as Promise<T>;
      })
      .then((payload) => {
        setData(payload);
      })
      .catch((fetchError: unknown) => {
        if ((fetchError as { name?: string }).name === "AbortError") {
          return;
        }

        setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [path, deferredQuery, reloadToken]);

  return {
    query,
    setQuery,
    deferredQuery,
    data,
    loading,
    error,
    reload: () => setReloadToken((current) => current + 1),
  };
}
