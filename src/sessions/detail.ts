/**
 * Session detail building from raw transcript history.
 *
 * This module reads Claude transcript JSONL files directly and turns them into
 * a UI-friendly transcript + inspector model. It deliberately avoids the old
 * indexed preview store so the detail page can act as a source-of-truth view.
 */

import { discoverTranscriptFiles } from "../analytics/backfill/transcript-discovery.js";
import { parseTranscriptFile } from "../analytics/backfill/transcript-parser.js";
import { extractTextContent, extractToolUses } from "./messages.js";
import { encodeProjectPath } from "./transcripts.js";
import { getSession } from "./info.js";
import type { SessionMetadataEntry } from "../store/db.js";
import type {
  SessionDetailConfiguration,
  SessionDetailError,
  SessionDetailFileChange,
  SessionDetailFileSummary,
  SessionDetailLineage,
  SessionDetailResponse,
  SessionDetailSkillSummary,
  SessionDetailSubagentSummary,
  SessionDetailToolSummary,
  SessionTranscriptMessage,
  SessionTranscriptRole,
  SessionTranscriptTurn,
  SessionTranscriptToolResult,
  SessionTranscriptToolUse,
  SessionInfo,
  SessionTranscriptKind,
} from "../types/sessions.js";

type TranscriptDescriptor = Awaited<ReturnType<typeof discoverTranscriptFiles>>[number];

const FILE_TOOL_ACTIONS: Record<string, SessionDetailFileChange["action"]> = {
  Write: "write",
  Edit: "edit",
  MultiEdit: "multi_edit",
  NotebookEdit: "notebook_edit",
};

const FILE_PATH_KEYS = new Set([
  "file_path",
  "filePath",
  "path",
  "file",
  "notebook_path",
  "notebookPath",
  "target_file",
  "targetFile",
  "source_path",
  "sourcePath",
]);

const FILE_LIST_KEYS = new Set([
  "files",
  "paths",
  "file_paths",
  "filePaths",
  "notebook_paths",
  "notebookPaths",
]);

export interface BuildSessionDetailOptions {
  dir?: string;
  projectsRoot?: string;
  rootSessionId?: string;
  metadata?: SessionMetadataEntry[];
}

interface RawTranscriptRecord {
  dedupeKey: string;
  sessionId: string;
  rootSessionId: string;
  transcriptKind: SessionTranscriptKind;
  projectKey: string;
  transcriptPath: string;
  lineNumber: number;
  timestamp: number;
  eventType: string;
  eventSubtype?: string;
  uuid?: string;
  sourceToolAssistantUUID?: string;
  agentId?: string;
  slug?: string;
  teamName?: string;
  teammateName?: string;
  payload: Record<string, unknown>;
}

interface NormalizedSessionData {
  sessionId: string;
  rootSessionId: string;
  transcriptKind: SessionTranscriptKind;
  projectKey?: string;
  transcriptPath: string;
  transcriptPaths: string[];
  records: RawTranscriptRecord[];
  messages: SessionTranscriptMessage[];
  turns: SessionTranscriptTurn[];
  files: SessionDetailFileSummary[];
  tools: SessionDetailToolSummary[];
  errors: SessionDetailError[];
  skills: SessionDetailSkillSummary[];
  subagents: SessionDetailSubagentSummary[];
  lineage: SessionDetailLineage;
  configuration: SessionDetailConfiguration;
}

