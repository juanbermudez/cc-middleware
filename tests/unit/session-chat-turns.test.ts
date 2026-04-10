import { describe, expect, it } from "vitest";
import type { SessionDetailTranscriptMessage } from "../../playground/src/lib/playground";
import { groupSessionChatTurns } from "../../playground/src/lib/session-chat-turns";

function message(overrides: Partial<SessionDetailTranscriptMessage> & { id: string }): SessionDetailTranscriptMessage {
  return {
    id: overrides.id,
    timestamp: overrides.timestamp ?? 0,
    ...overrides,
  };
}

describe("groupSessionChatTurns", () => {
  it("converts assistant commentary before tool work into an assistant-turn activity", () => {
    const turns = groupSessionChatTurns([
      message({
        id: "user-1",
        role: "user",
        variant: "user_message",
        text: "Read the file and summarize it.",
        timestamp: 1,
      }),
      message({
        id: "assistant-1",
        role: "assistant",
        variant: "assistant_message",
        text: "I will inspect the file first.",
        timestamp: 2,
      }),
      message({
        id: "tool-1",
        role: "tool",
        variant: "file_read",
        title: "Read file",
        toolName: "Read",
        timestamp: 3,
      }),
      message({
        id: "assistant-2",
        role: "assistant",
        variant: "assistant_message",
        text: "The file sets up the parser and the UI mapper.",
        timestamp: 4,
      }),
    ]);

    expect(turns).toHaveLength(2);
    expect(turns[1]?.kind).toBe("assistant");
    if (turns[1]?.kind !== "assistant") {
      throw new Error("Expected assistant turn");
    }

    expect(turns[1].activities).toHaveLength(2);
    expect(turns[1].activities[0]?.kind).toBe("commentary");
    expect(turns[1].activities[1]?.kind).toBe("file_read");
    expect(turns[1].response?.text).toContain("parser");
  });

  it("preserves parent-child tool nesting depth", () => {
    const turns = groupSessionChatTurns([
      message({
        id: "tool-parent",
        role: "tool",
        variant: "tool_use",
        toolName: "Task",
        toolUseId: "task-1",
        timestamp: 1,
      }),
      message({
        id: "tool-child",
        role: "tool",
        variant: "command",
        toolName: "Bash",
        toolUseId: "bash-1",
        parentToolUseId: "task-1",
        timestamp: 2,
      }),
    ]);

    expect(turns).toHaveLength(1);
    expect(turns[0]?.kind).toBe("assistant");
    if (turns[0]?.kind !== "assistant") {
      throw new Error("Expected assistant turn");
    }

    expect(turns[0].activities[0]?.depth).toBe(0);
    expect(turns[0].activities[1]?.depth).toBe(1);
  });
});
