/**
 * Raw transcript helpers for indexing session and subagent logs.
 * Claude stores root session transcripts as:
 *   ~/.claude/projects/<encoded-cwd>/<session-id>.jsonl
 * and sidechain/subagent transcripts under:
 *   ~/.claude/projects/<encoded-cwd>/<session-id>/subagents/*.jsonl
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { homedir } from "node:os";
import { extractTextContent, extractToolUses } from "./messages.js";

export interface IndexedTranscriptMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  contentPreview: string;
  toolNames?: string;
  timestamp: number;
}

export interface IndexedSessionRelationship {
  id: string;
  sessionId: string;
  relationshipType: "subagent";
  path: string;
  agentId?: string;
  slug?: string;
  sourceToolAssistantUUID?: string;
  teamName?: string;
  teammateName?: string;
  startedAt?: number;
  lastModified: number;
}

export interface SessionTranscriptIndex {
  messages: IndexedTranscriptMessage[];
  totalMessages: number;
  relationships: IndexedSessionRelationship[];
}

interface TranscriptEntry {
  type?: unknown;
  uuid?: unknown;
  timestamp?: unknown;
  message?: unknown;
  sessionId?: unknown;
  sourceToolAssistantUUID?: unknown;
  agentId?: unknown;
  slug?: unknown;
  team_name?: unknown;
  teammate_name?: unknown;
  teamName?: unknown;
  teammateName?: unknown;
}

function defaultProjectsRoot(): string {
  return resolve(homedir(), ".claude", "projects");
}

export function encodeProjectPath(projectPath: string): string {
  return projectPath.replace(/[^A-Za-z0-9]/g, "-");
}

export function getRootTranscriptPath(
  sessionId: string,
  cwd?: string,
  projectsRoot = defaultProjectsRoot()
): string | undefined {
  if (!cwd) return undefined;
  return join(projectsRoot, encodeProjectPath(cwd), `${sessionId}.jsonl`);
}

export async function listTranscriptPaths(
  sessionId: string,
  cwd?: string,
  projectsRoot = defaultProjectsRoot()
): Promise<{ rootPath?: string; sidechainPaths: string[] }> {
  const rootPath = getRootTranscriptPath(sessionId, cwd, projectsRoot);
  if (!rootPath) {
    return { rootPath: undefined, sidechainPaths: [] };
  }

  const sidechainDir = join(projectsRoot, encodeProjectPath(cwd ?? ""), sessionId, "subagents");
  let sidechainPaths: string[] = [];

  try {
    const entries = await readdir(sidechainDir, { withFileTypes: true });
    sidechainPaths = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
      .map((entry) => join(sidechainDir, entry.name))
      .sort();
  } catch {
    sidechainPaths = [];
  }

  return { rootPath, sidechainPaths };
}

export async function readIndexedTranscripts(
  session: { sessionId: string; cwd?: string },
  options?: { limit?: number; projectsRoot?: string }
): Promise<SessionTranscriptIndex | undefined> {
  const { rootPath, sidechainPaths } = await listTranscriptPaths(
    session.sessionId,
    session.cwd,
    options?.projectsRoot
  );

  if (!rootPath) return undefined;

  const transcriptPaths = [rootPath, ...sidechainPaths];
  const messages: IndexedTranscriptMessage[] = [];
  const relationships: IndexedSessionRelationship[] = [];

  for (const transcriptPath of transcriptPaths) {
    const parsed = await parseTranscriptFile(session.sessionId, transcriptPath);
    if (!parsed) continue;

    messages.push(...parsed.messages);

    if (parsed.relationship) {
      relationships.push(parsed.relationship);
    }
  }

  messages.sort((a, b) => {
    if (a.timestamp !== b.timestamp) {
      return a.timestamp - b.timestamp;
    }
    return a.id.localeCompare(b.id);
  });

  const limit = options?.limit;
  const limitedMessages = limit === undefined ? messages : messages.slice(0, limit);

  return {
    messages: limitedMessages,
    totalMessages: messages.length,
    relationships,
  };
}

async function parseTranscriptFile(
  sessionId: string,
  transcriptPath: string
): Promise<{ messages: IndexedTranscriptMessage[]; relationship?: IndexedSessionRelationship }> {
  let content: string;
  let fileStat;

  try {
    [content, fileStat] = await Promise.all([
      readFile(transcriptPath, "utf8"),
      stat(transcriptPath),
    ]);
  } catch {
    return { messages: [] };
  }

  const lines = content.split("\n").filter(Boolean);
  const normalizedPath = transcriptPath.split(/[\\/]+/);
  const subagentIndex = normalizedPath.lastIndexOf("subagents");
  const isSidechain =
    subagentIndex >= 1 && normalizedPath[subagentIndex - 1] === sessionId;
  const messages: IndexedTranscriptMessage[] = [];
  let startedAt: number | undefined;
  let relationshipAgentId: string | undefined;
  let relationshipSlug: string | undefined;
  let sourceToolAssistantUUID: string | undefined;
  let relationshipTeamName: string | undefined;
  let relationshipTeammateName: string | undefined;

  for (let index = 0; index < lines.length; index++) {
    let entry: TranscriptEntry;
    try {
      entry = JSON.parse(lines[index]) as TranscriptEntry;
    } catch {
      continue;
    }

    const timestamp = parseTranscriptTimestamp(entry.timestamp, fileStat.mtimeMs, index);
    if (startedAt === undefined || timestamp < startedAt) {
      startedAt = timestamp;
    }

    if (!relationshipAgentId && typeof entry.agentId === "string") {
      relationshipAgentId = entry.agentId;
    }
    if (!relationshipSlug && typeof entry.slug === "string") {
      relationshipSlug = entry.slug;
    }
    if (
      !sourceToolAssistantUUID &&
      typeof entry.sourceToolAssistantUUID === "string"
    ) {
      sourceToolAssistantUUID = entry.sourceToolAssistantUUID;
    }
    if (!relationshipTeamName) {
      relationshipTeamName = coerceString(entry.team_name) ?? coerceString(entry.teamName);
    }
    if (!relationshipTeammateName) {
      relationshipTeammateName =
        coerceString(entry.teammate_name) ?? coerceString(entry.teammateName);
    }

    if (entry.type !== "user" && entry.type !== "assistant") {
      continue;
    }

    const text = extractTextContent(entry.message);
    const tools = extractToolUses(entry.message);
    const toolNames = tools.map((tool) => tool.name).join(",");
    const rawSessionId =
      typeof entry.sessionId === "string" ? entry.sessionId : sessionId;

    messages.push({
      id:
        typeof entry.uuid === "string"
          ? entry.uuid
          : `${basename(transcriptPath, ".jsonl")}:${index}`,
      sessionId: rawSessionId,
      role: entry.type,
      contentPreview: text.slice(0, 500),
      toolNames: toolNames || undefined,
      timestamp,
    });
  }

  if (!isSidechain) {
    return { messages };
  }

  return {
    messages,
    relationship: {
      id: `${sessionId}:${basename(transcriptPath)}`,
      sessionId,
      relationshipType: "subagent",
      path: transcriptPath,
      agentId: relationshipAgentId,
      slug: relationshipSlug,
      sourceToolAssistantUUID,
      teamName: relationshipTeamName,
      teammateName: relationshipTeammateName,
      startedAt,
      lastModified: fileStat.mtimeMs,
    },
  };
}

function parseTranscriptTimestamp(
  value: unknown,
  fallbackTimestamp: number,
  index: number
): number {
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return fallbackTimestamp + index;
}

function coerceString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
