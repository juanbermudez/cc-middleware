import type { HookEventType, HookInput } from "../../types/hooks.js";

export type LiveAnalyticsSource = "api" | "websocket" | "plugin" | "cli" | "internal";

export interface LiveAnalyticsCaptureOptions {
  source?: LiveAnalyticsSource;
  captureRawMessages?: boolean;
  label?: string;
  runId?: string;
  sessionId?: string;
  cwd?: string;
}

export interface LiveAnalyticsContext {
  source: LiveAnalyticsSource;
  captureRawMessages: boolean;
  runId: string;
  label?: string;
  sessionId?: string;
  cwd?: string;
}

export interface LiveSdkMessageRecord extends LiveAnalyticsContext {
  recordedAt: number;
  kind: "sdk_message";
  phase: "launch" | "streaming";
  messageType: string;
  message: unknown;
  prompt?: string;
}

export interface LiveHookRecord extends LiveAnalyticsContext {
  recordedAt: number;
  kind: "hook_event";
  eventType: HookEventType;
  input: HookInput;
}

export interface LivePermissionRecord extends LiveAnalyticsContext {
  recordedAt: number;
  kind: "permission_event";
  decision: "request" | "allow" | "deny";
  toolName: string;
  input: Record<string, unknown>;
  toolUseID?: string;
  agentID?: string;
  message?: string;
}

export interface LiveAnalyticsSink {
  recordSdkMessage(record: LiveSdkMessageRecord): void | Promise<void>;
  recordHookEvent(record: LiveHookRecord): void | Promise<void>;
  recordPermissionEvent(record: LivePermissionRecord): void | Promise<void>;
  flush?(): Promise<void>;
}

