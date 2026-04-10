import { describe, expect, it } from "vitest";
import {
  normalizeApiSessionDetailResponse,
  type ApiSessionDetailResponse,
} from "../../playground/src/lib/session-detail";

function makeDetailFixture(): ApiSessionDetailResponse {
  const timestamp = Date.parse("2026-04-08T14:10:00.000Z");

  return {
    sessionId: "session-1",
    rootSessionId: "session-1",
    session: {
      sessionId: "session-1",
      summary: "Build the WHOOP plugin",
      lastModified: timestamp,
      cwd: "/tmp/whoop-plugin",
      gitBranch: "main",
    },
    transcript: {
      messages: [
        {
          id: "user-1",
          sessionId: "session-1",
          rootSessionId: "session-1",
          transcriptKind: "root",
          interactionId: "interaction-1",
          role: "user",
          eventType: "user",
          timestamp,
          text: "Create the WHOOP analyst agent and keep the todo list updated.",
          raw: {},
          toolUses: [],
          toolResults: [],
          fileChanges: [],
          errors: [],
          skillNames: [],
          isPromptLikeUserEvent: true,
        },
        {
          id: "assistant-1",
          sessionId: "session-1",
          rootSessionId: "session-1",
          transcriptKind: "root",
          interactionId: "interaction-1",
          role: "assistant",
          eventType: "assistant",
          timestamp: timestamp + 1000,
          text: "I will write the agent file and update the task list.",
          raw: {},
          toolUses: [
            {
              id: "tool-write-1",
              name: "Write",
              input: {
                file_path: "/tmp/whoop-plugin/agents/whoop-analyst.md",
                content: "---\nname: whoop-analyst\nmodel: sonnet\n---\n",
              },
            },
            {
              id: "tool-todo-1",
              name: "TodoWrite",
              input: {
                todos: [
                  {
                    content: "Create plugin commands",
                    status: "completed",
                    activeForm: "Creating plugin commands",
                  },
                  {
                    content: "Validate plugin structure",
                    status: "in_progress",
                    activeForm: "Validating plugin structure",
                  },
                ],
              },
            },
          ],
          toolResults: [],
          fileChanges: [
            {
              path: "/tmp/whoop-plugin/agents/whoop-analyst.md",
              action: "write",
              toolName: "Write",
              toolUseId: "tool-write-1",
              timestamp: timestamp + 1000,
            },
          ],
          errors: [],
          skillNames: [],
          isPromptLikeUserEvent: false,
        },
        {
          id: "user-2",
          sessionId: "session-1",
          rootSessionId: "session-1",
          transcriptKind: "root",
          interactionId: "interaction-1",
          role: "user",
          eventType: "user",
          timestamp: timestamp + 1500,
          text: "",
          raw: {},
          toolUses: [],
          toolResults: [
            {
              toolUseId: "tool-write-1",
              isError: false,
              content: "File created successfully at: /tmp/whoop-plugin/agents/whoop-analyst.md",
            },
          ],
          fileChanges: [],
          errors: [],
          skillNames: [],
          isPromptLikeUserEvent: false,
        },
      ],
      turns: [
        {
          id: "turn-1",
          interactionId: "interaction-1",
          sessionId: "session-1",
          rootSessionId: "session-1",
          transcriptKind: "root",
          startedAt: timestamp,
          endedAt: timestamp + 1500,
          messageIds: ["user-1", "assistant-1", "user-2"],
          messageCount: 3,
          role: "assistant",
          title: "Build the WHOOP plugin",
          summary: "Create the WHOOP analyst agent and keep the todo list updated.",
          text: "Create the WHOOP analyst agent and keep the todo list updated.",
          messages: [],
          toolNames: ["Write", "TodoWrite"],
          filePaths: ["/tmp/whoop-plugin/agents/whoop-analyst.md"],
          errorCount: 0,
          skillNames: [],
        },
      ],
    },
    inspector: {
      files: [],
      tools: [],
      errors: [],
      skills: [],
      configuration: {
        rootSessionId: "session-1",
        transcriptKind: "root",
        transcriptPath: "/tmp/whoop-plugin/session-1.jsonl",
        transcriptPaths: ["/tmp/whoop-plugin/session-1.jsonl"],
        firstSeenAt: timestamp,
        lastSeenAt: timestamp + 1500,
      },
      subagents: [],
      metadata: [],
    },
    lineage: {
      kind: "root",
      sessionId: "session-1",
      rootSessionId: "session-1",
      subagentCount: 0,
      subagents: [],
    },
  };
}

