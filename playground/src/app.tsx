import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { Agentation } from "agentation";
import { MoonStar, SunMedium } from "lucide-react";
import { SidebarSection } from "./components/playground-ui";
import { AgentsPage } from "./pages/agents-page";
import { AnalyticsPage } from "./pages/analytics-page";
import { ConfigAgentsPage } from "./pages/config-agents-page";
import { ConfigCommandsPage } from "./pages/config-commands-page";
import { ConfigMcpPage } from "./pages/config-mcp-page";
import { ConfigMemoryPage } from "./pages/config-memory-page";
import { ConfigPage } from "./pages/config-page";
import { ConfigPluginsPage } from "./pages/config-plugins-page";
import { ConfigSettingsPage } from "./pages/config-settings-page";
import { ConfigSkillsPage } from "./pages/config-skills-page";
import { ImportsPage } from "./pages/imports-page";
import { LiveFeedPage } from "./pages/live-feed-page";
import { OverviewPage } from "./pages/overview-page";
import { TeamsPage } from "./pages/teams-page";
import { RuntimeAgentsPage } from "./pages/runtime-agents-page";
import { RuntimeCommandsPage } from "./pages/runtime-commands-page";
import { RuntimeMcpPage } from "./pages/runtime-mcp-page";
import { RuntimeModelsPage } from "./pages/runtime-models-page";
import { RuntimePage } from "./pages/runtime-page";
import { RuntimePluginsPage } from "./pages/runtime-plugins-page";
import { RuntimeSkillsPage } from "./pages/runtime-skills-page";
import { RuntimeToolsPage } from "./pages/runtime-tools-page";
import { SessionDetailPage } from "./pages/session-detail-page";
import { SessionsPage } from "./pages/sessions-page";
import { TeamTasksPage } from "./pages/team-tasks-page";
import {
  type AgentsResponse,
  type CheckKey,
  type CheckResult,
  type EventLogEntry,
  type HealthResponse,
  type MiddlewareStatusResponse,
  type PlaygroundPageId,
  type PlaygroundRoute,
  type RuntimeResponse,
  type SearchResponse,
  type SearchStatsResponse,
  type SessionDirectoriesResponse,
  type SessionExplorerEntry,
  type SessionExplorerGroup,
  type SessionMetadataDefinition,
  type SessionMetadataValuesResponse,
  type SessionsResponse,
  type SocketMessage,
  type SyncStatusResponse,
  type TeamsResponse,
  DEFAULT_SEARCH_QUERY,
  DEFAULT_STREAM_PROMPT,
  buildPlaygroundHash,
  getWebSocketUrl,
  groupSessionEntriesByDirectory,
  initialChecks,
  labelForSearchScope,
  navigationSections,
  normalizeSessionEntry,
  parsePlaygroundHash,
  searchScopeOptions,
  type SearchLineageFilter,
} from "./lib/playground";

const SIDEBAR_STATE_STORAGE_KEY = "cc-middleware.playground.sidebar";
const THEME_MODE_STORAGE_KEY = "cc-middleware.playground.theme";
const AGENTATION_ENDPOINT = import.meta.env.VITE_AGENTATION_ENDPOINT?.trim() || "http://localhost:4747";

type ThemeMode = "light" | "dark";

function ThemeSwitcher(props: {
  mode: ThemeMode;
  onToggle: () => void;
}) {
  const nextLabel = props.mode === "dark" ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      className="theme-toggle flex w-full items-center justify-between rounded-xl px-3 py-2"
      data-mode={props.mode}
      aria-label={nextLabel}
      onClick={props.onToggle}
    >
      <div className="space-y-0.5 text-left">
        <div className="text-[10px] font-semibold uppercase tracking-[0.22em] themed-subtle">
          Theme
        </div>
        <div className="text-xs themed-body">
          {props.mode === "dark" ? "Dark mode" : "Light mode"}
        </div>
      </div>

      <span className="theme-toggle-track">
        <span className="theme-toggle-thumb">
          <span className="theme-toggle-icon theme-toggle-icon-sun">
            <SunMedium className="h-3.5 w-3.5" />
          </span>
          <span className="theme-toggle-icon theme-toggle-icon-moon">
            <MoonStar className="h-3.5 w-3.5" />
          </span>
        </span>
      </span>
    </button>
  );
}

function createExpandedSectionState(): Record<string, boolean> {
  return Object.fromEntries(navigationSections.map((section) => [section.id, false]));
}

function loadExpandedSectionState(): Record<string, boolean> {
  const defaults = createExpandedSectionState();

  try {
    const raw = window.localStorage.getItem(SIDEBAR_STATE_STORAGE_KEY);
    if (!raw) {
      return defaults;
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      navigationSections.map((section) => [
        section.id,
        typeof parsed[section.id] === "boolean" ? parsed[section.id] : defaults[section.id],
      ])
    );
  } catch {
    return defaults;
  }
}

