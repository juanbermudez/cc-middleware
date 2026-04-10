import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SessionDetailMarkdown } from "../../playground/src/components/session-detail-markdown";
import { SessionDetailTranscript } from "../../playground/src/components/session-detail-transcript";
import type { SessionDetailTranscriptMessage } from "../../playground/src/lib/playground";

describe("session detail rendering", () => {
  it("renders inline markdown code inline instead of as block viewers", () => {
    const html = renderToStaticMarkup(
      <SessionDetailMarkdown content="The project name is **`cc-middleware`** (line 2 of `package.json`)." />
    );

    expect(html).toContain("The project name is");
    expect(html).toContain('class="session-detail-inline-code"');
    expect(html).toContain(">cc-middleware</code>");
    expect(html).toContain(">package.json</code>");
    expect(html).not.toContain("session-detail-code-viewer");
  });

  it("does not repeat the same file path as a trailing badge for simple read activity", () => {
    const path = "/Users/zef/Desktop/cc-middleware/package.json";
    const messages: SessionDetailTranscriptMessage[] = [
      {
        id: "read-1",
        role: "tool",
        variant: "file_read",
        kind: "tool_use",
        timestamp: 1,
        title: "Read",
        toolName: "Read",
        filePath: path,
        files: [path],
        fields: [],
      },
    ];

    const html = renderToStaticMarkup(
      <SessionDetailTranscript
        messages={messages}
        showHeader={false}
      />
    );

    const pathMatches = html.match(new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? [];
    expect(pathMatches).toHaveLength(1);
  });

  it("collapses a tool activity and its result into one rendered activity row", () => {
    const path = "/Users/zef/Desktop/cc-middleware/package.json";
    const messages: SessionDetailTranscriptMessage[] = [
      {
        id: "read-1",
        role: "tool",
        variant: "file_read",
        kind: "tool_use",
        timestamp: 1,
        title: "Read",
        toolName: "Read",
        toolUseId: "tool-read-1",
        filePath: path,
        files: [path],
        fields: [],
      },
      {
        id: "read-result-1",
        role: "tool",
        variant: "tool_result",
        kind: "tool_result",
        timestamp: 2,
        title: "Read result",
        toolName: "Read",
        toolUseId: "tool-read-1",
        status: "ok",
        files: [path],
        codeBlocks: [
          {
            code: "{\n  \"name\": \"cc-middleware\"\n}",
            language: "json",
            path,
          },
        ],
      },
    ];

    const html = renderToStaticMarkup(
      <SessionDetailTranscript
        messages={messages}
        showHeader={false}
      />
    );

    expect(html.match(/session-chat-activity-row/g)?.length ?? 0).toBe(1);
    expect(html).toContain("Read");
    expect(html).toContain("ok");
    expect(html).not.toContain("Read result");
  });
});
