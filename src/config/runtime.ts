/**
 * Agent SDK-backed runtime inventory.
 * Captures what Claude Code reports as effectively loaded for the current
 * project/session, which can differ from raw filesystem discovery.
 */

import { query } from "@anthropic-ai/claude-agent-sdk";

export interface RuntimeInventoryOptions {
  projectDir?: string;
  settingSources?: Array<"user" | "project" | "local">;
  plugins?: Array<{ type: "local"; path: string }>;
}

export interface RuntimePluginInfo {
  name: string;
  path: string;
  source?: string;
}

export interface RuntimeMcpServerInfo {
  name: string;
  status: string;
}

export interface ClaudeRuntimeInventory {
  cwd: string;
  model: string;
  permissionMode: string;
  claudeCodeVersion: string;
  outputStyle: string;
  availableOutputStyles: string[];
  tools: string[];
  toolsCount: number;
  slashCommands: string[];
  skills: string[];
  agents: string[];
  plugins: RuntimePluginInfo[];
  mcpServers: RuntimeMcpServerInfo[];
  commands: Array<{
    name: string;
    description: string;
    argumentHint: string | string[];
  }>;
  agentDetails: Array<{
    name: string;
    description: string;
    model?: string;
  }>;
  models: Array<{
    value?: string;
    displayName?: string;
    description?: string;
  }>;
}

/**
 * Inspect the effective Claude Code runtime inventory for a project using the
 * Agent SDK. This reflects what Claude actually loads, not just what's on disk.
 */
export async function inspectClaudeRuntime(
  options?: RuntimeInventoryOptions
): Promise<ClaudeRuntimeInventory> {
  const q = query({
    prompt: "Reply with the word ok.",
    options: {
      cwd: options?.projectDir ?? process.cwd(),
      persistSession: false,
      maxTurns: 1,
      settingSources: options?.settingSources ?? ["user", "project", "local"],
      plugins: options?.plugins,
    },
  });

  let initMessage: Record<string, unknown> | null = null;

  try {
    for await (const message of q) {
      const msg = message as Record<string, unknown>;
      if (msg.type === "system" && msg.subtype === "init") {
        initMessage = msg;
        break;
      }
    }

    if (!initMessage) {
      throw new Error("Claude runtime inventory did not produce an init message");
    }

    const init = await q.initializationResult();

    return {
      cwd: (initMessage.cwd as string) ?? (options?.projectDir ?? process.cwd()),
      model: (initMessage.model as string) ?? "",
      permissionMode: (initMessage.permissionMode as string) ?? "default",
      claudeCodeVersion: (initMessage.claude_code_version as string) ?? "",
      outputStyle: init.output_style,
      availableOutputStyles: init.available_output_styles,
      tools: Array.isArray(initMessage.tools) ? initMessage.tools.map(String) : [],
      toolsCount: Array.isArray(initMessage.tools) ? initMessage.tools.length : 0,
      slashCommands: Array.isArray(initMessage.slash_commands)
        ? initMessage.slash_commands.map(String)
        : [],
      skills: Array.isArray(initMessage.skills) ? initMessage.skills.map(String) : [],
      agents: Array.isArray(initMessage.agents) ? initMessage.agents.map(String) : [],
      plugins: Array.isArray(initMessage.plugins)
        ? initMessage.plugins.map((plugin) => {
            const data = plugin as Record<string, unknown>;
            return {
              name: String(data.name ?? ""),
              path: String(data.path ?? ""),
              source: typeof data.source === "string" ? data.source : undefined,
            };
          })
        : [],
      mcpServers: Array.isArray(initMessage.mcp_servers)
        ? initMessage.mcp_servers.map((server) => {
            const data = server as Record<string, unknown>;
            return {
              name: String(data.name ?? ""),
              status: String(data.status ?? ""),
            };
          })
        : [],
      commands: init.commands.map((command) => ({
        name: command.name,
        description: command.description,
        argumentHint: command.argumentHint,
      })),
      agentDetails: init.agents.map((agent) => ({
        name: agent.name,
        description: agent.description,
        model: agent.model,
      })),
      models: init.models.map((model) => ({
        value: model.value,
        displayName: model.displayName,
        description: model.description,
      })),
    };
  } finally {
    q.close();
  }
}
