/**
 * Unit test: Full-text search.
 * Tests FTS5 search, filtering, and edge cases using an in-memory store.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createStore } from "../../src/store/db.js";
import { searchSessions, searchMessages } from "../../src/store/search.js";
import type { SessionStore, IndexedSession, IndexedMessage } from "../../src/store/db.js";

let store: SessionStore;
let tempDir: string;

function makeSession(overrides: Partial<IndexedSession> & { id: string }): IndexedSession {
  return {
    project: "test-project",
    cwd: "/tmp/test",
    summary: "Default summary",
    firstPrompt: "Default prompt",
    status: "completed",
    createdAt: Date.now() - 60000,
    lastModified: Date.now(),
    ...overrides,
  };
}

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), "cc-search-test-"));
  store = await createStore({ dbPath: join(tempDir, "test.db") });
  store.migrate();
});

afterEach(() => {
  store.close();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("Full-Text Search", () => {
  describe("searchSessions", () => {
    it("should find sessions by keyword in summary", () => {
      store.upsertSession(makeSession({ id: "s1", summary: "Building a REST API server" }));
      store.upsertSession(makeSession({ id: "s2", summary: "Writing unit tests for parsing" }));
      store.upsertSession(makeSession({ id: "s3", summary: "Creating a REST endpoint" }));

      const result = searchSessions(store, { query: "REST" });

      expect(result.total).toBe(2);
      expect(result.sessions.length).toBe(2);
      expect(result.sessions.every((s) => s.summary.includes("REST"))).toBe(true);
      expect(result.queryTimeMs).toBeGreaterThanOrEqual(0);
    });

    it("should find sessions by keyword in firstPrompt", () => {
      store.upsertSession(makeSession({ id: "s1", firstPrompt: "Write a TypeScript function" }));
      store.upsertSession(makeSession({ id: "s2", firstPrompt: "Debug the Python script" }));

      const result = searchSessions(store, { query: "TypeScript" });

      expect(result.total).toBe(1);
      expect(result.sessions[0].id).toBe("s1");
    });

    it("should return relevance scores", () => {
      store.upsertSession(makeSession({
        id: "s1",
        summary: "API API API server",
        firstPrompt: "Build API",
      }));
      store.upsertSession(makeSession({
        id: "s2",
        summary: "Simple test",
        firstPrompt: "API",
      }));

      const result = searchSessions(store, { query: "API" });

      expect(result.sessions.length).toBe(2);
      // Both should have scores
      expect(result.sessions[0].relevanceScore).toBeGreaterThanOrEqual(0);
    });

    it("should return highlights", () => {
      store.upsertSession(makeSession({ id: "s1", summary: "Building a REST API server" }));

      const result = searchSessions(store, { query: "REST" });

      expect(result.sessions.length).toBe(1);
      // Should have at least one highlight containing <b> tags
      const hasHighlight = result.sessions[0].matchHighlights.some((h) => h.includes("<b>"));
      expect(hasHighlight).toBe(true);
    });

    it("should filter by project", () => {
      store.upsertSession(makeSession({ id: "s1", project: "project-a", summary: "API work" }));
      store.upsertSession(makeSession({ id: "s2", project: "project-b", summary: "API work" }));

      const result = searchSessions(store, { query: "API", project: "project-a" });

      expect(result.total).toBe(1);
      expect(result.sessions[0].project).toBe("project-a");
    });

    it("should filter by date range", () => {
      const now = Date.now();
      store.upsertSession(makeSession({ id: "s1", summary: "Old task", lastModified: now - 100000 }));
      store.upsertSession(makeSession({ id: "s2", summary: "New task", lastModified: now }));

      const result = searchSessions(store, {
        query: "task",
        dateFrom: now - 50000,
      });

      expect(result.total).toBe(1);
      expect(result.sessions[0].id).toBe("s2");
    });

    it("should filter by tag", () => {
      store.upsertSession(makeSession({ id: "s1", summary: "Work item", tag: "review" }));
      store.upsertSession(makeSession({ id: "s2", summary: "Work item", tag: "done" }));

      const result = searchSessions(store, { query: "Work", tags: ["review"] });

      expect(result.total).toBe(1);
      expect(result.sessions[0].tag).toBe("review");
    });

    it("should support pagination", () => {
      for (let i = 0; i < 10; i++) {
        store.upsertSession(makeSession({
          id: `s${i}`,
          summary: `Session number ${i} with API`,
          lastModified: Date.now() + i,
        }));
      }

      const page1 = searchSessions(store, { query: "API", limit: 3, offset: 0 });
      const page2 = searchSessions(store, { query: "API", limit: 3, offset: 3 });

      expect(page1.sessions.length).toBe(3);
      expect(page2.sessions.length).toBe(3);
      expect(page1.total).toBe(10);
      expect(page1.sessions[0].id).not.toBe(page2.sessions[0].id);
    });

    it("should return all sessions for empty query", () => {
      store.upsertSession(makeSession({ id: "s1" }));
      store.upsertSession(makeSession({ id: "s2" }));

      const result = searchSessions(store, { query: "" });

      expect(result.total).toBe(2);
      expect(result.sessions.length).toBe(2);
    });

    it("should return empty result for no matches", () => {
      store.upsertSession(makeSession({ id: "s1", summary: "Hello world" }));

      const result = searchSessions(store, { query: "nonexistentterm12345" });

      expect(result.total).toBe(0);
      expect(result.sessions.length).toBe(0);
    });

    it("should handle special characters in query gracefully", () => {
      store.upsertSession(makeSession({ id: "s1", summary: "Test session" }));

      // These should not throw
      expect(() => searchSessions(store, { query: "test (parens)" })).not.toThrow();
      expect(() => searchSessions(store, { query: 'test "quotes"' })).not.toThrow();
      expect(() => searchSessions(store, { query: "test AND OR NOT" })).not.toThrow();
    });
  });

  describe("searchMessages", () => {
    it("should find messages by content", () => {
      store.upsertSession(makeSession({ id: "s1" }));
      const messages: IndexedMessage[] = [
        { id: "m1", sessionId: "s1", role: "user", contentPreview: "Help me write a Rust program", timestamp: Date.now() },
        { id: "m2", sessionId: "s1", role: "assistant", contentPreview: "Here is a Python solution", timestamp: Date.now() + 1 },
      ];
      store.insertMessages("s1", messages);

      const result = searchMessages(store, { query: "Rust" });

      expect(result.total).toBe(1);
      expect(result.messages[0].contentPreview).toContain("Rust");
    });

    it("should return empty for no matches", () => {
      const result = searchMessages(store, { query: "nonexistent" });
      expect(result.total).toBe(0);
    });

    it("should return empty for empty query", () => {
      const result = searchMessages(store, { query: "" });
      expect(result.total).toBe(0);
    });
  });
});
