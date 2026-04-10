/**
 * Typed event bus for Claude Code hook events.
 * Supports all hook event types, wildcard listeners, and type-safe dispatch.
 */

import EventEmitter from "eventemitter3";
import type { HookEventType, HookInput } from "../types/hooks.js";

/**
 * Event signature map for the hook event bus.
 * Each event type maps to a handler signature.
 * The wildcard '*' event receives all events with their type.
 */
export interface EventBusEvents {
  PreToolUse: [input: HookInput];
  PostToolUse: [input: HookInput];
  PostToolUseFailure: [input: HookInput];
  SessionStart: [input: HookInput];
  SessionEnd: [input: HookInput];
  InstructionsLoaded: [input: HookInput];
  UserPromptSubmit: [input: HookInput];
  Stop: [input: HookInput];
  StopFailure: [input: HookInput];
  SubagentStart: [input: HookInput];
  SubagentStop: [input: HookInput];
  TaskCreated: [input: HookInput];
  TaskCompleted: [input: HookInput];
  TeammateIdle: [input: HookInput];
  PermissionRequest: [input: HookInput];
  PermissionDenied: [input: HookInput];
  Notification: [input: HookInput];
  ConfigChange: [input: HookInput];
  CwdChanged: [input: HookInput];
  FileChanged: [input: HookInput];
  WorktreeCreate: [input: HookInput];
  WorktreeRemove: [input: HookInput];
  PreCompact: [input: HookInput];
  PostCompact: [input: HookInput];
  Elicitation: [input: HookInput];
  ElicitationResult: [input: HookInput];
  Setup: [input: HookInput];
  "*": [eventType: HookEventType, input: HookInput];
}

/** All valid hook event type strings */
export const ALL_HOOK_EVENT_TYPES: readonly HookEventType[] = [
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
 * Hook event bus for dispatching and subscribing to Claude Code hook events.
 */
export class HookEventBus extends EventEmitter<EventBusEvents> {
  /**
   * Dispatch a hook event.
   * Emits both the specific event and the wildcard '*' event.
   */
  dispatch(eventType: HookEventType, input: HookInput): void {
    this.emit(eventType, input);
    this.emit("*", eventType, input);
  }

  /**
   * Get the number of handlers registered for a specific event,
   * or total handlers across all events if no event is specified.
   */
  getHandlerCount(eventType?: HookEventType): number {
    if (eventType) {
      return this.listenerCount(eventType);
    }

    let total = 0;
    for (const event of ALL_HOOK_EVENT_TYPES) {
      total += this.listenerCount(event);
    }
    // Also count wildcard listeners
    total += this.listenerCount("*");
    return total;
  }

  /**
   * Get the list of event types that have registered handlers.
   */
  getRegisteredEvents(): HookEventType[] {
    return ALL_HOOK_EVENT_TYPES.filter(
      (event) => this.listenerCount(event) > 0
    );
  }
}

/**
 * Create a new hook event bus instance.
 */
export function createEventBus(): HookEventBus {
  return new HookEventBus();
}
