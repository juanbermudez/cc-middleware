#!/usr/bin/env node
/**
 * CC-Middleware CLI entry point.
 * Provides terminal-native control surface for the middleware API.
 */

import { Command } from "commander";
import { MiddlewareClient } from "./client.js";
import { MiddlewareWsClient } from "./ws-client.js";
import type { OutputOptions } from "./output.js";
import { printError } from "./output.js";
import { ensureServerRunning } from "./auto-start.js";
import { registerServerCommands } from "./commands/server.js";
import { registerSessionCommands } from "./commands/sessions.js";
import { registerHookCommands } from "./commands/hooks.js";
import { registerAgentCommands, registerTeamCommands } from "./commands/agents.js";
import { registerPermissionCommands } from "./commands/permissions.js";
import { registerConfigCommands } from "./commands/config.js";
import { registerCompletionCommand } from "./completion.js";

const program = new Command();

program
  .name("ccm")
  .description("CC-Middleware CLI - Control surface for Claude Code sessions")
  .version("0.1.0")
  .option("-j, --json", "Output as JSON", false)
  .option("-s, --server <url>", "Middleware server URL", process.env.CCM_SERVER_URL || "http://127.0.0.1:3000")
  .option("-v, --verbose", "Verbose output", false)
  .option("--no-color", "Disable colors")
  .option("--auto-start", "Auto-start server if not running", false);

// Register all command groups
registerServerCommands(program);
registerSessionCommands(program);
registerHookCommands(program);
registerAgentCommands(program);
registerTeamCommands(program);
registerPermissionCommands(program);
registerConfigCommands(program);
registerCompletionCommand(program);

/** Get a MiddlewareClient from the global options */
export function getClient(program: Command): MiddlewareClient {
  const opts = program.opts();
  return new MiddlewareClient(opts.server);
}

/** Get a WebSocket client from the global options */
export function getWsClient(program: Command): MiddlewareWsClient {
  const opts = program.opts();
  const wsUrl = opts.server.replace(/^http/, "ws") + "/api/v1/ws";
  return new MiddlewareWsClient(wsUrl);
}

/** Get output options from the global flags */
export function getOutputOptions(program: Command): OutputOptions {
  const opts = program.opts();
  return {
    json: opts.json ?? false,
    verbose: opts.verbose ?? false,
    noColor: !opts.color,
  };
}

/** Ensure the server is running before a command executes */
export async function ensureServer(program: Command): Promise<MiddlewareClient> {
  const client = getClient(program);
  const opts = program.opts();
  await ensureServerRunning(client, {
    autoStart: opts.autoStart ?? false,
    verbose: opts.verbose ?? false,
  });
  return client;
}

// Wrap execution with global error handler
program.hook("preAction", async (_thisCommand, actionCommand) => {
  // Commands under "server" and "completion" don't need the server to be running
  const parentName = actionCommand.parent?.name();
  const cmdName = actionCommand.name();
  if (parentName === "server" || cmdName === "completion") return;

  // For all other commands, ensure the server is available
  try {
    const opts = program.opts();
    const client = new MiddlewareClient(opts.server);
    await ensureServerRunning(client, {
      autoStart: opts.autoStart ?? false,
      verbose: opts.verbose ?? false,
    });
  } catch (err) {
    printError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
});

program.parseAsync().catch((err) => {
  if (program.opts().verbose) {
    console.error(err);
  } else {
    printError(err instanceof Error ? err.message : String(err));
  }
  process.exit(1);
});
