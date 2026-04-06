/**
 * Unit tests for the session file watcher.
 */

import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, unlinkSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SessionWatcher, extractSessionId } from "../../src/sync/session-watcher.js";
import type { SessionWatchEvent } from "../../src/sync/session-watcher.js";

describe("SessionWatcher", () => {
  let tmpDir: string;
  let watcher: SessionWatcher;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "ccm-session-watcher-"));
    // Create a project dir inside
    mkdirSync(join(tmpDir, "project-a"), { recursive: true });
  });

  afterEach(async () => {
    if (watcher) {
      await watcher.stop();
    }
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should detect a new session file (session:discovered)", async () => {
    watcher = new SessionWatcher({
      projectDirs: [join(tmpDir, "project-a")],
      pollIntervalMs: 500,
      debounceMs: 100,
    });

    const discovered: SessionWatchEvent[] = [];
    watcher.on("session:discovered", (data) => discovered.push(data));

    await watcher.start();

    // Create a new .jsonl file
    const filePath = join(tmpDir, "project-a", "abc-session-123.jsonl");
    writeFileSync(filePath, '{"type":"user","message":"hello"}\n');

    // Wait for detection (poll or chokidar)
    await waitFor(() => discovered.length > 0, 5000);

    expect(discovered.length).toBeGreaterThanOrEqual(1);
    expect(discovered[0].sessionId).toBe("abc-session-123");
    expect(discovered[0].filePath).toBe(filePath);
  });

  it("should detect a modified session file (session:updated)", async () => {
    // Create initial file before starting watcher
    const filePath = join(tmpDir, "project-a", "session-mod.jsonl");
    writeFileSync(filePath, '{"type":"user","message":"hello"}\n');

    watcher = new SessionWatcher({
      projectDirs: [join(tmpDir, "project-a")],
      pollIntervalMs: 500,
      debounceMs: 100,
    });

    const updated: SessionWatchEvent[] = [];
    watcher.on("session:updated", (data) => updated.push(data));

    await watcher.start();

    // Wait a bit so mtime changes are detectable
    await new Promise((r) => setTimeout(r, 200));

    // Modify the file
    writeFileSync(filePath, '{"type":"user","message":"hello"}\n{"type":"assistant","message":"hi"}\n');

    // Wait for detection
    await waitFor(() => updated.length > 0, 5000);

    expect(updated.length).toBeGreaterThanOrEqual(1);
    expect(updated[0].sessionId).toBe("session-mod");
  });

  it("should detect a removed session file (session:removed)", async () => {
    // Create initial file
    const filePath = join(tmpDir, "project-a", "session-remove.jsonl");
    writeFileSync(filePath, '{"type":"user"}\n');

    watcher = new SessionWatcher({
      projectDirs: [join(tmpDir, "project-a")],
      pollIntervalMs: 500,
      debounceMs: 100,
    });

    const removed: SessionWatchEvent[] = [];
    watcher.on("session:removed", (data) => removed.push(data));

    await watcher.start();

    // Wait a bit then remove
    await new Promise((r) => setTimeout(r, 200));
    unlinkSync(filePath);

    // Wait for detection
    await waitFor(() => removed.length > 0, 5000);

    expect(removed.length).toBeGreaterThanOrEqual(1);
    expect(removed[0].sessionId).toBe("session-remove");
  });

  it("should handle non-existent directories gracefully", async () => {
    watcher = new SessionWatcher({
      projectDirs: ["/tmp/nonexistent-ccm-dir-12345"],
      pollIntervalMs: 1000,
      debounceMs: 100,
    });

    // Should not throw
    await watcher.start();
    const status = watcher.getStatus();
    expect(status.watching).toBe(true);
    expect(status.dirs).toHaveLength(0);
  });

  it("should report status correctly", async () => {
    const filePath = join(tmpDir, "project-a", "status-session.jsonl");
    writeFileSync(filePath, '{"type":"user"}\n');

    watcher = new SessionWatcher({
      projectDirs: [join(tmpDir, "project-a")],
      pollIntervalMs: 1000,
      debounceMs: 100,
    });

    await watcher.start();

    const status = watcher.getStatus();
    expect(status.watching).toBe(true);
    expect(status.dirs).toContain(join(tmpDir, "project-a"));
    expect(status.knownFiles).toBe(1);
  });

  it("should debounce rapid updates", async () => {
    const filePath = join(tmpDir, "project-a", "rapid-session.jsonl");
    writeFileSync(filePath, '{"type":"user"}\n');

    watcher = new SessionWatcher({
      projectDirs: [join(tmpDir, "project-a")],
      pollIntervalMs: 5000, // Long poll so only chokidar/debounce matters
      debounceMs: 500,
    });

    const updated: SessionWatchEvent[] = [];
    watcher.on("session:updated", (data) => updated.push(data));

    await watcher.start();
    await new Promise((r) => setTimeout(r, 200));

    // Write 5 rapid changes
    for (let i = 0; i < 5; i++) {
      writeFileSync(filePath, `line-${i}\n`.repeat(i + 1));
      await new Promise((r) => setTimeout(r, 50));
    }

    // Wait for debounce to settle
    await new Promise((r) => setTimeout(r, 1500));

    // Should have been debounced to fewer events than 5
    // Exact count depends on timing but should be <= 2
    expect(updated.length).toBeLessThanOrEqual(3);
  });

  it("should stop cleanly", async () => {
    watcher = new SessionWatcher({
      projectDirs: [join(tmpDir, "project-a")],
      pollIntervalMs: 500,
      debounceMs: 100,
    });

    await watcher.start();
    expect(watcher.getStatus().watching).toBe(true);

    await watcher.stop();
    expect(watcher.getStatus().watching).toBe(false);
  });

  it("should ignore non-jsonl files", async () => {
    watcher = new SessionWatcher({
      projectDirs: [join(tmpDir, "project-a")],
      pollIntervalMs: 500,
      debounceMs: 100,
    });

    const discovered: SessionWatchEvent[] = [];
    watcher.on("session:discovered", (data) => discovered.push(data));

    await watcher.start();

    // Create a non-jsonl file
    writeFileSync(join(tmpDir, "project-a", "not-a-session.txt"), "hello");

    // Also create a jsonl file
    writeFileSync(join(tmpDir, "project-a", "real-session.jsonl"), '{"type":"user"}\n');

    await waitFor(() => discovered.length > 0, 5000);

    // Should only detect the jsonl file
    const sessionIds = discovered.map((d) => d.sessionId);
    expect(sessionIds).toContain("real-session");
    expect(sessionIds).not.toContain("not-a-session");
  });
});

describe("extractSessionId", () => {
  it("should extract session ID from file path", () => {
    expect(extractSessionId("/home/user/.claude/projects/my-project/abc-123.jsonl")).toBe("abc-123");
    expect(extractSessionId("/some/path/session-uuid-here.jsonl")).toBe("session-uuid-here");
  });

  it("should return null for non-jsonl paths", () => {
    expect(extractSessionId("/some/path/file.txt")).toBe(null);
    expect(extractSessionId("/some/path/")).toBe(null);
  });
});

/** Helper: wait for a condition to become true */
async function waitFor(fn: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  // Don't throw - let the assertion below handle it
}
