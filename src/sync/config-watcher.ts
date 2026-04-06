/**
 * Config and component file watcher.
 * Watches settings files, MCP configs, agent/skill/rule markdown files,
 * team configs, and plugin state for changes.
 * Uses chokidar for file watching with polling fallback.
 */

import { EventEmitter } from "eventemitter3";
import { homedir } from "node:os";
import { join, dirname, basename } from "node:path";
import { stat, readdir } from "node:fs/promises";
import { watch, type FSWatcher } from "chokidar";

/** Options for the config watcher */
export interface ConfigWatcherOptions {
  /** Project directory (for project-scoped configs) */
  projectDir?: string;
  /** Poll interval in ms (default: 30000 = 30s, configs change less often) */
  pollIntervalMs?: number;
  /** Debounce in ms (default: 1000) */
  debounceMs?: number;
}

/** Data emitted with config change events */
export interface ConfigChangeEvent {
  /** The file path that changed */
  filePath: string;
  /** The type of change */
  action: "created" | "modified" | "removed";
  /** Timestamp of the change */
  timestamp: number;
}

/** Settings-specific change event */
export interface SettingsChangeEvent extends ConfigChangeEvent {
  scope: "user" | "project" | "local" | "managed";
}

/** Component (agent/skill/rule) change event */
export interface ComponentChangeEvent extends ConfigChangeEvent {
  name: string;
  scope: "user" | "project";
}

/** Team change event */
export interface TeamChangeEvent extends ConfigChangeEvent {
  teamName: string;
}

/** Events emitted by ConfigWatcher */
export interface ConfigWatcherEvents {
  "config:settings-changed": (data: SettingsChangeEvent) => void;
  "config:mcp-changed": (data: ConfigChangeEvent) => void;
  "config:agent-changed": (data: ComponentChangeEvent) => void;
  "config:skill-changed": (data: ComponentChangeEvent) => void;
  "config:rule-changed": (data: ComponentChangeEvent) => void;
  "config:plugin-changed": (data: ConfigChangeEvent) => void;
  "config:memory-changed": (data: ConfigChangeEvent) => void;
  "team:created": (data: TeamChangeEvent) => void;
  "team:updated": (data: TeamChangeEvent) => void;
  "team:task-updated": (data: ConfigChangeEvent) => void;
}

/** Config watcher status */
export interface ConfigWatcherStatus {
  watching: boolean;
  watchedPaths: number;
  lastPoll: number | null;
}

/**
 * Watches configuration and component files for changes.
 */
export class ConfigWatcher extends EventEmitter<ConfigWatcherEvents> {
  private options: Required<ConfigWatcherOptions>;
  private watcher: FSWatcher | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private knownFiles = new Map<string, number>(); // filePath -> mtime
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private watching = false;
  private lastPoll: number | null = null;
  private watchPaths: string[] = [];
  private initialScanDone = false;

  constructor(options?: ConfigWatcherOptions) {
    super();
    this.options = {
      projectDir: options?.projectDir ?? process.cwd(),
      pollIntervalMs: options?.pollIntervalMs ?? 30000,
      debounceMs: options?.debounceMs ?? 1000,
    };
  }

  /**
   * Start watching for config changes.
   */
  async start(): Promise<void> {
    if (this.watching) return;

    this.watchPaths = this.buildWatchPaths();

    // Initial scan (populate known files without emitting)
    await this.scanAllPaths();
    this.initialScanDone = true;

    // Start chokidar
    try {
      this.watcher = watch(this.watchPaths, {
        ignoreInitial: true,
        persistent: true,
        usePolling: false,
      });

      this.watcher.on("add", (filePath: string) => {
        this.handleChange(filePath, "created");
      });

      this.watcher.on("change", (filePath: string) => {
        this.handleChange(filePath, "modified");
      });

      this.watcher.on("unlink", (filePath: string) => {
        this.handleChange(filePath, "removed");
      });

      this.watcher.on("error", () => {
        // Silently handle - polling is fallback
      });
    } catch {
      // Rely on polling
    }

    this.watching = true;
    this.startPolling();
  }

