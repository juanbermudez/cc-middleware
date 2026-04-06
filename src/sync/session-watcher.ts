/**
 * Session file watcher.
 * Watches ~/.claude/projects/ directories for new/modified .jsonl session files.
 * Uses chokidar for reliable cross-platform file watching with polling fallback.
 * Emits events: session:discovered, session:updated, session:removed.
 */

import { EventEmitter } from "eventemitter3";
import { homedir } from "node:os";
import { join } from "node:path";
import { readdir, stat } from "node:fs/promises";
import { watch, type FSWatcher } from "chokidar";

/** Options for the session file watcher */
export interface SessionWatcherOptions {
  /** Specific project directories to watch, or discover all from ~/.claude/projects/ */
  projectDirs?: string[];
  /** Fallback poll interval in ms (default: 10000 = 10s) */
  pollIntervalMs?: number;
  /** Debounce rapid changes in ms (default: 2000 = 2s) */
  debounceMs?: number;
}

/** Data emitted with session watcher events */
export interface SessionWatchEvent {
  sessionId: string;
  filePath: string;
  projectDir: string;
  timestamp: number;
}

/** Events emitted by SessionWatcher */
export interface SessionWatcherEvents {
  "session:discovered": (data: SessionWatchEvent) => void;
  "session:updated": (data: SessionWatchEvent) => void;
  "session:removed": (data: SessionWatchEvent) => void;
}

/** Session watcher status for reporting */
export interface SessionWatcherStatus {
  watching: boolean;
  dirs: string[];
  knownFiles: number;
  lastPoll: number | null;
}

/**
 * Watches session .jsonl files on disk and emits events when they change.
 */
export class SessionWatcher extends EventEmitter<SessionWatcherEvents> {
  private options: Required<SessionWatcherOptions>;
  private watcher: FSWatcher | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private knownFiles = new Map<string, number>(); // filePath -> mtime
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private watching = false;
  private watchDirs: string[] = [];
  private lastPoll: number | null = null;

  constructor(options?: SessionWatcherOptions) {
    super();
    this.options = {
      projectDirs: options?.projectDirs ?? [],
      pollIntervalMs: options?.pollIntervalMs ?? 10000,
      debounceMs: options?.debounceMs ?? 2000,
    };
  }