function coerceString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseTimestamp(value: unknown, fallbackTimestamp: number, index: number): number {
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  return fallbackTimestamp + index;
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (value === null || value === undefined) {
    return "";
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function toRawRecord(payload: Record<string, unknown>, record: RawTranscriptRecord): Record<string, unknown> {
  return {
    ...payload,
    dedupeKey: record.dedupeKey,
    sessionId: record.sessionId,
    rootSessionId: record.rootSessionId,
    transcriptKind: record.transcriptKind,
    projectKey: record.projectKey,
    transcriptPath: record.transcriptPath,
    lineNumber: record.lineNumber,
    timestamp: record.timestamp,
    eventType: record.eventType,
    eventSubtype: record.eventSubtype,
    uuid: record.uuid,
    sourceToolAssistantUUID: record.sourceToolAssistantUUID,
    agentId: record.agentId,
    slug: record.slug,
    teamName: record.teamName,
    teammateName: record.teammateName,
  };
}

function pickMessagePayload(payload: Record<string, unknown>): unknown {
  if (payload.message !== undefined) {
    return payload.message;
  }

  if (payload.content !== undefined) {
    return payload.content;
  }

  return payload;
}

function extractToolResults(payload: Record<string, unknown>): SessionTranscriptToolResult[] {
  const messagePayload = payload.message;
  if (!isPlainObject(messagePayload)) {
    return [];
  }

  const content = messagePayload.content;
  if (!Array.isArray(content)) {
    return [];
  }

  return content
    .filter((block): block is Record<string, unknown> =>
      isPlainObject(block) && block.type === "tool_result")
    .map((block) => {
      const contentValue = block.content;
      const contentText = typeof contentValue === "string"
        ? contentValue
        : extractTextContent(contentValue);

      return {
        toolUseId: coerceString(block.tool_use_id) ?? "",
        isError: block.is_error === true,
        content: contentText || stringifyUnknown(contentValue),
      };
    })
    .filter((result) => result.toolUseId.length > 0);
}

function extractSkillNames(payload: Record<string, unknown>): string[] {
  const names = new Set<string>();
  const keys = [
    "skill",
    "skillName",
    "skill_name",
    "loadedSkill",
    "loaded_skill",
  ];

  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim().length > 0) {
      names.add(value.trim());
      continue;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === "string" && entry.trim().length > 0) {
          names.add(entry.trim());
        }
      }
    }
  }

  const messageText = extractTextContent(pickMessagePayload(payload));
  for (const match of messageText.matchAll(/(?:loaded|using)\s+skill[:\s]+([A-Za-z0-9_.-]+)/gi)) {
    const name = match[1]?.trim();
    if (name) {
      names.add(name);
    }
  }

  return [...names];
}

function collectCandidatePaths(value: unknown, out: Set<string>): void {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length > 0 && /[\\/]/.test(trimmed)) {
      out.add(trimmed);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectCandidatePaths(entry, out);
    }
    return;
  }

  if (!isPlainObject(value)) {
    return;
  }

  for (const [key, nested] of Object.entries(value)) {
    if (typeof nested === "string" && nested.trim().length > 0) {
      if (FILE_PATH_KEYS.has(key)) {
        out.add(nested.trim());
      }
      continue;
    }

    if (Array.isArray(nested)) {
      if (FILE_LIST_KEYS.has(key)) {
        for (const entry of nested) {
          collectCandidatePaths(entry, out);
        }
      } else {
        for (const entry of nested) {
          collectCandidatePaths(entry, out);
        }
      }
      continue;
    }

    if (isPlainObject(nested)) {
      collectCandidatePaths(nested, out);
    }
  }
}

function extractFileChangesFromToolUse(
  toolUse: SessionTranscriptToolUse,
  timestamp: number
): SessionDetailFileChange[] {
  const action = FILE_TOOL_ACTIONS[toolUse.name];
  if (!action) {
    return [];
  }

  const paths = new Set<string>();
  collectCandidatePaths(toolUse.input, paths);

  return [...paths].map((path) => ({
    path,
    action,
    toolName: toolUse.name,
    toolUseId: toolUse.id,
    timestamp,
  }));
}

function isPromptLikeUserEvent(record: RawTranscriptRecord, text: string): boolean {
  return record.eventType === "user" && text.trim().length > 0 && extractToolResults(record.payload).length === 0;
}

function makeInteractionId(sessionId: string, index: number): string {
  return `${sessionId}:interaction:${index}`;
}

