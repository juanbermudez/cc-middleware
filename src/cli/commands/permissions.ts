/**
 * Permission management commands: list, add, pending, approve, deny.
 */

import { Command } from "commander";
import chalk from "chalk";
import { MiddlewareClient } from "../client.js";
import { printTable, printJson, printError, printSuccess, truncate } from "../output.js";
import type { OutputOptions } from "../output.js";

export function registerPermissionCommands(parent: Command): void {
  const perms = parent.command("permissions").description("Manage permission policies");

  perms
    .command("list")
    .description("List permission policies")
    .action(async () => {
      const globalOpts = parent.opts();
      const outputOpts = getOutputOpts(globalOpts);
      const client = new MiddlewareClient(globalOpts.server);

      try {
        const result = await client.get<{ rules: PolicyRow[]; policies?: PolicyRow[] }>("/api/v1/permissions/policies");

        if (outputOpts.json) {
          printJson(result);
        } else {
          const policies = result.rules ?? result.policies ?? [];
          if (policies.length === 0) {
            console.log(chalk.dim("No permission policies configured."));
            return;
          }

          const headers = ["ID", "Action", "Pattern", "Priority", "Source"];
          const rows = policies.map((p) => [
            truncate(String(p.id ?? ""), 8),
            p.action === "allow" ? chalk.green("allow") : chalk.red("deny"),
            p.pattern ?? p.tool ?? "",
            String(p.priority ?? 0),
            p.source ?? "",
          ]);
          printTable(headers, rows, outputOpts);
        }
      } catch (err) {
        printError("Failed to list policies", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  perms
    .command("add")
    .description("Add a permission rule")
    .option("--action <action>", "allow or deny")
    .option("--pattern <pattern>", "Tool name glob pattern")
    .option("--priority <n>", "Rule priority (higher = checked first)")
    .action(async (opts) => {
      const globalOpts = parent.opts();
      const outputOpts = getOutputOpts(globalOpts);
      const client = new MiddlewareClient(globalOpts.server);

      if (!opts.action || !opts.pattern) {
        printError("Both --action and --pattern are required.\nUsage: ccm permissions add --action allow --pattern 'Read'");
        process.exit(1);
      }

      if (opts.action !== "allow" && opts.action !== "deny") {
        printError("Action must be 'allow' or 'deny'");
        process.exit(1);
      }

      const body: Record<string, unknown> = {
        id: `cli-${Date.now()}`,
        toolName: opts.pattern,
        behavior: opts.action,
        priority: opts.priority ? parseInt(opts.priority, 10) : 0,
      };

      try {
        const result = await client.post<Record<string, unknown>>("/api/v1/permissions/policies", body);

        if (outputOpts.json) {
          printJson(result);
        } else {
          printSuccess(`Permission added: ${opts.action} ${opts.pattern} (ID: ${result.id ?? "created"})`);
        }
      } catch (err) {
        printError("Failed to add policy", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  perms
    .command("pending")
    .description("Show pending permission requests")
    .action(async () => {
      const globalOpts = parent.opts();
      const outputOpts = getOutputOpts(globalOpts);
      const client = new MiddlewareClient(globalOpts.server);

      try {
        const result = await client.get<{ pending: PendingRow[] }>("/api/v1/permissions/pending");

        if (outputOpts.json) {
          printJson(result);
        } else {
          const pending = result.pending ?? [];
          if (pending.length === 0) {
            console.log(chalk.dim("No pending permission requests."));
            return;
          }

          const headers = ["ID", "Tool Name", "Session", "Timestamp", "Input"];
          const rows = pending.map((p) => [
            truncate(String(p.id ?? ""), 8),
            p.toolName ?? "",
            truncate(String(p.sessionId ?? ""), 8),
            p.timestamp ? new Date(p.timestamp).toLocaleTimeString("en-US", { hour12: false }) : "",
            truncate(JSON.stringify(p.input ?? {}), 30),
          ]);
          printTable(headers, rows, outputOpts);

          console.log(
            chalk.dim('\nUse "ccm permissions approve <id>" or "ccm permissions deny <id>"'),
          );
        }
      } catch (err) {
        printError("Failed to get pending requests", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  perms
    .command("approve <id>")
    .description("Approve a pending permission request")
    .action(async (id: string) => {
      const globalOpts = parent.opts();
      const outputOpts = getOutputOpts(globalOpts);
      const client = new MiddlewareClient(globalOpts.server);

      try {
        const result = await client.post<Record<string, unknown>>(
          `/api/v1/permissions/pending/${id}/resolve`,
          { behavior: "allow" },
        );

        if (outputOpts.json) {
          printJson(result);
        } else {
          printSuccess(`Permission approved: ${id}${result.toolName ? ` (${result.toolName})` : ""}`);
        }
      } catch (err) {
        printError(`Pending request not found: ${id}`, err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  perms
    .command("deny <id>")
    .description("Deny a pending permission request")
    .option("--message <msg>", "Denial reason message")
    .action(async (id: string, opts) => {
      const globalOpts = parent.opts();
      const outputOpts = getOutputOpts(globalOpts);
      const client = new MiddlewareClient(globalOpts.server);

      const body: Record<string, unknown> = { behavior: "deny" };
      if (opts.message) body.message = opts.message;

      try {
        const result = await client.post<Record<string, unknown>>(
          `/api/v1/permissions/pending/${id}/resolve`,
          body,
        );

        if (outputOpts.json) {
          printJson(result);
        } else {
          printSuccess(`Permission denied: ${id}${result.toolName ? ` (${result.toolName})` : ""}`);
        }
      } catch (err) {
        printError(`Pending request not found: ${id}`, err instanceof Error ? err.message : String(err));
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

interface PolicyRow {
  id?: string;
  action?: string;
  pattern?: string;
  tool?: string;
  priority?: number;
  source?: string;
  [key: string]: unknown;
}

interface PendingRow {
  id?: string;
  toolName?: string;
  sessionId?: string;
  timestamp?: number;
  input?: unknown;
  [key: string]: unknown;
}