  /**
   * Start watching for session file changes.
   */
  async start(): Promise<void> {
    if (this.watching) return;

    // Determine directories to watch
    this.watchDirs = await this.resolveWatchDirs();
    if (this.watchDirs.length === 0) {
      // Nothing to watch, but start polling to detect new dirs
      this.watching = true;
      this.startPolling();
      return;
    }

    // Do initial scan to populate known files
    await this.scanAllDirs();

    // Start chokidar watcher
    try {
      this.watcher = watch(
        this.watchDirs.map((d) => join(d, "*.jsonl")),
        {
          ignoreInitial: true,
          persistent: true,
          awaitWriteFinish: {
            stabilityThreshold: 500,
            pollInterval: 200,
          },
          usePolling: false,
        },
      );

      this.watcher.on("add", (filePath: string) => {
        this.handleFileChange(filePath, "add");
      });

      this.watcher.on("change", (filePath: string) => {
        this.handleFileChange(filePath, "change");
      });

      this.watcher.on("unlink", (filePath: string) => {
        this.handleFileRemove(filePath);
      });

      this.watcher.on("error", () => {
        // Silently handle watcher errors - polling will catch changes
      });
    } catch {
      // If chokidar fails to start, rely on polling
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
  getStatus(): SessionWatcherStatus {
    return {
      watching: this.watching,
      dirs: [...this.watchDirs],
      knownFiles: this.knownFiles.size,
      lastPoll: this.lastPoll,
    };
  }

  /**
   * Resolve which directories to watch.
   */
  private async resolveWatchDirs(): Promise<string[]> {
    if (this.options.projectDirs.length > 0) {
      // Verify dirs exist
      const dirs: string[] = [];
      for (const d of this.options.projectDirs) {
        try {
          const s = await stat(d);
          if (s.isDirectory()) dirs.push(d);
        } catch {
          // Directory doesn't exist, skip
        }
      }
      return dirs;
    }

    // Default: discover all project dirs under ~/.claude/projects/
    const projectsRoot = join(homedir(), ".claude", "projects");
    try {
      const entries = await readdir(projectsRoot, { withFileTypes: true });
      return entries
        .filter((e) => e.isDirectory())
        .map((e) => join(projectsRoot, e.name));
    } catch {
      // ~/.claude/projects/ doesn't exist yet
      return [];
    }
  }

  /**
   * Scan all watched directories and update known files.
   */
  private async scanAllDirs(): Promise<void> {
    const dirs = await this.resolveWatchDirs();
    // Update watchDirs in case new dirs appeared
    this.watchDirs = dirs;

    const currentFiles = new Set<string>();

    for (const dir of dirs) {
      try {
        const entries = await readdir(dir);
        for (const entry of entries) {
          if (!entry.endsWith(".jsonl")) continue;

          const filePath = join(dir, entry);
          currentFiles.add(filePath);

          try {
            const s = await stat(filePath);
            const mtime = s.mtimeMs;
            const existing = this.knownFiles.get(filePath);

            if (existing === undefined) {
              // New file discovered via poll
              this.knownFiles.set(filePath, mtime);
              this.emitDebounced(filePath, "session:discovered", dir);
            } else if (mtime > existing) {
              // File modified since last check
              this.knownFiles.set(filePath, mtime);
              this.emitDebounced(filePath, "session:updated", dir);
            }
          } catch {
            // File may have been removed between readdir and stat
          }
        }
      } catch {
        // Directory may have been removed
      }
    }

    // Check for removed files
    for (const [filePath] of this.knownFiles) {
      if (!currentFiles.has(filePath)) {
        this.knownFiles.delete(filePath);
        const dir = this.watchDirs.find((d) => filePath.startsWith(d)) ?? "";
        this.emitSessionEvent("session:removed", filePath, dir);
      }
    }

    this.lastPoll = Date.now();
  }

  /**
   * Handle a file being added or changed (from chokidar).
   */
  private handleFileChange(filePath: string, type: "add" | "change"): void {
    if (!filePath.endsWith(".jsonl")) return;

    const dir = this.watchDirs.find((d) => filePath.startsWith(d)) ?? "";
    const existing = this.knownFiles.has(filePath);

    // Update mtime
    stat(filePath)
      .then((s) => {
        this.knownFiles.set(filePath, s.mtimeMs);
      })
      .catch(() => {
        // File removed between event and stat
      });

    if (type === "add" && !existing) {
      this.emitDebounced(filePath, "session:discovered", dir);
    } else {
      this.emitDebounced(filePath, "session:updated", dir);
    }
  }

  /**
   * Handle a file being removed (from chokidar).
   */
  private handleFileRemove(filePath: string): void {
    if (!filePath.endsWith(".jsonl")) return;

    this.knownFiles.delete(filePath);
    // Cancel any pending debounce for this file
    const timer = this.debounceTimers.get(filePath);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(filePath);
    }

    const dir = this.watchDirs.find((d) => filePath.startsWith(d)) ?? "";
    this.emitSessionEvent("session:removed", filePath, dir);
  }

  /**
   * Emit a debounced event. For session:updated events, we batch rapid changes.
   */
  private emitDebounced(
    filePath: string,
    eventName: keyof SessionWatcherEvents,
    projectDir: string,
  ): void {
    // For discovered events, emit immediately (new sessions are interesting)
    if (eventName === "session:discovered") {
      this.emitSessionEvent(eventName, filePath, projectDir);
      return;
    }

    // For updates, debounce
    const existing = this.debounceTimers.get(filePath);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(filePath);
      this.emitSessionEvent(eventName, filePath, projectDir);
    }, this.options.debounceMs);

    this.debounceTimers.set(filePath, timer);
  }

  /**
   * Emit a session event.
   */
  private emitSessionEvent(
    eventName: keyof SessionWatcherEvents,
    filePath: string,
    projectDir: string,
  ): void {
    const sessionId = extractSessionId(filePath);
    if (!sessionId) return;

    this.emit(eventName, {
      sessionId,
      filePath,
      projectDir,
      timestamp: Date.now(),
    });
  }

  /**
   * Start the polling interval.
   */
  private startPolling(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => {
      this.scanAllDirs().catch(() => {
        // Polling errors are non-fatal
      });
    }, this.options.pollIntervalMs);
  }
}

/**
 * Extract session ID from a .jsonl file path.
 * Session files are named <session-id>.jsonl
 */
export function extractSessionId(filePath: string): string | null {
  const match = filePath.match(/([^/\\]+)\.jsonl$/);
  return match ? match[1] : null;
}