function normalizeRole(record: RawTranscriptRecord, isPromptLike: boolean): SessionTranscriptRole {
  if (record.eventType === "assistant") {
    return "assistant";
  }

  if (record.eventType === "system") {
    return "system";
  }

  if (record.eventType === "user") {
    return isPromptLike ? "user" : "runtime";
  }

  return "runtime";
}

function getErrorKind(record: RawTranscriptRecord, toolResults: SessionTranscriptToolResult[]): SessionDetailError["kind"] | undefined {
  if (record.eventType === "assistant" && coerceString(record.payload.error)) {
    return "api_error";
  }

  if (record.eventSubtype === "api_error" || record.payload.isApiErrorMessage === true) {
    return "api_error";
  }

  if (toolResults.some((result) => result.isError)) {
    return "tool_error";
  }

  if (record.eventType === "system" && record.eventSubtype) {
    return "system_error";
  }

  return undefined;
}

function extractErrorMessage(
  record: RawTranscriptRecord,
  text: string,
  toolResults: SessionTranscriptToolResult[]
): string {
  if (record.eventType === "assistant" && coerceString(record.payload.error)) {
    return text || record.payload.error as string;
  }

  if (record.eventSubtype === "api_error") {
    return text || coerceString(record.payload.error) || "API error";
  }

  const toolError = toolResults.find((result) => result.isError);
  if (toolError) {
    return toolError.content || "Tool result reported an error";
  }

  if (record.eventType === "system" && record.eventSubtype) {
    return text || record.eventSubtype;
  }

  return text;
}

