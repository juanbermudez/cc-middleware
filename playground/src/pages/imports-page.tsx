import { Button } from "../components/ui/button";
import type {
  CheckResult,
  PlaygroundPageId,
  SearchStatsResponse,
  SessionsResponse,
  SyncStatusResponse,
} from "../lib/playground";
import { formatNumber, formatTimestamp } from "../lib/utils";
import {
  CompactStatGrid,
  InlineState,
  JsonPreview,
  PageBodyWithRail,
  SectionIntro,
  ToolbarPane,
} from "../components/playground-ui";

export function ImportsPage(props: {
  activeSection?: string;
  recentSessions: SessionsResponse | null;
  searchStats: SearchStatsResponse | null;
  syncStatus: SyncStatusResponse | null;
  reindexState: CheckResult;
  onRunReindex: () => void;
  onRefreshStats: () => void;
}) {
  const page: PlaygroundPageId = "imports";
  const importStats = [
    {
      label: "Sessions on disk",
      value: formatNumber(props.recentSessions?.total),
      detail: "Discovered from Claude session storage.",
      tone: "neutral" as const,
    },
    {
      label: "Indexed sessions",
      value: formatNumber(props.searchStats?.totalSessions),
      detail: "Unique sessions currently stored in SQLite.",
      tone: "info" as const,
    },
    {
      label: "Indexed messages",
      value: formatNumber(props.searchStats?.totalMessages),
      detail: "Message bodies available to indexed search.",
      tone: "neutral" as const,
    },
    {
      label: "Session watcher",
      value: props.syncStatus?.sessionWatcher.watching ? "Running" : "Stopped",
      detail: `${formatNumber(props.syncStatus?.sessionWatcher.knownFiles)} known files.`,
      tone: props.syncStatus?.sessionWatcher.watching ? "success" : "warning",
    },
    {
      label: "Auto-indexer",
      value: props.syncStatus?.autoIndexer.running ? "Running" : "Stopped",
      detail: `${formatNumber(props.syncStatus?.autoIndexer.sessionsIndexed)} index runs. ${formatNumber(props.syncStatus?.autoIndexer.indexErrors)} errors.`,
      tone: props.syncStatus?.autoIndexer.running ? "success" : "warning",
    },
    {
      label: "Pending batch",
      value: formatNumber(props.syncStatus?.autoIndexer.pendingBatch),
      detail: `Last index ${formatTimestamp(props.syncStatus?.autoIndexer.lastIndexTime)}.`,
      tone: "neutral" as const,
    },
    {
      label: "Last full backfill",
      value: formatTimestamp(props.searchStats?.lastFullIndex),
      detail: "Updated by the manual reindex route.",
      tone: "neutral" as const,
    },
    {
      label: "Last incremental",
      value: formatTimestamp(props.searchStats?.lastIncrementalIndex),
      detail: "Latest incremental import marker.",
      tone: "neutral" as const,
    },
  ];

  const operations = [
    {
      method: "POST",
      path: "/api/v1/search/reindex",
      detail: "Run a full backfill of Claude sessions into the search index.",
      sectionId: "imports-status",
    },
    {
      method: "GET",
      path: "/api/v1/search/stats",
      detail: "Read indexed session and message counts.",
      sectionId: "imports-status",
    },
    {
      method: "GET",
      path: "/api/v1/sync/status",
      detail: "Inspect session watcher and auto-indexer runtime state.",
      sectionId: "imports-status",
    },
  ];
  const sections = [{ id: "imports-status", label: "Import status" }];
  const exampleGroups = [
    {
      title: "Imports",
      items: [
        {
          label: "Compare disk vs index",
          detail: "Refresh the workspace and compare discovered sessions to SQLite coverage.",
          action: props.onRefreshStats,
        },
        {
          label: "Run a full backfill",
          detail: "Force the index to catch up with historical session files.",
          action: props.onRunReindex,
        },
      ],
    },
  ];

  return (
    <section className="space-y-8">
      <SectionIntro
        eyebrow="Imports"
        title="Backfill and import stats"
        description="This page tracks one-time backfills and background imports separately. Use it to understand what has already been indexed, what the auto-indexer is currently queuing, and whether import work is healthy."
      />

      <PageBodyWithRail
        page={page}
        activeSection={props.activeSection}
        items={operations}
        exampleGroups={exampleGroups}
        sections={sections}
      >
        <ToolbarPane
          title="Import controls"
          description="Run a full backfill or refresh the current sync stats without leaving the page."
        >
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={props.onRunReindex}>
              Reindex existing sessions
            </Button>
            <Button variant="secondary" onClick={props.onRefreshStats}>
              Refresh stats
            </Button>
          </div>
          <InlineState
            variant={props.reindexState.status === "error" ? "error" : props.reindexState.status === "loading" ? "warning" : "neutral"}
            title={
              props.reindexState.status === "loading"
                ? "Backfill in progress"
                : props.reindexState.status === "error"
                  ? "Backfill finished with an issue"
                  : "Latest backfill state"
            }
            detail={props.reindexState.detail}
          />
        </ToolbarPane>

        <div id="imports-status" className="space-y-4">
          <div>
            <div className="text-sm font-medium text-slate-900">Import status</div>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Current backfill and background indexing state.
            </p>
          </div>
          <CompactStatGrid items={importStats} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <JsonPreview
            title="Search stats"
            data={props.searchStats}
            emptyMessage="Search stats are not available yet."
          />
          <JsonPreview
            title="Sync status"
            data={props.syncStatus}
            emptyMessage="Sync status is not available yet."
          />
        </div>
      </PageBodyWithRail>
    </section>
  );
}
