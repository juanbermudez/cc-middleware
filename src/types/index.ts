/**
 * CC-Middleware type definitions.
 * All types are re-exported from this barrel file.
 */

export type {
  SessionInfo,
  SessionMessage,
  SessionFilter,
  PermissionMode,
  SessionLaunchOptions,
  SessionUsage,
  ModelUsageEntry,
  SessionResultSubtype,
  SessionResult,
  ActiveSession,
} from "./sessions.js";

export type {
  HookEventType,
  BlockingEventType,
  NonBlockingEventType,
  HookSpecificOutput,
  HookJSONOutput,
  AsyncHookJSONOutput,
  HookHandler,
  HookSubscription,
  BaseHookInput,
  PreToolUseInput,
  PostToolUseInput,
  PostToolUseFailureInput,
  SessionStartInput,
  SessionEndInput,
  StopInput,
  UserPromptSubmitInput,
  HookInput,
} from "./hooks.js";

export type {
  AgentModel,
  AgentMcpServerSpec,
  AgentDefinition,
  AgentInfo,
  TeamConfig,
  TeamMember,
  TeamMemberStatus,
  TeamTask,
  TeamTaskStatus,
} from "./agents.js";

export {
  MiddlewareError,
  SessionNotFoundError,
  SessionAlreadyActiveError,
  PermissionDeniedError,
  AgentNotFoundError,
  HookTimeoutError,
} from "./errors.js";
