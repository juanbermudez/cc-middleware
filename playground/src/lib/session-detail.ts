import type {
  SessionDetailConfigurationEntry,
  SessionDetailTranscriptCodeBlock,
  SessionDetailErrorEntry,
  SessionDetailFileEntry,
  SessionDetailResponse,
  SessionDetailSkillEntry,
  SessionDetailSubagentEntry,
  SessionDetailTranscriptField,
  SessionDetailToolEntry,
  SessionDetailTranscriptMessage,
  SessionDetailTranscriptTodoItem,
  SessionDetailTranscriptTurn,
} from "./playground";
import { deriveDirectoryName } from "./playground";

type ApiSessionDetailFileAction = "write" | "edit" | "multi_edit" | "notebook_edit";

interface ApiSessionInfo {
  sessionId: string;
  summary: string;
  lastModified: number;
  customTitle?: string;
  firstPrompt?: string;
  gitBranch?: string;
  cwd?: string;
  tag?: string;
  createdAt?: number;
}

interface ApiSessionDetailFileSummary {
  path: string;
  action: ApiSessionDetailFileAction;
  toolName: string;
  toolUseId?: string;
  count: number;
  firstSeenAt: number;
  lastSeenAt: number;
  sessionIds: string[];
}

interface ApiSessionDetailToolSummary {
  toolName: string;
  callCount: number;
  errorCount: number;
  lastSeenAt: number;
  sessionIds: string[];
}

interface ApiSessionDetailError {
  id: string;
  kind: "api_error" | "tool_error" | "system_error" | "unknown";
  message: string;
  timestamp: number;
  toolName?: string;
  toolUseId?: string;
  eventType: string;
  eventSubtype?: string;
  sourceDedupeKey: string;
}

interface ApiSessionDetailSkillSummary {
  name: string;
  count: number;
  firstSeenAt: number;
  lastSeenAt: number;
  sessionIds: string[];
}

interface ApiSessionDetailSubagentSummary {
  sessionId: string;
  rootSessionId: string;
  transcriptKind: "root" | "subagent";
  agentId?: string;
  slug?: string;
  teamName?: string;
  teammateName?: string;
  sourceToolAssistantUUID?: string;
  transcriptPath?: string;
  messageCount: number;
  startedAt: number;
  lastModified: number;
}

interface ApiSessionDetailConfiguration {
  cwd?: string;
  projectKey?: string;
  customTitle?: string;
  tag?: string;
  firstPrompt?: string;
  model?: string;
  agentId?: string;
  slug?: string;
  teamName?: string;
  teammateName?: string;
  rootSessionId: string;
  transcriptKind: "root" | "subagent";
  transcriptPath: string;
  transcriptPaths: string[];
  firstSeenAt: number;
  lastSeenAt: number;
}

interface ApiSessionTranscriptToolUse {
  id: string;
  name: string;
  input: unknown;
}

interface ApiSessionTranscriptToolResult {
  toolUseId: string;
  isError: boolean;
  content: string;
}

interface ApiSessionTranscriptFileChange {
  path: string;
  action: ApiSessionDetailFileAction;
  toolName: string;
  toolUseId?: string;
  timestamp: number;
}

interface ApiSessionTranscriptMessage {
  id: string;
  sessionId: string;
  rootSessionId: string;
  transcriptKind: "root" | "subagent";
  interactionId: string;
  role: "user" | "assistant" | "system" | "runtime";
  eventType: string;
  eventSubtype?: string;
  timestamp: number;
  text: string;
  raw: Record<string, unknown>;
  toolUses: ApiSessionTranscriptToolUse[];
  toolResults: ApiSessionTranscriptToolResult[];
  fileChanges: ApiSessionTranscriptFileChange[];
  errors: ApiSessionDetailError[];
  skillNames: string[];
  agentId?: string;
  slug?: string;
  sourceToolAssistantUUID?: string;
  teamName?: string;
  teammateName?: string;
  isPromptLikeUserEvent: boolean;
}

