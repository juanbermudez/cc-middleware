import { createFullSDKHooks } from "../hooks/sdk-bridge.js";
import type { BlockingHookRegistry } from "../hooks/blocking.js";
import type { HookEventBus } from "../hooks/event-bus.js";
import { createCanUseTool, type PermissionManager } from "../permissions/handler.js";
import type { PolicyEngine } from "../permissions/policy.js";
import type { LaunchOptions, LaunchResult } from "../sessions/launcher.js";
import type { SessionManager } from "../sessions/manager.js";
import { mergeSDKHooks } from "../sessions/utils.js";
import type { DispatchJob, JsonObject } from "./types.js";

export interface DispatchExecutorOptions {
  sessionManager: SessionManager;
  eventBus: HookEventBus;
  blockingRegistry: BlockingHookRegistry;
  policyEngine: PolicyEngine;
  permissionManager: PermissionManager;
}

function renderPromptTemplate(prompt: string, variables?: JsonObject): string {
  if (!variables) {
    return prompt;
  }

  return prompt.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (fullMatch, keyPath: string) => {
    const value = readVariableValue(variables, keyPath);
    if (value === undefined || value === null) {
      return fullMatch;
    }

    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }

    return JSON.stringify(value);
  });
}

function readVariableValue(variables: JsonObject, keyPath: string): unknown {
  const parts = keyPath.split(".");
  let current: unknown = variables;

  for (const part of parts) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

export class DispatchExecutor {
  constructor(private readonly options: DispatchExecutorOptions) {}

  async executeJob(job: DispatchJob): Promise<LaunchResult> {
    const launchOptions = this.buildLaunchOptions(job);
    return this.options.sessionManager.launch(launchOptions);
  }

  private buildLaunchOptions(job: DispatchJob): LaunchOptions {
    let currentSessionId = job.input.sessionId;
    const renderedPrompt = renderPromptTemplate(job.input.prompt, job.input.variables);
    const cwd = job.input.cwd;

    const { canUseTool } = createCanUseTool({
      policyEngine: this.options.policyEngine,
      eventBus: this.options.eventBus,
      permissionManager: this.options.permissionManager,
      getContext: () => ({
        sessionId: currentSessionId,
        cwd,
      }),
      analytics: {
        source: "internal",
        label: `dispatch:${job.sourceType}:${job.id}`,
        sessionId: currentSessionId,
        cwd,
      },
    });

    const hooks = mergeSDKHooks(
      createFullSDKHooks(this.options.eventBus, this.options.blockingRegistry)
    );

    const launchOptions: LaunchOptions = {
      prompt: renderedPrompt,
      cwd,
      agent: job.input.agent,
      canUseTool,
      hooks,
      onSessionId: (sessionId) => {
        currentSessionId = sessionId;
      },
      analytics: {
        source: "internal",
        label: `dispatch:${job.sourceType}:${job.id}`,
        cwd,
        sessionId: currentSessionId,
      },
    };

    if (job.runtimeProfile === "claude_runtime") {
      launchOptions.settingSources = ["user", "project", "local"];
    }

    switch (job.targetType) {
      case "new_session":
      case "agent":
        return launchOptions;

      case "continue_session":
        launchOptions.continue = true;
        return launchOptions;

      case "resume_session":
        if (!job.input.sessionId) {
          throw new Error(`Dispatch job ${job.id} requires sessionId for resume_session`);
        }
        launchOptions.resume = job.input.sessionId;
        return launchOptions;

      case "fork_session":
        if (!job.input.sessionId) {
          throw new Error(`Dispatch job ${job.id} requires sessionId for fork_session`);
        }
        launchOptions.resume = job.input.sessionId;
        launchOptions.forkSession = true;
        return launchOptions;
    }
  }
}

export function createDispatchExecutor(
  options: DispatchExecutorOptions
): DispatchExecutor {
  return new DispatchExecutor(options);
}
