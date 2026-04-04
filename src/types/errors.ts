/**
 * Typed error classes for CC-Middleware.
 * All middleware errors extend MiddlewareError.
 */

/** Base error class for all middleware errors */
export class MiddlewareError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "MiddlewareError";
    this.code = code;
    this.details = details;
  }
}

/** Session not found */
export class SessionNotFoundError extends MiddlewareError {
  constructor(sessionId: string) {
    super(
      `Session not found: ${sessionId}`,
      "SESSION_NOT_FOUND",
      { sessionId }
    );
    this.name = "SessionNotFoundError";
  }
}

/** Session is already active */
export class SessionAlreadyActiveError extends MiddlewareError {
  constructor(sessionId: string) {
    super(
      `Session is already active: ${sessionId}`,
      "SESSION_ALREADY_ACTIVE",
      { sessionId }
    );
    this.name = "SessionAlreadyActiveError";
  }
}

/** Permission denied */
export class PermissionDeniedError extends MiddlewareError {
  constructor(tool: string, reason?: string) {
    super(
      `Permission denied for tool: ${tool}${reason ? ` (${reason})` : ""}`,
      "PERMISSION_DENIED",
      { tool, reason }
    );
    this.name = "PermissionDeniedError";
  }
}

/** Agent not found */
export class AgentNotFoundError extends MiddlewareError {
  constructor(agentName: string) {
    super(
      `Agent not found: ${agentName}`,
      "AGENT_NOT_FOUND",
      { agentName }
    );
    this.name = "AgentNotFoundError";
  }
}

/** Hook handler timed out */
export class HookTimeoutError extends MiddlewareError {
  constructor(event: string, timeoutMs: number) {
    super(
      `Hook handler timed out for event: ${event} (${timeoutMs}ms)`,
      "HOOK_TIMEOUT",
      { event, timeoutMs }
    );
    this.name = "HookTimeoutError";
  }
}
