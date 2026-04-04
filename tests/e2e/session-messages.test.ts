/**
 * E2E test: Session message reading from real sessions.
 */

import { describe, it, expect } from "vitest";
import { discoverSessions } from "../../src/sessions/discovery.js";
import { readSessionMessages, extractTextContent } from "../../src/sessions/messages.js";

describe("Session Message Reading (E2E)", () => {
  it("should read messages from an existing session", async () => {
    // Find a session that should have messages
    const sessions = await discoverSessions({ limit: 5 });

    if (sessions.length === 0) {
      console.log("No sessions found, skipping message reading test");
      return;
    }

    const sessionId = sessions[0].sessionId;
    const messages = await readSessionMessages(sessionId);

    expect(Array.isArray(messages)).toBe(true);

    if (messages.length > 0) {
      const first = messages[0];
      expect(first.type).toMatch(/^(user|assistant)$/);
      expect(typeof first.uuid).toBe("string");
      expect(typeof first.session_id).toBe("string");
      expect(first.session_id).toBe(sessionId);
      // message field is the raw payload (unknown)
      expect(first.message).toBeDefined();
      // parent_tool_use_id is null
      expect(first.parent_tool_use_id).toBeNull();
    }
  });

  it("should support pagination with limit and offset", async () => {
    const sessions = await discoverSessions({ limit: 5 });

    if (sessions.length === 0) {
      console.log("No sessions found, skipping pagination test");
      return;
    }

    const sessionId = sessions[0].sessionId;

    // Get first page
    const page1 = await readSessionMessages(sessionId, { limit: 2 });
    expect(page1.length).toBeLessThanOrEqual(2);

    if (page1.length === 2) {
      // Get second page
      const page2 = await readSessionMessages(sessionId, {
        limit: 2,
        offset: 2,
      });

      // No overlap between pages
      const page1Uuids = new Set(page1.map((m) => m.uuid));
      for (const msg of page2) {
        expect(page1Uuids.has(msg.uuid)).toBe(false);
      }
    }
  });

  it("should return empty array for non-existent session", async () => {
    // Using a random UUID that won't exist
    const messages = await readSessionMessages(
      "00000000-0000-0000-0000-000000000000"
    );
    expect(Array.isArray(messages)).toBe(true);
    expect(messages.length).toBe(0);
  });

  it("should extract text content from messages", async () => {
    const sessions = await discoverSessions({ limit: 5 });

    if (sessions.length === 0) {
      console.log("No sessions found, skipping text extraction test");
      return;
    }

    const sessionId = sessions[0].sessionId;
    const messages = await readSessionMessages(sessionId, { limit: 3 });

    for (const msg of messages) {
      const text = extractTextContent(msg.message);
      expect(typeof text).toBe("string");
    }
  });
});
