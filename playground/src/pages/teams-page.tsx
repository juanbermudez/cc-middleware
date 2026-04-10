import { useEffect, useMemo, useState } from "react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  CompactDataTable,
  CopyableValue,
  JsonPreview,
  PageBodyWithRail,
  SectionIntro,
  TableMetaBadges,
  ToolbarPane,
} from "../components/playground-ui";
import { ResourceMetadataWorkspace } from "../components/resource-metadata-workspace";
import type {
  PlaygroundPageId,
  TeamDetailResponse,
  TeamTasksResponse,
  TeamsResponse,
} from "../lib/playground";
import { useEndpointQuery } from "../lib/use-endpoint-query";
import { formatNumber, truncate } from "../lib/utils";

function statusBadgeVariant(
  status: TeamDetailResponse["members"][number]["status"]
): "success" | "warning" | "outline" {
  switch (status) {
    case "active":
      return "success";
    case "idle":
      return "warning";
    case "stopped":
    default:
      return "outline";
  }
}

function taskStatusBadgeVariant(
  status: TeamTasksResponse["tasks"][number]["status"]
): "success" | "warning" | "destructive" | "outline" {
  switch (status) {
    case "completed":
      return "success";
    case "in_progress":
      return "warning";
    case "failed":
      return "destructive";
    case "pending":
    default:
      return "outline";
  }
}

