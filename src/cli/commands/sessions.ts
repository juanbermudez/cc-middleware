/**
 * Session management commands: list, show, launch, resume, stream, search.
 */

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { MiddlewareClient } from "../client.js";
import { MiddlewareWsClient } from "../ws-client.js";
import {
  printTable,
  printJson,
  printKeyValue,
  printError,
  printSuccess,
  truncate,
  formatDate,
} from "../output.js";
import type { OutputOptions } from "../output.js";

export function registerSessionCommands(parent: Command): void {
  const sessions = parent.command("sessions").description("Manage Claude Code sessions");

  sessions
    .command("list")
    .description("List sessions")
    .option("--limit <n>", "Max results", "20")
    .option("--offset <n>", "Skip results", "0")
    .option("--project <dir>", "Filter by project directory")
    .action(async (opts) => {
      const globalOpts = parent.opts();
      const outputOpts = getOutputOpts(globalOpts);
      const client = new MiddlewareClient(globalOpts.server);

      try {
        const params: Record<string, string> = {
          limit: opts.limit,
          offset: opts.offset,
        };
        if (opts.project) params.project = opts.project;

        const result = await client.get<{ sessions: SessionRow[]; total: number }>(
          "/api/v1/sessions",
          params,
        );

        if (outputOpts.json) {
          printJson(result);
        } else {
          if (!result.sessions || result.sessions.length === 0) {
            console.log(chalk.dim("No sessions found."));
            return;
          }

          const headers = ["ID", "Created", "Status", "First Prompt"];
          const rows = result.sessions.map((s) => [
            truncate(s.sessionId ?? s.id ?? "", 8),
            formatDate(s.lastModified ?? s.createdAt),
            s.status ?? "completed",
            truncate(s.firstPrompt ?? s.summary ?? "", 50),
          ]);
          printTable(headers, rows, outputOpts);

          const offset = parseInt(opts.offset, 10);
          const total = result.total ?? result.sessions.length;
          console.log(
            chalk.dim(
              `\n  Showing ${offset + 1}-${Math.min(offset + result.sessions.length, total)} of ${total} sessions`,
            ),
          );
        }
      } catch (err) {
        printError("Failed to list sessions", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  sessions
    .command("show <id>")
    .description("Show session details and messages")
    .option("--messages <n>", "Number of messages to show", "50")
    .option("--no-messages", "Show metadata only")
    .action(async (id: string, opts) => {
      const globalOpts = parent.opts();
      const outputOpts = getOutputOpts(globalOpts);
      const client = new MiddlewareClient(globalOpts.server);

      try {
        const session = await client.get<Record<string, unknown>>(`/api/v1/sessions/${id}`);

        let messages: unknown[] = [];
        if (opts.messages !== false) {
          try {
            const msgResult = await client.get<{ messages: unknown[] }>(
              `/api/v1/sessions/${id}/messages`,
              { limit: opts.messages },
            );
            messages = msgResult.messages ?? [];
          } catch {
            // Messages may not be available
          }
        }

        if (outputOpts.json) {
          printJson({ session, messages });
        } else {
          const s = session as Record<string, unknown>;
          console.log("");
          printKeyValue(
            {
              Session: s.sessionId ?? s.id ?? id,
              Created: formatDate(s.createdAt as string),
              Status: s.status ?? "completed",
              Project: s.cwd ?? "",
              Tags: s.tag ?? "",
              Summary: s.summary ?? s.customTitle ?? "",
            },
            outputOpts,
          );

          if (messages.length > 0) {
            console.log(chalk.dim(`\n--- Conversation (${messages.length} messages) ---\n`));
            for (const msg of messages) {
              const m = msg as Record<string, unknown>;
              const role = String(m.type ?? m.role ?? "unknown");
              const content = extractContent(m);

              if (role === "user") {
                console.log(chalk.blue(`[Human] ${content}`));
              } else if (role === "assistant") {
                console.log(chalk.green(`[Assistant] ${content}`));
              } else {
                console.log(chalk.dim(`[${role}] ${content}`));
              }
              console.log("");
            }
          }
        }
      } catch (err) {
        printError("Failed to show session", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  sessions
    .command("launch <prompt>")
    .description("Launch a new headless session")
    .option("--stream", "Stream output in real-time")
    .option("--tools <tools>", "Comma-separated allowed tools")
    .option("--model <model>", "Model to use")
    .option("--max-turns <n>", "Maximum turns")
    .option("--agent <name>", "Use a registered agent")
    .action(async (prompt: string, opts) => {
      const globalOpts = parent.opts();
      const outputOpts = getOutputOpts(globalOpts);
      const client = new MiddlewareClient(globalOpts.server);

      const body: Record<string, unknown> = { prompt };
      if (opts.tools) body.allowedTools = opts.tools.split(",").map((t: string) => t.trim());
      if (opts.model) body.model = opts.model;
      if (opts.maxTurns) body.maxTurns = parseInt(opts.maxTurns, 10);
      if (opts.agent) body.agent = opts.agent;

      if (opts.stream) {
        // Use WebSocket for streaming
        const wsUrl = globalOpts.server.replace(/^http/, "ws") + "/api/v1/ws";
        const wsClient = new MiddlewareWsClient(wsUrl);

        try {
          await wsClient.connect();
          wsClient.subscribe(["session:*"]);
          wsClient.send({ type: "launch", options: body });

          wsClient.onMessage((msg) => {
            if (msg.type === "session:stream") {
              const event = msg.event as Record<string, unknown>;
              if (event?.type === "text_delta" || event?.type === "text") {
                process.stdout.write(String(event.text ?? ""));
              }
            } else if (msg.type === "session:completed") {
              console.log("");
              if (outputOpts.json) {
                printJson(msg);
              } else {
                printSuccess("Session completed.");
              }
              wsClient.close();
              process.exit(0);
            } else if (msg.type === "session:errored") {
              console.log("");
              printError("Session error", String(msg.error ?? "Unknown error"));
              wsClient.close();
              process.exit(1);
            }
          });

          // Handle Ctrl+C
          process.on("SIGINT", () => {
            wsClient.close();
            console.log(chalk.dim("\nSession aborted."));
            process.exit(0);
          });

          // Keep alive
          await new Promise(() => {});
        } catch (err) {
          wsClient.close();
          printError("Streaming failed", err instanceof Error ? err.message : String(err));
          process.exit(1);
        }
      } else {
        // Non-streaming: POST and wait
        const spinner = ora("Launching session...").start();

        try {
          const result = await client.post<Record<string, unknown>>("/api/v1/sessions", body);
          spinner.stop();

          if (outputOpts.json) {
            printJson(result);
          } else {
            const resultText = String(result.result ?? result.text ?? "");
            if (resultText) {
              console.log(resultText);
            }
            const sessionId = String(result.sessionId ?? result.session_id ?? "");
            if (sessionId) {
              console.log(chalk.dim(`\nSession: ${sessionId}`));
            }
          }
        } catch (err) {
          spinner.stop();
          printError("Failed to launch session", err instanceof Error ? err.message : String(err));
          process.exit(1);
        }
      }
    });

  sessions
    .command("resume <id>")
    .description("Resume an existing session")
    .option("--prompt <text>", "Follow-up prompt")
    .option("--stream", "Stream output in real-time")
    .action(async (id: string, opts) => {
      const globalOpts = parent.opts();
      const outputOpts = getOutputOpts(globalOpts);
      const client = new MiddlewareClient(globalOpts.server);

      const body: Record<string, unknown> = {};
      if (opts.prompt) body.prompt = opts.prompt;

      if (opts.stream) {
        const wsUrl = globalOpts.server.replace(/^http/, "ws") + "/api/v1/ws";
        const wsClient = new MiddlewareWsClient(wsUrl);

        try {
          await wsClient.connect();
          wsClient.subscribe(["session:*"]);
          wsClient.send({ type: "resume", sessionId: id, ...body });

          wsClient.onMessage((msg) => {
            if (msg.type === "session:stream") {
              const event = msg.event as Record<string, unknown>;
              if (event?.type === "text_delta" || event?.type === "text") {
                process.stdout.write(String(event.text ?? ""));
              }
            } else if (msg.type === "session:completed") {
              console.log("");
              if (outputOpts.json) printJson(msg);
              else printSuccess("Session completed.");
              wsClient.close();
              process.exit(0);
            } else if (msg.type === "session:errored") {
              console.log("");
              printError("Session error", String(msg.error ?? "Unknown error"));
              wsClient.close();
              process.exit(1);
            }
          });

          process.on("SIGINT", () => {
            wsClient.close();
            console.log(chalk.dim("\nSession aborted."));
            process.exit(0);
          });

          await new Promise(() => {});
        } catch (err) {
          wsClient.close();
          printError("Streaming failed", err instanceof Error ? err.message : String(err));
          process.exit(1);
        }
      } else {
        const spinner = ora("Resuming session...").start();

        try {
          const result = await client.post<Record<string, unknown>>(
            `/api/v1/sessions/${id}/resume`,
            body,
          );
          spinner.stop();

          if (outputOpts.json) {
            printJson(result);
          } else {
            const resultText = String(result.result ?? result.text ?? "");
            if (resultText) console.log(resultText);
          }
        } catch (err) {
          spinner.stop();
          printError("Failed to resume session", err instanceof Error ? err.message : String(err));
          process.exit(1);
        }
      }
    });

  sessions
    .command("stream <id>")
    .description("Stream a session's output in real-time")
    .action(async (id: string) => {
      const globalOpts = parent.opts();
      const wsUrl = globalOpts.server.replace(/^http/, "ws") + "/api/v1/ws";
      const wsClient = new MiddlewareWsClient(wsUrl);

      try {
        await wsClient.connect();
        wsClient.subscribe(["session:stream", "session:completed", "session:errored"]);

        console.log(chalk.dim(`Streaming session ${truncate(id, 12)}... (Ctrl+C to stop)\n`));

        wsClient.onMessage((msg) => {
          if (msg.type === "session:stream" && msg.sessionId === id) {
            const event = msg.event as Record<string, unknown>;
            if (event?.type === "text_delta" || event?.type === "text") {
              process.stdout.write(String(event.text ?? ""));
            } else if (event?.type === "tool_use") {
              console.log(chalk.dim(`  [Tool: ${event.name}] ${truncate(String(event.input ?? ""), 60)}`));
            }
          } else if (msg.type === "session:completed" && msg.sessionId === id) {
            console.log(chalk.dim("\nSession completed."));
            wsClient.close();
            process.exit(0);
          } else if (msg.type === "session:errored" && msg.sessionId === id) {
            printError("Session error", String(msg.error ?? "Unknown error"));
            wsClient.close();
            process.exit(1);
          }
        });

        process.on("SIGINT", () => {
          wsClient.close();
          console.log(chalk.dim("\nStopped streaming."));
          process.exit(0);
        });

        await new Promise(() => {});
      } catch (err) {
        wsClient.close();
        printError("Failed to stream session", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  sessions
    .command("search <query>")
    .description("Search sessions")
    .option("--limit <n>", "Max results", "20")
    .option("--project <dir>", "Filter by project")
    .option("--from <date>", "From date (YYYY-MM-DD)")
    .option("--to <date>", "To date (YYYY-MM-DD)")
    .option("--tag <tag>", "Filter by tag")
    .action(async (query: string, opts) => {
      const globalOpts = parent.opts();
      const outputOpts = getOutputOpts(globalOpts);
      const client = new MiddlewareClient(globalOpts.server);

      try {
        const params: Record<string, string> = {
          q: query,
          limit: opts.limit,
        };
        if (opts.project) params.project = opts.project;
        if (opts.from) params.from = opts.from;
        if (opts.to) params.to = opts.to;
        if (opts.tag) params.tag = opts.tag;

        const result = await client.get<{ results: SearchRow[]; total: number }>(
          "/api/v1/search",
          params,
        );

        if (outputOpts.json) {
          printJson(result);
        } else {
          if (!result.results || result.results.length === 0) {
            console.log(chalk.dim(`No sessions found matching "${query}"`));
            return;
          }

          const headers = ["ID", "Score", "Created", "Highlight"];
          const rows = result.results.map((r) => [
            truncate(r.sessionId ?? r.id ?? "", 8),
            String(r.score ?? r.rank ?? ""),
            formatDate(r.createdAt ?? r.lastModified),
            truncate(r.highlight ?? r.snippet ?? r.summary ?? "", 50),
          ]);
          printTable(headers, rows, outputOpts);
        }
      } catch (err) {
        printError("Search failed", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}

/** Extract text content from a message object */
function extractContent(msg: Record<string, unknown>): string {
  if (typeof msg.text === "string") return msg.text;
  if (typeof msg.content === "string") return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content
      .map((c: unknown) => {
        if (typeof c === "string") return c;
        if (typeof c === "object" && c !== null && "text" in c) return String((c as { text: string }).text);
        return "";
      })
      .filter(Boolean)
      .join(" ");
  }
  return truncate(JSON.stringify(msg.message ?? msg), 100);
}

function getOutputOpts(globalOpts: Record<string, unknown>): OutputOptions {
  return {
    json: (globalOpts.json as boolean) ?? false,
    verbose: (globalOpts.verbose as boolean) ?? false,
    noColor: !(globalOpts.color as boolean),
  };
}

interface SessionRow {
  sessionId?: string;
  id?: string;
  lastModified?: string;
  createdAt?: string;
  status?: string;
  firstPrompt?: string;
  summary?: string;
  [key: string]: unknown;
}

interface SearchRow {
  sessionId?: string;
  id?: string;
  score?: number;
  rank?: number;
  createdAt?: string;
  lastModified?: string;
  highlight?: string;
  snippet?: string;
  summary?: string;
  [key: string]: unknown;
}
