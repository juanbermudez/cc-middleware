/**
 * CC-Middleware standalone server entry point.
 * Creates all middleware components and starts the API + hook servers.
 *
 * Usage:
 *   node dist/main.js
 *
 * Environment variables:
 *   PORT          - API server port (default: 3000)
 *   HOOK_PORT     - Hook server port (default: 3001)
 *   HOST          - Bind address (default: 127.0.0.1)
 *   PROJECT_DIR   - Project directory for config discovery
 *
 * Sync environment variables (Phase 12):
 *   CC_MIDDLEWARE_WATCH_SESSIONS  - Enable session watching (default: true)
 *   CC_MIDDLEWARE_WATCH_CONFIG    - Enable config watching (default: true)
 *   CC_MIDDLEWARE_AUTO_INDEX      - Enable auto-indexing (default: true)
 *   CC_MIDDLEWARE_POLL_INTERVAL   - Poll interval in ms (default: 10000)
 *   CC_MIDDLEWARE_DEBOUNCE_MS     - Debounce interval in ms (default: 2000)
 */

import { createSessionManager } from "./sessions/manager.js";
import { createEventBus } from "./hooks/event-bus.js";
import { createBlockingRegistry } from "./hooks/blocking.js";
import { createHookServer } from "./hooks/server.js";
import { createPolicyEngine } from "./permissions/policy.js";
import { createCanUseTool } from "./permissions/handler.js";
import { createAskUserQuestionManager } from "./permissions/ask-user.js";
import { createAgentRegistry } from "./agents/registry.js";
import { createTeamManager } from "./agents/teams.js";
import { createMiddlewareServer } from "./api/server.js";
import { createStore } from "./store/db.js";
import { SessionIndexer } from "./store/indexer.js";
import { SessionWatcher } from "./sync/session-watcher.js";
import { ConfigWatcher } from "./sync/config-watcher.js";
import { AutoIndexer } from "./sync/auto-indexer.js";

/** Parse a boolean env var (default: true) */
function envBool(name: string, defaultValue = true): boolean {
  const val = process.env[name];
  if (val === undefined || val === "") return defaultValue;
  return val === "true" || val === "1" || val === "yes";
}

/** Parse an integer env var */
function envInt(name: string, defaultValue: number): number {
  const val = process.env[name];
  if (val === undefined || val === "") return defaultValue;
  const num = parseInt(val, 10);
  return isNaN(num) ? defaultValue : num;
}

