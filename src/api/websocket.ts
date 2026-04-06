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
import { z } from "zod";
import type { MiddlewareContext } from "./server.js";
import type { HookEventType, HookInput } from "../types/hooks.js";
import type { LaunchResult } from "../sessions/launcher.js";
import type { TrackedSession } from "../sessions/manager.js";
import type { SessionStreamEvent } from "../sessions/streaming.js";

/** Client -> Server messages */
export type WSClientMessage =
  | { type: "subscribe"; events: string[] }
  | { type: "unsubscribe"; events: string[] }
  | { type: "ping" }
  | {
      type: "launch";
      options: {
        prompt: string;
        allowedTools?: string[];
        disallowedTools?: string[];
        permissionMode?: "default" | "acceptEdits" | "plan" | "dontAsk" | "bypassPermissions" | "auto";
        maxTurns?: number;
        maxBudgetUsd?: number;
        systemPrompt?: string;
        cwd?: string;
        effort?: "low" | "medium" | "high" | "max";
        model?: string;
        agent?: string;
        persistSession?: boolean;
      };
    }
  | {
      type: "resume";
      sessionId: string;
      prompt: string;
      maxTurns?: number;
      model?: string;
    };

export type WSSessionStreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "text"; text: string }
  | { type: "tool_use"; name: string; id: string }
  | { type: "tool_result"; name: string; result: unknown }
  | { type: "tool_progress"; name: string; toolUseId: string; elapsedSeconds: number }
  | { type: "system"; subtype: string; data: unknown }
  | { type: "unknown"; rawType: string; data: unknown };

/** Server -> Client messages */
export type WSServerMessage =
  | { type: "session:started"; sessionId: string; timestamp: number }
  | { type: "session:stream"; sessionId: string; event: WSSessionStreamEvent }
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
  | { type: "pong" }
  | { type: "error"; message: string };

/** A connected WebSocket client with its subscriptions */
interface WSClient {
  socket: WebSocket;
  subscriptions: Set<string>;
}

const LaunchSessionSchema = z.object({
  prompt: z.string().min(1),
  allowedTools: z.array(z.string()).optional(),
  disallowedTools: z.array(z.string()).optional(),
  permissionMode: z
    .enum(["default", "acceptEdits", "plan", "dontAsk", "bypassPermissions", "auto"])
    .optional(),
  maxTurns: z.number().int().positive().optional(),
  maxBudgetUsd: z.number().positive().optional(),
  systemPrompt: z.string().optional(),
  cwd: z.string().optional(),
  effort: z.enum(["low", "medium", "high", "max"]).optional(),
  model: z.string().optional(),
  agent: z.string().optional(),
  persistSession: z.boolean().optional(),
});

const ResumeSessionSchema = z.object({
  sessionId: z.string().min(1),
  prompt: z.string().min(1),
  maxTurns: z.number().int().positive().optional(),
  model: z.string().optional(),
});

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

          case "launch": {
            const parsed = LaunchSessionSchema.safeParse(msg.options);
            if (!parsed.success) {
              sendToClient(client, {
                type: "error",
                message: `Invalid launch message: ${parsed.error.issues[0]?.message ?? "validation error"}`,
              });
              break;
            }

            void startStreamingSession(parsed.data);
            break;
          }

          case "resume": {
            const parsed = ResumeSessionSchema.safeParse({
              sessionId: msg.sessionId,
              prompt: msg.prompt,
              maxTurns: msg.maxTurns,
              model: msg.model,
            });
            if (!parsed.success) {
              sendToClient(client, {
                type: "error",
                message: `Invalid resume message: ${parsed.error.issues[0]?.message ?? "validation error"}`,
              });
              break;
            }

            void startStreamingSession({
              prompt: parsed.data.prompt,
              resume: parsed.data.sessionId,
              maxTurns: parsed.data.maxTurns,
              model: parsed.data.model,
            }, parsed.data.sessionId);
            break;
          }

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

  async function startStreamingSession(
    options: Parameters<typeof ctx.sessionManager.launchStreaming>[0],
    resumeSessionId?: string
  ): Promise<void> {
    try {
      const streamingSession = await ctx.sessionManager.launchStreaming(options);

      for await (const event of streamingSession.events) {
        const sessionId = streamingSession.sessionId || resumeSessionId || "pending";
        const wsEvent = toWSSessionStreamEvent(event);
        if (!wsEvent) continue;

        broadcast("session:stream", {
          type: "session:stream",
          sessionId,
          event: wsEvent,
        });
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      broadcast("session:*", {
        type: "session:errored",
        sessionId: resumeSessionId ?? "unknown",
        error: err.message,
      });
    }
  }

  // Return broadcaster for external use (sync events)
  return { broadcast };
}

function toWSSessionStreamEvent(event: SessionStreamEvent): WSSessionStreamEvent | null {
  switch (event.type) {
    case "text_delta":
      return { type: "text_delta", text: event.text };
    case "assistant_message":
      return { type: "text", text: event.content };
    case "tool_use_start":
      return { type: "tool_use", name: event.toolName, id: event.toolId };
    case "tool_result":
      return { type: "tool_result", name: event.toolName, result: event.result };
    case "tool_progress":
      return {
        type: "tool_progress",
        name: event.toolName,
        toolUseId: event.toolUseId,
        elapsedSeconds: event.elapsedSeconds,
      };
    case "system":
      return { type: "system", subtype: event.subtype, data: event.data };
    case "unknown":
      return { type: "unknown", rawType: event.rawType, data: event.data };
    case "tool_use_end":
    case "result":
      return null;
  }
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
