/**
 * Session indexer.
 * Scans Claude Code sessions from the filesystem and indexes them
 * into the SQLite store for fast search and discovery.
 */

import { discoverSessions } from "../sessions/discovery.js";
import { getSession } from "../sessions/info.js";
import { readSessionMessages } from "../sessions/messages.js";
import { extractTextContent, extractToolUses } from "../sessions/messages.js";
import { readIndexedTranscripts } from "../sessions/transcripts.js";
import { toErrorMessage } from "../utils/errors.js";
import type { SessionStore, IndexedSession, IndexedMessage } from "./db.js";
import type { SessionInfo } from "../types/sessions.js";

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
  private messageLimit?: number;
  private projectDirs?: string[];

  constructor(options: IndexerOptions) {
    this.store = options.store;
    this.batchSize = options.batchSize ?? 50;
    this.messageLimit = options.messageLimit;
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
      const sessions = await this.discoverIndexableSessions();

      // Process in batches
      for (let i = 0; i < sessions.length; i += this.batchSize) {
        const batch = sessions.slice(i, i + this.batchSize);

        for (const session of batch) {
          try {
            await this.indexSingleSession(session.sessionId, session);
            sessionsIndexed++;

            // Index messages
            const msgCount = await this.indexSessionMessages(session);
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
      const sessions = await this.discoverIndexableSessions();

      // Only process sessions modified since last index
      const newOrModified = sessions.filter(
        (s) => s.lastModified > lastIndexed
      );

      for (const session of newOrModified) {
        try {
          await this.indexSingleSession(session.sessionId, session);
          sessionsIndexed++;

          const msgCount = await this.indexSessionMessages(session);
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
    await this.indexSessionMessages(session);
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
    sessionInfo: SessionInfo
  ): Promise<void> {
    // Determine project name from cwd
    const cwd = sessionInfo.cwd ?? "";
    const project = cwd.split("/").pop() ?? cwd;

    const indexed: IndexedSession = {
      id: sessionId,
      project,
      cwd,
      summary: sessionInfo.summary ?? "",
      customTitle: sessionInfo.customTitle,
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
  private async indexSessionMessages(sessionInfo: SessionInfo): Promise<number> {
    const sessionId = sessionInfo.sessionId;

    try {
      const transcriptIndex = await readIndexedTranscripts(sessionInfo, {
        limit: this.messageLimit,
      });

      let indexed: IndexedMessage[];
      let totalMessages: number;

      if (transcriptIndex) {
        indexed = transcriptIndex.messages.map((message) => ({
          id: message.id,
          sessionId: message.sessionId,
          role: message.role,
          contentPreview: message.contentPreview,
          toolNames: message.toolNames,
          timestamp: message.timestamp,
        }));
        totalMessages = transcriptIndex.totalMessages;
        this.store.replaceRelationships(sessionId, transcriptIndex.relationships);
      } else {
        const messages = await readSessionMessages(sessionId, {
          limit: this.messageLimit,
        });

        indexed = messages
          .filter((message) => message.type === "user" || message.type === "assistant")
          .map((message, idx) => {
            const text = extractTextContent(message.message);
            const tools = extractToolUses(message.message);
            const toolNames = tools.map((tool) => tool.name).join(",");
            const parsedTimestamp =
              typeof message.timestamp === "string"
                ? Date.parse(message.timestamp)
                : Number.NaN;

            return {
              id: message.uuid || `${sessionId}-${idx}`,
              sessionId,
              role: message.type as "user" | "assistant",
              contentPreview: text.slice(0, 500),
              toolNames: toolNames || undefined,
              timestamp: Number.isNaN(parsedTimestamp)
                ? Date.now() + idx
                : parsedTimestamp,
            };
          });
        totalMessages = indexed.length;
        this.store.replaceRelationships(sessionId, []);
      }

      if (indexed.length === 0) {
        this.store.deleteMessages(sessionId);
        const session = this.store.getSession(sessionId);
        if (session) {
          session.messageCount = totalMessages;
          this.store.upsertSession(session);
        }
        return 0;
      }

      // Delete existing messages for this session before re-indexing
      this.store.deleteMessages(sessionId);

      if (indexed.length > 0) {
        this.store.insertMessages(sessionId, indexed);

        // Update message count on session
        const session = this.store.getSession(sessionId);
        if (session) {
          session.messageCount = totalMessages;
          this.store.upsertSession(session);
        }
      }

      return indexed.length;
    } catch {
      // Message reading can fail for various reasons; skip silently
      return 0;
    }
  }

  private async discoverIndexableSessions(): Promise<SessionInfo[]> {
    const discovered = this.projectDirs?.length
      ? await Promise.all(
          this.projectDirs.map((dir) =>
            discoverSessions({
              dir,
            })
          )
        )
      : [await discoverSessions()];

    const deduped = new Map<string, SessionInfo>();

    for (const sessions of discovered) {
      for (const session of sessions) {
        const key = `${session.sessionId}:${session.cwd ?? ""}`;
        deduped.set(key, session);
      }
    }

    return [...deduped.values()].sort((a, b) => {
      const aCreated = a.createdAt ?? a.lastModified;
      const bCreated = b.createdAt ?? b.lastModified;

      if (aCreated !== bCreated) {
        return aCreated - bCreated;
      }

      if (a.lastModified !== b.lastModified) {
        return a.lastModified - b.lastModified;
      }

      return a.sessionId.localeCompare(b.sessionId);
    });
  }
}
