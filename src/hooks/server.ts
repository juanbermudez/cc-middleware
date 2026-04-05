/**
 * HTTP hook server that receives hook events from external Claude Code sessions.
 *
 * Accepts POST requests matching Claude Code's HTTP hook format, dispatches
 * received events to the event bus, and returns appropriate responses.
 *
 * IMPORTANT: Always returns HTTP 200. The JSON body determines allow/deny,
 * NOT the HTTP status code. Non-2xx responses are treated as non-blocking
 * errors by Claude Code (it continues anyway).
 */

import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import type { HookEventType, HookInput, BlockingEventType } from "../types/hooks.js";
import { ALL_HOOK_EVENT_TYPES } from "./event-bus.js";
import type { HookEventBus } from "./event-bus.js";
import { BLOCKING_EVENT_SET } from "./blocking.js";
import type { BlockingHookRegistry } from "./blocking.js";
import { extractToolName } from "./utils.js";

const VALID_EVENTS = new Set<string>(ALL_HOOK_EVENT_TYPES);

export interface HookServerOptions {
  port?: number;
  host?: string;
  eventBus: HookEventBus;
  blockingRegistry: BlockingHookRegistry;
}

export interface HookServer {
  start: () => Promise<{ port: number; host: string }>;
  stop: () => Promise<void>;
  url: string;
  app: FastifyInstance;
}

/**
 * Create an HTTP hook server that receives events from Claude Code.
 */
export async function createHookServer(
  options: HookServerOptions
): Promise<HookServer> {
  const port = options.port ?? 3001;
  const host = options.host ?? "127.0.0.1";

  const app = Fastify({ logger: false });

  // Health check endpoint
  app.get("/health", async () => {
    return { status: "ok" };
  });

  // Hook event endpoint: POST /hooks/:eventType
  app.post<{
    Params: { eventType: string };
    Body: Record<string, unknown>;
  }>("/hooks/:eventType", async (request, reply) => {
    const { eventType } = request.params;

    // Validate event type
    if (!VALID_EVENTS.has(eventType)) {
      // Still return 200 per protocol - unknown events are ignored
      return reply.status(200).send({});
    }

    const hookEventType = eventType as HookEventType;
    const body = (request.body ?? {}) as Record<string, unknown>;

    // Convert to HookInput
    const input: HookInput = {
      session_id: (body.session_id as string) ?? "",
      cwd: (body.cwd as string) ?? "",
      hook_event_name: hookEventType,
      ...body,
    } as HookInput;

    // Dispatch to event bus
    options.eventBus.dispatch(hookEventType, input);

    // For blocking events, execute the blocking handler
    if (BLOCKING_EVENT_SET.has(eventType)) {
      const toolName = extractToolName(body);
      const result = await options.blockingRegistry.execute(
        hookEventType as BlockingEventType,
        input,
        toolName
      );
      // Always return 200 with JSON body
      return reply.status(200).send(result);
    }

    // For non-blocking events, return 200 with empty body
    return reply.status(200).send({});
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
    get url() {
      return serverUrl;
    },
    app,
  };
}
