/**
 * Bridge between Agent SDK hooks and the middleware event bus.
 *
 * Converts middleware event registrations into the SDK's `hooks` option format.
 * For non-blocking events: dispatches to event bus, returns empty output.
 * For blocking events: dispatches to event bus AND runs blocking handler, returns result.
 *
 * IMPORTANT: Hook callbacks return HookJSONOutput, NOT PermissionResult.
 * These are separate systems. canUseTool (Phase 5) uses PermissionResult.
 */

import type {
  HookEvent,
  HookCallbackMatcher,
  HookCallback,
  HookInput as SDKHookInput,
  HookJSONOutput as SDKHookJSONOutput,
} from "@anthropic-ai/claude-agent-sdk";
import type { HookEventType, HookInput, BlockingEventType } from "../types/hooks.js";
import { ALL_HOOK_EVENT_TYPES } from "./event-bus.js";
import type { HookEventBus } from "./event-bus.js";
import { BLOCKING_EVENT_SET } from "./blocking.js";
import type { BlockingHookRegistry } from "./blocking.js";
import { extractToolName as extractToolNameFromRecord } from "./utils.js";

/**
 * SDK-supported hook events.
 *
 * Keep this list separate from the broader Claude Code hook surface so the
 * middleware can represent full HTTP hook coverage without assuming every
 * event should be bridged into the Agent SDK callback layer.
 */
export const SDK_HOOK_EVENT_TYPES: readonly HookEventType[] = [
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "SessionStart",
  "SessionEnd",
  "InstructionsLoaded",
  "UserPromptSubmit",
  "Stop",
  "StopFailure",
  "SubagentStart",
  "SubagentStop",
  "TaskCreated",
  "TaskCompleted",
  "TeammateIdle",
  "PermissionRequest",
  "PermissionDenied",
  "Notification",
  "ConfigChange",
  "CwdChanged",
  "FileChanged",
  "WorktreeCreate",
  "WorktreeRemove",
  "PreCompact",
  "PostCompact",
  "Elicitation",
  "ElicitationResult",
  "Setup",
] as const;

/**
 * Extract tool name from SDK hook input (for PreToolUse, PostToolUse, etc.)
 */
function extractToolName(input: SDKHookInput): string | undefined {
  return extractToolNameFromRecord(input as unknown as Record<string, unknown>);
}

/**
 * Convert SDK HookInput to our HookInput type.
 * The SDK input has additional fields (transcript_path, permission_mode)
 * that we preserve by casting.
 */
function toMiddlewareInput(sdkInput: SDKHookInput): HookInput {
  // The SDK input is a superset of our HookInput, so we can cast directly.
  // Our HookInput interface requires session_id, cwd, hook_event_name at minimum.
  return sdkInput as unknown as HookInput;
}

/**
 * Create a single HookCallback that bridges to the event bus and blocking registry.
 */
function createBridgeCallback(
  eventType: HookEventType,
  eventBus: HookEventBus,
  blockingRegistry: BlockingHookRegistry
): HookCallback {
  return async (
    sdkInput: SDKHookInput,
    _toolUseID: string | undefined,
    _options: { signal: AbortSignal }
  ): Promise<SDKHookJSONOutput> => {
    const middlewareInput = toMiddlewareInput(sdkInput);
    const toolName = extractToolName(sdkInput);

    // Dispatch to event bus for all listeners
    eventBus.dispatch(eventType, middlewareInput);

    // For blocking events, execute the blocking handler
    if (BLOCKING_EVENT_SET.has(eventType)) {
      const result = await blockingRegistry.execute(
        eventType as BlockingEventType,
        middlewareInput,
        toolName
      );
      return result as SDKHookJSONOutput;
    }

    // For non-blocking events, return empty output (proceed)
    return {};
  };
}

/**
 * Generate the SDK `hooks` option from the event bus and blocking registry.
 *
 * Creates a HookCallbackMatcher for each event type that has handlers
 * registered on the event bus, or has custom blocking handlers.
 * Also creates callbacks for all blocking events (even without custom handlers)
 * to ensure the event bus receives all events.
 *
 * @param eventBus - The hook event bus to dispatch events to
 * @param blockingRegistry - The blocking hook registry for blocking events
 * @param eventTypes - Optional list of event types to bridge. If omitted, bridges all.
 * @returns Partial Record of HookEvent to HookCallbackMatcher arrays for the SDK
 */
export function createSDKHooks(
  eventBus: HookEventBus,
  blockingRegistry: BlockingHookRegistry,
  eventTypes?: HookEventType[]
): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  const hooks: Partial<Record<HookEvent, HookCallbackMatcher[]>> = {};

  // Determine which events to bridge
  const eventsToRegister = (eventTypes ?? getActiveEvents(eventBus, blockingRegistry))
    .filter((event): event is HookEventType => SDK_HOOK_EVENT_TYPES.includes(event));

  for (const eventType of eventsToRegister) {
    const callback = createBridgeCallback(eventType, eventBus, blockingRegistry);

    hooks[eventType as HookEvent] = [
      {
        hooks: [callback],
      },
    ];
  }

  return hooks;
}

/**
 * Get the list of event types that should have bridge callbacks.
 * Includes events with handlers on the event bus or custom blocking handlers.
 */
function getActiveEvents(
  eventBus: HookEventBus,
  blockingRegistry: BlockingHookRegistry
): HookEventType[] {
  const activeEvents = new Set<HookEventType>();

  // Add events with handlers on the event bus
  for (const event of eventBus.getRegisteredEvents()) {
    activeEvents.add(event);
  }

  // Add events with wildcard handler (means all events should be bridged)
  if (eventBus.listenerCount("*" as HookEventType) > 0) {
    // If there's a wildcard listener, bridge all events
    for (const event of ALL_HOOK_EVENT_TYPES) {
      activeEvents.add(event);
    }
  }

  // Add blocking events with custom handlers
  for (const event of blockingRegistry.getBlockingEvents()) {
    if (blockingRegistry.hasCustomHandlers(event)) {
      activeEvents.add(event);
    }
  }

  return Array.from(activeEvents);
}

/**
 * Create SDK hooks that bridge ALL events (not just active ones).
 * Useful when you want to observe all events regardless of current registrations.
 */
export function createFullSDKHooks(
  eventBus: HookEventBus,
  blockingRegistry: BlockingHookRegistry
): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  return createSDKHooks(eventBus, blockingRegistry, [...SDK_HOOK_EVENT_TYPES]);
}
