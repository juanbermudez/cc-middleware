/**
 * canUseTool implementation.
 * Bridges the PolicyEngine to the Agent SDK's canUseTool callback.
 *
 * Flow:
 * 1. Evaluate against policy engine
 * 2. If allow -> return { behavior: "allow" }
 * 3. If deny -> return { behavior: "deny", message: "..." }
 * 4. If ask -> emit PermissionRequest event, create pending permission
 */

import type { PolicyEngine } from "./policy.js";
import type { HookEventBus } from "../hooks/event-bus.js";
import { generateId } from "../utils/id.js";
import {
  normalizeLiveAnalyticsContext,
  recordLiveHookEvent,
  recordLivePermissionEvent,
} from "../analytics/live/index.js";
import type { LiveAnalyticsCaptureOptions } from "../analytics/live/index.js";

/** Result type matching the SDK's PermissionResult */
export type PermissionResult =
  | {
      behavior: "allow";
      updatedInput?: Record<string, unknown>;
      toolUseID?: string;
    }
  | {
      behavior: "deny";
      message: string;
      interrupt?: boolean;
      toolUseID?: string;
    };

/** The canUseTool callback signature matching the SDK */
export type CanUseTool = (
  toolName: string,
  input: Record<string, unknown>,
  options: {
    signal: AbortSignal;
    toolUseID: string;
    agentID?: string;
    suggestions?: unknown[];
    blockedPath?: string;
    decisionReason?: string;
  }
) => Promise<PermissionResult>;

/** A pending permission request awaiting external resolution */
export interface PendingPermission {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
  toolUseID: string;
  agentID?: string;
  createdAt: number;
  resolve: (result: PermissionResult) => void;
}

export interface PermissionHandlerOptions {
  policyEngine: PolicyEngine;
  eventBus?: HookEventBus;
  /** Optional shared manager so callers can reuse one permission queue across sessions. */
  permissionManager?: PermissionManager;
  /** Optional resolver for the current session/cwd context. */
  getContext?: () => {
    sessionId?: string;
    cwd?: string;
  } | undefined;
  /** Optional live analytics metadata. */
  analytics?: LiveAnalyticsCaptureOptions;
  /** Called when a permission request needs external resolution */
  onPendingPermission?: (request: PendingPermission) => void;
  /** Timeout for external approval (ms). Default: 30000 */
  approvalTimeout?: number;
}

/**
 * Manager for pending permission requests.
 */
export class PermissionManager {
  private pending = new Map<string, PendingPermission>();

  /** Get all pending permission requests */
  getPendingPermissions(): PendingPermission[] {
    return Array.from(this.pending.values());
  }

  /** Resolve a pending permission request */
  resolvePermission(id: string, result: PermissionResult): void {
    const pending = this.pending.get(id);
    if (pending) {
      pending.resolve(result);
      this.pending.delete(id);
    }
  }

  /** Deny all pending permissions */
  denyAllPending(message: string): void {
    for (const [id, pending] of this.pending) {
      pending.resolve({ behavior: "deny", message });
      this.pending.delete(id);
    }
  }

  /** Add a pending permission (internal) */
  addPending(pending: PendingPermission): void {
    this.pending.set(pending.id, pending);
  }

  /** Remove a pending permission (internal) */
  removePending(id: string): void {
    this.pending.delete(id);
  }
}

/**
 * Create a canUseTool callback that evaluates against the policy engine.
 */
export function createCanUseTool(
  options: PermissionHandlerOptions
): { canUseTool: CanUseTool; permissionManager: PermissionManager } {
  const { policyEngine, eventBus, onPendingPermission } = options;
  const approvalTimeout = options.approvalTimeout ?? 30000;
  const permissionManager = options.permissionManager ?? new PermissionManager();

  const canUseTool: CanUseTool = async (
    toolName,
    input,
    callOptions
  ) => {
    const context = options.getContext?.() ?? {};
    const liveContext = normalizeLiveAnalyticsContext({
      ...options.analytics,
      source: options.analytics?.source ?? "internal",
      runId: callOptions.toolUseID,
      sessionId: context.sessionId,
      cwd: context.cwd ?? process.cwd(),
    });

    // 1. Evaluate against policy engine
    const decision = policyEngine.evaluate(toolName, input);

    if (decision.decision === "allow") {
      void recordLivePermissionEvent({
        kind: "permission_event",
        ...liveContext,
        decision: "allow",
        toolName,
        input,
        toolUseID: callOptions.toolUseID,
        agentID: callOptions.agentID,
        message: "Policy allowed tool use",
      });
      return { behavior: "allow", toolUseID: callOptions.toolUseID };
    }

    if (decision.decision === "deny") {
      const reason = decision.matchedRule
        ? `Blocked by policy rule: ${decision.matchedRule.id}`
        : "Blocked by default policy";
      void recordLivePermissionEvent({
        kind: "permission_event",
        ...liveContext,
        decision: "deny",
        toolName,
        input,
        toolUseID: callOptions.toolUseID,
        agentID: callOptions.agentID,
        message: reason,
      });
      return {
        behavior: "deny",
        message: reason,
        toolUseID: callOptions.toolUseID,
      };
    }

    // 3. Decision is "ask" - emit event and/or create pending permission
    if (eventBus) {
      const hookInput = {
        session_id: liveContext.sessionId ?? "",
        cwd: liveContext.cwd ?? process.cwd(),
        hook_event_name: "PermissionRequest",
        tool_name: toolName,
        tool_input: input,
      } as import("../types/hooks.js").HookInput;

      eventBus.dispatch("PermissionRequest", hookInput);
      void recordLiveHookEvent({
        kind: "hook_event",
        ...liveContext,
        eventType: "PermissionRequest",
        input: hookInput,
      });
    }

    void recordLivePermissionEvent({
      kind: "permission_event",
      ...liveContext,
      decision: "request",
      toolName,
      input,
      toolUseID: callOptions.toolUseID,
      agentID: callOptions.agentID,
      message: "Permission request pending external resolution",
    });

    // Create pending permission for external resolution
    return new Promise<PermissionResult>((resolve) => {
      const id = generateId("perm");

      const timeoutId = setTimeout(() => {
        if (permissionManager.getPendingPermissions().some((p) => p.id === id)) {
          permissionManager.resolvePermission(id, {
            behavior: "deny",
            message: `Permission request timed out after ${approvalTimeout}ms`,
            toolUseID: callOptions.toolUseID,
          });
        }
      }, approvalTimeout);

      const pending: PendingPermission = {
        id,
        toolName,
        input,
        toolUseID: callOptions.toolUseID,
        agentID: callOptions.agentID,
        createdAt: Date.now(),
        resolve: (result) => {
          clearTimeout(timeoutId);
          permissionManager.removePending(id);
          void recordLivePermissionEvent({
            kind: "permission_event",
            ...liveContext,
            decision: result.behavior,
            toolName,
            input,
            toolUseID: result.toolUseID ?? callOptions.toolUseID,
            agentID: callOptions.agentID,
            message:
              result.behavior === "deny"
                ? result.message
                : "Permission resolved externally",
          });
          resolve(result);
        },
      };

      permissionManager.addPending(pending);

      if (onPendingPermission) {
        onPendingPermission(pending);
      }
    });
  };

  return { canUseTool, permissionManager };
}
