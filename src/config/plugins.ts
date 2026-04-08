/**
 * Plugin reader and management.
 * Reads installed plugins, their manifests, and enabled state.
 * Enables/disables via settings edits, installs/uninstalls via CLI.
 */

import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  findPluginMarkdownComponentFiles,
  findPluginSkillFiles,
} from "./plugin-components.js";
import { inspectClaudeRuntime } from "./runtime.js";
import { readAllSettings } from "./settings.js";
import { getSettingsPath, updateSettings } from "./settings-writer.js";
import { readJsonFileSafe } from "../utils/fs.js";

const execFileAsync = promisify(execFile);

/** Information about an installed plugin */
export interface PluginInfo {
  id: string;
  name: string;
  scope: "user" | "project" | "local";
  marketplace: string;
  version: string;
  enabled: boolean;
  installedAt?: string;
  lastUpdated?: string;
  gitCommitSha?: string;
  description?: string;
  author?: { name?: string; email?: string; url?: string };
  cachePath?: string;
  sourcePath?: string;
  dataPath?: string;
  hasCommands: boolean;
  hasHooks: boolean;
  hasSkills: boolean;
  hasAgents: boolean;
  hasMcpServers: boolean;
  commandCount?: number;
  skillCount?: number;
  agentCount?: number;
  blocked?: boolean;
  blockReason?: string;
  blockMessage?: string;
  marketplaceSource?: Record<string, unknown>;
  marketplaceInstallLocation?: string;
  manifest?: Record<string, unknown>;
}

export interface MarketplaceInfo {
  name: string;
  exists: boolean;
  installLocation?: string;
  lastUpdated?: string;
  source?: Record<string, unknown>;
  pluginCount: number;
  installedCount: number;
  blockedCount: number;
  pluginsPath?: string;
  externalPluginsPath?: string;
}

export interface MarketplacePluginInfo {
  id: string;
  name: string;
  marketplace: string;
  sourcePath: string;
  sourceType: "plugins" | "external_plugins";
  installed: boolean;
  enabled: boolean;
  installedScopes: PluginInfo["scope"][];
  installedVersions: string[];
  version?: string;
  description?: string;
  author?: { name?: string; email?: string; url?: string };
  hasCommands: boolean;
  hasHooks: boolean;
  hasSkills: boolean;
  hasAgents: boolean;
  hasMcpServers: boolean;
  commandCount?: number;
  skillCount?: number;
  agentCount?: number;
  blocked?: boolean;
  blockReason?: string;
  blockMessage?: string;
  manifest?: Record<string, unknown>;
}

export interface CliInstalledPluginInfo {
  id: string;
  version?: string;
  scope?: string;
  enabled?: boolean;
  installPath?: string;
  installedAt?: string;
  lastUpdated?: string;
  projectPath?: string;
  [key: string]: unknown;
}

export interface CliAvailablePluginInfo {
  pluginId: string;
  name?: string;
  description?: string;
  marketplaceName?: string;
  source?: unknown;
  version?: string;
  [key: string]: unknown;
}

export interface AvailablePluginCatalog {
  installed: CliInstalledPluginInfo[];
  available: CliAvailablePluginInfo[];
}

export interface PluginEnablementSource {
  scope: "user" | "project" | "local";
  settingsPath: string;
  exists: boolean;
  declared: boolean;
  value?: boolean;
}