function normalizeRecords(
  records: RawTranscriptRecord[]
): {
  messages: SessionTranscriptMessage[];
  turns: SessionTranscriptTurn[];
  files: SessionDetailFileSummary[];
  tools: SessionDetailToolSummary[];
  errors: SessionDetailError[];
  skills: SessionDetailSkillSummary[];
  firstSeenAt: number;
  lastSeenAt: number;
} {
  const messages: SessionTranscriptMessage[] = [];
  const turnsByInteraction = new Map<string, SessionTranscriptMessage[]>();
  const fileSummaries = new Map<string, SessionDetailFileSummary>();
  const toolSummaries = new Map<string, SessionDetailToolSummary>();
  const skillSummaries = new Map<string, SessionDetailSkillSummary>();
  const errors: SessionDetailError[] = [];

  let interactionIndex = 0;
  let currentInteractionId = "";
  let firstSeenAt = Number.POSITIVE_INFINITY;
  let lastSeenAt = 0;

  for (const [index, record] of records.entries()) {
    const payload = record.payload;
    const rawMessage = pickMessagePayload(payload);
    const text = extractTextContent(rawMessage).trim();
    const toolUses = extractToolUses(rawMessage).map((toolUse) => ({
      id: toolUse.id,
      name: toolUse.name,
      input: toolUse.input,
    }));
    const toolResults = extractToolResults(payload);
    const promptLike = isPromptLikeUserEvent(record, text);

    if (!currentInteractionId) {
      interactionIndex += 1;
      currentInteractionId = makeInteractionId(record.sessionId, interactionIndex);
    } else if (promptLike && messages.length > 0) {
      interactionIndex += 1;
      currentInteractionId = makeInteractionId(record.sessionId, interactionIndex);
    }

    const messageTimestamp = record.timestamp;
    firstSeenAt = Math.min(firstSeenAt, messageTimestamp);
    lastSeenAt = Math.max(lastSeenAt, messageTimestamp);

    const fileChanges = toolUses.flatMap((toolUse) =>
      extractFileChangesFromToolUse(toolUse, messageTimestamp)
    );
    const skillNames = extractSkillNames(payload);
    const errorKind = getErrorKind(record, toolResults);
    const messageErrors: SessionDetailError[] = [];

    if (errorKind) {
      messageErrors.push({
        id: record.dedupeKey,
        kind: errorKind,
        message: extractErrorMessage(record, text, toolResults),
        timestamp: messageTimestamp,
        toolName:
          toolResults.find((result) => result.isError)?.toolUseId
          ? toolUses.find((toolUse) => toolUse.id === toolResults.find((result) => result.isError)?.toolUseId)?.name
          : undefined,
        toolUseId: toolResults.find((result) => result.isError)?.toolUseId,
        eventType: record.eventType,
        eventSubtype: record.eventSubtype,
        sourceDedupeKey: record.dedupeKey,
      });
    }

    const message: SessionTranscriptMessage = {
      id: record.uuid ?? record.dedupeKey,
      sessionId: record.sessionId,
      rootSessionId: record.rootSessionId,
      transcriptKind: record.transcriptKind,
      interactionId: currentInteractionId,
      role: normalizeRole(record, promptLike),
      eventType: record.eventType,
      eventSubtype: record.eventSubtype,
      timestamp: messageTimestamp,
      text,
      raw: toRawRecord(payload, record),
      toolUses,
      toolResults,
      fileChanges,
      errors: messageErrors,
      skillNames,
      agentId: record.agentId,
      slug: record.slug,
      sourceToolAssistantUUID: record.sourceToolAssistantUUID,
      teamName: record.teamName,
      teammateName: record.teammateName,
      isPromptLikeUserEvent: promptLike,
    };

    messages.push(message);

    if (!turnsByInteraction.has(currentInteractionId)) {
      turnsByInteraction.set(currentInteractionId, []);
    }
    turnsByInteraction.get(currentInteractionId)!.push(message);

    for (const fileChange of fileChanges) {
      const key = `${fileChange.path}|${fileChange.action}|${fileChange.toolName}`;
      const existing = fileSummaries.get(key);
      if (existing) {
        existing.count += 1;
        existing.lastSeenAt = Math.max(existing.lastSeenAt, fileChange.timestamp);
        existing.sessionIds = uniquePush(existing.sessionIds, record.sessionId);
        continue;
      }

      fileSummaries.set(key, {
        path: fileChange.path,
        action: fileChange.action,
        toolName: fileChange.toolName,
        toolUseId: fileChange.toolUseId,
        count: 1,
        firstSeenAt: fileChange.timestamp,
        lastSeenAt: fileChange.timestamp,
        sessionIds: [record.sessionId],
      });
    }

    for (const toolUse of toolUses) {
      const key = toolUse.name;
      const existing = toolSummaries.get(key);
      if (existing) {
        existing.callCount += 1;
        existing.lastSeenAt = Math.max(existing.lastSeenAt, messageTimestamp);
        existing.sessionIds = uniquePush(existing.sessionIds, record.sessionId);
      } else {
        toolSummaries.set(key, {
          toolName: toolUse.name,
          callCount: 1,
          errorCount: 0,
          lastSeenAt: messageTimestamp,
          sessionIds: [record.sessionId],
        });
      }
    }

    for (const toolResult of toolResults) {
      if (!toolResult.isError) {
        continue;
      }
      const sourceTool = toolUses.find((toolUse) => toolUse.id === toolResult.toolUseId);
      if (!sourceTool) {
        continue;
      }
      const existing = toolSummaries.get(sourceTool.name);
      if (existing) {
        existing.errorCount += 1;
        existing.lastSeenAt = Math.max(existing.lastSeenAt, messageTimestamp);
      }
    }

    for (const skillName of skillNames) {
      const existing = skillSummaries.get(skillName);
      if (existing) {
        existing.count += 1;
        existing.lastSeenAt = Math.max(existing.lastSeenAt, messageTimestamp);
        existing.sessionIds = uniquePush(existing.sessionIds, record.sessionId);
        continue;
      }

      skillSummaries.set(skillName, {
        name: skillName,
        count: 1,
        firstSeenAt: messageTimestamp,
        lastSeenAt: messageTimestamp,
        sessionIds: [record.sessionId],
      });
    }

    errors.push(...messageErrors);
  }

  const turns = [...turnsByInteraction.entries()].map(([interactionId, groupedMessages], index) => {
    const messageIds = groupedMessages.map((message) => message.id);
    const startedAt = groupedMessages[0]?.timestamp ?? 0;
    const endedAt = groupedMessages[groupedMessages.length - 1]?.timestamp ?? startedAt;
    const role = deriveTurnRole(groupedMessages);
    const textParts = groupedMessages
      .map((message) => message.text)
      .filter((value) => value.trim().length > 0);
    const toolNames = uniqueStrings(groupedMessages.flatMap((message) => message.toolUses.map((toolUse) => toolUse.name)));
    const filePaths = uniqueStrings(groupedMessages.flatMap((message) => message.fileChanges.map((fileChange) => fileChange.path)));
    const skillNames = uniqueStrings(groupedMessages.flatMap((message) => message.skillNames));
    const errorCount = groupedMessages.reduce((count, message) => count + message.errors.length, 0);

    return {
      id: `${interactionId}:turn:${index + 1}`,
      interactionId,
      sessionId: groupedMessages[0]?.sessionId ?? "",
      rootSessionId: groupedMessages[0]?.rootSessionId ?? "",
      transcriptKind: groupedMessages[0]?.transcriptKind ?? "root",
      startedAt,
      endedAt,
      messageIds,
      messageCount: groupedMessages.length,
      role,
      title: buildTurnTitle(groupedMessages),
      summary: buildTurnSummary(groupedMessages),
      text: textParts.join("\n"),
      messages: groupedMessages,
      toolNames,
      filePaths,
      errorCount,
      skillNames,
    } satisfies SessionTranscriptTurn;
  });

  const files = [...fileSummaries.values()].sort(sortDescendingByLastSeen);
  const tools = [...toolSummaries.values()].sort(sortDescendingByLastSeen);
  const skills = [...skillSummaries.values()].sort(sortDescendingByLastSeen);

  return {
    messages,
    turns: turns.sort((left, right) => left.startedAt - right.startedAt),
    files,
    tools,
    errors: errors.sort((left, right) => left.timestamp - right.timestamp),
    skills,
    firstSeenAt: Number.isFinite(firstSeenAt) ? firstSeenAt : 0,
    lastSeenAt,
  };
}

