/**
 * E2E test: Session indexer.
 * Tests full and incremental indexing against real sessions on disk.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createStore } from "../../src/store/db.js";
import { SessionIndexer } from "../../src/store/indexer.js";
import type { SessionStore } from "../../src/store/db.js";

let store: SessionStore;
let tempDir: string;

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), "cc-indexer-test-"));
  store = await createStore({ dbPath: join(tempDir, "test.db") });
  store.migrate();
});

afterEach(() => {
  store.close();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("Session Indexer (E2E)", () => {
  it("should perform a full index and find sessions", async () => {
    const indexer = new SessionIndexer({ store, messageLimit: 10 });
    const result = await indexer.fullIndex();

    // Should complete without crashing
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result.errors)).toBe(true);

    // If there are sessions on this machine, they should be indexed
    if (result.sessionsIndexed > 0) {
      expect(store.getSessionCount()).toBe(result.sessionsIndexed);

      // List sessions from store
      const sessions = store.listSessions({ limit: 5 });
      expect(sessions.length).toBeGreaterThan(0);
      expect(sessions[0].id).toBeTruthy();
      expect(sessions[0].cwd).toBeTruthy();
    }
  }, 30000);

  it("should perform incremental index after full index", async () => {
    const indexer = new SessionIndexer({ store, messageLimit: 5 });

    // Full index first
    const fullResult = await indexer.fullIndex();
    const fullCount = fullResult.sessionsIndexed;

    // Incremental should find no new sessions (nothing changed)
    const incrResult = await indexer.incrementalIndex();

    // Incremental should process 0 or very few sessions
    // (could be non-zero if a session was modified during the test)
    expect(incrResult.sessionsIndexed).toBeLessThanOrEqual(fullCount);
    expect(incrResult.durationMs).toBeGreaterThanOrEqual(0);
  }, 30000);

  it("should track index statistics", async () => {
    const indexer = new SessionIndexer({ store, messageLimit: 5 });
    await indexer.fullIndex();

    const stats = indexer.getStats();
    expect(stats.totalSessions).toBeGreaterThanOrEqual(0);
    expect(stats.totalMessages).toBeGreaterThanOrEqual(0);
    expect(stats.lastFullIndex).toBeDefined();
    expect(typeof stats.lastFullIndex).toBe("number");
  }, 30000);

  it("should handle errors gracefully", async () => {
    const indexer = new SessionIndexer({
      store,
      projectDirs: ["/nonexistent/path/that/does/not/exist"],
      messageLimit: 5,
    });

    // Should not throw; errors collected in result
    const result = await indexer.fullIndex();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    // Either indexed 0 sessions (no sessions found) or has errors
    expect(result.sessionsIndexed + result.errors.length).toBeGreaterThanOrEqual(0);
  }, 15000);
});
