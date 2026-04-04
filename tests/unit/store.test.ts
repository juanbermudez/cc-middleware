/**
 * Unit test: SQLite session store.
 * Tests database creation, CRUD operations, and message handling.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createStore } from "../../src/store/db.js";
import type { SessionStore, IndexedSession, IndexedMessage } from "../../src/store/db.js";

let store: SessionStore;
let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "cc-store-test-"));
  store = createStore({ dbPath: join(tempDir, "test.db") });
  store.migrate();
});

afterEach(() => {
  store.close();
  rmSync(tempDir, { recursive: true, force: true });
});

function makeSession(overrides?: Partial<IndexedSession>): IndexedSession {
  return {
    id: overrides?.id ?? `session-${Math.random().toString(36).slice(2, 8)}`,
    project: overrides?.project ?? "test-project",
    cwd: overrides?.cwd ?? "/tmp/test",
    summary: overrides?.summary ?? "Test session",
    firstPrompt: overrides?.firstPrompt ?? "Hello",
    gitBranch: overrides?.gitBranch,
    tag: overrides?.tag,
    status: overrides?.status ?? "completed",
    createdAt: overrides?.createdAt ?? Date.now() - 60000,
    lastModified: overrides?.lastModified ?? Date.now(),
    fileSize: overrides?.fileSize,
    messageCount: overrides?.messageCount ?? 0,
  };
}

function makeMessage(overrides?: Partial<IndexedMessage>): IndexedMessage {
  return {
    id: overrides?.id ?? `msg-${Math.random().toString(36).slice(2, 8)}`,
    sessionId: overrides?.sessionId ?? "session-1",
    role: overrides?.role ?? "user",
    contentPreview: overrides?.contentPreview ?? "Hello world",
    toolNames: overrides?.toolNames,
    timestamp: overrides?.timestamp ?? Date.now(),
  };
}

describe("SQLite Session Store", () => {
  describe("Schema", () => {
    it("should create database with all required tables", () => {
      const tables = store.db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as Array<{ name: string }>;

      const tableNames = tables.map((t) => t.name);
      expect(tableNames).toContain("sessions");
      expect(tableNames).toContain("messages");
      expect(tableNames).toContain("metadata");
      expect(tableNames).toContain("sessions_fts");
      expect(tableNames).toContain("messages_fts");
    });

    it("should create indexes", () => {
      const indexes = store.db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'")
        .all() as Array<{ name: string }>;

      const indexNames = indexes.map((i) => i.name);
      expect(indexNames).toContain("idx_sessions_project");
      expect(indexNames).toContain("idx_sessions_last_modified");
      expect(indexNames).toContain("idx_sessions_tag");
      expect(indexNames).toContain("idx_messages_session");
    });

    it("should be idempotent on repeated migrate calls", () => {
      expect(() => store.migrate()).not.toThrow();
      expect(() => store.migrate()).not.toThrow();
    });
  });

  describe("Session CRUD", () => {
    it("should insert and retrieve a session", () => {
      const session = makeSession({ id: "s1", summary: "My session" });
      store.upsertSession(session);

      const retrieved = store.getSession("s1");
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe("s1");
      expect(retrieved!.summary).toBe("My session");
      expect(retrieved!.project).toBe("test-project");
    });

    it("should upsert (update) an existing session", () => {
      const session = makeSession({ id: "s2", summary: "Version 1" });
      store.upsertSession(session);

      session.summary = "Version 2";
      store.upsertSession(session);

      const retrieved = store.getSession("s2");
      expect(retrieved!.summary).toBe("Version 2");
      expect(store.getSessionCount()).toBe(1);
    });

    it("should delete a session", () => {
      const session = makeSession({ id: "s3" });
      store.upsertSession(session);
      expect(store.getSession("s3")).toBeDefined();

      store.deleteSession("s3");
      expect(store.getSession("s3")).toBeUndefined();
    });

    it("should return undefined for non-existent session", () => {
      expect(store.getSession("nonexistent")).toBeUndefined();
    });

    it("should list sessions ordered by lastModified desc", () => {
      const now = Date.now();
      store.upsertSession(makeSession({ id: "s1", lastModified: now - 2000 }));
      store.upsertSession(makeSession({ id: "s2", lastModified: now - 1000 }));
      store.upsertSession(makeSession({ id: "s3", lastModified: now }));

      const sessions = store.listSessions();
      expect(sessions.length).toBe(3);
      expect(sessions[0].id).toBe("s3");
      expect(sessions[1].id).toBe("s2");
      expect(sessions[2].id).toBe("s1");
    });

    it("should list sessions with pagination", () => {
      for (let i = 0; i < 10; i++) {
        store.upsertSession(makeSession({ id: `s${i}`, lastModified: Date.now() + i }));
      }

      const page1 = store.listSessions({ limit: 3, offset: 0 });
      expect(page1.length).toBe(3);

      const page2 = store.listSessions({ limit: 3, offset: 3 });
      expect(page2.length).toBe(3);
      expect(page2[0].id).not.toBe(page1[0].id);
    });

    it("should list sessions filtered by project", () => {
      store.upsertSession(makeSession({ id: "s1", project: "project-a" }));
      store.upsertSession(makeSession({ id: "s2", project: "project-b" }));
      store.upsertSession(makeSession({ id: "s3", project: "project-a" }));

      const projectA = store.listSessions({ project: "project-a" });
      expect(projectA.length).toBe(2);
      expect(projectA.every((s) => s.project === "project-a")).toBe(true);
    });

    it("should handle optional fields correctly", () => {
      const session = makeSession({
        id: "s-optional",
        gitBranch: "feature/test",
        tag: "review",
        fileSize: 1024,
      });
      store.upsertSession(session);

      const retrieved = store.getSession("s-optional");
      expect(retrieved!.gitBranch).toBe("feature/test");
      expect(retrieved!.tag).toBe("review");
      expect(retrieved!.fileSize).toBe(1024);
    });
  });

  describe("Message CRUD", () => {
    it("should insert and retrieve messages", () => {
      store.upsertSession(makeSession({ id: "s1" }));

      const messages = [
        makeMessage({ id: "m1", sessionId: "s1", role: "user", contentPreview: "Hello" }),
        makeMessage({ id: "m2", sessionId: "s1", role: "assistant", contentPreview: "Hi there" }),
      ];

      store.insertMessages("s1", messages);

      const retrieved = store.getMessages("s1");
      expect(retrieved.length).toBe(2);
      expect(retrieved[0].contentPreview).toBe("Hello");
      expect(retrieved[1].contentPreview).toBe("Hi there");
    });

    it("should retrieve messages with pagination", () => {
      store.upsertSession(makeSession({ id: "s1" }));

      const messages = Array.from({ length: 10 }, (_, i) =>
        makeMessage({ id: `m${i}`, sessionId: "s1", timestamp: Date.now() + i })
      );
      store.insertMessages("s1", messages);

      const page = store.getMessages("s1", { limit: 3, offset: 2 });
      expect(page.length).toBe(3);
    });

    it("should delete messages for a session", () => {
      store.upsertSession(makeSession({ id: "s1" }));
      store.insertMessages("s1", [
        makeMessage({ id: "m1", sessionId: "s1" }),
        makeMessage({ id: "m2", sessionId: "s1" }),
      ]);

      expect(store.getMessages("s1").length).toBe(2);

      store.deleteMessages("s1");
      expect(store.getMessages("s1").length).toBe(0);
    });

    it("should store tool names", () => {
      store.upsertSession(makeSession({ id: "s1" }));
      store.insertMessages("s1", [
        makeMessage({ id: "m1", sessionId: "s1", toolNames: "Read,Edit,Bash" }),
      ]);

      const msgs = store.getMessages("s1");
      expect(msgs[0].toolNames).toBe("Read,Edit,Bash");
    });
  });

  describe("Stats and Metadata", () => {
    it("should return session count", () => {
      expect(store.getSessionCount()).toBe(0);

      store.upsertSession(makeSession({ id: "s1" }));
      store.upsertSession(makeSession({ id: "s2" }));

      expect(store.getSessionCount()).toBe(2);
    });

    it("should return message count", () => {
      expect(store.getMessageCount()).toBe(0);

      store.upsertSession(makeSession({ id: "s1" }));
      store.insertMessages("s1", [
        makeMessage({ id: "m1", sessionId: "s1" }),
        makeMessage({ id: "m2", sessionId: "s1" }),
      ]);

      expect(store.getMessageCount()).toBe(2);
    });

    it("should get and set last indexed timestamp", () => {
      expect(store.getLastIndexedAt()).toBeUndefined();

      const now = Date.now();
      store.setLastIndexedAt(now);

      expect(store.getLastIndexedAt()).toBe(now);
    });

    it("should get and set arbitrary metadata", () => {
      expect(store.getMetadata("key1")).toBeUndefined();

      store.setMetadata("key1", "value1");
      expect(store.getMetadata("key1")).toBe("value1");

      store.setMetadata("key1", "updated");
      expect(store.getMetadata("key1")).toBe("updated");
    });
  });
});
