import { describe, expect, it } from "vitest";
import type { SessionDetailTranscriptTurn } from "../../playground/src/lib/playground";
import { summarizeTranscriptMessage, summarizeTranscriptTurn } from "../../playground/src/lib/session-detail-summary";

describe("summarizeTranscriptTurn", () => {
  it("summarizes task notifications without leaking raw tags", () => {
    const turn: SessionDetailTranscriptTurn = {
      id: "turn-1",
      role: "system",
      timestamp: Date.now(),
      title: "Queue Operation",
      summary: "<task-notification><task-id>bzafmaz3o</task-id><status>failed</status><summary>Background command failed with exit code 1</summary></task-notification>",
      messages: [
        {
          id: "message-1",
          role: "system",
          variant: "system_event",
          text: "<task-notification><task-id>bzafmaz3o</task-id><status>failed</status><summary>Background command failed with exit code 1</summary></task-notification>",
        },
      ],
    };

    const summary = summarizeTranscriptTurn(turn);

    expect(summary).toContain("Task notification");
    expect(summary).toContain("Background command failed with exit code 1");
    expect(summary).not.toContain("<task-notification>");
  });

  it("prefers structured command summaries for command tool turns", () => {
    const turn: SessionDetailTranscriptTurn = {
      id: "turn-2",
      role: "tool",
      timestamp: Date.now(),
      messages: [
        {
          id: "message-2",
          role: "tool",
          variant: "command",
          title: "Run command",
          fields: [
            { label: "Description", value: "Check current Vercel login status" },
          ],
          codeBlocks: [
            {
              label: "Command",
              code: "npx vercel whoami 2>&1",
              language: "bash",
            },
          ],
        },
      ],
    };

    expect(summarizeTranscriptTurn(turn)).toBe("Run command · Check current Vercel login status");
  });

  it("does not duplicate tool result status in the summary text", () => {
    expect(
      summarizeTranscriptMessage({
        id: "message-3",
        role: "tool",
        variant: "tool_result",
        title: "Read result",
        status: "ok",
      })
    ).toBe("Read result");
  });
});
