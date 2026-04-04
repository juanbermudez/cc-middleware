/**
 * Skills, agents, rules, and CLAUDE.md reader.
 * Discovers and reads all component markdown files from standard locations,
 * parsing YAML frontmatter with gray-matter.
 */

import { readFile, readdir, stat, writeFile, mkdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve, basename, dirname, relative } from "node:path";
import { homedir } from "node:os";
import matter from "gray-matter";

/** Skill information */
export interface SkillInfo {
  name: string;
  description: string;
  scope: "project" | "user" | "plugin";
  path: string;
  disableModelInvocation?: boolean;
  content: string;
}

/** Agent file information */
export interface AgentFileInfo {
  name: string;
  description: string;
  scope: "project" | "user" | "plugin";
  path: string;
  model?: string;
  maxTurns?: number;
  tools?: string[];
  disallowedTools?: string[];
  effort?: string;
  memory?: boolean | string;
  isolation?: string;
  permissionMode?: string;
  prompt: string;
}

/** Rule information */
export interface RuleInfo {
  path: string;
  scope: "project" | "user";
  paths?: string[];
  content: string;
}

/** CLAUDE.md file information */
export interface ClaudeMdInfo {
  path: string;
  scope: "user" | "project" | "project-local";
  content: string;
  imports: string[];
}

/** Recursively list markdown files in a directory */
async function listMarkdownFiles(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];

  const results: string[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        const nested = await listMarkdownFiles(fullPath);
        results.push(...nested);
      } else if (entry.name.endsWith(".md")) {
        results.push(fullPath);
      }
    }
  } catch {
    // Ignore read errors
  }
  return results;
}

/** List directories in a path */
async function listDirs(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => join(dir, e.name));
  } catch {
    return [];
  }
}

/** Read file content safely */
async function readFileSafe(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Discover all skills from standard locations.
 */
export async function discoverSkills(options?: {
  projectDir?: string;
}): Promise<SkillInfo[]> {
  const project = options?.projectDir ?? process.cwd();
  const home = homedir();
  const skills: SkillInfo[] = [];

  // User skills: ~/.claude/skills/*/SKILL.md
  const userSkillDirs = await listDirs(join(home, ".claude", "skills"));
  for (const dir of userSkillDirs) {
    const skillPath = join(dir, "SKILL.md");
    const content = await readFileSafe(skillPath);
    if (content) {
      const { data, content: body } = matter(content);
      skills.push({
        name: (data.name as string) ?? basename(dir),
        description: (data.description as string) ?? body.split("\n")[0] ?? "",
        scope: "user",
        path: skillPath,
        disableModelInvocation: data["disable-model-invocation"] as boolean | undefined,
        content: body,
      });
    }
  }

  // Project skills: <project>/.claude/skills/*/SKILL.md
  const projectSkillDirs = await listDirs(join(project, ".claude", "skills"));
  for (const dir of projectSkillDirs) {
    const skillPath = join(dir, "SKILL.md");
    const content = await readFileSafe(skillPath);
    if (content) {
      const { data, content: body } = matter(content);
      skills.push({
        name: (data.name as string) ?? basename(dir),
        description: (data.description as string) ?? body.split("\n")[0] ?? "",
        scope: "project",
        path: skillPath,
        disableModelInvocation: data["disable-model-invocation"] as boolean | undefined,
        content: body,
      });
    }
  }

  return skills;
}

/**
 * Discover all agents from standard locations.
 */
export async function discoverAgents(options?: {
  projectDir?: string;
}): Promise<AgentFileInfo[]> {
  const project = options?.projectDir ?? process.cwd();
  const home = homedir();
  const agents: AgentFileInfo[] = [];

  // User agents: ~/.claude/agents/*.md
  const userAgentFiles = await listMarkdownFiles(join(home, ".claude", "agents"));
  for (const filePath of userAgentFiles) {
    const agent = await parseAgentFile(filePath, "user");
    if (agent) agents.push(agent);
  }

  // Project agents: <project>/.claude/agents/*.md
  const projectAgentFiles = await listMarkdownFiles(join(project, ".claude", "agents"));
  for (const filePath of projectAgentFiles) {
    const agent = await parseAgentFile(filePath, "project");
    if (agent) agents.push(agent);
  }

  return agents;
}

/** Parse an agent markdown file */
async function parseAgentFile(
  filePath: string,
  scope: AgentFileInfo["scope"]
): Promise<AgentFileInfo | null> {
  const content = await readFileSafe(filePath);
  if (!content) return null;

  const { data, content: body } = matter(content);

  // Parse tools from CSV string
  const parseToolList = (val: unknown): string[] | undefined => {
    if (typeof val === "string") {
      return val.split(",").map((t) => t.trim()).filter(Boolean);
    }
    if (Array.isArray(val)) {
      return val.map(String);
    }
    return undefined;
  };

  return {
    name: (data.name as string) ?? basename(filePath, ".md"),
    description: (data.description as string) ?? "",
    scope,
    path: filePath,
    model: data.model as string | undefined,
    maxTurns: data.maxTurns as number | undefined,
    tools: parseToolList(data.tools),
    disallowedTools: parseToolList(data.disallowedTools),
    effort: data.effort as string | undefined,
    memory: data.memory as boolean | string | undefined,
    isolation: data.isolation as string | undefined,
    permissionMode: data.permissionMode as string | undefined,
    prompt: body,
  };
}

/**
 * Discover all rules from standard locations.
 */
export async function discoverRules(options?: {
  projectDir?: string;
}): Promise<RuleInfo[]> {
  const project = options?.projectDir ?? process.cwd();
  const home = homedir();
  const rules: RuleInfo[] = [];

  // User rules: ~/.claude/rules/*.md
  const userRuleFiles = await listMarkdownFiles(join(home, ".claude", "rules"));
  for (const filePath of userRuleFiles) {
    const content = await readFileSafe(filePath);
    if (content) {
      const { data, content: body } = matter(content);
      const paths = data.paths as string[] | undefined;
      rules.push({
        path: filePath,
        scope: "user",
        paths: Array.isArray(paths) ? paths : undefined,
        content: body,
      });
    }
  }

  // Project rules: <project>/.claude/rules/*.md
  const projectRuleFiles = await listMarkdownFiles(join(project, ".claude", "rules"));
  for (const filePath of projectRuleFiles) {
    const content = await readFileSafe(filePath);
    if (content) {
      const { data, content: body } = matter(content);
      const paths = data.paths as string[] | undefined;
      rules.push({
        path: filePath,
        scope: "project",
        paths: Array.isArray(paths) ? paths : undefined,
        content: body,
      });
    }
  }

  return rules;
}

/**
 * Discover all CLAUDE.md files.
 */
export async function discoverClaudeMd(options?: {
  projectDir?: string;
}): Promise<ClaudeMdInfo[]> {
  const project = options?.projectDir ?? process.cwd();
  const home = homedir();
  const files: ClaudeMdInfo[] = [];

  // User CLAUDE.md
  const userClaudeMd = join(home, ".claude", "CLAUDE.md");
  const userContent = await readFileSafe(userClaudeMd);
  if (userContent) {
    files.push({
      path: userClaudeMd,
      scope: "user",
      content: userContent,
      imports: extractImports(userContent),
    });
  }

  // Project CLAUDE.md (check both locations)
  for (const loc of [join(project, "CLAUDE.md"), join(project, ".claude", "CLAUDE.md")]) {
    const content = await readFileSafe(loc);
    if (content) {
      files.push({
        path: loc,
        scope: "project",
        content,
        imports: extractImports(content),
      });
      break; // Only include one project CLAUDE.md
    }
  }

  // Project local CLAUDE.md
  const localClaudeMd = join(project, "CLAUDE.local.md");
  const localContent = await readFileSafe(localClaudeMd);
  if (localContent) {
    files.push({
      path: localClaudeMd,
      scope: "project-local",
      content: localContent,
      imports: extractImports(localContent),
    });
  }

  return files;
}

/** Extract @import references from CLAUDE.md content */
function extractImports(content: string): string[] {
  const imports: string[] = [];
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("@") && !trimmed.startsWith("@import") && trimmed.length > 1) {
      // Lines like "@README.md" or "@docs/architecture.md"
      imports.push(trimmed.slice(1).trim());
    }
  }
  return imports;
}

