import { Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import {
  CompactDataTable,
  InlineState,
  JsonPreview,
  ModalSurface,
  PageBodyWithRail,
  SectionIntro,
  TableMetaBadges,
  ToolbarPane,
} from "../components/playground-ui";
import type {
  CheckResult,
  PlaygroundPageId,
  SessionsResponse,
  SearchLineageFilter,
  SearchResponse,
  SearchScopeOption,
  SessionExplorerEntry,
  SessionExplorerGroup,
  SessionMetadataDefinition,
  SessionMetadataValuesResponse,
  SessionDirectoriesResponse,
  TeamsResponse,
} from "../lib/playground";
import { formatNumber, formatTimestamp, truncate } from "../lib/utils";

export function SessionsPage(props: {
  activeSection?: string;
  recentSessions: SessionsResponse | null;
  searchQuery: string;
  searchMetadataKey: string;
  searchMetadataValue: string;
  searchLineageFilter: SearchLineageFilter;
  searchScopeOptions: SearchScopeOption[];
  searchTeamFilter: string;
  teams: TeamsResponse | null;
  sessionExplorerDescription: string;
  sessionExplorerFilterContext: string;
  sessionExplorerGroups: SessionExplorerGroup[];
  sessionExplorerSource: "catalog" | "search";
  sessionDirectories: SessionDirectoriesResponse | null;
  sessionMetadataDefinitions: SessionMetadataDefinition[];
  selectedSearchScope: SearchScopeOption;
  sessionsNeedIndexing: boolean;
  coverageDetail: string;
  searchError: string | null;
  searchResults: SearchResponse | null;
  sessionExplorerGroupCount: number;
  sessionExplorerSessionCount: number;
  reindexState: CheckResult;
  metadataActionState: CheckResult;
  metadataPreview: SessionMetadataValuesResponse | null;
  explorerLeadSession?: SessionExplorerEntry;
  onSearchQueryChange: (value: string) => void;
  onSearchMetadataKeyChange: (value: string) => void;
  onSearchMetadataValueChange: (value: string) => void;
  onSearchLineageFilterChange: (value: SearchLineageFilter) => void;
  onSearchTeamFilterChange: (value: string) => void;
  onRunSearch: () => void;
  onRunReindex: () => void;
  onSaveMetadataDefinition: (definition: {
    key: string;
    label: string;
    description?: string;
    searchable: boolean;
    filterable: boolean;
  }) => void;
  onDeleteMetadataDefinition: (key: string) => void;
  onWriteMetadataValue: (sessionId: string, payload: {
    key: string;
    value: string;
  }) => void;
  onShowGroupedByDirectory: () => void;
  onShowTeamSessions: () => void;
  onOpenSessionDetail: (sessionId: string) => void;
}) {
  const page: PlaygroundPageId = "sessions";
  const [fieldEditorOpen, setFieldEditorOpen] = useState(false);
  const [fieldEditorMode, setFieldEditorMode] = useState<"create" | "edit">("create");
  const [fieldDraft, setFieldDraft] = useState({
    key: "workflow",
    label: "Workflow",
    description: "Short workflow label for a session.",
    searchable: true,
    filterable: true,
  });
  const [metadataValueKey, setMetadataValueKey] = useState("workflow");
  const [metadataValueDraft, setMetadataValueDraft] = useState("delivery-review");

  useEffect(() => {
    if (
      metadataValueKey
      && props.sessionMetadataDefinitions.some((definition) => definition.key === metadataValueKey)
    ) {
      return;
    }

    setMetadataValueKey(props.sessionMetadataDefinitions[0]?.key ?? "");
  }, [metadataValueKey, props.sessionMetadataDefinitions]);

  const metadataFieldOptions = useMemo(
    () => props.sessionMetadataDefinitions.map((definition) => ({
      value: definition.key,
      label: definition.label,
    })),
    [props.sessionMetadataDefinitions]
  );

  function openCreateField(preset?: Partial<typeof fieldDraft>): void {
    setFieldEditorMode("create");
    setFieldDraft({
      key: preset?.key ?? "workflow",
      label: preset?.label ?? "Workflow",
      description: preset?.description ?? "Short workflow label for a session.",
      searchable: preset?.searchable ?? true,
      filterable: preset?.filterable ?? true,
    });
    setFieldEditorOpen(true);
  }

  function openEditField(definition: SessionMetadataDefinition): void {
    setFieldEditorMode("edit");
    setFieldDraft({
      key: definition.key,
      label: definition.label,
      description: definition.description ?? "",
      searchable: definition.searchable,
      filterable: definition.filterable,
    });
    setFieldEditorOpen(true);
  }

  function groupMetadataSummary(group: SessionDirectoriesResponse["groups"][number]): string {
    const labels = Array.from(
      new Set(
        group.sessions.flatMap((session) => session.metadata.map((entry) => entry.label))
      )
    );

    if (labels.length === 0) {
      return "No metadata";
    }

    if (labels.length <= 2) {
      return labels.join(", ");
    }

    return `${labels.slice(0, 2).join(", ")} +${labels.length - 2}`;
  }

  function getSessionId(
    session: SearchResponse["sessions"][number] | SessionsResponse["sessions"][number]
  ): string {
    return "sessionId" in session ? (session.sessionId ?? session.id) : session.id;
  }

  function getSessionTitle(
    session: SearchResponse["sessions"][number] | SessionsResponse["sessions"][number]
  ): string {
    return session.customTitle || session.summary || session.firstPrompt || getSessionId(session);
  }

  const hasIndexedFilters = props.searchLineageFilter !== "all"
    || props.searchTeamFilter !== "all"
    || Boolean(props.searchMetadataKey.trim())
    || Boolean(props.searchMetadataValue.trim());
  const useSearchTable = Boolean(props.searchQuery.trim()) || hasIndexedFilters;
  const explorerSessions = useSearchTable
    ? props.searchResults?.sessions ?? []
    : props.recentSessions?.sessions ?? [];
  const explorerTotal = useSearchTable
    ? props.searchResults?.total
    : props.recentSessions?.total;
  const explorerLoading = useSearchTable
    ? props.searchResults === null && !props.searchError
    : props.recentSessions === null;
  const explorerTitle = useSearchTable ? "Session search results" : "Latest agent sessions";
  const explorerDescription = useSearchTable
    ? "Indexed session matches from GET /api/v1/search."
    : "Recent merged session inventory from GET /api/v1/sessions.";

  const operations = [
    {
      method: "GET",
      path: "/api/v1/search",
      detail: "Search the SQLite-backed session index.",
      sectionId: "sessions-explorer",
    },
    {
      method: "POST",
      path: "/api/v1/search/reindex",
      detail: "Backfill historical sessions into the index.",
      sectionId: "sessions-explorer",
    },
    {
      method: "GET",
      path: "/api/v1/sessions",
      detail: "List the merged session catalog with indexed metadata.",
      sectionId: "sessions-explorer",
    },
    {
      method: "GET",
      path: "/api/v1/sessions/directories",
      detail: "Group the session catalog by exact cwd directory.",
      sectionId: "sessions-groups",
    },
    {
      method: "GET",
      path: "/api/v1/sessions/metadata/definitions",
      detail: "List registered metadata fields.",
      sectionId: "sessions-metadata",
    },
    {
      method: "PUT",
      path: "/api/v1/sessions/:id/metadata",
      detail: "Write metadata onto an indexed session.",
      sectionId: "sessions-metadata",
    },
  ];
  const sections = [
    { id: "sessions-explorer", label: "Session explorer" },
    { id: "sessions-groups", label: "Directory groups" },
    { id: "sessions-metadata", label: "Metadata schema" },
  ];
  const exampleGroups = [
    {
      title: "Search",
      items: [
        {
          label: "Grouped by directory",
          detail: "Reset search and browse the merged directory catalog.",
          action: props.onShowGroupedByDirectory,
        },
        {
          label: "Main sessions only",
          detail: "Show root sessions without team or subagent lineage.",
          action: () => props.onSearchLineageFilterChange("standalone"),
        },
        {
          label: "Subagent sessions",
          detail: "Narrow the explorer to sessions with sidechain work.",
          action: () => props.onSearchLineageFilterChange("subagent"),
        },
        {
          label: "Team sessions",
          detail: "Focus sessions linked to Claude team members.",
          action: props.onShowTeamSessions,
        },
        {
          label: "Find main branch",
          detail: "Search for sessions tied to the main branch.",
          action: () => props.onSearchQueryChange("main"),
        },
      ],
    },
    {
      title: "Directories",
      items: [
        {
          label: "Reset to grouped catalog",
          detail: "Clear the indexed search filters and browse by directory again.",
          action: props.onShowGroupedByDirectory,
        },
        {
          label: "Team-linked sessions",
          detail: "Jump back to grouped results after filtering for team activity.",
          action: props.onShowTeamSessions,
        },
      ],
    },
    {
      title: "Metadata",
      items: [
        {
          label: "Workflow field",
          detail: "Register a searchable workflow label for sessions.",
          action: () => {
            openCreateField({
              key: "workflow",
              label: "Workflow",
              description: "Workflow label for a session.",
            });
            setMetadataValueKey("workflow");
            setMetadataValueDraft("delivery-review");
          },
        },
        {
          label: "Owner field",
          detail: "Track the owning team or discipline for a session.",
          action: () => {
            openCreateField({
              key: "owner",
              label: "Owner",
              description: "Owning team or function.",
            });
            setMetadataValueKey("owner");
            setMetadataValueDraft("platform");
          },
        },
        {
          label: "Filter by metadata",
          detail: "Drive the explorer with the current metadata draft.",
          action: () => {
            props.onSearchMetadataKeyChange(metadataValueKey);
            props.onSearchMetadataValueChange(metadataValueDraft);
          },
        },
      ],
    },
  ];

  return (
    <section className="space-y-8">
      <SectionIntro
        eyebrow="Sessions"
        title="Agent sessions"
        description="This page makes the session mapping explicit: the middleware can list agent sessions from disk, enrich them with indexed lineage and metadata, and organize them by exact working directory for a frontend to render cleanly."
      />

      <PageBodyWithRail
        page={page}
        activeSection={props.activeSection}
        items={operations}
        exampleGroups={exampleGroups}
        sections={sections}
      >
        <ToolbarPane
          title="Session scope and reindex"
          description="Switch indexed scope filters or trigger a backfill without leaving the catalog."
        >
          <div className="grid gap-3 xl:grid-cols-[160px_170px_180px_minmax(0,1fr)_auto]">
            <Select
              value={props.searchLineageFilter}
              onChange={(event) => props.onSearchLineageFilterChange(event.target.value as SearchLineageFilter)}
            >
              {props.searchScopeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select
              value={props.searchTeamFilter}
              onChange={(event) => props.onSearchTeamFilterChange(event.target.value)}
              disabled={!props.teams?.teams.length}
            >
              <option value="all">All teams</option>
              {(props.teams?.teams ?? []).map((team) => (
                <option key={team.name} value={team.name}>
                  {team.name}
                </option>
              ))}
            </Select>
            <Select
              value={props.searchMetadataKey}
              onChange={(event) => props.onSearchMetadataKeyChange(event.target.value)}
            >
              <option value="">All metadata fields</option>
              {metadataFieldOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Input
              className="h-9"
              value={props.searchMetadataValue}
              onChange={(event) => props.onSearchMetadataValueChange(event.target.value)}
              placeholder="Metadata value"
            />
            <Button variant="outline" onClick={props.onRunReindex}>
              Reindex
            </Button>
          </div>

        </ToolbarPane>

        <div className="space-y-10">
          <div id="sessions-explorer" className="space-y-4">
            <CompactDataTable
              title={explorerTitle}
              description={props.sessionExplorerFilterContext
                ? `${explorerDescription} Active filters: ${props.sessionExplorerFilterContext}.`
                : explorerDescription}
              search={{
                value: props.searchQuery,
                onChange: props.onSearchQueryChange,
                placeholder: "Search session IDs, titles, prompts, branches, and metadata",
              }}
              meta={(
                <div className="flex flex-wrap gap-2">
                  <TableMetaBadges
                    total={explorerTotal}
                    noun="sessions"
                    loading={explorerLoading}
                    query={props.searchQuery}
                  />
                </div>
              )}
              loading={explorerLoading}
              error={props.searchError}
              columns={["Session", "Project", "Branch", "State"]}
              rows={explorerSessions.map((session) => {
                const sessionId = getSessionId(session);
                const teamNames = session.lineage.teamNames;
                const hasSubagents = session.lineage.hasSubagents;
                const metadataSummary = session.metadata.length > 0
                  ? session.metadata.map((entry) => `${entry.label}: ${entry.value}`).slice(0, 3).join(" · ")
                  : "No metadata";

                return {
                  id: sessionId,
                  cells: [
                    <div className="max-w-[240px] min-w-0 space-y-0.5 lg:max-w-[280px]">
                      <div className="truncate font-medium text-slate-900">{getSessionTitle(session)}</div>
                      <div className="truncate text-xs text-slate-500">{sessionId}</div>
                    </div>,
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{session.project}</Badge>
                      {teamNames.slice(0, 2).map((teamName) => (
                        <Badge key={`${session.id}-${teamName}`} variant="secondary">{teamName}</Badge>
                      ))}
                    </div>,
                    session.gitBranch
                      ? <span className="text-xs text-slate-500">{session.gitBranch}</span>
                      : <span className="text-xs text-slate-400">No branch</span>,
                    <div className="flex flex-wrap gap-2">
                      {hasSubagents ? <Badge variant="info">{session.lineage.subagentCount} subagent</Badge> : null}
                      {session.lineage.hasTeamMembers ? <Badge variant="success">team-linked</Badge> : null}
                      {"indexed" in session && !session.indexed ? <Badge variant="warning">pending index</Badge> : null}
                      {!hasSubagents && !session.lineage.hasTeamMembers && !("indexed" in session && !session.indexed) ? (
                        <span className="text-xs text-slate-400">main</span>
                      ) : null}
                    </div>,
                  ],
                  previewEyebrow: "Agent Session",
                  previewTitle: getSessionTitle(session),
                  previewDescription: session.firstPrompt || "No first prompt captured",
                  previewMeta: [
                    { label: "Session id", value: sessionId },
                    { label: "Project", value: session.project },
                    { label: "Branch", value: session.gitBranch ?? "No branch" },
                    { label: "Metadata", value: metadataSummary },
                  ],
                  drawerDescription: session.firstPrompt || "No first prompt captured for this session.",
                  drawerMeta: [
                    { label: "Session id", value: sessionId },
                    { label: "Project", value: session.project },
                    { label: "Directory", value: "directoryPath" in session ? session.directoryPath : session.cwd },
                    { label: "Branch", value: session.gitBranch ?? "No branch" },
                    { label: "Teams", value: teamNames.join(", ") || "No team lineage" },
                    { label: "Subagents", value: hasSubagents ? `${session.lineage.subagentCount}` : "0" },
                    { label: "Updated", value: formatTimestamp(session.lastModified) },
                  ],
                  drawerContent: (
                    <JsonPreview
                      title="Session payload"
                      data={session}
                      emptyMessage="Session payload is not available."
                    />
                  ),
                };
              })}
              emptyTitle="No sessions to show"
              emptyDetail={useSearchTable
                ? "The current indexed query and scope filters did not return any sessions."
                : "The latest session inventory is still loading or returned no sessions."}
              onRowClick={(row) => props.onOpenSessionDetail(row.id)}
            />

            {props.searchError ? (
              <InlineState
                variant="error"
                title="Search endpoint unavailable"
                detail={props.searchError}
              />
            ) : null}

            <JsonPreview
              title="Last search response"
              data={
                props.searchResults
                  ? {
                      total: props.searchResults.total,
                      queryTimeMs: props.searchResults.queryTimeMs,
                      sessions: props.searchResults.sessions.slice(0, 3),
                    }
                  : null
              }
              emptyMessage="Run a search to inspect the response payload."
            />
          </div>

          <div id="sessions-groups" className="space-y-4">
            <CompactDataTable
              title="Directory groups"
              description="These are the exact cwd groupings a frontend can render without re-deriving project structure."
              meta={
                <div className="flex flex-wrap gap-2">
                  <TableMetaBadges
                    total={props.sessionDirectories?.totalDirectories}
                    noun="directories"
                  />
                  <Badge variant="outline">
                    {formatNumber(props.sessionDirectories?.totalSessions)} sessions
                  </Badge>
                </div>
              }
              columns={["Directory", "Sessions", "Metadata", "State"]}
              rows={(props.sessionDirectories?.groups ?? []).map((group) => ({
                id: group.path,
                cells: [
                  <div className="min-w-0 space-y-1">
                    <div className="font-medium text-slate-900">{group.name}</div>
                    <div className="truncate text-xs text-slate-500">{group.path}</div>
                  </div>,
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{formatNumber(group.sessionCount)} total</Badge>
                    <Badge variant="outline">{formatNumber(group.mainSessionCount)} main</Badge>
                  </div>,
                  <span className="text-xs text-slate-500">{groupMetadataSummary(group)}</span>,
                  <div className="flex flex-wrap gap-2">
                    {group.teamSessionCount > 0 ? (
                      <Badge variant="success">{formatNumber(group.teamSessionCount)} team</Badge>
                    ) : null}
                    {group.subagentSessionCount > 0 ? (
                      <Badge variant="info">{formatNumber(group.subagentSessionCount)} subagent</Badge>
                    ) : null}
                    {group.unindexedSessionCount > 0 ? (
                      <Badge variant="warning">{formatNumber(group.unindexedSessionCount)} unindexed</Badge>
                    ) : null}
                    {group.teamSessionCount === 0 && group.subagentSessionCount === 0 && group.unindexedSessionCount === 0 ? (
                      <span className="text-xs text-slate-400">main only</span>
                    ) : null}
                  </div>,
                ],
                previewEyebrow: "Directory Group",
                previewTitle: group.name,
                previewDescription: "Exact cwd bucket returned by the middleware directory grouping route.",
                previewMeta: [
                  { label: "Path", value: group.path },
                  { label: "Sessions", value: `${formatNumber(group.sessionCount)} total` },
                  { label: "Metadata", value: groupMetadataSummary(group) },
                  { label: "Branches", value: group.gitBranches.length > 0 ? group.gitBranches.join(", ") : "No branches" },
                ],
                drawerDescription: `${formatNumber(group.sessionCount)} total sessions in this exact cwd grouping, with ${formatNumber(group.indexedSessionCount)} already indexed into search.`,
                drawerMeta: [
                  { label: "Path", value: group.path },
                  { label: "Depth", value: `${group.depth}` },
                  { label: "Metadata", value: groupMetadataSummary(group) },
                  { label: "Indexed", value: `${formatNumber(group.indexedSessionCount)} indexed / ${formatNumber(group.unindexedSessionCount)} pending` },
                  { label: "Team sessions", value: `${formatNumber(group.teamSessionCount)}` },
                  { label: "Subagent sessions", value: `${formatNumber(group.subagentSessionCount)}` },
                  { label: "Last modified", value: formatTimestamp(group.lastModified) },
                ],
                drawerContent: group.sessions.length > 0 ? (
                  <div className="space-y-2">
                    {group.sessions.slice(0, 5).map((session) => (
                      <div key={session.id} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2">
                        <div className="min-w-0">
                          <div className="truncate font-medium text-slate-900">
                            {session.customTitle || session.summary || session.sessionId}
                          </div>
                          <div className="truncate text-xs text-slate-500">{session.sessionId}</div>
                        </div>
                        {!session.indexed ? <Badge variant="warning">Pending</Badge> : null}
                      </div>
                    ))}
                  </div>
                ) : null,
              }))}
              emptyTitle="No directory groups loaded"
              emptyDetail="Load the grouped catalog to inspect directory boundaries."
            />

            <ToolbarPane
              title="Directory payloads"
              description="Use this grouped view when a frontend needs exact cwd buckets without rebuilding the project map."
            >
              <JsonPreview
                title="Active explorer source"
                data={
                  props.sessionExplorerGroups.length > 0
                    ? {
                        source: props.sessionExplorerSource,
                        totalDirectories: props.sessionExplorerGroupCount,
                        totalSessions: props.sessionExplorerSessionCount,
                        groups: props.sessionExplorerGroups.slice(0, 2),
                      }
                    : null
                }
                emptyMessage="The active session explorer has no groups yet."
              />
            </ToolbarPane>
          </div>

          <div id="sessions-metadata" className="space-y-4">
            <div>
              <div className="text-sm font-medium text-slate-900">Metadata schema</div>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Registered fields become part of the session contract, so frontends can display them uniformly and search against them intentionally.
              </p>
            </div>
            <ToolbarPane
              title="Metadata actions"
              description="Manage field definitions in a modal, then write values onto the current indexed session without leaving the page."
            >
              <div className="flex flex-wrap gap-3">
                <Button variant="secondary" onClick={() => openCreateField()}>
                  New field
                </Button>
                <Select
                  value={metadataValueKey}
                  onChange={(event) => setMetadataValueKey(event.target.value)}
                  className="min-w-[180px]"
                  disabled={metadataFieldOptions.length === 0}
                >
                  <option value="">Select field</option>
                  {metadataFieldOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
                <Input
                  className="min-w-[220px] flex-1"
                  value={metadataValueDraft}
                  onChange={(event) => setMetadataValueDraft(event.target.value)}
                  placeholder="Value for the selected session"
                />
                <Button
                  variant="outline"
                  disabled={!props.explorerLeadSession || !metadataValueKey || !metadataValueDraft.trim()}
                  onClick={() => props.explorerLeadSession && props.onWriteMetadataValue(props.explorerLeadSession.sessionId, {
                    key: metadataValueKey,
                    value: metadataValueDraft,
                  })}
                >
                  Apply to visible session
                </Button>
              </div>
              <InlineState
                variant={
                  props.metadataActionState.status === "error"
                    ? "error"
                    : props.metadataActionState.status === "loading"
                      ? "warning"
                      : "neutral"
                }
                title={props.explorerLeadSession
                  ? `Selected session ${truncate(props.explorerLeadSession.sessionId, 18)}`
                  : "No indexed session selected"}
                detail={`${props.metadataActionState.detail}${props.explorerLeadSession ? ` Writing against ${truncate(props.explorerLeadSession.customTitle || props.explorerLeadSession.summary || props.explorerLeadSession.sessionId, 42)}.` : ""}`}
              />
            </ToolbarPane>

            <CompactDataTable
              title="Metadata fields"
              description="Registered metadata fields are part of the session contract and drive search, filtering, and display across the catalog."
              meta={
                <TableMetaBadges
                  total={props.sessionMetadataDefinitions.length}
                  noun="fields"
                />
              }
              columns={["Field", "Key", "Usage", "State", "Actions"]}
              rows={props.sessionMetadataDefinitions.map((definition) => ({
                id: definition.key,
                cells: [
                  <span className="font-medium text-slate-900">{definition.label}</span>,
                  <span className="font-mono text-xs text-slate-500">{definition.key}</span>,
                  <Badge variant="outline">{formatNumber(definition.usageCount)} sessions</Badge>,
                  <div className="flex flex-wrap gap-2">
                    {definition.searchable ? <Badge variant="info">Searchable</Badge> : null}
                    {definition.filterable ? <Badge variant="outline">Filterable</Badge> : null}
                  </div>,
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation();
                        openEditField(definition);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation();
                        props.onSearchMetadataKeyChange(definition.key);
                      }}
                    >
                      Filter
                    </Button>
                  </div>,
                ],
                previewEyebrow: "Metadata Field",
                previewTitle: definition.label,
                previewDescription: definition.description || "No description",
                previewMeta: [
                  { label: "Key", value: definition.key },
                  { label: "Usage", value: `${formatNumber(definition.usageCount)} sessions` },
                ],
                drawerMeta: [
                  { label: "Key", value: definition.key },
                  { label: "Usage", value: `${formatNumber(definition.usageCount)} sessions` },
                  { label: "Searchable", value: definition.searchable ? "Yes" : "No" },
                  { label: "Filterable", value: definition.filterable ? "Yes" : "No" },
                  { label: "Updated", value: formatTimestamp(definition.updatedAt) },
                ],
                drawerContent: (
                  <div className="flex flex-wrap gap-3">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation();
                        openEditField(definition);
                      }}
                    >
                      Edit field
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation();
                        props.onSearchMetadataKeyChange(definition.key);
                      }}
                    >
                      Use in filter
                    </Button>
                  </div>
                ),
              }))}
              emptyTitle="No metadata fields yet"
              emptyDetail="Create a field to start attaching structured metadata to indexed sessions."
            />

            <CompactDataTable
              title="Selected session metadata"
              description="Metadata already attached to the current visible indexed session."
              meta={props.explorerLeadSession ? (
                <Badge variant="outline">
                  {truncate(props.explorerLeadSession.sessionId, 18)}
                </Badge>
              ) : undefined}
              columns={["Field", "Value", "Updated"]}
              rows={(props.explorerLeadSession?.metadata ?? []).map((entry) => ({
                id: `${entry.sessionId}-${entry.key}`,
                cells: [
                  <span className="font-medium text-slate-900">{entry.label}</span>,
                  <span className="text-sm text-slate-600">{entry.value}</span>,
                  <span className="text-xs text-slate-500">{formatTimestamp(entry.updatedAt)}</span>,
                ],
                previewEyebrow: "Session Metadata",
                previewTitle: entry.label,
                previewDescription: entry.description || "No description",
                previewMeta: [
                  { label: "Key", value: entry.key },
                  { label: "Value", value: entry.value },
                ],
                drawerMeta: [
                  { label: "Key", value: entry.key },
                  { label: "Value", value: entry.value },
                  { label: "Searchable", value: entry.searchable ? "Yes" : "No" },
                  { label: "Filterable", value: entry.filterable ? "Yes" : "No" },
                  { label: "Updated", value: formatTimestamp(entry.updatedAt) },
                ],
              }))}
              emptyTitle="No metadata on the selected session"
              emptyDetail="Choose an indexed session in the explorer, then apply a field value to inspect it here."
            />

            <JsonPreview
              title="Metadata response"
              data={props.metadataPreview}
              emptyMessage="Save a field or write a value to inspect the response payload."
            />
          </div>
        </div>
      </PageBodyWithRail>

      <ModalSurface
        open={fieldEditorOpen}
        onClose={() => setFieldEditorOpen(false)}
        title={fieldEditorMode === "edit" ? "Edit metadata field" : "New metadata field"}
        description="Define the field contract once, then reuse it across the session catalog and search surfaces."
        footer={(
          <>
            <div>
              {fieldEditorMode === "edit" ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                  onClick={() => {
                    props.onDeleteMetadataDefinition(fieldDraft.key);
                    setFieldEditorOpen(false);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete field
                </Button>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-3">
              <Button type="button" variant="ghost" size="sm" onClick={() => setFieldEditorOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  props.onSaveMetadataDefinition({
                    key: fieldDraft.key,
                    label: fieldDraft.label,
                    description: fieldDraft.description,
                    searchable: fieldDraft.searchable,
                    filterable: fieldDraft.filterable,
                  });
                  setMetadataValueKey(fieldDraft.key);
                  setFieldEditorOpen(false);
                }}
                disabled={!fieldDraft.key.trim() || !fieldDraft.label.trim()}
              >
                Save field
              </Button>
            </div>
          </>
        )}
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <Input
            value={fieldDraft.key}
            onChange={(event) => setFieldDraft((current) => ({ ...current, key: event.target.value }))}
            placeholder="Field key"
            disabled={fieldEditorMode === "edit"}
          />
          <Input
            value={fieldDraft.label}
            onChange={(event) => setFieldDraft((current) => ({ ...current, label: event.target.value }))}
            placeholder="Field label"
          />
        </div>
        <Textarea
          value={fieldDraft.description}
          onChange={(event) => setFieldDraft((current) => ({ ...current, description: event.target.value }))}
          placeholder="Field description"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={fieldDraft.searchable}
              onChange={(event) => setFieldDraft((current) => ({ ...current, searchable: event.target.checked }))}
            />
            Searchable in indexed session queries
          </label>
          <label className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={fieldDraft.filterable}
              onChange={(event) => setFieldDraft((current) => ({ ...current, filterable: event.target.checked }))}
            />
            Filterable in catalog and directory views
          </label>
        </div>
      </ModalSurface>
    </section>
  );
}
