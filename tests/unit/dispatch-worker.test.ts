import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { createDispatchStore, type DispatchStore } from "../../src/dispatch/store.js";
import { createDispatchWorker } from "../../src/dispatch/worker.js";
import { SessionManager } from "../../src/sessions/manager.js";
import { PermissionManager } from "../../src/permissions/handler.js";
import { AskUserQuestionManager } from "../../src/permissions/ask-user.js";

let db: Database.Database;
let store: DispatchStore;

beforeEach(() => {
  db = new Database(":memory:");
  store = createDispatchStore(db);
  store.migrate();
});

afterEach(() => {
  db.close();
});

function enqueueResumeJob(sessionId: string, prompt: string, runAt: number): void {
  store.enqueueJob({
    sourceType: "manual",
    targetType: "resume_session",
    runtimeProfile: "claude_runtime",
    prompt,
    sessionId,
    runAt,
    nextRunAt: runAt,
  });
}

describe("DispatchWorker", () => {
  it("runs different sessions in parallel", async () => {
    const now = Date.now();
    enqueueResumeJob("session-a", "first", now);
    enqueueResumeJob("session-b", "second", now);

    let active = 0;
    let maxActive = 0;

    const executor = {
      executeJob: vi.fn(async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 25));
        active -= 1;
        return {
          sessionId: "result-session",
          subtype: "success",
          isError: false,
          result: "ok",
          durationMs: 1,
          durationApiMs: 1,
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
      }),
    };

    const worker = createDispatchWorker({
      store,
      executor: executor as never,
      sessionManager: new SessionManager(),
      permissionManager: new PermissionManager(),
      askUserManager: new AskUserQuestionManager(),
      batchSize: 2,
    });

    await worker.drainOnce(now);

    expect(executor.executeJob).toHaveBeenCalledTimes(2);
    expect(maxActive).toBeGreaterThan(1);
    expect(store.listJobs({ statuses: ["completed"] })).toHaveLength(2);
  });

  it("serializes work for the same session across drain cycles", async () => {
    const now = Date.now();
    enqueueResumeJob("session-shared", "first", now);
    enqueueResumeJob("session-shared", "second", now);

    const executor = {
      executeJob: vi.fn(async () => ({
        sessionId: "session-shared",
        subtype: "success",
        isError: false,
        result: "ok",
        durationMs: 1,
        durationApiMs: 1,
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
      })),
    };

    const worker = createDispatchWorker({
      store,
      executor: executor as never,
      sessionManager: new SessionManager(),
      permissionManager: new PermissionManager(),
      askUserManager: new AskUserQuestionManager(),
      batchSize: 2,
    });

    await worker.drainOnce(now);
    expect(executor.executeJob).toHaveBeenCalledTimes(1);
    expect(store.listJobs({ statuses: ["completed"] })).toHaveLength(1);
    expect(store.listJobs({ statuses: ["queued"] })).toHaveLength(1);

    await worker.drainOnce(now + 100);
    expect(executor.executeJob).toHaveBeenCalledTimes(2);
    expect(store.listJobs({ statuses: ["completed"] })).toHaveLength(2);
  });
});