describe("normalizeApiSessionDetailResponse", () => {
  it("preserves structured tool activity for transcript rendering", () => {
    const detail = makeDetailFixture();
    detail.transcript.turns[0]!.messages = detail.transcript.messages;

    const normalized = normalizeApiSessionDetailResponse(detail);
    const turn = normalized.turns?.[0];

    expect(turn).toBeDefined();

    const todoItem = turn?.messages?.find((message) => message.variant === "todo_list");
    expect(todoItem?.todoItems).toHaveLength(2);
    expect(todoItem?.fields?.some((field) => field.label === "Completed" && field.value === "1")).toBe(true);

    const fileWrite = turn?.messages?.find((message) => message.variant === "file_write");
    expect(fileWrite?.filePath).toBe("/tmp/whoop-plugin/agents/whoop-analyst.md");
    expect(fileWrite?.codeBlocks?.[0]?.language).toBe("markdown");
    expect(fileWrite?.codeBlocks?.[0]?.code).toContain("whoop-analyst");

    const result = turn?.messages?.find((message) => message.variant === "tool_result");
    expect(result?.title).toBe("Write result");
    expect(result?.toolName).toBe("Write");
    expect(result?.status).toBe("ok");
    expect(result?.files).toContain("/tmp/whoop-plugin/agents/whoop-analyst.md");
  });

  it("omits low-signal system noise and assistant role-echo placeholders", () => {
    const detail = makeDetailFixture();
    detail.transcript.messages.push(
      {
        id: "system-tag",
        sessionId: "session-1",
        rootSessionId: "session-1",
        transcriptKind: "root",
        interactionId: "interaction-1",
        role: "system",
        eventType: "tag",
        timestamp: Date.parse("2026-04-08T14:10:02.000Z"),
        text: "Tag",
        raw: {},
        toolUses: [],
        toolResults: [],
        fileChanges: [],
        errors: [],
        skillNames: [],
        isPromptLikeUserEvent: false,
      },
      {
        id: "system-queue",
        sessionId: "session-1",
        rootSessionId: "session-1",
        transcriptKind: "root",
        interactionId: "interaction-1",
        role: "system",
        eventType: "queue_operation",
        timestamp: Date.parse("2026-04-08T14:10:03.000Z"),
        text: "Queue Operation",
        raw: {},
        toolUses: [],
        toolResults: [],
        fileChanges: [],
        errors: [],
        skillNames: [],
        isPromptLikeUserEvent: false,
      },
      {
        id: "system-last-prompt",
        sessionId: "session-1",
        rootSessionId: "session-1",
        transcriptKind: "root",
        interactionId: "interaction-1",
        role: "runtime",
        eventType: "last-prompt",
        timestamp: Date.parse("2026-04-08T14:10:03.500Z"),
        text: "Last Prompt",
        raw: {},
        toolUses: [],
        toolResults: [],
        fileChanges: [],
        errors: [],
        skillNames: [],
        isPromptLikeUserEvent: false,
      },
      {
        id: "assistant-echo",
        sessionId: "session-1",
        rootSessionId: "session-1",
        transcriptKind: "root",
        interactionId: "interaction-1",
        role: "assistant",
        eventType: "assistant",
        timestamp: Date.parse("2026-04-08T14:10:04.000Z"),
        text: "Assistant",
        raw: {},
        toolUses: [],
        toolResults: [],
        fileChanges: [],
        errors: [],
        skillNames: [],
        isPromptLikeUserEvent: false,
      },
    );

    const normalized = normalizeApiSessionDetailResponse(detail);
    const renderedTexts = normalized.messages
      .map((message) => [message.title, message.text].filter(Boolean).join(" "))
      .join("\n");

    expect(renderedTexts).not.toContain("Queue Operation");
    expect(renderedTexts).not.toContain("Tag");
    expect(renderedTexts).not.toContain("Last Prompt");
    expect(renderedTexts).not.toContain("Assistant");
  });

  it("keeps simple read tool events compact and drops empty assistant placeholder turns", () => {
    const detail = makeDetailFixture();
    detail.transcript.messages = [
      detail.transcript.messages[0]!,
      {
        id: "assistant-thinking",
        sessionId: "session-1",
        rootSessionId: "session-1",
        transcriptKind: "root",
        interactionId: "interaction-1",
        role: "assistant",
        eventType: "assistant",
        timestamp: Date.parse("2026-04-08T14:10:00.800Z"),
        text: "",
        raw: {},
        toolUses: [],
        toolResults: [],
        fileChanges: [],
        errors: [],
        skillNames: [],
        isPromptLikeUserEvent: false,
      },
      {
        id: "assistant-tool-use",
        sessionId: "session-1",
        rootSessionId: "session-1",
        transcriptKind: "root",
        interactionId: "interaction-1",
        role: "assistant",
        eventType: "assistant",
        timestamp: Date.parse("2026-04-08T14:10:01.000Z"),
        text: "",
        raw: {},
        toolUses: [
          {
            id: "tool-read-1",
            name: "Read",
            input: {
              file_path: "/tmp/whoop-plugin/package.json",
            },
          },
        ],
        toolResults: [],
        fileChanges: [],
        errors: [],
        skillNames: [],
        isPromptLikeUserEvent: false,
      },
      {
        id: "user-tool-result",
        sessionId: "session-1",
        rootSessionId: "session-1",
        transcriptKind: "root",
        interactionId: "interaction-1",
        role: "user",
        eventType: "user",
        timestamp: Date.parse("2026-04-08T14:10:01.100Z"),
        text: "",
        raw: {},
        toolUses: [],
        toolResults: [
          {
            toolUseId: "tool-read-1",
            isError: false,
            content: "{\n  \"name\": \"cc-middleware\"\n}",
          },
        ],
        fileChanges: [],
        errors: [],
        skillNames: [],
        isPromptLikeUserEvent: false,
      },
      {
        id: "assistant-final",
        sessionId: "session-1",
        rootSessionId: "session-1",
        transcriptKind: "root",
        interactionId: "interaction-1",
        role: "assistant",
        eventType: "assistant",
        timestamp: Date.parse("2026-04-08T14:10:01.500Z"),
        text: "The project name is cc-middleware.",
        raw: {},
        toolUses: [],
        toolResults: [],
        fileChanges: [],
        errors: [],
        skillNames: [],
        isPromptLikeUserEvent: false,
      },
    ];
    detail.transcript.turns = [
      {
        ...detail.transcript.turns[0]!,
        messageIds: detail.transcript.messages.map((message) => message.id),
        messageCount: detail.transcript.messages.length,
        messages: detail.transcript.messages,
      },
    ];

    const normalized = normalizeApiSessionDetailResponse(detail);

    expect(
      normalized.messages.some(
        (message) => message.variant === "assistant_message" && message.text === "Assistant"
      )
    ).toBe(false);

    const readUse = normalized.messages.find((message) => message.toolUseId === "tool-read-1" && message.variant === "file_read");
    expect(readUse?.title).toBe("Read");
    expect(readUse?.content).toBeUndefined();
    expect(readUse?.fields ?? []).toEqual([]);
    expect(readUse?.files).toContain("/tmp/whoop-plugin/package.json");

    const readResult = normalized.messages.find((message) => message.toolUseId === "tool-read-1" && message.variant === "tool_result");
    expect(readResult?.status).toBe("ok");
    expect(readResult?.title).toBe("Read result");
    expect(readResult?.files).toContain("/tmp/whoop-plugin/package.json");
    expect(readResult?.codeBlocks?.[0]?.label).toBeUndefined();
    expect(readResult?.codeBlocks?.[0]?.path).toBe("/tmp/whoop-plugin/package.json");
  });
});
