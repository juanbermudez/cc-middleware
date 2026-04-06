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

async function main() {
  const host = process.env.HOST ?? "127.0.0.1";
  const port = parseInt(process.env.PORT ?? "3000", 10);
  const hookPort = parseInt(process.env.HOOK_PORT ?? "3001", 10);
  const projectDir = process.env.PROJECT_DIR ?? process.cwd();

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

  // --- Start both servers ---
  const apiAddr = await server.start();
  const hookAddr = await hookServer.start();

  console.log(`CC-Middleware API server listening on http://${apiAddr.host}:${apiAddr.port}`);
  console.log(`CC-Middleware Hook server listening on http://${hookAddr.host}:${hookAddr.port}`);
  console.log(`Project directory: ${projectDir}`);

  // --- Graceful shutdown ---
  async function shutdown(signal: string) {
    console.log(`\nReceived ${signal}, shutting down...`);
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
