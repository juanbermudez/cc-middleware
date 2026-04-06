/**
 * Hook event commands: listen, list.
 */

import { Command } from "commander";
import chalk from "chalk";
import { MiddlewareClient } from "../client.js";
import { MiddlewareWsClient } from "../ws-client.js";
import { printTable, printJson, printError, truncate } from "../output.js";
import type { OutputOptions } from "../output.js";

export function registerHookCommands(parent: Command): void {
  const hooks = parent.command("hooks").description("Hook events");

  hooks
    .command("listen")
    .description("Live-stream hook events")
    .option("--events <types>", "Event types to listen for (comma-separated)")
    .option("--session <id>", "Filter by session ID")
    .action(async (opts) => {
      const globalOpts = parent.opts();
      const wsUrl = (globalOpts.server as string).replace(/^http/, "ws") + "/api/v1/ws";
      const wsClient = new MiddlewareWsClient(wsUrl);

      try {
        await wsClient.connect();

        const events = opts.events
          ? opts.events.split(",").map((e: string) => `hook:${e.trim()}`)
          : ["hook:*"];
        wsClient.subscribe(events);

        console.log(chalk.dim("Listening for hook events... (Ctrl+C to stop)\n"));

        wsClient.onMessage((msg) => {
          if (msg.type === "hook:event") {
            const eventType = String(msg.eventType ?? "");
            const input = msg.input as Record<string, unknown> | undefined;

            // Filter by session if requested
            if (opts.session && input?.sessionId && input.sessionId !== opts.session) return;

            const timestamp = new Date().toLocaleTimeString("en-US", { hour12: false });
            const toolName = String(input?.toolName ?? input?.tool ?? "");
            const summary = toolName
              ? truncate(String(input?.toolInput ?? input?.input ?? ""), 40)
              : truncate(String(input?.sessionId ?? ""), 12);

            const typeColor = eventType.startsWith("Pre") ? chalk.yellow : chalk.green;

            console.log(
              `${chalk.dim(timestamp)}  ${typeColor(eventType.padEnd(18))} ${chalk.white(toolName.padEnd(12))} ${chalk.dim(summary)}`,
            );
          }
        });

        wsClient.onClose(() => {
          console.log(chalk.dim("\nConnection closed."));
          process.exit(0);
        });

        process.on("SIGINT", () => {
          wsClient.close();
          console.log(chalk.dim("\nStopped listening."));
          process.exit(0);
        });

        // Keep alive
        await new Promise(() => {});
      } catch (err) {
        wsClient.close();
        printError("Failed to connect to event stream", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  hooks
    .command("list")
    .description("List event types and subscriptions")
    .action(async () => {
      const globalOpts = parent.opts();
      const outputOpts: OutputOptions = {
        json: (globalOpts.json as boolean) ?? false,
        verbose: (globalOpts.verbose as boolean) ?? false,
        noColor: !(globalOpts.color as boolean),
      };
      const client = new MiddlewareClient(globalOpts.server);

      try {
        const [typesResult, subsResult] = await Promise.all([
          client.get<{ eventTypes: string[] }>("/api/v1/events/types"),
          client.get<{ subscriptions: SubscriptionRow[] }>("/api/v1/events/subscriptions"),
        ]);

        if (outputOpts.json) {
          printJson({
            eventTypes: typesResult.eventTypes,
            subscriptions: subsResult.subscriptions,
          });
        } else {
          console.log(chalk.bold("\nEvent Types:"));
          for (const t of typesResult.eventTypes ?? []) {
            console.log(`  ${chalk.cyan(t)}`);
          }

          console.log(chalk.bold("\nActive Subscriptions:"));
          const subs = subsResult.subscriptions ?? [];
          if (subs.length === 0) {
            console.log(chalk.dim("  No active subscriptions"));
          } else {
            const headers = ["ID", "URL", "Events"];
            const rows = subs.map((s) => [
              truncate(String(s.id ?? ""), 8),
              truncate(String(s.url ?? ""), 40),
              truncate((s.events ?? []).join(", "), 30),
            ]);
            printTable(headers, rows, outputOpts);
          }
          console.log("");
        }
      } catch (err) {
        printError("Failed to list hooks", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}

interface SubscriptionRow {
  id?: string;
  url?: string;
  events?: string[];
  [key: string]: unknown;
}
