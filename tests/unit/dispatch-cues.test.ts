import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { HookEventBus } from "../../src/hooks/event-bus.js";
import { attachDispatchCueBridge } from "../../src/dispatch/cues.js";
import { createDispatchStore, type DispatchStore } from "../../src/dispatch/store.js";
import type { PreToolUseInput } from "../../src/types/hooks.js";

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

function makePreToolUseInput(): PreToolUseInput {
  return {
    session_id: "session-1",
    cwd: "/tmp/project",
    hook_event_name: "PreToolUse",
    tool_name: "Read",
    tool_input: { file_path: "README.md" },
  };
}

describe("Dispatch cue bridge", () => {
  it("materializes matching hook events into queued jobs", () => {
    const eventBus = new HookEventBus();
    const detach = attachDispatchCueBridge({ eventBus, store });

    store.upsertCue({
      id: "cue-1",
      name: "Read follow-up",
      enabled: true,
      once: false,
      trigger: {
        eventType: "PreToolUse",
        toolName: "Read",
      },
      action: {
        prompt: "Review {{hook.toolName}} for {{hook.sessionId}}",
        targetType: "resume_session",
        runtimeProfile: "claude_runtime",
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    eventBus.dispatch("PreToolUse", makePreToolUseInput());
    detach();

    const jobs = store.listJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].sourceType).toBe("cue");
    expect(jobs[0].targetType).toBe("resume_session");
    expect(jobs[0].input.sessionId).toBe("session-1");
    expect(jobs[0].input.variables).toEqual(
      expect.objectContaining({
        hook: expect.objectContaining({
          toolName: "Read",
          sessionId: "session-1",
        }),
      })
    );
  });

  it("honors once-only cues", () => {
    const eventBus = new HookEventBus();
    const detach = attachDispatchCueBridge({ eventBus, store });

    store.upsertCue({
      id: "cue-once",
      name: "Run once",
      enabled: true,
      once: true,
      trigger: { eventType: "PreToolUse" },
      action: {
        prompt: "Only once",
        targetType: "new_session",
        runtimeProfile: "isolated_sdk",
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    eventBus.dispatch("PreToolUse", makePreToolUseInput());
    eventBus.dispatch("PreToolUse", makePreToolUseInput());
    detach();

    expect(store.listJobs()).toHaveLength(1);
    expect(store.getCue("cue-once")?.enabled).toBe(false);
  });

  it("ignores malformed cue matchers instead of throwing", () => {
    const eventBus = new HookEventBus();
    const detach = attachDispatchCueBridge({ eventBus, store });

    store.upsertCue({
      id: "cue-bad-regex",
      name: "Broken matcher",
      enabled: true,
      once: false,
      trigger: {
        eventType: "PreToolUse",
        matcher: "[unterminated",
      },
      action: {
        prompt: "Should never enqueue",
        targetType: "new_session",
        runtimeProfile: "isolated_sdk",
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    expect(() => {
      eventBus.dispatch("PreToolUse", makePreToolUseInput());
    }).not.toThrow();

    detach();
    expect(store.listJobs()).toHaveLength(0);
  });
});