export interface PluginProvenance {
  id: string;
  name: string;
  marketplace: string;
  installed: boolean;
  installedScopes: PluginInfo["scope"][];
  installedVersions: string[];
  enabled: boolean;
  enabledSourceScope?: PluginEnablementSource["scope"];
  enablementSources: PluginEnablementSource[];
  marketplaceKnown: boolean;
  marketplaceInstallLocation?: string;
  marketplaceAvailable: boolean;
  marketplaceSourceType?: MarketplacePluginInfo["sourceType"];
  catalogAvailable: boolean;
  blocked: boolean;
  blockReason?: string;
  blockMessage?: string;
  runtimeLoaded: boolean;
  runtimePlugin?: {
    name: string;
    path: string;
    source?: string;
  };
  runtimeInspectionError?: string;
  catalogError?: string;
  status:
    | "active"
    | "enabled_not_loaded"
    | "installed_disabled"
    | "available_not_installed"
    | "blocked";
  explanation: string;
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

interface KnownMarketplaceInfo {
  source?: Record<string, unknown>;
  installLocation?: string;
  lastUpdated?: string;
}

interface KnownMarketplacesRegistry {
  [marketplace: string]: KnownMarketplaceInfo;
}

interface PluginBlocklistEntry {
  plugin: string;
  added_at?: string;
  reason?: string;
  text?: string;
}

interface PluginBlocklist {
  fetchedAt?: string;
  plugins?: PluginBlocklistEntry[];
}

/** Get the installed plugins registry path */
function getInstalledPluginsPath(): string {
  return join(homedir(), ".claude", "plugins", "installed_plugins.json");
}

/** Get the plugins data directory */
function getPluginDataDir(): string {
  return join(homedir(), ".claude", "plugins", "data");
}

/** Get the marketplace registry path */
function getKnownMarketplacesPath(): string {
  return join(homedir(), ".claude", "plugins", "known_marketplaces.json");
}

/** Get the blocklist path */
function getPluginBlocklistPath(): string {
  return join(homedir(), ".claude", "plugins", "blocklist.json");
}

function parsePluginKey(pluginKey: string): { name: string; marketplace: string } {
  const atIdx = pluginKey.lastIndexOf("@");
  return {
    name: atIdx > 0 ? pluginKey.slice(0, atIdx) : pluginKey,
    marketplace: atIdx > 0 ? pluginKey.slice(atIdx + 1) : "unknown",
  };
}

function getMarketplaceComponentPaths(installLocation?: string): {
  pluginsPath?: string;
  externalPluginsPath?: string;
} {
  if (!installLocation) {
    return {};
  }

  const pluginsPath = join(installLocation, "plugins");
  const externalPluginsPath = join(installLocation, "external_plugins");

  return {
    pluginsPath: existsSync(pluginsPath) ? pluginsPath : undefined,
    externalPluginsPath: existsSync(externalPluginsPath) ? externalPluginsPath : undefined,
  };
}

function resolveMarketplacePluginSource(
  installLocation: string | undefined,
  pluginName: string
): { sourcePath: string; sourceType: "plugins" | "external_plugins" } | undefined {
  const paths = getMarketplaceComponentPaths(installLocation);

  if (paths.pluginsPath) {
    const sourcePath = join(paths.pluginsPath, pluginName);
    if (existsSync(sourcePath)) {
      return { sourcePath, sourceType: "plugins" };
    }
  }

  if (paths.externalPluginsPath) {
    const sourcePath = join(paths.externalPluginsPath, pluginName);
    if (existsSync(sourcePath)) {
      return { sourcePath, sourceType: "external_plugins" };
    }
  }

  return undefined;
}

async function listMarketplacePluginDirectories(
  installLocation?: string
): Promise<Array<{
  name: string;
  path: string;
  sourceType: "plugins" | "external_plugins";
}>> {
  const roots = getMarketplaceComponentPaths(installLocation);
  const results: Array<{
    name: string;
    path: string;
    sourceType: "plugins" | "external_plugins";
  }> = [];

  for (const [sourceType, rootPath] of [
    ["plugins", roots.pluginsPath],
    ["external_plugins", roots.externalPluginsPath],
  ] as const) {
    if (!rootPath) continue;

    try {
      const entries = await readdir(rootPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        results.push({
          name: entry.name,
          path: join(rootPath, entry.name),
          sourceType,
        });
      }
    } catch {
      // Ignore unreadable marketplace directories
    }
  }

  return results.sort((a, b) => a.name.localeCompare(b.name));
}

/** Read the installed plugins registry */
async function readInstalledPlugins(): Promise<InstalledPluginsRegistry> {
  const path = getInstalledPluginsPath();
  const data = await readJsonFileSafe(path);
  if (!data) return { version: 2, plugins: {} };
  return data as unknown as InstalledPluginsRegistry;
}

/** Read the known marketplaces registry */
async function readKnownMarketplaces(): Promise<KnownMarketplacesRegistry> {
  const data = await readJsonFileSafe(getKnownMarketplacesPath());
  if (!data) return {};
  return data as unknown as KnownMarketplacesRegistry;
}

/** Read the plugin blocklist */
async function readPluginBlocklist(): Promise<PluginBlocklist> {
  const data = await readJsonFileSafe(getPluginBlocklistPath());
  if (!data) return {};
  return data as unknown as PluginBlocklist;
}

function getClaudePath(override?: string): string {
  return override ?? process.env.CLAUDE_PATH ?? "claude";
}

function matchesPluginIdentifier(
  identifier: string,
  plugin: { id: string; name: string; marketplace?: string }
): boolean {
  return plugin.id === identifier
    || plugin.name === identifier
    || `${plugin.name}@${plugin.marketplace ?? "unknown"}` === identifier;
}

function describePluginProvenance(input: {
  blocked: boolean;
  installed: boolean;
  enabled: boolean;
  runtimeLoaded: boolean;
  marketplaceAvailable: boolean;
  catalogAvailable: boolean;
}): Pick<PluginProvenance, "status" | "explanation"> {
  if (input.blocked) {
    return {
      status: "blocked",
      explanation: "Claude currently blocklists this plugin, so it should not be treated as activatable.",
    };
  }

  if (input.runtimeLoaded) {
    return {
      status: "active",
      explanation: "The plugin is installed, enabled, and currently loaded in Claude's runtime for this project.",
    };
  }

  if (input.installed && input.enabled) {
    return {
      status: "enabled_not_loaded",
      explanation: "The plugin is installed and enabled in settings, but it is not currently loaded in Claude's runtime for this project.",
    };
  }

  if (input.installed) {
    return {
      status: "installed_disabled",
      explanation: "The plugin is installed, but enabledPlugins does not currently enable it in the active settings precedence chain.",
    };
  }

  return {
    status: "available_not_installed",
    explanation: input.catalogAvailable || input.marketplaceAvailable
      ? "The plugin is available from Claude's catalog or a configured marketplace, but it is not installed."
      : "The plugin could be resolved by name, but it is not currently installed.",
  };
}

async function runClaudeCommand(
  args: string[],
  options?: { claudePath?: string; timeoutMs?: number }
): Promise<{ success: boolean; stdout: string; stderr: string; output: string }> {
  const claudePath = getClaudePath(options?.claudePath);

  try {
    const { stdout, stderr } = await execFileAsync(claudePath, args, {
      timeout: options?.timeoutMs ?? 60000,
    });
    return {
      success: true,
      stdout,
      stderr,
      output: stdout + stderr,
    };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    const stdout = err.stdout ?? "";
    const stderr = err.stderr ?? err.message ?? "";
    return {
      success: false,
      stdout,
      stderr,
      output: stdout + stderr,
    };
  }
}

/** Read a plugin manifest from its cache path */
async function readPluginManifest(
  cachePath: string
): Promise<Record<string, unknown> | undefined> {
  const manifestPath = join(cachePath, ".claude-plugin", "plugin.json");
  const data = await readJsonFileSafe(manifestPath);
  return data ?? undefined;
}

/** Check if a directory contains specific plugin components */
async function checkPluginComponents(
  cachePath: string,
  manifest?: Record<string, unknown>
): Promise<{
  hasCommands: boolean;
  hasHooks: boolean;
  hasSkills: boolean;
  hasAgents: boolean;
  hasMcpServers: boolean;
  commandCount: number;
  skillCount: number;
  agentCount: number;
}> {
  const absPath = resolve(cachePath);
  const [commandFiles, skillFiles, agentFiles] = await Promise.all([
    findPluginMarkdownComponentFiles(absPath, manifest, "commands"),
    findPluginSkillFiles(absPath, manifest),
    findPluginMarkdownComponentFiles(absPath, manifest, "agents"),
  ]);

  const hookPaths = [
    join(absPath, "hooks"),
    join(absPath, "hooks.json"),
  ];

  const manifestHooks = manifest?.hooks;
  const customHookPaths = typeof manifestHooks === "string"
    ? [resolve(absPath, manifestHooks)]
    : Array.isArray(manifestHooks)
      ? manifestHooks.map(String).map((entry) => resolve(absPath, entry))
      : [];
  const hasInlineHooks = Boolean(
    manifestHooks && typeof manifestHooks === "object" && !Array.isArray(manifestHooks)
  );

  const manifestMcp = manifest?.mcpServers;
  const customMcpPaths = typeof manifestMcp === "string"
    ? [resolve(absPath, manifestMcp)]
    : Array.isArray(manifestMcp)
      ? manifestMcp.map(String).map((entry) => resolve(absPath, entry))
      : [];
  const hasInlineMcpServers = Boolean(
    manifestMcp && typeof manifestMcp === "object" && !Array.isArray(manifestMcp)
  );

  return {
    hasCommands: commandFiles.length > 0,
    hasHooks: hasInlineHooks || [...hookPaths.slice(0, 2), ...customHookPaths].some((candidate) => candidate && existsSync(candidate)),
    hasSkills: skillFiles.length > 0,
    hasAgents: agentFiles.length > 0,
    hasMcpServers: hasInlineMcpServers
      || existsSync(join(absPath, ".mcp.json"))
      || customMcpPaths.some((candidate) => candidate && existsSync(candidate)),
    commandCount: commandFiles.length,
    skillCount: skillFiles.length,
    agentCount: agentFiles.length,
  };
}

/**
 * List all installed plugins with their current enabled state.
 */
export async function listInstalledPlugins(projectDir?: string): Promise<PluginInfo[]> {
  const registry = await readInstalledPlugins();
  const settings = await readAllSettings(projectDir);
  const knownMarketplaces = await readKnownMarketplaces();
  const blocklist = await readPluginBlocklist();
  const blockedPlugins = new Map(
    (blocklist.plugins ?? []).map((entry) => [entry.plugin, entry])
  );

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
    const { name, marketplace } = parsePluginKey(pluginKey);

    for (const install of installs) {
      const cachePath = install.installPath;
      const manifest = await readPluginManifest(cachePath);
      const components = existsSync(cachePath) ? await checkPluginComponents(cachePath, manifest) : {
        hasCommands: false,
        hasHooks: false,
        hasSkills: false,
        hasAgents: false,
        hasMcpServers: false,
        commandCount: 0,
        skillCount: 0,
        agentCount: 0,
      };

      const dataPath = join(getPluginDataDir(), pluginKey.replace(/[^a-zA-Z0-9-]/g, "-"));
      const marketplaceInfo = knownMarketplaces[marketplace];
      const blocked = blockedPlugins.get(pluginKey);
      const source = resolveMarketplacePluginSource(marketplaceInfo?.installLocation, name);

      plugins.push({
        id: pluginKey,
        name,
        scope: (install.scope as PluginInfo["scope"]) ?? "user",
        marketplace,
        version: install.version,
        enabled: enabledMap.get(pluginKey) ?? false,
        installedAt: install.installedAt,
        lastUpdated: install.lastUpdated,
        gitCommitSha: install.gitCommitSha,
        description: manifest?.description as string | undefined,
        author: manifest?.author as PluginInfo["author"],
        cachePath,
        sourcePath: source?.sourcePath,
        dataPath: existsSync(dataPath) ? dataPath : undefined,
        blocked: Boolean(blocked),
        blockReason: blocked?.reason,
        blockMessage: blocked?.text,
        marketplaceSource: marketplaceInfo?.source,
        marketplaceInstallLocation: marketplaceInfo?.installLocation,
        ...components,
        manifest,
      });
    }
  }

