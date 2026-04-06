/**
 * Agent and team commands: agents list/show/create, teams list/show.
 */

import { Command } from "commander";
import chalk from "chalk";
import { MiddlewareClient } from "../client.js";
import { printTable, printJson, printKeyValue, printError, printSuccess, truncate } from "../output.js";
import type { OutputOptions } from "../output.js";

export function registerAgentCommands(parent: Command): void {
  const agents = parent.command("agents").description("Manage agent definitions");

  agents
    .command("list")
    .description("List all agents")
    .action(async () => {
      const globalOpts = parent.opts();
      const outputOpts = getOutputOpts(globalOpts);
      const client = new MiddlewareClient(globalOpts.server);

      try {
        const result = await client.get<{ agents: AgentRow[] }>("/api/v1/agents");

        if (outputOpts.json) {
          printJson(result);
        } else {
          const agentsList = result.agents ?? [];
          if (agentsList.length === 0) {
            console.log(chalk.dim("No agents registered."));
            return;
          }

          const headers = ["Name", "Source", "Model", "Description"];
          const rows = agentsList.map((a) => [
            a.name ?? "",
            a.source ?? "filesystem",
            a.model ?? "",
            truncate(a.description ?? "", 40),
          ]);
          printTable(headers, rows, outputOpts);
        }
      } catch (err) {
        printError("Failed to list agents", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  agents
    .command("show <name>")
    .description("Show agent details")
    .action(async (name: string) => {
      const globalOpts = parent.opts();
      const outputOpts = getOutputOpts(globalOpts);
      const client = new MiddlewareClient(globalOpts.server);

      try {
        const agent = await client.get<Record<string, unknown>>(`/api/v1/agents/${name}`);

        if (outputOpts.json) {
          printJson(agent);
        } else {
          console.log("");
          printKeyValue(
            {
              Name: agent.name ?? name,
              Source: agent.source ?? "filesystem",
              Model: agent.model ?? "",
              Description: agent.description ?? "",
              Tools: Array.isArray(agent.tools) ? agent.tools.join(", ") : (agent.tools ?? ""),
            },
            outputOpts,
          );

          if (agent.prompt || agent.systemPrompt) {
            console.log(chalk.bold("\nPrompt:"));
            console.log(chalk.dim(String(agent.prompt ?? agent.systemPrompt ?? "")));
          }
          console.log("");
        }
      } catch (err) {
        printError(`Agent not found: ${name}`, err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  agents
    .command("create")
    .description("Create a new agent definition")
    .option("--name <name>", "Agent name")
    .option("--description <desc>", "Agent description")
    .option("--model <model>", "Model to use")
    .option("--tools <tools>", "Comma-separated tool list")
    .option("--prompt <text>", "Agent prompt")
    .action(async (opts) => {
      const globalOpts = parent.opts();
      const outputOpts = getOutputOpts(globalOpts);
      const client = new MiddlewareClient(globalOpts.server);

      if (!opts.name) {
        printError("Agent name is required. Use --name <name>");
        process.exit(1);
      }

      const body: Record<string, unknown> = {
        name: opts.name,
      };
      if (opts.description) body.description = opts.description;
      if (opts.model) body.model = opts.model;
      if (opts.tools) body.tools = opts.tools.split(",").map((t: string) => t.trim());
      if (opts.prompt) body.prompt = opts.prompt;

      try {
        const result = await client.post<Record<string, unknown>>("/api/v1/config/agents", body);

        if (outputOpts.json) {
          printJson(result);
        } else {
          printSuccess(`Agent created: ${opts.name}${result.path ? ` at ${result.path}` : ""}`);
        }
      } catch (err) {
        printError("Failed to create agent", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}

export function registerTeamCommands(parent: Command): void {
  const teams = parent.command("teams").description("Manage agent teams");

  teams
    .command("list")
    .description("List active teams")
    .action(async () => {
      const globalOpts = parent.opts();
      const outputOpts = getOutputOpts(globalOpts);
      const client = new MiddlewareClient(globalOpts.server);

      try {
        const result = await client.get<{ teams: TeamRow[] }>("/api/v1/teams");

        if (outputOpts.json) {
          printJson(result);
        } else {
          const teamsList = result.teams ?? [];
          if (teamsList.length === 0) {
            console.log(chalk.dim("No active teams."));
            return;
          }

          const headers = ["Name", "Members", "Active Tasks", "Status"];
          const rows = teamsList.map((t) => [
            t.name ?? "",
            String(t.memberCount ?? t.members?.length ?? 0),
            String(t.activeTasks ?? 0),
            t.status ?? "idle",
          ]);
          printTable(headers, rows, outputOpts);
        }
      } catch (err) {
        printError("Failed to list teams", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  teams
    .command("show <name>")
    .description("Show team details and tasks")
    .action(async (name: string) => {
      const globalOpts = parent.opts();
      const outputOpts = getOutputOpts(globalOpts);
      const client = new MiddlewareClient(globalOpts.server);

      try {
        const [team, tasksResult] = await Promise.all([
          client.get<Record<string, unknown>>(`/api/v1/teams/${name}`),
          client.get<{ tasks: TaskRow[] }>(`/api/v1/teams/${name}/tasks`),
        ]);

        if (outputOpts.json) {
          printJson({ team, tasks: tasksResult.tasks });
        } else {
          console.log("");
          printKeyValue(
            {
              Team: team.name ?? name,
              Members: Array.isArray(team.members)
                ? (team.members as Array<Record<string, unknown>>).map((m) => String(m.name ?? m.agent ?? "")).join(", ")
                : "",
              Status: team.status ?? "idle",
            },
            outputOpts,
          );

          const tasks = tasksResult.tasks ?? [];
          if (tasks.length > 0) {
            console.log(chalk.bold("\nTasks:"));
            const headers = ["ID", "Assignee", "Status", "Description"];
            const rows = tasks.map((t) => [
              truncate(String(t.id ?? ""), 8),
              t.assignee ?? "",
              t.status ?? "",
              truncate(t.description ?? "", 40),
            ]);
            printTable(headers, rows, outputOpts);
          }
          console.log("");
        }
      } catch (err) {
        printError(`Team not found: ${name}`, err instanceof Error ? err.message : String(err));
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

interface AgentRow {
  name?: string;
  source?: string;
  model?: string;
  description?: string;
  [key: string]: unknown;
}

interface TeamRow {
  name?: string;
  memberCount?: number;
  members?: unknown[];
  activeTasks?: number;
  status?: string;
  [key: string]: unknown;
}

interface TaskRow {
  id?: string;
  assignee?: string;
  status?: string;
  description?: string;
  [key: string]: unknown;
}
