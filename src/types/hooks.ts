/**
 * Hook event types for CC-Middleware.
 *
 * IMPORTANT: There are two distinct type systems:
 * 1. HookJSONOutput - What hook callbacks (Phase 4) return
 * 2. PermissionResult - What canUseTool (Phase 5) returns
 * These must NOT be conflated.
 */

/** All supported hook event type strings */
export type HookEventType =
  | "PreToolUse"
  | "PostToolUse"
  | "PostToolUseFailure"
  | "SessionStart"
  | "SessionEnd"
  | "UserPromptSubmit"
  | "Stop"
  | "StopFailure"
  | "SubagentStart"
  | "SubagentStop"
  | "TaskCreated"
  | "TaskCompleted"
  | "TeammateIdle"
  | "PermissionRequest"
  | "PermissionDenied"
  | "Notification"
  | "ConfigChange"
  | "CwdChanged"
  | "FileChanged"
  | "WorktreeCreate"
  | "WorktreeRemove"
  | "PreCompact"
  | "PostCompact"
  | "Elicitation"
  | "ElicitationResult"
  | "Setup";

/** Blocking event types that can prevent/deny actions */
export type BlockingEventType =
  | "PreToolUse"
  | "PermissionRequest"
  | "UserPromptSubmit"
  | "Stop"
  | "SubagentStop"
  | "TeammateIdle"
  | "TaskCreated"
  | "TaskCompleted"
  | "ConfigChange"
  | "Elicitation"
  | "ElicitationResult"
  | "WorktreeCreate";

/** Non-blocking event types (observation only) */
export type NonBlockingEventType = Exclude<HookEventType, BlockingEventType>;

/**
 * Hook-specific output nested within HookJSONOutput.
 * hookEventName is REQUIRED and must match the event type.
 */
export interface HookSpecificOutput {
  hookEventName: string;
  /** For PreToolUse and PermissionRequest */
  permissionDecision?: "allow" | "deny" | "ask" | "defer";
  permissionDecisionReason?: string;
  /** For PreToolUse only (requires permissionDecision: "allow") */
  updatedInput?: Record<string, unknown>;
  /** Additional context message visible to the model */
  additionalContext?: string;
  /** For PermissionRequest only */
  decision?: { behavior: "allow" | "deny" };
}

/**
 * Output format for hook callbacks.
 * Returning {} (empty object) means "proceed with no changes" for ALL events.
 */
export interface HookJSONOutput {
  systemMessage?: string;
  continue?: boolean;
  suppressOutput?: boolean;
  stopReason?: string;
  /** For Stop/TaskCompleted/TeammateIdle blocking */
  decision?: "approve" | "block";
  reason?: string;
  hookSpecificOutput?: HookSpecificOutput;
}

/** Async hook output for fire-and-forget observation hooks */
export interface AsyncHookJSONOutput {
  async: true;
  asyncTimeout?: number;
}

/** Our handler type for hook events */
export type HookHandler<TInput = unknown> = (
  input: TInput
) => Promise<HookJSONOutput>;

/** Registration record for a hook subscription */
export interface HookSubscription {
  id: string;
  event: HookEventType;
  handler: HookHandler;
  matcher?: string;
}

/** Common fields present in most hook inputs */
export interface BaseHookInput {
  session_id: string;
  cwd: string;
  hook_event_name: string;
}

/** PreToolUse hook input */
export interface PreToolUseInput extends BaseHookInput {
  hook_event_name: "PreToolUse";
  tool_name: string;
  tool_input: Record<string, unknown>;
}

/** PostToolUse hook input */
export interface PostToolUseInput extends BaseHookInput {
  hook_event_name: "PostToolUse";
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_output: unknown;
}

/** PostToolUseFailure hook input */
export interface PostToolUseFailureInput extends BaseHookInput {
  hook_event_name: "PostToolUseFailure";
  tool_name: string;
  tool_input: Record<string, unknown>;
  error: string;
}

/** SessionStart hook input */
export interface SessionStartInput extends BaseHookInput {
  hook_event_name: "SessionStart";
}

/** SessionEnd hook input */
export interface SessionEndInput extends BaseHookInput {
  hook_event_name: "SessionEnd";
}

/** Stop hook input */
export interface StopInput extends BaseHookInput {
  hook_event_name: "Stop";
  stop_reason: string;
}

/** UserPromptSubmit hook input */
export interface UserPromptSubmitInput extends BaseHookInput {
  hook_event_name: "UserPromptSubmit";
  prompt: string;
}

/** Union of all hook input types */
export type HookInput =
  | PreToolUseInput
  | PostToolUseInput
  | PostToolUseFailureInput
  | SessionStartInput
  | SessionEndInput
  | StopInput
  | UserPromptSubmitInput
  | BaseHookInput;
