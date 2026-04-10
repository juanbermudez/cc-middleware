export type TranscriptKind = "root" | "subagent";

export interface TranscriptFileDescriptor {
  projectKey: string;
  rootSessionId: string;
  sessionId: string;
  transcriptKind: TranscriptKind;
  transcriptPath: string;
}

export interface RawTranscriptEventRecord {
  dedupeKey: string;
  projectKey: string;
  rootSessionId: string;
  sessionId: string;
  transcriptKind: TranscriptKind;
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

export interface TranscriptImportStats {
  filesDiscovered: number;
  filesImported: number;
  eventsImported: number;
}

export interface TranscriptEventSink {
  writeRawTranscriptEvents(events: RawTranscriptEventRecord[]): Promise<void> | void;
}
