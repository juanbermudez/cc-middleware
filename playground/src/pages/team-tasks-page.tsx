import { useEffect, useMemo, useState } from "react";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
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
  TeamsResponse,
  TeamTasksResponse,
} from "../lib/playground";
import { useEndpointQuery } from "../lib/use-endpoint-query";
import { formatNumber, truncate } from "../lib/utils";

function statusBadgeVariant(
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

export function TeamTasksPage(props: {
  activeSection?: string;
  teams: TeamsResponse | null;
  selectedTeam: string;
  onSelectTeam: (teamName: string) => void;
}) {
  const page: PlaygroundPageId = "team-tasks";
  const [teamFilter, setTeamFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sessionScope, setSessionScope] = useState("");
  const normalizedSessionScope = sessionScope
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .join(",");

  useEffect(() => {
    if (props.selectedTeam) {
      return;
    }

    const firstTeam = props.teams?.teams[0]?.name;
    if (firstTeam) {
      props.onSelectTeam(firstTeam);
    }
  }, [props.onSelectTeam, props.selectedTeam, props.teams]);

  const selectedTeam = props.selectedTeam || props.teams?.teams[0]?.name || "";
  const aggregateTasks = useEndpointQuery<TeamTasksResponse>("/api/v1/tasks", {
    params: {
      team: teamFilter !== "all" ? teamFilter : undefined,
      status: statusFilter !== "all" ? statusFilter : undefined,
      sessionIds: normalizedSessionScope || undefined,
    },
  });
  const selectedTeamTasks = useEndpointQuery<TeamTasksResponse>(
    selectedTeam ? `/api/v1/teams/${encodeURIComponent(selectedTeam)}/tasks` : "/api/v1/tasks",
    {
      enabled: Boolean(selectedTeam),
      params: {
        status: statusFilter !== "all" ? statusFilter : undefined,
        sessionIds: normalizedSessionScope || undefined,
      },
    }
  );

  const operations = [
    {
      method: "GET",
      path: "/api/v1/tasks",
      detail: "List and search all discovered team tasks across Claude team directories.",
      sectionId: "team-tasks-table",
    },
    {
      method: "GET",
      path: "/api/v1/teams/:name/tasks",
      detail: "Inspect a single team's task list exactly as the middleware reads it.",
      sectionId: "team-tasks-selected",
    },
    {
      method: "GET",
      path: "/api/v1/metadata/definitions/team-task",
      detail: "Manage metadata fields for task resources.",
      sectionId: "team-tasks-metadata",
    },
    {
      method: "PUT",
      path: "/api/v1/metadata/values/team-task/:resourceId",
      detail: "Attach metadata to an individual task resource.",
      sectionId: "team-tasks-metadata",
    },
  ];
  const sections = [
    { id: "team-tasks-table", label: "All tasks" },
    { id: "team-tasks-selected", label: "Selected team" },
    { id: "team-tasks-metadata", label: "Metadata" },
    { id: "team-tasks-payload", label: "Payload preview" },
  ];
  const exampleGroups = [
    {
      title: "Task queries",
      buttonLabel: "Apply",
      items: [
        { label: "All tasks", detail: "Reset task search and filters.", action: () => {
          aggregateTasks.setQuery("");
          setTeamFilter("all");
          setStatusFilter("all");
        } },
        { label: "Pending", detail: "Focus pending team work items.", action: () => setStatusFilter("pending") },
        { label: "Completed", detail: "Focus completed team work items.", action: () => setStatusFilter("completed") },
        { label: "Reviewer", detail: "Search for reviewer-related tasks.", action: () => aggregateTasks.setQuery("review") },
        { label: "Clear session scope", detail: "Remove any session-linked task filter.", action: () => setSessionScope("") },
      ],
    },
    {
      title: "Selected team",
      buttonLabel: "Apply",
      items: [
        { label: "Current team", detail: "Inspect the selected team's tasks.", action: () => undefined },
        { label: "First team", detail: "Switch to the first discovered team.", action: () => {
          const firstTeam = props.teams?.teams[0]?.name;
          if (firstTeam) {
            props.onSelectTeam(firstTeam);
          }
        } },
      ],
    },
  ];

  const metadataItems = useMemo(
    () => (aggregateTasks.data?.tasks ?? []).map((task) => ({
      id: task.resourceId,
      label: task.id,
      detail: `${task.teamName} · ${task.status}`,
    })),
    [aggregateTasks.data]
  );

  return (
    <section className="space-y-8">
      <SectionIntro
        eyebrow="Tasks"
        title="Task registry"
        description="Task files under Claude team task directories are exposed here as structured middleware data. This makes them searchable, session-linkable, and attachable to metadata just like the rest of the session-linked resource surfaces."
      />

      <PageBodyWithRail
        page={page}
        activeSection={props.activeSection}
        items={operations}
        exampleGroups={exampleGroups}
        sections={sections}
      >
        <div id="team-tasks-table" className="space-y-4">
          <ToolbarPane
            title="Task filters"
            description="Use session, team, and status filters to validate how the middleware exposes task inventories across Claude team directories."
          >
            <div className="flex flex-wrap gap-3">
              <Input
                value={sessionScope}
                onChange={(event) => setSessionScope(event.target.value)}
                className="min-w-[260px] flex-1"
                placeholder="session-1, session-2"
              />
              <Select
                value={teamFilter}
                onChange={(event) => setTeamFilter(event.target.value)}
                className="min-w-[180px]"
              >
                <option value="all">All teams</option>
                {(props.teams?.teams ?? []).map((team) => (
                  <option key={team.name} value={team.name}>
                    {team.name}
                  </option>
                ))}
              </Select>

              <Select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="min-w-[180px]"
              >
                <option value="all">All statuses</option>
                <option value="pending">Pending</option>
                <option value="in_progress">In progress</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
              </Select>

              <Badge variant="outline">
                {formatNumber(aggregateTasks.data?.total)} total
              </Badge>
              <Badge variant="outline">
                {normalizedSessionScope ? `${normalizedSessionScope.split(",").length} session ids` : "All sessions"}
              </Badge>
            </div>
          </ToolbarPane>

          <CompactDataTable
            title="All team tasks"
            description="Aggregated task inventory from GET /api/v1/tasks, with optional session-linked filtering."
            search={{
              value: aggregateTasks.query,
              onChange: aggregateTasks.setQuery,
              placeholder: "Search task id, description, assignee, or dependency",
            }}
            meta={(
              <TableMetaBadges
                total={aggregateTasks.data?.total}
                noun="tasks"
                loading={aggregateTasks.loading}
                query={aggregateTasks.query}
              />
            )}
            loading={aggregateTasks.loading}
            error={aggregateTasks.error}
            columns={["Task", "Team", "Status", "Assignee"]}
            rows={(aggregateTasks.data?.tasks ?? []).map((task) => ({
              id: task.resourceId,
              cells: [
                <div className="space-y-0.5">
                  <div className="font-medium text-slate-900">{task.id}</div>
                  <div className="text-xs text-slate-500">
                    {truncate(task.description || "No description", 72)}
                  </div>
                </div>,
                <Badge variant="outline">{task.teamName}</Badge>,
                <Badge variant={statusBadgeVariant(task.status)}>{task.status}</Badge>,
                <span className="text-xs text-slate-500">{task.assignee ?? "Unassigned"}</span>,
              ],
              previewEyebrow: "Team Task",
              previewTitle: task.id,
              previewDescription: task.description || "No description",
              previewMeta: [
                { label: "Team", value: task.teamName },
                { label: "Status", value: task.status },
                { label: "Assignee", value: task.assignee ?? "Unassigned" },
              ],
              drawerMeta: [
                { label: "Resource id", value: task.resourceId },
                { label: "Team", value: task.teamName },
                { label: "Status", value: task.status },
                { label: "Assignee", value: task.assignee ?? "Unassigned" },
                { label: "Dependencies", value: task.dependencies.join(", ") || "None" },
                { label: "Task list path", value: (
                  <CopyableValue
                    value={task.taskListPath}
                    displayValue={truncate(task.taskListPath, 72)}
                    mono
                  />
                ) },
                { label: "File path", value: task.filePath ? (
                  <CopyableValue
                    value={task.filePath}
                    displayValue={truncate(task.filePath, 72)}
                    mono
                  />
                ) : "Unavailable" },
              ],
            }))}
            emptyTitle="No tasks matched"
            emptyDetail="The aggregated tasks endpoint did not return any tasks for this filter set."
          />
        </div>

        <div id="team-tasks-selected">
          <CompactDataTable
            title="Selected team task list"
            description="Per-team task proof from GET /api/v1/teams/:name/tasks, constrained by the same session scope when provided."
            search={{
              value: selectedTeamTasks.query,
              onChange: selectedTeamTasks.setQuery,
              placeholder: "Search selected team tasks",
            }}
            meta={(
              <div className="flex flex-wrap gap-2">
                {selectedTeam ? <Badge variant="outline">{selectedTeam}</Badge> : null}
                <TableMetaBadges
                  total={selectedTeamTasks.data?.total}
                  noun="tasks"
                  loading={selectedTeamTasks.loading}
                  query={selectedTeamTasks.query}
                />
              </div>
            )}
            loading={selectedTeamTasks.loading}
            error={selectedTeamTasks.error}
            columns={["Task", "Status", "Assignee", "Dependencies"]}
            rows={(selectedTeamTasks.data?.tasks ?? []).map((task) => ({
              id: task.resourceId,
              cells: [
                <span className="font-medium text-slate-900">{task.id}</span>,
                <Badge variant={statusBadgeVariant(task.status)}>{task.status}</Badge>,
                <span className="text-xs text-slate-500">{task.assignee ?? "Unassigned"}</span>,
                <Badge variant="outline">{formatNumber(task.dependencies.length)}</Badge>,
              ],
              previewEyebrow: "Selected Team Task",
              previewTitle: task.id,
              previewDescription: task.description || "No description",
              previewMeta: [
                { label: "Dependencies", value: task.dependencies.join(", ") || "None" },
                { label: "File", value: truncate(task.filePath ?? "Unavailable", 80) },
              ],
            }))}
            emptyTitle={selectedTeam ? "No tasks for the selected team" : "No team selected"}
            emptyDetail={selectedTeam
              ? "The per-team tasks endpoint returned no tasks for the selected team and filters."
              : "Choose a team from the Agents and teams page to inspect its task list here."}
          />
        </div>

        <div id="team-tasks-metadata">
          <ResourceMetadataWorkspace
            title="Task metadata"
            description="Attach internal annotations like owner, priority, or workflow labels to task resources exposed from Claude team task files."
            inventories={[
              {
                label: "Team tasks",
                resourceType: "team-task",
                items: metadataItems,
              },
            ]}
          />
        </div>

        <div id="team-tasks-payload">
          <JsonPreview
            title="Task payload"
            data={{
              aggregate: aggregateTasks.data,
              selectedTeam: selectedTeamTasks.data,
            }}
            emptyMessage="Task payload is not available yet."
          />
        </div>
      </PageBodyWithRail>
    </section>
  );
}
