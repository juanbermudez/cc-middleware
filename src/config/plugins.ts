/**
 * Plugin reader and management.
 * Reads installed plugins, their manifests, and enabled state.
 * Enables/disables via settings edits, installs/uninstalls via CLI.
 */

import { readFile } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readAllSettings } from "./settings.js";
import { updateSettings } from "./settings-writer.js";

const execFileAsync = promisify(execFile);

/** Information about an installed plugin */
export interface PluginInfo {
  name: string;
  scope: "user" | "project" | "local";
  marketplace: string;
  version: string;
  enabled: boolean;
  description?: string;
  author?: { name?: string; email?: string; url?: string };
  cachePath?: string;
  dataPath?: string;
  hasHooks: boolean;
  hasSkills: boolean;
  hasAgents: boolean;
  hasMcpServers: boolean;
  manifest?: Record<string, unknown>;
}

/** Raw installed plugins registry */
interface InstalledPluginsRegistry {
  version: number;
  plugins: Record<string, Array<{
    scope: string;
    projectPath?: string;
    installPath: string;
    version: string;
    installedAt: string;
    lastUpdated?: string;
    gitCommitSha?: string;
  }>>;
}

/** Get the installed plugins registry path */
function getInstalledPluginsPath(): string {
  return join(homedir(), ".claude", "plugins", "installed_plugins.json");
}

/** Get the plugins data directory */
function getPluginDataDir(): string {
  return join(homedir(), ".claude", "plugins", "data");
}

/** Read the installed plugins registry */
async function readInstalledPlugins(): Promise<InstalledPluginsRegistry> {
  const path = getInstalledPluginsPath();
  if (!existsSync(path)) {
    return { version: 2, plugins: {} };
  }
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as InstalledPluginsRegistry;
  } catch {
    return { version: 2, plugins: {} };
  }
}

/** Read a plugin manifest from its cache path */
async function readPluginManifest(
  cachePath: string
): Promise<Record<string, unknown> | undefined> {
  const manifestPath = join(cachePath, ".claude-plugin", "plugin.json");
  if (!existsSync(manifestPath)) return undefined;

  try {
    const raw = await readFile(manifestPath, "utf-8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/** Check if a directory contains specific plugin components */
function checkPluginComponents(cachePath: string): {
  hasHooks: boolean;
  hasSkills: boolean;
  hasAgents: boolean;
  hasMcpServers: boolean;
} {
  const absPath = resolve(cachePath);
  return {
    hasHooks: existsSync(join(absPath, "hooks")) || existsSync(join(absPath, "hooks.json")),
    hasSkills: existsSync(join(absPath, "skills")) || existsSync(join(absPath, "commands")),
    hasAgents: existsSync(join(absPath, "agents")),
    hasMcpServers: existsSync(join(absPath, ".mcp.json")),
  };
}

/**
 * List all installed plugins with their current enabled state.
 */
export async function listInstalledPlugins(projectDir?: string): Promise<PluginInfo[]> {
  const registry = await readInstalledPlugins();
  const settings = await readAllSettings(projectDir);

  // Collect enabledPlugins from all scopes
  const enabledMap = new Map<string, boolean>();

  for (const file of [settings.user, settings.project, settings.local]) {
    const enabled = file.content.enabledPlugins as Record<string, boolean> | undefined;
    if (enabled) {
      for (const [key, val] of Object.entries(enabled)) {
        enabledMap.set(key, val);
      }
    }
  }

  const plugins: PluginInfo[] = [];

  for (const [pluginKey, installs] of Object.entries(registry.plugins)) {
    // Parse "name@marketplace" format
    const atIdx = pluginKey.lastIndexOf("@");
    const name = atIdx > 0 ? pluginKey.slice(0, atIdx) : pluginKey;
    const marketplace = atIdx > 0 ? pluginKey.slice(atIdx + 1) : "unknown";

    for (const install of installs) {
      const cachePath = install.installPath;
      const manifest = await readPluginManifest(cachePath);
      const components = existsSync(cachePath) ? checkPluginComponents(cachePath) : {
        hasHooks: false,
        hasSkills: false,
        hasAgents: false,
        hasMcpServers: false,
      };

      const dataPath = join(getPluginDataDir(), pluginKey.replace(/[^a-zA-Z0-9-]/g, "-"));

      plugins.push({
        name,
        scope: (install.scope as PluginInfo["scope"]) ?? "user",
        marketplace,
        version: install.version,
        enabled: enabledMap.get(pluginKey) ?? false,
        description: manifest?.description as string | undefined,
        author: manifest?.author as PluginInfo["author"],
        cachePath,
        dataPath: existsSync(dataPath) ? dataPath : undefined,
        ...components,
        manifest,
      });
    }
  }

  return plugins;
}

/**
 * Get details for a specific plugin.
 */
export async function getPluginDetails(
  name: string,
  projectDir?: string
): Promise<PluginInfo | undefined> {
  const plugins = await listInstalledPlugins(projectDir);
  return plugins.find((p) => p.name === name);
}

/**
 * Check if a plugin is enabled.
 */
export async function isPluginEnabled(
  name: string,
  projectDir?: string
): Promise<boolean> {
  const plugin = await getPluginDetails(name, projectDir);
  return plugin?.enabled ?? false;
}

/**
 * Enable a plugin in a specific scope.
 */
export async function enablePlugin(
  name: string,
  marketplace: string,
  scope: "user" | "project" | "local",
  projectDir?: string
): Promise<void> {
  const key = `${name}@${marketplace}`;
  await updateSettings(
    {
      scope,
      path: ["enabledPlugins", key],
      operation: "set",
      value: true,
    },
    projectDir
  );
}

/**
 * Disable a plugin in a specific scope.
 */
export async function disablePlugin(
  name: string,
  marketplace: string,
  scope: "user" | "project" | "local",
  projectDir?: string
): Promise<void> {
  const key = `${name}@${marketplace}`;
  await updateSettings(
    {
      scope,
      path: ["enabledPlugins", key],
      operation: "set",
      value: false,
    },
    projectDir
  );
}

/**
 * Install a plugin via the claude CLI.
 */
export async function installPlugin(
  name: string,
  options?: { scope?: string; claudePath?: string }
): Promise<{ success: boolean; output: string }> {
  const claudePath = options?.claudePath ?? "claude";
  const args = ["plugin", "install", name];
  if (options?.scope) {
    args.push("-s", options.scope);
  }

  try {
    const { stdout, stderr } = await execFileAsync(claudePath, args, {
      timeout: 60000,
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
 * Uninstall a plugin via the claude CLI.
 */
export async function uninstallPlugin(
  name: string,
  options?: { scope?: string; keepData?: boolean; claudePath?: string }
): Promise<{ success: boolean; output: string }> {
  const claudePath = options?.claudePath ?? "claude";
  const args = ["plugin", "uninstall", name];
  if (options?.scope) {
    args.push("-s", options.scope);
  }
  if (options?.keepData) {
    args.push("--keep-data");
  }

  try {
    const { stdout, stderr } = await execFileAsync(claudePath, args, {
      timeout: 60000,
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