interface ApiSessionTranscriptTurn {
  id: string;
  interactionId: string;
  sessionId: string;
  rootSessionId: string;
  transcriptKind: "root" | "subagent";
  startedAt: number;
  endedAt: number;
  messageIds: string[];
  messageCount: number;
  role: "user" | "assistant" | "system" | "runtime";
  title: string;
  summary: string;
  text: string;
  messages: ApiSessionTranscriptMessage[];
  toolNames: string[];
  filePaths: string[];
  errorCount: number;
  skillNames: string[];
}

interface ToolLookup {
  toolName: string;
  files: string[];
}

export interface ApiSessionDetailResponse {
  sessionId: string;
  rootSessionId: string;
  session: ApiSessionInfo;
  transcript: {
    messages: ApiSessionTranscriptMessage[];
    turns: ApiSessionTranscriptTurn[];
  };
  inspector: {
    files: ApiSessionDetailFileSummary[];
    tools: ApiSessionDetailToolSummary[];
    errors: ApiSessionDetailError[];
    skills: ApiSessionDetailSkillSummary[];
    configuration: ApiSessionDetailConfiguration;
    subagents: ApiSessionDetailSubagentSummary[];
    metadata: Array<{
      key: string;
      value: string;
      label: string;
      description?: string;
    }>;
  };
  lineage: {
    kind: "root" | "subagent";
    sessionId: string;
    rootSessionId: string;
    parentSessionId?: string;
    subagentCount: number;
    subagents: ApiSessionDetailSubagentSummary[];
  };
}

function normalizeRole(
  role: ApiSessionTranscriptMessage["role"]
): SessionDetailTranscriptMessage["role"] {
  return role === "runtime" ? "system" : role;
}

function actionToStatus(action: ApiSessionDetailFileAction): SessionDetailFileEntry["status"] {
  switch (action) {
    case "write":
      return "created";
    case "edit":
    case "multi_edit":
    case "notebook_edit":
      return "edited";
  }
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
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function humanizeEvent(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function canonicalEventKey(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  return normalized || undefined;
}

function normalizeComparableText(value: string | undefined): string {
  return (value ?? "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isEquivalentText(left: string | undefined, right: string | undefined): boolean {
  const normalizedLeft = normalizeComparableText(left);
  const normalizedRight = normalizeComparableText(right);

  return Boolean(normalizedLeft) && normalizedLeft === normalizedRight;
}

const LOW_SIGNAL_SYSTEM_EVENT_KEYS = new Set([
  "attachment",
  "custom_title",
  "last_prompt",
  "queue_operation",
  "tag",
]);

function shouldOmitLowSignalBaseMessage(options: {
  role: SessionDetailTranscriptMessage["role"];
  eventKey?: string;
  title?: string;
  text?: string;
  files: string[];
  hasStructuredChildren: boolean;
}): boolean {
  if (options.hasStructuredChildren || options.files.length > 0) {
    return false;
  }

  const normalizedText = normalizeComparableText(options.text);
  const normalizedTitle = normalizeComparableText(options.title);
  const eventKey = canonicalEventKey(options.eventKey);
  if (!normalizedText) {
    if (!normalizedTitle) {
      return true;
    }

    if (
      options.role === "assistant"
      && (normalizedTitle === "assistant" || normalizedTitle === "response")
    ) {
      return true;
    }

    return (
      options.role === "system"
      && Boolean(eventKey)
      && LOW_SIGNAL_SYSTEM_EVENT_KEYS.has(eventKey!)
      && normalizedTitle === eventKey!.replace(/_/g, " ")
    );
  }

  if (
    options.role === "assistant"
    && (normalizedText === "assistant" || normalizedText === "response")
  ) {
    return true;
  }

  if (
    options.role === "system"
    && eventKey
    && LOW_SIGNAL_SYSTEM_EVENT_KEYS.has(eventKey)
    && (isEquivalentText(options.title, options.text) || normalizedText === eventKey.replace(/_/g, " "))
  ) {
    return true;
  }

  return false;
}

function uniqueDefined(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())))];
}

