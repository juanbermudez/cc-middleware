import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createStore, type SessionStore } from "../../src/store/db.js";
import {
  buildSessionCatalog,
  groupSessionCatalogByDirectory,
} from "../../src/sessions/catalog.js";

describe("session catalog", () => {
  let tempDir: string | undefined;
  let store: SessionStore | undefined;

  afterEach(() => {
    store?.close();
    store = undefined;
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  async function createTestStore(): Promise<SessionStore> {
    tempDir = mkdtempSync(join(tmpdir(), "cc-session-catalog-"));
    const nextStore = await createStore({ dbPath: join(tempDir, "catalog.db") });
    nextStore.migrate();
    return nextStore;
  }

  it("merges indexed lineage metadata into discovered sessions", async () => {
    store = await createTestStore();
    store.upsertSession({
      id: "session-1",
      project: "cc-middleware",
      cwd: "/Users/zef/Desktop/cc-middleware",
      summary: "Indexed session summary",
      customTitle: "Renamed session",
      firstPrompt: "Inspect middleware runtime",
      gitBranch: "main",
      status: "completed",
      createdAt: 10,
      lastModified: 50,
      messageCount: 14,
    });
    store.replaceRelationships("session-1", [
      {
        id: "rel-session-1",
        sessionId: "session-1",
        relationshipType: "subagent",
        path: "/Users/zef/Desktop/cc-middleware/.claude/subagents/reviewer.jsonl",
        agentId: "agent-reviewer",
        slug: "reviewer",
        lastModified: 50,
      },
    ]);

    const catalog = buildSessionCatalog(
      [
        {
          sessionId: "session-1",
          summary: "Filesystem summary",
          customTitle: "Filesystem title",
          firstPrompt: "Inspect middleware runtime",
          cwd: "/Users/zef/Desktop/cc-middleware",
          gitBranch: "main",
          createdAt: 10,
          lastModified: 50,
        },
        {
          sessionId: "session-2",
          summary: "Unindexed session",
          firstPrompt: "Explore search metadata",
          cwd: "/Users/zef/Desktop/other-project",
          createdAt: 20,
          lastModified: 40,
        },
      ],
      {
        store,
        teamMemberships: new Map([
          [
            "agent-reviewer",
            {
              teamName: "delivery",
              teammateName: "reviewer",
            },
          ],
        ]),
      }
    );

    expect(catalog).toHaveLength(2);
    expect(catalog[0]).toMatchObject({
      id: "session-1",
      sessionId: "session-1",
      indexed: true,
      project: "cc-middleware",
      directoryPath: "/Users/zef/Desktop/cc-middleware",
      directoryName: "cc-middleware",
      parentDirectoryPath: "/Users/zef/Desktop",
      directoryDepth: 4,
      messageCount: 14,
    });
    expect(catalog[0].lineage.hasSubagents).toBe(true);
    expect(catalog[0].lineage.hasTeamMembers).toBe(true);
    expect(catalog[0].lineage.teamNames).toEqual(["delivery"]);
    expect(catalog[0].lineage.teammateNames).toEqual(["reviewer"]);
    expect(catalog[1].indexed).toBe(false);
    expect(catalog[1].lineage.hasSubagents).toBe(false);
    expect(catalog[1].lineage.teamNames).toEqual([]);
  });

  it("filters and groups catalog sessions by exact directory", async () => {
    store = await createTestStore();
    store.upsertSession({
      id: "session-1",
      project: "cc-middleware",
      cwd: "/Users/zef/Desktop/cc-middleware",
      summary: "Indexed session one",
      firstPrompt: "Prompt one",
      gitBranch: "main",
      status: "completed",
      createdAt: 10,
      lastModified: 60,
      messageCount: 6,
    });
    store.upsertSession({
      id: "session-2",
      project: "cc-middleware",
      cwd: "/Users/zef/Desktop/cc-middleware",
      summary: "Indexed session two",
      firstPrompt: "Prompt two",
      gitBranch: "feature/demo",
      status: "completed",
      createdAt: 11,
      lastModified: 55,
      messageCount: 4,
    });
    store.replaceRelationships("session-1", [
      {
        id: "rel-session-1",
        sessionId: "session-1",
        relationshipType: "subagent",
        path: "/tmp/reviewer.jsonl",
        agentId: "agent-reviewer",
        lastModified: 60,
      },
    ]);

    const teamCatalog = buildSessionCatalog(
      [
        {
          sessionId: "session-1",
          summary: "Filesystem session one",
          firstPrompt: "Prompt one",
          cwd: "/Users/zef/Desktop/cc-middleware",
          gitBranch: "main",
          createdAt: 10,
          lastModified: 60,
        },
        {
          sessionId: "session-2",
          summary: "Filesystem session two",
          firstPrompt: "Prompt two",
          cwd: "/Users/zef/Desktop/cc-middleware",
          gitBranch: "feature/demo",
          createdAt: 11,
          lastModified: 55,
        },
        {
          sessionId: "session-3",
          summary: "Standalone session",
          firstPrompt: "Prompt three",
          cwd: "/Users/zef/Desktop/another-project",
          createdAt: 12,
          lastModified: 45,
        },
      ],
      {
        store,
        lineage: "team",
        teamMemberships: new Map([
          [
            "agent-reviewer",
            {
              teamName: "delivery",
              teammateName: "reviewer",
            },
          ],
        ]),
      }
    );

    expect(teamCatalog).toHaveLength(1);
    expect(teamCatalog[0]?.sessionId).toBe("session-1");

    const allCatalog = buildSessionCatalog(
      [
        {
          sessionId: "session-1",
          summary: "Filesystem session one",
          firstPrompt: "Prompt one",
          cwd: "/Users/zef/Desktop/cc-middleware",
          gitBranch: "main",
          createdAt: 10,
          lastModified: 60,
        },
        {
          sessionId: "session-2",
          summary: "Filesystem session two",
          firstPrompt: "Prompt two",
          cwd: "/Users/zef/Desktop/cc-middleware",
          gitBranch: "feature/demo",
          createdAt: 11,
          lastModified: 55,
        },
        {
          sessionId: "session-3",
          summary: "Standalone session",
          firstPrompt: "Prompt three",
          cwd: "/Users/zef/Desktop/cc-middleware",
          createdAt: 12,
          lastModified: 50,
        },
        {
          sessionId: "session-4",
          summary: "Other directory session",
          firstPrompt: "Prompt four",
          cwd: "/Users/zef/Desktop/another-project",
          createdAt: 13,
          lastModified: 45,
        },
      ],
      {
        store,
        teamMemberships: new Map([
          [
            "agent-reviewer",
            {
              teamName: "delivery",
              teammateName: "reviewer",
            },
          ],
        ]),
      }
    );
    const groups = groupSessionCatalogByDirectory(allCatalog, { sessionLimit: 2 });

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      path: "/Users/zef/Desktop/cc-middleware",
      sessionCount: 3,
      indexedSessionCount: 2,
      unindexedSessionCount: 1,
      mainSessionCount: 2,
      subagentSessionCount: 1,
      teamSessionCount: 1,
      hasMoreSessions: true,
      gitBranches: ["feature/demo", "main"],
    });
    expect(groups[0]?.sessions).toHaveLength(2);
    expect(groups[1]).toMatchObject({
      path: "/Users/zef/Desktop/another-project",
      sessionCount: 1,
      hasMoreSessions: false,
    });
  });
});
