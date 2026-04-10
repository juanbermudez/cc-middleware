import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Circle,
  FilePenLine,
  FilePlus2,
  FileSearch,
  ListTodo,
  MessageCircleDashed,
  Search,
  Sparkles,
  TerminalSquare,
  Wrench,
  XCircle,
} from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { SessionDetailCodeViewer } from "./session-detail-code-viewer";
import { SessionDetailMarkdown } from "./session-detail-markdown";
import type {
  SessionDetailTranscriptField,
  SessionDetailTranscriptMessage,
  SessionDetailTranscriptTodoItem,
  SessionDetailTranscriptTurn,
} from "../lib/playground";
import {
  type SessionChatActivity,
  type SessionChatTurn,
  groupSessionChatTurns,
} from "../lib/session-chat-turns";
import { cn, formatNumber, formatTimestamp, truncate } from "../lib/utils";
import { summarizeTranscriptMessage } from "../lib/session-detail-summary";

function statusVariant(status: string | undefined): "success" | "warning" | "destructive" | "info" | "outline" {
  if (status === "ok" || status === "completed" || status === "loaded") {
    return "success";
  }
  if (status === "error" || status === "failed") {
    return "destructive";
  }
  if (status === "in_progress" || status === "running") {
    return "warning";
  }
  if (status === "pending") {
    return "outline";
  }
  return "info";
}

function humanizeStatus(status: string | undefined): string {
  if (!status) {
    return "active";
  }

  return status.replace(/[_-]+/g, " ");
}

function messageContentToString(message: SessionDetailTranscriptMessage | undefined): string {
  if (!message) {
    return "";
  }
  if (typeof message.text === "string" && message.text.trim()) {
    return message.text;
  }
  if (typeof message.content === "string") {
    return message.content;
  }
  if (message.content && typeof message.content === "object") {
    try {
      return JSON.stringify(message.content, null, 2);
    } catch {
      return "[unserializable content]";
    }
  }
  if (Array.isArray(message.content)) {
    try {
      return JSON.stringify(message.content, null, 2);
    } catch {
      return "[unserializable content]";
    }
  }
  return "";
}

function compactMessageText(message: SessionDetailTranscriptMessage | undefined, max = 160): string {
  const content = messageContentToString(message).replace(/\s+/g, " ").trim();
  return truncate(content, max);
}

function variantLabel(message: SessionDetailTranscriptMessage | undefined): string {
  switch (message?.variant) {
    case "assistant_message":
      return "Assistant";
    case "tool_result":
      return "Tool result";
    case "todo_list":
      return "Task update";
    case "file_write":
      return "Create file";
    case "file_edit":
      return "Edit file";
    case "command":
      return "Run command";
    case "file_read":
      return "Read file";
    case "search":
      return "Search";
    case "skill":
      return "Skill";
    case "note":
      return "Note";
    case "system_event":
      return "System";
    default:
      return message?.toolName ?? "Activity";
  }
}