  return plugins;
}

/**
 * List configured Claude Code marketplaces with installed and blocked counts.
 */
export async function listKnownMarketplaces(
  projectDir?: string
): Promise<MarketplaceInfo[]> {
  const knownMarketplaces = await readKnownMarketplaces();
  const installedPlugins = await listInstalledPlugins(projectDir);
  const blocklist = await readPluginBlocklist();

  return Promise.all(
    Object.entries(knownMarketplaces)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(async ([name, info]) => {
        const dirs = await listMarketplacePluginDirectories(info.installLocation);
        const blockedCount = (blocklist.plugins ?? []).filter((entry) => {
          const parsed = parsePluginKey(entry.plugin);
          return parsed.marketplace === name;
        }).length;
        const componentPaths = getMarketplaceComponentPaths(info.installLocation);

        return {
          name,
          exists: Boolean(info.installLocation && existsSync(info.installLocation)),
          installLocation: info.installLocation,
          lastUpdated: info.lastUpdated,
          source: info.source,
          pluginCount: dirs.length,
          installedCount: installedPlugins.filter((plugin) => plugin.marketplace === name).length,
          blockedCount,
          pluginsPath: componentPaths.pluginsPath,
          externalPluginsPath: componentPaths.externalPluginsPath,
        };
      })
  );
}