  /**
   * Stop watching.
   */
  async stop(): Promise<void> {
    if (!this.watching) return;
    this.watching = false;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  /**
   * Get current watcher status.
   */
  getStatus(): ConfigWatcherStatus {
    return {
      watching: this.watching,
      watchedPaths: this.watchPaths.length,
      lastPoll: this.lastPoll,
    };
  }

  /**
   * Build the list of paths/globs to watch.
   */
  private buildWatchPaths(): string[] {
    const home = homedir();
    const project = this.options.projectDir;
    const paths: string[] = [];

    // Settings files
    paths.push(join(home, ".claude", "settings.json"));
    paths.push(join(home, ".claude", "settings.local.json"));
    paths.push(join(project, ".claude", "settings.json"));
    paths.push(join(project, ".claude", "settings.local.json"));

    // MCP configs
    paths.push(join(home, ".claude.json"));
    paths.push(join(project, ".mcp.json"));

    // Agent definitions
    paths.push(join(project, ".claude", "agents", "*.md"));
    paths.push(join(home, ".claude", "agents", "*.md"));

    // Skills
    paths.push(join(project, ".claude", "skills", "*", "SKILL.md"));

    // Rules
    paths.push(join(project, ".claude", "rules", "*.md"));
    paths.push(join(home, ".claude", "rules", "*.md"));

    // Teams
    paths.push(join(home, ".claude", "teams", "*", "config.json"));

    // Tasks
    paths.push(join(home, ".claude", "tasks", "*"));

    // Plugins
    paths.push(join(home, ".claude", "plugins", "installed_plugins.json"));

    // Memory
    paths.push(join(home, ".claude", "memory", "*"));

    return paths;
  }

  /**
   * Scan all watched paths and detect changes via mtime.
   * Expands glob patterns by reading directories.
   */
  private async scanAllPaths(): Promise<void> {
    const expandedPaths = await this.expandGlobs();

    const currentFiles = new Set<string>();

    for (const filePath of expandedPaths) {
      currentFiles.add(filePath);
      try {
        const s = await stat(filePath);
        const mtime = s.mtimeMs;
        const existing = this.knownFiles.get(filePath);

        if (existing === undefined) {
          this.knownFiles.set(filePath, mtime);
          // Emit for new files found after initial scan
          if (this.initialScanDone) {
            this.handleChange(filePath, "created");
          }
        } else if (mtime > existing) {
          this.knownFiles.set(filePath, mtime);
          this.handleChange(filePath, "modified");
        }
      } catch {
        // File doesn't exist - check if it was removed
        if (this.knownFiles.has(filePath)) {
          this.knownFiles.delete(filePath);
          this.handleChange(filePath, "removed");
        }
      }
    }

    // Detect new files (files in currentFiles not yet in knownFiles)
    // This is handled above by the `existing === undefined` branch

    // Detect removed files (files in knownFiles not in currentFiles)
    for (const [filePath] of this.knownFiles) {
      if (!currentFiles.has(filePath)) {
        this.knownFiles.delete(filePath);
        this.handleChange(filePath, "removed");
      }
    }

    this.lastPoll = Date.now();
  }

  /**
   * Expand glob patterns in watchPaths to actual file paths.
   */
  private async expandGlobs(): Promise<string[]> {
    const result: string[] = [];

    for (const p of this.watchPaths) {
      if (p.includes("*")) {
        // Simple glob expansion: only supports patterns like dir/*.ext or dir/*/file
        const dir = dirname(p);
        const pattern = basename(p);

        if (dir.includes("*")) {
          // Pattern like dir/*/file - need to expand the directory wildcard
          const parentDir = dirname(dir);
          const fileName = pattern;
          try {
            const entries = await readdir(parentDir, { withFileTypes: true });
            for (const entry of entries) {
              if (entry.isDirectory()) {
                const filePath = join(parentDir, entry.name, fileName);
                try {
                  await stat(filePath);
                  result.push(filePath);
                } catch {
                  // File doesn't exist in this subdir
                }
              }
            }
          } catch {
            // Parent dir doesn't exist
          }
        } else {
          // Pattern like dir/*.ext
          const ext = pattern.replace("*", "");
          try {
            const entries = await readdir(dir);
            for (const entry of entries) {
              if (ext === "" || entry.endsWith(ext.replace("*", ""))) {
                result.push(join(dir, entry));
              }
            }
          } catch {
            // Dir doesn't exist
          }
        }
      } else {
        result.push(p);
      }
    }

    return result;
  }

  /**
   * Handle a file change and emit the appropriate typed event.
   */
  private handleChange(filePath: string, action: "created" | "modified" | "removed"): void {
    // Update known files
    if (action === "removed") {
      this.knownFiles.delete(filePath);
    } else {
      stat(filePath)
        .then((s) => this.knownFiles.set(filePath, s.mtimeMs))
        .catch(() => { /* file may be gone */ });
    }

    // Debounce the event emission
    const existing = this.debounceTimers.get(filePath);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(filePath);
      this.emitTypedEvent(filePath, action);
    }, this.options.debounceMs);

