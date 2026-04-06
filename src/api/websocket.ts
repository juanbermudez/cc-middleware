/**
 * WebSocket streaming support for the middleware API.
 * Provides real-time session events, hook events, and permission notifications.
 *
 * Protocol:
 * - Client sends JSON messages to subscribe/unsubscribe to events or launch sessions
 * - Server sends JSON messages with event data
 */

import type { FastifyInstance } from "fastify";
import type WebSocket from "ws";
import type { MiddlewareContext } from "./server.js";
import type { HookEventType, HookInput } from "../types/hooks.js";
import type { LaunchResult } from "../sessions/launcher.js";
import type { TrackedSession } from "../sessions/manager.js";

/** Client -> Server messages */
export type WSClientMessage =
  | { type: "subscribe"; events: string[] }
  | { type: "unsubscribe"; events: string[] }
  | { type: "ping" };

/** Server -> Client messages */
export type WSServerMessage =
  | { type: "session:started"; sessionId: string; timestamp: number }
  | { type: "session:completed"; sessionId: string; result: LaunchResult }
  | { type: "session:errored"; sessionId: string; error: string }
  | { type: "session:aborted"; sessionId: string }
  | { type: "session:discovered"; sessionId: string; timestamp: number }
  | { type: "session:updated"; sessionId: string; timestamp: number }
  | { type: "session:removed"; sessionId: string; timestamp: number }
  | { type: "config:changed"; scope: string; path: string; timestamp: number }
  | { type: "config:mcp-changed"; path: string; timestamp: number }
  | { type: "config:agent-changed"; name: string; action: string; timestamp: number }
  | { type: "config:skill-changed"; name: string; action: string; timestamp: number }
  | { type: "config:rule-changed"; name: string; action: string; timestamp: number }
  | { type: "config:plugin-changed"; path: string; timestamp: number }
  | { type: "config:memory-changed"; path: string; timestamp: number }
  | { type: "team:created"; teamName: string; timestamp: number }
  | { type: "team:updated"; teamName: string; timestamp: number }
  | { type: "team:task-updated"; path: string; timestamp: number }
  | { type: "hook:event"; eventType: string; input: HookInput }
  | { type: "permission:pending"; id: string; toolName: string; toolUseID: string }
  | { type: "pong" }
  | { type: "error"; message: string };

/** A connected WebSocket client with its subscriptions */
interface WSClient {
  socket: WebSocket;
  subscriptions: Set<string>;
}

/** A handle to the WebSocket broadcast system */
export interface WebSocketBroadcaster {
  /** Broadcast a message to all clients matching the given pattern */
  broadcast(pattern: string, message: WSServerMessage): void;
}

/**
 * Register WebSocket routes on the Fastify instance.
 * Requires @fastify/websocket plugin to be registered first.
 * Returns a broadcaster that can be used to push sync events.
 */
export function registerWebSocketRoutes(
  app: FastifyInstance,
  ctx: MiddlewareContext
): WebSocketBroadcaster {
  const clients = new Set<WSClient>();

  // Helper: send a message to a client
  function sendToClient(client: WSClient, message: WSServerMessage): void {
    if (client.socket.readyState === 1 /* WebSocket.OPEN */) {
      client.socket.send(JSON.stringify(message));
    }
  }

  // Helper: broadcast to all clients matching a subscription pattern
  function broadcast(pattern: string, message: WSServerMessage): void {
    for (const client of clients) {
      if (matchesSubscription(client.subscriptions, pattern)) {
        sendToClient(client, message);
      }
    }
  }

  // Wire up session manager events
  ctx.sessionManager.on("session:started", (session: TrackedSession) => {
    broadcast("session:*", {
      type: "session:started",
      sessionId: session.sessionId,
      timestamp: session.startedAt,
    });
  });

  ctx.sessionManager.on("session:completed", (result: LaunchResult, _session: TrackedSession) => {
    broadcast("session:*", {
      type: "session:completed",
      sessionId: result.sessionId,
      result,
    });
  });

  ctx.sessionManager.on("session:errored", (error: Error, session: TrackedSession) => {
    broadcast("session:*", {
      type: "session:errored",
      sessionId: session.sessionId,
      error: error.message,
    });
  });

  ctx.sessionManager.on("session:aborted", (session: TrackedSession) => {
    broadcast("session:*", {
      type: "session:aborted",
      sessionId: session.sessionId,
    });
  });

  // Wire up hook event bus
  ctx.eventBus.on("*", (eventType: HookEventType, input: HookInput) => {
    broadcast(`hook:${eventType}`, {
      type: "hook:event",
      eventType,
      input,
    });
    // Also broadcast to hook:* wildcard subscribers
    broadcast("hook:*", {
      type: "hook:event",
      eventType,
      input,
    });
  });

  // WebSocket endpoint
  app.get("/api/v1/ws", { websocket: true }, (socket: WebSocket) => {
    const client: WSClient = {
      socket,
      subscriptions: new Set(),
    };
    clients.add(client);

    socket.on("message", (data: Buffer | string) => {
      try {
        const raw = typeof data === "string" ? data : data.toString("utf-8");
        const msg = JSON.parse(raw) as WSClientMessage;

        switch (msg.type) {
          case "subscribe":
            for (const event of msg.events) {
              client.subscriptions.add(event);
            }
            break;

          case "unsubscribe":
            for (const event of msg.events) {
              client.subscriptions.delete(event);
            }
            break;

          case "ping":
            sendToClient(client, { type: "pong" });
            break;

          default:
            sendToClient(client, {
              type: "error",
              message: `Unknown message type: ${(msg as Record<string, unknown>).type}`,
            });
        }
      } catch {
        sendToClient(client, {
          type: "error",
          message: "Invalid JSON message",
        });
      }
    });

    socket.on("close", () => {
      clients.delete(client);
    });

    socket.on("error", () => {
      clients.delete(client);
    });
  });

  // Return broadcaster for external use (sync events)
  return { broadcast };
}

/**
 * Check if a set of subscriptions matches a broadcast pattern.
 * Supports exact match and wildcard (*) matching.
 *
 * Examples:
 * - subscriptions: {"session:*"}, pattern: "session:started" -> true
 * - subscriptions: {"hook:PreToolUse"}, pattern: "hook:PreToolUse" -> true
 * - subscriptions: {"hook:PostToolUse"}, pattern: "hook:PreToolUse" -> false
 * - subscriptions: {"*"}, pattern: anything -> true
 */
function matchesSubscription(subscriptions: Set<string>, pattern: string): boolean {
  if (subscriptions.has("*")) return true;
  if (subscriptions.has(pattern)) return true;

  // Check wildcard subscriptions (e.g., "session:*" matches "session:started")
  const patternPrefix = pattern.split(":")[0];
  if (patternPrefix && subscriptions.has(`${patternPrefix}:*`)) return true;

  return false;
}