function deriveTurnRole(messages: SessionTranscriptMessage[]): SessionTranscriptRole {
  if (messages.some((message) => message.role === "assistant")) {
    return "assistant";
  }

  if (messages.some((message) => message.role === "user")) {
    return "user";
  }

  if (messages.some((message) => message.role === "system")) {
    return "system";
  }

  return "runtime";
}

function buildTurnTitle(messages: SessionTranscriptMessage[]): string {
  const assistantMessage = messages.find((message) => message.role === "assistant" && message.text);
  if (assistantMessage) {
    return truncateSummary(assistantMessage.text);
  }

  const userMessage = messages.find((message) => message.role === "user" && message.text);
  if (userMessage) {
    return truncateSummary(userMessage.text);
  }

  const textMessage = messages.find((message) => message.text);
  return textMessage ? truncateSummary(textMessage.text) : "Session turn";
}

function buildTurnSummary(messages: SessionTranscriptMessage[]): string {
  const summaryParts: string[] = [];
  const userMessage = messages.find((message) => message.role === "user" && message.text);
  const assistantMessage = messages.find((message) => message.role === "assistant" && message.text);

  if (userMessage?.text) {
    summaryParts.push(userMessage.text);
  }

  if (assistantMessage?.text) {
    summaryParts.push(assistantMessage.text);
  }

  if (summaryParts.length === 0) {
    const fallback = messages.find((message) => message.text)?.text ?? "";
    return truncateSummary(fallback || "Session activity");
  }

  return truncateSummary(summaryParts.join(" "));
}

