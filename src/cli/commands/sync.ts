/**
 * Sync commands: status, reindex.
 * Control and monitor the real-time sync subsystem.
 */

import { Command } from "commander";
import chalk from "chalk";
import { MiddlewareClient } from "../client.js";
import { printJson, printKeyValue, printSuccess, printError } from "../output.js";
import type { OutputOptions } from "../output.js";

/** Sync status response shape */
interface SyncStatusResponse {
  sessionWatcher: {
    watching: boolean;
    dirs: string[];
    knownFiles: number;
    lastPoll: number | null;
  };
  configWatcher: {
    watching: boolean;
    watchedPaths: number;
    lastPoll: number | null;
  };
  autoIndexer: {
    running: boolean;
    sessionsIndexed: number;
    indexErrors: number;
    lastIndexTime: number | null;
    pendingBatch: number;
  };
}

export function registerSyncCommands(parent: Command): void {
  const sync = parent.command("sync").description("Real-time sync management");

  sync
    .command("status")
    .description("Show sync watcher status")
    .action(async () => {
      const globalOpts = parent.opts();
      const outputOpts = getOutputOpts(globalOpts);
      const client = new MiddlewareClient(globalOpts.server);

      try {
        const data = await client.get<SyncStatusResponse>("/api/v1/sync/status");

        if (outputOpts.json) {
          printJson(data);
        } else {
          console.log(chalk.bold("\nSession Watcher\n"));
          printKeyValue(
            {
              Watching: data.sessionWatcher.watching ? chalk.green("yes") : chalk.red("no"),
              "Watched dirs": data.sessionWatcher.dirs.length > 0
                ? data.sessionWatcher.dirs.join(", ")
                : chalk.dim("(auto-discover)"),
              "Known files": data.sessionWatcher.knownFiles,
              "Last poll": data.sessionWatcher.lastPoll
                ? new Date(data.sessionWatcher.lastPoll).toLocaleTimeString()
                : chalk.dim("never"),
            },
            outputOpts,
          );

          console.log(chalk.bold("\nConfig Watcher\n"));
          printKeyValue(
            {
              Watching: data.configWatcher.watching ? chalk.green("yes") : chalk.red("no"),
              "Watched paths": data.configWatcher.watchedPaths,
              "Last poll": data.configWatcher.lastPoll
                ? new Date(data.configWatcher.lastPoll).toLocaleTimeString()
                : chalk.dim("never"),
            },
            outputOpts,
          );

          console.log(chalk.bold("\nAuto-Indexer\n"));
          printKeyValue(
            {
              Running: data.autoIndexer.running ? chalk.green("yes") : chalk.red("no"),
              "Sessions indexed": data.autoIndexer.sessionsIndexed,
              "Index errors": data.autoIndexer.indexErrors > 0
                ? chalk.red(String(data.autoIndexer.indexErrors))
                : "0",
              "Pending batch": data.autoIndexer.pendingBatch,
              "Last index time": data.autoIndexer.lastIndexTime
                ? new Date(data.autoIndexer.lastIndexTime).toLocaleTimeString()
                : chalk.dim("never"),
            },
            outputOpts,
          );
          console.log("");
        }
      } catch (err) {
        printError("Failed to get sync status", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  sync
    .command("reindex")
    .description("Trigger a full reindex of all sessions")
    .action(async () => {
      const globalOpts = parent.opts();
      const outputOpts = getOutputOpts(globalOpts);
      const client = new MiddlewareClient(globalOpts.server);

      try {
        const result = await client.post<{
          sessionsIndexed: number;
          messagesIndexed: number;
          errors: Array<{ sessionId: string; error: string }>;
          durationMs: number;
        }>("/api/v1/search/reindex");

        if (outputOpts.json) {
          printJson(result);
        } else {
          printSuccess(
            `Reindex complete: ${result.sessionsIndexed} sessions, ${result.messagesIndexed} messages indexed in ${result.durationMs}ms`,
          );
          if (result.errors && result.errors.length > 0) {
            console.log(chalk.yellow(`  ${result.errors.length} error(s) during indexing`));
          }
        }
      } catch (err) {
        printError("Failed to reindex", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}

function getOutputOpts(globalOpts: Record<string, unknown>): OutputOptions {
  return {
    json: (globalOpts.json as boolean) ?? false,
    verbose: (globalOpts.verbose as boolean) ?? false,
    noColor: !(globalOpts.color as boolean),
  };
}
