import { Search } from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import { SessionDirectorySection } from "../components/session-explorer";
import {
  ActionPane,
  CompactDataTable,
  InlineState,
  JsonPreview,
  LinearList,
  MetadataSchemaTable,
  PageBodyWithRail,
  SectionIntro,
  TableMetaBadges,
  ToolbarPane,
} from "../components/playground-ui";
import type {
  CheckResult,
  PlaygroundPageId,
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
  metadataDefinitionKey: string;
  metadataDefinitionLabel: string;
  metadataDefinitionDescription: string;
  metadataValueDraft: string;
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
  onMetadataDefinitionKeyChange: (value: string) => void;
  onMetadataDefinitionLabelChange: (value: string) => void;
  onMetadataDefinitionDescriptionChange: (value: string) => void;
  onMetadataValueDraftChange: (value: string) => void;
  onRegisterMetadataDefinition: () => void;
  onWriteMetadataValue: (sessionId: string) => void;
  onShowGroupedByDirectory: () => void;
  onShowTeamSessions: () => void;
}) {
  const page: PlaygroundPageId = "sessions";
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
            props.onMetadataDefinitionKeyChange("workflow");
            props.onMetadataDefinitionLabelChange("Workflow");
            props.onMetadataDefinitionDescriptionChange("Workflow label for a session.");
            props.onMetadataValueDraftChange("delivery-review");
          },
        },
        {
          label: "Owner field",
          detail: "Track the owning team or discipline for a session.",
          action: () => {
            props.onMetadataDefinitionKeyChange("owner");
            props.onMetadataDefinitionLabelChange("Owner");
            props.onMetadataDefinitionDescriptionChange("Owning team or function.");
            props.onMetadataValueDraftChange("platform");
          },
        },
        {
          label: "Filter by metadata",
          detail: "Drive the explorer with the current metadata draft.",
          action: () => {
            props.onSearchMetadataKeyChange(props.metadataDefinitionKey);
            props.onSearchMetadataValueChange(props.metadataValueDraft);
          },
        },
      ],
    },
  ];

  return (
    <section className="space-y-8">
      <SectionIntro
        eyebrow="Sessions"
        title="Filesystem discovery and indexed search"
        description="This page makes the session mapping explicit: the middleware can list sessions from disk, enrich them with indexed lineage and metadata, and organize them by exact working directory for a frontend to render cleanly."
      />

      <PageBodyWithRail
        page={page}
        activeSection={props.activeSection}
        items={operations}
        exampleGroups={exampleGroups}
        sections={sections}
      >
        <ToolbarPane
          title="Search and reindex"
          description="Run a query, switch session scope, or trigger a backfill without leaving the catalog."
        >
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.7fr)_180px_180px_auto_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                className="h-9 pl-9"
                value={props.searchQuery}
                onChange={(event) => props.onSearchQueryChange(event.target.value)}
                placeholder="Search session IDs, titles, prompts, branches, and metadata"
              />
            </div>
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
            <Button variant="secondary" onClick={props.onRunSearch}>
              Search
            </Button>
            <Button variant="outline" onClick={props.onRunReindex}>
              Reindex
            </Button>
          </div>

          <div className="space-y-2">
            <InlineState
              variant={props.sessionsNeedIndexing ? "warning" : "neutral"}
              title={props.sessionsNeedIndexing ? "Search index is behind filesystem discovery" : "Search coverage looks current"}
              detail={props.coverageDetail}
            />
            <InlineState
              variant="neutral"
              title={props.selectedSearchScope.label}
              detail={`${props.selectedSearchScope.detail}${props.searchTeamFilter !== "all" ? ` Team filter: ${props.searchTeamFilter}.` : ""}${props.searchMetadataKey || props.searchMetadataValue ? ` Metadata filter: ${props.searchMetadataKey || "*"}=${props.searchMetadataValue || "*"}.` : ""} Parent sessions stay visible as the main rows, and any subagent work is nested underneath them.`}
            />
          </div>
        </ToolbarPane>

        <div className="space-y-10">
          <div id="sessions-explorer" className="space-y-4">
            <LinearList
              title="Session explorer"
              description={props.sessionExplorerFilterContext
                ? `${props.sessionExplorerDescription} Active filters: ${props.sessionExplorerFilterContext}.`
                : props.sessionExplorerDescription}
              emptyTitle="No sessions to show"
              emptyDetail={props.sessionExplorerSource === "search"
                ? "The current indexed query and scope filters did not return any sessions."
                : "The grouped session catalog has not returned any directories yet."}
            >
              {props.sessionExplorerGroups.map((group) => (
                <SessionDirectorySection
                  key={`${props.sessionExplorerSource}-${group.path || group.name}`}
                  group={group}
                />
              ))}
            </LinearList>

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
              columns={["Directory", "Sessions", "Branches", "State"]}
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
                  <span className="text-xs text-slate-500">
                    {group.gitBranches.length > 0
                      ? truncate(group.gitBranches.join(", "), 42)
                      : "No branches"}
                  </span>,
                  <div className="flex flex-wrap gap-2">
                    {group.teamSessionCount > 0 ? (
                      <Badge variant="success">{formatNumber(group.teamSessionCount)} team</Badge>
                    ) : null}
                    {group.subagentSessionCount > 0 ? (
                      <Badge variant="info">{formatNumber(group.subagentSessionCount)} subagent</Badge>
                    ) : null}
                    {group.unindexedSessionCount > 0 ? (
                      <Badge variant="warning">{formatNumber(group.unindexedSessionCount)} unindexed</Badge>
                    ) : (
                      <Badge variant="outline">Fully indexed</Badge>
                    )}
                  </div>,
                ],
                previewEyebrow: "Directory Group",
                previewTitle: group.name,
                previewDescription: "Exact cwd bucket returned by the middleware directory grouping route.",
                previewMeta: [
                  { label: "Path", value: group.path },
                  { label: "Sessions", value: `${formatNumber(group.sessionCount)} total` },
                  { label: "Branches", value: group.gitBranches.length > 0 ? group.gitBranches.join(", ") : "No branches" },
                ],
                drawerDescription: `${formatNumber(group.sessionCount)} total sessions in this exact cwd grouping, with ${formatNumber(group.indexedSessionCount)} already indexed into search.`,
                drawerMeta: [
                  { label: "Path", value: group.path },
                  { label: "Depth", value: `${group.depth}` },
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
                        <Badge variant={session.indexed ? "outline" : "warning"}>
                          {session.indexed ? "Indexed" : "Pending"}
                        </Badge>
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
            <MetadataSchemaTable definitions={props.sessionMetadataDefinitions} />

            <ActionPane
              eyebrow="Metadata Lab"
              title="Register session fields"
              description="Use the real metadata API to add structured fields and attach them to indexed sessions."
            >
              <div className="grid gap-3 lg:grid-cols-2">
                <Input
                  value={props.metadataDefinitionKey}
                  onChange={(event) => props.onMetadataDefinitionKeyChange(event.target.value)}
                  placeholder="Field key"
                />
                <Input
                  value={props.metadataDefinitionLabel}
                  onChange={(event) => props.onMetadataDefinitionLabelChange(event.target.value)}
                  placeholder="Field label"
                />
              </div>
              <Textarea
                value={props.metadataDefinitionDescription}
                onChange={(event) => props.onMetadataDefinitionDescriptionChange(event.target.value)}
                placeholder="Field description"
              />
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
                <Input
                  value={props.metadataValueDraft}
                  onChange={(event) => props.onMetadataValueDraftChange(event.target.value)}
                  placeholder="Value for the selected session"
                />
                <Input
                  value={props.searchMetadataKey}
                  onChange={(event) => props.onSearchMetadataKeyChange(event.target.value)}
                  placeholder="Search metadata key"
                />
                <Input
                  value={props.searchMetadataValue}
                  onChange={(event) => props.onSearchMetadataValueChange(event.target.value)}
                  placeholder="Search metadata value"
                />
              </div>
              <div className="flex flex-wrap gap-3">
                <Button variant="secondary" onClick={props.onRegisterMetadataDefinition}>
                  Register field
                </Button>
                <Button
                  variant="outline"
                  disabled={!props.explorerLeadSession}
                  onClick={() => props.explorerLeadSession && props.onWriteMetadataValue(props.explorerLeadSession.sessionId)}
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
              <JsonPreview
                title="Metadata response"
                data={props.metadataPreview}
                emptyMessage="Register a field or write a value to inspect the response payload."
              />
            </ActionPane>
          </div>
        </div>
      </PageBodyWithRail>
    </section>
  );
}
