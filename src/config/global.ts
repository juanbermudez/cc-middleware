/**
 * Sanitized reader for Claude Code's ~/.claude.json global state.
 * Exposes safe preferences and project summaries while avoiding auth/session
 * secrets and internal caches.
 */

import { join, resolve, dirname } from "node:path";
import { homedir } from "node:os";
import { existsSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { readFileSafe, readJsonFileSafe } from "../utils/fs.js";

const GLOBAL_STATS_KEYS = [
  "numStartups",
  "installMethod",
  "autoUpdates",
  "hasCompletedOnboarding",
  "lastOnboardingVersion",
  "lastReleaseNotesSeen",
  "hasSeenTasksHint",
  "promptQueueUseCount",
] as const;

const GLOBAL_PREFERENCE_KEYS = [
  "autoConnectIde",
  "autoInstallIdeExtension",
  "editorMode",
  "showTurnDuration",
  "terminalProgressBarEnabled",
  "teammateMode",
] as const;

export type GlobalPreferenceKey = typeof GLOBAL_PREFERENCE_KEYS[number];

export interface GlobalPreferenceDefinition {
  key: GlobalPreferenceKey;
  valueType: "boolean" | "string" | "boolean|string";
  description: string;
}

const GLOBAL_PREFERENCE_DEFINITIONS: Record<GlobalPreferenceKey, GlobalPreferenceDefinition> = {
  autoConnectIde: {
    key: "autoConnectIde",
    valueType: "boolean",
    description: "Automatically connect Claude Code to your IDE when available.",
  },
  autoInstallIdeExtension: {
    key: "autoInstallIdeExtension",
    valueType: "boolean",
    description: "Automatically install Claude's IDE extension when supported.",
  },
  editorMode: {
    key: "editorMode",
    valueType: "string",
    description: "Preferred editor interaction mode.",
  },
  showTurnDuration: {
    key: "showTurnDuration",
    valueType: "boolean",
    description: "Show per-turn duration information in Claude Code.",
  },
  terminalProgressBarEnabled: {
    key: "terminalProgressBarEnabled",
    valueType: "boolean",
    description: "Show Claude Code's terminal progress bar.",
  },
  teammateMode: {
    key: "teammateMode",
    valueType: "boolean|string",
    description: "Control teammate mode behavior in Claude Code.",
  },
};

const PROJECT_METRIC_KEYS = [
  "lastCost",
  "lastAPIDuration",
  "lastAPIDurationWithoutRetries",
  "lastToolDuration",
  "lastDuration",
  "lastLinesAdded",
  "lastLinesRemoved",
  "lastTotalInputTokens",
  "lastTotalOutputTokens",
  "lastTotalCacheCreationInputTokens",
  "lastTotalCacheReadInputTokens",
  "lastTotalWebSearchRequests",
  "lastModelUsage",
  "lastSessionId",
] as const;

type GlobalConfigData = Record<string, unknown>;
type ProjectConfigData = Record<string, unknown>;

export interface GlobalConfigSummary {
  path: string;
  exists: boolean;
  stats: Record<string, string | number | boolean>;
  preferences: Record<string, string | number | boolean>;
  writablePreferences: GlobalPreferenceDefinition[];
  featureFlagCount: number;
  userMcpCount: number;
  trackedProjectCount: number;
}

export interface TrackedProjectSummary {
  path: string;
  exists: boolean;
  allowedTools: string[];
  allowedToolsCount: number;
  mcpServerNames: string[];
  localMcpCount: number;
  enabledMcpjsonServers: string[];
  disabledMcpjsonServers: string[];
  hasTrustDialogAccepted?: boolean;
  hasClaudeMdExternalIncludesApproved?: boolean;
  hasClaudeMdExternalIncludesWarningShown?: boolean;
  projectOnboardingSeenCount?: number;
  metrics: Record<string, unknown>;
}

function getGlobalConfigPath(): string {
  return join(homedir(), ".claude.json");
}

async function readGlobalConfigData(): Promise<GlobalConfigData | null> {
  return readJsonFileSafe(getGlobalConfigPath());
}

async function readWritableGlobalConfigData(): Promise<GlobalConfigData> {
  const path = getGlobalConfigPath();
  const content = await readFileSafe(path);
  if (!content) {
    return {};
  }

  try {
    return JSON.parse(content) as GlobalConfigData;
  } catch {
    throw new Error(`Invalid JSON in ${path}`);
  }
}

async function writeGlobalConfigData(content: GlobalConfigData): Promise<void> {
  const path = getGlobalConfigPath();
  const dir = dirname(path);
  const tmpPath = `${path}.tmp-${randomBytes(4).toString("hex")}`;

  await mkdir(dir, { recursive: true });
  await writeFile(tmpPath, JSON.stringify(content, null, 2) + "\n", "utf-8");
  await rename(tmpPath, path);
}

function pickScalarValues<T extends readonly string[]>(
  data: GlobalConfigData,
  keys: T
): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};
  for (const key of keys) {
    const value = data[key];
    if (
      typeof value === "string"
      || typeof value === "number"
      || typeof value === "boolean"
    ) {
      result[key] = value;
    }
  }
  return result;
}

