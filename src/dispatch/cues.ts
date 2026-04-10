import type { HookEventType, HookInput } from "../types/hooks.js";
import type { HookEventBus } from "../hooks/event-bus.js";
import type { DispatchCue, JsonObject, JsonValue } from "./types.js";
import type { DispatchStore } from "./store.js";

export interface DispatchCueBridgeOptions {
  eventBus: HookEventBus;
  store: DispatchStore;
  onCueTriggered?: (
    cue: DispatchCue,
    jobId: string,
    eventType: HookEventType,
    input: HookInput
  ) => void;
}

function toHookVariables(eventType: HookEventType, input: HookInput): JsonObject {
  const record = input as unknown as Record<string, unknown>;
  const toolName = typeof record.tool_name === "string" ? record.tool_name : undefined;

  return {
    hook: {
      eventType,
      sessionId: input.session_id,
      cwd: input.cwd,
      toolName,
      agentId: typeof record.agent_id === "string" ? record.agent_id : undefined,
      agentType: typeof record.agent_type === "string" ? record.agent_type : undefined,
      permissionMode:
        typeof record.permission_mode === "string" ? record.permission_mode : undefined,
    } as JsonObject,
  };
}

function cueMatches(
  cue: DispatchCue,
  eventType: HookEventType,
  input: HookInput,
  now: number
): boolean {
  if (!cue.enabled) {
    return false;
  }

  if (cue.trigger.eventType !== "*" && cue.trigger.eventType !== eventType) {
    return false;
  }

  if (cue.cooldownMs && cue.lastTriggeredAt && now - cue.lastTriggeredAt < cue.cooldownMs) {
    return false;
  }

  const record = input as unknown as Record<string, unknown>;
  const toolName = typeof record.tool_name === "string" ? record.tool_name : undefined;
  const agentId = typeof record.agent_id === "string" ? record.agent_id : undefined;
  const agentType = typeof record.agent_type === "string" ? record.agent_type : undefined;
  const teamName = typeof record.team_name === "string" ? record.team_name : undefined;

  if (cue.trigger.toolName && cue.trigger.toolName !== toolName) {
    return false;
  }

  if (cue.trigger.sessionId && cue.trigger.sessionId !== input.session_id) {
    return false;
  }

  if (cue.trigger.cwd && cue.trigger.cwd !== input.cwd) {
    return false;
  }

  if (cue.trigger.agentId && cue.trigger.agentId !== agentId) {
    return false;
  }

  if (cue.trigger.agentType && cue.trigger.agentType !== agentType) {
    return false;
  }

  if (cue.trigger.teamName && cue.trigger.teamName !== teamName) {
    return false;
  }

  if (cue.trigger.matcher) {
    let matcher: RegExp;
    try {
      matcher = new RegExp(cue.trigger.matcher);
    } catch {
      return false;
    }

    if (!matcher.test(JSON.stringify(input))) {
      return false;
    }
  }

  return true;
}

export function attachDispatchCueBridge(
  options: DispatchCueBridgeOptions
): () => void {
  const listener = (eventType: HookEventType, input: HookInput) => {
    const now = Date.now();

    for (const cue of options.store.listCues()) {
      if (!cueMatches(cue, eventType, input, now)) {
        continue;
      }

      const payload: JsonObject = {
        source: "cue",
        eventType,
        hookInput: input as unknown as JsonValue,
      };
      if (cue.action.payload !== undefined) {
        payload.actionPayload = cue.action.payload;
      }

      const job = options.store.enqueueJob({
        sourceType: "cue",
        targetType: cue.action.targetType,
        runtimeProfile: cue.action.runtimeProfile,
        prompt: cue.action.prompt,
        cwd: cue.action.cwd ?? input.cwd,
        sessionId: cue.action.sessionId ?? (
          cue.action.targetType === "resume_session" || cue.action.targetType === "fork_session"
            ? input.session_id
            : undefined
        ),
        agent: cue.action.agent,
        priority: cue.action.priority,
        maxAttempts: cue.action.maxAttempts,
        leaseDurationMs: cue.action.leaseDurationMs,
        concurrencyKey: cue.action.concurrencyKey,
        cueId: cue.id,
        payload,
        variables: {
          ...toHookVariables(eventType, input),
          ...(cue.action.variables ?? {}),
        },
      });

      options.store.upsertCue({
        ...cue,
        enabled: cue.once ? false : cue.enabled,
        updatedAt: now,
        lastTriggeredAt: now,
        lastJobId: job.id,
      });

      options.onCueTriggered?.(cue, job.id, eventType, input);
    }
  };

  options.eventBus.on("*", listener);

  return () => {
    options.eventBus.off("*", listener);
  };
}
