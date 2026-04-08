import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { SidebarSection } from "./components/playground-ui";
import { AgentsPage } from "./pages/agents-page";
import { ImportsPage } from "./pages/imports-page";
import { LiveFeedPage } from "./pages/live-feed-page";
import { OverviewPage } from "./pages/overview-page";
import { RuntimeAgentsPage } from "./pages/runtime-agents-page";
import { RuntimeCommandsPage } from "./pages/runtime-commands-page";
import { RuntimeMcpPage } from "./pages/runtime-mcp-page";
import { RuntimeModelsPage } from "./pages/runtime-models-page";
import { RuntimePage } from "./pages/runtime-page";
import { RuntimePluginsPage } from "./pages/runtime-plugins-page";
import { RuntimeSkillsPage } from "./pages/runtime-skills-page";
import { RuntimeToolsPage } from "./pages/runtime-tools-page";
import { SessionsPage } from "./pages/sessions-page";
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
  type TeamDetailResponse,
  type TeamsResponse,
  type TeamTasksResponse,
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

function createExpandedSectionState(): Record<string, boolean> {
  return Object.fromEntries(navigationSections.map((section) => [section.id, true]));
}

export function App() {
  const socketRef = useRef<WebSocket | null>(null);
  const catalogRefreshTimeoutRef = useRef<number | null>(null);
  const [route, setRoute] = useState<PlaygroundRoute>(() => parsePlaygroundHash(window.location.hash));
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(
    createExpandedSectionState()
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
  const [metadataDefinitionKey, setMetadataDefinitionKey] = useState("workflow");
  const [metadataDefinitionLabel, setMetadataDefinitionLabel] = useState("Workflow");
  const [metadataDefinitionDescription, setMetadataDefinitionDescription] = useState(
    "Short workflow label for a session."
  );
  const [metadataValueDraft, setMetadataValueDraft] = useState("delivery-review");
  const [metadataActionState, setMetadataActionState] = useState<CheckResult>({
    status: "idle",
    detail: "Register a field or write a value to the selected session.",
  });
  const [metadataPreview, setMetadataPreview] = useState<SessionMetadataValuesResponse | null>(null);
  const [agents, setAgents] = useState<AgentsResponse | null>(null);
  const [teams, setTeams] = useState<TeamsResponse | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<string>("");
  const [teamDetail, setTeamDetail] = useState<TeamDetailResponse | null>(null);
  const [teamTasks, setTeamTasks] = useState<TeamTasksResponse | null>(null);
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
    const result = await getJson<SessionsResponse>("/api/v1/sessions?limit=8");
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

  async function registerMetadataDefinition(): Promise<void> {
    setMetadataActionState({
      status: "loading",
      detail: `Registering ${metadataDefinitionKey} in the session metadata schema.`,
    });

    try {
      const result = await postJson<{ definition: SessionMetadataDefinition }>(
        "/api/v1/sessions/metadata/definitions",
        {
          key: metadataDefinitionKey.trim(),
          label: metadataDefinitionLabel.trim(),
          description: metadataDefinitionDescription.trim() || undefined,
          searchable: true,
          filterable: true,
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

  async function writeMetadataValue(sessionId: string): Promise<void> {
    setMetadataActionState({
      status: "loading",
      detail: `Writing ${metadataDefinitionKey} onto session ${sessionId.slice(0, 20)}.`,
    });

    try {
      const result = await putJson<SessionMetadataValuesResponse>(
        `/api/v1/sessions/${encodeURIComponent(sessionId)}/metadata`,
        {
          key: metadataDefinitionKey.trim(),
          value: metadataValueDraft.trim(),
        }
      );

      setMetadataPreview(result);
      setMetadataActionState({
        status: "pass",
        detail: `Saved ${metadataDefinitionKey} on ${sessionId.slice(0, 20)} and refreshed the explorer.`,
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
      const taskResults = await Promise.allSettled(
        teamsResult.value.teams.map((team) =>
          getJson<TeamTasksResponse>(`/api/v1/teams/${encodeURIComponent(team.name)}/tasks`)
        )
      );
      setTeamTaskCount(
        taskResults.reduce((sum, result) => (
          result.status === "fulfilled" ? sum + result.value.total : sum
        ), 0)
      );
    } else {
      setTeamTaskCount(null);
      updateCheck("teams", {
        status: "error",
        detail: teamsResult.reason instanceof Error ? teamsResult.reason.message : String(teamsResult.reason),
      });
    }
  }

  async function loadTeamDetail(teamName: string): Promise<void> {
    if (!teamName) {
      setTeamDetail(null);
      setTeamTasks(null);
      return;
    }

    const [detail, tasks] = await Promise.all([
      getJson<TeamDetailResponse>(`/api/v1/teams/${encodeURIComponent(teamName)}`),
      getJson<TeamTasksResponse>(`/api/v1/teams/${encodeURIComponent(teamName)}/tasks`),
    ]);

    setTeamDetail(detail);
    setTeamTasks(tasks);
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
    void loadTeamDetail(selectedTeam);
  }, [selectedTeam]);

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
        <aside className="playground-sidebar border-b border-slate-200/80 lg:sticky lg:top-0 lg:h-screen lg:w-[190px] lg:shrink-0 lg:border-b-0 lg:border-r xl:w-[206px]">
          <div className="flex h-full flex-col px-3 py-4 md:px-4 lg:px-4 xl:px-[18px]">
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                Playground
              </div>
              <div className="text-lg font-semibold tracking-tight text-slate-950">
                CC-Middleware
              </div>
            </div>

            <nav className="mt-6 space-y-1">
              {navigationSections.map((section) => (
                <SidebarSection
                  key={section.id}
                  section={section}
                  expanded={expandedSections[section.id] ?? true}
                  currentRoute={route}
                  onToggle={() => toggleSection(section.id)}
                  onNavigate={navigateTo}
                />
              ))}
            </nav>
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
              metadataDefinitionKey={metadataDefinitionKey}
              metadataDefinitionLabel={metadataDefinitionLabel}
              metadataDefinitionDescription={metadataDefinitionDescription}
              metadataValueDraft={metadataValueDraft}
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
              onMetadataDefinitionKeyChange={setMetadataDefinitionKey}
              onMetadataDefinitionLabelChange={setMetadataDefinitionLabel}
              onMetadataDefinitionDescriptionChange={setMetadataDefinitionDescription}
              onMetadataValueDraftChange={setMetadataValueDraft}
              onRegisterMetadataDefinition={() => void registerMetadataDefinition()}
              onWriteMetadataValue={(sessionId) => void writeMetadataValue(sessionId)}
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

          {route.page === "agents-teams" ? (
            <AgentsPage
              activeSection={route.section}
              agents={agents}
              teams={teams}
              selectedTeam={selectedTeam}
              teamDetail={teamDetail}
              teamTasks={teamTasks}
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

          {route.page === "runtime" ? (
            <RuntimePage
              activeSection={route.section}
              runtime={runtime}
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
