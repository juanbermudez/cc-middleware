export type CheckStatus = "idle" | "loading" | "pass" | "error";
export type SearchLineageFilter = "all" | "standalone" | "subagent" | "team";
export type SessionExplorerSource = "catalog" | "search";
export type PlaygroundPageId =
  | "overview"
  | "sessions"
  | "session-detail"
  | "analytics"
  | "teams"
  | "agents"
  | "config"
  | "config-settings"
  | "config-plugins"
  | "config-skills"
  | "config-commands"
  | "config-agents"
  | "config-mcp"
  | "config-memory"
  | "imports"
  | "live-feed"
  | "team-tasks"
  | "runtime"
  | "runtime-tools"
  | "runtime-commands"
  | "runtime-skills"
  | "runtime-plugins"
  | "runtime-mcp"
  | "runtime-agents"
  | "runtime-models";

export interface PlaygroundRoute {
  page: PlaygroundPageId;
  section?: string;
}

export interface SessionMetadataDefinition {
  key: string;
  label: string;
  description?: string;
  valueType: "string";
  searchable: boolean;
  filterable: boolean;
  usageCount?: number;
  createdAt: number;
  updatedAt: number;
}

export interface ResourceMetadataDefinition {
  resourceType: string;
  key: string;
  label: string;
  description?: string;
  valueType: "string";
  searchable: boolean;
  filterable: boolean;
  usageCount?: number;
  createdAt: number;
  updatedAt: number;
}

