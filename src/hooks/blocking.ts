/**
 * Blocking hook stubs and registry.
 *
 * Provides default stub handlers for all blocking events that return {}
 * (proceed with no changes). Consumers can register custom handlers
 * that override defaults. Supports matcher patterns for tool-specific hooks.
 *
 * IMPORTANT: Hook callbacks return HookJSONOutput, NOT PermissionResult.
 * Returning {} means "proceed normally" for ALL events.
 * This is distinct from canUseTool (Phase 5) which returns PermissionResult.
 */

import type {
  BlockingEventType,
  HookJSONOutput,
  HookInput,
} from "../types/hooks.js";
import { generateId } from "../utils/id.js";

/** Handler function type for blocking hooks */
export type BlockingHookHandler = (
  input: HookInput
) => Promise<HookJSONOutput>;

/** A registered handler entry with optional matcher */
interface HandlerEntry {
  id: string;
  handler: BlockingHookHandler;
  /** Regex pattern to match tool names (for PreToolUse, PostToolUse, etc.) */
  matcher?: RegExp;
}

/** All blocking event types */
export const BLOCKING_EVENTS: readonly BlockingEventType[] = [
  "PreToolUse",
  "PermissionRequest",
  "UserPromptSubmit",
  "Stop",
  "SubagentStop",
  "TeammateIdle",
  "TaskCreated",
  "TaskCompleted",
  "ConfigChange",
  "Elicitation",
  "ElicitationResult",
  "WorktreeCreate",
] as const;

/** Set of blocking event type strings for quick lookup */
export const BLOCKING_EVENT_SET = new Set<string>(BLOCKING_EVENTS);

/** Default stub: proceed with no changes */
const DEFAULT_STUB: BlockingHookHandler = async () => ({});

/**
 * Registry for blocking hook handlers.
 * Each blocking event has a default stub that returns {} (proceed).
 * Custom handlers can be registered to override defaults.
 */
export class BlockingHookRegistry {
  private handlers = new Map<BlockingEventType, HandlerEntry[]>();

  constructor() {
    // Initialize with empty handler lists for all blocking events
    for (const event of BLOCKING_EVENTS) {
      this.handlers.set(event, []);
    }
  }

  /**
   * Register a handler for a blocking event.
   * Returns an unregister function that restores the default stub.
   */
  register(
    event: BlockingEventType,
    handler: BlockingHookHandler,
    options?: { matcher?: string }
  ): () => void {
    const id = generateId("handler");

    const entry: HandlerEntry = {
      id,
      handler,
      matcher: options?.matcher ? new RegExp(options.matcher) : undefined,
    };

    const entries = this.handlers.get(event) ?? [];
    entries.push(entry);
    this.handlers.set(event, entries);

    // Return unregister function
    return () => {
      const current = this.handlers.get(event) ?? [];
      this.handlers.set(
        event,
        current.filter((e) => e.id !== id)
      );
    };
  }

  /**
   * Get the handler for an event, considering matcher patterns.
   * Returns the most recently registered matching handler, or the default stub.
   */
  getHandler(
    event: BlockingEventType,
    toolName?: string
  ): BlockingHookHandler {
    const entries = this.handlers.get(event) ?? [];

    // Search in reverse order (most recently registered first)
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];

      // If entry has a matcher, check if tool name matches
      if (entry.matcher) {
        if (toolName && entry.matcher.test(toolName)) {
          return entry.handler;
        }
        continue;
      }

      // No matcher means it matches everything
      return entry.handler;
    }

    return DEFAULT_STUB;
  }

  /**
   * Execute the handler chain for a blocking event.
   * Finds the matching handler and runs it.
   */
  async execute(
    event: BlockingEventType,
    input: HookInput,
    toolName?: string
  ): Promise<HookJSONOutput> {
    const handler = this.getHandler(event, toolName);
    return handler(input);
  }

  /**
   * Check if an event has any custom (non-default) handlers registered.
   */
  hasCustomHandlers(event: BlockingEventType): boolean {
    const entries = this.handlers.get(event) ?? [];
    return entries.length > 0;
  }

  /**
   * Get the list of blocking event types.
   */
  getBlockingEvents(): readonly BlockingEventType[] {
    return BLOCKING_EVENTS;
  }

  /**
   * Get the count of registered handlers for an event.
   */
  getHandlerCount(event: BlockingEventType): number {
    return (this.handlers.get(event) ?? []).length;
  }
}

/**
 * Create a new blocking hook registry with default stubs.
 */
export function createBlockingRegistry(): BlockingHookRegistry {
  return new BlockingHookRegistry();
}