async function main() {
  const host = process.env.HOST ?? "127.0.0.1";
  const port = parseInt(process.env.PORT ?? "3000", 10);
  const hookPort = parseInt(process.env.HOOK_PORT ?? "3001", 10);
  const projectDir = process.env.PROJECT_DIR ?? process.cwd();

  // --- Sync configuration from env ---
  const watchSessions = envBool("CC_MIDDLEWARE_WATCH_SESSIONS");
  const watchConfig = envBool("CC_MIDDLEWARE_WATCH_CONFIG");
  const autoIndex = envBool("CC_MIDDLEWARE_AUTO_INDEX");
  const pollInterval = envInt("CC_MIDDLEWARE_POLL_INTERVAL", 10000);
  const debounceMs = envInt("CC_MIDDLEWARE_DEBOUNCE_MS", 2000);

  // --- Core components ---
  const sessionManager = createSessionManager();
  const eventBus = createEventBus();
  const blockingRegistry = createBlockingRegistry();
  const policyEngine = createPolicyEngine([], "ask");
  const { permissionManager } = createCanUseTool({ policyEngine, eventBus });
  const askUserManager = createAskUserQuestionManager({ eventBus });
  const agentRegistry = createAgentRegistry();
  const teamManager = createTeamManager();

  // Load agents from filesystem
  await agentRegistry.loadFromFilesystem({ projectDir });

  // --- Store & Indexer ---
  const sessionStore = await createStore();
  sessionStore.migrate();
  const sessionIndexer = new SessionIndexer({ store: sessionStore });

  // --- API server ---
  const server = await createMiddlewareServer({
    port,
    host,
    sessionManager,
    eventBus,
    blockingRegistry,
    policyEngine,
    agentRegistry,
    teamManager,
    permissionManager,
    askUserManager,
    sessionStore,
    sessionIndexer,
    projectDir,
  });

  // --- Hook server ---
  const hookServer = await createHookServer({
    port: hookPort,
    host,
    eventBus,
    blockingRegistry,
  });

  // --- Real-Time Sync (Phase 12) ---
  let sessionWatcher: SessionWatcher | null = null;
  let configWatcher: ConfigWatcher | null = null;
  let autoIndexer: AutoIndexer | null = null;

  if (watchSessions) {
    sessionWatcher = new SessionWatcher({
      pollIntervalMs: pollInterval,
      debounceMs,
    });

    // Wire session watcher to WebSocket broadcast
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

    sessionWatcher.on("session:removed", (data) => {
      server.wsBroadcaster.broadcast("session:removed", {
        type: "session:removed",
        sessionId: data.sessionId,
        timestamp: data.timestamp,
      });
    });

    await sessionWatcher.start();
    console.log(`Session watcher: started (poll: ${pollInterval}ms, debounce: ${debounceMs}ms)`);
  }

  if (watchConfig) {
    configWatcher = new ConfigWatcher({
      projectDir,
      pollIntervalMs: pollInterval * 3, // Config changes less often
      debounceMs,
    });

    // Wire config watcher to WebSocket broadcast
    configWatcher.on("config:settings-changed", (data) => {
      server.wsBroadcaster.broadcast("config:changed", {
        type: "config:changed",
        scope: data.scope,
        path: data.filePath,
        timestamp: data.timestamp,
      });
    });

    configWatcher.on("config:mcp-changed", (data) => {
      server.wsBroadcaster.broadcast("config:mcp-changed", {
        type: "config:mcp-changed",
        path: data.filePath,
        timestamp: data.timestamp,
      });
    });

    configWatcher.on("config:agent-changed", (data) => {
      server.wsBroadcaster.broadcast("config:agent-changed", {
        type: "config:agent-changed",
        name: data.name,
        action: data.action,
        timestamp: data.timestamp,
      });
    });

    configWatcher.on("config:skill-changed", (data) => {
      server.wsBroadcaster.broadcast("config:skill-changed", {
        type: "config:skill-changed",
        name: data.name,
        action: data.action,
        timestamp: data.timestamp,
      });
    });

    configWatcher.on("config:rule-changed", (data) => {
      server.wsBroadcaster.broadcast("config:rule-changed", {
        type: "config:rule-changed",
        name: data.name,
        action: data.action,
        timestamp: data.timestamp,
      });
    });

    configWatcher.on("config:plugin-changed", (data) => {
      server.wsBroadcaster.broadcast("config:plugin-changed", {
        type: "config:plugin-changed",
        path: data.filePath,
        timestamp: data.timestamp,
      });
    });

    configWatcher.on("config:memory-changed", (data) => {
      server.wsBroadcaster.broadcast("config:memory-changed", {
        type: "config:memory-changed",
        path: data.filePath,
        timestamp: data.timestamp,
      });
    });

    configWatcher.on("team:created", (data) => {
      server.wsBroadcaster.broadcast("team:created", {
        type: "team:created",
        teamName: data.teamName,
        timestamp: data.timestamp,
      });
    });

    configWatcher.on("team:updated", (data) => {
      server.wsBroadcaster.broadcast("team:updated", {
        type: "team:updated",
        teamName: data.teamName,
        timestamp: data.timestamp,
      });
    });

    configWatcher.on("team:task-updated", (data) => {
      server.wsBroadcaster.broadcast("team:task-updated", {
        type: "team:task-updated",
        path: data.filePath,
        timestamp: data.timestamp,
      });
    });

    await configWatcher.start();
    console.log(`Config watcher: started (poll: ${pollInterval * 3}ms, debounce: ${debounceMs}ms)`);
  }

  if (autoIndex && sessionWatcher) {
    autoIndexer = new AutoIndexer({
      sessionWatcher,
      store: sessionStore,
      indexer: sessionIndexer,
      batchIntervalMs: 5000,
    });
    autoIndexer.start();
    console.log("Auto-indexer: started (batch: 5000ms)");
  }

  // --- Sync status endpoint ---
  server.app.get("/api/v1/sync/status", async () => {
    return {
      sessionWatcher: sessionWatcher
        ? sessionWatcher.getStatus()
        : { watching: false, dirs: [], knownFiles: 0, lastPoll: null },
      configWatcher: configWatcher
        ? configWatcher.getStatus()
        : { watching: false, watchedPaths: 0, lastPoll: null },
      autoIndexer: autoIndexer
        ? autoIndexer.getStats()
        : { running: false, sessionsIndexed: 0, indexErrors: 0, lastIndexTime: null, pendingBatch: 0 },
    };
  });

  // --- Update the existing status endpoint to include watcher state ---
  // (The /api/v1/status endpoint is already defined in server.ts,
  //  so we add a supplementary sync status via /api/v1/sync/status above)

  // --- Start both servers ---
  const apiAddr = await server.start();
  const hookAddr = await hookServer.start();

  console.log(`CC-Middleware API server listening on http://${apiAddr.host}:${apiAddr.port}`);
  console.log(`CC-Middleware Hook server listening on http://${hookAddr.host}:${hookAddr.port}`);
  console.log(`Project directory: ${projectDir}`);

  // --- Graceful shutdown ---
  async function shutdown(signal: string) {
    console.log(`\nReceived ${signal}, shutting down...`);

    // Stop sync components first
    if (autoIndexer) {
      autoIndexer.stop();
      console.log("Auto-indexer stopped.");
    }
    if (configWatcher) {
      await configWatcher.stop();
      console.log("Config watcher stopped.");
    }
    if (sessionWatcher) {
      await sessionWatcher.stop();
      console.log("Session watcher stopped.");
    }

    await server.stop();
    await hookServer.stop();
    sessionStore.close();
    await sessionManager.destroy();
    console.log("Shutdown complete.");
    process.exit(0);
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("Failed to start CC-Middleware:", err);
  process.exit(1);
});
