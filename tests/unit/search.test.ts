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
    customTitle: undefined,
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

    it("should find sessions by custom title", () => {
      store.upsertSession(makeSession({
        id: "s1",
        summary: "Untitled working session",
        customTitle: "Payments API investigation",
      }));

      const result = searchSessions(store, { query: "Payments" });

      expect(result.total).toBe(1);
      expect(result.sessions[0].id).toBe("s1");
      expect(result.sessions[0].customTitle).toBe("Payments API investigation");
    });

    it("should find sessions by session ID", () => {
      store.upsertSession(makeSession({ id: "session-abc-123", summary: "Searchable by id" }));

      const result = searchSessions(store, { query: "abc-123" });

      expect(result.total).toBe(1);
      expect(result.sessions[0].id).toBe("session-abc-123");
    });

    it("should find sessions by project metadata like cwd and branch", () => {
      store.upsertSession(makeSession({
        id: "s1",
        project: "cc-middleware",
        cwd: "/Users/zef/Desktop/cc-middleware",
        gitBranch: "feature/search-metadata",
      }));

      expect(searchSessions(store, { query: "feature/search-metadata" }).sessions[0].id).toBe("s1");
      expect(searchSessions(store, { query: "Desktop/cc-middleware" }).sessions[0].id).toBe("s1");
      expect(searchSessions(store, { query: "cc-middleware" }).sessions[0].id).toBe("s1");
    });

    it("should find sessions by registered searchable metadata", () => {
      const now = Date.now();
      store.upsertSession(makeSession({ id: "s1", summary: "Metadata indexed session" }));
      store.upsertSessionMetadataDefinition({
        key: "workflow",
        label: "Workflow",
        valueType: "string",
        searchable: true,
        filterable: true,
        createdAt: now,
        updatedAt: now,
      });
      store.setSessionMetadataValue({
        sessionId: "s1",
        key: "workflow",
        value: "incident-response",
        createdAt: now,
        updatedAt: now,
      });

      const result = searchSessions(store, { query: "incident-response" });

      expect(result.total).toBe(1);
      expect(result.sessions[0].id).toBe("s1");
      expect(result.sessions[0].metadata).toEqual([
        expect.objectContaining({
          key: "workflow",
          value: "incident-response",
          label: "Workflow",
        }),
      ]);
    });

    it("should filter sessions by metadata key and value", () => {
      const now = Date.now();
      store.upsertSession(makeSession({ id: "s1", summary: "Platform session" }));
      store.upsertSession(makeSession({ id: "s2", summary: "Design session" }));
      store.upsertSessionMetadataDefinition({
        key: "owner",
        label: "Owner",
        valueType: "string",
        searchable: true,
        filterable: true,
        createdAt: now,
        updatedAt: now,
      });
      store.setSessionMetadataValue({
        sessionId: "s1",
        key: "owner",
        value: "platform",
        createdAt: now,
        updatedAt: now,
      });
      store.setSessionMetadataValue({
        sessionId: "s2",
        key: "owner",
        value: "design-systems",
        createdAt: now,
        updatedAt: now,
      });

      const result = searchSessions(store, {
        query: "",
        metadataKey: "owner",
        metadataValue: "platform",
      });

      expect(result.total).toBe(1);
      expect(result.sessions[0].id).toBe("s1");
    });

    it("should include lineage metadata for subagent and team activity", () => {
      store.upsertSession(makeSession({ id: "s1", summary: "Session with subagent work" }));
      store.replaceRelationships("s1", [
        {
          id: "rel-1",
          sessionId: "s1",
          relationshipType: "subagent",
          path: "/tmp/test/subagents/agent-reviewer.jsonl",
          agentId: "agent-reviewer",
          slug: "code-review",
          teamName: "delivery",
          teammateName: "reviewer",
          lastModified: Date.now(),
        },
      ]);

      const result = searchSessions(store, { query: "subagent" });

      expect(result.total).toBe(1);
      expect(result.sessions[0].lineage.kind).toBe("root");
      expect(result.sessions[0].lineage.hasSubagents).toBe(true);
      expect(result.sessions[0].lineage.subagentCount).toBe(1);
      expect(result.sessions[0].lineage.hasTeamMembers).toBe(true);
      expect(result.sessions[0].lineage.teamNames).toEqual(["delivery"]);
      expect(result.sessions[0].lineage.teammateNames).toEqual(["reviewer"]);
    });

    it("should filter indexed sessions by lineage scope", () => {
      store.upsertSession(makeSession({ id: "main", summary: "Standalone session" }));
      store.upsertSession(makeSession({ id: "subagent", summary: "Session with sidechain work" }));
      store.replaceRelationships("subagent", [
        {
          id: "rel-subagent",
          sessionId: "subagent",
          relationshipType: "subagent",
          path: "/tmp/test/subagents/agent-1.jsonl",
          agentId: "agent-1",
          lastModified: Date.now(),
        },
      ]);

      expect(searchSessions(store, { query: "session", lineage: "standalone" }).sessions.map((session) => session.id))
        .toEqual(["main"]);
      expect(searchSessions(store, { query: "session", lineage: "subagent" }).sessions.map((session) => session.id))
        .toEqual(["subagent"]);
    });

    it("should filter indexed sessions by team name using membership enrichment", () => {
      store.upsertSession(makeSession({ id: "team-session", summary: "Team review session" }));
      store.replaceRelationships("team-session", [
        {
          id: "rel-team",
          sessionId: "team-session",
          relationshipType: "subagent",
          path: "/tmp/test/subagents/agent-reviewer.jsonl",
          agentId: "agent-reviewer",
          lastModified: Date.now(),
        },
      ]);

      const memberships = new Map([
        ["agent-reviewer", { teamName: "delivery", teammateName: "reviewer" }],
      ]);

      const result = searchSessions(store, {
        query: "Team",
        lineage: "team",
        team: "delivery",
        teamMemberships: memberships,
      });

      expect(result.total).toBe(1);
      expect(result.sessions[0].id).toBe("team-session");
      expect(result.sessions[0].lineage.teamNames).toEqual(["delivery"]);
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