function isGlobalPreferenceKey(key: string): key is GlobalPreferenceKey {
  return GLOBAL_PREFERENCE_KEYS.includes(key as GlobalPreferenceKey);
}

function normalizeGlobalPreferenceValue(
  key: GlobalPreferenceKey,
  value: unknown
): string | boolean {
  const definition = GLOBAL_PREFERENCE_DEFINITIONS[key];

  switch (definition.valueType) {
    case "boolean":
      if (typeof value !== "boolean") {
        throw new Error(`Global preference ${key} must be a boolean`);
      }
      return value;
    case "string":
      if (typeof value !== "string") {
        throw new Error(`Global preference ${key} must be a string`);
      }
      return value;
    case "boolean|string":
      if (typeof value !== "boolean" && typeof value !== "string") {
        throw new Error(`Global preference ${key} must be a boolean or string`);
      }
      return value;
  }
}

export function listWritableGlobalPreferences(): GlobalPreferenceDefinition[] {
  return GLOBAL_PREFERENCE_KEYS.map((key) => GLOBAL_PREFERENCE_DEFINITIONS[key]);
}

function summarizeProject(path: string, project: ProjectConfigData): TrackedProjectSummary {
  const allowedTools = Array.isArray(project.allowedTools)
    ? project.allowedTools.map(String)
    : [];
  const mcpServers = project.mcpServers && typeof project.mcpServers === "object"
    ? (project.mcpServers as Record<string, unknown>)
    : {};
  const enabledMcpjsonServers = Array.isArray(project.enabledMcpjsonServers)
    ? project.enabledMcpjsonServers.map(String)
    : [];
  const disabledMcpjsonServers = Array.isArray(project.disabledMcpjsonServers)
    ? project.disabledMcpjsonServers.map(String)
    : [];

  const metrics: Record<string, unknown> = {};
  for (const key of PROJECT_METRIC_KEYS) {
    if (project[key] !== undefined) {
      metrics[key] = project[key];
    }
  }

  return {
    path,
    exists: existsSync(path),
    allowedTools,
    allowedToolsCount: allowedTools.length,
    mcpServerNames: Object.keys(mcpServers),
    localMcpCount: Object.keys(mcpServers).length,
    enabledMcpjsonServers,
    disabledMcpjsonServers,
    hasTrustDialogAccepted: typeof project.hasTrustDialogAccepted === "boolean"
      ? project.hasTrustDialogAccepted
      : undefined,
    hasClaudeMdExternalIncludesApproved: typeof project.hasClaudeMdExternalIncludesApproved === "boolean"
      ? project.hasClaudeMdExternalIncludesApproved
      : undefined,
    hasClaudeMdExternalIncludesWarningShown: typeof project.hasClaudeMdExternalIncludesWarningShown === "boolean"
      ? project.hasClaudeMdExternalIncludesWarningShown
      : undefined,
    projectOnboardingSeenCount: typeof project.projectOnboardingSeenCount === "number"
      ? project.projectOnboardingSeenCount
      : undefined,
    metrics,
  };
}

