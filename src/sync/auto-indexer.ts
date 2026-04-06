/**
 * Incremental auto-indexer.
 * Listens to session watcher events and automatically indexes
 * new/updated sessions into the SQLite store.
 * Batches update operations to avoid excessive indexing during active sessions.
 */

import type { SessionWatcher, SessionWatchEvent } from "./session-watcher.js";
import type { SessionStore } from "../store/db.js";
import type { SessionIndexer } from "../store/indexer.js";

/** Options for the auto-indexer */
export interface AutoIndexerOptions {
  sessionWatcher: SessionWatcher;
  store: SessionStore;
  indexer: SessionIndexer;
  /** How often to flush batch updates (default: 5000ms) */
  batchIntervalMs?: number;
}

/** Auto-indexer statistics */
export interface AutoIndexerStats {
  running: boolean;
  sessionsIndexed: number;
  indexErrors: number;
  lastIndexTime: number | null;
  pendingBatch: number;
}

/**
 * Auto-indexer that listens to session watcher events and keeps
 * the search index up to date.
 */
export class AutoIndexer {
  private running = false;
  private batchTimer: ReturnType<typeof setInterval> | null = null;
  private pendingUpdates = new Set<string>(); // session IDs to re-index
  private sessionsIndexed = 0;
  private indexErrors = 0;
  private lastIndexTime: number | null = null;

  private watcher: SessionWatcher;
  private indexer: SessionIndexer;
  private batchIntervalMs: number;

  private onDiscovered: (data: SessionWatchEvent) => void;
  private onUpdated: (data: SessionWatchEvent) => void;

  constructor(options: AutoIndexerOptions) {
    this.watcher = options.sessionWatcher;
    this.indexer = options.indexer;
    this.batchIntervalMs = options.batchIntervalMs ?? 5000;

    // Bind event handlers
    this.onDiscovered = (data: SessionWatchEvent) => {
      // New sessions: index immediately
      this.indexSessionNow(data.sessionId);
    };

    this.onUpdated = (data: SessionWatchEvent) => {
      // Updated sessions: batch for periodic flush
      this.pendingUpdates.add(data.sessionId);
    };
  }

  /**
   * Start listening to watcher events and auto-indexing.
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    this.watcher.on("session:discovered", this.onDiscovered);
    this.watcher.on("session:updated", this.onUpdated);

    // Start batch flush timer
    this.batchTimer = setInterval(() => {
      this.flushBatch();
    }, this.batchIntervalMs);
  }

  /**
   * Stop auto-indexing.
   */
  stop(): void {
    if (!this.running) return;
    this.running = false;

    this.watcher.off("session:discovered", this.onDiscovered);
    this.watcher.off("session:updated", this.onUpdated);

    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }
  }

  /**
   * Get current auto-indexer statistics.
   */
  getStats(): AutoIndexerStats {
    return {
      running: this.running,
      sessionsIndexed: this.sessionsIndexed,
      indexErrors: this.indexErrors,
      lastIndexTime: this.lastIndexTime,
      pendingBatch: this.pendingUpdates.size,
    };
  }

  /**
   * Force flush any pending batch updates immediately.
   */
  async flushBatch(): Promise<void> {
    if (this.pendingUpdates.size === 0) return;

    const sessionIds = [...this.pendingUpdates];
    this.pendingUpdates.clear();

    for (const sessionId of sessionIds) {
      await this.indexSessionNow(sessionId);
    }
  }

  /**
   * Index a single session immediately.
   */
  private async indexSessionNow(sessionId: string): Promise<void> {
    try {
      await this.indexer.indexSession(sessionId);
      this.sessionsIndexed++;
      this.lastIndexTime = Date.now();
    } catch {
      this.indexErrors++;
      // Non-fatal: session may not be readable yet or may have been removed
    }
  }
}
