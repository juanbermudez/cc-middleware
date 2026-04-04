/**
 * E2E test: Verify the Agent SDK is importable and key functions exist.
 */

import { describe, it, expect } from "vitest";

describe("Agent SDK Availability", () => {
  it("should be importable", async () => {
    const sdk = await import("@anthropic-ai/claude-agent-sdk");
    expect(sdk).toBeDefined();
  });

  it("should export listSessions function", async () => {
    const sdk = await import("@anthropic-ai/claude-agent-sdk");
    expect(typeof sdk.listSessions).toBe("function");
  });

  it("should export query function", async () => {
    const sdk = await import("@anthropic-ai/claude-agent-sdk");
    expect(typeof sdk.query).toBe("function");
  });

  it("should export getSessionMessages function", async () => {
    const sdk = await import("@anthropic-ai/claude-agent-sdk");
    expect(typeof sdk.getSessionMessages).toBe("function");
  });
});
