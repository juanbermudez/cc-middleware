import { generateId } from "../../utils/id.js";
import type {
  LiveAnalyticsCaptureOptions,
  LiveAnalyticsContext,
  LiveAnalyticsSink,
  LiveHookRecord,
  LivePermissionRecord,
  LiveSdkMessageRecord,
} from "./types.js";

function createNoopSink(): LiveAnalyticsSink {
  return {
    recordSdkMessage: () => undefined,
    recordHookEvent: () => undefined,
    recordPermissionEvent: () => undefined,
    flush: async () => undefined,
  };
}

let activeSink: LiveAnalyticsSink = createNoopSink();

export function setLiveAnalyticsSink(sink?: LiveAnalyticsSink): void {
  activeSink = sink ?? createNoopSink();
}

export function getLiveAnalyticsSink(): LiveAnalyticsSink {
  return activeSink;
}

export function normalizeLiveAnalyticsContext(
  options?: LiveAnalyticsCaptureOptions
): LiveAnalyticsContext {
  return {
    source: options?.source ?? "internal",
    captureRawMessages: options?.captureRawMessages ?? true,
    runId: options?.runId ?? generateId("analytics"),
    label: options?.label,
    sessionId: options?.sessionId,
    cwd: options?.cwd,
  };
}

export async function recordLiveSdkMessage(
  record: Omit<LiveSdkMessageRecord, "recordedAt">
): Promise<void> {
  if (!record.captureRawMessages) return;
  try {
    await Promise.resolve(getLiveAnalyticsSink().recordSdkMessage({
      ...record,
      recordedAt: Date.now(),
    }));
  } catch {
    // Live analytics capture must never break the session flow.
  }
}

export async function recordLiveHookEvent(
  record: Omit<LiveHookRecord, "recordedAt">
): Promise<void> {
  if (!record.captureRawMessages) return;
  try {
    await Promise.resolve(getLiveAnalyticsSink().recordHookEvent({
      ...record,
      recordedAt: Date.now(),
    }));
  } catch {
    // Live analytics capture must never break the session flow.
  }
}

export async function recordLivePermissionEvent(
  record: Omit<LivePermissionRecord, "recordedAt">
): Promise<void> {
  if (!record.captureRawMessages) return;
  try {
    await Promise.resolve(getLiveAnalyticsSink().recordPermissionEvent({
      ...record,
      recordedAt: Date.now(),
    }));
  } catch {
    // Live analytics capture must never break the session flow.
  }
}

export interface MemoryLiveAnalyticsSink {
  sink: LiveAnalyticsSink;
  records: {
    sdkMessages: LiveSdkMessageRecord[];
    hookEvents: LiveHookRecord[];
    permissionEvents: LivePermissionRecord[];
  };
  clear(): void;
}

export function createMemoryLiveAnalyticsSink(): MemoryLiveAnalyticsSink {
  const records = {
    sdkMessages: [] as LiveSdkMessageRecord[],
    hookEvents: [] as LiveHookRecord[],
    permissionEvents: [] as LivePermissionRecord[],
  };

  return {
    sink: {
      recordSdkMessage: async (record) => {
        records.sdkMessages.push(record);
      },
      recordHookEvent: async (record) => {
        records.hookEvents.push(record);
      },
      recordPermissionEvent: async (record) => {
        records.permissionEvents.push(record);
      },
      flush: async () => undefined,
    },
    records,
    clear: () => {
      records.sdkMessages.length = 0;
      records.hookEvents.length = 0;
      records.permissionEvents.length = 0;
    },
  };
}