function loadThemeMode(): ThemeMode {
  try {
    const raw = window.localStorage.getItem(THEME_MODE_STORAGE_KEY);
    if (raw === "light" || raw === "dark") {
      return raw;
    }
  } catch {
    // Ignore storage issues and fall back to the system theme.
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function App() {
  const socketRef = useRef<WebSocket | null>(null);
  const catalogRefreshTimeoutRef = useRef<number | null>(null);
  const [route, setRoute] = useState<PlaygroundRoute>(() => parsePlaygroundHash(window.location.hash));
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => loadThemeMode());
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(
    () => loadExpandedSectionState()
  );
  const [checks, setChecks] = useState<Record<CheckKey, CheckResult>>(initialChecks);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [middlewareStatus, setMiddlewareStatus] = useState<MiddlewareStatusResponse | null>(null);
  const [searchQuery, setSearchQuery] = useState(DEFAULT_SEARCH_QUERY);
  const [searchMetadataKey, setSearchMetadataKey] = useState("");
  const [searchMetadataValue, setSearchMetadataValue] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [searchLineageFilter, setSearchLineageFilter] = useState<SearchLineageFilter>("all");
  const [searchTeamFilter, setSearchTeamFilter] = useState<string>("all");
  const [searchResults, setSearchResults] = useState<SearchResponse | null>(null);
  const [searchStats, setSearchStats] = useState<SearchStatsResponse | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [recentSessions, setRecentSessions] = useState<SessionsResponse | null>(null);
  const [sessionDirectories, setSessionDirectories] = useState<SessionDirectoriesResponse | null>(null);
  const [sessionMetadataDefinitions, setSessionMetadataDefinitions] = useState<
    SessionMetadataDefinition[]
  >([]);
  const [metadataActionState, setMetadataActionState] = useState<CheckResult>({
    status: "idle",
    detail: "Register a field or write a value to the selected session.",
  });
  const [metadataPreview, setMetadataPreview] = useState<SessionMetadataValuesResponse | null>(null);
  const [agents, setAgents] = useState<AgentsResponse | null>(null);
  const [teams, setTeams] = useState<TeamsResponse | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<string>("");
  const [teamTaskCount, setTeamTaskCount] = useState<number | null>(null);
  const [runtime, setRuntime] = useState<RuntimeResponse | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatusResponse | null>(null);
  const [eventLog, setEventLog] = useState<EventLogEntry[]>([]);
  const [streamPrompt, setStreamPrompt] = useState(DEFAULT_STREAM_PROMPT);
  const [socketGeneration, setSocketGeneration] = useState(0);
  const [hookEventCount, setHookEventCount] = useState(0);
  const [sessionEventCount, setSessionEventCount] = useState(0);
  const [teamEventCount, setTeamEventCount] = useState(0);
  const [reindexState, setReindexState] = useState<CheckResult>({
    status: "idle",
    detail: "Not run yet",
  });

  const appendEvent = useEffectEvent((entry: Omit<EventLogEntry, "id">) => {
    const nextEntry: EventLogEntry = {
      ...entry,
      id: `${entry.category}-${entry.timestamp}-${Math.random().toString(36).slice(2, 8)}`,
    };

    startTransition(() => {
      setEventLog((current) => [nextEntry, ...current].slice(0, 80));
    });
  });

  const scheduleCatalogRefresh = useEffectEvent(() => {
    if (catalogRefreshTimeoutRef.current !== null) {
      window.clearTimeout(catalogRefreshTimeoutRef.current);
    }

    catalogRefreshTimeoutRef.current = window.setTimeout(() => {
      catalogRefreshTimeoutRef.current = null;
      void Promise.allSettled([
        loadRecentSessions(),
        loadSessionDirectories(),
        loadSearchStats(),
      ]);
    }, 250);
  });

  const handleSocketMessage = useEffectEvent((message: SocketMessage) => {
    if (message.type === "hook:event") {
      setHookEventCount((count) => count + 1);
      appendEvent({
        category: "hook",
        title: message.eventType ?? "Hook event",
        detail: "Hook traffic reached the middleware event bus.",
        timestamp: Date.now(),
      });
      return;
    }

    if (message.type.startsWith("session:")) {
      setSessionEventCount((count) => count + 1);
      if (
        message.type === "session:completed"
        || message.type === "session:discovered"
        || message.type === "session:updated"
        || message.type === "session:removed"
      ) {
        scheduleCatalogRefresh();
      }
      appendEvent({
        category: "session",
        title: message.type,
        detail:
          message.event?.text
          ?? message.result?.result
          ?? message.event?.name
          ?? message.sessionId
          ?? "Session lifecycle event received.",
        timestamp: Date.now(),
      });
      return;
    }

    if (message.type.startsWith("team:")) {
      setTeamEventCount((count) => count + 1);
      scheduleCatalogRefresh();
      appendEvent({
        category: "team",
        title: message.type,
        detail: "Team watcher event received.",
        timestamp: Date.now(),
      });
      return;
    }

    if (message.type === "pong") {
      appendEvent({
        category: "socket",
        title: "pong",
        detail: "WebSocket health check succeeded.",
        timestamp: Date.now(),
      });
      return;
    }

    if (message.type === "error") {
      appendEvent({
        category: "error",
        title: "socket:error",
        detail: message.error ?? "WebSocket error message received.",
        timestamp: Date.now(),
      });
    }
  });

  function updateCheck(key: CheckKey, result: CheckResult) {
    setChecks((current) => ({
      ...current,
      [key]: result,
    }));
  }

  async function getJson<T>(path: string): Promise<T> {
    const response = await fetch(path);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${response.status} ${response.statusText}: ${text}`.trim());
    }
    return response.json() as Promise<T>;
  }

  async function postJson<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetch(path, {
      method: "POST",
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${response.status} ${response.statusText}: ${text}`.trim());
    }

    return response.json() as Promise<T>;
  }

  async function putJson<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetch(path, {
      method: "PUT",
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${response.status} ${response.statusText}: ${text}`.trim());
    }

    return response.json() as Promise<T>;
  }

  async function deleteJson<T>(path: string): Promise<T> {
    const response = await fetch(path, {
      method: "DELETE",
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${response.status} ${response.statusText}: ${text}`.trim());
    }

    return response.json() as Promise<T>;
  }

  function toggleSection(sectionId: string): void {
    setExpandedSections((current) => ({
      ...current,
      [sectionId]: !current[sectionId],
    }));
  }

  function navigateTo(page: PlaygroundPageId, section?: string): void {
    const nextHash = buildPlaygroundHash(page, section);
    if (window.location.hash === nextHash) {
      setRoute({ page, section });
      scrollToSection(section);
      return;
    }
    window.location.hash = nextHash;
  }

  async function loadOverview(): Promise<void> {
    updateCheck("health", { status: "loading", detail: "Checking /health" });
    updateCheck("status", { status: "loading", detail: "Checking /api/v1/status" });

    const [healthResult, statusResult] = await Promise.allSettled([
      getJson<HealthResponse>("/health"),
      getJson<MiddlewareStatusResponse>("/api/v1/status"),
    ]);

    if (healthResult.status === "fulfilled") {
      setHealth(healthResult.value);
      updateCheck("health", {
        status: "pass",
        detail: `Middleware ${healthResult.value.version} is healthy.`,
      });
    } else {
      updateCheck("health", {
        status: "error",
        detail: healthResult.reason instanceof Error ? healthResult.reason.message : String(healthResult.reason),
      });
    }

    if (statusResult.status === "fulfilled") {
      setMiddlewareStatus(statusResult.value);
      updateCheck("status", {
        status: "pass",
        detail: `${statusResult.value.registeredAgents} agents, ${statusResult.value.activeSessions} active sessions.`,
      });
    } else {
      updateCheck("status", {
        status: "error",
        detail: statusResult.reason instanceof Error ? statusResult.reason.message : String(statusResult.reason),
      });
    }
  }

  async function loadRecentSessions(): Promise<void> {
    const result = await getJson<SessionsResponse>("/api/v1/sessions?limit=24");
    setRecentSessions(result);
  }

  async function loadSessionDirectories(): Promise<void> {
    const params = new URLSearchParams({
      limit: "8",
      sessionLimit: "8",
    });
    if (searchLineageFilter !== "all") {
      params.set("lineage", searchLineageFilter);
    }
    if (searchTeamFilter !== "all") {
      params.set("team", searchTeamFilter);
    }
    if (searchMetadataKey.trim()) {
      params.set("metadataKey", searchMetadataKey.trim());
    }
    if (searchMetadataValue.trim()) {
      params.set("metadataValue", searchMetadataValue.trim());
    }

    const result = await getJson<SessionDirectoriesResponse>(
      `/api/v1/sessions/directories?${params.toString()}`
    );
    setSessionDirectories(result);
  }

  async function loadSessionMetadataDefinitions(): Promise<void> {
    const result = await getJson<{ definitions: SessionMetadataDefinition[] }>(
      "/api/v1/sessions/metadata/definitions"
    );
    setSessionMetadataDefinitions(result.definitions);
  }

  async function loadSearchStats(): Promise<void> {
    const result = await getJson<SearchStatsResponse>("/api/v1/search/stats");
    setSearchStats(result);
  }

  async function loadSyncStatus(): Promise<void> {
    const result = await getJson<SyncStatusResponse>("/api/v1/sync/status");
    setSyncStatus(result);
  }

  async function runSearch(query: string): Promise<void> {
    const normalized = query.trim();
    updateCheck("search", {
      status: "loading",
      detail: `Searching ${labelForSearchScope(searchLineageFilter).toLowerCase()} for "${normalized || "recent sessions"}"`,
    });
    setSearchError(null);

    try {
      const params = new URLSearchParams({
        q: normalized,
        limit: "24",
      });
      if (searchLineageFilter !== "all") {
        params.set("lineage", searchLineageFilter);
      }
      if (searchTeamFilter !== "all") {
        params.set("team", searchTeamFilter);
      }
      if (searchMetadataKey.trim()) {
        params.set("metadataKey", searchMetadataKey.trim());
      }
      if (searchMetadataValue.trim()) {
        params.set("metadataValue", searchMetadataValue.trim());
      }

      const result = await getJson<SearchResponse>(`/api/v1/search?${params.toString()}`);
      setSearchResults(result);
      updateCheck("search", {
        status: "pass",
        detail: `${result.total} ${labelForSearchScope(searchLineageFilter).toLowerCase()} matches in ${result.queryTimeMs}ms.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSearchError(message);
      updateCheck("search", { status: "error", detail: message });
    }
  }

  async function saveMetadataDefinition(definition: {
    key: string;
    label: string;
    description?: string;
    searchable: boolean;
    filterable: boolean;
  }): Promise<void> {
    setMetadataActionState({
      status: "loading",
      detail: `Saving ${definition.key} in the session metadata schema.`,
    });

    try {
      const result = await postJson<{ definition: SessionMetadataDefinition }>(
        "/api/v1/sessions/metadata/definitions",
        {
          key: definition.key.trim(),
          label: definition.label.trim(),
          description: definition.description?.trim() || undefined,
          searchable: definition.searchable,
          filterable: definition.filterable,
        }
      );

      await loadSessionMetadataDefinitions();
      setMetadataActionState({
        status: "pass",
        detail: `${result.definition.label} is now available for search and filtering.`,
      });
    } catch (error) {
      setMetadataActionState({
        status: "error",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function deleteMetadataDefinition(key: string): Promise<void> {
    setMetadataActionState({
      status: "loading",
      detail: `Removing ${key} from the session metadata schema.`,
    });

    try {
      await deleteJson<{ definitions: SessionMetadataDefinition[] }>(
        `/api/v1/sessions/metadata/definitions/${encodeURIComponent(key)}`
      );
      if (searchMetadataKey.trim() === key) {
        setSearchMetadataKey("");
        setSearchMetadataValue("");
      }

      setMetadataPreview(null);
      setMetadataActionState({
        status: "pass",
        detail: `${key} was removed from the metadata schema.`,
      });
      await Promise.allSettled([
        loadSessionMetadataDefinitions(),
        loadRecentSessions(),
        loadSessionDirectories(),
        runSearch(searchQuery),
      ]);
    } catch (error) {
      setMetadataActionState({
        status: "error",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function writeMetadataValue(sessionId: string, payload: {
    key: string;
    value: string;
  }): Promise<void> {
    setMetadataActionState({
      status: "loading",
      detail: `Writing ${payload.key} onto session ${sessionId.slice(0, 20)}.`,
    });

    try {
      const result = await putJson<SessionMetadataValuesResponse>(
        `/api/v1/sessions/${encodeURIComponent(sessionId)}/metadata`,
        {
          key: payload.key.trim(),
          value: payload.value.trim(),
        }
      );

      setMetadataPreview(result);
      setMetadataActionState({
        status: "pass",
        detail: `Saved ${payload.key} on ${sessionId.slice(0, 20)} and refreshed the explorer.`,
      });
      await Promise.allSettled([
        loadSessionMetadataDefinitions(),
        loadRecentSessions(),
        loadSessionDirectories(),
        runSearch(searchQuery),
      ]);
    } catch (error) {
      setMetadataActionState({
        status: "error",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function runReindex(): Promise<void> {
    setReindexState({
      status: "loading",
      detail: "Indexing existing Claude sessions into the SQLite search store.",
    });

    try {
      const result = await postJson<{
        status: string;
        sessionsIndexed: number;
        messagesIndexed: number;
        errors: Array<{ sessionId: string; error: string }>;
        durationMs: number;
      }>("/api/v1/search/reindex");

      setReindexState({
        status: result.errors.length > 0 ? "error" : "pass",
        detail: result.errors.length > 0
          ? `Indexed ${result.sessionsIndexed} sessions in ${result.durationMs}ms with ${result.errors.length} errors.`
          : `Indexed ${result.sessionsIndexed} sessions and ${result.messagesIndexed} messages in ${result.durationMs}ms.`,
      });

      appendEvent({
        category: result.errors.length > 0 ? "error" : "local",
        title: "search:reindex",
        detail: result.errors.length > 0
          ? `Reindex completed with ${result.errors.length} errors.`
          : "Reindex completed successfully.",
        timestamp: Date.now(),
      });

      await refreshImportState();
      await runSearch(searchQuery);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setReindexState({ status: "error", detail });
    }
  }

  async function loadAgentsAndTeams(): Promise<void> {
    updateCheck("agents", { status: "loading", detail: "Loading /api/v1/agents" });
    updateCheck("teams", { status: "loading", detail: "Loading /api/v1/teams" });

    const [agentsResult, teamsResult] = await Promise.allSettled([
      getJson<AgentsResponse>("/api/v1/agents"),
      getJson<TeamsResponse>("/api/v1/teams"),
    ]);

    if (agentsResult.status === "fulfilled") {
      setAgents(agentsResult.value);
      updateCheck("agents", {
        status: "pass",
        detail: `${agentsResult.value.total} agent definitions available.`,
      });
    } else {
      updateCheck("agents", {
        status: "error",
        detail: agentsResult.reason instanceof Error ? agentsResult.reason.message : String(agentsResult.reason),
      });
    }

    if (teamsResult.status === "fulfilled") {
      setTeams(teamsResult.value);
      updateCheck("teams", {
        status: "pass",
        detail: teamsResult.value.total > 0
          ? `${teamsResult.value.total} team configurations found.`
          : "No team configs found, but the endpoint is working.",
      });
      if (!selectedTeam && teamsResult.value.teams[0]) {
        setSelectedTeam(teamsResult.value.teams[0].name);
      }
      try {
        const taskSummary = await getJson<TeamTasksResponse>("/api/v1/tasks");
        setTeamTaskCount(taskSummary.total);
      } catch {
        setTeamTaskCount(null);
      }
    } else {
      setTeamTaskCount(null);
      updateCheck("teams", {
        status: "error",
        detail: teamsResult.reason instanceof Error ? teamsResult.reason.message : String(teamsResult.reason),
      });
    }
  }

  async function loadRuntime(): Promise<void> {
    updateCheck("runtime", { status: "loading", detail: "Inspecting /api/v1/config/runtime" });

    const runtimeResult = await Promise.allSettled([
      getJson<RuntimeResponse>("/api/v1/config/runtime"),
    ]);

    try {
      const [runtimeResponse] = runtimeResult;
      if (runtimeResponse.status !== "fulfilled") {
        throw runtimeResponse.reason;
      }

      const result = runtimeResponse.value;
      setRuntime(result);
      updateCheck("runtime", {
        status: "pass",
        detail: `${result.toolsCount} tools, ${result.plugins.length} runtime plugins, ${result.skills.length} loaded skills, ${result.models.length} models.`,
      });
    } catch (error) {
      updateCheck("runtime", {
        status: "error",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  function connectSocket(): void {
    setSocketGeneration((value) => value + 1);
  }

  function sendPing(): void {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      appendEvent({
        category: "error",
        title: "socket:unavailable",
        detail: "Reconnect the live feed before sending test actions.",
        timestamp: Date.now(),
      });
      return;
    }

    socket.send(JSON.stringify({ type: "ping" }));
  }

  function runStreamDemo(): void {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      appendEvent({
        category: "error",
        title: "stream:blocked",
        detail: "The live WebSocket feed is not connected yet.",
        timestamp: Date.now(),
      });
      return;
    }

    socket.send(
      JSON.stringify({
        type: "launch",
        options: {
          prompt: streamPrompt.trim() || DEFAULT_STREAM_PROMPT,
          maxTurns: 1,
          permissionMode: "plan",
          persistSession: true,
        },
      })
    );

    appendEvent({
      category: "local",
      title: "stream:launch",
      detail: "Sent a tiny proof session over the WebSocket launch channel.",
      timestamp: Date.now(),
    });
  }

  async function refreshImportState(): Promise<void> {
    await Promise.allSettled([
      loadRecentSessions(),
      loadSearchStats(),
      loadSyncStatus(),
      loadSessionDirectories(),
    ]);
  }

  async function runAllChecks(): Promise<void> {
    await Promise.allSettled([
      loadOverview(),
      loadRecentSessions(),
      loadSessionDirectories(),
      loadSessionMetadataDefinitions(),
      loadSearchStats(),
      loadSyncStatus(),
      runSearch(deferredSearchQuery),
      loadAgentsAndTeams(),
      loadRuntime(),
    ]);
  }

  useEffect(() => {
    if (!window.location.hash) {
      window.location.hash = buildPlaygroundHash("overview");
    }

    const syncRoute = () => {
      setRoute(parsePlaygroundHash(window.location.hash));
    };

    syncRoute();
    window.addEventListener("hashchange", syncRoute);

    return () => {
      window.removeEventListener("hashchange", syncRoute);
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      SIDEBAR_STATE_STORAGE_KEY,
      JSON.stringify(expandedSections)
    );
  }, [expandedSections]);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    document.documentElement.style.colorScheme = themeMode;

    try {
      window.localStorage.setItem(THEME_MODE_STORAGE_KEY, themeMode);
    } catch {
      // Ignore storage issues and keep the theme local to this tab.
    }
  }, [themeMode]);

  useEffect(() => {
    void runAllChecks();
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void Promise.allSettled([
        runSearch(deferredSearchQuery),
        loadSessionDirectories(),
      ]);
    }, 180);

    return () => window.clearTimeout(timeout);
  }, [deferredSearchQuery, searchLineageFilter, searchTeamFilter, searchMetadataKey, searchMetadataValue]);

  useEffect(() => {
    if (searchTeamFilter === "all") {
      return;
    }

    const teamExists = teams?.teams.some((team) => team.name === searchTeamFilter);
    if (!teamExists) {
      setSearchTeamFilter("all");
    }
  }, [teams, searchTeamFilter]);

  useEffect(() => {
    void loadSyncStatus();

    const interval = window.setInterval(() => {
      void loadSyncStatus();
    }, 4000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const socket = new WebSocket(getWebSocketUrl());
    socketRef.current = socket;
    updateCheck("websocket", { status: "loading", detail: "Connecting to /api/v1/ws" });

    socket.onopen = () => {
      updateCheck("websocket", { status: "pass", detail: "Live feed connected to session, hook, and team events." });
      socket.send(JSON.stringify({ type: "subscribe", events: ["session:*", "hook:*", "team:*"] }));
      appendEvent({
        category: "socket",
        title: "socket:open",
        detail: "Subscribed to session:*, hook:*, and team:*.",
        timestamp: Date.now(),
      });
    };

    socket.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data as string) as SocketMessage;
        handleSocketMessage(parsed);
      } catch (error) {
        appendEvent({
          category: "error",
          title: "socket:parse-error",
          detail: error instanceof Error ? error.message : String(error),
          timestamp: Date.now(),
        });
      }
    };

    socket.onerror = () => {
      updateCheck("websocket", { status: "error", detail: "WebSocket connection failed." });
    };

    socket.onclose = () => {
      updateCheck("websocket", { status: "error", detail: "WebSocket closed. Reconnect to continue streaming." });
      appendEvent({
        category: "socket",
        title: "socket:closed",
        detail: "The live feed connection closed.",
        timestamp: Date.now(),
      });
    };

    return () => {
      if (catalogRefreshTimeoutRef.current !== null) {
        window.clearTimeout(catalogRefreshTimeoutRef.current);
        catalogRefreshTimeoutRef.current = null;
      }
      socket.close();
      socketRef.current = null;
    };
  }, [socketGeneration]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      scrollToSection(route.section);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [route]);

  const indexedSessionCount = searchStats?.totalSessions ?? 0;
  const discoveredSessionCount = recentSessions?.total ?? 0;
  const sessionsNeedIndexing = discoveredSessionCount > indexedSessionCount;
  const selectedSearchScope = searchScopeOptions.find((option) => option.value === searchLineageFilter)
    ?? searchScopeOptions[0];
  const coverageDetail = recentSessions && searchStats
    ? sessionsNeedIndexing
      ? `${discoveredSessionCount - indexedSessionCount} sessions are visible on disk but not yet in the search index.`
      : "Indexed search is aligned with the currently discovered Claude session history."
    : "Load session history and index stats to compare filesystem coverage with search coverage.";
  const normalizedSearchQuery = searchQuery.trim();
  const normalizedMetadataKey = searchMetadataKey.trim();
  const normalizedMetadataValue = searchMetadataValue.trim();
  const sessionExplorerSource = normalizedSearchQuery ? "search" : "catalog";
  const sessionExplorerGroups: SessionExplorerGroup[] = sessionExplorerSource === "search"
    ? groupSessionEntriesByDirectory(
        (searchResults?.sessions ?? []).map((session) => normalizeSessionEntry(session, "search")),
        24
      )
    : (sessionDirectories?.groups ?? []).map((group) => ({
        ...group,
        sessions: group.sessions.map((session) => normalizeSessionEntry(session, "catalog")),
      }));
  const sessionExplorerGroupCount = sessionExplorerSource === "search"
    ? sessionExplorerGroups.length
    : (sessionDirectories?.totalDirectories ?? 0);
  const sessionExplorerSessionCount = sessionExplorerSource === "search"
    ? (searchResults?.total ?? 0)
    : (sessionDirectories?.totalSessions ?? 0);
  const sessionExplorerDescription = sessionExplorerSource === "search"
    ? `Grouped search hits from GET /api/v1/search. Showing the first ${searchResults?.sessions.length ?? 0} indexed matches, organized by directory.`
    : "Backed by GET /api/v1/sessions/directories. Directories anchor the list, and each parent session carries its own subagent lineage inline.";
  const sessionExplorerFilterContext = [
    searchLineageFilter !== "all" ? selectedSearchScope.label : null,
    searchTeamFilter !== "all" ? `team ${searchTeamFilter}` : null,
    normalizedMetadataKey || normalizedMetadataValue
      ? `metadata ${normalizedMetadataKey || "*"}=${normalizedMetadataValue || "*"}`
      : null,
  ].filter(Boolean).join(" · ");
  const explorerLeadSession = sessionExplorerGroups
    .flatMap((group) => group.sessions)
    .find((session) => session.indexed);
  return (
    <div className="playground-shell">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[190px_minmax(0,1fr)] xl:grid-cols-[206px_minmax(0,1fr)]">
        <aside className="playground-sidebar themed-border border-b lg:sticky lg:top-0 lg:h-screen lg:w-[190px] lg:shrink-0 lg:border-b-0 lg:border-r xl:w-[206px]">
          <div className="flex h-full flex-col px-3 py-4 md:px-4 lg:px-4 xl:px-[18px]">
            <div className="space-y-1.5">
              <div className="themed-subtle text-[11px] font-semibold uppercase tracking-[0.24em]">
                Playground
              </div>
              <div className="themed-title text-lg font-semibold tracking-tight">
                CC-Middleware
              </div>
            </div>

            <nav className="mt-6 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
              {navigationSections.map((section) => {
                const startsUtilityGroup = section.id === "live-feed";

                return (
                  <div
                    key={section.id}
                    className={startsUtilityGroup ? "themed-border mt-4 border-t pt-3" : undefined}
                  >
                    <SidebarSection
                      section={section}
                      expanded={expandedSections[section.id] ?? true}
                      currentRoute={route}
                      onToggle={() => toggleSection(section.id)}
                      onNavigate={navigateTo}
                    />
                  </div>
                );
              })}
            </nav>

            <div className="themed-border mt-4 border-t pt-3">
              <ThemeSwitcher
                mode={themeMode}
                onToggle={() => setThemeMode((current) => current === "dark" ? "light" : "dark")}
              />
            </div>
          </div>
        </aside>

        <main className="min-w-0 px-4 py-6 md:px-8 lg:px-10 lg:py-8 2xl:px-14">
          {route.page === "overview" ? (
            <OverviewPage
              activeSection={route.section}
              health={health}
              checks={{
                health: checks.health,
                status: checks.status,
                runtime: checks.runtime,
                websocket: checks.websocket,
              }}
              middlewareStatus={middlewareStatus}
              teams={teams}
              teamTaskCount={teamTaskCount}
              runtime={runtime}
              searchStats={searchStats}
              syncStatus={syncStatus}
              onRefresh={() => void runAllChecks()}
            />
          ) : null}

          {route.page === "sessions" ? (
            <SessionsPage
              activeSection={route.section}
              recentSessions={recentSessions}
              searchQuery={searchQuery}
              searchMetadataKey={searchMetadataKey}
              searchMetadataValue={searchMetadataValue}
              searchLineageFilter={searchLineageFilter}
              searchScopeOptions={searchScopeOptions}
              searchTeamFilter={searchTeamFilter}
              teams={teams}
              sessionExplorerDescription={sessionExplorerDescription}
              sessionExplorerFilterContext={sessionExplorerFilterContext}
              sessionExplorerGroups={sessionExplorerGroups}
              sessionExplorerSource={sessionExplorerSource}
              sessionDirectories={sessionDirectories}
              sessionMetadataDefinitions={sessionMetadataDefinitions}
              selectedSearchScope={selectedSearchScope}
              sessionsNeedIndexing={sessionsNeedIndexing}
              coverageDetail={coverageDetail}
              searchError={searchError}
              searchResults={searchResults}
              sessionExplorerGroupCount={sessionExplorerGroupCount}
              sessionExplorerSessionCount={sessionExplorerSessionCount}
              reindexState={reindexState}
              metadataActionState={metadataActionState}
              metadataPreview={metadataPreview}
              explorerLeadSession={explorerLeadSession}
              onSearchQueryChange={setSearchQuery}
              onSearchMetadataKeyChange={setSearchMetadataKey}
              onSearchMetadataValueChange={setSearchMetadataValue}
              onSearchLineageFilterChange={setSearchLineageFilter}
              onSearchTeamFilterChange={setSearchTeamFilter}
              onRunSearch={() => void runSearch(searchQuery)}
              onRunReindex={() => void runReindex()}
              onSaveMetadataDefinition={(definition) => void saveMetadataDefinition(definition)}
              onDeleteMetadataDefinition={(key) => void deleteMetadataDefinition(key)}
              onWriteMetadataValue={(sessionId, payload) => void writeMetadataValue(sessionId, payload)}
              onShowGroupedByDirectory={() => {
                setSearchQuery("");
                setSearchLineageFilter("all");
                setSearchTeamFilter("all");
                setSearchMetadataKey("");
                setSearchMetadataValue("");
              }}
              onShowTeamSessions={() => {
                const teamName = selectedTeam || teams?.teams[0]?.name;
                setSearchLineageFilter("team");
                if (teamName) {
                  setSearchTeamFilter(teamName);
                }
              }}
              onOpenSessionDetail={(sessionId) => navigateTo("session-detail", sessionId)}
            />
          ) : null}

          {route.page === "session-detail" ? (
            <SessionDetailPage
              sessionId={route.section}
              activeSection={route.section}
              onBackToSessions={() => navigateTo("sessions")}
              onOpenSessionDetail={(sessionId) => navigateTo("session-detail", sessionId)}
            />
          ) : null}

          {route.page === "analytics" ? (
            <AnalyticsPage
              activeSection={route.section}
            />
          ) : null}

          {route.page === "imports" ? (
            <ImportsPage
              activeSection={route.section}
              recentSessions={recentSessions}
              searchStats={searchStats}
              syncStatus={syncStatus}
              reindexState={reindexState}
              onRunReindex={() => void runReindex()}
              onRefreshStats={() => void refreshImportState()}
            />
          ) : null}

          {route.page === "live-feed" ? (
            <LiveFeedPage
              activeSection={route.section}
              websocketCheck={checks.websocket}
              eventLog={eventLog}
              streamPrompt={streamPrompt}
              sessionEventCount={sessionEventCount}
              hookEventCount={hookEventCount}
              teamEventCount={teamEventCount}
              onStreamPromptChange={setStreamPrompt}
              onRunStreamDemo={runStreamDemo}
              onSendPing={sendPing}
              onReconnect={connectSocket}
            />
          ) : null}

          {route.page === "teams" ? (
            <TeamsPage
              activeSection={route.section}
              selectedTeam={selectedTeam}
              onSelectTeam={setSelectedTeam}
              onJumpToTeamSessions={() => {
                const teamName = selectedTeam || teams?.teams[0]?.name;
                if (teamName) {
                  setSearchLineageFilter("team");
                  setSearchTeamFilter(teamName);
                }
                navigateTo("sessions", "sessions-explorer");
              }}
            />
          ) : null}

          {route.page === "agents" ? (
            <AgentsPage
              activeSection={route.section}
            />
          ) : null}

          {route.page === "team-tasks" ? (
            <TeamTasksPage
              activeSection={route.section}
              teams={teams}
              selectedTeam={selectedTeam}
              onSelectTeam={setSelectedTeam}
            />
          ) : null}

          {route.page === "runtime" ? (
            <RuntimePage
              activeSection={route.section}
              runtime={runtime}
            />
          ) : null}

          {route.page === "config" ? (
            <ConfigPage
              activeSection={route.section}
            />
          ) : null}

          {route.page === "config-settings" ? (
            <ConfigSettingsPage
              activeSection={route.section}
            />
          ) : null}

          {route.page === "config-plugins" ? (
            <ConfigPluginsPage
              activeSection={route.section}
            />
          ) : null}

          {route.page === "config-skills" ? (
            <ConfigSkillsPage
              activeSection={route.section}
            />
          ) : null}

          {route.page === "config-commands" ? (
            <ConfigCommandsPage
              activeSection={route.section}
            />
          ) : null}

          {route.page === "config-agents" ? (
            <ConfigAgentsPage
              activeSection={route.section}
            />
          ) : null}

          {route.page === "config-mcp" ? (
            <ConfigMcpPage
              activeSection={route.section}
            />
          ) : null}

          {route.page === "config-memory" ? (
            <ConfigMemoryPage
              activeSection={route.section}
            />
          ) : null}

          {route.page === "runtime-tools" ? (
            <RuntimeToolsPage
              activeSection={route.section}
            />
          ) : null}

          {route.page === "runtime-commands" ? (
            <RuntimeCommandsPage
              activeSection={route.section}
            />
          ) : null}

          {route.page === "runtime-skills" ? (
            <RuntimeSkillsPage
              activeSection={route.section}
            />
          ) : null}

          {route.page === "runtime-plugins" ? (
            <RuntimePluginsPage
              activeSection={route.section}
            />
          ) : null}

          {route.page === "runtime-mcp" ? (
            <RuntimeMcpPage
              activeSection={route.section}
            />
          ) : null}

          {route.page === "runtime-agents" ? (
            <RuntimeAgentsPage
              activeSection={route.section}
            />
          ) : null}

          {route.page === "runtime-models" ? (
            <RuntimeModelsPage
              activeSection={route.section}
            />
          ) : null}
        </main>
      </div>
      {import.meta.env.DEV ? (
        <Agentation endpoint={AGENTATION_ENDPOINT} />
      ) : null}
    </div>
  );
}

function scrollToSection(section?: string): void {
  if (!section) {
    window.scrollTo({ top: 0, behavior: "auto" });
    return;
  }

  const element = document.getElementById(section);
  if (!element) {
    window.scrollTo({ top: 0, behavior: "auto" });
    return;
  }

  element.scrollIntoView({ block: "start", behavior: "smooth" });
}