function buildField(label: string, value: unknown): SessionDetailTranscriptField | null {
  if (value === undefined || value === null) {
    return null;
  }

  const stringValue = stringifyUnknown(value).trim();
  if (!stringValue) {
    return null;
  }

  return { label, value: stringValue };
}

function buildFields(entries: Array<[string, unknown]>): SessionDetailTranscriptField[] {
  return entries
    .map(([label, value]) => buildField(label, value))
    .filter((entry): entry is SessionDetailTranscriptField => Boolean(entry));
}

function inferLanguageFromPath(path?: string): string | undefined {
  if (!path) {
    return undefined;
  }

  const normalized = path.toLowerCase();
  if (normalized.endsWith(".ts") || normalized.endsWith(".tsx")) return "typescript";
  if (normalized.endsWith(".js") || normalized.endsWith(".jsx") || normalized.endsWith(".mjs")) return "javascript";
  if (normalized.endsWith(".json")) return "json";
  if (normalized.endsWith(".md")) return "markdown";
  if (normalized.endsWith(".sh")) return "bash";
  if (normalized.endsWith(".yml") || normalized.endsWith(".yaml")) return "yaml";
  if (normalized.endsWith(".css")) return "css";
  if (normalized.endsWith(".html")) return "html";
  return undefined;
}

