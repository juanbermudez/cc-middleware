/**
 * Session indexer.
 * Scans Claude Code sessions from the filesystem and indexes them
 * into the SQLite store for fast search and discovery.
 */

import { discoverSessions } from "../sessions/discovery.js";
import { getSession } from "../sessions/info.js";
import { readSessionMessages } from "../sessions/messages.js";
import { extractTextContent, extractToolUses } from "../sessions/messages.js";
import { toErrorMessage } from "../utils/errors.js";
import type { SessionStore, IndexedSession, IndexedMessage } from "./db.js";

/** Options for the session indexer */
export interface IndexerOptions {
  store: SessionStore;
  projectDirs?: string[];
  batchSize?: number;
  messageLimit?: number;
}

/** Result of an indexing operation */
export interface IndexResult {
  sessionsIndexed: number;
  messagesIndexed: number;
  errors: Array<{ sessionId: string; error: string }>;
  durationMs: number;
}

/** Index statistics */
export interface IndexStats {
  totalSessions: number;
  totalMessages: number;
  lastFullIndex?: number;
  lastIncrementalIndex?: number;
}

/**
 * Session indexer that scans and indexes sessions into the store.
 */
export class SessionIndexer {
  private store: SessionStore;
  private batchSize: number;
  private messageLimit: number;
  private projectDirs?: string[];

  constructor(options: IndexerOptions) {
    this.store = options.store;
    this.batchSize = options.batchSize ?? 50;
    this.messageLimit = options.messageLimit ?? 100;
    this.projectDirs = options.projectDirs;
  }

  /**
   * Full index: scan all sessions and index them.
   */
  async fullIndex(): Promise<IndexResult> {
    const start = Date.now();
    const errors: IndexResult["errors"] = [];
    let sessionsIndexed = 0;
    let messagesIndexed = 0;

    try {
      // Discover all sessions
      const sessions = await discoverSessions({
        dir: this.projectDirs?.[0],
        limit: 1000,
      });

      // Process in batches
      for (let i = 0; i < sessions.length; i += this.batchSize) {
        const batch = sessions.slice(i, i + this.batchSize);

        for (const session of batch) {
          try {
            await this.indexSingleSession(session.sessionId, session);
            sessionsIndexed++;

            // Index messages
            const msgCount = await this.indexSessionMessages(session.sessionId);
            messagesIndexed += msgCount;
          } catch (error) {
            const errMsg = toErrorMessage(error);
            errors.push({ sessionId: session.sessionId, error: errMsg });
          }
        }
      }

      // Record full index time
      const now = Date.now();
      this.store.setLastIndexedAt(now);
      this.store.setMetadata("last_full_index", String(now));
    } catch (error) {
      // Discovery-level error
      const errMsg = toErrorMessage(error);
      errors.push({ sessionId: "_discovery", error: errMsg });
    }

    return {
      sessionsIndexed,
      messagesIndexed,
      errors,
      durationMs: Date.now() - start,
    };
  }

  /**
   * Incremental index: only process new or modified sessions.
   */
  async incrementalIndex(): Promise<IndexResult> {
    const start = Date.now();
    const errors: IndexResult["errors"] = [];
    let sessionsIndexed = 0;
    let messagesIndexed = 0;

    try {
      const lastIndexed = this.store.getLastIndexedAt() ?? 0;

      const sessions = await discoverSessions({
        dir: this.projectDirs?.[0],
        limit: 1000,
      });

      // Only process sessions modified since last index
      const newOrModified = sessions.filter(
        (s) => s.lastModified > lastIndexed
      );

      for (const session of newOrModified) {
        try {
          await this.indexSingleSession(session.sessionId, session);
          sessionsIndexed++;

          const msgCount = await this.indexSessionMessages(session.sessionId);
          messagesIndexed += msgCount;
        } catch (error) {
          const errMsg = toErrorMessage(error);
          errors.push({ sessionId: session.sessionId, error: errMsg });
        }
      }

      // Record incremental index time
      const now = Date.now();
      this.store.setLastIndexedAt(now);
      this.store.setMetadata("last_incremental_index", String(now));
    } catch (error) {
      const errMsg = toErrorMessage(error);
      errors.push({ sessionId: "_discovery", error: errMsg });
    }

    return {
      sessionsIndexed,
      messagesIndexed,
      errors,
      durationMs: Date.now() - start,
    };
  }

  /**
   * Index a specific session by ID.
   */
  async indexSession(sessionId: string, dir?: string): Promise<void> {
    const session = await getSession(sessionId, { dir });

    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    await this.indexSingleSession(sessionId, session);
    await this.indexSessionMessages(sessionId);
  }

  /**
   * Get current index statistics.
   */
  getStats(): IndexStats {
    const lastFullStr = this.store.getMetadata("last_full_index");
    const lastIncrStr = this.store.getMetadata("last_incremental_index");

    return {
      totalSessions: this.store.getSessionCount(),
      totalMessages: this.store.getMessageCount(),
      lastFullIndex: lastFullStr ? Number(lastFullStr) : undefined,
      lastIncrementalIndex: lastIncrStr ? Number(lastIncrStr) : undefined,
    };
  }

  /**
   * Index a single session into the store.
   */
  private async indexSingleSession(
    sessionId: string,
    sessionInfo: { sessionId: string; summary: string; lastModified: number; cwd?: string; firstPrompt?: string; gitBranch?: string; tag?: string; fileSize?: number; createdAt?: number }
  ): Promise<void> {
    // Determine project name from cwd
    const cwd = sessionInfo.cwd ?? "";
    const project = cwd.split("/").pop() ?? cwd;

    const indexed: IndexedSession = {
      id: sessionId,
      project,
      cwd,
      summary: sessionInfo.summary ?? "",
      firstPrompt: sessionInfo.firstPrompt ?? "",
      gitBranch: sessionInfo.gitBranch,
      tag: sessionInfo.tag,
      status: "completed",
      createdAt: sessionInfo.createdAt ?? sessionInfo.lastModified,
      lastModified: sessionInfo.lastModified,
      fileSize: sessionInfo.fileSize,
    };

    this.store.upsertSession(indexed);
  }

  /**
   * Index messages for a session. Returns count of messages indexed.
   */
  private async indexSessionMessages(sessionId: string): Promise<number> {
    try {
      const messages = await readSessionMessages(sessionId, {
        limit: this.messageLimit,
      });

      if (messages.length === 0) return 0;

      // Delete existing messages for this session before re-indexing
      this.store.deleteMessages(sessionId);

      const indexed: IndexedMessage[] = messages
        .filter((m) => m.type === "user" || m.type === "assistant")
        .map((msg, idx) => {
          const text = extractTextContent(msg.message);
          const tools = extractToolUses(msg.message);
          const toolNames = tools.map((t) => t.name).join(",");

          return {
            id: msg.uuid || `${sessionId}-${idx}`,
            sessionId,
            role: msg.type as "user" | "assistant",
            contentPreview: text.slice(0, 500),
            toolNames: toolNames || undefined,
            timestamp: Date.now() - (messages.length - idx) * 1000,
          };
        });

      if (indexed.length > 0) {
        this.store.insertMessages(sessionId, indexed);

        // Update message count on session
        const session = this.store.getSession(sessionId);
        if (session) {
          session.messageCount = indexed.length;
          this.store.upsertSession(session);
        }
      }

      return indexed.length;
    } catch {
      // Message reading can fail for various reasons; skip silently
      return 0;
    }
  }
}
