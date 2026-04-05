/**
 * Session discovery from the filesystem.
 * Wraps Agent SDK's listSessions() to provide normalized SessionInfo objects.
 */

import { listSessions } from "@anthropic-ai/claude-agent-sdk";
import type { SessionInfo } from "../types/sessions.js";
import { toSessionInfo } from "./utils.js";

export interface DiscoverSessionsOptions {
  /** Project directory to filter by */
  dir?: string;
  /** Maximum number of sessions to return */
  limit?: number;
  /** Include sessions from git worktrees (default: true) */
  includeWorktrees?: boolean;
}

/**
 * Discover sessions, optionally filtered by project directory.
 * Returns SessionInfo objects sorted by lastModified descending.
 */
export async function discoverSessions(
  options?: DiscoverSessionsOptions
): Promise<SessionInfo[]> {
  try {
    const sdkSessions = await listSessions({
      dir: options?.dir,
      limit: options?.limit,
      includeWorktrees: options?.includeWorktrees,
    });

    const sessions: SessionInfo[] = sdkSessions.map(toSessionInfo);

    // Sort by lastModified descending (most recent first)
    sessions.sort((a, b) => b.lastModified - a.lastModified);

    return sessions;
  } catch (error: unknown) {
    // Handle missing/non-existent directories gracefully
    if (
      error instanceof Error &&
      (error.message.includes("ENOENT") ||
        error.message.includes("no such file") ||
        error.message.includes("does not exist"))
    ) {
      return [];
    }
    throw error;
  }
}

/**
 * Discover all project directories that have sessions.
 * Returns a deduplicated list of project directory paths.
 */
export async function discoverAllProjects(): Promise<string[]> {
  const sessions = await discoverSessions();
  const projects = new Set<string>();

  for (const session of sessions) {
    if (session.cwd) {
      projects.add(session.cwd);
    }
  }

  return Array.from(projects).sort();
}
