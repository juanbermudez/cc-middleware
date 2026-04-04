/**
 * E2E test: Session discovery from real filesystem.
 * Tests against the actual ~/.claude/projects/ directory.
 */

import { describe, it, expect } from "vitest";
import { discoverSessions, discoverAllProjects } from "../../src/sessions/discovery.js";

describe("Session Discovery (E2E)", () => {
  it("should list sessions from real filesystem", async () => {
    const sessions = await discoverSessions();
    expect(Array.isArray(sessions)).toBe(true);

    if (sessions.length > 0) {
      const first = sessions[0];
      // Required fields
      expect(first.sessionId).toBeDefined();
      expect(typeof first.sessionId).toBe("string");
      expect(first.summary).toBeDefined();
      expect(typeof first.summary).toBe("string");
      expect(first.lastModified).toBeDefined();
      expect(typeof first.lastModified).toBe("number");
      expect(first.lastModified).toBeGreaterThan(0);
    }
  });

  it("should return sessions sorted by lastModified descending", async () => {
    const sessions = await discoverSessions();

    if (sessions.length >= 2) {
      for (let i = 1; i < sessions.length; i++) {
        expect(sessions[i - 1].lastModified).toBeGreaterThanOrEqual(
          sessions[i].lastModified
        );
      }
    }
  });

  it("should support limit option", async () => {
    const sessions = await discoverSessions({ limit: 3 });
    expect(sessions.length).toBeLessThanOrEqual(3);
  });

  it("should list sessions for specific project directory", async () => {
    const sessions = await discoverSessions({ dir: process.cwd() });
    expect(Array.isArray(sessions)).toBe(true);
    // All returned sessions should be from this project if cwd field is populated
    for (const session of sessions) {
      if (session.cwd) {
        // cwd should relate to our project
        expect(typeof session.cwd).toBe("string");
      }
    }
  });

  it("should handle non-existent directory gracefully", async () => {
    const sessions = await discoverSessions({
      dir: "/nonexistent/path/that/does/not/exist",
    });
    expect(Array.isArray(sessions)).toBe(true);
    expect(sessions.length).toBe(0);
  });

  it("should discover all project directories", async () => {
    const projects = await discoverAllProjects();
    expect(Array.isArray(projects)).toBe(true);

    for (const project of projects) {
      expect(typeof project).toBe("string");
      expect(project.length).toBeGreaterThan(0);
    }

    // Projects should be sorted
    const sorted = [...projects].sort();
    expect(projects).toEqual(sorted);
  });

  it("should include optional fields when available", async () => {
    const sessions = await discoverSessions({ limit: 10 });

    if (sessions.length > 0) {
      // Check that optional fields are either defined or undefined (not null)
      for (const session of sessions) {
        if (session.cwd !== undefined) {
          expect(typeof session.cwd).toBe("string");
        }
        if (session.gitBranch !== undefined) {
          expect(typeof session.gitBranch).toBe("string");
        }
        if (session.tag !== undefined) {
          expect(typeof session.tag).toBe("string");
        }
        if (session.createdAt !== undefined) {
          expect(typeof session.createdAt).toBe("number");
        }
        if (session.fileSize !== undefined) {
          expect(typeof session.fileSize).toBe("number");
        }
      }
    }
  });
});