/**
 * List available plugins inside one marketplace, whether or not they are installed.
 */
export async function listMarketplacePlugins(
  marketplace: string,
  projectDir?: string
): Promise<MarketplacePluginInfo[]> {
  const knownMarketplaces = await readKnownMarketplaces();
  const marketplaceInfo = knownMarketplaces[marketplace];
  if (!marketplaceInfo?.installLocation) {
    return [];
  }

  const [directories, installedPlugins, blocklist] = await Promise.all([
    listMarketplacePluginDirectories(marketplaceInfo.installLocation),
    listInstalledPlugins(projectDir),
    readPluginBlocklist(),
  ]);

  const blockedPlugins = new Map(
    (blocklist.plugins ?? []).map((entry) => [entry.plugin, entry])
  );

  return Promise.all(
    directories.map(async ({ name, path, sourceType }) => {
      const manifest = await readPluginManifest(path);
      const components = await checkPluginComponents(path, manifest);
      const id = `${name}@${marketplace}`;
      const installs = installedPlugins.filter((plugin) => plugin.id === id);
      const blocked = blockedPlugins.get(id);

      return {
        id,
        name,
        marketplace,
        sourcePath: path,
        sourceType,
        installed: installs.length > 0,
        enabled: installs.some((plugin) => plugin.enabled),
        installedScopes: Array.from(new Set(installs.map((plugin) => plugin.scope))),
        installedVersions: Array.from(new Set(installs.map((plugin) => plugin.version))),
        version: (manifest?.version as string | undefined) ?? installs[0]?.version,
        description: manifest?.description as string | undefined,
        author: manifest?.author as MarketplacePluginInfo["author"],
        blocked: Boolean(blocked),
        blockReason: blocked?.reason,
        blockMessage: blocked?.text,
        manifest,
        ...components,
      };
    })
  );
}

