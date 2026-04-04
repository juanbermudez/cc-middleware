/**
 * E2E test: Resume and continue sessions.
 * Tests launch-then-resume flow with real API calls.
 */

import { describe, it, expect } from "vitest";
import { launchSession, resumeSession } from "../../src/sessions/launcher.js";

describe("Session Resume (E2E)", () => {
  it("should launch then resume a session with context preserved", async () => {
    // Step 1: Launch initial session
    const initial = await launchSession({
      prompt: "Remember the secret word: pineapple. Reply with just 'OK, I will remember pineapple.'",
      maxTurns: 1,
      permissionMode: "plan",
    });

    expect(initial.sessionId).toBeDefined();
    expect(initial.subtype).toBe("success");
    expect(initial.result).toBeDefined();

    // Step 2: Resume the session
    const resumed = await resumeSession(
      initial.sessionId,
      "What was the secret word I asked you to remember? Reply with just the word.",
      { maxTurns: 1, permissionMode: "plan" }
    );

    expect(resumed.sessionId).toBeDefined();
    expect(resumed.subtype).toBe("success");
    expect(resumed.result).toBeDefined();
    // The response should mention pineapple
    expect(resumed.result!.toLowerCase()).toContain("pineapple");
  }, 120000); // Allow 2 minutes for two API calls
});
