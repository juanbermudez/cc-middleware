/**
 * E2E tests for CLI polish: help text, error handling, version output.
 * These tests run the CLI binary directly without a running server.
 */

import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const exec = promisify(execFile);
const CLI = path.resolve(__dirname, "../../dist/cli/index.js");

function runCli(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return exec("node", [CLI, ...args], { timeout: 10_000 });
}

function runCliExpectFail(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const child = execFile("node", [CLI, ...args], { timeout: 10_000 }, (error, stdout, stderr) => {
      resolve({
        stdout: stdout ?? "",
        stderr: stderr ?? "",
        code: error?.code ? parseInt(String(error.code), 10) : (child.exitCode ?? 1),
      });
    });
  });
}

describe("CLI polish", () => {
  it("--help shows all command groups", async () => {
    const { stdout } = await runCli(["--help"]);
    expect(stdout).toContain("CC-Middleware CLI");
    expect(stdout).toContain("server");
    expect(stdout).toContain("sessions");
    expect(stdout).toContain("hooks");
    expect(stdout).toContain("agents");
    expect(stdout).toContain("teams");
    expect(stdout).toContain("permissions");
    expect(stdout).toContain("config");
    expect(stdout).toContain("completion");
  });

  it("--version outputs version number", async () => {
    const { stdout } = await runCli(["--version"]);
    expect(stdout.trim()).toBe("0.1.0");
  });

  it("sessions --help shows all subcommands", async () => {
    const { stdout } = await runCli(["sessions", "--help"]);
    expect(stdout).toContain("list");
    expect(stdout).toContain("show");
    expect(stdout).toContain("launch");
    expect(stdout).toContain("resume");
    expect(stdout).toContain("stream");
    expect(stdout).toContain("search");
  });

  it("server --help shows all subcommands", async () => {
    const { stdout } = await runCli(["server", "--help"]);
    expect(stdout).toContain("start");
    expect(stdout).toContain("stop");
    expect(stdout).toContain("status");
  });

  it("config --help shows all subcommands", async () => {
    const { stdout } = await runCli(["config", "--help"]);
    expect(stdout).toContain("show");
    expect(stdout).toContain("get");
    expect(stdout).toContain("set");
    expect(stdout).toContain("plugins");
    expect(stdout).toContain("mcp");
    expect(stdout).toContain("skills");
    expect(stdout).toContain("agents");
    expect(stdout).toContain("memory");
  });

  it("permissions --help shows all subcommands", async () => {
    const { stdout } = await runCli(["permissions", "--help"]);
    expect(stdout).toContain("list");
    expect(stdout).toContain("add");
    expect(stdout).toContain("pending");
    expect(stdout).toContain("approve");
    expect(stdout).toContain("deny");
  });

  it("hooks --help shows all subcommands", async () => {
    const { stdout } = await runCli(["hooks", "--help"]);
    expect(stdout).toContain("listen");
    expect(stdout).toContain("list");
  });

  it("agents --help shows all subcommands", async () => {
    const { stdout } = await runCli(["agents", "--help"]);
    expect(stdout).toContain("list");
    expect(stdout).toContain("show");
    expect(stdout).toContain("create");
  });

  it("teams --help shows all subcommands", async () => {
    const { stdout } = await runCli(["teams", "--help"]);
    expect(stdout).toContain("list");
    expect(stdout).toContain("show");
  });

  it("completion bash outputs bash script", async () => {
    const { stdout } = await runCli(["completion", "bash"]);
    expect(stdout).toContain("_ccm_completions");
    expect(stdout).toContain("complete -F");
  });

  it("completion zsh outputs zsh script", async () => {
    const { stdout } = await runCli(["completion", "zsh"]);
    expect(stdout).toContain("compdef");
    expect(stdout).toContain("_ccm");
  });

  it("completion fish outputs fish script", async () => {
    const { stdout } = await runCli(["completion", "fish"]);
    expect(stdout).toContain("complete -c ccm");
  });

  it("server status when not running shows error (not stack trace)", async () => {
    // Use a port that's definitely not running
    const { stderr } = await runCliExpectFail([
      "server", "status", "--server", "http://127.0.0.1:19999",
    ]);
    expect(stderr).toContain("Error:");
    // Should NOT contain stack trace
    expect(stderr).not.toContain("at Object.");
    expect(stderr).not.toContain("node_modules");
  });
});
