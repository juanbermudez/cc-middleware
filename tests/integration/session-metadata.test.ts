/**
 * Integration test: Session rename/tag roundtrip.
 * Launches a test session, renames and tags it, reads back, verifies, cleans up.
 * Makes REAL API calls to Claude.
 */

import { describe, it, expect, afterAll } from "vitest";
import { launchSession } from "../../src/sessions/launcher.js";
import {
  getSession,
  updateSessionTitle,
  updateSessionTag,
} from "../../src/sessions/info.js";

describe("Session Rename/Tag Roundtrip", () => {
  let testSessionId: string | undefined;

  afterAll(async () => {
    // Clean up: remove the tag
    if (testSessionId) {
      try {
        await updateSessionTag(testSessionId, null);
      } catch {
        // Best effort cleanup
      }
    }
  });

  it("should launch, rename, tag, and read back correctly", async () => {
    // Launch a minimal session
    const result = await launchSession({
      prompt: 'Say "hello"',
      maxTurns: 1,
      permissionMode: "plan",
    });

    expect(result.sessionId).toBeTruthy();
    testSessionId = result.sessionId;

    const timestamp = Date.now();
    const testTitle = `integration-test-${timestamp}`;

    // Rename
    await updateSessionTitle(testSessionId, testTitle);
    // Tag
    await updateSessionTag(testSessionId, "integration-test");

    // Read back
    const info = await getSession(testSessionId);
    expect(info).toBeDefined();
    expect(info!.customTitle).toBe(testTitle);
    expect(info!.tag).toBe("integration-test");

    // Clean up the tag
    await updateSessionTag(testSessionId, null);

    // Verify tag is removed
    const infoAfterClean = await getSession(testSessionId);
    expect(infoAfterClean).toBeDefined();
    // Tag should be cleared (undefined or null)
    expect(infoAfterClean!.tag).toBeFalsy();
  }, 90000);
});
