/**
 * Unit test: SQLite session store.
 * Tests database creation, CRUD operations, and message handling.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { createStore } from "../../src/store/db.js";
import type {
  SessionStore,
  IndexedSession,
  IndexedMessage,
  IndexedSessionRelationship,
} from "../../src/store/db.js";

let store: SessionStore;
let tempDir: string;

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), "cc-store-test-"));
  store = await createStore({ dbPath: join(tempDir, "test.db") });
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
    customTitle: overrides?.customTitle,
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

function makeRelationship(
  overrides?: Partial<IndexedSessionRelationship>
): IndexedSessionRelationship {
  return {
    id: overrides?.id ?? `rel-${Math.random().toString(36).slice(2, 8)}`,
    sessionId: overrides?.sessionId ?? "session-1",
    relationshipType: overrides?.relationshipType ?? "subagent",
    path: overrides?.path ?? "/tmp/test/subagents/agent-a.jsonl",
    agentId: overrides?.agentId,
    slug: overrides?.slug,
    sourceToolAssistantUUID: overrides?.sourceToolAssistantUUID,
    teamName: overrides?.teamName,
    teammateName: overrides?.teammateName,
    startedAt: overrides?.startedAt,
    lastModified: overrides?.lastModified ?? Date.now(),
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
      expect(tableNames).toContain("session_relationships");
      expect(tableNames).toContain("session_metadata_definitions");
      expect(tableNames).toContain("session_metadata_values");
      expect(tableNames).toContain("resource_metadata_definitions");
      expect(tableNames).toContain("resource_metadata_values");
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
      expect(indexNames).toContain("idx_session_relationships_session");
      expect(indexNames).toContain("idx_session_metadata_values_session");
      expect(indexNames).toContain("idx_session_metadata_values_key");
      expect(indexNames).toContain("idx_resource_metadata_values_type_resource");
      expect(indexNames).toContain("idx_resource_metadata_values_type_key");
    });

    it("should be idempotent on repeated migrate calls", () => {
      expect(() => store.migrate()).not.toThrow();
      expect(() => store.migrate()).not.toThrow();
    });

    it("should upgrade a legacy sessions schema to support custom titles", async () => {
      const legacyDbPath = join(tempDir, "legacy.db");
      const legacyDb = new Database(legacyDbPath);

      legacyDb.exec(`
        CREATE TABLE sessions (
          id TEXT PRIMARY KEY,
          project TEXT NOT NULL,
          cwd TEXT NOT NULL,
          summary TEXT NOT NULL DEFAULT '',
          first_prompt TEXT NOT NULL DEFAULT '',
          git_branch TEXT,
          tag TEXT,
          status TEXT NOT NULL DEFAULT 'unknown',
          created_at INTEGER NOT NULL,
          last_modified INTEGER NOT NULL,
          file_size INTEGER,
          message_count INTEGER DEFAULT 0
        );
        CREATE VIRTUAL TABLE sessions_fts USING fts5(
          summary,
          first_prompt,
          tag,
          content=sessions,
          content_rowid=rowid
        );
        CREATE TABLE messages (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          role TEXT NOT NULL,
          content_preview TEXT NOT NULL DEFAULT '',
          tool_names TEXT,
          timestamp INTEGER NOT NULL
        );
        CREATE VIRTUAL TABLE messages_fts USING fts5(
          content_preview,
          tool_names,
          content=messages,
          content_rowid=rowid
        );
        CREATE TABLE metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        CREATE TABLE session_relationships (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          relationship_type TEXT NOT NULL,
          path TEXT NOT NULL,
          agent_id TEXT,
          slug TEXT,
          source_tool_assistant_uuid TEXT,
          started_at INTEGER,
          last_modified INTEGER NOT NULL
        );
      `);
      legacyDb.close();

      const upgradedStore = await createStore({ dbPath: legacyDbPath });
      upgradedStore.migrate();

      const columns = upgradedStore.db
        .prepare("PRAGMA table_info(sessions)")
        .all() as Array<{ name: string }>;
      expect(columns.some((column) => column.name === "custom_title")).toBe(true);
      const relationshipColumns = upgradedStore.db
        .prepare("PRAGMA table_info(session_relationships)")
        .all() as Array<{ name: string }>;
      expect(relationshipColumns.some((column) => column.name === "team_name")).toBe(true);
      expect(relationshipColumns.some((column) => column.name === "teammate_name")).toBe(true);

      upgradedStore.upsertSession(makeSession({ id: "legacy-upgraded", customTitle: "Renamed session" }));
      expect(upgradedStore.getSession("legacy-upgraded")?.customTitle).toBe("Renamed session");

      upgradedStore.close();
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
        customTitle: "Renamed debugging session",
        gitBranch: "feature/test",
        tag: "review",
        fileSize: 1024,
      });
      store.upsertSession(session);

      const retrieved = store.getSession("s-optional");
      expect(retrieved!.customTitle).toBe("Renamed debugging session");
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

  describe("Relationship CRUD", () => {
    it("should replace and retrieve relationships for a session", () => {
      store.upsertSession(makeSession({ id: "s1" }));

      store.replaceRelationships("s1", [
        makeRelationship({
          id: "rel-1",
          sessionId: "s1",
          slug: "agent-alpha",
          teamName: "delivery",
          teammateName: "reviewer",
          startedAt: 10,
          lastModified: 20,
        }),
        makeRelationship({
          id: "rel-2",
          sessionId: "s1",
          slug: "agent-beta",
          startedAt: 30,
          lastModified: 40,
        }),
      ]);

      const relationships = store.getRelationships("s1");
      expect(relationships).toHaveLength(2);
      expect(relationships[0].slug).toBe("agent-alpha");
      expect(relationships[0].teamName).toBe("delivery");
      expect(relationships[0].teammateName).toBe("reviewer");
      expect(relationships[1].slug).toBe("agent-beta");
    });

    it("should clear previous relationships on replace", () => {
      store.upsertSession(makeSession({ id: "s1" }));

      store.replaceRelationships("s1", [
        makeRelationship({ id: "rel-1", sessionId: "s1" }),
      ]);
      store.replaceRelationships("s1", [
        makeRelationship({ id: "rel-2", sessionId: "s1" }),
      ]);

      const relationships = store.getRelationships("s1");
      expect(relationships).toHaveLength(1);
      expect(relationships[0].id).toBe("rel-2");
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

    it("should create metadata definitions and values for sessions", () => {
      store.upsertSession(makeSession({ id: "session-1" }));
      const now = Date.now();

      store.upsertSessionMetadataDefinition({
        key: "workflow",
        label: "Workflow",
        description: "Workflow category",
        valueType: "string",
        searchable: true,
        filterable: true,
        createdAt: now,
        updatedAt: now,
      });
      store.setSessionMetadataValue({
        sessionId: "session-1",
        key: "workflow",
        value: "incident-response",
        createdAt: now,
        updatedAt: now,
      });

      expect(store.listSessionMetadataDefinitions()).toEqual([
        expect.objectContaining({
          key: "workflow",
          label: "Workflow",
          searchable: true,
          filterable: true,
        }),
      ]);
      expect(store.listSessionMetadataValues("session-1")).toEqual([
        expect.objectContaining({
          sessionId: "session-1",
          key: "workflow",
          value: "incident-response",
          label: "Workflow",
        }),
      ]);
    });

    it("should remove session metadata values when the session is deleted", () => {
      const now = Date.now();
      store.upsertSession(makeSession({ id: "session-1" }));
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
        sessionId: "session-1",
        key: "owner",
        value: "platform",
        createdAt: now,
        updatedAt: now,
      });

      expect(store.listSessionMetadataValues("session-1")).toHaveLength(1);
      store.deleteSession("session-1");
      expect(store.listSessionMetadataValues("session-1")).toHaveLength(0);
    });

    it("should remove metadata definitions and their values together", () => {
      const now = Date.now();
      store.upsertSession(makeSession({ id: "session-1" }));
      store.upsertSessionMetadataDefinition({
        key: "owner",
        label: "Owner",
        description: "Owning team",
        valueType: "string",
        searchable: true,
        filterable: true,
        createdAt: now,
        updatedAt: now,
      });
      store.setSessionMetadataValue({
        sessionId: "session-1",
        key: "owner",
        value: "platform",
        createdAt: now,
        updatedAt: now,
      });

      expect(store.getSessionMetadataDefinition("owner")).toEqual(
        expect.objectContaining({
          key: "owner",
          usageCount: 1,
        })
      );

      store.deleteSessionMetadataDefinition("owner");

      expect(store.getSessionMetadataDefinition("owner")).toBeUndefined();
      expect(store.listSessionMetadataValues("session-1")).toEqual([]);
    });

    it("should create metadata definitions and values for non-session resources", () => {
      const now = Date.now();

      store.upsertResourceMetadataDefinition({
        resourceType: "runtime-tool",
        key: "owner",
        label: "Owner",
        description: "Owning group",
        valueType: "string",
        searchable: true,
        filterable: true,
        createdAt: now,
        updatedAt: now,
      });
      store.setResourceMetadataValue({
        resourceType: "runtime-tool",
        resourceId: "Read",
        key: "owner",
        value: "platform",
        createdAt: now,
        updatedAt: now,
      });

      expect(store.listResourceMetadataDefinitions("runtime-tool")).toEqual([
        expect.objectContaining({
          resourceType: "runtime-tool",
          key: "owner",
          usageCount: 1,
        }),
      ]);
      expect(store.listResourceMetadataValues("runtime-tool", "Read")).toEqual([
        expect.objectContaining({
          resourceType: "runtime-tool",
          resourceId: "Read",
          key: "owner",
          value: "platform",
          label: "Owner",
        }),
      ]);
    });
  });
});
