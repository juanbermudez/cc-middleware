/**
 * Unit tests for raw session transcript helpers.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  encodeProjectPath,
  getRootTranscriptPath,
  listTranscriptPaths,
  readIndexedTranscripts,
} from "../../src/sessions/transcripts.js";

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), "ccm-transcripts-test-"));
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe("session transcript helpers", () => {
  it("should encode project paths the same way Claude stores them", () => {
    expect(encodeProjectPath("/Users/zef/Desktop/cc-middleware")).toBe(
      "-Users-zef-Desktop-cc-middleware"
    );
  });

  it("should resolve root and sidechain transcript paths", async () => {
    const cwd = "/tmp/project-alpha";
    const encoded = encodeProjectPath(cwd);
    const projectRoot = join(tmpRoot, encoded);
    const sessionId = "session-123";
    const rootPath = join(projectRoot, `${sessionId}.jsonl`);
    const subagentDir = join(projectRoot, sessionId, "subagents");

    mkdirSync(subagentDir, { recursive: true });
    writeFileSync(rootPath, '{"type":"user","message":{"content":"root"}}\n');
    writeFileSync(
      join(subagentDir, "agent-a123.jsonl"),
      '{"type":"assistant","message":{"content":"child"}}\n'
    );

    expect(getRootTranscriptPath(sessionId, cwd, tmpRoot)).toBe(rootPath);

    const paths = await listTranscriptPaths(sessionId, cwd, tmpRoot);
    expect(paths.rootPath).toBe(rootPath);
    expect(paths.sidechainPaths).toHaveLength(1);
    expect(paths.sidechainPaths[0]).toContain("agent-a123.jsonl");
  });

  it("should merge root and sidechain user/assistant messages in timestamp order", async () => {
    const cwd = "/tmp/project-beta";
    const encoded = encodeProjectPath(cwd);
    const projectRoot = join(tmpRoot, encoded);
    const sessionId = "session-456";
    const rootPath = join(projectRoot, `${sessionId}.jsonl`);
    const subagentDir = join(projectRoot, sessionId, "subagents");

    mkdirSync(subagentDir, { recursive: true });

    writeFileSync(
      rootPath,
      [
        JSON.stringify({
          type: "user",
          uuid: "root-user",
          sessionId,
          timestamp: "2026-04-01T10:00:00.000Z",
          message: { role: "user", content: [{ type: "text", text: "root first" }] },
        }),
        JSON.stringify({
          type: "assistant",
          uuid: "root-assistant",
          sessionId,
          timestamp: "2026-04-01T10:02:00.000Z",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "root last" }],
          },
        }),
      ].join("\n")
    );

    writeFileSync(
      join(subagentDir, "agent-a789.jsonl"),
      [
        JSON.stringify({
          type: "assistant",
          uuid: "subassistant",
          sessionId,
          agentId: "agent-a789",
          slug: "prompt_suggestion",
          sourceToolAssistantUUID: "tool-uuid-1",
          team_name: "delivery",
          teammate_name: "reviewer",
          timestamp: "2026-04-01T10:01:00.000Z",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "subagent middle" }],
          },
        }),
      ].join("\n")
    );

    const indexed = await readIndexedTranscripts(
      { sessionId, cwd },
      { projectsRoot: tmpRoot }
    );

    expect(indexed).toBeDefined();
    expect(indexed!.messages.map((message) => message.id)).toEqual([
      "root-user",
      "subassistant",
      "root-assistant",
    ]);
    expect(indexed!.messages[1].contentPreview).toContain("subagent middle");
    expect(indexed!.relationships).toHaveLength(1);
    expect(indexed!.relationships[0].sessionId).toBe(sessionId);
    expect(indexed!.relationships[0].agentId).toBe("agent-a789");
    expect(indexed!.relationships[0].sourceToolAssistantUUID).toBe("tool-uuid-1");
    expect(indexed!.relationships[0].teamName).toBe("delivery");
    expect(indexed!.relationships[0].teammateName).toBe("reviewer");
  });
});