function renderFieldValue(value: string): string {
  return value.length > 120 ? truncate(value, 118) : value;
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

function normalizeDisplayText(value: string | undefined): string {
  return (value ?? "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isEquivalentDisplayText(left: string | undefined, right: string | undefined): boolean {
  const normalizedLeft = normalizeDisplayText(left);
  const normalizedRight = normalizeDisplayText(right);
  return Boolean(normalizedLeft) && normalizedLeft === normalizedRight;
}

function containsDisplayText(container: string | undefined, value: string | undefined): boolean {
  const normalizedContainer = normalizeDisplayText(container);
  const normalizedValue = normalizeDisplayText(value);
  if (!normalizedContainer || !normalizedValue) {
    return false;
  }

  return normalizedContainer === normalizedValue
    || normalizedContainer.startsWith(`${normalizedValue} `)
    || normalizedContainer.endsWith(` ${normalizedValue}`)
    || normalizedContainer.includes(` ${normalizedValue} `);
}

function isGenericPlaceholderText(value: string | undefined): boolean {
  const normalized = normalizeDisplayText(value);
  return normalized === "assistant"
    || normalized === "system"
    || normalized === "user"
    || normalized === "note"
    || normalized === "response";
}

function activitySummary(activity: SessionChatActivity): string | undefined {
  if (activity.kind === "commentary") {
    return compactMessageText(activity.message, 180);
  }

  return summarizeTranscriptMessage(activity.message)
    ?? activity.message.title
    ?? compactMessageText(activity.message, 180)
    ?? activity.message.toolName;
}

function activityIcon(activity: SessionChatActivity) {
  const status = activity.message.status;

  if (activity.kind === "commentary") {
    return messageContentToString(activity.message).trim()
      ? <MessageCircleDashed className="h-4 w-4 themed-subtle" />
      : <Circle className="h-4 w-4 themed-subtle" />;
  }

  if (status === "error" || status === "failed") {
    return <XCircle className="h-4 w-4 themed-error-ink" />;
  }

  if (status === "ok" || status === "completed" || status === "loaded") {
    return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  }

  switch (activity.kind) {
    case "todo_list":
      return <ListTodo className="h-4 w-4 themed-subtle" />;
    case "file_write":
      return <FilePlus2 className="h-4 w-4 themed-subtle" />;
    case "file_edit":
      return <FilePenLine className="h-4 w-4 themed-subtle" />;
    case "command":
      return <TerminalSquare className="h-4 w-4 themed-subtle" />;
    case "file_read":
      return <FileSearch className="h-4 w-4 themed-subtle" />;
    case "search":
      return <Search className="h-4 w-4 themed-subtle" />;
    case "skill":
      return <Sparkles className="h-4 w-4 themed-subtle" />;
    default:
      return <Wrench className="h-4 w-4 themed-subtle" />;
  }
}

function TranscriptFields(props: { fields?: SessionDetailTranscriptField[] }) {
  if (!props.fields || props.fields.length === 0) {
    return null;
  }

  return (
    <div className="session-detail-field-grid">
      {props.fields.map((field) => (
        <div key={`${field.label}:${field.value}`} className="session-detail-field-cell">
          <div className="session-detail-field-label">{field.label}</div>
          <div className="session-detail-field-value">{renderFieldValue(field.value)}</div>
        </div>
      ))}
    </div>
  );
}

function TodoListPreview(props: { items?: SessionDetailTranscriptTodoItem[] }) {
  if (!props.items || props.items.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {props.items.map((item, index) => (
        <div key={`${item.content}:${index}`} className="session-detail-todo-row">
          <Badge variant={statusVariant(item.status)} className="shrink-0 capitalize">
            {humanizeStatus(item.status)}
          </Badge>
          <div className="min-w-0 space-y-1">
            <div className="text-sm leading-6 themed-title">
              {item.content}
            </div>
            {item.activeForm && item.activeForm !== item.content ? (
              <div className="text-xs leading-5 themed-muted">
                {item.activeForm}
              </div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function FileBadgeRow(props: { files?: string[] }) {
  if (!props.files || props.files.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {props.files.map((file) => (
        <Badge key={file} variant="outline" className="max-w-full">
          {truncate(file, 64)}
        </Badge>
      ))}
    </div>
  );
}

function getDisplayFiles(
  message: SessionDetailTranscriptMessage,
  hideFiles: string[] = []
): string[] {
  const hiddenFiles = new Set(hideFiles);

  return (message.files ?? []).filter((file) => {
    if (hiddenFiles.has(file)) {
      return false;
    }

    if (message.filePath && file === message.filePath) {
      return false;
    }

    if (message.codeBlocks?.some((block) => block.path === file)) {
      return false;
    }

    return true;
  });
}

function shouldShowActivityBodyText(activity: SessionChatActivity): boolean {
  const text = messageContentToString(activity.message);
  return activity.kind !== "commentary"
    && Boolean(text)
    && (text.length > 120 || (activity.message.codeBlocks?.length ?? 0) === 0);
}

function hasActivityDetails(activity: SessionChatActivity, hideFiles: string[] = []): boolean {
  const message = activity.message;
  const displayFiles = getDisplayFiles(message, hideFiles);

  return shouldShowActivityBodyText(activity)
    || (message.fields?.length ?? 0) > 0
    || (message.todoItems?.length ?? 0) > 0
    || (message.codeBlocks?.length ?? 0) > 0
    || displayFiles.length > 0
    || Boolean(message.subagentSessionId);
}

function buildActivityHeader(activity: SessionChatActivity, statusOverride?: string) {
  const summary = activitySummary(activity);
  const title = activity.message.title?.trim() || undefined;
  const label = title ?? variantLabel(activity.message);
  const toolName = activity.message.toolName;
  const status = statusOverride ?? activity.message.status;
  const showLabel = activity.kind !== "commentary"
    && Boolean(label)
    && !isEquivalentDisplayText(label, summary);
  const showSummary = Boolean(summary)
    && !(activity.kind === "commentary" && isGenericPlaceholderText(summary));
  const headline = showSummary
    ? summary
    : showLabel
      ? label
      : toolName;
  const metaBits = [
    showLabel
      && !containsDisplayText(headline, label)
      ? label
      : null,
    toolName
      && !containsDisplayText(headline, toolName)
      && !containsDisplayText(label, toolName)
      ? toolName
      : null,
  ].filter(Boolean) as string[];

  return {
    headline,
    metaBits,
    status,
  };
}

function ActivityDetails(props: {
  activity: SessionChatActivity;
  onOpenSubagent?: (sessionId: string) => void;
  hideFiles?: string[];
}) {
  const { message } = props.activity;
  const text = messageContentToString(message);
  const displayFiles = getDisplayFiles(message, props.hideFiles);
  const shouldShowBodyText = shouldShowActivityBodyText(props.activity);
  const hasDetails = hasActivityDetails(props.activity, props.hideFiles);

  if (!hasDetails) {
    return null;
  }

  return (
    <div className="session-chat-activity-details">
      {shouldShowBodyText ? (
        text.includes("\n") || text.includes("```") ? (
          <SessionDetailMarkdown content={text} />
        ) : (
          <div className="text-sm leading-6 themed-body">
            {text}
          </div>
        )
      ) : null}

      <TranscriptFields fields={message.fields} />
      <TodoListPreview items={message.todoItems} />

      {message.codeBlocks?.length ? (
        <div className="space-y-3">
          {message.codeBlocks.map((block) => (
            <SessionDetailCodeViewer
              key={`${message.id}:${block.label}:${block.path ?? "inline"}`}
              label={block.label}
              code={block.code}
              language={block.language}
              path={block.path}
              showPathMeta={
                Boolean(block.path)
                && block.path !== message.filePath
                && !(props.hideFiles ?? []).includes(block.path)
              }
            />
          ))}
        </div>
      ) : null}

      <FileBadgeRow files={displayFiles} />

      {message.subagentSessionId && props.onOpenSubagent ? (
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 rounded-full px-3 text-xs"
            onClick={() => props.onOpenSubagent?.(message.subagentSessionId!)}
          >
            Open subagent
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

type PresentedActivity =
  | {
      kind: "single";
      id: string;
      activity: SessionChatActivity;
    }
  | {
      kind: "paired";
      id: string;
      activity: SessionChatActivity;
      nested: SessionChatActivity[];
      result: SessionChatActivity;
    };

function buildPresentedActivities(activities: SessionChatActivity[]): PresentedActivity[] {
  const items: PresentedActivity[] = [];

  for (let index = 0; index < activities.length; index += 1) {
    const activity = activities[index]!;

    if (activity.kind === "tool_result") {
      items.push({
        kind: "single",
        id: activity.id,
        activity,
      });
      continue;
    }

    const toolUseId = activity.message.toolUseId;
    if (!toolUseId) {
      items.push({
        kind: "single",
        id: activity.id,
        activity,
      });
      continue;
    }

    let pairIndex = -1;
    for (let nextIndex = index + 1; nextIndex < activities.length; nextIndex += 1) {
      const candidate = activities[nextIndex]!;
      if (candidate.depth < activity.depth) {
        break;
      }
      if (candidate.depth === activity.depth && candidate.kind === "tool_result" && candidate.message.toolUseId === toolUseId) {
        const nested = activities.slice(index + 1, nextIndex);
        if (nested.every((entry) => entry.depth > activity.depth)) {
          pairIndex = nextIndex;
        }
        break;
      }
    }

    if (pairIndex === -1) {
      items.push({
        kind: "single",
        id: activity.id,
        activity,
      });
      continue;
    }

    items.push({
      kind: "paired",
      id: `${activity.id}:${activities[pairIndex]!.id}:pair`,
      activity,
      nested: activities.slice(index + 1, pairIndex),
      result: activities[pairIndex]!,
    });
    index = pairIndex;
  }

  return items;
}

function ActivityHeadline(props: {
  header: ReturnType<typeof buildActivityHeader>;
}) {
  const { headline, metaBits, status } = props.header;

  if (!headline && metaBits.length === 0 && !status) {
    return null;
  }

  return (
    <>
      {headline || status ? (
        <div className="session-chat-activity-headline">
          {headline ? (
            <div className="min-w-0 text-sm font-medium leading-6 themed-title">
              {headline}
            </div>
          ) : null}
          {status ? (
            <div
              className={cn(
                "session-chat-inline-status",
                status === "error" || status === "failed"
                  ? "session-chat-inline-status-error"
                  : status === "ok" || status === "completed" || status === "loaded"
                    ? "session-chat-inline-status-success"
                    : "session-chat-inline-status-neutral"
              )}
            >
              {humanizeStatus(status)}
            </div>
          ) : null}
        </div>
      ) : null}

      {metaBits.length > 0 ? (
        <div className="session-chat-inline-meta">
          {metaBits.join(" · ")}
        </div>
      ) : null}
    </>
  );
}

function SingleActivityRow(props: {
  activity: SessionChatActivity;
  onOpenSubagent?: (sessionId: string) => void;
}) {
  const header = buildActivityHeader(props.activity);

  if (
    !header.headline
    && header.metaBits.length === 0
    && !header.status
    && !hasActivityDetails(props.activity)
  ) {
    return null;
  }

  return (
    <div className="session-chat-activity-row" style={{ paddingLeft: `${props.activity.depth * 16}px` }}>
      <div className="session-chat-activity-icon">
        {activityIcon(props.activity)}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <ActivityHeadline header={header} />
        <ActivityDetails activity={props.activity} onOpenSubagent={props.onOpenSubagent} />
      </div>
    </div>
  );
}

function MergedActivityRow(props: {
  activity: SessionChatActivity;
  nested: SessionChatActivity[];
  result: SessionChatActivity;
  onOpenSubagent?: (sessionId: string) => void;
}) {
  const header = buildActivityHeader(props.activity, props.result.message.status ?? props.activity.message.status);
  const hiddenResultFiles = [
    props.activity.message.filePath,
    ...(props.activity.message.files ?? []),
  ].filter((value): value is string => Boolean(value));
  const showPrimaryDetails = hasActivityDetails(props.activity);
  const showResultDetails = hasActivityDetails(props.result, hiddenResultFiles);
  const hasNested = props.nested.length > 0;

  if (
    !header.headline
    && header.metaBits.length === 0
    && !header.status
    && !showPrimaryDetails
    && !showResultDetails
    && !hasNested
  ) {
    return null;
  }

  return (
    <div className="session-chat-activity-row" style={{ paddingLeft: `${props.activity.depth * 16}px` }}>
      <div className="session-chat-activity-icon">
        {activityIcon(props.result)}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <ActivityHeadline header={header} />
        {showPrimaryDetails ? (
          <ActivityDetails activity={props.activity} onOpenSubagent={props.onOpenSubagent} />
        ) : null}
        {hasNested ? (
          <div className="session-chat-activity-group-nested">
            <ActivityPresentationList
              activities={props.nested}
              onOpenSubagent={props.onOpenSubagent}
              nested
            />
          </div>
        ) : null}
        {showResultDetails ? (
          <div className={cn("session-chat-activity-group-result", showPrimaryDetails || hasNested ? "session-chat-activity-group-result-separated" : null)}>
            <ActivityDetails
              activity={props.result}
              onOpenSubagent={props.onOpenSubagent}
              hideFiles={hiddenResultFiles}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ActivityPresentationList(props: {
  activities: SessionChatActivity[];
  onOpenSubagent?: (sessionId: string) => void;
  nested?: boolean;
}) {
  const items = buildPresentedActivities(props.activities);

  return (
    <div className={cn("session-chat-activity-list", props.nested ? "session-chat-activity-list-nested" : null)}>
      {items.map((item) => (
        item.kind === "paired" ? (
          <MergedActivityRow
            key={item.id}
            activity={item.activity}
            nested={item.nested}
            result={item.result}
            onOpenSubagent={props.onOpenSubagent}
          />
        ) : (
          <SingleActivityRow
            key={item.id}
            activity={item.activity}
            onOpenSubagent={props.onOpenSubagent}
          />
        )
      ))}
    </div>
  );
}

function UserTurnView(props: { turn: Extract<SessionChatTurn, { kind: "user" }> }) {
  const text = messageContentToString(props.turn.message);

  return (
    <div className="session-chat-user-shell">
      <div className="session-chat-user-meta">
        You
        <span className="ml-2 font-normal normal-case tracking-normal themed-muted">
          {formatTimestamp(props.turn.timestamp)}
        </span>
      </div>
      <div className="ml-auto max-w-[88%]">
        <div className="session-detail-user-bubble">
          {text ? (
            <SessionDetailMarkdown content={text} variant="user" />
          ) : (
            <div className="text-sm leading-6 themed-title">
              No message text was captured for this turn.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SystemTurnView(props: { turn: Extract<SessionChatTurn, { kind: "system" }> }) {
  const text = messageContentToString(props.turn.message);
  const isError = props.turn.message.role === "error" || props.turn.message.status === "error";
  const title = props.turn.message.title?.trim() || undefined;
  const bodyText = text || title;
  const showTitle = Boolean(title) && !isEquivalentDisplayText(title, bodyText);

  if (!bodyText && !(props.turn.message.files?.length ?? 0)) {
    return null;
  }

  return (
    <div className={cn("session-chat-system-line", isError ? "session-chat-system-line-error" : null)}>
      <div className="session-chat-system-meta">
        <div className="session-chat-system-kicker">
          {variantLabel(props.turn.message)}
        </div>
        <div className="text-[11px] themed-muted">
          {formatTimestamp(props.turn.timestamp)}
        </div>
      </div>
      {showTitle ? (
        <div className={cn("text-sm font-medium", isError ? "themed-error-ink" : "themed-title")}>
          {title}
        </div>
      ) : null}
      {bodyText ? (
        <div className="session-chat-system-body">
          <SessionDetailMarkdown content={bodyText} />
        </div>
      ) : null}
      <FileBadgeRow files={props.turn.message.files} />
    </div>
  );
}

function AssistantTurnView(props: {
  turn: Extract<SessionChatTurn, { kind: "assistant" }>;
  index: number;
  onOpenSubagent?: (sessionId: string) => void;
}) {
  const presentedActivities = buildPresentedActivities(props.turn.activities);
  const activityCount = presentedActivities.length;
  const errorCount = props.turn.activities.filter((activity) => activity.message.status === "error").length;
  const responseText = messageContentToString(props.turn.response);
  const hasActivities = activityCount > 0;
  const hasResponse = Boolean(props.turn.response);
  const [activitiesOpen, setActivitiesOpen] = useState(
    () => errorCount > 0 || !props.turn.response
  );
  const previewText = !activitiesOpen && hasActivities && !hasResponse
    ? `${formatNumber(activityCount)} ${pluralize(activityCount, "step")} recorded without a final response.`
    : "";

  if (!hasActivities && hasResponse) {
    return (
      <section className="session-chat-assistant-section">
        <div className="session-chat-assistant-summary-meta">
          <div className="session-chat-disclosure" aria-hidden="true">
            <Circle className="h-2.5 w-2.5" />
          </div>
          <span>Assistant {formatNumber(props.index + 1)}</span>
          <span>{formatTimestamp(props.turn.timestamp)}</span>
        </div>
        <div className="session-chat-response session-chat-response-standalone">
          {responseText ? (
            <SessionDetailMarkdown content={responseText} />
          ) : (
            <div className="text-sm leading-6 themed-muted">
              The response did not include displayable text.
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="session-chat-assistant-section">
      <button
        type="button"
        className={cn(
          "session-chat-assistant-summary",
          !hasActivities ? "session-chat-assistant-summary-static" : null
        )}
        onClick={() => {
          if (hasActivities) {
            setActivitiesOpen((current) => !current);
          }
        }}
      >
        <div className="session-chat-assistant-summary-meta">
          <div className="session-chat-disclosure" aria-hidden="true">
            {hasActivities ? (
              <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", activitiesOpen ? "rotate-90" : null)} />
            ) : (
              <Circle className="h-2.5 w-2.5" />
            )}
          </div>
          <span>Assistant {formatNumber(props.index + 1)}</span>
          {activityCount > 0 ? (
            <span>{formatNumber(activityCount)} {pluralize(activityCount, "step")}</span>
          ) : null}
          {errorCount > 0 ? (
            <span className="session-chat-inline-status session-chat-inline-status-error">
              {formatNumber(errorCount)} {pluralize(errorCount, "error")}
            </span>
          ) : null}
          <span>{formatTimestamp(props.turn.timestamp)}</span>
        </div>
        {previewText ? (
          <div className="session-chat-assistant-preview themed-muted">
            {previewText}
          </div>
        ) : null}
      </button>

      {hasActivities && activitiesOpen ? (
        <ActivityPresentationList
          activities={props.turn.activities}
          onOpenSubagent={props.onOpenSubagent}
        />
      ) : null}

      {props.turn.response ? (
        <div className="session-chat-response">
          {responseText ? (
            <SessionDetailMarkdown content={responseText} />
          ) : (
            <div className="text-sm leading-6 themed-muted">
              The response did not include displayable text.
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

export function SessionDetailTranscript(props: {
  turns?: SessionDetailTranscriptTurn[];
  messages: SessionDetailTranscriptMessage[];
  onOpenSubagent?: (sessionId: string) => void;
  showHeader?: boolean;
  compact?: boolean;
  fillHeight?: boolean;
  containerClassName?: string;
  className?: string;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const turns = useMemo(() => groupSessionChatTurns(props.messages), [props.messages]);
  const assistantTurnCount = turns.filter((turn) => turn.kind === "assistant").length;
  const viewportClassName = props.fillHeight
    ? "min-h-0 flex-1"
    : props.compact
      ? "h-[calc(100vh-16rem)] min-h-[36rem]"
      : "h-[72vh] min-h-[42rem]";

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      viewport.scrollTop = viewport.scrollHeight;
    });

    return () => window.cancelAnimationFrame(frame);
  }, [turns]);

  return (
    <section
      className={cn(
        "space-y-4",
        props.fillHeight ? "flex h-full min-h-0 flex-col" : null,
        props.containerClassName
      )}
    >
      {props.showHeader !== false ? (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] themed-subtle">
              Session chat
            </div>
            <div className="text-sm leading-6 themed-muted">
              Craft-style grouped turns with condensed tool activity and one continuous reply flow.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-[0.16em] themed-subtle">
            <span>{formatNumber(assistantTurnCount)} assistant turns</span>
            <span>{formatNumber(props.messages.length)} items</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={turns.length === 0}
              onClick={() => {
                if (viewportRef.current) {
                  viewportRef.current.scrollTop = 0;
                }
              }}
              className="h-7 rounded-full px-2.5 text-xs"
            >
              <ChevronUp className="h-3.5 w-3.5" />
              Top
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={turns.length === 0}
              onClick={() => {
                if (viewportRef.current) {
                  viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
                }
              }}
              className="h-7 rounded-full px-2.5 text-xs"
            >
              <ChevronDown className="h-3.5 w-3.5" />
              Latest
            </Button>
          </div>
        </div>
      ) : null}

      <ScrollArea
        className={cn(
          "border-none bg-transparent",
          viewportClassName,
          props.className
        )}
        viewportRef={viewportRef}
      >
        <div className="session-chat-thread">
          {turns.length === 0 ? (
            <div className="px-4 py-8 text-sm leading-6 themed-muted">
              No transcript messages were returned for this session.
            </div>
          ) : null}

          {turns.map((turn, index) => {
            if (turn.kind === "user") {
              return <UserTurnView key={turn.id} turn={turn} />;
            }
            if (turn.kind === "system") {
              return <SystemTurnView key={turn.id} turn={turn} />;
            }
            return (
              <AssistantTurnView
                key={turn.id}
                turn={turn}
                index={index}
                onOpenSubagent={props.onOpenSubagent}
              />
            );
          })}
        </div>
      </ScrollArea>
    </section>
  );
}
