import type { SessionDetailTranscriptMessage } from "./playground";

export type SessionChatTurn =
  | {
      kind: "user";
      id: string;
      timestamp: number;
      message: SessionDetailTranscriptMessage;
    }
  | {
      kind: "system";
      id: string;
      timestamp: number;
      message: SessionDetailTranscriptMessage;
    }
  | {
      kind: "assistant";
      id: string;
      timestamp: number;
      activities: SessionChatActivity[];
      response?: SessionDetailTranscriptMessage;
    };

export interface SessionChatActivity {
  id: string;
  kind:
    | "commentary"
    | "tool_use"
    | "tool_result"
    | "todo_list"
    | "file_write"
    | "file_edit"
    | "command"
    | "file_read"
    | "search"
    | "skill"
    | "note";
  timestamp: number;
  depth: number;
  message: SessionDetailTranscriptMessage;
}

function sortTimestamp(value: string | number | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }
  if (typeof value === "number") {
    return value;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getMessageKind(message: SessionDetailTranscriptMessage): SessionChatActivity["kind"] | "user" | "assistant" | "system" {
  switch (message.variant) {
    case "user_message":
      return "user";
    case "assistant_message":
      return "assistant";
    case "tool_use":
      return "tool_use";
    case "tool_result":
      return "tool_result";
    case "todo_list":
      return "todo_list";
    case "file_write":
      return "file_write";
    case "file_edit":
      return "file_edit";
    case "command":
      return "command";
    case "file_read":
      return "file_read";
    case "search":
      return "search";
    case "skill":
      return "skill";
    case "note":
      return "note";
    case "system_event":
      return "system";
    default: {
      const role = (message.role ?? "").toString().toLowerCase();
      if (role === "user") return "user";
      if (role === "assistant") return "assistant";
      if (role === "tool") return "tool_use";
      if (role === "error" || role === "system" || role === "subagent") return "system";
      return "note";
    }
  }
}

function isStandaloneSystemMessage(message: SessionDetailTranscriptMessage): boolean {
  const kind = getMessageKind(message);
  return kind === "system";
}

function pushResponseAsCommentary(
  currentTurn: Extract<SessionChatTurn, { kind: "assistant" }> | null
): void {
  if (!currentTurn?.response) {
    return;
  }

  currentTurn.activities.push({
    id: `${currentTurn.response.id}:commentary`,
    kind: "commentary",
    timestamp: sortTimestamp(currentTurn.response.timestamp),
    depth: 0,
    message: currentTurn.response,
  });
  currentTurn.response = undefined;
}

function recalculateActivityDepths(activities: SessionChatActivity[]): SessionChatActivity[] {
  const byToolUseId = new Map<string, SessionChatActivity>();

  for (const activity of activities) {
    if (activity.message.toolUseId) {
      byToolUseId.set(activity.message.toolUseId, activity);
    }
  }

  return activities.map((activity) => {
    let depth = 0;
    let parentToolUseId = activity.message.parentToolUseId;

    while (parentToolUseId && depth < 8) {
      depth += 1;
      parentToolUseId = byToolUseId.get(parentToolUseId)?.message.parentToolUseId;
    }

    return {
      ...activity,
      depth,
    };
  });
}

export function groupSessionChatTurns(messages: SessionDetailTranscriptMessage[]): SessionChatTurn[] {
  const sorted = [...messages].sort((left, right) => {
    const delta = sortTimestamp(left.timestamp) - sortTimestamp(right.timestamp);
    if (delta !== 0) {
      return delta;
    }

    return left.id.localeCompare(right.id);
  });

  const turns: SessionChatTurn[] = [];
  let currentTurn: Extract<SessionChatTurn, { kind: "assistant" }> | null = null;

  function flushCurrentTurn(): void {
    if (!currentTurn) {
      return;
    }

    currentTurn.activities = recalculateActivityDepths(
      [...currentTurn.activities].sort((left, right) => left.timestamp - right.timestamp)
    );
    turns.push(currentTurn);
    currentTurn = null;
  }

  function ensureAssistantTurn(message: SessionDetailTranscriptMessage) {
    if (currentTurn) {
      return currentTurn;
    }

    currentTurn = {
      kind: "assistant",
      id: `${message.id}:assistant-turn`,
      timestamp: sortTimestamp(message.timestamp),
      activities: [],
    };
    return currentTurn;
  }

  for (const message of sorted) {
    const messageKind = getMessageKind(message);
    const timestamp = sortTimestamp(message.timestamp);

    if (messageKind === "user") {
      flushCurrentTurn();
      turns.push({
        kind: "user",
        id: `${message.id}:user-turn`,
        timestamp,
        message,
      });
      continue;
    }

    if (isStandaloneSystemMessage(message)) {
      flushCurrentTurn();
      turns.push({
        kind: "system",
        id: `${message.id}:system-turn`,
        timestamp,
        message,
      });
      continue;
    }

    if (messageKind === "assistant") {
      const assistantTurn = ensureAssistantTurn(message);
      if (assistantTurn.response) {
        pushResponseAsCommentary(assistantTurn);
      }
      assistantTurn.response = message;
      assistantTurn.timestamp = Math.min(assistantTurn.timestamp, timestamp);
      continue;
    }

    const assistantTurn = ensureAssistantTurn(message);
    if (assistantTurn.response) {
      pushResponseAsCommentary(assistantTurn);
    }
    assistantTurn.activities.push({
      id: message.id,
      kind: messageKind,
      timestamp,
      depth: 0,
      message,
    });
    assistantTurn.timestamp = Math.min(assistantTurn.timestamp, timestamp);
  }

  flushCurrentTurn();

  return turns;
}