/**
 * Get details for a specific plugin.
 */
export async function getPluginDetails(
  name: string,
  projectDir?: string
): Promise<PluginInfo | undefined> {
  const plugins = await listInstalledPlugins(projectDir);
  return plugins.find((p) => matchesPluginIdentifier(name, p));
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
 * Explain where a plugin comes from, how it is enabled, and whether Claude has
 * actually loaded it for the current project.
 */
export async function getPluginProvenance(
  identifier: string,
  projectDir?: string
): Promise<PluginProvenance | null> {
  const [installedPlugins, settings, marketplaces] = await Promise.all([
    listInstalledPlugins(projectDir),
    readAllSettings(projectDir),
    listKnownMarketplaces(projectDir),
  ]);

  let installedMatches = installedPlugins.filter((plugin) => matchesPluginIdentifier(identifier, plugin));
  let pluginName: string | undefined;
  let marketplaceName: string | undefined;

  if (installedMatches.length > 0) {
    pluginName = installedMatches[0].name;
    marketplaceName = installedMatches[0].marketplace;
  } else if (identifier.includes("@")) {
    const parsed = parsePluginKey(identifier);
    pluginName = parsed.name;
    marketplaceName = parsed.marketplace;
  } else {
    for (const marketplace of marketplaces) {
      const plugins = await listMarketplacePlugins(marketplace.name, projectDir);
      const match = plugins.find((plugin) => matchesPluginIdentifier(identifier, plugin));
      if (match) {
        pluginName = match.name;
        marketplaceName = match.marketplace;
        break;
      }
    }
  }

  if (!pluginName || !marketplaceName) {
    return null;
  }

  const pluginId = `${pluginName}@${marketplaceName}`;
  if (installedMatches.length === 0) {
    installedMatches = installedPlugins.filter((plugin) => plugin.id === pluginId);
  }

  const marketplace = marketplaces.find((entry) => entry.name === marketplaceName);
  const marketplacePlugins = marketplace
    ? await listMarketplacePlugins(marketplace.name, projectDir)
    : [];
  const marketplacePlugin = marketplacePlugins.find((plugin) => plugin.id === pluginId);

  const enablementSources = (["user", "project", "local"] as const).map((scope) => {
    const file = settings[scope];
    const enabledMap = file.content.enabledPlugins as Record<string, unknown> | undefined;
    const declared = Boolean(
      enabledMap && Object.prototype.hasOwnProperty.call(enabledMap, pluginId)
    );
    const rawValue = declared ? enabledMap?.[pluginId] : undefined;

    return {
      scope,
      settingsPath: file.path || getSettingsPath(scope, projectDir),
      exists: file.exists,
      declared,
      value: typeof rawValue === "boolean" ? rawValue : undefined,
    } satisfies PluginEnablementSource;
  });

  let enabled = false;
  let enabledSourceScope: PluginEnablementSource["scope"] | undefined;
  for (const source of enablementSources) {
    if (source.declared && typeof source.value === "boolean") {
      enabled = source.value;
      enabledSourceScope = source.scope;
    }
  }

  let catalogAvailable = false;
  let catalogError: string | undefined;
  try {
    const catalog = await listAvailablePluginsViaCli();
    catalogAvailable = catalog.available.some((plugin) => {
      const market = plugin.marketplaceName ?? marketplaceName;
      return plugin.pluginId === pluginId
        || (plugin.name === pluginName && market === marketplaceName);
    });
  } catch (error) {
    catalogError = error instanceof Error ? error.message : String(error);
  }

  let runtimePlugin: PluginProvenance["runtimePlugin"] | undefined;
  let runtimeInspectionError: string | undefined;
  try {
    const runtime = await inspectClaudeRuntime({ projectDir });
    const match = runtime.plugins.find((plugin) => plugin.name === pluginName || plugin.name === pluginId);
    if (match) {
      runtimePlugin = {
        name: match.name,
        path: match.path,
        source: match.source,
      };
    }
  } catch (error) {
    runtimeInspectionError = error instanceof Error ? error.message : String(error);
  }

  const blocked = Boolean(
    installedMatches.some((plugin) => plugin.blocked)
    || marketplacePlugin?.blocked
  );
  const blockReason = installedMatches.find((plugin) => plugin.blockReason)?.blockReason
    ?? marketplacePlugin?.blockReason;
  const blockMessage = installedMatches.find((plugin) => plugin.blockMessage)?.blockMessage
    ?? marketplacePlugin?.blockMessage;

  const status = describePluginProvenance({
    blocked,
    installed: installedMatches.length > 0,
    enabled,
    runtimeLoaded: Boolean(runtimePlugin),
    marketplaceAvailable: Boolean(marketplacePlugin),
    catalogAvailable,
  });

  return {
    id: pluginId,
    name: pluginName,
    marketplace: marketplaceName,
    installed: installedMatches.length > 0,
    installedScopes: Array.from(new Set(installedMatches.map((plugin) => plugin.scope))),
    installedVersions: Array.from(new Set(installedMatches.map((plugin) => plugin.version))),
    enabled,
    enabledSourceScope,
    enablementSources,
    marketplaceKnown: Boolean(marketplace),
    marketplaceInstallLocation: marketplace?.installLocation,
    marketplaceAvailable: Boolean(marketplacePlugin),
    marketplaceSourceType: marketplacePlugin?.sourceType,
    catalogAvailable,
    blocked,
    blockReason,
    blockMessage,
    runtimeLoaded: Boolean(runtimePlugin),
    runtimePlugin,
    runtimeInspectionError,
    catalogError,
    status: status.status,
    explanation: status.explanation,
  };
}

/**
 * Ask Claude Code's CLI for the installable plugin catalog from configured
 * marketplaces. This can differ from raw marketplace directory scans.
 */
export async function listAvailablePluginsViaCli(
  options?: { claudePath?: string }
): Promise<AvailablePluginCatalog> {
  const result = await runClaudeCommand(
    ["plugin", "list", "--json", "--available"],
    options
  );

  if (!result.success) {
    throw new Error(result.output || "Failed to list available plugins");
  }

  const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
  const installed = Array.isArray(parsed.installed)
    ? parsed.installed as CliInstalledPluginInfo[]
    : [];
  const available = Array.isArray(parsed.available)
    ? parsed.available as CliAvailablePluginInfo[]
    : [];

  return { installed, available };
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
  const args = ["plugin", "install", name];
  if (options?.scope) {
    args.push("-s", options.scope);
  }
  const result = await runClaudeCommand(args, options);
  return { success: result.success, output: result.output };
}

/**
 * Update a plugin via the claude CLI.
 */
export async function updatePlugin(
  name: string,
  options?: { scope?: string; claudePath?: string }
): Promise<{ success: boolean; output: string }> {
  const args = ["plugin", "update", name];
  if (options?.scope) {
    args.push("-s", options.scope);
  }
  const result = await runClaudeCommand(args, options);
  return { success: result.success, output: result.output };
}

/**
 * Uninstall a plugin via the claude CLI.
 */
export async function uninstallPlugin(
  name: string,
  options?: { scope?: string; keepData?: boolean; claudePath?: string }
): Promise<{ success: boolean; output: string }> {
  const args = ["plugin", "uninstall", name];
  if (options?.scope) {
    args.push("-s", options.scope);
  }
  if (options?.keepData) {
    args.push("--keep-data");
  }
  const result = await runClaudeCommand(args, options);
  return { success: result.success, output: result.output };
}

/**
 * Add a marketplace via the claude CLI.
 */
export async function addMarketplace(
  source: string,
  options?: { scope?: "user" | "project" | "local"; sparse?: string[]; claudePath?: string }
): Promise<{ success: boolean; output: string }> {
  const args = ["plugin", "marketplace", "add", source];
  if (options?.scope) {
    args.push("--scope", options.scope);
  }
  if (options?.sparse?.length) {
    args.push("--sparse", ...options.sparse);
  }
  const result = await runClaudeCommand(args, options);
  return { success: result.success, output: result.output };
}

/**
 * Remove a marketplace via the claude CLI.
 */
export async function removeMarketplace(
  name: string,
  options?: { claudePath?: string }
): Promise<{ success: boolean; output: string }> {
  const result = await runClaudeCommand(
    ["plugin", "marketplace", "remove", name],
    options
  );
  return { success: result.success, output: result.output };
}

/**
 * Update one or all marketplaces via the claude CLI.
 */
export async function updateMarketplace(
  name?: string,
  options?: { claudePath?: string }
): Promise<{ success: boolean; output: string }> {
  const args = ["plugin", "marketplace", "update"];
  if (name) {
    args.push(name);
  }
  const result = await runClaudeCommand(args, options);
  return { success: result.success, output: result.output };
}