    this.debounceTimers.set(filePath, timer);
  }

  /**
   * Determine the event type from the file path and emit it.
   */
  private emitTypedEvent(filePath: string, action: "created" | "modified" | "removed"): void {
    const timestamp = Date.now();
    const base: ConfigChangeEvent = { filePath, action, timestamp };

    // Settings files
    if (filePath.endsWith("settings.json") || filePath.endsWith("settings.local.json")) {
      const scope = this.inferSettingsScope(filePath);
      this.emit("config:settings-changed", { ...base, scope });
      return;
    }

    // MCP configs
    if (filePath.endsWith(".claude.json") || filePath.endsWith(".mcp.json")) {
      this.emit("config:mcp-changed", base);
      return;
    }

    // Agent definitions
    if (filePath.includes("/agents/") && filePath.endsWith(".md")) {
      const name = extractComponentName(filePath);
      const scope = this.inferComponentScope(filePath);
      this.emit("config:agent-changed", { ...base, name, scope });
      return;
    }

    // Skills
    if (filePath.includes("/skills/") && filePath.endsWith("SKILL.md")) {
      const name = extractSkillName(filePath);
      const scope = this.inferComponentScope(filePath);
      this.emit("config:skill-changed", { ...base, name, scope });
      return;
    }

    // Rules
    if (filePath.includes("/rules/") && filePath.endsWith(".md")) {
      const name = extractComponentName(filePath);
      const scope = this.inferComponentScope(filePath);
      this.emit("config:rule-changed", { ...base, name, scope });
      return;
    }

    // Teams
    if (filePath.includes("/teams/") && filePath.endsWith("config.json")) {
      const teamName = extractTeamName(filePath);
      const eventName = action === "created" ? "team:created" : "team:updated";
      this.emit(eventName, { ...base, teamName });
      return;
    }

    // Tasks
    if (filePath.includes("/tasks/")) {
      this.emit("team:task-updated", base);
      return;
    }

    // Plugins
    if (filePath.includes("installed_plugins.json")) {
      this.emit("config:plugin-changed", base);
      return;
    }

    // Memory
    if (filePath.includes("/memory/")) {
      this.emit("config:memory-changed", base);
      return;
    }
  }

  /**
   * Infer settings scope from file path.
   */
  private inferSettingsScope(filePath: string): "user" | "project" | "local" | "managed" {
    if (filePath.includes(".local.json")) {
      if (filePath.startsWith(homedir())) return "local";
      return "local";
    }
    if (filePath.startsWith(join(homedir(), ".claude"))) return "user";
    return "project";
  }

  /**
   * Infer component scope from file path.
   */
  private inferComponentScope(filePath: string): "user" | "project" {
    if (filePath.startsWith(join(homedir(), ".claude"))) return "user";
    return "project";
  }

  /**
   * Start polling.
   */
  private startPolling(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => {
      this.scanAllPaths().catch(() => { /* non-fatal */ });
    }, this.options.pollIntervalMs);
  }
}

/** Extract component name from a path like .claude/agents/my-agent.md */
function extractComponentName(filePath: string): string {
  const match = filePath.match(/([^/\\]+)\.md$/);
  return match ? match[1] : "unknown";
}

/** Extract skill name from a path like .claude/skills/my-skill/SKILL.md */
function extractSkillName(filePath: string): string {
  const parts = filePath.split("/");
  const skillIdx = parts.indexOf("skills");
  if (skillIdx >= 0 && skillIdx + 1 < parts.length) {
    return parts[skillIdx + 1];
  }
  return "unknown";
}

/** Extract team name from a path like ~/.claude/teams/my-team/config.json */
function extractTeamName(filePath: string): string {
  const parts = filePath.split("/");
  const teamsIdx = parts.indexOf("teams");
  if (teamsIdx >= 0 && teamsIdx + 1 < parts.length) {
    return parts[teamsIdx + 1];
  }
  return "unknown";
}
