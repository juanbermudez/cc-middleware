/**
 * Shared helpers for resolving and scanning plugin component directories.
 * Supports manifest-declared component paths in addition to default locations.
 */

import { existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

export type PluginComponentKind = "skills" | "commands" | "agents";

function defaultPathsFor(kind: PluginComponentKind): string[] {
  switch (kind) {
    case "skills":
      return ["skills"];
    case "commands":
      return ["commands"];
    case "agents":
      return ["agents"];
  }
}

function normalizeConfiguredPaths(value: unknown): string[] {
  if (typeof value === "string" && value.trim()) {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.map(String).map((entry) => entry.trim()).filter(Boolean);
  }
  return [];
}

/**
 * Resolve candidate component paths for a plugin. Manifest paths are merged
 * with Claude Code's default auto-discovery directories.
 */
export function resolvePluginComponentPaths(
  pluginRoot: string,
  manifest: Record<string, unknown> | undefined,
  kind: PluginComponentKind
): string[] {
  const candidates = new Set<string>();

  for (const relPath of defaultPathsFor(kind)) {
    candidates.add(resolve(pluginRoot, relPath));
  }

  for (const relPath of normalizeConfiguredPaths(manifest?.[kind])) {
    candidates.add(resolve(pluginRoot, relPath));
  }

  return Array.from(candidates);
}

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
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        results.push(fullPath);
      }
    }
  } catch {
    // Ignore unreadable directories
  }

  return results;
}

async function resolveExistingFiles(paths: string[]): Promise<string[]> {
  const results: string[] = [];

  for (const candidate of paths) {
    try {
      const info = await stat(candidate);
      if (info.isDirectory()) {
        const nested = await listMarkdownFiles(candidate);
        results.push(...nested);
      } else if (info.isFile()) {
        results.push(candidate);
      }
    } catch {
      // Ignore missing component paths
    }
  }

  return Array.from(new Set(results));
}

/**
 * Find plugin skill entrypoints (`SKILL.md`) from default and manifest paths.
 */
export async function findPluginSkillFiles(
  pluginRoot: string,
  manifest?: Record<string, unknown>
): Promise<string[]> {
  const candidates = await resolveExistingFiles(
    resolvePluginComponentPaths(pluginRoot, manifest, "skills")
  );
  return candidates.filter((filePath) => basename(filePath) === "SKILL.md");
}

/**
 * Find plugin markdown component files (commands or agents) from default and
 * manifest paths.
 */
export async function findPluginMarkdownComponentFiles(
  pluginRoot: string,
  manifest: Record<string, unknown> | undefined,
  kind: "commands" | "agents"
): Promise<string[]> {
  const files = await resolveExistingFiles(
    resolvePluginComponentPaths(pluginRoot, manifest, kind)
  );
  return files.filter((filePath) => filePath.endsWith(".md"));
}
