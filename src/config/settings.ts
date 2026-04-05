/**
 * Settings reader.
 * Reads Claude Code settings from all scopes and merges with correct precedence.
 * Precedence: managed > local > project > user
 * Arrays (permissions.allow, etc.) are concatenated and deduplicated.
 */

import { stat as fsStat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { homedir, platform } from "node:os";
import { readFileSafe } from "../utils/fs.js";

/** A settings file with scope and content */
export interface SettingsFile {
  scope: "managed" | "user" | "project" | "local";
  path: string;
  exists: boolean;
  content: Record<string, unknown>;
  lastModified?: number;
}

/** Merged settings result */
export interface MergedSettings {
  settings: Record<string, unknown>;
  provenance: Record<string, "managed" | "user" | "project" | "local">;
  permissions: {
    allow: string[];
    deny: string[];
    ask: string[];
    defaultMode?: string;
    additionalDirectories?: string[];
    sources: Record<string, string>;
  };
}

/** Read a single settings file */
export async function readSettingsFile(
  path: string,
  scope: SettingsFile["scope"]
): Promise<SettingsFile> {
  const absPath = resolve(path);

  const content = await readFileSafe(absPath);
  if (!content) {
    return {
      scope,
      path: absPath,
      exists: false,
      content: {},
    };
  }

  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const fileStat = await fsStat(absPath);

    return {
      scope,
      path: absPath,
      exists: true,
      content: parsed,
      lastModified: fileStat.mtimeMs,
    };
  } catch {
    return {
      scope,
      path: absPath,
      exists: false,
      content: {},
    };
  }
}

/** Get managed settings path for this platform */
function getManagedSettingsPath(): string {
  const os = platform();
  if (os === "darwin") {
    return "/Library/Application Support/ClaudeCode/managed-settings.json";
  } else if (os === "win32") {
    return "C:\\Program Files\\ClaudeCode\\managed-settings.json";
  }
  return "/etc/claude-code/managed-settings.json";
}

/** Read all settings files for a given project directory */
export async function readAllSettings(projectDir?: string): Promise<{
  managed?: SettingsFile;
  user: SettingsFile;
  project: SettingsFile;
  local: SettingsFile;
}> {
  const home = homedir();
  const project = projectDir ?? process.cwd();

  const [managed, user, proj, local] = await Promise.all([
    readSettingsFile(getManagedSettingsPath(), "managed"),
    readSettingsFile(join(home, ".claude", "settings.json"), "user"),
    readSettingsFile(join(project, ".claude", "settings.json"), "project"),
    readSettingsFile(join(project, ".claude", "settings.local.json"), "local"),
  ]);

  return {
    managed: managed.exists ? managed : undefined,
    user,
    project: proj,
    local,
  };
}

/** Merge settings from all scopes with correct precedence */
export function mergeSettings(
  managed: SettingsFile | undefined,
  user: SettingsFile,
  project: SettingsFile,
  local: SettingsFile
): MergedSettings {
  const result: Record<string, unknown> = {};
  const provenance: Record<string, SettingsFile["scope"]> = {};

  // Scopes in order from lowest to highest precedence
  const scopes: Array<{ file: SettingsFile; name: SettingsFile["scope"] }> = [
    { file: user, name: "user" },
    { file: project, name: "project" },
    { file: local, name: "local" },
  ];

  if (managed) {
    scopes.push({ file: managed, name: "managed" });
  }

  // Merge scalar values (higher precedence wins)
  for (const { file, name } of scopes) {
    for (const [key, value] of Object.entries(file.content)) {
      if (key === "permissions") continue; // Handle separately
      if (key === "$schema") continue; // Skip schema references

      result[key] = value;
      provenance[key] = name;
    }
  }

  // Merge permissions (arrays concatenated and deduplicated)
  const permissions = mergePermissions(scopes);

  return {
    settings: result,
    provenance,
    permissions,
  };
}

/** Merge permission rules from all scopes */
function mergePermissions(
  scopes: Array<{ file: SettingsFile; name: SettingsFile["scope"] }>
): MergedSettings["permissions"] {
  const allow: string[] = [];
  const deny: string[] = [];
  const ask: string[] = [];
  const additionalDirs: string[] = [];
  const sources: Record<string, string> = {};
  let defaultMode: string | undefined;

  for (const { file, name } of scopes) {
    const perms = file.content.permissions as Record<string, unknown> | undefined;
    if (!perms) continue;

    // Merge array fields (concatenate and deduplicate)
    if (Array.isArray(perms.allow)) {
      for (const rule of perms.allow) {
        if (typeof rule === "string" && !allow.includes(rule)) {
          allow.push(rule);
          sources[`allow:${rule}`] = name;
        }
      }
    }

    if (Array.isArray(perms.deny)) {
      for (const rule of perms.deny) {
        if (typeof rule === "string" && !deny.includes(rule)) {
          deny.push(rule);
          sources[`deny:${rule}`] = name;
        }
      }
    }

    if (Array.isArray(perms.ask)) {
      for (const rule of perms.ask) {
        if (typeof rule === "string" && !ask.includes(rule)) {
          ask.push(rule);
          sources[`ask:${rule}`] = name;
        }
      }
    }

    if (Array.isArray(perms.additionalDirectories)) {
      for (const dir of perms.additionalDirectories) {
        if (typeof dir === "string" && !additionalDirs.includes(dir)) {
          additionalDirs.push(dir);
        }
      }
    }

    // Scalar fields: higher precedence wins
    if (typeof perms.defaultMode === "string") {
      defaultMode = perms.defaultMode;
    }
  }

  return {
    allow,
    deny,
    ask,
    defaultMode,
    additionalDirectories: additionalDirs.length > 0 ? additionalDirs : undefined,
    sources,
  };
}