/**
 * Create a new agent definition file.
 */
export async function createAgent(
  scope: "project" | "user",
  name: string,
  definition: {
    description: string;
    model?: string;
    prompt: string;
    tools?: string[];
    maxTurns?: number;
    effort?: string;
    [key: string]: unknown;
  },
  projectDir?: string
): Promise<string> {
  const project = projectDir ?? process.cwd();
  const home = homedir();

  const dir = scope === "user"
    ? join(home, ".claude", "agents")
    : join(project, ".claude", "agents");

  await mkdir(dir, { recursive: true });

  const filePath = join(dir, `${name}.md`);

  // Build frontmatter
  const frontmatter: Record<string, unknown> = {
    name,
    description: definition.description,
  };

  if (definition.model) frontmatter.model = definition.model;
  if (definition.tools) frontmatter.tools = definition.tools.join(", ");
  if (definition.maxTurns) frontmatter.maxTurns = definition.maxTurns;
  if (definition.effort) frontmatter.effort = definition.effort;

  const content = matter.stringify(definition.prompt, frontmatter);
  await writeFile(filePath, content, "utf-8");

  return filePath;
}

/**
 * Delete an agent definition file.
 */
export async function deleteAgent(path: string): Promise<void> {
  if (existsSync(path)) {
    await unlink(path);
  }
}

/**
 * Update an agent definition file.
 */
export async function updateAgent(
  path: string,
  changes: Partial<AgentFileInfo>
): Promise<void> {
  const content = await readFileSafe(path);
  if (!content) {
    throw new Error(`Agent file not found: ${path}`);
  }

  const { data, content: body } = matter(content);

  // Apply changes to frontmatter
  if (changes.name !== undefined) data.name = changes.name;
  if (changes.description !== undefined) data.description = changes.description;
  if (changes.model !== undefined) data.model = changes.model;
  if (changes.maxTurns !== undefined) data.maxTurns = changes.maxTurns;
  if (changes.tools !== undefined) data.tools = changes.tools.join(", ");
  if (changes.effort !== undefined) data.effort = changes.effort;

  const newBody = changes.prompt !== undefined ? changes.prompt : body;
  const updated = matter.stringify(newBody, data);
  await writeFile(path, updated, "utf-8");
}
