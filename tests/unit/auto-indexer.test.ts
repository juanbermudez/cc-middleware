/**
 * Unit tests for the incremental auto-indexer.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { EventEmitter } from "eventemitter3";
import { AutoIndexer } from "../../src/sync/auto-indexer.js";
import type { SessionWatcher, SessionWatcherEvents, SessionWatchEvent } from "../../src/sync/session-watcher.js";
import type { SessionStore } from "../../src/store/db.js";
import type { SessionIndexer } from "../../src/store/indexer.js";

/** Create a mock session watcher (just an EventEmitter) */
function createMockWatcher(): SessionWatcher {
  return new EventEmitter() as unknown as SessionWatcher;
}

/** Create a mock indexer */
function createMockIndexer() {
  const indexed: string[] = [];
  return {
    indexSession: vi.fn(async (sessionId: string) => {
      indexed.push(sessionId);
    }),
    indexed,
    fullIndex: vi.fn(async () => ({ sessionsIndexed: 0, messagesIndexed: 0, errors: [], durationMs: 0 })),
    incrementalIndex: vi.fn(async () => ({ sessionsIndexed: 0, messagesIndexed: 0, errors: [], durationMs: 0 })),
    getStats: vi.fn(() => ({ totalSessions: 0, totalMessages: 0 })),
  } as unknown as SessionIndexer & { indexed: string[] };
}

