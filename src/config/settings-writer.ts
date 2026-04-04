/**
 * Settings writer.
 * Provides atomic writes to settings files with support for
 * individual key updates, permission rule management, and scope validation.
 */

import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";

/** A settings update operation */
export interface SettingsUpdate {
  scope: "user" | "project" | "local";
  path: string[];
  operation: "set" | "append" | "remove" | "delete";
  value?: unknown;
}

/** Get the file path for a settings scope */
export function getSettingsPath(
  scope: "user" | "project" | "local",
  projectDir?: string
): string {
  const project = projectDir ?? process.cwd();

  switch (scope) {
    case "user":
      return join(homedir(), ".claude", "settings.json");
    case "project":
      return join(project, ".claude", "settings.json");
    case "local":
      return join(project, ".claude", "settings.local.json");
  }
}

/** Read a settings file, returning empty object if it doesn't exist */
async function readSettings(path: string): Promise<Record<string, unknown>> {
  const absPath = resolve(path);
  if (!existsSync(absPath)) {
    return {};
  }
  try {
    const raw = await readFile(absPath, "utf-8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Write settings atomically (write to temp, then rename) */
async function writeSettingsAtomic(
  path: string,
  content: Record<string, unknown>
): Promise<void> {
  const absPath = resolve(path);
  const dir = dirname(absPath);

  // Ensure directory exists
  await mkdir(dir, { recursive: true });

  // Write to temp file first
  const tmpPath = absPath + `.tmp-${randomBytes(4).toString("hex")}`;
  await writeFile(tmpPath, JSON.stringify(content, null, 2) + "\n", "utf-8");

  // Atomic rename
  await rename(tmpPath, absPath);
}

/** Get a nested value from an object by path */
function getNestedValue(obj: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = obj;
  for (const key of path) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/** Set a nested value on an object by path */
function setNestedValue(obj: Record<string, unknown>, path: string[], value: unknown): void {
  let current = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (!(key in current) || typeof current[key] !== "object" || current[key] === null) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  const lastKey = path[path.length - 1];
  current[lastKey] = value;
}

/** Delete a nested key from an object by path */
function deleteNestedValue(obj: Record<string, unknown>, path: string[]): void {
  let current = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (!(key in current) || typeof current[key] !== "object" || current[key] === null) {
      return;
    }
    current = current[key] as Record<string, unknown>;
  }
  const lastKey = path[path.length - 1];
  delete current[lastKey];
}

/**
 * Apply an update to a settings file.
 * Returns the before and after values for audit trail.
 */
export async function updateSettings(
  update: SettingsUpdate,
  projectDir?: string
): Promise<{ before: unknown; after: unknown }> {
  if (update.scope === "managed" as string) {
    throw new Error("Cannot write to managed settings scope");
  }

  const filePath = getSettingsPath(update.scope, projectDir);
  const content = await readSettings(filePath);
  const before = getNestedValue(content, update.path);

  switch (update.operation) {
    case "set":
      setNestedValue(content, update.path, update.value);
      break;

    case "append": {
      const existing = getNestedValue(content, update.path);
      if (Array.isArray(existing)) {
        if (!existing.includes(update.value)) {
          existing.push(update.value);
        }
      } else {
        setNestedValue(content, update.path, [update.value]);
      }
      break;
    }

    case "remove": {
      const arr = getNestedValue(content, update.path);
      if (Array.isArray(arr)) {
        const idx = arr.indexOf(update.value);
        if (idx !== -1) {
          arr.splice(idx, 1);
        }
      }
      break;
    }

    case "delete":
      deleteNestedValue(content, update.path);
      break;
  }

  await writeSettingsAtomic(filePath, content);
  const after = getNestedValue(content, update.path);

  return { before, after };
}

/**
 * Add a permission rule to a settings file.
 */
export async function addPermissionRule(
  scope: "user" | "project" | "local",
  rule: string,
  behavior: "allow" | "deny" | "ask",
  projectDir?: string
): Promise<void> {
  await updateSettings(
    {
      scope,
      path: ["permissions", behavior],
      operation: "append",
      value: rule,
    },
    projectDir
  );
}

/**
 * Remove a permission rule from a settings file.
 */
export async function removePermissionRule(
  scope: "user" | "project" | "local",
  rule: string,
  behavior: "allow" | "deny" | "ask",
  projectDir?: string
): Promise<void> {
  await updateSettings(
    {
      scope,
      path: ["permissions", behavior],
      operation: "remove",
      value: rule,
    },
    projectDir
  );
}

/**
 * Set a setting value using dot-notation key.
 */
export async function setSettingValue(
  scope: "user" | "project" | "local",
  key: string,
  value: unknown,
  projectDir?: string
): Promise<void> {
  const path = key.split(".");
  await updateSettings(
    {
      scope,
      path,
      operation: "set",
      value,
    },
    projectDir
  );
}
