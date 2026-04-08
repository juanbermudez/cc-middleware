/**
 * CC-Middleware public API.
 * Re-exports all key modules for consumers.
 */

// === Types ===
export type {
  SessionInfo,
  SessionMessage,
  SessionFilter,
  PermissionMode,
  SessionLaunchOptions,
  SessionUsage,
  ModelUsageEntry,
  SessionResultSubtype,
  SessionResult,
  ActiveSession,
} from "./types/sessions.js";

export type {
  HookEventType,
  BlockingEventType,
  NonBlockingEventType,
  HookSpecificOutput,
  HookJSONOutput,
  AsyncHookJSONOutput,
  HookHandler,
  HookSubscription,
  BaseHookInput,
  PreToolUseInput,
  PostToolUseInput,
  PostToolUseFailureInput,
  SessionStartInput,
  SessionEndInput,
  StopInput,
  UserPromptSubmitInput,
  HookInput,
} from "./types/hooks.js";

export type {
  AgentModel,
  AgentMcpServerSpec,
  AgentDefinition,
  AgentInfo,
  TeamConfig,
  TeamMember,
  TeamMemberStatus,
  TeamTask,
  TeamTaskStatus,
} from "./types/agents.js";

export {
  MiddlewareError,
  SessionNotFoundError,
  SessionAlreadyActiveError,
  PermissionDeniedError,
  AgentNotFoundError,
  HookTimeoutError,
} from "./types/errors.js";

// === Sessions ===
export { SessionManager, createSessionManager } from "./sessions/manager.js";
export type { TrackedSession, SessionManagerEvents } from "./sessions/manager.js";
export { launchSession, resumeSession, continueSession, forkSession } from "./sessions/launcher.js";
export type { LaunchOptions, LaunchResult } from "./sessions/launcher.js";
export { launchStreamingSession } from "./sessions/streaming.js";
export type { StreamingSession, SessionStreamEvent } from "./sessions/streaming.js";
export { discoverSessions, discoverAllProjects } from "./sessions/discovery.js";
export type { DiscoverSessionsOptions } from "./sessions/discovery.js";
export { readSessionMessages, extractTextContent, extractToolUses } from "./sessions/messages.js";
export type { ReadMessagesOptions } from "./sessions/messages.js";
export { getSession, updateSessionTitle, updateSessionTag } from "./sessions/info.js";
export {
  buildSessionCatalog,
  groupSessionCatalogByDirectory,
  buildTeamMemberships,
} from "./sessions/catalog.js";
export type {
  SessionCatalogTeamMembership,
  SessionCatalogLineageFilter,
  SessionCatalogLineage,
  SessionCatalogEntry,
  SessionDirectoryGroup,
  BuildSessionCatalogOptions,
  GroupCatalogOptions,
} from "./sessions/catalog.js";

// === Hooks ===
export { HookEventBus, createEventBus, ALL_HOOK_EVENT_TYPES } from "./hooks/event-bus.js";
export type { EventBusEvents } from "./hooks/event-bus.js";
export { BlockingHookRegistry, createBlockingRegistry, BLOCKING_EVENTS, BLOCKING_EVENT_SET } from "./hooks/blocking.js";
export type { BlockingHookHandler } from "./hooks/blocking.js";
export { createSDKHooks, createFullSDKHooks } from "./hooks/sdk-bridge.js";
export { createHookServer } from "./hooks/server.js";
export type { HookServer, HookServerOptions } from "./hooks/server.js";

// === Permissions ===
export { PolicyEngine, createPolicyEngine } from "./permissions/policy.js";
export type { PermissionRule, PermissionPolicy, PolicyDecision } from "./permissions/policy.js";
export { PermissionManager, createCanUseTool } from "./permissions/handler.js";
export type { PermissionResult, CanUseTool, PendingPermission, PermissionHandlerOptions } from "./permissions/handler.js";
export { AskUserQuestionManager, createAskUserQuestionManager } from "./permissions/ask-user.js";
export type { Question, QuestionOption, AskUserQuestionInput, QuestionHandler, PendingQuestion } from "./permissions/ask-user.js";

// === Agents ===
export { AgentRegistry, createAgentRegistry } from "./agents/registry.js";
export { AgentLauncher, createAgentLauncher } from "./agents/launcher.js";
export { TeamManager, createTeamManager } from "./agents/teams.js";
export type { TeamInfo, TeamMemberInfo, TeamTaskInfo } from "./agents/teams.js";
export { readAgentDefinitions, parseAgentMarkdown } from "./agents/definitions.js";
export type { AgentDefinitionSource, AgentSource, ReadAgentOptions } from "./agents/definitions.js";

