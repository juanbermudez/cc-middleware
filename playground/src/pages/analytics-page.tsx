import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import {
  CompactStatGrid,
  InlineState,
  SectionIntro,
} from "../components/playground-ui";
import { AnalyticsDrawer } from "../components/analytics-drawer";
import { AnalyticsToolDrawer } from "../components/analytics-tool-drawer";
import {
  AnalyticsTimeseries,
  type AnalyticsMetricKey,
} from "../components/analytics-timeseries";
import { AnalyticsToolTable } from "../components/analytics-tool-table";
import { AnalyticsTraceTable } from "../components/analytics-trace-table";
import type {
  AnalyticsFacetValue,
  AnalyticsFacetsResponse,
  AnalyticsOverviewResponse,
  AnalyticsStatusResponse,
  AnalyticsToolPerformanceRow,
  AnalyticsToolPerformanceResponse,
  AnalyticsTimeseriesResponse,
  AnalyticsTraceSummary,
  AnalyticsTracesResponse,
} from "../lib/playground";
import { formatNumber, formatTimestamp } from "../lib/utils";

type RangePreset = "24h" | "7d" | "30d" | "all" | "custom";
type AnalyticsFacetFilterKey =
  | "traceKinds"
  | "sessionIds"
  | "toolNames"
  | "errorKinds"
  | "keywordCategories";

type AnalyticsDashboardFilters = Record<AnalyticsFacetFilterKey, string[]>;

const FILTER_LABELS: Record<AnalyticsFacetFilterKey, string> = {
  traceKinds: "Session type",
  sessionIds: "Session",
  toolNames: "Tool",
  errorKinds: "Error",
  keywordCategories: "Keyword",
};

const EMPTY_FILTERS: AnalyticsDashboardFilters = {
  traceKinds: [],
  sessionIds: [],
  toolNames: [],
  errorKinds: [],
  keywordCategories: [],
};

