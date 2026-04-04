/**
 * E2E test: Streaming session.
 * Tests that we can receive streaming events from a real session.
 */

import { describe, it, expect } from "vitest";
import { launchStreamingSession } from "../../src/sessions/streaming.js";
import type { SessionStreamEvent } from "../../src/sessions/streaming.js";

describe("Session Streaming (E2E)", () => {
  it("should receive streaming events including text_delta and result", async () => {
    const session = await launchStreamingSession({
      prompt: "Count from 1 to 5, one number per line.",
      maxTurns: 1,
      permissionMode: "plan",
      persistSession: false,
    });

    const events: SessionStreamEvent[] = [];

    for await (const event of session.events) {
      events.push(event);
    }

    // Should have received at least one event
    expect(events.length).toBeGreaterThan(0);

    // Should have at least one text_delta or assistant_message event
    const textEvents = events.filter(
      (e) => e.type === "text_delta" || e.type === "assistant_message"
    );
    expect(textEvents.length).toBeGreaterThan(0);

    // Should have a result event
    const resultEvents = events.filter((e) => e.type === "result");
    expect(resultEvents.length).toBe(1);

    // Result promise should resolve
    const result = await session.result;
    expect(result.sessionId).toBeDefined();
    expect(result.subtype).toBe("success");
    expect(result.isError).toBe(false);
  }, 60000);
});