function pickString(input: unknown, ...keys: string[]): string | undefined {
  if (!isPlainObject(input)) {
    return undefined;
  }

  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function pickNumber(input: unknown, ...keys: string[]): number | undefined {
  if (!isPlainObject(input)) {
    return undefined;
  }

  for (const key of keys) {
    const value = input[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return undefined;
}

function pickBoolean(input: unknown, ...keys: string[]): boolean | undefined {
  if (!isPlainObject(input)) {
    return undefined;
  }

  for (const key of keys) {
    const value = input[key];
    if (typeof value === "boolean") {
      return value;
    }
  }

  return undefined;
}

function buildCodeBlock(
  label: string | undefined,
  code: unknown,
  options?: { path?: string; language?: string }
): SessionDetailTranscriptCodeBlock | null {
  const normalized = typeof code === "string" ? code : stringifyUnknown(code);
  if (!normalized.trim()) {
    return null;
  }

  return {
    label,
    code: normalized,
    path: options?.path,
    language: options?.language ?? inferLanguageFromPath(options?.path),
  };
}

function buildTodoItems(input: unknown): SessionDetailTranscriptTodoItem[] {
  if (!isPlainObject(input) || !Array.isArray(input.todos)) {
    return [];
  }

  return input.todos
    .filter((value): value is Record<string, unknown> => isPlainObject(value))
    .map((todo) => ({
      content: pickString(todo, "content") ?? "Untitled task",
      status: pickString(todo, "status"),
      activeForm: pickString(todo, "activeForm", "active_form"),
    }));
}

function buildGenericObjectFields(input: unknown): SessionDetailTranscriptField[] {
  if (!isPlainObject(input)) {
    return [];
  }

  return Object.entries(input)
    .filter(([, value]) =>
      typeof value === "string"
      || typeof value === "number"
      || typeof value === "boolean")
    .slice(0, 6)
    .map(([key, value]) => ({
      label: humanizeEvent(key) ?? key,
      value: stringifyUnknown(value),
    }));
}

function buildToolPresentation(message: ApiSessionTranscriptMessage, toolUse: ApiSessionTranscriptToolUse): Partial<SessionDetailTranscriptMessage> {
  const files = uniqueDefined(
    message.fileChanges
      .filter((entry) => entry.toolUseId === toolUse.id)
      .map((entry) => entry.path)
  );
  const input = toolUse.input;
  const toolName = toolUse.name;

  switch (toolName) {
    case "TodoWrite": {
      const todoItems = buildTodoItems(input);
      const completed = todoItems.filter((item) => item.status === "completed").length;
      const inProgress = todoItems.filter((item) => item.status === "in_progress").length;
      const pending = todoItems.filter((item) => item.status === "pending").length;

      return {
        variant: "todo_list",
        title: "Task list update",
        text: todoItems.length > 0 ? undefined : "Updated the working task list.",
        todoItems,
        fields: buildFields([
          ["Completed", completed || undefined],
          ["In progress", inProgress || undefined],
          ["Pending", pending || undefined],
        ]),
        files,
      };
    }

    case "Write": {
      const path = pickString(input, "file_path", "filePath", "path") ?? files[0];
      return {
        variant: "file_write",
        title: "Create file",
        text: path ? `Prepared new file contents for ${path}.` : undefined,
        fields: buildFields([
          ["File", path],
        ]),
        codeBlocks: [
          buildCodeBlock("File contents", pickString(input, "content"), {
            path,
          }),
        ].filter((entry): entry is SessionDetailTranscriptCodeBlock => Boolean(entry)),
        filePath: path,
        files: uniqueDefined([path, ...files]),
      };
    }

    case "Edit": {
      const path = pickString(input, "file_path", "filePath", "path") ?? files[0];
      return {
        variant: "file_edit",
        title: "Edit file",
        fields: buildFields([
          ["File", path],
          ["Replace all", pickBoolean(input, "replace_all", "replaceAll") ? "Yes" : undefined],
        ]),
        codeBlocks: [
          buildCodeBlock("Find", pickString(input, "old_string", "oldString"), { path }),
          buildCodeBlock("Replace", pickString(input, "new_string", "newString"), { path }),
        ].filter((entry): entry is SessionDetailTranscriptCodeBlock => Boolean(entry)),
        filePath: path,
        files: uniqueDefined([path, ...files]),
      };
    }

    case "MultiEdit": {
      const path = pickString(input, "file_path", "filePath", "path") ?? files[0];
      const edits = isPlainObject(input) && Array.isArray(input.edits) ? input.edits : [];
      const editBlocks = edits
        .filter((edit): edit is Record<string, unknown> => isPlainObject(edit))
        .slice(0, 3)
        .flatMap((edit, index) => [
          buildCodeBlock(`Edit ${index + 1} · Find`, pickString(edit, "old_string", "oldString"), { path }),
          buildCodeBlock(`Edit ${index + 1} · Replace`, pickString(edit, "new_string", "newString"), { path }),
        ])
        .filter((entry): entry is SessionDetailTranscriptCodeBlock => Boolean(entry));

      return {
        variant: "file_edit",
        title: "Apply multi-edit",
        fields: buildFields([
          ["File", path],
          ["Edits", edits.length || undefined],
        ]),
        codeBlocks: editBlocks.length > 0
          ? editBlocks
          : [
            buildCodeBlock("Tool input", input, { language: "json" }),
          ].filter((entry): entry is SessionDetailTranscriptCodeBlock => Boolean(entry)),
        filePath: path,
        files: uniqueDefined([path, ...files]),
      };
    }

    case "Bash": {
      const command = pickString(input, "command", "cmd", "script");
      return {
        variant: "command",
        title: "Run command",
        fields: buildFields([
          ["CWD", pickString(input, "cwd")],
          ["Description", pickString(input, "description")],
          ["Timeout", pickNumber(input, "timeout", "timeout_ms", "timeoutMs")],
        ]),
        codeBlocks: [
          buildCodeBlock("Command", command, { language: "bash" }),
        ].filter((entry): entry is SessionDetailTranscriptCodeBlock => Boolean(entry)),
        text: command ? undefined : "Executed a shell command.",
        files,
      };
    }

    case "Read": {
      const path = pickString(input, "file_path", "filePath", "path") ?? files[0];
      const offset = pickNumber(input, "offset");
      const limit = pickNumber(input, "limit");

      return {
        variant: "file_read",
        title: "Read",
        fields: buildFields([
          ["Offset", offset],
          ["Limit", limit],
        ]),
        filePath: path,
        files: uniqueDefined([path, ...files]),
      };
    }

    case "Grep":
    case "Glob": {
      return {
        variant: "search",
        title: toolName === "Grep" ? "Search project" : "Match files",
        fields: buildFields([
          ["Pattern", pickString(input, "pattern", "query")],
          ["Path", pickString(input, "path", "cwd")],
          ["Include", pickString(input, "include")],
        ]),
        files,
      };
    }

    case "WebFetch": {
      return {
        variant: "tool_use",
        title: "Fetch URL",
        text: pickString(input, "url"),
        fields: buildFields([
          ["Prompt", pickString(input, "prompt")],
        ]),
        codeBlocks: [
          buildCodeBlock("Request prompt", pickString(input, "prompt"), { language: "markdown" }),
        ].filter((entry): entry is SessionDetailTranscriptCodeBlock => Boolean(entry)),
        files,
      };
    }

    default: {
      return {
        variant: "tool_use",
        title: "Tool use",
        text: undefined,
        fields: buildGenericObjectFields(input),
        codeBlocks: isPlainObject(input) || Array.isArray(input)
          ? [
            buildCodeBlock("Tool input", input, { language: "json" }),
          ].filter((entry): entry is SessionDetailTranscriptCodeBlock => Boolean(entry))
          : undefined,
        files,
      };
    }
  }
}

function buildToolLookup(messages: ApiSessionTranscriptMessage[]): Map<string, ToolLookup> {
  const lookup = new Map<string, ToolLookup>();

  for (const message of messages) {
    for (const toolUse of message.toolUses) {
      const presentation = buildToolPresentation(message, toolUse);
      lookup.set(toolUse.id, {
        toolName: toolUse.name,
        files: uniqueDefined([
          presentation.filePath,
          ...(presentation.files ?? []),
          ...message.fileChanges
            .filter((entry) => entry.toolUseId === toolUse.id)
            .map((entry) => entry.path),
        ]),
      });
    }
  }

  return lookup;
}

function buildConfigurationEntries(
  configuration: ApiSessionDetailConfiguration,
  metadata: ApiSessionDetailResponse["inspector"]["metadata"]
): SessionDetailConfigurationEntry[] {
  const entries: SessionDetailConfigurationEntry[] = [];

  const push = (
    key: string,
    label: string,
    value: string | number | undefined,
    description?: string
  ) => {
    if (value === undefined || value === "") {
      return;
    }

    entries.push({
      key,
      label,
      value: String(value),
      description,
    });
  };

  push("cwd", "CWD", configuration.cwd);
  push("projectKey", "Project key", configuration.projectKey);
  push("model", "Model", configuration.model);
  push("transcriptKind", "Transcript kind", configuration.transcriptKind);
  push("tag", "Tag", configuration.tag);
  push("agentId", "Agent", configuration.agentId);
  push("slug", "Slug", configuration.slug);
  push("teamName", "Team", configuration.teamName);
  push("teammateName", "Teammate", configuration.teammateName);
  push("transcriptPath", "Transcript path", configuration.transcriptPath);
  push("transcriptCount", "Transcript files", configuration.transcriptPaths.length);
  push("firstPrompt", "First prompt", configuration.firstPrompt);

  for (const entry of metadata) {
    push(`metadata:${entry.key}`, entry.label, entry.value, entry.description);
  }

  return entries;
}

function expandTranscriptMessage(
  message: ApiSessionTranscriptMessage,
  lookup: Map<string, ToolLookup>
): SessionDetailTranscriptMessage[] {
  const base: SessionDetailTranscriptMessage[] = [];
  const baseTitle = humanizeEvent(message.eventSubtype) ?? humanizeEvent(message.eventType);
  const eventKey = canonicalEventKey(message.eventSubtype ?? message.eventType);
  const filePaths = uniqueDefined(message.fileChanges.map((entry) => entry.path));
  const baseText = message.text?.trim() || undefined;
  const role = normalizeRole(message.role);
  const baseVariant: SessionDetailTranscriptMessage["variant"] =
    role === "user"
      ? "user_message"
      : role === "assistant"
        ? "assistant_message"
        : "system_event";
  const hasStructuredChildren =
    message.toolUses.length > 0
    || message.toolResults.length > 0
    || message.skillNames.length > 0;

  if (
    (baseText || !hasStructuredChildren)
    && !shouldOmitLowSignalBaseMessage({
      role,
      eventKey,
      title: baseTitle,
      text: baseText,
      files: filePaths,
      hasStructuredChildren,
    })
  ) {
    const dedupeSystemText = baseVariant === "system_event" && isEquivalentText(baseTitle, baseText);

    base.push({
      id: `${message.id}:body`,
      role,
      variant: baseVariant,
      kind: message.eventSubtype ?? message.eventType,
      timestamp: message.timestamp,
      title: baseVariant === "system_event" && !dedupeSystemText ? baseTitle : undefined,
      text: dedupeSystemText ? baseText : (baseText ?? baseTitle ?? "Transcript event"),
      files: filePaths,
      metadata: {
        eventType: message.eventType,
        eventSubtype: message.eventSubtype,
        transcriptKind: message.transcriptKind,
      },
    });
  }

  for (const toolUse of message.toolUses) {
    const presentation = buildToolPresentation(message, toolUse);
    base.push({
      id: `${message.id}:tool:${toolUse.id}`,
      role: "tool",
      variant: presentation.variant ?? "tool_use",
      kind: "tool_use",
      timestamp: message.timestamp,
      title: presentation.title ?? "Tool use",
      toolName: toolUse.name,
      toolUseId: toolUse.id,
      text: presentation.text,
      content: presentation.content,
      files: presentation.files,
      filePath: presentation.filePath,
      fields: presentation.fields,
      codeBlocks: presentation.codeBlocks,
      todoItems: presentation.todoItems,
    });
  }

  for (const toolResult of message.toolResults) {
    const relatedTool = lookup.get(toolResult.toolUseId);
    const resultContent = toolResult.content?.trim() ?? "";
    const primaryFile = relatedTool?.files[0];
    const resultCodeBlock = resultContent.includes("\n") || resultContent.trim().startsWith("{")
      ? buildCodeBlock(
        undefined,
        resultContent,
        {
          path: primaryFile,
          language: resultContent.trim().startsWith("{") ? "json" : undefined,
        }
      )
      : null;

    base.push({
      id: `${message.id}:result:${toolResult.toolUseId}`,
      role: toolResult.isError ? "error" : "tool",
      variant: "tool_result",
      kind: "tool_result",
      timestamp: message.timestamp,
      title: relatedTool ? `${relatedTool.toolName} result` : toolResult.isError ? "Tool error" : "Tool result",
      toolName: relatedTool?.toolName,
      toolUseId: toolResult.toolUseId,
      text: resultCodeBlock ? undefined : resultContent,
      codeBlocks: resultCodeBlock ? [resultCodeBlock] : undefined,
      files: relatedTool?.files,
      status: toolResult.isError ? "error" : "ok",
    });
  }

  for (const skillName of message.skillNames) {
    base.push({
      id: `${message.id}:skill:${skillName}`,
      role: "note",
      variant: "skill",
      kind: "skill",
      timestamp: message.timestamp,
      title: "Skill",
      text: skillName,
      status: "loaded",
    });
  }

  return base;
}

export function normalizeApiSessionDetailResponse(
  detail: ApiSessionDetailResponse
): SessionDetailResponse {
  const configuration = detail.inspector.configuration;
  const cwd = detail.session.cwd ?? configuration.cwd;
  const project = cwd ? deriveDirectoryName(cwd) : undefined;
  const globalToolLookup = buildToolLookup(detail.transcript.messages);
  const transcriptMessages = detail.transcript.messages.flatMap((message) =>
    expandTranscriptMessage(message, globalToolLookup)
  );
  const transcriptTurns: SessionDetailTranscriptTurn[] = detail.transcript.turns.map((turn) => {
    const turnToolLookup = buildToolLookup(turn.messages);

    return {
      id: turn.id,
      role: normalizeRole(turn.role),
      timestamp: turn.startedAt,
      title: turn.title,
      summary: turn.summary,
      toolNames: turn.toolNames,
      filePaths: turn.filePaths,
      errorCount: turn.errorCount,
      skillNames: turn.skillNames,
      content: turn.text || turn.summary,
      messages: turn.messages.flatMap((message) => expandTranscriptMessage(message, turnToolLookup)),
    };
  });
  const userMessages = detail.transcript.messages.filter((message) => message.role === "user").length;
  const assistantMessages = detail.transcript.messages.filter((message) => message.role === "assistant").length;

  const files: SessionDetailFileEntry[] = detail.inspector.files.map((file) => ({
    path: file.path,
    status: actionToStatus(file.action),
    count: file.count,
    timestamp: file.lastSeenAt,
  }));
  const tools: SessionDetailToolEntry[] = detail.inspector.tools.map((tool) => ({
    toolName: tool.toolName,
    callCount: tool.callCount,
    errorCount: tool.errorCount,
    lastSeenAt: tool.lastSeenAt,
    description: tool.sessionIds.length > 1 ? `${tool.sessionIds.length} sessions` : undefined,
  }));
  const errors: SessionDetailErrorEntry[] = detail.inspector.errors.map((error) => ({
    errorId: error.id,
    kind: error.kind,
    message: error.message,
    timestamp: error.timestamp,
    toolName: error.toolName,
    code: error.eventSubtype,
  }));
  const skills: SessionDetailSkillEntry[] = detail.inspector.skills.map((skill) => ({
    name: skill.name,
    description: skill.count > 1 ? `${skill.count} mentions` : undefined,
    loadedAt: skill.lastSeenAt,
  }));
  const subagents: SessionDetailSubagentEntry[] = detail.inspector.subagents.map((subagent) => ({
    sessionId: subagent.sessionId,
    title: subagent.teammateName ?? subagent.slug ?? subagent.agentId ?? subagent.sessionId,
    agentId: subagent.agentId,
    slug: subagent.slug,
    status: subagent.transcriptKind,
    startedAt: subagent.startedAt,
    updatedAt: subagent.lastModified,
    messageCount: subagent.messageCount,
  }));

  return {
    sessionId: detail.sessionId,
    parentSessionId: detail.lineage.parentSessionId,
    title: detail.session.customTitle,
    summary: detail.session.summary || detail.session.firstPrompt,
    project,
    cwd,
    gitBranch: detail.session.gitBranch,
    model: configuration.model,
    status: detail.lineage.kind,
    startedAt: configuration.firstSeenAt,
    updatedAt: configuration.lastSeenAt,
    totals: {
      messages: detail.transcript.messages.length,
      userMessages,
      assistantMessages,
      toolMessages: transcriptMessages.filter((message) => message.role === "tool").length,
      errors: detail.inspector.errors.length,
      tools: detail.inspector.tools.reduce((sum, entry) => sum + entry.callCount, 0),
      files: detail.inspector.files.length,
      skills: detail.inspector.skills.length,
      subagents: detail.inspector.subagents.length,
    },
    configuration: buildConfigurationEntries(configuration, detail.inspector.metadata),
    files,
    tools,
    errors,
    skills,
    subagents,
    messages: transcriptMessages,
    turns: transcriptTurns,
  };
}
