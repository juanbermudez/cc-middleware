/**
 * Integration test: Streaming abort.
 * Launches a streaming session and aborts it mid-stream.
 * Makes REAL API calls to Claude.
 */

import { describe, it, expect, afterAll } from "vitest";
import { launchStreamingSession } from "../../src/sessions/streaming.js";

describe("Streaming Abort", () => {
  it("should abort a streaming session mid-stream", async () => {
    const abortController = new AbortController();

    const stream = await launchStreamingSession({
      prompt:
        "Write a very long essay about the history of computing, covering every decade from 1940 to 2020. Include many details and examples.",
      maxTurns: 1,
      includePartialMessages: true,
      permissionMode: "plan",
      abortController,
    });

    // Collect streaming events until we've received enough, then abort
    let receivedEvents = 0;
    const eventTypes: string[] = [];

    try {
      for await (const event of stream.events) {
        receivedEvents++;
        eventTypes.push(event.type);
        if (receivedEvents >= 5) {
          // Abort after receiving some events
          abortController.abort();
          break;
        }
      }
    } catch {
      // Abort may cause iteration errors - that's expected
    }

    expect(receivedEvents).toBeGreaterThanOrEqual(5);
    // We should have received some text_delta or other stream events
    expect(eventTypes.length).toBeGreaterThan(0);

    // The abort controller should be aborted
    expect(abortController.signal.aborted).toBe(true);
  }, 90000);
});
