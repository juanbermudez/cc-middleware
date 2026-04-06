/**
 * E2E tests for the real-time sync integration.
 * Tests that watchers wire into server startup correctly and
 * the sync status endpoint returns valid data.
 */

import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createMiddlewareServer } from "../../src/api/server.js";
import { createSessionManager } from "../../src/sessions/manager.js";
import { createEventBus } from "../../src/hooks/event-bus.js";
import { createBlockingRegistry } from "../../src/hooks/blocking.js";
import { createPolicyEngine } from "../../src/permissions/policy.js";
import { createCanUseTool } from "../../src/permissions/handler.js";
import { createAskUserQuestionManager } from "../../src/permissions/ask-user.js";
import { createAgentRegistry } from "../../src/agents/registry.js";
import { createTeamManager } from "../../src/agents/teams.js";
import { createStore } from "../../src/store/db.js";
import { SessionIndexer } from "../../src/store/indexer.js";
import { SessionWatcher } from "../../src/sync/session-watcher.js";
import { ConfigWatcher } from "../../src/sync/config-watcher.js";
import { AutoIndexer } from "../../src/sync/auto-indexer.js";
import type { MiddlewareServer } from "../../src/api/server.js";

describe("Sync Integration (E2E)", () => {
  let server: MiddlewareServer;
  let tmpDir: string;
  let sessionWatcher: SessionWatcher;
  let configWatcher: ConfigWatcher;
  let autoIndexer: AutoIndexer;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "ccm-sync-e2e-"));
    mkdirSync(join(tmpDir, "sessions"), { recursive: true });
    mkdirSync(join(tmpDir, ".claude", "agents"), { recursive: true });

    const sessionManager = createSessionManager();
    const eventBus = createEventBus();
    const blockingRegistry = createBlockingRegistry();
    const policyEngine = createPolicyEngine([], "ask");
    const { permissionManager } = createCanUseTool({ policyEngine, eventBus });
    const askUserManager = createAskUserQuestionManager({ eventBus });
    const agentRegistry = createAgentRegistry();
    const teamManager = createTeamManager();
    const store = await createStore({ dbPath: join(tmpDir, "test.db") });
    store.migrate();
    const indexer = new SessionIndexer({ store });

    server = await createMiddlewareServer({
      port: 0, // random port
      host: "127.0.0.1",
      sessionManager,
      eventBus,
      blockingRegistry,
      policyEngine,
      agentRegistry,
      teamManager,
      permissionManager,
      askUserManager,
      sessionStore: store,
      sessionIndexer: indexer,
      projectDir: tmpDir,
    });

    // Create watchers
    sessionWatcher = new SessionWatcher({
      projectDirs: [join(tmpDir, "sessions")],
      pollIntervalMs: 500,
      debounceMs: 100,
    });

    configWatcher = new ConfigWatcher({
      projectDir: tmpDir,
      pollIntervalMs: 1000,
      debounceMs: 100,
    });

    autoIndexer = new AutoIndexer({
      sessionWatcher,
      store,
      indexer,
      batchIntervalMs: 500,
    });

    // Wire session watcher to broadcast
    sessionWatcher.on("session:discovered", (data) => {
      server.wsBroadcaster.broadcast("session:discovered", {
        type: "session:discovered",
        sessionId: data.sessionId,
        timestamp: data.timestamp,
      });
    });

    sessionWatcher.on("session:updated", (data) => {
      server.wsBroadcaster.broadcast("session:updated", {
        type: "session:updated",
        sessionId: data.sessionId,
        timestamp: data.timestamp,
      });
    });

    // Register sync status endpoint
    server.app.get("/api/v1/sync/status", async () => ({
      sessionWatcher: sessionWatcher.getStatus(),
      configWatcher: configWatcher.getStatus(),
      autoIndexer: autoIndexer.getStats(),
    }));

    await sessionWatcher.start();
    await configWatcher.start();
    autoIndexer.start();

    await server.start();
  });

  afterEach(async () => {
    autoIndexer.stop();
    await configWatcher.stop();
    await sessionWatcher.stop();
    await server.stop();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should expose sync status endpoint", async () => {
    const res = await fetch(`${server.url}/api/v1/sync/status`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.sessionWatcher).toBeDefined();
    expect(data.sessionWatcher.watching).toBe(true);
    expect(data.configWatcher).toBeDefined();
    expect(data.configWatcher.watching).toBe(true);
    expect(data.autoIndexer).toBeDefined();
    expect(data.autoIndexer.running).toBe(true);
  });

  it("should detect new session file via watcher", async () => {
    const discovered: string[] = [];
    sessionWatcher.on("session:discovered", (data) => {
      discovered.push(data.sessionId);
    });

    // Create a session file
    const filePath = join(tmpDir, "sessions", "e2e-test-session.jsonl");
    writeFileSync(filePath, '{"type":"user","message":"hello"}\n');

    // Wait for detection
    await waitFor(() => discovered.length > 0, 5000);
    expect(discovered).toContain("e2e-test-session");
  });

  it("should detect config changes via watcher", async () => {
    const settingsPath = join(tmpDir, ".claude", "settings.json");
    writeFileSync(settingsPath, "{}");

    // Wait for initial scan to pick up the file
    await new Promise((r) => setTimeout(r, 200));

    const events: unknown[] = [];
    configWatcher.on("config:settings-changed", (data) => {
      events.push(data);
    });

    // Modify settings
    await new Promise((r) => setTimeout(r, 200));
    writeFileSync(settingsPath, '{"version": 2}');

    await waitFor(() => events.length > 0, 5000);
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  it("should report watcher status in sync endpoint", async () => {
    // Create a session file to increase known file count
    writeFileSync(join(tmpDir, "sessions", "status-test.jsonl"), '{"type":"user"}\n');

    // Wait for detection
    await new Promise((r) => setTimeout(r, 1000));

    const res = await fetch(`${server.url}/api/v1/sync/status`);
    const data = (await res.json()) as {
      sessionWatcher: { watching: boolean; knownFiles: number };
      configWatcher: { watching: boolean };
      autoIndexer: { running: boolean };
    };

    expect(data.sessionWatcher.watching).toBe(true);
    expect(data.sessionWatcher.knownFiles).toBeGreaterThanOrEqual(1);
  });
});

/** Helper: wait for condition */
async function waitFor(fn: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
}