// === API Server ===
export { createMiddlewareServer } from "./api/server.js";
export type { MiddlewareServerOptions, MiddlewareContext, MiddlewareServer } from "./api/server.js";

// === Store & Search ===
export { createStore } from "./store/db.js";
export type {
  SessionStore,
  StoreOptions,
  IndexedSession,
  IndexedMessage,
  IndexedSessionRelationship,
  SessionMetadataDefinition,
  SessionMetadataValue,
  SessionMetadataEntry,
} from "./store/db.js";
export { SessionIndexer } from "./store/indexer.js";
export type { IndexerOptions, IndexResult, IndexStats } from "./store/indexer.js";
export {
  searchSessions,
  searchMessages,
  enrichSearchResultEntryWithTeams,
} from "./store/search.js";
export type {
  SearchOptions,
  SearchResult,
  SearchResultEntry,
  SearchLineageFilter,
  SearchSessionLineage,
  SearchTeamMembership,
} from "./store/search.js";

// === Config ===
export { readAllSettings, readSettingsFile, mergeSettings } from "./config/settings.js";
export type { SettingsFile, MergedSettings } from "./config/settings.js";
export { updateSettings, addPermissionRule, removePermissionRule, setSettingValue, getSettingsPath } from "./config/settings-writer.js";
export type { SettingsUpdate } from "./config/settings-writer.js";
export {
  listInstalledPlugins,
  listAvailablePluginsViaCli,
  listKnownMarketplaces,
  listMarketplacePlugins,
  getPluginDetails,
  getPluginProvenance,
  isPluginEnabled,
  enablePlugin,
  disablePlugin,
  installPlugin,
  updatePlugin,
  uninstallPlugin,
  addMarketplace,
  removeMarketplace,
  updateMarketplace,
} from "./config/plugins.js";
export type {
  PluginInfo,
  MarketplaceInfo,
  MarketplacePluginInfo,
  CliInstalledPluginInfo,
  CliAvailablePluginInfo,
  AvailablePluginCatalog,
  PluginEnablementSource,
  PluginProvenance,
} from "./config/plugins.js";
export { discoverMcpServers, addMcpServer, removeMcpServer } from "./config/mcp.js";
export type { McpServerInfo } from "./config/mcp.js";
export { readProjectMemory, listAllProjectMemories, encodeProjectKey } from "./config/memory.js";
export type { MemoryInfo, MemoryFileInfo } from "./config/memory.js";
export { discoverSkills, discoverCommands, discoverAgents, discoverRules, discoverClaudeMd, createAgent, deleteAgent, updateAgent } from "./config/components.js";
export type { SkillInfo, CommandInfo, AgentFileInfo, RuleInfo, ClaudeMdInfo } from "./config/components.js";
export { inspectClaudeRuntime } from "./config/runtime.js";
export type { RuntimeInventoryOptions, RuntimePluginInfo, RuntimeMcpServerInfo, ClaudeRuntimeInventory } from "./config/runtime.js";
export {
  readGlobalConfigSummary,
  listTrackedProjects,
  getTrackedProject,
  getCurrentProjectState,
  listWritableGlobalPreferences,
  updateGlobalPreference,
} from "./config/global.js";
export type {
  GlobalConfigSummary,
  TrackedProjectSummary,
  GlobalPreferenceKey,
  GlobalPreferenceDefinition,
} from "./config/global.js";

// === Plugin ===
export { createMiddlewareMcpServer } from "./plugin/mcp-server.js";

// === Sync ===
export { SessionWatcher } from "./sync/session-watcher.js";
export type { SessionWatcherOptions, SessionWatchEvent, SessionWatcherStatus } from "./sync/session-watcher.js";
export { ConfigWatcher } from "./sync/config-watcher.js";
export type {
  ConfigWatcherOptions,
  ConfigChangeEvent,
  SettingsChangeEvent,
  ComponentChangeEvent,
  TeamChangeEvent,
  ConfigWatcherStatus,
} from "./sync/config-watcher.js";
export { AutoIndexer } from "./sync/auto-indexer.js";
export type { AutoIndexerOptions, AutoIndexerStats } from "./sync/auto-indexer.js";
