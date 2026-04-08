import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import type {
  AgentsResponse,
  PlaygroundPageId,
  TeamDetailResponse,
  TeamsResponse,
  TeamTasksResponse,
} from "../lib/playground";
import {
  ActionPane,
  CompactDataTable,
  JsonPreview,
  PageBodyWithRail,
  SectionIntro,
  TableMetaBadges,
} from "../components/playground-ui";

export function AgentsPage(props: {
  activeSection?: string;
  agents: AgentsResponse | null;
  teams: TeamsResponse | null;
  selectedTeam: string;
  teamDetail: TeamDetailResponse | null;
  teamTasks: TeamTasksResponse | null;
  onSelectTeam: (teamName: string) => void;
  onJumpToTeamSessions: () => void;
}) {
  const page: PlaygroundPageId = "agents-teams";
  const operations = [
    {
      method: "GET",
      path: "/api/v1/teams",
      detail: "List available team definitions.",
      sectionId: "agents-teams-roster",
    },
    {
      method: "GET",
      path: "/api/v1/teams/:name/tasks",
      detail: "Inspect task assignment and current status for a team.",
      sectionId: "agents-teams-roster",
    },
    {
      method: "GET",
      path: "/api/v1/agents",
      detail: "List registered agents.",
      sectionId: "agents-registry",
    },
  ];
  const sections = [
    { id: "agents-teams-roster", label: "Teams" },
    { id: "agents-registry", label: "Agents" },
  ];
  const exampleGroups = [
    {
      title: "Teams",
      items: [
        {
          label: "Select first team",
          detail: "Load the first discovered team into the response panel below.",
          action: () => {
            const first = props.teams?.teams[0];
            if (first) {
              props.onSelectTeam(first.name);
            }
          },
        },
        {
          label: "Filter sessions by team",
          detail: "Jump back to the sessions page and focus team-linked sessions.",
          action: props.onJumpToTeamSessions,
        },
      ],
    },
  ];

  return (
    <section className="space-y-8">
      <SectionIntro
        eyebrow="Agents"
        title="Agent registry and team workspace"
        description="This surface keeps the structure simple: agents on one side, team selection and member detail on the other. Team-driven session activity is easiest to observe in the session explorer and live feed."
      />

      <PageBodyWithRail
        page={page}
        activeSection={props.activeSection}
        items={operations}
        exampleGroups={exampleGroups}
        sections={sections}
      >
        <div id="agents-teams-roster" className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <CompactDataTable
            title="Teams"
            description="Select a team to inspect the current roster and task list."
            meta={
              <TableMetaBadges
                total={props.teams?.total}
                noun="teams"
              />
            }
            columns={["Team", "Members", "Inspect"]}
            rows={(props.teams?.teams ?? []).map((team) => ({
              id: team.name,
              cells: [
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-900">{team.name}</span>
                  {props.selectedTeam === team.name ? <Badge variant="info">Selected</Badge> : null}
                </div>,
                <Badge variant="outline">{team.memberCount} members</Badge>,
                <Button
                  type="button"
                  variant={props.selectedTeam === team.name ? "secondary" : "ghost"}
                  size="sm"
                  onClick={(event) => {
                    event.stopPropagation();
                    props.onSelectTeam(team.name);
                  }}
                >
                  Inspect
                </Button>,
              ],
              previewEyebrow: "Team",
              previewTitle: team.name,
              previewDescription: `${team.memberCount} team members available in the current workspace.`,
              previewMeta: [
                { label: "Config path", value: team.configPath },
                { label: "Selection", value: props.selectedTeam === team.name ? "Selected" : "Not selected" },
              ],
              drawerMeta: [
                { label: "Config path", value: team.configPath },
                { label: "Members", value: `${team.memberCount}` },
                { label: "Selection", value: props.selectedTeam === team.name ? "Selected" : "Not selected" },
              ],
              drawerContent: (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={(event) => {
                    event.stopPropagation();
                    props.onSelectTeam(team.name);
                  }}
                >
                  Inspect team payload
                </Button>
              ),
            }))}
            emptyTitle="No teams found"
            emptyDetail="The team registry is responding, but there are no available team definitions."
          />

          <ActionPane
            eyebrow="Response"
            title={props.teamDetail?.name ?? "Selected team"}
            description="Team details and tasks for the selected definition."
          >
            <JsonPreview
              title="Team payload"
              data={
                props.teamDetail
                  ? {
                      team: props.teamDetail,
                      tasks: props.teamTasks?.tasks ?? [],
                    }
                  : null
              }
              emptyMessage="Select a team to inspect its payload."
            />
          </ActionPane>
        </div>

        <div id="agents-registry">
          <CompactDataTable
            title="Agents"
            description="Registered agents from GET /api/v1/agents."
            meta={
              <TableMetaBadges
                total={props.agents?.total}
                noun="agents"
              />
            }
            columns={["Agent", "Source", "Model"]}
            rows={(props.agents?.agents ?? []).map((agent) => ({
              id: `${agent.name}-${agent.source}`,
              cells: [
                <span className="font-medium text-slate-900">{agent.name}</span>,
                <span className="text-xs text-slate-500">{agent.source}</span>,
                agent.model ? <Badge variant="outline">{agent.model}</Badge> : <span className="text-xs text-slate-400">Default</span>,
              ],
              previewEyebrow: "Agent",
              previewTitle: agent.name,
              previewDescription: agent.description || "No description",
              previewMeta: [
                { label: "Source", value: agent.source },
                { label: "Model", value: agent.model ?? "Default" },
                { label: "Tools", value: agent.tools?.join(", ") || "Default toolset" },
              ],
            }))}
            emptyTitle="No registered agents"
            emptyDetail="The route is healthy, but there are no agent definitions available."
          />
        </div>
      </PageBodyWithRail>
    </section>
  );
}
