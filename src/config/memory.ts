/**
 * Memory reader.
 * Reads auto-memory files and project memory indexes from
 * Claude Code's memory directory structure.
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve, basename } from "node:path";
import { homedir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSafe } from "../utils/fs.js";

const execFileAsync = promisify(execFile);

/** Project memory information */
export interface MemoryInfo {
  projectKey: string;
  memoryDir: string;
  indexPath: string;
  indexContent: string;
  files: MemoryFileInfo[];
}

/** A single memory file */
export interface MemoryFileInfo {
  path: string;
  name: string;
  description: string;
  type: "user" | "feedback" | "project" | "reference";
  content: string;
  lastModified: number;
}

/**
 * Encode a project path to the key used by Claude Code.
 * Replaces / with - and prepends -.
 */
export function encodeProjectKey(projectPath: string): string {
  const absPath = resolve(projectPath);
  return "-" + absPath.slice(1).replace(/\//g, "-");
}

/**
 * Try to get the git root for a directory.
 */
async function getGitRoot(dir: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--show-toplevel"], {
      cwd: dir,
      timeout: 5000,
    });
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Read project memory for a given project directory.
 */
export async function readProjectMemory(
  projectDir?: string
): Promise<MemoryInfo> {
  const project = projectDir ?? process.cwd();
  const home = homedir();

  // Use git root if available, otherwise project dir
  const root = (await getGitRoot(project)) ?? project;
  const projectKey = encodeProjectKey(root);
  const memoryDir = join(home, ".claude", "projects", projectKey, "memory");
  const indexPath = join(memoryDir, "MEMORY.md");

  // Read index
  const indexContent = (await readFileSafe(indexPath)) ?? "";

  // Read topic files
  const files: MemoryFileInfo[] = [];

  try {
    const entries = await readdir(memoryDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".md") || entry.name === "MEMORY.md") {
        continue;
      }

      const filePath = join(memoryDir, entry.name);
      try {
        const content = await readFile(filePath, "utf-8");
        const fileStat = await stat(filePath);
        const name = basename(entry.name, ".md");

        // Try to determine type from frontmatter
        let type: MemoryFileInfo["type"] = "project";
        if (content.includes("type: user")) type = "user";
        else if (content.includes("type: feedback")) type = "feedback";
        else if (content.includes("type: reference")) type = "reference";

        // Extract description from frontmatter
        let description = "";
        const descMatch = content.match(/description:\s*(.+)/);
        if (descMatch) {
          description = descMatch[1].trim();
        }

        files.push({
          path: filePath,
          name,
          description,
          type,
          content,
          lastModified: fileStat.mtimeMs,
        });
      } catch {
        // Skip unreadable files
      }
    }
  } catch {
    // Directory doesn't exist or is empty
  }

  return {
    projectKey,
    memoryDir,
    indexPath,
    indexContent,
    files,
  };
}

/**
 * List all project memories (all projects that have memory directories).
 */
export async function listAllProjectMemories(): Promise<
  Array<{ projectKey: string; dir: string }>
> {
  const home = homedir();
  const projectsDir = join(home, ".claude", "projects");

  const results: Array<{ projectKey: string; dir: string }> = [];

  try {
    const entries = await readdir(projectsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const memoryDir = join(projectsDir, entry.name, "memory");
      try {
        await stat(memoryDir);
        results.push({
          projectKey: entry.name,
          dir: memoryDir,
        });
      } catch {
        // Directory doesn't exist, skip
      }
    }
  } catch {
    // Projects dir doesn't exist
  }

  return results;
}
