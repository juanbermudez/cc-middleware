/**
 * Agent definition reader.
 * Reads and parses agent definition markdown files from the filesystem.
 */

import { readdir, readFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import matter from "gray-matter";

/** Source of an agent definition */
export type AgentSource = "project" | "user" | "plugin" | "runtime";

/** An agent definition with source metadata */
export interface AgentDefinitionSource {
  name: string;
  description: string;
  model?: string;
  maxTurns?: number;
  tools?: string[];
  disallowedTools?: string[];
  prompt: string;
  source: AgentSource;
  filePath?: string;
}

/** Options for reading agent definitions */
export interface ReadAgentOptions {
  /** Project directory to scan for .claude/agents/ */
  projectDir?: string;
  /** User agent directory. Default: ~/.claude/agents/ */
  userDir?: string;
  /** Additional plugin directories to scan */
  pluginDirs?: string[];
}

/**
 * Parse an agent markdown file content into an AgentDefinitionSource.
 * Expects YAML frontmatter with at least name and description.
 * The body after frontmatter becomes the prompt.
 */
export function parseAgentMarkdown(
  content: string,
  filePath: string,
  source: AgentSource = "project"
): AgentDefinitionSource {
  const parsed = matter(content);
  const data = parsed.data as Record<string, unknown>;

  // Extract name from frontmatter or filename
  const name =
    (typeof data.name === "string" ? data.name : null) ??
    basename(filePath, ".md");

  // Description is required
  const description =
    typeof data.description === "string" ? data.description : "";

  // Parse tools (may be string or array)
  const tools = parseStringOrArray(data.tools);
  const disallowedTools = parseStringOrArray(data.disallowedTools);

  return {
    name,
    description,
    model: typeof data.model === "string" ? data.model : undefined,
    maxTurns: typeof data.maxTurns === "number" ? data.maxTurns : undefined,
    tools: tools.length > 0 ? tools : undefined,
    disallowedTools: disallowedTools.length > 0 ? disallowedTools : undefined,
    prompt: parsed.content.trim(),
    source,
    filePath,
  };
}

/**
 * Parse a value that might be a string (comma-separated) or an array.
 */
function parseStringOrArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String).map((s) => s.trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

/**
 * Read agent definitions from a directory.
 * Looks for .md files and parses each as an agent definition.
 */
async function readAgentsFromDir(
  dir: string,
  source: AgentSource
): Promise<AgentDefinitionSource[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const agents: AgentDefinitionSource[] = [];

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".md")) {
        const filePath = join(dir, entry.name);
        try {
          const content = await readFile(filePath, "utf-8");
          agents.push(parseAgentMarkdown(content, filePath, source));
        } catch {
          // Skip files that can't be read or parsed
        }
      }
    }

    return agents;
  } catch {
    // Directory doesn't exist or isn't readable
    return [];
  }
}

/**
 * Read agent definitions from all configured locations.
 */
export async function readAgentDefinitions(
  options?: ReadAgentOptions
): Promise<AgentDefinitionSource[]> {
  const agents: AgentDefinitionSource[] = [];

  // Read from project directory (.claude/agents/)
  if (options?.projectDir) {
    const projectAgentsDir = join(options.projectDir, ".claude", "agents");
    const projectAgents = await readAgentsFromDir(projectAgentsDir, "project");
    agents.push(...projectAgents);
  }

  // Read from user directory (~/.claude/agents/)
  const userDir = options?.userDir ?? join(homedir(), ".claude", "agents");
  const userAgents = await readAgentsFromDir(userDir, "user");
  agents.push(...userAgents);

  // Read from plugin directories
  if (options?.pluginDirs) {
    for (const pluginDir of options.pluginDirs) {
      const pluginAgents = await readAgentsFromDir(pluginDir, "plugin");
      agents.push(...pluginAgents);
    }
  }

  return agents;
}
