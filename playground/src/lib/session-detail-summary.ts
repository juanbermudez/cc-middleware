import type {
  SessionDetailTranscriptField,
  SessionDetailTranscriptMessage,
  SessionDetailTranscriptTodoItem,
  SessionDetailTranscriptTurn,
} from "./playground";
import { normalizeTranscriptMarkupToMarkdown } from "./transcript-markdown";

function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, (block) =>
      block
        .replace(/^```[^\n]*\n?/, "")
        .replace(/\n?```$/, ""))
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function summarizeText(text: string | undefined, max = 160): string | undefined {
  if (!text) {
    return undefined;
  }

  const normalized = stripMarkdown(normalizeTranscriptMarkupToMarkdown(text));
  if (!normalized) {
    return undefined;
  }

  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

function findField(fields: SessionDetailTranscriptField[] | undefined, label: string): string | undefined {
  return fields?.find((field) => field.label === label)?.value;
}

function summarizeTodoItems(todoItems: SessionDetailTranscriptTodoItem[] | undefined): string | undefined {
  if (!todoItems || todoItems.length === 0) {
    return undefined;
  }

  const completed = todoItems.filter((item) => item.status === "completed").length;
  const inProgress = todoItems.filter((item) => item.status === "in_progress").length;
  const pending = todoItems.filter((item) => item.status === "pending").length;
  const fragments = [
    completed ? `${completed} completed` : undefined,
    inProgress ? `${inProgress} in progress` : undefined,
    pending ? `${pending} pending` : undefined,
  ].filter((value): value is string => Boolean(value));

  if (fragments.length === 0) {
    return `${todoItems.length} tasks`;
  }

  return `Task list update · ${fragments.join(" · ")}`;
}

function summarizeFiles(message: SessionDetailTranscriptMessage): string | undefined {
  const filePath = message.filePath ?? message.files?.[0];
  if (!filePath) {
    return undefined;
  }

  return `${message.title ?? "File activity"} · ${filePath}`;
}

function summarizeCommand(message: SessionDetailTranscriptMessage): string | undefined {
  const description = findField(message.fields, "Description");
  const command = message.codeBlocks?.[0]?.code.split("\n")[0]?.trim();
  const value = description || command;
  if (!value) {
    return message.title ?? "Run command";
  }

  return `${message.title ?? "Run command"} · ${value}`;
}

function summarizeResult(message: SessionDetailTranscriptMessage): string | undefined {
  const text = summarizeText(message.text ?? (typeof message.content === "string" ? message.content : undefined), 120);
  if (text) {
    return `${message.title ?? "Tool result"} · ${text}`;
  }
  return message.title ?? "Tool result";
}

export function summarizeTranscriptMessage(message: SessionDetailTranscriptMessage): string | undefined {
  switch (message.variant) {
    case "todo_list":
      return summarizeTodoItems(message.todoItems);
    case "command":
      return summarizeCommand(message);
    case "file_write":
    case "file_edit":
    case "file_read":
      return summarizeFiles(message);
    case "search": {
      const pattern = findField(message.fields, "Pattern");
      const path = findField(message.fields, "Path");
      return [message.title ?? "Search", pattern, path].filter(Boolean).join(" · ");
    }
    case "tool_result":
      return summarizeResult(message);
    case "system_event":
    case "note":
    case "skill":
    case "user_message":
    case "assistant_message":
      return summarizeText(message.text ?? (typeof message.content === "string" ? message.content : undefined));
    case "tool_use":
    default: {
      const direct = summarizeText(message.text ?? (typeof message.content === "string" ? message.content : undefined));
      if (direct) {
        return direct;
      }

      const toolName = message.toolName;
      if (toolName && message.title) {
        return `${message.title} · ${toolName}`;
      }

      return message.title;
    }
  }
}

export function summarizeTranscriptTurn(turn: SessionDetailTranscriptTurn): string | undefined {
  const messages = turn.messages ?? [];

  for (const message of messages) {
    const summary = summarizeTranscriptMessage(message);
    if (summary) {
      return summary;
    }
  }

  return summarizeText(turn.summary ?? turn.title ?? (typeof turn.content === "string" ? turn.content : undefined));
}
