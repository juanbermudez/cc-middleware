/**
 * Sync status API route.
 * Provides real-time sync status information.
 */

import type { FastifyInstance } from "fastify";
import type { SessionWatcher } from "../../sync/session-watcher.js";
import type { ConfigWatcher } from "../../sync/config-watcher.js";
import type { AutoIndexer } from "../../sync/auto-indexer.js";

/** Context needed by sync routes */
export interface SyncContext {
  sessionWatcher: SessionWatcher | null;
  configWatcher: ConfigWatcher | null;
  autoIndexer: AutoIndexer | null;
}

/**
 * Register sync status routes.
 */
export function registerSyncRoutes(app: FastifyInstance, ctx: SyncContext): void {
  app.get("/api/v1/sync/status", async () => {
    return {
      sessionWatcher: ctx.sessionWatcher
        ? ctx.sessionWatcher.getStatus()
        : { watching: false, dirs: [], knownFiles: 0, lastPoll: null },
      configWatcher: ctx.configWatcher
        ? ctx.configWatcher.getStatus()
        : { watching: false, watchedPaths: 0, lastPoll: null },
      autoIndexer: ctx.autoIndexer
        ? ctx.autoIndexer.getStats()
        : { running: false, sessionsIndexed: 0, indexErrors: 0, lastIndexTime: null, pendingBatch: 0 },
    };
  });
}
