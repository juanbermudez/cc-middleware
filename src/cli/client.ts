/**
 * HTTP client for talking to the CC-Middleware API.
 * Uses native fetch (Node 18+). All paths are relative to the base URL.
 */

/** Error from the middleware API */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    const msg =
      typeof body === "object" && body !== null && "error" in body
        ? (body as { error: { message?: string } }).error?.message ?? `HTTP ${status}`
        : `HTTP ${status}`;
    super(msg);
    this.name = "ApiError";
  }
}

/** Lightweight HTTP client wrapper for the middleware REST API */
export class MiddlewareClient {
  constructor(private baseUrl: string) {}

  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(path, this.baseUrl);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, v);
      }
    }
    const res = await fetch(url.toString());
    if (!res.ok) {
      let body: unknown;
      try { body = await res.json(); } catch { body = { error: { message: await res.text() } }; }
      throw new ApiError(res.status, body);
    }
    return res.json() as Promise<T>;
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    const url = new URL(path, this.baseUrl);
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let errBody: unknown;
      try { errBody = await res.json(); } catch { errBody = { error: { message: await res.text() } }; }
      throw new ApiError(res.status, errBody);
    }
    const text = await res.text();
    if (!text) return {} as T;
    return JSON.parse(text) as T;
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    const url = new URL(path, this.baseUrl);
    const res = await fetch(url.toString(), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let errBody: unknown;
      try { errBody = await res.json(); } catch { errBody = { error: { message: await res.text() } }; }
      throw new ApiError(res.status, errBody);
    }
    const text = await res.text();
    if (!text) return {} as T;
    return JSON.parse(text) as T;
  }

  async delete<T>(path: string): Promise<T> {
    const url = new URL(path, this.baseUrl);
    const res = await fetch(url.toString(), { method: "DELETE" });
    if (!res.ok) {
      let errBody: unknown;
      try { errBody = await res.json(); } catch { errBody = { error: { message: await res.text() } }; }
      throw new ApiError(res.status, errBody);
    }
    const text = await res.text();
    if (!text) return {} as T;
    return JSON.parse(text) as T;
  }

  /** Check if the middleware server is reachable */
  async isRunning(): Promise<boolean> {
    try {
      await this.get("/health");
      return true;
    } catch {
      return false;
    }
  }

  /** Wait for the server to become ready, polling every 500ms */
  async waitForReady(timeoutMs = 10_000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (await this.isRunning()) return;
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`Server did not become ready within ${timeoutMs}ms`);
  }

  /** The base URL of the server */
  get url(): string {
    return this.baseUrl;
  }
}
