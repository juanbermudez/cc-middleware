import { describe, expect, it, vi } from "vitest";
import { HookEventBus } from "../../src/hooks/event-bus.js";
import { BlockingHookRegistry } from "../../src/hooks/blocking.js";
import { PolicyEngine } from "../../src/permissions/policy.js";
import { PermissionManager } from "../../src/permissions/handler.js";
import { createDispatchExecutor } from "../../src/dispatch/executor.js";
import type { DispatchJob } from "../../src/dispatch/types.js";
import type { LaunchResult } from "../../src/sessions/launcher.js";

function makeLaunchResult(sessionId = "session-1"): LaunchResult {
  return {
    sessionId,
    subtype: "success",
    isError: false,
    result: "done",
    durationMs: 10,
    durationApiMs: 5,
    totalCostUsd: 0,
    numTurns: 1,
    stopReason: "end_turn",
    usage: {
      input_tokens: 1,
      output_tokens: 1,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
    modelUsage: {},
    permissionDenials: [],
  };
}

function makeJob(overrides?: Partial<DispatchJob>): DispatchJob {
  const now = Date.now();
  return {
    id: overrides?.id ?? "dispatch-job-1",
    status: overrides?.status ?? "queued",
    sourceType: overrides?.sourceType ?? "manual",
    targetType: overrides?.targetType ?? "new_session",
    runtimeProfile: overrides?.runtimeProfile ?? "claude_runtime",
    input: overrides?.input ?? {
      prompt: "Investigate {{hook.toolName}} in {{hook.cwd}}",
      cwd: "/tmp/project",
      sessionId: "session-1",
      agent: "writer",
      variables: {
        hook: {
          toolName: "Read",
          cwd: "/tmp/project",
        },
      },
    },
    priority: overrides?.priority ?? 0,
    runAt: overrides?.runAt ?? now,
    nextRunAt: overrides?.nextRunAt ?? now,
    createdAt: overrides?.createdAt ?? now,
    updatedAt: overrides?.updatedAt ?? now,
    attemptCount: overrides?.attemptCount ?? 0,
    maxAttempts: overrides?.maxAttempts ?? 2,
    leaseDurationMs: overrides?.leaseDurationMs ?? 60_000,
  };
}

describe("DispatchExecutor", () => {
  it("maps a queued job onto the middleware launch path", async () => {
    const sessionManager = {
      launch: vi.fn().mockResolvedValue(makeLaunchResult("session-dispatch")),
    };

    const executor = createDispatchExecutor({
      sessionManager: sessionManager as never,
      eventBus: new HookEventBus(),
      blockingRegistry: new BlockingHookRegistry(),
      policyEngine: new PolicyEngine({ rules: [], defaultBehavior: "allow" }),
      permissionManager: new PermissionManager(),
    });

    const result = await executor.executeJob(makeJob());
    expect(result.sessionId).toBe("session-dispatch");
    expect(sessionManager.launch).toHaveBeenCalledTimes(1);
    expect(sessionManager.launch).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "Investigate Read in /tmp/project",
        cwd: "/tmp/project",
        agent: "writer",
        settingSources: ["user", "project", "local"],
        hooks: expect.any(Object),
        canUseTool: expect.any(Function),
        onSessionId: expect.any(Function),
      })
    );
  });

  it("requires a session id for resume_session jobs", async () => {
    const sessionManager = {
      launch: vi.fn().mockResolvedValue(makeLaunchResult()),
    };

    const executor = createDispatchExecutor({
      sessionManager: sessionManager as never,
      eventBus: new HookEventBus(),
      blockingRegistry: new BlockingHookRegistry(),
      policyEngine: new PolicyEngine({ rules: [], defaultBehavior: "allow" }),
      permissionManager: new PermissionManager(),
    });

    await expect(
      executor.executeJob(
        makeJob({
          targetType: "resume_session",
          input: {
            prompt: "resume me",
            cwd: "/tmp/project",
          },
        })
      )
    ).rejects.toThrow("requires sessionId");
  });
});
