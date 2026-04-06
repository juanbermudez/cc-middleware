/**
 * Auto-start logic for the middleware server.
 * Checks if the server is running and optionally starts it.
 */

import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import type { MiddlewareClient } from "./client.js";

const CCM_DIR = path.join(os.homedir(), ".cc-middleware");
const PID_FILE = path.join(CCM_DIR, "server.pid");

export { PID_FILE, CCM_DIR };

/** Resolve the path to the main.js entry point */
function resolveMainJs(): string {
  // Go from dist/cli/auto-start.js -> dist/main.js
  const thisFile = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(thisFile), "..", "main.js");
}

/** Ensure the server is running, optionally auto-starting it */
export async function ensureServerRunning(
  client: MiddlewareClient,
  options: { autoStart: boolean; verbose: boolean },
): Promise<void> {
  if (await client.isRunning()) return;

  if (!options.autoStart) {
    throw new Error(
      "Middleware server is not running. Start it with: ccm server start\n" +
        "Or use --auto-start to start it automatically.",
    );
  }

  // Auto-start the server
  await startServerProcess({ verbose: options.verbose });
  await client.waitForReady(10_000);
}

/** Start the middleware server as a background process */
export async function startServerProcess(options: {
  port?: number;
  verbose?: boolean;
  foreground?: boolean;
}): Promise<{ pid: number; mainJs: string }> {
  const mainJs = resolveMainJs();

  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  if (options.port) env.PORT = String(options.port);

  if (options.foreground) {
    // Run in foreground - replaces current process
    const child = spawn("node", [mainJs], {
      env,
      stdio: "inherit",
    });

    // Write PID file
    await mkdir(CCM_DIR, { recursive: true });
    await writeFile(PID_FILE, String(child.pid));

    // This will block until the process exits
    return new Promise((resolve, reject) => {
      child.on("exit", (code) => {
        if (code === 0) resolve({ pid: child.pid!, mainJs });
        else reject(new Error(`Server exited with code ${code}`));
      });
      child.on("error", reject);
    });
  }

  // Detached background process
  const child = spawn("node", [mainJs], {
    env,
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  const pid = child.pid!;

  // Write PID file
  await mkdir(CCM_DIR, { recursive: true });
  await writeFile(PID_FILE, String(pid));

  return { pid, mainJs };
}
