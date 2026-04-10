import { readFile, stat } from "node:fs/promises";
import type { RawTranscriptEventRecord, TranscriptFileDescriptor } from "./types.js";

type TranscriptEntry = Record<string, unknown>;

function parseTimestamp(
  entry: TranscriptEntry,
  fallbackTimestamp: number,
  index: number
): number {
  const rawTimestamp = entry.timestamp;
  if (typeof rawTimestamp === "string") {
    const parsed = Date.parse(rawTimestamp);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return fallbackTimestamp + index;
}

function coerceString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readSessionId(
  entry: TranscriptEntry,
  descriptor: TranscriptFileDescriptor
): string {
  return (
    coerceString(entry.sessionId)
    ?? coerceString(entry.session_id)
    ?? descriptor.sessionId
  );
}

export async function parseTranscriptFile(
  descriptor: TranscriptFileDescriptor
): Promise<RawTranscriptEventRecord[]> {
  let content: string;
  let fileStat;

  try {
    [content, fileStat] = await Promise.all([
      readFile(descriptor.transcriptPath, "utf8"),
      stat(descriptor.transcriptPath),
    ]);
  } catch {
    return [];
  }

  const lines = content.split("\n").filter(Boolean);
  const records: RawTranscriptEventRecord[] = [];

  for (let index = 0; index < lines.length; index++) {
    let payload: TranscriptEntry;
    try {
      payload = JSON.parse(lines[index]) as TranscriptEntry;
    } catch {
      continue;
    }

    const lineNumber = index + 1;
    const timestamp = parseTimestamp(payload, fileStat.mtimeMs, index);
    const eventType = coerceString(payload.type) ?? "unknown";
    const eventSubtype = coerceString(payload.subtype);
    const sessionId = readSessionId(payload, descriptor);
    const teamName = coerceString(payload.team_name) ?? coerceString(payload.teamName);
    const teammateName =
      coerceString(payload.teammate_name) ?? coerceString(payload.teammateName);

    records.push({
      dedupeKey: [
        descriptor.rootSessionId,
        descriptor.transcriptKind,
        descriptor.transcriptPath,
        String(lineNumber),
      ].join(":"),
      projectKey: descriptor.projectKey,
      rootSessionId: descriptor.rootSessionId,
      sessionId,
      transcriptKind: descriptor.transcriptKind,
      transcriptPath: descriptor.transcriptPath,
      lineNumber,
      timestamp,
      eventType,
      eventSubtype,
      uuid: coerceString(payload.uuid),
      sourceToolAssistantUUID: coerceString(payload.sourceToolAssistantUUID),
      agentId: coerceString(payload.agentId),
      slug: coerceString(payload.slug),
      teamName,
      teammateName,
      payload,
    });
  }

  return records;
}
