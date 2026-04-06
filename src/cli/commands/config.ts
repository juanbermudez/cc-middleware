/**
 * Configuration commands: show, get, set, plugins, mcp, skills, agents, memory.
 */

import { Command } from "commander";
import chalk from "chalk";
import { MiddlewareClient } from "../client.js";
import { printTable, printJson, printKeyValue, printError, printSuccess, truncate } from "../output.js";
import type { OutputOptions } from "../output.js";

export function registerConfigCommands(parent: Command): void {
  const config = parent.command("config").description("Manage configuration");

  config
    .command("show")
    .description("Show effective merged settings")
    .option("--scope <scope>", "Show only one scope (user/project/local/managed)")
    .action(async (opts) => {
      const globalOpts = parent.opts();
      const outputOpts = getOutputOpts(globalOpts);
      const client = new MiddlewareClient(globalOpts.server);

      try {
        if (opts.scope) {
          const result = await client.get<Record<string, unknown>>(
            `/api/v1/config/settings/${opts.scope}`,
          );

          if (outputOpts.json) {
            printJson(result);
          } else {
            console.log(chalk.bold(`\nSettings (${opts.scope} scope)\n`));
            const content = (result.content ?? result.settings ?? result) as Record<string, unknown>;
            printKeyValue(flattenObject(content), outputOpts);
            console.log("");
          }
        } else {
          const result = await client.get<Record<string, unknown>>("/api/v1/config/settings");

          if (outputOpts.json) {
            printJson(result);
          } else {
            console.log(chalk.bold("\nEffective Settings (merged)\n"));

            const settings = (result.settings ?? result) as Record<string, unknown>;
            const provenance = (result.provenance ?? {}) as Record<string, string>;
            const flat = flattenObject(settings);

            const headers = ["Key", "Value", "Source"];
            const rows = Object.entries(flat).map(([key, value]) => {
              const source = provenance[key] ?? "";
              return [
                key,
                truncate(formatValue(value), 50),
                source ? colorByScope(source, outputOpts) : "",
              ];
            });
            printTable(headers, rows, outputOpts);
            console.log("");
          }
        }
      } catch (err) {
        printError("Failed to get settings", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  config
    .command("get <key>")
    .description("Get a specific setting value")
    .action(async (key: string) => {
      const globalOpts = parent.opts();
      const outputOpts = getOutputOpts(globalOpts);
      const client = new MiddlewareClient(globalOpts.server);

      try {
        const result = await client.get<Record<string, unknown>>("/api/v1/config/settings");
        const settings = (result.settings ?? result) as Record<string, unknown>;
        const provenance = (result.provenance ?? {}) as Record<string, string>;

        const flat = flattenObject(settings);
        const value = flat[key];

        if (value === undefined) {
          printError(`Setting not found: ${key}`);
          process.exit(1);
        }

        if (outputOpts.json) {
          printJson({ key, value, source: provenance[key] ?? "unknown" });
        } else {
          const source = provenance[key] ?? "";
          console.log(`${key} = ${formatValue(value)}${source ? chalk.dim(` (from: ${source})`) : ""}`);
        }
      } catch (err) {
        printError("Failed to get setting", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  config
    .command("set <key> <value>")
    .description("Set a setting value")
    .option("--scope <scope>", "Settings scope to write to", "project")
    .action(async (key: string, value: string, opts) => {
      const globalOpts = parent.opts();
      const outputOpts = getOutputOpts(globalOpts);
      const client = new MiddlewareClient(globalOpts.server);

      if (opts.scope === "managed") {
        printError("Cannot modify managed settings");
        process.exit(1);
      }

      // Try to parse value as JSON, fall back to string
      let parsedValue: unknown = value;
      try {
        parsedValue = JSON.parse(value);
      } catch {
        // Keep as string
      }

      try {
        await client.put(`/api/v1/config/settings/${opts.scope}`, { key, value: parsedValue });

        if (outputOpts.json) {
          printJson({ key, value: parsedValue, scope: opts.scope });
        } else {
          printSuccess(`Set ${key} = ${formatValue(parsedValue)} in ${opts.scope}`);
        }
      } catch (err) {
        printError("Failed to set setting", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  config
    .command("plugins")
    .description("List plugins")
    .action(async () => {
      const globalOpts = parent.opts();
      const outputOpts = getOutputOpts(globalOpts);
      const client = new MiddlewareClient(globalOpts.server);

      try {
        const result = await client.get<PluginRow[] | { plugins: PluginRow[] }>("/api/v1/config/plugins");
        const plugins = Array.isArray(result) ? result : (result.plugins ?? []);

        if (outputOpts.json) {
          printJson(plugins);
        } else {
          if (plugins.length === 0) {
            console.log(chalk.dim("No plugins installed."));
            return;
          }

          const headers = ["Name", "Version", "Enabled", "Scope"];
          const rows = plugins.map((p) => [
            p.name ?? "",
            p.version ?? "",
            p.enabled ? chalk.green("yes") : chalk.red("no"),
            p.scope ?? "",
          ]);
          printTable(headers, rows, outputOpts);
        }
      } catch (err) {
        printError("Failed to list plugins", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  config
    .command("mcp")
    .description("List MCP servers")
    .action(async () => {
      const globalOpts = parent.opts();
      const outputOpts = getOutputOpts(globalOpts);
      const client = new MiddlewareClient(globalOpts.server);

      try {
        const result = await client.get<McpRow[] | { servers: McpRow[] }>("/api/v1/config/mcp");
        const servers = Array.isArray(result) ? result : (result.servers ?? []);

        if (outputOpts.json) {
          printJson(servers);
        } else {
          if (servers.length === 0) {
            console.log(chalk.dim("No MCP servers configured."));
            return;
          }

          const headers = ["Name", "Transport", "Scope", "Command/URL"];
          const rows = servers.map((s) => [
            s.name ?? "",
            s.transport ?? s.type ?? "",
            s.scope ?? "",
            truncate(String(s.command ?? s.url ?? ""), 40),
          ]);
          printTable(headers, rows, outputOpts);
        }
      } catch (err) {
        printError("Failed to list MCP servers", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  config
    .command("skills")
    .description("List skills")
    .action(async () => {
      const globalOpts = parent.opts();
      const outputOpts = getOutputOpts(globalOpts);
      const client = new MiddlewareClient(globalOpts.server);

      try {
        const result = await client.get<SkillRow[] | { skills: SkillRow[] }>("/api/v1/config/skills");
        const skills = Array.isArray(result) ? result : (result.skills ?? []);

        if (outputOpts.json) {
          printJson(skills);
        } else {
          if (skills.length === 0) {
            console.log(chalk.dim("No skills found."));
            return;
          }

          const headers = ["Name", "Scope", "Description"];
          const rows = skills.map((s) => [
            s.name ?? "",
            s.scope ?? "",
            truncate(s.description ?? "", 50),
          ]);
          printTable(headers, rows, outputOpts);
        }
      } catch (err) {
        printError("Failed to list skills", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  config
    .command("agents")
    .description("List agent definitions (file-based)")
    .action(async () => {
      const globalOpts = parent.opts();
      const outputOpts = getOutputOpts(globalOpts);
      const client = new MiddlewareClient(globalOpts.server);

      try {
        const result = await client.get<AgentDefRow[] | { agents: AgentDefRow[] }>("/api/v1/config/agents");
        const agents = Array.isArray(result) ? result : (result.agents ?? []);

        if (outputOpts.json) {
          printJson(agents);
        } else {
          if (agents.length === 0) {
            console.log(chalk.dim("No agent definitions found."));
            return;
          }

          const headers = ["Name", "Scope", "Model", "Description", "Path"];
          const rows = agents.map((a) => [
            a.name ?? "",
            a.scope ?? "",
            a.model ?? "",
            truncate(a.description ?? "", 30),
            truncate(a.path ?? "", 30),
          ]);
          printTable(headers, rows, outputOpts);
        }
      } catch (err) {
        printError("Failed to list agent definitions", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  config
    .command("memory")
    .description("Show memory index")
    .action(async () => {
      const globalOpts = parent.opts();
      const outputOpts = getOutputOpts(globalOpts);
      const client = new MiddlewareClient(globalOpts.server);

      try {
        const result = await client.get<Record<string, unknown>>("/api/v1/config/memory");

        if (outputOpts.json) {
          printJson(result);
        } else {
          const index = result.index ?? result.content ?? "";
          if (index) {
            console.log(chalk.bold("\nMemory Index:\n"));
            console.log(String(index));
          }

          const files = (result.files ?? []) as MemoryFileRow[];
          if (files.length > 0) {
            console.log(chalk.bold("\nMemory Files:"));
            const headers = ["Name", "Type", "Last Modified"];
            const rows = files.map((f) => [
              f.name ?? "",
              f.type ?? "",
              f.lastModified ? new Date(f.lastModified).toLocaleDateString() : "",
            ]);
            printTable(headers, rows, outputOpts);
          } else if (!index) {
            console.log(chalk.dim("No memory data found."));
          }
          console.log("");
        }
      } catch (err) {
        printError("Failed to get memory", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}

/** Flatten a nested object into dot-notation key-value pairs */
function flattenObject(obj: Record<string, unknown>, prefix = ""): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value as Record<string, unknown>, fullKey));
    } else {
      result[fullKey] = value;
    }
  }
  return result;
}

/** Format a value for display */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Color a scope label */
function colorByScope(scope: string, opts: OutputOptions): string {
  if (opts.noColor) return scope;
  switch (scope) {
    case "user":
      return chalk.blue(scope);
    case "project":
      return chalk.green(scope);
    case "local":
      return chalk.yellow(scope);
    case "managed":
      return chalk.red(scope);
    default:
      return chalk.dim(scope);
  }
}

function getOutputOpts(globalOpts: Record<string, unknown>): OutputOptions {
  return {
    json: (globalOpts.json as boolean) ?? false,
    verbose: (globalOpts.verbose as boolean) ?? false,
    noColor: !(globalOpts.color as boolean),
  };
}

interface PluginRow {
  name?: string;
  version?: string;
  enabled?: boolean;
  scope?: string;
  [key: string]: unknown;
}

interface McpRow {
  name?: string;
  transport?: string;
  type?: string;
  scope?: string;
  command?: string;
  url?: string;
  [key: string]: unknown;
}

interface SkillRow {
  name?: string;
  scope?: string;
  description?: string;
  [key: string]: unknown;
}

interface AgentDefRow {
  name?: string;
  scope?: string;
  model?: string;
  description?: string;
  path?: string;
  [key: string]: unknown;
}

interface MemoryFileRow {
  name?: string;
  type?: string;
  lastModified?: string | number;
  [key: string]: unknown;
}
