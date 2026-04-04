/**
 * E2E test: Session info and metadata operations.
 * Tests against real session data.
 */

import { describe, it, expect } from "vitest";
import { discoverSessions } from "../../src/sessions/discovery.js";
import { getSession } from "../../src/sessions/info.js";

describe("Session Info (E2E)", () => {
  it("should get info for an existing session", async () => {
    const sessions = await discoverSessions({ limit: 3 });

    if (sessions.length === 0) {
      console.log("No sessions found, skipping session info test");
      return;
    }

    const sessionId = sessions[0].sessionId;
    const info = await getSession(sessionId);

    expect(info).toBeDefined();
    expect(info!.sessionId).toBe(sessionId);
    expect(typeof info!.summary).toBe("string");
    expect(typeof info!.lastModified).toBe("number");
    expect(info!.lastModified).toBeGreaterThan(0);
  });

  it("should return undefined for non-existent session", async () => {
    const info = await getSession("00000000-0000-0000-0000-000000000000");
    expect(info).toBeUndefined();
  });

  it("should get session info matching discovery listing", async () => {
    const sessions = await discoverSessions({ limit: 3 });

    if (sessions.length === 0) {
      console.log("No sessions found, skipping matching test");
      return;
    }

    const listed = sessions[0];
    const detailed = await getSession(listed.sessionId);

    expect(detailed).toBeDefined();
    expect(detailed!.sessionId).toBe(listed.sessionId);
    expect(detailed!.summary).toBe(listed.summary);
  });

  // NOTE: Rename and tag tests are intentionally not included here because
  // they modify real session data. They should be tested with a purpose-created
  // test session in Phase 3 when we can launch sessions programmatically.
});