/**
 * Read a sanitized summary of ~/.claude.json.
 */
export async function readGlobalConfigSummary(): Promise<GlobalConfigSummary> {
  const path = getGlobalConfigPath();
  const data = await readGlobalConfigData();

  if (!data) {
    return {
      path,
      exists: false,
      stats: {},
      preferences: {},
      writablePreferences: listWritableGlobalPreferences(),
      featureFlagCount: 0,
      userMcpCount: 0,
      trackedProjectCount: 0,
    };
  }

  const projects = data.projects && typeof data.projects === "object"
    ? (data.projects as Record<string, unknown>)
    : {};
  const userMcpServers = data.mcpServers && typeof data.mcpServers === "object"
    ? (data.mcpServers as Record<string, unknown>)
    : {};
  const featureFlags = data.cachedGrowthBookFeatures && typeof data.cachedGrowthBookFeatures === "object"
    ? (data.cachedGrowthBookFeatures as Record<string, unknown>)
    : {};

  return {
    path,
    exists: true,
    stats: pickScalarValues(data, GLOBAL_STATS_KEYS),
    preferences: pickScalarValues(data, GLOBAL_PREFERENCE_KEYS),
    writablePreferences: listWritableGlobalPreferences(),
    featureFlagCount: Object.keys(featureFlags).length,
    userMcpCount: Object.keys(userMcpServers).length,
    trackedProjectCount: Object.keys(projects).length,
  };
}

/**
 * Update one documented global Claude preference in ~/.claude.json.
 */
export async function updateGlobalPreference(
  key: string,
  value: unknown
): Promise<{
  path: string;
  key: GlobalPreferenceKey;
  before: unknown;
  after: string | boolean;
}> {
  if (!isGlobalPreferenceKey(key)) {
    throw new Error(`Unsupported global preference: ${key}`);
  }

  const normalizedValue = normalizeGlobalPreferenceValue(key, value);
  const content = await readWritableGlobalConfigData();
  const before = content[key];
  content[key] = normalizedValue;
  await writeGlobalConfigData(content);

  return {
    path: getGlobalConfigPath(),
    key,
    before,
    after: normalizedValue,
  };
}

/**
 * List all tracked projects from ~/.claude.json as sanitized summaries.
 */
export async function listTrackedProjects(): Promise<TrackedProjectSummary[]> {
  const data = await readGlobalConfigData();
  if (!data?.projects || typeof data.projects !== "object") {
    return [];
  }

  return Object.entries(data.projects as Record<string, unknown>)
    .filter(([, value]) => value && typeof value === "object")
    .map(([path, value]) => summarizeProject(path, value as ProjectConfigData))
    .sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Get a sanitized summary for one tracked project path.
 */
export async function getTrackedProject(
  projectPath: string
): Promise<TrackedProjectSummary | null> {
  const data = await readGlobalConfigData();
  if (!data?.projects || typeof data.projects !== "object") {
    return null;
  }

  const resolvedPath = resolve(projectPath);
  const project = (data.projects as Record<string, unknown>)[resolvedPath];
  if (!project || typeof project !== "object") {
    return null;
  }

  return summarizeProject(resolvedPath, project as ProjectConfigData);
}

/**
 * Get the current project's tracked state, if present.
 */
export async function getCurrentProjectState(
  projectDir?: string
): Promise<TrackedProjectSummary | null> {
  return getTrackedProject(projectDir ?? process.cwd());
}
