import { describe, expect, it } from "vitest";
import {
  looksLikeTranscriptMarkdown,
  normalizeTranscriptMarkupToMarkdown,
  prepareTranscriptMarkdown,
} from "../../playground/src/lib/transcript-markdown";

describe("transcript markdown helpers", () => {
  it("detects tagged transcript markup as markdown-like content", () => {
    const input = "<command-name>/model</command-name> <command-message>model</command-message> <command-args>claude-opus-4-6</command-args>";

    expect(looksLikeTranscriptMarkdown(input)).toBe(true);
  });

  it("normalizes command, task, and tool-error tags into markdown", () => {
    const input = [
      "<command-name>/model</command-name>",
      "<command-message>model</command-message>",
      "<command-args>claude-opus-4-6</command-args>",
      "<local-command-stdout>Set model to claude-opus-4-6</local-command-stdout>",
      "<task-notification><task-id>abc123</task-id><status>failed</status><summary>Background command failed</summary></task-notification>",
      "<tool_use_error>InputValidationError: missing activeForm</tool_use_error>",
    ].join(" ");

    const output = normalizeTranscriptMarkupToMarkdown(input);

    expect(output).toContain("**Command name:** `/model`");
    expect(output).toContain("**Command:** `model`");
    expect(output).toContain("**Arguments:** `claude-opus-4-6`");
    expect(output).toContain("**Local command output**");
    expect(output).toContain("```text");
    expect(output).toContain("**Task notification**");
    expect(output).toContain("- **Task id:** abc123");
    expect(output).toContain("- **Status:** failed");
    expect(output).toContain("**Tool error**");
    expect(output).toContain("InputValidationError: missing activeForm");
  });

  it("marks normalized tagged content as rich markdown", () => {
    const input = "<tool_use_error>File has not been read yet.</tool_use_error>";
    const prepared = prepareTranscriptMarkdown(input);

    expect(prepared.isRich).toBe(true);
    expect(prepared.markdown).toContain("**Tool error**");
  });
});
