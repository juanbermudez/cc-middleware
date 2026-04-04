/**
 * E2E test: Launch headless session.
 * This test actually calls the Claude API via the Agent SDK.
 */

import { describe, it, expect } from "vitest";
import { launchSession } from "../../src/sessions/launcher.js";

describe("Session Launch (E2E)", () => {
  it("should launch a simple session and get a result", async () => {
    const result = await launchSession({
      prompt: "What is 2+2? Reply with just the number.",
      maxTurns: 1,
      permissionMode: "plan",
      persistSession: false,
    });

    expect(result.sessionId).toBeDefined();
    expect(typeof result.sessionId).toBe("string");
    expect(result.sessionId.length).toBeGreaterThan(0);

    expect(result.subtype).toBe("success");
    expect(result.isError).toBe(false);

    expect(result.result).toBeDefined();
    expect(result.result).toContain("4");

    expect(result.durationMs).toBeGreaterThan(0);
    expect(result.totalCostUsd).toBeGreaterThanOrEqual(0);
    expect(result.numTurns).toBeGreaterThanOrEqual(1);

    expect(result.usage).toBeDefined();
    expect(result.usage.input_tokens).toBeGreaterThan(0);
    expect(result.usage.output_tokens).toBeGreaterThan(0);
  }, 60000); // Allow 60s for API call
});