async function fetchJson<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${text}`.trim());
  }
  return response.json() as Promise<T>;
}

function formatCurrency(value: number | undefined): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 4,
  }).format(value ?? 0);
}

function toLocalInputValue(value: Date): string {
  const offset = value.getTimezoneOffset();
  const local = new Date(value.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function buildRange(preset: RangePreset, customStart: string, customEnd: string) {
  const now = new Date();

  if (preset === "all") {
    return {};
  }

  if (preset === "custom") {
    return {
      start: customStart ? new Date(customStart).toISOString() : undefined,
      end: customEnd ? new Date(customEnd).toISOString() : undefined,
    };
  }

  const hours =
    preset === "24h" ? 24
    : preset === "7d" ? 24 * 7
    : 24 * 30;
  const start = new Date(now.getTime() - hours * 60 * 60 * 1000);

  return {
    start: start.toISOString(),
    end: now.toISOString(),
  };
}

function appendFilterParams(params: URLSearchParams, filters: AnalyticsDashboardFilters): void {
  for (const [key, values] of Object.entries(filters) as Array<[AnalyticsFacetFilterKey, string[]]>) {
    if (values.length > 0) {
      params.set(key, values.join(","));
    }
  }
}

function hasActiveFilters(filters: AnalyticsDashboardFilters): boolean {
  return Object.values(filters).some((values) => values.length > 0);
}

function toggleFilterValue(
  filters: AnalyticsDashboardFilters,
  key: AnalyticsFacetFilterKey,
  value: string
): AnalyticsDashboardFilters {
  const current = filters[key];
  return {
    ...filters,
    [key]: current.includes(value)
      ? current.filter((entry) => entry !== value)
      : [...current, value],
  };
}

function filterFacetValues(values: AnalyticsFacetValue[] | undefined, query: string): AnalyticsFacetValue[] {
  if (!values || values.length === 0) {
    return [];
  }

  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return values;
  }

  return values.filter((entry) => entry.value.toLowerCase().includes(normalized));
}

function FilterPanel(props: {
  id?: string;
  title: string;
  meta?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={props.id} className="analytics-filter-section">
      <div className="analytics-filter-header">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="analytics-filter-title">{props.title}</div>
            {props.meta ? <div className="analytics-filter-meta">{props.meta}</div> : null}
          </div>
          {props.description ? (
            <p className="analytics-filter-note">{props.description}</p>
          ) : null}
        </div>
        {props.actions ? <div className="shrink-0">{props.actions}</div> : null}
      </div>
      <div className="analytics-filter-body">{props.children}</div>
    </section>
  );
}

function FilterChip(props: {
  active: boolean;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`rounded-full border px-3 py-1.5 text-left text-[13px] transition ${
        props.active
          ? "border-sky-300 bg-sky-50/90 text-sky-700"
          : "border-slate-200/90 bg-transparent text-slate-500 hover:border-slate-300 hover:bg-slate-50/70 hover:text-slate-700"
      }`}
    >
      <span>{props.label}</span>
      {props.count !== undefined ? (
        <span className="ml-1.5 text-xs text-slate-400">{props.count}</span>
      ) : null}
    </button>
  );
}

function ActiveFilterSummary(props: {
  filters: AnalyticsDashboardFilters;
  onClearValue: (key: AnalyticsFacetFilterKey, value: string) => void;
  onClearAll: () => void;
}) {
  const entries = (Object.entries(props.filters) as Array<[AnalyticsFacetFilterKey, string[]]>)
    .flatMap(([key, values]) => values.map((value) => ({ key, value })));

  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
        Active filters
      </span>
      {entries.map((entry) => (
        <button
          key={`${entry.key}:${entry.value}`}
          type="button"
          onClick={() => props.onClearValue(entry.key, entry.value)}
          className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
        >
          {FILTER_LABELS[entry.key]}: {entry.value} ×
        </button>
      ))}
      <button
        type="button"
        onClick={props.onClearAll}
        className="text-xs font-medium text-sky-700 transition hover:text-sky-800"
      >
        Clear all
      </button>
    </div>
  );
}

function FacetFilterGroup(props: {
  title: string;
  description?: string;
  values: AnalyticsFacetValue[];
  selected: string[];
  onToggle: (value: string) => void;
  emptyLabel: string;
}) {
  const meta = props.selected.length > 0
    ? `${props.selected.length} selected`
    : props.values.length > 0
      ? `${props.values.length} values`
      : undefined;

  return (
    <FilterPanel title={props.title} description={props.description} meta={meta}>
      {props.values.length > 0 ? (
        <div className="analytics-filter-chip-cluster">
          {props.values.map((value) => (
            <FilterChip
              key={value.value}
              active={props.selected.includes(value.value)}
              label={value.value}
              count={value.count}
              onClick={() => props.onToggle(value.value)}
            />
          ))}
        </div>
      ) : (
        <div className="analytics-filter-note">{props.emptyLabel}</div>
      )}
    </FilterPanel>
  );
}

export function AnalyticsPage(_props: { activeSection?: string }) {
  const [rangePreset, setRangePreset] = useState<RangePreset>("7d");
  const [customStart, setCustomStart] = useState(() => toLocalInputValue(new Date(Date.now() - 7 * 86_400_000)));
  const [customEnd, setCustomEnd] = useState(() => toLocalInputValue(new Date()));
  const [traceQuery, setTraceQuery] = useState("");
  const [sessionFacetQuery, setSessionFacetQuery] = useState("");
  const [toolFacetQuery, setToolFacetQuery] = useState("");
  const [selectedMetrics, setSelectedMetrics] = useState<AnalyticsMetricKey[]>([
    "errors",
    "keywordMentions",
    "estimatedCostUsd",
    "inputTokens",
  ]);
  const [filters, setFilters] = useState<AnalyticsDashboardFilters>(EMPTY_FILTERS);
  const [status, setStatus] = useState<AnalyticsStatusResponse | null>(null);
  const [overview, setOverview] = useState<AnalyticsOverviewResponse | null>(null);
  const [timeseries, setTimeseries] = useState<AnalyticsTimeseriesResponse | null>(null);
  const [facets, setFacets] = useState<AnalyticsFacetsResponse | null>(null);
  const [toolPerformance, setToolPerformance] = useState<AnalyticsToolPerformanceResponse | null>(null);
  const [traces, setTraces] = useState<AnalyticsTracesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionState, setActionState] = useState<string | null>(null);
  const [selectedTrace, setSelectedTrace] = useState<AnalyticsTraceSummary | null>(null);
  const [selectedTool, setSelectedTool] = useState<AnalyticsToolPerformanceRow | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const range = useMemo(
    () => buildRange(rangePreset, customStart, customEnd),
    [customEnd, customStart, rangePreset]
  );

  const analyticsParams = useMemo(() => {
    const params = new URLSearchParams();
    if (range.start) {
      params.set("start", range.start);
    }
    if (range.end) {
      params.set("end", range.end);
    }
    appendFilterParams(params, filters);
    return params;
  }, [filters, range.end, range.start]);

  const analyticsQueryString = useMemo(() => analyticsParams.toString(), [analyticsParams]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const overviewPath = `/api/v1/analytics/overview${analyticsParams.size ? `?${analyticsParams.toString()}` : ""}`;
    const timeseriesParams = new URLSearchParams(analyticsParams);
    timeseriesParams.set("bucket", rangePreset === "30d" || rangePreset === "all" ? "day" : "hour");
    const timeseriesPath = `/api/v1/analytics/timeseries?${timeseriesParams.toString()}`;
    const facetsPath = `/api/v1/analytics/facets${analyticsParams.size ? `?${analyticsParams.toString()}` : ""}`;
    const toolPerformancePath = `/api/v1/analytics/tool-performance${analyticsParams.size ? `?${analyticsParams.toString()}` : ""}`;
    const tracesParams = new URLSearchParams(analyticsParams);
    if (traceQuery.trim()) {
      tracesParams.set("q", traceQuery.trim());
    }
    const tracesPath = `/api/v1/analytics/traces${tracesParams.size ? `?${tracesParams.toString()}` : ""}`;

    Promise.all([
      fetchJson<AnalyticsStatusResponse>("/api/v1/analytics/status", controller.signal),
      fetchJson<AnalyticsOverviewResponse>(overviewPath, controller.signal),
      fetchJson<AnalyticsTimeseriesResponse>(timeseriesPath, controller.signal),
      fetchJson<AnalyticsFacetsResponse>(facetsPath, controller.signal),
      fetchJson<AnalyticsToolPerformanceResponse>(toolPerformancePath, controller.signal),
      fetchJson<AnalyticsTracesResponse>(tracesPath, controller.signal),
    ])
      .then(([nextStatus, nextOverview, nextTimeseries, nextFacets, nextToolPerformance, nextTraces]) => {
        setStatus(nextStatus);
        setOverview(nextOverview);
        setTimeseries(nextTimeseries);
        setFacets(nextFacets);
        setToolPerformance(nextToolPerformance);
        setTraces(nextTraces);
        setActionState(null);
      })
      .catch((fetchError: unknown) => {
        if ((fetchError as { name?: string }).name === "AbortError") {
          return;
        }

        setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [analyticsParams, rangePreset, reloadToken, traceQuery]);

  const statItems = overview
    ? [
        {
          label: "Traces",
          value: formatNumber(overview.totals.traces),
          detail: `${formatNumber(overview.totals.events)} total events in range.`,
          tone: "info" as const,
        },
        {
          label: "Errors",
          value: formatNumber(overview.totals.errors),
          detail: `${formatNumber(overview.totals.keywordMentions)} keyword incidents.`,
          tone: overview.totals.errors > 0 ? "warning" : "success",
        },
        {
          label: "Spend",
          value: formatCurrency(overview.totals.estimatedCostUsd),
          detail: `${formatNumber(overview.totals.inputTokens + overview.totals.outputTokens)} total tokens.`,
          tone: "neutral" as const,
        },
        {
          label: "Context peak",
          value: formatNumber(overview.totals.contextEstimateTokensPeak),
          detail: status?.lastBackfillAt
            ? `Backfill ${formatTimestamp(status.lastBackfillAt)}`
            : "Derived from request-level token usage.",
          tone: "neutral" as const,
        },
      ]
    : [];

  const sessionFacetValues = useMemo(
    () => filterFacetValues(facets?.sessions, sessionFacetQuery).slice(0, 24),
    [facets?.sessions, sessionFacetQuery]
  );

  const toolFacetValues = useMemo(
    () => filterFacetValues(facets?.toolNames, toolFacetQuery).slice(0, 24),
    [facets?.toolNames, toolFacetQuery]
  );

  const sessionTypeValues = facets?.traceKinds ?? [];
  const warehouseLabel = status?.dbPath
    ? status.dbPath.split("/").at(-1) ?? status.dbPath
    : "Warehouse unavailable";
  const toolFacetMeta = toolFacetQuery.trim()
    ? `${toolFacetValues.length} matches`
    : filters.toolNames.length > 0
      ? `${filters.toolNames.length} selected`
      : `${formatNumber(facets?.toolNames.length ?? 0)} values`;
  const sessionFacetMeta = sessionFacetQuery.trim()
    ? `${sessionFacetValues.length} matches`
    : filters.sessionIds.length > 0
      ? `${filters.sessionIds.length} selected`
      : undefined;

  useEffect(() => {
    if (!selectedTool) {
      return;
    }

    const matchingRow = toolPerformance?.rows.find((row) => row.toolName === selectedTool.toolName) ?? null;
    if (!matchingRow) {
      setSelectedTool(null);
    }
  }, [selectedTool, toolPerformance?.rows]);

  async function runBackfill(): Promise<void> {
    setActionState("Running transcript backfill and refreshing facts...");
    try {
      const response = await fetch("/api/v1/analytics/backfill", { method: "POST" });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`${response.status} ${response.statusText}: ${text}`.trim());
      }
      setActionState("Backfill completed. Refreshing analytics views...");
      setReloadToken((current) => current + 1);
    } catch (actionError) {
      setActionState(actionError instanceof Error ? actionError.message : String(actionError));
    }
  }

  function toggleMetric(metric: AnalyticsMetricKey): void {
    setSelectedMetrics((current) =>
      current.includes(metric)
        ? current.filter((entry) => entry !== metric)
        : [...current, metric]
    );
  }

  function toggleFacetFilter(key: AnalyticsFacetFilterKey, value: string): void {
    setFilters((current) => toggleFilterValue(current, key, value));
  }

  function clearAllFilters(): void {
    setFilters(EMPTY_FILTERS);
    setTraceQuery("");
    setSessionFacetQuery("");
    setToolFacetQuery("");
  }

  function clearSingleFilter(key: AnalyticsFacetFilterKey, value: string): void {
    setFilters((current) => ({
      ...current,
      [key]: current[key].filter((entry) => entry !== value),
    }));
  }

  return (
    <section className="space-y-8">
      <SectionIntro
        eyebrow="Analytics"
        title="Developer analytics dashboard"
        description="A full-width local dashboard for transcript-first analytics. Filter by session type, tool, errors, keyword categories, and session family while comparing cost, tokens, traces, and incidents over time."
      />

      {error ? (
        <InlineState
          variant="error"
          title="Could not load analytics"
          detail={error}
        />
      ) : null}

      <div className="grid gap-8 xl:grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside id="analytics-facets" className="analytics-filter-rail xl:sticky xl:top-8 xl:self-start">
          <FilterPanel
            title="Workspace"
            meta={status?.available ? "local" : undefined}
            actions={
              hasActiveFilters(filters) || traceQuery.trim() || toolFacetQuery.trim() || sessionFacetQuery.trim() ? (
                <Button variant="ghost" size="sm" onClick={clearAllFilters}>
                  Clear
                </Button>
              ) : undefined
            }
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="font-mono" title={status?.dbPath ?? undefined}>
                {warehouseLabel}
              </Badge>
              {status?.lastBackfillAt ? (
                <Badge variant="outline">
                  Backfill {formatTimestamp(status.lastBackfillAt)}
                </Badge>
              ) : null}
            </div>
            {actionState ? <div className="analytics-filter-note">{actionState}</div> : null}
          </FilterPanel>

          <FilterPanel
            title="Time window"
          >
            <Select value={rangePreset} onChange={(event) => setRangePreset(event.target.value as RangePreset)}>
              <option value="24h">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="all">All time</option>
              <option value="custom">Custom</option>
            </Select>
            <Input
              type="datetime-local"
              value={customStart}
              onChange={(event) => setCustomStart(event.target.value)}
              disabled={rangePreset !== "custom"}
            />
            <Input
              type="datetime-local"
              value={customEnd}
              onChange={(event) => setCustomEnd(event.target.value)}
              disabled={rangePreset !== "custom"}
            />
            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  setActionState("Refreshing analytics views...");
                  setReloadToken((current) => current + 1);
                }}
              >
                Refresh
              </Button>
              <Button variant="secondary" className="flex-1" onClick={() => void runBackfill()}>
                Backfill
              </Button>
            </div>
          </FilterPanel>

          <FilterPanel
            title="Series"
            meta={`${selectedMetrics.length} active`}
          >
            <div className="analytics-filter-chip-cluster">
              {(
                [
                  ["errors", "Errors"],
                  ["keywordMentions", "Keywords"],
                  ["estimatedCostUsd", "Cost"],
                  ["inputTokens", "Input tokens"],
                  ["outputTokens", "Output tokens"],
                ] as Array<[AnalyticsMetricKey, string]>
              ).map(([metric, label]) => (
                <FilterChip
                  key={metric}
                  active={selectedMetrics.includes(metric)}
                  label={label}
                  onClick={() => toggleMetric(metric)}
                />
              ))}
            </div>
          </FilterPanel>

          <FacetFilterGroup
            title="Session type"
            values={facets?.traceKinds ?? []}
            selected={filters.traceKinds}
            onToggle={(value) => toggleFacetFilter("traceKinds", value)}
            emptyLabel="No trace kinds match the current range."
          />

          <FacetFilterGroup
            title="Error kinds"
            values={facets?.errorKinds ?? []}
            selected={filters.errorKinds}
            onToggle={(value) => toggleFacetFilter("errorKinds", value)}
            emptyLabel="No error kinds match the current filters."
          />

          <FilterPanel
            title="Tools"
            meta={toolFacetMeta}
          >
            <Input
              value={toolFacetQuery}
              onChange={(event) => setToolFacetQuery(event.target.value)}
              placeholder="Search tools"
            />
            {toolFacetValues.length > 0 ? (
              <div className="analytics-filter-chip-cluster">
                {toolFacetValues.map((value) => (
                  <FilterChip
                    key={value.value}
                    active={filters.toolNames.includes(value.value)}
                    label={value.value}
                    count={value.count}
                    onClick={() => toggleFacetFilter("toolNames", value.value)}
                  />
                ))}
              </div>
            ) : (
              <div className="analytics-filter-note">No tools match this filter.</div>
            )}
          </FilterPanel>

          <FacetFilterGroup
            title="Keyword categories"
            values={facets?.keywordCategories ?? []}
            selected={filters.keywordCategories}
            onToggle={(value) => toggleFacetFilter("keywordCategories", value)}
            emptyLabel="No keyword categories match the current filters."
          />

          <FilterPanel
            title="Sessions"
            meta={sessionFacetMeta}
          >
            <Input
              value={sessionFacetQuery}
              onChange={(event) => setSessionFacetQuery(event.target.value)}
              placeholder="Search session ids"
            />
            {sessionFacetValues.length > 0 ? (
              <div className="analytics-filter-scroll max-h-72 space-y-2">
                {sessionFacetValues.map((session) => (
                  <FilterChip
                    key={session.value}
                    active={filters.sessionIds.includes(session.value)}
                    label={session.value}
                    count={session.count}
                    onClick={() => toggleFacetFilter("sessionIds", session.value)}
                  />
                ))}
              </div>
            ) : (
              <div className="analytics-filter-note">No sessions match this filter.</div>
            )}
          </FilterPanel>
        </aside>

        <div className="min-w-0 space-y-8">
          <div id="analytics-summary" className="space-y-4">
            <div className="space-y-3">
              <div>
                <div className="text-sm font-medium text-slate-900">Summary</div>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Filter-aware totals, spend, and context estimates for the currently selected dashboard slice.
                </p>
              </div>
              <ActiveFilterSummary
                filters={filters}
                onClearValue={clearSingleFilter}
                onClearAll={clearAllFilters}
              />
              {sessionTypeValues.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                    Session type
                  </span>
                  <FilterChip
                    active={filters.traceKinds.length === 0}
                    label="all"
                    onClick={() => setFilters((current) => ({ ...current, traceKinds: [] }))}
                  />
                  {sessionTypeValues.map((value) => (
                    <FilterChip
                      key={value.value}
                      active={filters.traceKinds.includes(value.value)}
                      label={value.value}
                      count={value.count}
                      onClick={() => toggleFacetFilter("traceKinds", value.value)}
                    />
                  ))}
                </div>
              ) : null}
            </div>

            {overview ? <CompactStatGrid items={statItems} /> : null}
          </div>

          <div id="analytics-trends" className="space-y-4">
            <div>
              <div className="text-sm font-medium text-slate-900">Trends</div>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Full-width charting for cost, tokens, traces, errors, and keyword incidents over the filtered time window.
              </p>
            </div>
            <AnalyticsTimeseries
              points={timeseries?.points ?? []}
              metrics={selectedMetrics}
              loading={loading}
              error={error}
            />
          </div>

          <div id="analytics-tools" className="space-y-4">
            <div>
              <div className="text-sm font-medium text-slate-900">Tool reliability</div>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Per-tool failure rates for the same filtered dashboard slice. Session type, tool, error, and session-family filters apply here too.
              </p>
            </div>
            <AnalyticsToolTable
              rows={toolPerformance?.rows ?? []}
              loading={loading}
              error={error}
              availableTraceKinds={sessionTypeValues}
              selectedTraceKinds={filters.traceKinds}
              onToggleTraceKind={(value) => toggleFacetFilter("traceKinds", value)}
              onSelectTool={setSelectedTool}
            />
          </div>

          <div id="analytics-traces" className="space-y-4">
            <div>
              <div className="text-sm font-medium text-slate-900">Traces</div>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Investigate the exact interactions behind the current dashboard slice and open any trace for drilldown details.
              </p>
            </div>
            <AnalyticsTraceTable
              traces={traces?.traces ?? []}
              loading={loading}
              error={error}
              query={traceQuery}
              onQueryChange={setTraceQuery}
              onSelectTrace={setSelectedTrace}
            />
          </div>
        </div>
      </div>

      <AnalyticsDrawer
        trace={selectedTrace}
        onClose={() => setSelectedTrace(null)}
      />
      <AnalyticsToolDrawer
        tool={selectedTool}
        queryString={analyticsQueryString}
        onClose={() => setSelectedTool(null)}
      />
    </section>
  );
}
