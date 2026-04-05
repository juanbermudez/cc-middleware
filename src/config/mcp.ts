/**
 * MCP server reader and management.
 * Discovers MCP servers from all configuration sources and provides
 * management through the claude CLI.
 */

import { join, resolve } from "node:path";
import { homedir, platform } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readJsonFileSafe } from "../utils/fs.js";

const execFileAsync = promisify(execFile);

/** MCP server information */
export interface McpServerInfo {
  name: string;
  scope: "managed" | "user" | "local" | "project" | "plugin";
  transport: "stdio" | "sse" | "http";
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
  enabled: boolean;
  source: string;
}

/** Read a JSON file safely */
const readJsonFile = readJsonFileSafe;

/** Determine transport type from a server config */
function getTransport(config: Record<string, unknown>): "stdio" | "sse" | "http" {
  if (config.type === "http") return "http";
  if (config.type === "sse") return "sse";
  if (config.command) return "stdio";
  if (config.url) {
    return (config.type as string) === "sse" ? "sse" : "http";
  }
  return "stdio";
}

/** Parse MCP servers from a config object */
function parseMcpServers(
  servers: Record<string, unknown>,
  scope: McpServerInfo["scope"],
  source: string
): McpServerInfo[] {
  const result: McpServerInfo[] = [];

  for (const [name, config] of Object.entries(servers)) {
    if (!config || typeof config !== "object") continue;
    const cfg = config as Record<string, unknown>;

    const transport = getTransport(cfg);

    result.push({
      name,
      scope,
      transport,
      command: cfg.command as string | undefined,
      args: Array.isArray(cfg.args) ? cfg.args.map(String) : undefined,
      url: cfg.url as string | undefined,
      env: (cfg.env && typeof cfg.env === "object") ? cfg.env as Record<string, string> : undefined,
      headers: (cfg.headers && typeof cfg.headers === "object") ? cfg.headers as Record<string, string> : undefined,
      enabled: true, // Default to enabled if configured
      source,
    });
  }

  return result;
}

/** Get managed MCP path for this platform */
function getManagedMcpPath(): string {
  const os = platform();
  if (os === "darwin") {
    return "/Library/Application Support/ClaudeCode/managed-mcp.json";
  } else if (os === "win32") {
    return "C:\\Program Files\\ClaudeCode\\managed-mcp.json";
  }
  return "/etc/claude-code/managed-mcp.json";
}

/**
 * Discover all MCP servers from all sources.
 */
export async function discoverMcpServers(options?: {
  projectDir?: string;
}): Promise<McpServerInfo[]> {
  const project = options?.projectDir ?? process.cwd();
  const home = homedir();
  const servers: McpServerInfo[] = [];

  // 1. Managed MCP servers
  const managedPath = getManagedMcpPath();
  const managedData = await readJsonFile(managedPath);
  if (managedData?.mcpServers && typeof managedData.mcpServers === "object") {
    servers.push(
      ...parseMcpServers(
        managedData.mcpServers as Record<string, unknown>,
        "managed",
        managedPath
      )
    );
  }

  // 2. User-scope MCP servers (top-level mcpServers in ~/.claude.json)
  const globalConfigPath = join(home, ".claude.json");
  const globalConfig = await readJsonFile(globalConfigPath);
  if (globalConfig) {
    // User-scope: top-level mcpServers
    if (globalConfig.mcpServers && typeof globalConfig.mcpServers === "object") {
      servers.push(
        ...parseMcpServers(
          globalConfig.mcpServers as Record<string, unknown>,
          "user",
          globalConfigPath
        )
      );
    }

    // Local-scope: per-project mcpServers in projects.<path>
    const projects = globalConfig.projects as Record<string, Record<string, unknown>> | undefined;
    if (projects) {
      const absProject = resolve(project);
      const projectEntry = projects[absProject];
      if (projectEntry?.mcpServers && typeof projectEntry.mcpServers === "object") {
        servers.push(
          ...parseMcpServers(
            projectEntry.mcpServers as Record<string, unknown>,
            "local",
            globalConfigPath
          )
        );
      }
    }
  }

  // 3. Project-scope MCP servers (.mcp.json in project root)
  const projectMcpPath = join(project, ".mcp.json");
  const projectMcpData = await readJsonFile(projectMcpPath);
  if (projectMcpData?.mcpServers && typeof projectMcpData.mcpServers === "object") {
    servers.push(
      ...parseMcpServers(
        projectMcpData.mcpServers as Record<string, unknown>,
        "project",
        projectMcpPath
      )
    );
  }

  return servers;
}

/**
 * Add an MCP server via the claude CLI.
 */
export async function addMcpServer(
  name: string,
  config: { command: string; args?: string[]; env?: Record<string, string> },
  options?: { scope?: "local" | "project" | "user"; claudePath?: string }
): Promise<{ success: boolean; output: string }> {
  const claudePath = options?.claudePath ?? "claude";
  const args = ["mcp", "add", "--transport", "stdio"];

  if (options?.scope) {
    args.push("--scope", options.scope);
  }

  // Add env vars
  if (config.env) {
    for (const [key, value] of Object.entries(config.env)) {
      args.push("--env", `${key}=${value}`);
    }
  }

  args.push(name, "--", config.command);
  if (config.args) {
    args.push(...config.args);
  }

  try {
    const { stdout, stderr } = await execFileAsync(claudePath, args, {
      timeout: 30000,
    });
    return { success: true, output: stdout + stderr };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    return {
      success: false,
      output: (err.stdout ?? "") + (err.stderr ?? err.message ?? ""),
    };
  }
}

/**
 * Remove an MCP server via the claude CLI.
 */
export async function removeMcpServer(
  name: string,
  options?: { scope?: string; claudePath?: string }
): Promise<{ success: boolean; output: string }> {
  const claudePath = options?.claudePath ?? "claude";
  const args = ["mcp", "remove", name];

  if (options?.scope) {
    args.push("--scope", options.scope);
  }

  try {
    const { stdout, stderr } = await execFileAsync(claudePath, args, {
      timeout: 30000,
    });
    return { success: true, output: stdout + stderr };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    return {
      success: false,
      output: (err.stdout ?? "") + (err.stderr ?? err.message ?? ""),
    };
  }
}