function truncateSummary(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= 240) {
    return normalized;
  }
  return `${normalized.slice(0, 237)}...`;
}

function uniquePush(values: string[], value: string): string[] {
  if (values.includes(value)) {
    return values;
  }
  return [...values, value];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function sortDescendingByLastSeen(
  left: {
    lastSeenAt: number;
    count?: number;
    callCount?: number;
    messageCount?: number;
    sessionCount?: number;
  },
  right: {
    lastSeenAt: number;
    count?: number;
    callCount?: number;
    messageCount?: number;
    sessionCount?: number;
  }
): number {
  if (left.lastSeenAt !== right.lastSeenAt) {
    return right.lastSeenAt - left.lastSeenAt;
  }

  return getSortWeight(right) - getSortWeight(left);
}

function getSortWeight(value: {
  count?: number;
  callCount?: number;
  messageCount?: number;
  sessionCount?: number;
}): number {
  return value.count ?? value.callCount ?? value.messageCount ?? value.sessionCount ?? 0;
}

function buildSessionInfoFromTranscript(
  sessionId: string,
  descriptor: TranscriptDescriptor,
  records: RawTranscriptRecord[],
  existing?: SessionInfo
): SessionInfo {
  const firstTimestamp = records[0]?.timestamp ?? Date.now();
  const lastTimestamp = records[records.length - 1]?.timestamp ?? firstTimestamp;
  const firstUserText = records
    .filter((record) => record.eventType === "user")
    .map((record) => extractTextContent(pickMessagePayload(record.payload)).trim())
    .find((text) => text.length > 0);
  const firstAssistantText = records
    .filter((record) => record.eventType === "assistant")
    .map((record) => extractTextContent(pickMessagePayload(record.payload)).trim())
    .find((text) => text.length > 0);

  return {
    sessionId,
    summary: existing?.summary || firstUserText || firstAssistantText || sessionId,
    lastModified: existing?.lastModified ?? lastTimestamp,
    fileSize: existing?.fileSize,
    customTitle: existing?.customTitle,
    firstPrompt: existing?.firstPrompt ?? firstUserText ?? firstAssistantText,
    gitBranch: existing?.gitBranch,
    cwd: existing?.cwd,
    tag: existing?.tag,
    createdAt: existing?.createdAt ?? firstTimestamp,
  };
}

function buildSubagentSummaries(
  rootRecords: RawTranscriptRecord[],
  rootSessionId: string,
  rootDescriptorPathBySessionId: Map<string, string>
): SessionDetailSubagentSummary[] {
  const summaries = new Map<string, SessionDetailSubagentSummary>();

  for (const record of rootRecords) {
    if (record.transcriptKind !== "subagent") {
      continue;
    }

    const startedAt = record.timestamp;
    const existing = summaries.get(record.sessionId);
    if (existing) {
      existing.messageCount += 1;
      existing.lastModified = Math.max(existing.lastModified, startedAt);
      existing.startedAt = Math.min(existing.startedAt, startedAt);
      continue;
    }

    summaries.set(record.sessionId, {
      sessionId: record.sessionId,
      rootSessionId,
      transcriptKind: "subagent",
      agentId: record.agentId,
      slug: record.slug,
      teamName: record.teamName,
      teammateName: record.teammateName,
      sourceToolAssistantUUID: record.sourceToolAssistantUUID,
      transcriptPath: rootDescriptorPathBySessionId.get(record.sessionId),
      messageCount: 1,
      startedAt,
      lastModified: startedAt,
    });
  }

  return [...summaries.values()].sort((left, right) => {
    if (left.startedAt !== right.startedAt) {
      return left.startedAt - right.startedAt;
    }
    return left.sessionId.localeCompare(right.sessionId);
  });
}

function buildLineage(
  sessionId: string,
  rootSessionId: string,
  transcriptKind: SessionTranscriptKind,
  subagents: SessionDetailSubagentSummary[]
): SessionDetailLineage {
  return {
    kind: transcriptKind,
    sessionId,
    rootSessionId,
    parentSessionId: transcriptKind === "subagent" ? rootSessionId : undefined,
    subagentCount: subagents.length,
    subagents,
  };
}

function buildConfiguration(
  rootSessionId: string,
  transcriptKind: SessionTranscriptKind,
  descriptor: TranscriptDescriptor,
  sessionInfo: SessionInfo,
  records: RawTranscriptRecord[],
  transcriptPaths: string[],
  firstSeenAt: number,
  lastSeenAt: number
): SessionDetailConfiguration {
  const firstAssistant = records.find((record) => record.eventType === "assistant");
  const model = extractModelName(firstAssistant);

  return {
    cwd: sessionInfo.cwd,
    projectKey: descriptor.projectKey,
    customTitle: sessionInfo.customTitle,
    tag: sessionInfo.tag,
    firstPrompt: sessionInfo.firstPrompt,
    model,
    agentId: firstAssistant?.agentId,
    slug: firstAssistant?.slug,
    teamName: firstAssistant?.teamName,
    teammateName: firstAssistant?.teammateName,
    rootSessionId,
    transcriptKind,
    transcriptPath: descriptor.transcriptPath,
    transcriptPaths,
    firstSeenAt,
    lastSeenAt,
  };
}

function extractModelName(record?: RawTranscriptRecord): string | undefined {
  if (!record) {
    return undefined;
  }

  const messagePayload = record.payload.message;
  if (isPlainObject(messagePayload)) {
    return coerceString(messagePayload.model);
  }

  return coerceString(record.payload.model);
}

async function loadTranscriptRecords(
  descriptors: TranscriptDescriptor[]
): Promise<RawTranscriptRecord[]> {
  const parsed = await Promise.all(
    descriptors.map(async (descriptor) => ({
      descriptor,
      records: await parseTranscriptFile(descriptor),
    }))
  );

  const normalized: RawTranscriptRecord[] = [];

  for (const batch of parsed) {
    for (const record of batch.records) {
      normalized.push({
        dedupeKey: record.dedupeKey,
        sessionId: record.sessionId,
        rootSessionId: record.rootSessionId,
        transcriptKind: record.transcriptKind,
        projectKey: record.projectKey,
        transcriptPath: record.transcriptPath,
        lineNumber: record.lineNumber,
        timestamp: record.timestamp,
        eventType: record.eventType,
        eventSubtype: record.eventSubtype,
        uuid: record.uuid,
        sourceToolAssistantUUID: record.sourceToolAssistantUUID,
        agentId: record.agentId,
        slug: record.slug,
        teamName: record.teamName,
        teammateName: record.teammateName,
        payload: record.payload,
      });
    }
  }

  return normalized.sort((left, right) => {
    if (left.timestamp !== right.timestamp) {
      return left.timestamp - right.timestamp;
    }
    if (left.transcriptPath !== right.transcriptPath) {
      return left.transcriptPath.localeCompare(right.transcriptPath);
    }
    return left.lineNumber - right.lineNumber;
  });
}

async function discoverDetailDescriptors(options: {
  sessionId: string;
  rootSessionId?: string;
  projectKey?: string;
  projectsRoot?: string;
}): Promise<TranscriptDescriptor[]> {
  const rootScoped = await discoverTranscriptFiles({
    projectsRoot: options.projectsRoot,
    projectKey: options.projectKey,
    rootSessionId: options.rootSessionId,
  });

  if (rootScoped.length > 0) {
    return rootScoped;
  }

  const broad = await discoverTranscriptFiles({
    projectsRoot: options.projectsRoot,
    rootSessionId: options.rootSessionId,
  });

  if (options.projectKey) {
    const projectMatches = broad.filter((descriptor) => descriptor.projectKey === options.projectKey);
    if (projectMatches.length > 0) {
      return projectMatches;
    }
  }

  return broad;
}

function findTranscriptDescriptor(
  descriptors: TranscriptDescriptor[],
  sessionId: string
): TranscriptDescriptor | undefined {
  return descriptors.find((descriptor) => descriptor.sessionId === sessionId);
}

function buildDetailFromRecords(
  sessionId: string,
  descriptor: TranscriptDescriptor,
  allDescriptors: TranscriptDescriptor[],
  allRecords: RawTranscriptRecord[],
  sessionInfo: SessionInfo
): NormalizedSessionData {
  const targetRecords = allRecords.filter((record) => record.sessionId === sessionId);
  const normalizedTarget = normalizeRecords(targetRecords);
  const transcriptPaths = allDescriptors.map((entry) => entry.transcriptPath);
  const subagents = descriptor.transcriptKind === "root"
    ? buildSubagentSummaries(allRecords, descriptor.rootSessionId, new Map(allDescriptors.map((entry) => [entry.sessionId, entry.transcriptPath])))
    : [];

  const configuration = buildConfiguration(
    descriptor.rootSessionId,
    descriptor.transcriptKind,
    descriptor,
    sessionInfo,
    targetRecords,
    transcriptPaths,
    normalizedTarget.firstSeenAt,
    normalizedTarget.lastSeenAt
  );

  return {
    sessionId,
    rootSessionId: descriptor.rootSessionId,
    transcriptKind: descriptor.transcriptKind,
    projectKey: descriptor.projectKey,
    transcriptPath: descriptor.transcriptPath,
    transcriptPaths,
    records: targetRecords,
    messages: normalizedTarget.messages,
    turns: normalizedTarget.turns,
    files: normalizedTarget.files,
    tools: normalizedTarget.tools,
    errors: normalizedTarget.errors,
    skills: normalizedTarget.skills,
    subagents,
    lineage: buildLineage(
      sessionId,
      descriptor.rootSessionId,
      descriptor.transcriptKind,
      subagents
    ),
    configuration,
  };
}

export async function buildSessionDetail(
  sessionId: string,
  options?: BuildSessionDetailOptions
): Promise<SessionDetailResponse | undefined> {
  const existingSession = await getSession(sessionId, { dir: options?.dir });
  const projectKey = existingSession?.cwd ? encodeProjectPath(existingSession.cwd) : undefined;

  const descriptors = await discoverDetailDescriptors({
    sessionId,
    rootSessionId: options?.rootSessionId,
    projectKey,
    projectsRoot: options?.projectsRoot,
  });

  const targetDescriptor = findTranscriptDescriptor(descriptors, sessionId);
  if (!targetDescriptor) {
    return undefined;
  }

  const rootScopedDescriptors = await discoverTranscriptFiles({
    projectsRoot: options?.projectsRoot,
    projectKey: targetDescriptor.projectKey,
    rootSessionId: targetDescriptor.rootSessionId,
  });
  const relatedDescriptors = rootScopedDescriptors.length > 0 ? rootScopedDescriptors : descriptors;
  const relatedRecords = await loadTranscriptRecords(relatedDescriptors);
  const targetRecords = relatedRecords.filter((record) => record.sessionId === sessionId);
  const sessionInfo = buildSessionInfoFromTranscript(
    sessionId,
    targetDescriptor,
    targetRecords,
    existingSession
  );

  const detail = buildDetailFromRecords(
    sessionId,
    targetDescriptor,
    relatedDescriptors,
    relatedRecords,
    sessionInfo
  );

  return {
    sessionId,
    rootSessionId: detail.rootSessionId,
    session: sessionInfo,
    transcript: {
      messages: detail.messages,
      turns: detail.turns,
    },
    inspector: {
      files: detail.files,
      tools: detail.tools,
      errors: detail.errors,
      skills: detail.skills,
      configuration: detail.configuration,
      subagents: detail.subagents,
      metadata: options?.metadata ?? [],
    },
    lineage: detail.lineage,
  };
}
