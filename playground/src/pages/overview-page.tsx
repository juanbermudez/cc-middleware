import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import type {
  CheckResult,
  HealthResponse,
  MiddlewareStatusResponse,
  PlaygroundPageId,
  RuntimeResponse,
  SearchStatsResponse,
  SyncStatusResponse,
  TeamsResponse,
} from "../lib/playground";
import { formatNumber } from "../lib/utils";
import {
  CompactStatGrid,
  PageBodyWithRail,
  SectionIntro,
} from "../components/playground-ui";

export function OverviewPage(props: {
  activeSection?: string;
  health: HealthResponse | null;
  checks: Record<"health" | "status" | "runtime" | "websocket", CheckResult>;
  middlewareStatus: MiddlewareStatusResponse | null;
  teams: TeamsResponse | null;
  teamTaskCount: number | null;
  runtime: RuntimeResponse | null;
  searchStats: SearchStatsResponse | null;
  syncStatus: SyncStatusResponse | null;
  onRefresh: () => void;
}) {
  const page: PlaygroundPageId = "overview";
  const topStats = [
    {
      label: "Health",
      value: props.health?.status ?? "Unavailable",
      detail: props.checks.health.detail,
      tone: props.health?.status === "ok" ? "success" : "neutral",
    },
    {
      label: "Active sessions",
      value: formatNumber(props.middlewareStatus?.activeSessions),
      detail: `${formatNumber(props.middlewareStatus?.registeredAgents)} agents registered.`,
      tone: "info" as const,
    },
    {
      label: "Indexed sessions",
      value: formatNumber(props.searchStats?.totalSessions),
      detail: `${formatNumber(props.searchStats?.totalMessages)} indexed messages.`,
      tone: "neutral" as const,
    },
    {
      label: "Live feed",
      value: props.checks.websocket.status === "pass" ? "Connected" : "Waiting",
      detail: props.checks.websocket.detail,
      tone: props.checks.websocket.status === "pass" ? "success" : "warning",
    },
  ];

  const bootstrapStats = [
    {
      label: "Teams",
      value: formatNumber(props.teams?.total),
      detail: `${formatNumber(props.teamTaskCount)} total tracked tasks.`,
      tone: "neutral" as const,
    },
    {
      label: "Skills",
      value: formatNumber(props.runtime?.skills.length),
      detail: `${formatNumber(props.runtime?.slashCommands.length)} slash commands loaded.`,
      tone: "info" as const,
    },
    {
      label: "Plugins",
      value: formatNumber(props.runtime?.plugins.length),
      detail: `${formatNumber(props.runtime?.agents.length)} runtime agents available.`,
      tone: "neutral" as const,
    },
    {
      label: "Auto-indexer",
      value: props.syncStatus?.autoIndexer.running ? "Running" : "Stopped",
      detail: `Pending batch ${formatNumber(props.syncStatus?.autoIndexer.pendingBatch)}.`,
      tone: props.syncStatus?.autoIndexer.running ? "success" : "warning",
    },
  ];

  const operations = [
    {
      method: "GET",
      path: "/health",
      detail: "Health check and version status.",
      sectionId: "overview-status",
    },
    {
      method: "GET",
      path: "/api/v1/status",
      detail: "Operational middleware counters and pending state.",
      sectionId: "overview-status",
    },
    {
      method: "GET",
      path: "/api/v1/search/stats",
      detail: "Indexed session and message totals.",
      sectionId: "overview-bootstrap",
    },
    {
      method: "GET",
      path: "/api/v1/config/runtime",
      detail: "Loaded runtime skills, plugins, and MCP servers.",
      sectionId: "overview-bootstrap",
    },
    {
      method: "GET",
      path: "/api/v1/teams",
      detail: "Available team definitions for the current workspace.",
      sectionId: "overview-bootstrap",
    },
  ];
  const sections = [
    { id: "overview-status", label: "Status" },
    { id: "overview-bootstrap", label: "Bootstrap inventory" },
  ];

  return (
    <section className="space-y-8">
      <SectionIntro
        eyebrow="Overview"
        title="Middleware playground"
        description="A local API workbench for the middleware. Each page isolates one surface, keeps the controls compact, and brings the runnable examples into the content instead of pushing them into a separate rail."
      />

      <PageBodyWithRail
        page={page}
        activeSection={props.activeSection}
        items={operations}
        sections={sections}
        railPanels={(
          <div className="space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
              Workspace
            </div>
            <div className="space-y-2 rounded-xl border border-slate-200 bg-white/82 p-3">
              <Button variant="secondary" size="sm" onClick={props.onRefresh} className="w-full justify-center">
                Refresh workspace
              </Button>
              <Badge variant="outline" className="flex w-full justify-center font-mono text-[11px]">
                API http://127.0.0.1:3000
              </Badge>
              <Badge variant="outline" className="flex w-full justify-center font-mono text-[11px]">
                UI http://127.0.0.1:4173
              </Badge>
            </div>
          </div>
        )}
      >
        <div id="overview-status" className="space-y-4">
          <div>
            <div className="text-sm font-medium text-slate-900">Status</div>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              A compact read on middleware health, session state, indexing, and socket connection.
            </p>
          </div>
          <CompactStatGrid items={topStats} />
        </div>

        <div id="overview-bootstrap" className="space-y-4">
          <div>
            <div className="text-sm font-medium text-slate-900">Bootstrap inventory</div>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Runtime teams, skills, plugins, and indexing context already discovered for this workspace.
            </p>
          </div>
          <CompactStatGrid items={bootstrapStats} />
        </div>
      </PageBodyWithRail>
    </section>
  );
}
