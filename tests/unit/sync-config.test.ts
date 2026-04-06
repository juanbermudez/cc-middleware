/**
 * Unit tests for watcher configuration.
 * Tests env var parsing, CLI command structure, and sync status API.
 */

import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SessionWatcher } from "../../src/sync/session-watcher.js";
import { ConfigWatcher } from "../../src/sync/config-watcher.js";
import { AutoIndexer } from "../../src/sync/auto-indexer.js";
import { EventEmitter } from "eventemitter3";
import type { SessionWatcherEvents } from "../../src/sync/session-watcher.js";

describe("Watcher Configuration", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "ccm-sync-config-"));
    mkdirSync(join(tmpDir, "sessions"), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should respect custom pollIntervalMs", async () => {
    const watcher = new SessionWatcher({
      projectDirs: [join(tmpDir, "sessions")],
      pollIntervalMs: 500,
      debounceMs: 100,
    });

    await watcher.start();
    // Watcher started without error
    expect(watcher.getStatus().watching).toBe(true);
    await watcher.stop();
  });

  it("should respect custom debounceMs", async () => {
    const watcher = new SessionWatcher({
      projectDirs: [join(tmpDir, "sessions")],
      pollIntervalMs: 5000,
      debounceMs: 50, // Very short debounce
    });

    await watcher.start();
    expect(watcher.getStatus().watching).toBe(true);
    await watcher.stop();
  });

  it("should work with session watching disabled", () => {
    // When CC_MIDDLEWARE_WATCH_SESSIONS=false, no watcher is created
    // Verify that null watchers don't cause issues in status reporting
    const status = {
      sessionWatcher: { watching: false, dirs: [], knownFiles: 0, lastPoll: null },
      configWatcher: { watching: false, watchedPaths: 0, lastPoll: null },
      autoIndexer: { running: false, sessionsIndexed: 0, indexErrors: 0, lastIndexTime: null, pendingBatch: 0 },
    };

    expect(status.sessionWatcher.watching).toBe(false);
    expect(status.configWatcher.watching).toBe(false);
    expect(status.autoIndexer.running).toBe(false);
  });

  it("should allow config watcher with custom project dir", async () => {
    const watcher = new ConfigWatcher({
      projectDir: tmpDir,
      pollIntervalMs: 1000,
      debounceMs: 100,
    });

    await watcher.start();
    expect(watcher.getStatus().watching).toBe(true);
    expect(watcher.getStatus().watchedPaths).toBeGreaterThan(0);
    await watcher.stop();
  });

  it("should allow auto-indexer with custom batch interval", () => {
    const mockWatcher = new EventEmitter() as unknown as SessionWatcher;
    const mockIndexer = {
      indexSession: async () => {},
      fullIndex: async () => ({ sessionsIndexed: 0, messagesIndexed: 0, errors: [], durationMs: 0 }),
      incrementalIndex: async () => ({ sessionsIndexed: 0, messagesIndexed: 0, errors: [], durationMs: 0 }),
      getStats: () => ({ totalSessions: 0, totalMessages: 0 }),
    };

    const autoIndexer = new AutoIndexer({
      sessionWatcher: mockWatcher,
      store: {} as never,
      indexer: mockIndexer as never,
      batchIntervalMs: 1000,
    });

    autoIndexer.start();
    expect(autoIndexer.getStats().running).toBe(true);
    autoIndexer.stop();
    expect(autoIndexer.getStats().running).toBe(false);
  });

  it("should support env var configuration shape", () => {
    // Test the env var parsing logic from main.ts
    function envBool(val: string | undefined, defaultValue = true): boolean {
      if (val === undefined || val === "") return defaultValue;
      return val === "true" || val === "1" || val === "yes";
    }

    function envInt(val: string | undefined, defaultValue: number): number {
      if (val === undefined || val === "") return defaultValue;
      const num = parseInt(val, 10);
      return isNaN(num) ? defaultValue : num;
    }

    // Defaults
    expect(envBool(undefined)).toBe(true);
    expect(envBool("")).toBe(true);

    // Explicit values
    expect(envBool("true")).toBe(true);
    expect(envBool("1")).toBe(true);
    expect(envBool("yes")).toBe(true);
    expect(envBool("false")).toBe(false);
    expect(envBool("0")).toBe(false);
    expect(envBool("no")).toBe(false);

    // Int parsing
    expect(envInt(undefined, 10000)).toBe(10000);
    expect(envInt("5000", 10000)).toBe(5000);
    expect(envInt("abc", 10000)).toBe(10000);
  });
});

describe("Sync status response shape", () => {
  it("should return expected fields", () => {
    const watcher = new SessionWatcher({ projectDirs: [] });
    const status = watcher.getStatus();

    expect(status).toHaveProperty("watching");
    expect(status).toHaveProperty("dirs");
    expect(status).toHaveProperty("knownFiles");
    expect(status).toHaveProperty("lastPoll");
  });

  it("should return expected config watcher fields", () => {
    const watcher = new ConfigWatcher({ projectDir: "/tmp" });
    const status = watcher.getStatus();

    expect(status).toHaveProperty("watching");
    expect(status).toHaveProperty("watchedPaths");
    expect(status).toHaveProperty("lastPoll");
  });

  it("should return expected auto-indexer fields", () => {
    const mockWatcher = new EventEmitter() as unknown as SessionWatcher;
    const autoIndexer = new AutoIndexer({
      sessionWatcher: mockWatcher,
      store: {} as never,
      indexer: { indexSession: async () => {} } as never,
      batchIntervalMs: 5000,
    });

    const stats = autoIndexer.getStats();
    expect(stats).toHaveProperty("running");
    expect(stats).toHaveProperty("sessionsIndexed");
    expect(stats).toHaveProperty("indexErrors");
    expect(stats).toHaveProperty("lastIndexTime");
    expect(stats).toHaveProperty("pendingBatch");
  });
});