export interface ResourceMetadataEntry {
  resourceType: string;
  resourceId: string;
  key: string;
  value: string;
  label: string;
  description?: string;
  valueType: "string";
  searchable: boolean;
  filterable: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface SessionMetadataEntry {
  sessionId: string;
  key: string;
  value: string;
  label: string;
  description?: string;
  valueType: "string";
  searchable: boolean;
  filterable: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CheckResult {
  status: CheckStatus;
  detail: string;
}

export type CheckKey =
  | "health"
  | "status"
  | "search"
  | "agents"
  | "teams"
  | "runtime"
  | "websocket";

export interface HealthResponse {
  status: string;
  version: string;
  uptime: number;
}

export interface MiddlewareStatusResponse {
  activeSessions: number;
  registeredAgents: number;
  hookHandlerCount: number;
  registeredEvents: string[];
  pendingPermissions: number;
  pendingQuestions: number;
  policyRuleCount: number;
}

export interface AnalyticsRawTableCounts {
  transcriptEvents: number;
  middlewareSdkMessages: number;
  hookEvents: number;
  permissionEvents: number;
  otelLogs: number;
  otelSpans: number;
}

export interface AnalyticsFilters {
  traceKinds: Array<"root" | "subagent" | "runtime">;
  sessionIds: string[];
  toolNames: string[];
  errorKinds: string[];
  keywordCategories: string[];
}

export interface AnalyticsStatusResponse {
  available: true;
  dbPath: string;
  rawTables: AnalyticsRawTableCounts;
  lastBackfillAt: string | null;
  lastBackfillFiles: number | null;
  lastBackfillEvents: number | null;
}

export interface AnalyticsOverviewTotals {
  events: number;
  traces: number;
  errors: number;
  keywordMentions: number;
  toolUses: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  estimatedCostUsd: number;
  contextEstimateTokensPeak: number;
}

export interface AnalyticsOverviewKeywordBreakdown {
  category: string;
  term: string;
  count: number;
}

export interface AnalyticsOverviewResponse {
  range: {
    start: string | null;
    end: string | null;
  };
  totals: AnalyticsOverviewTotals;
  sourceCounts: AnalyticsRawTableCounts;
  keywordBreakdown: AnalyticsOverviewKeywordBreakdown[];
}

export interface AnalyticsTimeseriesPoint {
  bucket: string;
  events: number;
  traces: number;
  errors: number;
  keywordMentions: number;
  toolUses: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  contextEstimateTokensPeak: number;
}

export interface AnalyticsTimeseriesResponse {
  bucket: "hour" | "day";
  range: {
    start: string | null;
    end: string | null;
  };
  points: AnalyticsTimeseriesPoint[];
}

export interface AnalyticsToolPerformanceRow {
  toolName: string;
  callCount: number;
  errorCount: number;
  errorRate: number;
  sessionCount: number;
  traceCount: number;
  topErrorKind?: string;
  topErrorCount: number;
  lastSeenAt: string | null;
}

export interface AnalyticsToolPerformanceResponse {
  range: {
    start: string | null;
    end: string | null;
  };
  rows: AnalyticsToolPerformanceRow[];
}

export interface AnalyticsToolFailureDetail {
  errorId: string;
  traceId: string;
  sessionId: string;
  errorKind: string;
  errorCode?: string;
  message: string;
  timestamp: string | null;
}

export interface AnalyticsToolPerformanceDetailResponse {
  range: {
    start: string | null;
    end: string | null;
  };
  tool: AnalyticsToolPerformanceRow;
  errorKinds: AnalyticsFacetValue[];
  recentFailures: AnalyticsToolFailureDetail[];
}

export interface AnalyticsTraceSummary {
  traceId: string;
  sessionId: string;
  traceKind: "root" | "subagent" | "runtime";
  sourceKinds: string[];
  startedAt: string | null;
  endedAt: string | null;
  events: number;
  errors: number;
  keywordMentions: number;
  toolUses: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  contextEstimateTokensPeak: number;
  summary: string;
}

export interface AnalyticsTracesResponse {
  total: number;
  limit: number;
  offset: number;
  range: {
    start: string | null;
    end: string | null;
  };
  traces: AnalyticsTraceSummary[];
}

export interface AnalyticsFacetValue {
  value: string;
  count: number;
}

export interface AnalyticsFacetsResponse {
  range: {
    start: string | null;
    end: string | null;
  };
  traceKinds: AnalyticsFacetValue[];
  errorKinds: AnalyticsFacetValue[];
  toolNames: AnalyticsFacetValue[];
  keywordCategories: AnalyticsFacetValue[];
  sessions: AnalyticsFacetValue[];
}

export interface AnalyticsTraceRequestSummary {
  requestId: string;
  timestamp: string | null;
  model?: string;
  stopReason?: string;
  assistantUuid?: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  estimatedCostUsd: number;
  contextEstimateTokens: number;
}

export interface AnalyticsToolCallSummary {
  toolCallId: string;
  toolUseId?: string;
  toolName: string;
  sourceAssistantUuid?: string;
  startedAt: string | null;
  finishedAt: string | null;
  isError: boolean;
  errorMessage?: string;
}

export interface AnalyticsErrorSummary {
  errorId: string;
  errorKind: string;
  toolName?: string;
  errorCode?: string;
  message: string;
  timestamp: string | null;
}

export interface AnalyticsKeywordMentionSummary {
  mentionId: string;
  speaker: string;
  category: string;
  term: string;
  matchedText: string;
  severity: number;
  timestamp: string | null;
}

export interface AnalyticsCompactionSummary {
  compactionId: string;
  compactedAt: string | null;
  messageCount?: number;
}

export interface AnalyticsTraceDetailResponse {
  trace: AnalyticsTraceSummary;
  requests: AnalyticsTraceRequestSummary[];
  toolCalls: AnalyticsToolCallSummary[];
  errors: AnalyticsErrorSummary[];
  keywordMentions: AnalyticsKeywordMentionSummary[];
  compactions: AnalyticsCompactionSummary[];
}

export interface AnalyticsSessionSubagentSummary {
  sessionId: string;
  agentId?: string;
  slug?: string;
  teamName?: string;
  teammateName?: string;
  eventCount: number;
  requestCount: number;
  errorCount: number;
  toolUseCount: number;
}

export interface AnalyticsPermissionDecisionSummary {
  decisionId: string;
  toolName?: string;
  decision: string;
  cwd?: string;
  message?: string;
  timestamp: string | null;
}

export interface AnalyticsSessionDetailResponse {
  sessionId: string;
  totals: AnalyticsOverviewTotals;
  traceCount: number;
  traces: AnalyticsTraceSummary[];
  subagents: AnalyticsSessionSubagentSummary[];
  tools: AnalyticsFacetValue[];
  errorKinds: AnalyticsFacetValue[];
  keywordCategories: AnalyticsFacetValue[];
  permissions: AnalyticsPermissionDecisionSummary[];
}

export interface SessionRelationshipEntry {
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

export interface SessionCatalogLineage {
  kind: "root" | "subagent";
  parentSessionId?: string;
  hasSubagents: boolean;
  subagentCount: number;
  hasTeamMembers: boolean;
  teamNames: string[];
  teammateNames: string[];
  relationships: SessionRelationshipEntry[];
}

export interface SessionSearchEntry {
  id: string;
  summary: string;
  firstPrompt: string;
  project: string;
  cwd: string;
  tag?: string;
  status: string;
  lastModified: number;
  createdAt: number;
  relevanceScore?: number;
  gitBranch?: string;
  customTitle?: string;
  metadata: SessionMetadataEntry[];
  lineage: SessionCatalogLineage;
}

export interface SessionDetailConfigurationEntry {
  key: string;
  label: string;
  value: string;
  description?: string;
}

export interface SessionDetailFileEntry {
  path: string;
  status?: "created" | "edited" | "deleted" | "loaded" | "attached";
  count?: number;
  timestamp?: string | null;
}

export interface SessionDetailToolEntry {
  toolName: string;
  callCount: number;
  errorCount?: number;
  lastSeenAt?: string | null;
  description?: string;
}

export interface SessionDetailErrorEntry {
  errorId: string;
  kind: string;
  message: string;
  timestamp?: string | null;
  traceId?: string;
  toolName?: string;
  code?: string;
}

export interface SessionDetailSkillEntry {
  name: string;
  scope?: string;
  path?: string;
  description?: string;
  loadedAt?: string | null;
}

export interface SessionDetailSubagentEntry {
  sessionId: string;
  title?: string;
  agentId?: string;
  slug?: string;
  status?: string;
  startedAt?: string | null;
  updatedAt?: string | null;
  toolCount?: number;
  errorCount?: number;
  messageCount?: number;
}

export interface SessionDetailTranscriptField {
  label: string;
  value: string;
}

export interface SessionDetailTranscriptCodeBlock {
  label?: string;
  code: string;
  language?: string;
  path?: string;
}

export interface SessionDetailTranscriptTodoItem {
  content: string;
  status?: string;
  activeForm?: string;
}

export interface SessionDetailTranscriptMessage {
  id: string;
  role?: "user" | "assistant" | "system" | "tool" | "error" | "note" | "subagent";
  variant?:
    | "user_message"
    | "assistant_message"
    | "system_event"
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
  kind?: string;
  timestamp?: string | number | null;
  text?: string;
  title?: string;
  content?: string | Record<string, unknown> | Array<unknown>;
  toolName?: string;
  toolUseId?: string;
  parentToolUseId?: string;
  subagentSessionId?: string;
  filePath?: string;
  files?: string[];
  status?: string;
  source?: string;
  fields?: SessionDetailTranscriptField[];
  codeBlocks?: SessionDetailTranscriptCodeBlock[];
  todoItems?: SessionDetailTranscriptTodoItem[];
  metadata?: Record<string, unknown>;
}

export interface SessionDetailTranscriptTurn {
  id: string;
  role?: "user" | "assistant" | "system" | "tool" | "error" | "note" | "subagent";
  timestamp?: string | number | null;
  title?: string;
  summary?: string;
  toolNames?: string[];
  filePaths?: string[];
  errorCount?: number;
  skillNames?: string[];
  content?: string | Record<string, unknown> | Array<unknown>;
  messages?: SessionDetailTranscriptMessage[];
}

export interface SessionDetailResponse {
  sessionId: string;
  parentSessionId?: string;
  title?: string;
  summary?: string;
  project?: string;
  cwd?: string;
  gitBranch?: string;
  model?: string;
  status?: string;
  startedAt?: string | null;
  updatedAt?: string | null;
  totals?: {
    messages?: number;
    userMessages?: number;
    assistantMessages?: number;
    toolMessages?: number;
    errors?: number;
    tools?: number;
    files?: number;
    skills?: number;
    subagents?: number;
    inputTokens?: number;
    outputTokens?: number;
    estimatedCostUsd?: number;
  };
  configuration?: SessionDetailConfigurationEntry[];
  files?: SessionDetailFileEntry[];
  tools?: SessionDetailToolEntry[];
  errors?: SessionDetailErrorEntry[];
  skills?: SessionDetailSkillEntry[];
  subagents?: SessionDetailSubagentEntry[];
  transcript?: SessionDetailTranscriptMessage[];
  messages?: SessionDetailTranscriptMessage[];
  turns?: SessionDetailTranscriptTurn[];
}

export interface SearchResponse {
  sessions: SessionSearchEntry[];
  total: number;
  queryTimeMs: number;
}

export interface SearchStatsResponse {
  totalSessions: number;
  totalMessages: number;
  lastFullIndex?: number;
  lastIncrementalIndex?: number;
}

export interface ReindexResponse {
  status: string;
  sessionsIndexed: number;
  messagesIndexed: number;
  errors: Array<{ sessionId: string; error: string }>;
  durationMs: number;
}

export interface SessionListEntry {
  id: string;
  sessionId?: string;
  project: string;
  summary?: string;
  customTitle?: string;
  firstPrompt?: string;
  gitBranch?: string;
  cwd?: string;
  directoryPath: string;
  directoryName: string;
  parentDirectoryPath?: string;
  directoryDepth: number;
  indexed: boolean;
  messageCount?: number;
  tag?: string;
  lastModified?: number;
  createdAt?: number;
  metadata: SessionMetadataEntry[];
  lineage: SessionCatalogLineage;
}

export interface SessionsResponse {
  sessions: SessionListEntry[];
  total: number;
}

export interface SessionDirectoryGroup {
  path: string;
  name: string;
  parentPath?: string;
  depth: number;
  sessionCount: number;
  indexedSessionCount: number;
  unindexedSessionCount: number;
  mainSessionCount: number;
  subagentSessionCount: number;
  teamSessionCount: number;
  lastModified: number;
  gitBranches: string[];
  hasMoreSessions: boolean;
  sessions: SessionListEntry[];
}

export interface SessionDirectoriesResponse {
  groups: SessionDirectoryGroup[];
  totalDirectories: number;
  totalSessions: number;
}

export interface SessionMetadataDefinitionsResponse {
  definitions: SessionMetadataDefinition[];
}

export interface SessionMetadataValuesResponse {
  metadata: SessionMetadataEntry[];
}

export interface ResourceMetadataDefinitionsResponse {
  resourceType: string;
  definitions: ResourceMetadataDefinition[];
}

export interface ResourceMetadataValuesResponse {
  resourceType: string;
  resourceId?: string;
  metadata: ResourceMetadataEntry[];
}

export interface SessionExplorerEntry {
  id: string;
  sessionId: string;
  summary?: string;
  customTitle?: string;
  firstPrompt?: string;
  project: string;
  cwd: string;
  directoryPath: string;
  directoryName: string;
  parentDirectoryPath?: string;
  indexed: boolean;
  messageCount?: number;
  gitBranch?: string;
  tag?: string;
  status?: string;
  createdAt?: number;
  lastModified?: number;
  relevanceScore?: number;
  metadata: SessionMetadataEntry[];
  lineage: SessionCatalogLineage;
  source: SessionExplorerSource;
}

export interface SessionExplorerGroup {
  path: string;
  name: string;
  sessionCount: number;
  indexedSessionCount: number;
  mainSessionCount: number;
  subagentSessionCount: number;
  teamSessionCount: number;
  lastModified: number;
  gitBranches: string[];
  hasMoreSessions: boolean;
  sessions: SessionExplorerEntry[];
}

export interface AgentsResponse {
  agents: Array<{
    name: string;
    description: string;
    source: string;
    model?: string;
    tools?: string[];
  }>;
  total: number;
}

export interface AgentDetailResponse {
  name: string;
  description: string;
  prompt: string;
  source: string;
  model?: string;
  tools?: string[];
  disallowedTools?: string[];
  maxTurns?: number;
}

export interface TeamsResponse {
  teams: Array<{
    name: string;
    memberCount: number;
    configPath: string;
  }>;
  total: number;
}

export interface TeamDetailResponse {
  name: string;
  configPath: string;
  taskListPath: string;
  members: Array<{
    name: string;
    agentId: string;
    agentType?: string;
    status: "active" | "idle" | "stopped";
  }>;
}

export interface TeamTasksResponse {
  tasks: Array<{
    resourceId: string;
    id: string;
    teamName: string;
    description: string;
    status: "pending" | "in_progress" | "completed" | "failed";
    assignee?: string;
    dependencies: string[];
    filePath?: string;
    teamConfigPath: string;
    taskListPath: string;
  }>;
  total: number;
  teamName?: string;
}

export interface RuntimeResponse {
  cwd: string;
  model: string;
  permissionMode: string;
  claudeCodeVersion: string;
  outputStyle: string;
  availableOutputStyles: string[];
  tools: string[];
  slashCommands: string[];
  skills: string[];
  agents: string[];
  plugins: Array<{
    name: string;
    path: string;
    source?: string;
  }>;
  mcpServers: Array<{
    name: string;
    status: string;
  }>;
  commands: Array<{
    name: string;
    description: string;
    argumentHint: string | string[];
  }>;
  agentDetails: Array<{
    name: string;
    description: string;
    model?: string;
  }>;
  models: Array<{
    value?: string;
    displayName?: string;
    description?: string;
  }>;
  toolsCount: number;
}

export interface RuntimeToolsResponse {
  tools: string[];
  total: number;
}

export interface RuntimeCommandsResponse {
  commands: RuntimeResponse["commands"];
  slashCommands: string[];
  total: number;
}

export interface RuntimeSkillsResponse {
  skills: string[];
  total: number;
}

export interface RuntimePluginsResponse {
  plugins: RuntimeResponse["plugins"];
  total: number;
}

export interface RuntimeMcpResponse {
  servers: RuntimeResponse["mcpServers"];
  total: number;
}

export interface RuntimeAgentsResponse {
  agents: RuntimeResponse["agentDetails"];
  names: string[];
  total: number;
}

export interface RuntimeModelsResponse {
  models: RuntimeResponse["models"];
  total: number;
  outputStyle: string;
  availableOutputStyles: string[];
}

export interface ConfigSkillsResponse {
  skills: Array<{
    name: string;
    qualifiedName?: string;
    description: string;
    scope: "project" | "user" | "plugin";
    path: string;
    pluginId?: string;
    pluginName?: string;
    pluginMarketplace?: string;
  }>;
  total: number;
}

export interface ConfigCommandsResponse {
  commands: Array<{
    name: string;
    qualifiedName?: string;
    description: string;
    scope: "project" | "user" | "plugin";
    path: string;
    pluginId?: string;
    pluginName?: string;
    pluginMarketplace?: string;
    argumentHint?: string | string[];
  }>;
  total: number;
}

export interface ConfigAgentsResponse {
  agents: Array<{
    name: string;
    qualifiedName?: string;
    description: string;
    scope: "project" | "user" | "plugin";
    path: string;
    pluginId?: string;
    pluginName?: string;
    pluginMarketplace?: string;
    model?: string;
    maxTurns?: number;
    tools?: string[];
    disallowedTools?: string[];
    effort?: string;
    permissionMode?: string;
  }>;
  total: number;
}

export interface ConfigPluginsResponse {
  plugins: Array<{
    id: string;
    name: string;
    scope: "user" | "project" | "local";
    marketplace: string;
    version: string;
    enabled: boolean;
    hasCommands: boolean;
    hasHooks: boolean;
    hasSkills: boolean;
    hasAgents: boolean;
    hasMcpServers: boolean;
    commandCount?: number;
    skillCount?: number;
    agentCount?: number;
    blocked?: boolean;
  }>;
  total: number;
}

export interface GlobalConfigSummaryResponse {
  path: string;
  exists: boolean;
  stats: Record<string, string | number | boolean>;
  preferences: Record<string, string | number | boolean>;
  writablePreferences: Array<{
    key: string;
    valueType: "boolean" | "string" | "boolean|string";
    description: string;
  }>;
  featureFlagCount: number;
  userMcpCount: number;
  trackedProjectCount: number;
}

export interface TrackedProjectEntry {
  path: string;
  exists: boolean;
  allowedTools: string[];
  allowedToolsCount: number;
  mcpServerNames: string[];
  localMcpCount: number;
  enabledMcpjsonServers: string[];
  disabledMcpjsonServers: string[];
  hasTrustDialogAccepted?: boolean;
  hasClaudeMdExternalIncludesApproved?: boolean;
  hasClaudeMdExternalIncludesWarningShown?: boolean;
  projectOnboardingSeenCount?: number;
  metrics: Record<string, unknown>;
}

export interface TrackedProjectsResponse {
  projects: TrackedProjectEntry[];
  total: number;
}

export interface SettingsFileResponse {
  scope: "managed" | "user" | "project" | "local";
  path: string;
  exists: boolean;
  content: Record<string, unknown>;
  lastModified?: number;
}

export interface MergedSettingsResponse {
  settings: Record<string, unknown>;
  provenance: Record<string, "managed" | "user" | "project" | "local">;
  permissions: {
    allow: string[];
    deny: string[];
    ask: string[];
    defaultMode?: string;
    additionalDirectories?: string[];
    sources: Record<string, string>;
  };
}

export interface AvailablePluginsCatalogResponse {
  installed: Array<{
    id: string;
    version?: string;
    scope?: string;
    enabled?: boolean;
    installPath?: string;
    installedAt?: string;
    lastUpdated?: string;
    projectPath?: string;
  }>;
  available: Array<{
    pluginId: string;
    name?: string;
    description?: string;
    marketplaceName?: string;
    version?: string;
  }>;
}

export interface MarketplacesResponse {
  marketplaces: Array<{
    name: string;
    exists: boolean;
    installLocation?: string;
    lastUpdated?: string;
    pluginCount: number;
    installedCount: number;
    blockedCount: number;
    pluginsPath?: string;
    externalPluginsPath?: string;
  }>;
  total: number;
}

export interface ConfigMcpResponse {
  servers: Array<{
    name: string;
    scope: "managed" | "user" | "local" | "project" | "plugin";
    transport: "stdio" | "sse" | "http";
    command?: string;
    args?: string[];
    url?: string;
    enabled: boolean;
    source: string;
  }>;
  total: number;
}

export interface RulesResponse {
  rules: Array<{
    path: string;
    scope: "project" | "user";
    paths?: string[];
    content: string;
  }>;
  total: number;
}

export interface MemorySummaryResponse {
  projectKey: string;
  memoryDir: string;
  hasIndex: boolean;
  indexContent: string;
  fileCount: number;
}

export interface MemoryFilesResponse {
  files: Array<{
    name: string;
    type: "user" | "feedback" | "project" | "reference";
    description: string;
    lastModified: number;
    path: string;
  }>;
  total: number;
}

export interface MemoryProjectsResponse {
  projects: Array<{
    projectKey: string;
    dir: string;
  }>;
  total: number;
}

export interface ClaudeMdResponse {
  files: Array<{
    path: string;
    scope: "user" | "project" | "project-local";
    content: string;
    imports: string[];
  }>;
  total: number;
}

export interface EventLogEntry {
  id: string;
  title: string;
  detail: string;
  category: "session" | "hook" | "team" | "socket" | "local" | "error";
  timestamp: number;
}

export interface SocketMessage {
  type: string;
  sessionId?: string;
  eventType?: string;
  error?: string;
  event?: {
    type?: string;
    text?: string;
    name?: string;
    elapsedSeconds?: number;
  };
  result?: {
    result?: string;
    sessionId?: string;
    subtype?: string;
  };
}

export interface SyncStatusResponse {
  sessionWatcher: {
    watching: boolean;
    dirs: string[];
    knownFiles: number;
    lastPoll: number | null;
  };
  configWatcher: {
    watching: boolean;
    watchedPaths: number;
    lastPoll: number | null;
  };
  autoIndexer: {
    running: boolean;
    sessionsIndexed: number;
    indexErrors: number;
    lastIndexTime: number | null;
    pendingBatch: number;
  };
}

export interface SearchScopeOption {
  value: SearchLineageFilter;
  label: string;
  detail: string;
}

export interface NavigationChild {
  id: string;
  label: string;
  sectionId?: string;
  page?: PlaygroundPageId;
}

export interface NavigationSection {
  id: PlaygroundPageId;
  label: string;
  children: NavigationChild[];
}

export const DEFAULT_SEARCH_QUERY = "";
export const DEFAULT_STREAM_PROMPT = "What is 2 + 2? Reply with the answer only.";

export const searchScopeOptions: SearchScopeOption[] = [
  { value: "all", label: "All indexed", detail: "Everything currently stored in the indexed session catalog." },
  { value: "standalone", label: "Main only", detail: "Root sessions without subagent or team lineage." },
  { value: "subagent", label: "Subagent", detail: "Sessions with subagent sidechain activity." },
  { value: "team", label: "Team", detail: "Sessions tied to Claude team members." },
];

export const initialChecks: Record<CheckKey, CheckResult> = {
  health: { status: "idle", detail: "Not run yet" },
  status: { status: "idle", detail: "Not run yet" },
  search: { status: "idle", detail: "Waiting for query" },
  agents: { status: "idle", detail: "Not loaded yet" },
  teams: { status: "idle", detail: "Not loaded yet" },
  runtime: { status: "idle", detail: "Not inspected yet" },
  websocket: { status: "loading", detail: "Connecting to live feed" },
};

export const navigationSections: NavigationSection[] = [
  {
    id: "overview",
    label: "Overview",
    children: [
      { id: "status", label: "Status", sectionId: "overview-status" },
      { id: "bootstrap", label: "Bootstrap", sectionId: "overview-bootstrap" },
      { id: "workspace", label: "Workspace", sectionId: "overview-workspace" },
    ],
  },
  {
    id: "sessions",
    label: "Sessions",
    children: [
      { id: "sessions", label: "Sessions", page: "sessions", sectionId: "sessions-explorer" },
      { id: "teams", label: "Teams", page: "teams", sectionId: "teams-table" },
      { id: "agents", label: "Agents", page: "agents", sectionId: "agents-table" },
      { id: "tasks", label: "Tasks", page: "team-tasks", sectionId: "team-tasks-table" },
      { id: "tools", label: "Tools", page: "runtime-tools", sectionId: "runtime-tools-table" },
    ],
  },
  {
    id: "runtime",
    label: "Runtime",
    children: [
      { id: "summary", label: "Summary", sectionId: "runtime-summary" },
      { id: "tools", label: "Tools", page: "runtime-tools", sectionId: "runtime-tools-table" },
      { id: "commands", label: "Commands", page: "runtime-commands", sectionId: "runtime-commands-table" },
      { id: "skills", label: "Skills", page: "runtime-skills", sectionId: "runtime-skills-table" },
      { id: "plugins", label: "Plugins", page: "runtime-plugins", sectionId: "runtime-plugins-table" },
      { id: "mcp", label: "MCP", page: "runtime-mcp", sectionId: "runtime-mcp-table" },
      { id: "agents", label: "Agents", page: "runtime-agents", sectionId: "runtime-agents-table" },
      { id: "models", label: "Models", page: "runtime-models", sectionId: "runtime-models-table" },
      { id: "payload", label: "Payload", sectionId: "runtime-payload" },
    ],
  },
  {
    id: "config",
    label: "Configuration",
    children: [
      { id: "summary", label: "Overview", sectionId: "config-summary" },
      { id: "settings", label: "Settings", page: "config-settings", sectionId: "config-settings-global" },
      { id: "plugins", label: "Plugins", page: "config-plugins", sectionId: "config-plugins-installed" },
      { id: "skills", label: "Skills", page: "config-skills", sectionId: "config-skills-table" },
      { id: "commands", label: "Commands", page: "config-commands", sectionId: "config-commands-table" },
      { id: "agents", label: "Agents", page: "config-agents", sectionId: "config-agents-table" },
      { id: "mcp", label: "MCP", page: "config-mcp", sectionId: "config-mcp-table" },
      { id: "memory", label: "Memory", page: "config-memory", sectionId: "config-memory-summary" },
    ],
  },
  {
    id: "live-feed",
    label: "Live feed",
    children: [
      { id: "log", label: "Event log", sectionId: "live-feed-log" },
      { id: "controls", label: "Controls", sectionId: "live-feed-controls" },
      { id: "notes", label: "Notes", sectionId: "live-feed-notes" },
    ],
  },
  {
    id: "analytics",
    label: "Analytics",
    children: [
      { id: "summary", label: "Summary", sectionId: "analytics-summary" },
      { id: "trends", label: "Trends", sectionId: "analytics-trends" },
      { id: "facets", label: "Facets", sectionId: "analytics-facets" },
      { id: "tools", label: "Tools", sectionId: "analytics-tools" },
      { id: "traces", label: "Traces", sectionId: "analytics-traces" },
    ],
  },
  {
    id: "imports",
    label: "Imports",
    children: [
      { id: "status", label: "Status", sectionId: "imports-status" },
      { id: "examples", label: "Examples", sectionId: "imports-examples" },
    ],
  },
];

export function deriveDirectoryName(path?: string): string {
  if (!path) return "Unknown cwd";
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

export function normalizeSessionEntry(
  session: SessionListEntry | SessionSearchEntry,
  source: SessionExplorerSource
): SessionExplorerEntry {
  const cwd = "directoryPath" in session ? session.directoryPath : session.cwd;
  const directoryPath = cwd ?? "";

  return {
    id: session.id,
    sessionId: "sessionId" in session ? (session.sessionId ?? session.id) : session.id,
    summary: session.summary,
    customTitle: session.customTitle,
    firstPrompt: session.firstPrompt,
    project: session.project,
    cwd: session.cwd ?? directoryPath,
    directoryPath,
    directoryName: "directoryName" in session ? session.directoryName : deriveDirectoryName(directoryPath),
    parentDirectoryPath: "parentDirectoryPath" in session ? session.parentDirectoryPath : undefined,
    indexed: "indexed" in session ? session.indexed : true,
    messageCount: session.messageCount,
    gitBranch: session.gitBranch,
    tag: session.tag,
    status: session.status,
    createdAt: session.createdAt,
    lastModified: session.lastModified,
    relevanceScore: "relevanceScore" in session ? session.relevanceScore : undefined,
    metadata: session.metadata ?? [],
    lineage: session.lineage,
    source,
  };
}

export function groupSessionEntriesByDirectory(
  sessions: SessionExplorerEntry[],
  sessionLimit = 8
): SessionExplorerGroup[] {
  const groups = new Map<string, SessionExplorerEntry[]>();

  for (const session of sessions) {
    const key = session.directoryPath || session.cwd || "Unknown cwd";
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(session);
      continue;
    }
    groups.set(key, [session]);
  }

  return [...groups.entries()]
    .map(([path, entries]) => {
      const sorted = [...entries].sort(
        (left, right) => (right.lastModified ?? 0) - (left.lastModified ?? 0)
      );
      const gitBranches = new Set<string>();
      for (const entry of sorted) {
        if (entry.gitBranch) {
          gitBranches.add(entry.gitBranch);
        }
      }

      return {
        path,
        name: sorted[0]?.directoryName ?? deriveDirectoryName(path),
        sessionCount: sorted.length,
        indexedSessionCount: sorted.filter((entry) => entry.indexed).length,
        mainSessionCount: sorted.filter(
          (entry) => !entry.lineage.hasSubagents && !entry.lineage.hasTeamMembers
        ).length,
        subagentSessionCount: sorted.filter((entry) => entry.lineage.hasSubagents).length,
        teamSessionCount: sorted.filter((entry) => entry.lineage.hasTeamMembers).length,
        lastModified: sorted[0]?.lastModified ?? 0,
        gitBranches: [...gitBranches].sort(),
        hasMoreSessions: sorted.length > sessionLimit,
        sessions: sorted.slice(0, sessionLimit),
      };
    })
    .sort((left, right) => right.lastModified - left.lastModified);
}

export function getSessionTitle(session: SessionExplorerEntry): string {
  return session.customTitle || session.summary || session.firstPrompt || session.sessionId || session.id;
}

export function labelForStatus(status: CheckStatus): string {
  switch (status) {
    case "loading":
      return "Running";
    case "pass":
      return "Ready";
    case "error":
      return "Issue";
    case "idle":
      return "Idle";
  }
}

export function labelForSearchScope(scope: SearchLineageFilter): string {
  return searchScopeOptions.find((option) => option.value === scope)?.label ?? "All indexed";
}

export function eventBadgeVariant(
  category: EventLogEntry["category"]
): "success" | "warning" | "destructive" | "info" | "outline" {
  switch (category) {
    case "session":
      return "info";
    case "hook":
      return "warning";
    case "team":
      return "success";
    case "error":
      return "destructive";
    case "socket":
    case "local":
      return "outline";
  }
}

export function getWebSocketUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/v1/ws`;
}

export function buildPlaygroundHash(
  page: PlaygroundPageId,
  section?: string
): string {
  return `#/${page}${section ? `/${encodeURIComponent(section)}` : ""}`;
}

export function parsePlaygroundHash(hash: string): PlaygroundRoute {
  const value = hash.replace(/^#/, "").replace(/^\/+/, "");
  if (!value) {
    return { page: "overview" };
  }

  const [pageCandidate, section] = value.split("/");
  return {
    page: isPlaygroundPageId(pageCandidate) ? pageCandidate : "overview",
    section: section ? decodeURIComponent(section) : undefined,
  };
}

function isPlaygroundPageId(value: string): value is PlaygroundPageId {
  return value === "session-detail"
    || navigationSections.some((section) =>
      section.id === value || section.children.some((child) => child.page === value)
    );
}
