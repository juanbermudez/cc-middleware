/**
 * Session lifecycle manager.
 * Tracks active sessions launched by this middleware instance.
 * Provides launch, abort, and lifecycle event capabilities.
 */

import EventEmitter from "eventemitter3";
import { launchSession } from "./launcher.js";
import { launchStreamingSession } from "./streaming.js";
import type { LaunchOptions, LaunchResult } from "./launcher.js";
import type { StreamingSession } from "./streaming.js";

/** An active session tracked by the manager */
export interface TrackedSession {
  sessionId: string;
  startedAt: number;
  prompt: string;
  cwd?: string;
  abortController: AbortController;
  status: "running" | "completed" | "errored" | "aborted";
  result?: LaunchResult;
  error?: Error;
}

/** Events emitted by the session manager */
export interface SessionManagerEvents {
  "session:started": [session: TrackedSession];
  "session:completed": [result: LaunchResult, session: TrackedSession];
  "session:errored": [error: Error, session: TrackedSession];
  "session:aborted": [session: TrackedSession];
}

/**
 * Central session manager that tracks and controls active sessions.
 */
export class SessionManager extends EventEmitter<SessionManagerEvents> {
  private sessions = new Map<string, TrackedSession>();

  /**
   * Get all active (running) sessions.
   */
  getActiveSessions(): TrackedSession[] {
    return Array.from(this.sessions.values()).filter(
      (s) => s.status === "running"
    );
  }

  /**
   * Get a tracked session by ID.
   */
  getSession(sessionId: string): TrackedSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Launch a session and track it.
   */
  async launch(options: LaunchOptions): Promise<LaunchResult> {
    const abortController = options.abortController ?? new AbortController();
    const tempId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const tracked: TrackedSession = {
      sessionId: tempId,
      startedAt: Date.now(),
      prompt: options.prompt,
      cwd: options.cwd,
      abortController,
      status: "running",
    };

    this.sessions.set(tempId, tracked);
    this.emit("session:started", tracked);

    try {
      const result = await launchSession({
        ...options,
        abortController,
      });

      // Update with real session ID
      this.sessions.delete(tempId);
      tracked.sessionId = result.sessionId;
      tracked.status = "completed";
      tracked.result = result;
      this.sessions.set(result.sessionId, tracked);

      this.emit("session:completed", result, tracked);
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      if (abortController.signal.aborted) {
        tracked.status = "aborted";
        this.emit("session:aborted", tracked);
      } else {
        tracked.status = "errored";
        tracked.error = err;
        this.emit("session:errored", err, tracked);
      }

      throw err;
    }
  }

  /**
   * Launch a streaming session and track it.
   */
  async launchStreaming(options: LaunchOptions): Promise<StreamingSession> {
    const abortController = options.abortController ?? new AbortController();
    const tempId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const tracked: TrackedSession = {
      sessionId: tempId,
      startedAt: Date.now(),
      prompt: options.prompt,
      cwd: options.cwd,
      abortController,
      status: "running",
    };

    this.sessions.set(tempId, tracked);
    this.emit("session:started", tracked);

    const session = await launchStreamingSession({
      ...options,
      abortController,
    });

    // Update session ID once available (after first event)
    session.result
      .then((result) => {
        this.sessions.delete(tempId);
        tracked.sessionId = result.sessionId;
        tracked.status = "completed";
        tracked.result = result;
        this.sessions.set(result.sessionId, tracked);
        this.emit("session:completed", result, tracked);
      })
      .catch((error) => {
        const err = error instanceof Error ? error : new Error(String(error));
        if (abortController.signal.aborted) {
          tracked.status = "aborted";
          this.emit("session:aborted", tracked);
        } else {
          tracked.status = "errored";
          tracked.error = err;
          this.emit("session:errored", err, tracked);
        }
      });

    return session;
  }

  /**
   * Abort a session by ID using its AbortController.
   */
  async abort(sessionId: string): Promise<void> {
    const session = this.findSession(sessionId);
    if (session && session.status === "running") {
      session.abortController.abort();
    }
  }

  /**
   * Abort all active sessions.
   */
  async abortAll(): Promise<void> {
    for (const session of this.getActiveSessions()) {
      session.abortController.abort();
    }
  }

  /**
   * Find a session by ID or pending ID.
   */
  private findSession(sessionId: string): TrackedSession | undefined {
    // Try direct lookup first
    const direct = this.sessions.get(sessionId);
    if (direct) return direct;

    // Search by pending ID prefix match
    for (const session of this.sessions.values()) {
      if (session.sessionId === sessionId) {
        return session;
      }
    }
    return undefined;
  }

  /**
   * Clean up all sessions and remove listeners.
   */
  async destroy(): Promise<void> {
    await this.abortAll();
    this.sessions.clear();
    this.removeAllListeners();
  }
}

/**
 * Create a new session manager.
 */
export function createSessionManager(): SessionManager {
  return new SessionManager();
}
