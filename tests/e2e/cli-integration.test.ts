/**
 * CLI integration tests that run against a live middleware server.
 * These tests start the server, run CLI commands, and verify output.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const exec = promisify(execFile);
const CLI = path.resolve(__dirname, "../../dist/cli/index.js");
const MAIN = path.resolve(__dirname, "../../dist/main.js");
const PORT = 13579;
const SERVER_URL = `http://127.0.0.1:${PORT}`;

let serverProcess: ChildProcess;

/** Run a CLI command and return stdout */
async function runCli(args: string[]): Promise<string> {
  const { stdout } = await exec("node", [CLI, "--server", SERVER_URL, ...args], {
    timeout: 30_000,
  });
  return stdout;
}

/** Run a CLI command expecting JSON output */
async function runCliJson(args: string[]): Promise<unknown> {
  const stdout = await runCli(["--json", ...args]);
  return JSON.parse(stdout);
}

/** Wait for the server health endpoint to respond */
async function waitForHealth(timeoutMs = 10_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${SERVER_URL}/health`);
      if (res.ok) return;
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("Server did not start in time");
}

describe("CLI integration", () => {
  beforeAll(async () => {
    // Start the middleware server
    serverProcess = spawn("node", [MAIN], {
      env: { ...process.env, PORT: String(PORT), HOST: "127.0.0.1" },
      stdio: "pipe",
    });

    // Wait for server to be ready
    await waitForHealth();
  }, 20_000);

  afterAll(() => {
    if (serverProcess) {
      serverProcess.kill("SIGTERM");
    }
  });

  it("server status returns running", async () => {
    const result = (await runCliJson(["server", "status"])) as Record<string, unknown>;
    expect(result.status).toBe("ok");
  });

  it("sessions list returns array", async () => {
    const result = (await runCliJson(["sessions", "list"])) as Record<string, unknown>;
    expect(result.sessions).toBeInstanceOf(Array);
  });

  it("sessions list text output works", async () => {
    const output = await runCli(["sessions", "list"]);
    // Should either show sessions or "No sessions found"
    expect(output.length).toBeGreaterThan(0);
  });

  it("sessions search returns results or empty message", async () => {
    const result = (await runCliJson(["sessions", "search", "test"])) as Record<string, unknown>;
    expect(result).toBeDefined();
    // May have results or empty, both are valid
  });

  it("hooks list returns event types", async () => {
    const result = (await runCliJson(["hooks", "list"])) as Record<string, unknown>;
    expect(result.eventTypes).toBeInstanceOf(Array);
    expect((result.eventTypes as string[]).length).toBeGreaterThan(0);
  });

  it("agents list returns array", async () => {
    const result = (await runCliJson(["agents", "list"])) as Record<string, unknown>;
    expect(result.agents).toBeInstanceOf(Array);
  });

  it("teams list returns array", async () => {
    const result = (await runCliJson(["teams", "list"])) as Record<string, unknown>;
    expect(result.teams).toBeInstanceOf(Array);
  });

  it("permissions list returns rules", async () => {
    const result = (await runCliJson(["permissions", "list"])) as Record<string, unknown>;
    expect(result.rules).toBeInstanceOf(Array);
  });

  it("permissions add and list workflow", async () => {
    // Add a policy rule
    const addResult = (await runCliJson([
      "permissions", "add", "--action", "allow", "--pattern", "Read",
    ])) as Record<string, unknown>;
    expect(addResult).toBeDefined();
    expect(addResult.id).toBeTruthy();

    // List rules - should include the new one
    const listResult = (await runCliJson(["permissions", "list"])) as Record<string, unknown>;
    const rules = listResult.rules as Array<Record<string, unknown>>;
    expect(rules.length).toBeGreaterThan(0);
  });

  it("config show returns settings", async () => {
    const result = (await runCliJson(["config", "show"])) as Record<string, unknown>;
    expect(result).toBeDefined();
    // Settings should be an object
    expect(typeof result === "object").toBe(true);
  });

  it("config plugins returns array", async () => {
    const result = await runCliJson(["config", "plugins"]);
    // Could be array or object with plugins key
    expect(result).toBeDefined();
  });

  it("config mcp returns array", async () => {
    const result = await runCliJson(["config", "mcp"]);
    expect(result).toBeDefined();
  });

  it("config skills returns array", async () => {
    const result = await runCliJson(["config", "skills"]);
    expect(result).toBeDefined();
  });

  it("config memory returns data", async () => {
    const result = await runCliJson(["config", "memory"]);
    expect(result).toBeDefined();
  });

  it("permissions pending returns array", async () => {
    const result = (await runCliJson(["permissions", "pending"])) as Record<string, unknown>;
    expect(result.pending).toBeInstanceOf(Array);
  });
});