describe("AutoIndexer", () => {
  let watcher: SessionWatcher;
  let indexer: SessionIndexer & { indexed: string[] };
  let autoIndexer: AutoIndexer;

  beforeEach(() => {
    watcher = createMockWatcher();
    indexer = createMockIndexer();
  });

  afterEach(() => {
    if (autoIndexer) {
      autoIndexer.stop();
    }
  });

  it("should index new sessions immediately on session:discovered", async () => {
    autoIndexer = new AutoIndexer({
      sessionWatcher: watcher,
      store: {} as SessionStore,
      indexer,
      batchIntervalMs: 10000,
    });
    autoIndexer.start();

    // Emit a discovered event
    (watcher as unknown as EventEmitter<SessionWatcherEvents>).emit("session:discovered", {
      sessionId: "new-session-1",
      filePath: "/some/path/new-session-1.jsonl",
      projectDir: "/some/path",
      timestamp: Date.now(),
    } satisfies SessionWatchEvent);

    // Give it a tick to process
    await new Promise((r) => setTimeout(r, 50));

    expect(indexer.indexed).toContain("new-session-1");
    expect(autoIndexer.getStats().sessionsIndexed).toBe(1);
  });

  it("should batch session:updated events", async () => {
    autoIndexer = new AutoIndexer({
      sessionWatcher: watcher,
      store: {} as SessionStore,
      indexer,
      batchIntervalMs: 500,
    });
    autoIndexer.start();

    const emitter = watcher as unknown as EventEmitter<SessionWatcherEvents>;

    // Emit multiple updates for the same session
    for (let i = 0; i < 5; i++) {
      emitter.emit("session:updated", {
        sessionId: "updated-session",
        filePath: "/path/updated-session.jsonl",
        projectDir: "/path",
        timestamp: Date.now(),
      } satisfies SessionWatchEvent);
    }

    // Should not be indexed yet (batched)
    expect(indexer.indexed).toHaveLength(0);

    // Wait for batch flush
    await new Promise((r) => setTimeout(r, 700));

    // Should have been indexed exactly once (deduped via Set)
    expect(indexer.indexed).toContain("updated-session");
    expect(indexer.indexed.filter((id) => id === "updated-session")).toHaveLength(1);
  });

  it("should batch multiple different sessions", async () => {
    autoIndexer = new AutoIndexer({
      sessionWatcher: watcher,
      store: {} as SessionStore,
      indexer,
      batchIntervalMs: 500,
    });
    autoIndexer.start();

    const emitter = watcher as unknown as EventEmitter<SessionWatcherEvents>;

    // Emit updates for 3 different sessions
    emitter.emit("session:updated", {
      sessionId: "sess-a",
      filePath: "/path/sess-a.jsonl",
      projectDir: "/path",
      timestamp: Date.now(),
    } satisfies SessionWatchEvent);

    emitter.emit("session:updated", {
      sessionId: "sess-b",
      filePath: "/path/sess-b.jsonl",
      projectDir: "/path",
      timestamp: Date.now(),
    } satisfies SessionWatchEvent);

    emitter.emit("session:updated", {
      sessionId: "sess-c",
      filePath: "/path/sess-c.jsonl",
      projectDir: "/path",
      timestamp: Date.now(),
    } satisfies SessionWatchEvent);

    // Wait for batch flush
    await new Promise((r) => setTimeout(r, 700));

    expect(indexer.indexed).toContain("sess-a");
    expect(indexer.indexed).toContain("sess-b");
    expect(indexer.indexed).toContain("sess-c");
  });

  it("should report stats correctly", async () => {
    autoIndexer = new AutoIndexer({
      sessionWatcher: watcher,
      store: {} as SessionStore,
      indexer,
      batchIntervalMs: 10000,
    });

    const stats = autoIndexer.getStats();
    expect(stats.running).toBe(false);
    expect(stats.sessionsIndexed).toBe(0);
    expect(stats.indexErrors).toBe(0);
    expect(stats.pendingBatch).toBe(0);

    autoIndexer.start();
    expect(autoIndexer.getStats().running).toBe(true);

    // Add a pending update
    (watcher as unknown as EventEmitter<SessionWatcherEvents>).emit("session:updated", {
      sessionId: "pending-session",
      filePath: "/path/pending-session.jsonl",
      projectDir: "/path",
      timestamp: Date.now(),
    } satisfies SessionWatchEvent);

    expect(autoIndexer.getStats().pendingBatch).toBe(1);
  });

  it("should handle indexing errors gracefully", async () => {
    // Make the indexer throw
    const failIndexer = {
      indexSession: vi.fn(async () => {
        throw new Error("Session not found");
      }),
      indexed: [],
    } as unknown as SessionIndexer & { indexed: string[] };

    autoIndexer = new AutoIndexer({
      sessionWatcher: watcher,
      store: {} as SessionStore,
      indexer: failIndexer,
      batchIntervalMs: 10000,
    });
    autoIndexer.start();

    (watcher as unknown as EventEmitter<SessionWatcherEvents>).emit("session:discovered", {
      sessionId: "bad-session",
      filePath: "/path/bad-session.jsonl",
      projectDir: "/path",
      timestamp: Date.now(),
    } satisfies SessionWatchEvent);

    await new Promise((r) => setTimeout(r, 50));

    // Should not throw, just increment error count
    expect(autoIndexer.getStats().indexErrors).toBe(1);
    expect(autoIndexer.getStats().sessionsIndexed).toBe(0);
  });

  it("should stop cleanly and stop listening to events", async () => {
    autoIndexer = new AutoIndexer({
      sessionWatcher: watcher,
      store: {} as SessionStore,
      indexer,
      batchIntervalMs: 10000,
    });
    autoIndexer.start();
    autoIndexer.stop();

    expect(autoIndexer.getStats().running).toBe(false);

    // Events after stop should not cause indexing
    (watcher as unknown as EventEmitter<SessionWatcherEvents>).emit("session:discovered", {
      sessionId: "after-stop",
      filePath: "/path/after-stop.jsonl",
      projectDir: "/path",
      timestamp: Date.now(),
    } satisfies SessionWatchEvent);

    await new Promise((r) => setTimeout(r, 50));
    expect(indexer.indexed).toHaveLength(0);
  });

  it("should flush batch on demand", async () => {
    autoIndexer = new AutoIndexer({
      sessionWatcher: watcher,
      store: {} as SessionStore,
      indexer,
      batchIntervalMs: 60000, // Very long, so only manual flush matters
    });
    autoIndexer.start();

    (watcher as unknown as EventEmitter<SessionWatcherEvents>).emit("session:updated", {
      sessionId: "manual-flush",
      filePath: "/path/manual-flush.jsonl",
      projectDir: "/path",
      timestamp: Date.now(),
    } satisfies SessionWatchEvent);

    expect(autoIndexer.getStats().pendingBatch).toBe(1);

    await autoIndexer.flushBatch();

    expect(autoIndexer.getStats().pendingBatch).toBe(0);
    expect(indexer.indexed).toContain("manual-flush");
  });
});
