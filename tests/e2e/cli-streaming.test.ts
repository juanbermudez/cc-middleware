/**
 * CLI streaming tests against a deterministic in-process middleware server.
 * Verifies the CLI's WebSocket launch/resume/stream flows without relying on
 * external Claude account quota or network conditions.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { createMiddlewareServer } from "../../src/api/server.js";
import { SessionManager } from "../../src/sessions/manager.js";
import { HookEventBus } from "../../src/hooks/event-bus.js";
import { BlockingHookRegistry } from "../../src/hooks/blocking.js";
import { PolicyEngine } from "../../src/permissions/policy.js";
import { AgentRegistry } from "../../src/agents/registry.js";
import { TeamManager } from "../../src/agents/teams.js";
import { PermissionManager } from "../../src/permissions/handler.js";
import { AskUserQuestionManager } from "../../src/permissions/ask-user.js";
import type { MiddlewareServer } from "../../src/api/server.js";
import type { LaunchResult } from "../../src/sessions/launcher.js";
import type { StreamingSession, SessionStreamEvent } from "../../src/sessions/streaming.js";
import type { TrackedSession } from "../../src/sessions/manager.js";

const exec = promisify(execFile);
const CLI = path.resolve(__dirname, "../../dist/cli/index.js");
const PORT = 13589;
const SERVER_URL = `http://127.0.0.1:${PORT}`;

let server: MiddlewareServer;
let sessionManager: SessionManager;

async function runCli(args: string[]): Promise<string> {
  const { stdout } = await exec("node", [CLI, "--server", SERVER_URL, ...args], {
    timeout: 30_000,
  });
  return stdout;
}

async function runCliJson(args: string[]): Promise<unknown> {
  const stdout = await runCli(["--json", ...args]);
  return JSON.parse(stdout);
}

describe("CLI streaming", () => {
  beforeAll(async () => {
    sessionManager = new SessionManager();
    installFakeSessionBehavior(sessionManager);

    server = await createMiddlewareServer({
      port: PORT,
      host: "127.0.0.1",
      sessionManager,
      eventBus: new HookEventBus(),
      blockingRegistry: new BlockingHookRegistry(),
      policyEngine: new PolicyEngine({ rules: [], defaultBehavior: "allow" }),
      agentRegistry: new AgentRegistry(),
      teamManager: new TeamManager(),
      permissionManager: new PermissionManager(),
      askUserManager: new AskUserQuestionManager(),
    });

    await server.start();
  });

  afterAll(async () => {
    if (server) {
      await server.stop();
    }
  });

  it("sessions launch --stream works", async () => {
    const output = await runCli([
      "sessions",
      "launch",
      "What is 2+2? Reply with just the number.",
      "--stream",
      "--max-turns",
      "3",
    ]);

    expect(output).toContain("4");
    expect(output).toContain("Session completed.");
  });

  it("sessions resume --stream works", async () => {
    const initial = (await runCliJson([
      "sessions",
      "launch",
      "Reply with exactly seeded.",
    ])) as Record<string, unknown>;
    const sessionId = String(initial.sessionId);

    const output = await runCli([
      "sessions",
      "resume",
      sessionId,
      "--prompt",
      "Say resumed.",
      "--stream",
    ]);

    expect(output).toContain("resumed");
    expect(output).toContain("Session completed.");
  });

  it("sessions stream observes streamed output from another client", async () => {
    const initial = (await runCliJson([
      "sessions",
      "launch",
      "Reply with exactly seeded.",
    ])) as Record<string, unknown>;
    const sessionId = String(initial.sessionId);

    const streamProc = spawn("node", [CLI, "--server", SERVER_URL, "sessions", "stream", sessionId], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    streamProc.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    await waitForOutput(() => stdout.includes("Streaming session"), 10_000);

    await runCli([
      "sessions",
      "resume",
      sessionId,
      "--prompt",
      "Say resumed.",
      "--stream",
    ]);

    await waitForExit(streamProc, 10_000);

    expect(stdout).toContain("Streaming session");
    expect(stdout).toContain("resumed");
    expect(stdout).toContain("Session completed.");
  });
});

async function waitForExit(proc: ChildProcess, timeoutMs: number): Promise<void> {
  if (proc.exitCode === 0) {
    return;
  }
  if (proc.exitCode !== null) {
    throw new Error(`CLI exited with code ${proc.exitCode}`);
  }

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error("Timed out waiting for CLI process to exit"));
    }, timeoutMs);

    proc.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`CLI exited with code ${code}`));
    });
  });
}

async function waitForOutput(condition: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (condition()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("Timed out waiting for CLI output");
}

function installFakeSessionBehavior(target: SessionManager): void {
  let counter = 0;

  target.launch = async (options) => {
    const sessionId = `sess-${++counter}`;
    return makeLaunchResult(sessionId, String(options.prompt ?? ""));
  };

  target.launchStreaming = async (options) => {
    const sessionId = options.resume ?? `sess-${++counter}`;
    const text = options.resume ? "resumed" : "4";
    const tracked: TrackedSession = {
      sessionId,
      startedAt: Date.now(),
      prompt: options.prompt,
      cwd: options.cwd,
      abortController: new AbortController(),
      status: "running",
    };

    target.emit("session:started", tracked);

    const result = new Promise<LaunchResult>((resolve) => {
      setTimeout(() => resolve(makeLaunchResult(sessionId, text)), 40);
    });
    void result.then((launchResult) => {
      tracked.status = "completed";
      tracked.result = launchResult;
      target.emit("session:completed", launchResult, tracked);
    });

    async function* events(): AsyncGenerator<SessionStreamEvent> {
      yield { type: "text_delta", text };
      await new Promise((r) => setTimeout(r, 25));
      yield { type: "assistant_message", content: text };
      await new Promise((r) => setTimeout(r, 25));
      yield { type: "result", data: await result };
    }

    return {
      sessionId,
      events: events(),
      abort: () => {},
      result,
    } as StreamingSession;
  };
}

function makeLaunchResult(sessionId: string, resultText: string): LaunchResult {
  return {
    sessionId,
    subtype: "success",
    isError: false,
    result: resultText,
    durationMs: 25,
    durationApiMs: 20,
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
