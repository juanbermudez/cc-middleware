/**
 * Server management commands: start, stop, status.
 */

import { Command } from "commander";
import { readFile, unlink } from "node:fs/promises";
import chalk from "chalk";
import { MiddlewareClient } from "../client.js";
import { startServerProcess, PID_FILE } from "../auto-start.js";
import { printJson, printKeyValue, printSuccess, printError, printWarning } from "../output.js";
import type { OutputOptions } from "../output.js";

export function registerServerCommands(parent: Command): void {
  const server = parent.command("server").description("Manage the middleware server");

  server
    .command("start")
    .description("Start the middleware server")
    .option("--port <port>", "Server port", "3000")
    .option("--foreground", "Run in foreground (not daemonized)", false)
    .action(async (opts) => {
      const globalOpts = parent.opts();
      const outputOpts: OutputOptions = {
        json: globalOpts.json ?? false,
        verbose: globalOpts.verbose ?? false,
        noColor: !globalOpts.color,
      };
      const serverUrl = globalOpts.server ?? `http://127.0.0.1:${opts.port}`;

      // Check if already running
      const client = new MiddlewareClient(serverUrl);
      if (await client.isRunning()) {
        const existingPid = await readPid();
        if (outputOpts.json) {
          printJson({ status: "already_running", url: serverUrl, pid: existingPid });
        } else {
          printWarning(`Server is already running on ${serverUrl}${existingPid ? ` (PID: ${existingPid})` : ""}`);
        }
        return;
      }

      try {
        if (opts.foreground) {
          if (!outputOpts.json) {
            console.log(chalk.dim(`Starting server on port ${opts.port} (foreground)...`));
          }
          // This blocks until the process exits
          await startServerProcess({ port: parseInt(opts.port, 10), foreground: true, verbose: outputOpts.verbose });
        } else {
          const { pid } = await startServerProcess({ port: parseInt(opts.port, 10), verbose: outputOpts.verbose });

          // Wait for server to be ready
          await client.waitForReady(10_000);

          if (outputOpts.json) {
            printJson({ status: "started", url: serverUrl, pid });
          } else {
            printSuccess(`Server started on ${serverUrl} (PID: ${pid})`);
          }
        }
      } catch (err) {
        printError("Failed to start server", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  server
    .command("stop")
    .description("Stop the middleware server")
    .action(async () => {
      const globalOpts = parent.opts();
      const outputOpts: OutputOptions = {
        json: globalOpts.json ?? false,
        verbose: globalOpts.verbose ?? false,
        noColor: !globalOpts.color,
      };

      const pid = await readPid();
      if (!pid) {
        if (outputOpts.json) {
          printJson({ status: "not_running" });
        } else {
          printWarning("Server is not running (no PID file found)");
        }
        return;
      }

      try {
        // Send SIGTERM for graceful shutdown
        process.kill(pid, "SIGTERM");

        // Wait for process to exit (up to 5 seconds)
        const exited = await waitForExit(pid, 5000);
        if (!exited) {
          // Force kill
          try { process.kill(pid, "SIGKILL"); } catch { /* already dead */ }
        }

        // Remove PID file
        try { await unlink(PID_FILE); } catch { /* ignore */ }

        if (outputOpts.json) {
          printJson({ status: "stopped", pid });
        } else {
          printSuccess(`Server stopped (PID: ${pid})`);
        }
      } catch (err) {
        // Process may not exist
        try { await unlink(PID_FILE); } catch { /* ignore */ }
        if (outputOpts.json) {
          printJson({ status: "not_running", pid });
        } else {
          printWarning(`Server process ${pid} not found (cleaned up PID file)`);
        }
      }
    });

  server
    .command("status")
    .description("Show server status")
    .action(async () => {
      const globalOpts = parent.opts();
      const outputOpts: OutputOptions = {
        json: globalOpts.json ?? false,
        verbose: globalOpts.verbose ?? false,
        noColor: !globalOpts.color,
      };
      const serverUrl = globalOpts.server;
      const client = new MiddlewareClient(serverUrl);
      const pid = await readPid();

      if (!(await client.isRunning())) {
        if (outputOpts.json) {
          printJson({ status: "not_running", pid });
        } else {
          printError("Server is not running");
        }
        process.exit(1);
      }

      try {
        const health = await client.get<{ status: string }>("/health");
        let statusData: Record<string, unknown> = {};
        try {
          statusData = await client.get<Record<string, unknown>>("/api/v1/status");
        } catch {
          // Status endpoint may not have extra data
        }

        const combined = { ...health, ...statusData, url: serverUrl, pid };

        if (outputOpts.json) {
          printJson(combined);
        } else {
          printKeyValue(
            {
              Status: chalk.green("running"),
              URL: serverUrl,
              ...(pid ? { PID: pid } : {}),
              ...statusData,
            },
            outputOpts,
          );
        }
      } catch (err) {
        printError("Failed to get server status", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}

/** Read PID from the PID file, returns null if not found */
async function readPid(): Promise<number | null> {
  try {
    const content = await readFile(PID_FILE, "utf-8");
    const pid = parseInt(content.trim(), 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

/** Wait for a process to exit, polling every 200ms */
async function waitForExit(pid: number, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      process.kill(pid, 0); // Check if process exists
      await new Promise((r) => setTimeout(r, 200));
    } catch {
      return true; // Process no longer exists
    }
  }
  return false;
}