export function TeamsPage(props: {
  activeSection?: string;
  selectedTeam: string;
  onSelectTeam: (teamName: string) => void;
  onJumpToTeamSessions: () => void;
}) {
  const page: PlaygroundPageId = "teams";
  const [sessionScope, setSessionScope] = useState("");
  const normalizedSessionScope = sessionScope
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .join(",");
  const teams = useEndpointQuery<TeamsResponse>("/api/v1/teams", {
    params: {
      sessionIds: normalizedSessionScope || undefined,
    },
  });
  const selectedTeam = props.selectedTeam || teams.data?.teams[0]?.name || "";
  const teamDetail = useEndpointQuery<TeamDetailResponse>(
    selectedTeam ? `/api/v1/teams/${encodeURIComponent(selectedTeam)}` : "/api/v1/teams",
    { enabled: Boolean(selectedTeam) }
  );
  const teamTasks = useEndpointQuery<TeamTasksResponse>(
    selectedTeam ? `/api/v1/teams/${encodeURIComponent(selectedTeam)}/tasks` : "/api/v1/tasks",
    {
      enabled: Boolean(selectedTeam),
      params: {
        sessionIds: normalizedSessionScope || undefined,
      },
    }
  );

  useEffect(() => {
    if (!teams.data?.teams.length) {
      return;
    }

    if (selectedTeam && teams.data.teams.some((team) => team.name === selectedTeam)) {
      return;
    }

    props.onSelectTeam(teams.data.teams[0].name);
  }, [props.onSelectTeam, selectedTeam, teams.data]);

  const operations = [
    {
      method: "GET",
      path: "/api/v1/teams",
      detail: "List and search team definitions discovered from Claude team config directories.",
      sectionId: "teams-table",
    },
    {
      method: "GET",
      path: "/api/v1/teams/:name",
      detail: "Inspect a single team roster, config path, and member status.",
      sectionId: "teams-members",
    },
    {
      method: "GET",
      path: "/api/v1/teams/:name/tasks",
      detail: "Inspect the selected team's task inventory directly from the middleware.",
      sectionId: "teams-tasks",
    },
    {
      method: "GET",
      path: "/api/v1/metadata/definitions/team",
      detail: "Manage metadata fields for team resources.",
      sectionId: "teams-metadata",
    },
    {
      method: "PUT",
      path: "/api/v1/metadata/values/team/:resourceId",
      detail: "Attach metadata to a specific team resource.",
      sectionId: "teams-metadata",
    },
  ];
  const sections = [
    { id: "teams-table", label: "Team registry" },
    { id: "teams-members", label: "Selected team" },
    { id: "teams-tasks", label: "Team tasks" },
    { id: "teams-metadata", label: "Metadata" },
    { id: "teams-payload", label: "Payload preview" },
  ];
  const exampleGroups = [
    {
      title: "Team queries",
      buttonLabel: "Apply",
      items: [
        { label: "All teams", detail: "Reset the team search query.", action: () => teams.setQuery("") },
        { label: "Delivery", detail: "Search for delivery-style team names.", action: () => teams.setQuery("delivery") },
        { label: "Reviewer", detail: "Search by member name or agent id.", action: () => teams.setQuery("reviewer") },
        { label: "Clear session scope", detail: "Remove any session-linked team filter.", action: () => setSessionScope("") },
      ],
    },
    {
      title: "Team flows",
      buttonLabel: "Run",
      items: [
        {
          label: "Inspect first team",
          detail: "Select the first discovered team in the registry.",
          action: () => {
            const firstTeam = teams.data?.teams[0]?.name;
            if (firstTeam) {
              props.onSelectTeam(firstTeam);
            }
          },
        },
        {
          label: "Team sessions",
          detail: "Jump to sessions and focus team-linked activity.",
          action: props.onJumpToTeamSessions,
        },
      ],
    },
  ];

  const metadataItems = useMemo(
    () => (teams.data?.teams ?? []).map((team) => ({
      id: team.name,
      label: team.name,
      detail: `${team.memberCount} members`,
    })),
    [teams.data]
  );

  return (
    <section className="space-y-8">
      <SectionIntro
        eyebrow="Teams"
        title="Team registry"
        description="Team definitions are a first-class middleware resource. This page lets you list, search, inspect, annotate, and cross-reference the teams the middleware exposes from Claude team config directories."
      />

      <PageBodyWithRail
        page={page}
        activeSection={props.activeSection}
        items={operations}
        exampleGroups={exampleGroups}
        sections={sections}
      >
        <ToolbarPane
          title="Session scope"
          description="Filter teams and team tasks by one or more session ids. Use a comma-separated list to mirror the middleware's `sessionId` and `sessionIds` filters."
        >
          <div className="flex flex-wrap gap-3">
            <Input
              value={sessionScope}
              onChange={(event) => setSessionScope(event.target.value)}
              className="min-w-[280px] flex-1"
              placeholder="session-1, session-2"
            />
            <Badge variant="outline">
              {normalizedSessionScope ? `${normalizedSessionScope.split(",").length} session ids` : "All sessions"}
            </Badge>
          </div>
        </ToolbarPane>

        <div id="teams-table">
          <CompactDataTable
            title="Team registry"
            description="Searchable team inventory from GET /api/v1/teams, with optional session-linked filtering."
            search={{
              value: teams.query,
              onChange: teams.setQuery,
              placeholder: "Search teams, members, or config paths",
            }}
            meta={<TableMetaBadges total={teams.data?.total} noun="teams" loading={teams.loading} query={teams.query} />}
            loading={teams.loading}
            error={teams.error}
            columns={["Team", "Members", "Config", "Actions"]}
            rows={(teams.data?.teams ?? []).map((team) => ({
              id: team.name,
              cells: [
                <div className="space-y-0.5">
                  <div className="font-medium text-slate-900">{team.name}</div>
                  {selectedTeam === team.name ? (
                    <div className="text-xs text-slate-500">Currently selected</div>
                  ) : null}
                </div>,
                <Badge variant="outline">{formatNumber(team.memberCount)} members</Badge>,
                <CopyableValue
                  value={team.configPath}
                  displayValue={truncate(team.configPath, 52)}
                  mono
                />,
                <Button
                  type="button"
                  variant={selectedTeam === team.name ? "secondary" : "ghost"}
                  size="sm"
                  onClick={(event) => {
                    event.stopPropagation();
                    props.onSelectTeam(team.name);
                  }}
                >
                  {selectedTeam === team.name ? "Selected" : "Inspect"}
                </Button>,
              ],
              previewEyebrow: "Team",
              previewTitle: team.name,
              previewDescription: "Discovered from Claude team configuration on disk.",
              previewMeta: [
                { label: "Members", value: `${formatNumber(team.memberCount)}` },
                { label: "Config path", value: truncate(team.configPath, 80) },
              ],
              drawerMeta: [
                { label: "Team", value: team.name },
                { label: "Members", value: `${formatNumber(team.memberCount)}` },
                { label: "Config path", value: <CopyableValue value={team.configPath} displayValue={team.configPath} mono /> },
              ],
              drawerContent: (
                <div className="flex flex-wrap gap-3">
                  <Badge variant="outline">Resource: team</Badge>
                  <button
                    type="button"
                    className="text-sm font-medium text-slate-700 underline decoration-slate-300 underline-offset-4"
                    onClick={(event) => {
                      event.stopPropagation();
                      props.onSelectTeam(team.name);
                    }}
                  >
                    Select team
                  </button>
                </div>
              ),
            }))}
            emptyTitle="No teams matched"
            emptyDetail="The team registry did not return any teams for this search."
          />
        </div>

        <div id="teams-members">
          <CompactDataTable
            title="Selected team roster"
            description="Member roster from GET /api/v1/teams/:name."
            meta={(
              <div className="flex flex-wrap gap-2">
                {selectedTeam ? <Badge variant="outline">{selectedTeam}</Badge> : null}
                <TableMetaBadges total={teamDetail.data?.members.length} noun="members" loading={teamDetail.loading} />
              </div>
            )}
            loading={teamDetail.loading}
            error={teamDetail.error}
            columns={["Member", "Agent", "Type", "Status"]}
            rows={(teamDetail.data?.members ?? []).map((member) => ({
              id: `${teamDetail.data?.name ?? selectedTeam}-${member.name}`,
              cells: [
                <span className="font-medium text-slate-900">{member.name}</span>,
                <span className="text-xs text-slate-500">{member.agentId}</span>,
                <Badge variant="outline">{member.agentType ?? "default"}</Badge>,
                <Badge variant={statusBadgeVariant(member.status)}>{member.status}</Badge>,
              ],
              previewEyebrow: "Team Member",
              previewTitle: member.name,
              previewDescription: `Member of ${teamDetail.data?.name ?? selectedTeam}.`,
              previewMeta: [
                { label: "Agent id", value: member.agentId },
                { label: "Type", value: member.agentType ?? "default" },
                { label: "Status", value: member.status },
              ],
            }))}
            emptyTitle={selectedTeam ? "No members on this team" : "No team selected"}
            emptyDetail={selectedTeam
              ? "The selected team does not currently expose any members."
              : "Select a team from the registry to inspect its roster."}
          />
        </div>

        <div id="teams-tasks">
          <CompactDataTable
            title="Selected team tasks"
            description="Direct task inventory for the selected team, constrained by the same session scope when provided."
            search={{
              value: teamTasks.query,
              onChange: teamTasks.setQuery,
              placeholder: "Search selected team tasks",
            }}
            meta={(
              <div className="flex flex-wrap gap-2">
                {selectedTeam ? <Badge variant="outline">{selectedTeam}</Badge> : null}
                <TableMetaBadges total={teamTasks.data?.total} noun="tasks" loading={teamTasks.loading} query={teamTasks.query} />
              </div>
            )}
            loading={teamTasks.loading}
            error={teamTasks.error}
            columns={["Task", "Status", "Assignee", "Dependencies"]}
            rows={(teamTasks.data?.tasks ?? []).map((task) => ({
              id: task.resourceId,
              cells: [
                <div className="space-y-0.5">
                  <div className="font-medium text-slate-900">{task.id}</div>
                  <div className="text-xs text-slate-500">{truncate(task.description, 64)}</div>
                </div>,
                <Badge variant={taskStatusBadgeVariant(task.status)}>{task.status}</Badge>,
                <span className="text-xs text-slate-500">{task.assignee ?? "Unassigned"}</span>,
                <Badge variant="outline">{formatNumber(task.dependencies.length)}</Badge>,
              ],
              previewEyebrow: "Team Task",
              previewTitle: task.id,
              previewDescription: task.description || "No description",
              previewMeta: [
                { label: "Assignee", value: task.assignee ?? "Unassigned" },
                { label: "Dependencies", value: task.dependencies.join(", ") || "None" },
              ],
            }))}
            emptyTitle={selectedTeam ? "No tasks for this team" : "No team selected"}
            emptyDetail={selectedTeam
              ? "The selected team did not return any tasks for this query."
              : "Select a team to inspect its task list."}
          />
        </div>

        <div id="teams-metadata">
          <ResourceMetadataWorkspace
            title="Team metadata"
            description="Register structured fields for teams, then attach values to support ownership, product area, or workflow search in clients built on top of the middleware."
            inventories={[
              {
                label: "Teams",
                resourceType: "team",
                items: metadataItems,
              },
            ]}
          />
        </div>

        <div id="teams-payload">
          <JsonPreview
            title="Team payload"
            data={{
              teams: teams.data,
              selectedTeam: teamDetail.data,
              teamTasks: teamTasks.data,
            }}
            emptyMessage="Team payload is not available yet."
          />
        </div>
      </PageBodyWithRail>
    </section>
  );
}
