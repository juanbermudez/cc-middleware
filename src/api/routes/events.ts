/**
 * Hook and event REST endpoints.
 * Provides event type listing and webhook subscription management.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ALL_HOOK_EVENT_TYPES } from "../../hooks/event-bus.js";
import type { MiddlewareContext } from "../server.js";
import type { HookEventType, HookInput } from "../../types/hooks.js";

/** A webhook subscription */
export interface WebhookSubscription {
  id: string;
  url: string;
  events: string[];
  headers: Record<string, string>;
  secret?: string;
  createdAt: number;
}

/** Request schemas */
const CreateSubscriptionSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string()).min(1),
  headers: z.record(z.string(), z.string()).optional(),
  secret: z.string().optional(),
});

/** Webhook subscription store (in-memory) */
const subscriptions = new Map<string, WebhookSubscription>();
/** Cleanup listeners for each subscription */
const cleanupListeners = new Map<string, () => void>();

/**
 * Register event/hook routes on the Fastify instance.
 */
export function registerEventRoutes(app: FastifyInstance, ctx: MiddlewareContext): void {
  // GET /api/v1/events/types - List available event types
  app.get("/api/v1/events/types", async () => {
    return {
      eventTypes: ALL_HOOK_EVENT_TYPES,
      total: ALL_HOOK_EVENT_TYPES.length,
    };
  });

  // POST /api/v1/events/subscribe - Register webhook URL
  app.post<{ Body: unknown }>("/api/v1/events/subscribe", async (request, reply) => {
    const parseResult = CreateSubscriptionSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request body",
          details: parseResult.error.issues,
        },
      });
    }

    const body = parseResult.data;
    const id = `sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const subscription: WebhookSubscription = {
      id,
      url: body.url,
      events: body.events,
      headers: body.headers ?? {},
      secret: body.secret,
      createdAt: Date.now(),
    };

    subscriptions.set(id, subscription);

    // Wire up event bus listener for this subscription
    const listener = (eventType: HookEventType, input: HookInput) => {
      if (
        subscription.events.includes(eventType) ||
        subscription.events.includes("*")
      ) {
        // Fire and forget webhook delivery
        deliverWebhook(subscription, eventType, input).catch(() => {
          // Delivery failure - could add retry logic here
        });
      }
    };

    ctx.eventBus.on("*", listener);

    // Store cleanup function for later removal
    cleanupListeners.set(id, () => {
      ctx.eventBus.off("*", listener);
    });

    return reply.status(201).send({
      id: subscription.id,
      events: subscription.events,
      url: subscription.url,
    });
  });

  // GET /api/v1/events/subscriptions - List subscriptions
  app.get("/api/v1/events/subscriptions", async () => {
    const subs = Array.from(subscriptions.values()).map((s) => ({
      id: s.id,
      url: s.url,
      events: s.events,
      createdAt: s.createdAt,
    }));

    return {
      subscriptions: subs,
      total: subs.length,
    };
  });

  // DELETE /api/v1/events/subscriptions/:id - Remove subscription
  app.delete<{
    Params: { id: string };
  }>("/api/v1/events/subscriptions/:id", async (request, reply) => {
    const { id } = request.params;

    const sub = subscriptions.get(id);
    if (!sub) {
      return reply.status(404).send({
        error: { code: "SUBSCRIPTION_NOT_FOUND", message: `Subscription ${id} not found` },
      });
    }

    // Clean up event bus listener
    const cleanup = cleanupListeners.get(id);
    if (cleanup) {
      cleanup();
      cleanupListeners.delete(id);
    }

    subscriptions.delete(id);

    return reply.send({ status: "deleted", id });
  });
}

/**
 * Deliver a webhook to a subscription URL.
 */
async function deliverWebhook(
  subscription: WebhookSubscription,
  eventType: string,
  input: HookInput
): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...subscription.headers,
  };

  if (subscription.secret) {
    // Simple HMAC placeholder - in production, use crypto.createHmac
    headers["X-Webhook-Secret"] = subscription.secret;
  }

  await fetch(subscription.url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      eventType,
      input,
      subscriptionId: subscription.id,
      timestamp: Date.now(),
    }),
    signal: AbortSignal.timeout(10000),
  });
}
