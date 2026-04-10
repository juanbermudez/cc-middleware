import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { encodeProjectPath } from "../../src/sessions/transcripts.js";
import { buildSessionDetail } from "../../src/sessions/detail.js";
import * as infoModule from "../../src/sessions/info.js";
import type { SessionInfo } from "../../src/types/sessions.js";

let tempRoot: string;

beforeEach(() => {
  tempRoot = mkdtempSync(join(tmpdir(), "ccm-session-detail-"));
  vi.spyOn(infoModule, "getSession").mockImplementation(async (sessionId: string) => {
    const cwd = "/tmp/project-alpha";
    const base: SessionInfo = {
      sessionId,
      summary: `Summary for ${sessionId}`,
      lastModified: Date.parse("2026-04-08T12:01:05.000Z"),
      customTitle: sessionId === "root-session-1" ? "Root detail" : "Subagent detail",
      firstPrompt: "Please fix the failing file",
      gitBranch: "main",
      cwd,
      tag: "detail-test",
      createdAt: Date.parse("2026-04-08T12:00:00.000Z"),
    };

    return base;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(tempRoot, { recursive: true, force: true });
});

function seedDetailFixtures(): { projectsRoot: string } {
  const cwd = "/tmp/project-alpha";
  const projectDir = join(tempRoot, encodeProjectPath(cwd));
  const rootSessionId = "root-session-1";
  const subagentDir = join(projectDir, rootSessionId, "subagents");
  mkdirSync(subagentDir, { recursive: true });

  writeFileSync(
    join(projectDir, `${rootSessionId}.jsonl`),
    [
      JSON.stringify({
        type: "user",
        uuid: "root-user-1",
        sessionId: rootSessionId,
        timestamp: "2026-04-08T12:00:00.000Z",
        message: {
          role: "user",
          content: [
            { type: "text", text: "Please create src/index.ts and keep it simple." },
          ],
        },
      }),
      JSON.stringify({
        type: "assistant",
        uuid: "root-assistant-1",
        sessionId: rootSessionId,
        timestamp: "2026-04-08T12:00:03.000Z",
        message: {
          id: "msg_root_1",
          model: "claude-sonnet-4-6",
          stop_reason: "tool_use",
          usage: {
            input_tokens: 120,
            output_tokens: 35,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 45,
          },
          content: [
            { type: "text", text: "I will write the file now." },
            {
              type: "tool_use",
              id: "toolu_write_1",
              name: "Write",
              input: { file_path: "src/index.ts", content: "export const hello = 'world';" },
            },
          ],
        },
      }),
      JSON.stringify({
        type: "user",
        uuid: "root-user-2",
        sessionId: rootSessionId,
        timestamp: "2026-04-08T12:00:05.000Z",
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_write_1",
              is_error: true,
              content: "ENOENT: file not found",
            },
          ],
        },
      }),
      JSON.stringify({
        type: "system",
        subtype: "compact_boundary",
        sessionId: rootSessionId,
        timestamp: "2026-04-08T12:01:00.000Z",
      }),
      JSON.stringify({
        type: "assistant",
        uuid: "root-assistant-2",
        sessionId: rootSessionId,
        timestamp: "2026-04-08T12:01:02.000Z",
        isApiErrorMessage: true,
        error: "rate_limit",
        message: {
          content: [
            { type: "text", text: "API request failed due to rate limiting." },
          ],
        },
      }),
      JSON.stringify({
        type: "assistant",
        uuid: "root-assistant-3",
        sessionId: rootSessionId,
        timestamp: "2026-04-08T12:01:04.000Z",
        skill_name: "session-detail",
        message: {
          content: [
            { type: "text", text: "Loaded skill: session-detail" },
          ],
        },
      }),
      "this is not json",
    ].join("\n")
  );

  writeFileSync(
    join(subagentDir, "agent-review-1.jsonl"),
    [
      JSON.stringify({
        type: "assistant",
        uuid: "subagent-assistant-1",
        sessionId: "agent-review-1",
        agentId: "agent-review-1",
        slug: "reviewer",
        sourceToolAssistantUUID: "root-assistant-1",
        team_name: "delivery",
        teammate_name: "reviewer",
        timestamp: "2026-04-08T12:00:10.000Z",
        message: {
          id: "msg_sub_1",
          model: "claude-sonnet-4-6",
          stop_reason: "end_turn",
          usage: {
            input_tokens: 30,
            output_tokens: 18,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 10,
          },
          content: [
            { type: "text", text: "The file appears to be missing." },
          ],
        },
      }),
      JSON.stringify({
        type: "queue-operation",
        sessionId: "agent-review-1",
        timestamp: "2026-04-08T12:00:11.000Z",
        operation: "enqueue",
      }),
    ].join("\n")
  );

  return { projectsRoot: tempRoot };
}

describe("session detail builder", () => {
  it("builds a root session detail view from raw transcripts", async () => {
    const { projectsRoot } = seedDetailFixtures();

    const detail = await buildSessionDetail("root-session-1", {
      projectsRoot,
      metadata: [
        {
          sessionId: "root-session-1",
          key: "priority",
          value: "high",
          label: "Priority",
          description: "Test metadata",
          valueType: "string",
          searchable: true,
          filterable: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
    });

    expect(detail).toBeDefined();
    expect(detail?.sessionId).toBe("root-session-1");
    expect(detail?.rootSessionId).toBe("root-session-1");
    expect(detail?.transcript.messages.length).toBeGreaterThan(0);
    expect(detail?.transcript.turns.length).toBeGreaterThan(0);
    expect(detail?.transcript.messages.some((message) =>
      message.toolUses.some((toolUse) => toolUse.name === "Write")
    )).toBe(true);
    expect(detail?.inspector.files.some((file) => file.path === "src/index.ts")).toBe(true);
    expect(detail?.inspector.tools.find((tool) => tool.toolName === "Write")?.callCount).toBe(1);
    expect(detail?.inspector.errors.some((error) => error.kind === "tool_error")).toBe(true);
    expect(detail?.inspector.errors.some((error) => error.kind === "api_error")).toBe(true);
    expect(detail?.inspector.skills.some((skill) => skill.name === "session-detail")).toBe(true);
    expect(detail?.inspector.subagents).toHaveLength(1);
    expect(detail?.lineage.subagentCount).toBe(1);
    expect(detail?.inspector.metadata).toHaveLength(1);
    expect(detail?.inspector.configuration.projectKey).toBe(encodeProjectPath("/tmp/project-alpha"));
  });

  it("builds a subagent session detail view when the root session is provided", async () => {
    const { projectsRoot } = seedDetailFixtures();

    const detail = await buildSessionDetail("agent-review-1", {
      projectsRoot,
      rootSessionId: "root-session-1",
    });

    expect(detail).toBeDefined();
    expect(detail?.sessionId).toBe("agent-review-1");
    expect(detail?.rootSessionId).toBe("root-session-1");
    expect(detail?.lineage.kind).toBe("subagent");
    expect(detail?.lineage.parentSessionId).toBe("root-session-1");
    expect(detail?.transcript.messages[0]?.agentId).toBe("agent-review-1");
    expect(detail?.inspector.subagents).toHaveLength(0);
    expect(detail?.inspector.configuration.transcriptKind).toBe("subagent");
  });
});
