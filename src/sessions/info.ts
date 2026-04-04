/**
 * Session info and metadata management.
 * Wraps Agent SDK's getSessionInfo(), renameSession(), tagSession().
 */

import {
  getSessionInfo,
  renameSession,
  tagSession,
} from "@anthropic-ai/claude-agent-sdk";
import type { SessionInfo } from "../types/sessions.js";

/**
 * Get detailed info for a single session.
 * Returns undefined if the session doesn't exist.
 */
export async function getSession(
  sessionId: string,
  options?: { dir?: string }
): Promise<SessionInfo | undefined> {
  const sdk = await getSessionInfo(sessionId, { dir: options?.dir });

  if (!sdk) {
    return undefined;
  }

  return {
    sessionId: sdk.sessionId,
    summary: sdk.summary,
    lastModified: sdk.lastModified,
    fileSize: sdk.fileSize ?? undefined,
    customTitle: sdk.customTitle ?? undefined,
    firstPrompt: sdk.firstPrompt ?? undefined,
    gitBranch: sdk.gitBranch ?? undefined,
    cwd: sdk.cwd ?? undefined,
    tag: sdk.tag ?? undefined,
    createdAt: sdk.createdAt ?? undefined,
  };
}

/**
 * Rename a session (set a custom title).
 * Title must be non-empty after trimming whitespace.
 */
export async function updateSessionTitle(
  sessionId: string,
  title: string,
  options?: { dir?: string }
): Promise<void> {
  const trimmed = title.trim();
  if (trimmed.length === 0) {
    throw new Error("Session title must be non-empty after trimming");
  }
  await renameSession(sessionId, trimmed, { dir: options?.dir });
}

/**
 * Tag a session. Pass null to clear the tag.
 */
export async function updateSessionTag(
  sessionId: string,
  tag: string | null,
  options?: { dir?: string }
): Promise<void> {
  await tagSession(sessionId, tag, { dir: options?.dir });
}
