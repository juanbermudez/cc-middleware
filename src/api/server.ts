/**
 * Middleware API server.
 * Exposes all middleware functionality through REST/WebSocket HTTP API.
 * All endpoints prefixed with /api/v1/.
 * Uses Zod for request/response validation.
 * Consistent error format: { error: { code, message, details? } }.
 */

import Fastify from "fastify";
import fastifyWebsocket from "@fastify/websocket";
import type { FastifyInstance } from "fastify";
import type { SessionManager } from "../sessions/manager.js";
import type { HookEventBus } from "../hooks/event-bus.js";
import type { BlockingHookRegistry } from "../hooks/blocking.js";
import type { PolicyEngine } from "../permissions/policy.js";
import type { AgentRegistry } from "../agents/registry.js";
import type { TeamManager } from "../agents/teams.js";
import type { PermissionManager } from "../permissions/handler.js";
import type { AskUserQuestionManager } from "../permissions/ask-user.js";
import { registerSessionRoutes } from "./routes/sessions.js";
import { registerEventRoutes } from "./routes/events.js";
import { registerAgentRoutes } from "./routes/agents.js";
import { registerWebSocketRoutes } from "./websocket.js";

/** Options for creating the middleware API server */
export interface MiddlewareServerOptions {
  port?: number;
  host?: string;
  sessionManager: SessionManager;
  eventBus: HookEventBus;
  blockingRegistry: BlockingHookRegistry;
  policyEngine: PolicyEngine;
  agentRegistry: AgentRegistry;
  teamManager: TeamManager;
  permissionManager: PermissionManager;
  askUserManager: AskUserQuestionManager;
}

/** Context shared with all route handlers */
export interface MiddlewareContext {
  sessionManager: SessionManager;
  eventBus: HookEventBus;
  blockingRegistry: BlockingHookRegistry;
  policyEngine: PolicyEngine;
  agentRegistry: AgentRegistry;
  teamManager: TeamManager;
  permissionManager: PermissionManager;
  askUserManager: AskUserQuestionManager;
}

/** The middleware server instance */
export interface MiddlewareServer {
  start: () => Promise<{ port: number; host: string }>;
  stop: () => Promise<void>;
  app: FastifyInstance;
  url: string;
}

const startTime = Date.now();

/**
 * Create the middleware API server.
 * Sets up Fastify with health check, status endpoint, error handling,
 * and decorates with shared context for route handlers.
 */
export async function createMiddlewareServer(
  options: MiddlewareServerOptions
): Promise<MiddlewareServer> {
  const port = options.port ?? 3000;
  const host = options.host ?? "127.0.0.1";

  const app = Fastify({ logger: false });

  // Build the shared context
  const ctx: MiddlewareContext = {
    sessionManager: options.sessionManager,
    eventBus: options.eventBus,
    blockingRegistry: options.blockingRegistry,
    policyEngine: options.policyEngine,
    agentRegistry: options.agentRegistry,
    teamManager: options.teamManager,
    permissionManager: options.permissionManager,
    askUserManager: options.askUserManager,
  };

  // Decorate Fastify with context so routes can access it
  app.decorate("ctx", ctx);

  // Global error handler - consistent error format
  app.setErrorHandler((error, _request, reply) => {
    const err = error as { statusCode?: number; code?: string; message?: string; validation?: unknown };
    const statusCode = err.statusCode ?? 500;
    reply.status(statusCode).send({
      error: {
        code: err.code ?? "INTERNAL_ERROR",
        message: err.message ?? "Unknown error",
        details: statusCode === 500 ? undefined : err.validation,
      },
    });
  });

  // 404 handler
  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({
      error: {
        code: "NOT_FOUND",
        message: "Endpoint not found",
      },
    });
  });

  // Health check endpoint
  app.get("/health", async () => {
    return {
      status: "ok",
      version: "0.1.0",
      uptime: Math.floor((Date.now() - startTime) / 1000),
    };
  });

  // Register WebSocket plugin
  await app.register(fastifyWebsocket);

  // Register route modules
  registerSessionRoutes(app, ctx);
  registerEventRoutes(app, ctx);
  registerAgentRoutes(app, ctx);
  registerWebSocketRoutes(app, ctx);

  // Status endpoint
  app.get("/api/v1/status", async () => {
    return {
      activeSessions: ctx.sessionManager.getActiveSessions().length,
      registeredAgents: ctx.agentRegistry.size,
      hookHandlerCount: ctx.eventBus.getHandlerCount(),
      registeredEvents: ctx.eventBus.getRegisteredEvents(),
      pendingPermissions: ctx.permissionManager.getPendingPermissions().length,
      pendingQuestions: ctx.askUserManager.getPendingQuestions().length,
      policyRuleCount: ctx.policyEngine.getRules().length,
    };
  });

  let serverUrl = `http://${host}:${port}`;

  return {
    start: async () => {
      await app.listen({ port, host });
      const address = app.server.address();
      if (address && typeof address === "object") {
        serverUrl = `http://${address.address}:${address.port}`;
        return { port: address.port, host: address.address };
      }
      return { port, host };
    },
    stop: async () => {
      await app.close();
    },
    app,
    get url() {
      return serverUrl;
    },
  };
}
