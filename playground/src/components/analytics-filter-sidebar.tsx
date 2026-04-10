import type { AnalyticsFacetsResponse, AnalyticsStatusResponse } from "../lib/playground";
import { cn } from "../lib/utils";
import type { AnalyticsMetricKey } from "./analytics-timeseries";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Select } from "./ui/select";

export type AnalyticsRangePreset = "24h" | "7d" | "30d" | "all" | "custom";

export interface AnalyticsDashboardFilters {
  traceKinds: string[];
  sessionIds: string[];
  toolNames: string[];
  errorKinds: string[];
  keywordCategories: string[];
}

type FilterKey = keyof AnalyticsDashboardFilters;

function FilterButton(props: {
  label: string;
  count?: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left text-sm transition",
        props.selected
          ? "border-sky-300 bg-sky-50 text-sky-700"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
      )}
    >
      <span className="truncate">{props.label}</span>
      {props.count !== undefined ? (
        <span className={cn("shrink-0 text-xs", props.selected ? "text-sky-500" : "text-slate-400")}>
          {props.count}
        </span>
      ) : null}
    </button>
  );
}

function FilterGroup(props: {
  title: string;
  description: string;
  values: Array<{ value: string; count: number }>;
  selectedValues: string[];
  onToggle: (value: string) => void;
  maxVisible?: number;
}) {
  const maxVisible = props.maxVisible ?? props.values.length;
  const visibleValues = props.values.slice(0, maxVisible);

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
      <div className="space-y-1">
        <div className="text-sm font-medium text-slate-900">{props.title}</div>
        <p className="text-xs leading-5 text-slate-500">{props.description}</p>
      </div>
      {visibleValues.length > 0 ? (
        <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
          {visibleValues.map((item) => (
            <FilterButton
              key={`${props.title}-${item.value}`}
              label={item.value}
              count={item.count}
              selected={props.selectedValues.includes(item.value)}
              onClick={() => props.onToggle(item.value)}
            />
          ))}
        </div>
      ) : (
        <div className="text-sm text-slate-400">No values in the current slice.</div>
      )}
      {props.values.length > visibleValues.length ? (
        <div className="text-[11px] text-slate-400">
          Showing the top {visibleValues.length} values in this slice.
        </div>
      ) : null}
    </div>
  );
}

export function AnalyticsFilterSidebar(props: {
  facets: AnalyticsFacetsResponse | null;
  status: AnalyticsStatusResponse | null;
  actionState: string;
  rangePreset: AnalyticsRangePreset;
  customStart: string;
  customEnd: string;
  traceQuery: string;
  selectedMetrics: AnalyticsMetricKey[];
  filters: AnalyticsDashboardFilters;
  onRangePresetChange: (value: AnalyticsRangePreset) => void;
  onCustomStartChange: (value: string) => void;
  onCustomEndChange: (value: string) => void;
  onTraceQueryChange: (value: string) => void;
  onToggleMetric: (metric: AnalyticsMetricKey) => void;
  onToggleFilter: (key: FilterKey, value: string) => void;
  onClearFilters: () => void;
  onRefresh: () => void;
  onRunBackfill: () => void;
}) {
  const activeFilterCount = Object.values(props.filters).reduce(
    (count, values) => count + values.length,
    0
  ) + (props.traceQuery.trim() ? 1 : 0);

  return (
    <aside className="space-y-4 xl:sticky xl:top-8 xl:self-start">
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
        <div className="space-y-1">
          <div className="text-sm font-medium text-slate-900">Dashboard filters</div>
          <p className="text-xs leading-5 text-slate-500">
            Narrow the dashboard by range, trace shape, sessions, tools, errors, and keyword buckets.
          </p>
        </div>

        <div className="space-y-3">
          <Select value={props.rangePreset} onChange={(event) => props.onRangePresetChange(event.target.value as AnalyticsRangePreset)}>
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="all">All time</option>
            <option value="custom">Custom</option>
          </Select>
          <Input
            type="datetime-local"
            value={props.customStart}
            onChange={(event) => props.onCustomStartChange(event.target.value)}
            disabled={props.rangePreset !== "custom"}
          />
          <Input
            type="datetime-local"
            value={props.customEnd}
            onChange={(event) => props.onCustomEndChange(event.target.value)}
            disabled={props.rangePreset !== "custom"}
          />
          <Input
            value={props.traceQuery}
            onChange={(event) => props.onTraceQueryChange(event.target.value)}
            placeholder="Search trace ids, sessions, or summaries"
          />
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            <Button variant="secondary" onClick={props.onRefresh}>
              Refresh view
            </Button>
            <Button variant="secondary" onClick={props.onRunBackfill}>
              Run backfill
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["errors", "Errors"],
                ["keywordMentions", "Keywords"],
                ["estimatedCostUsd", "Cost"],
                ["inputTokens", "Input tokens"],
                ["outputTokens", "Output tokens"],
              ] as Array<[AnalyticsMetricKey, string]>
            ).map(([metric, label]) => (
              <button
                key={metric}
                type="button"
                onClick={() => props.onToggleMetric(metric)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm transition",
                  props.selectedMetrics.includes(metric)
                    ? "border-sky-300 bg-sky-50 text-sky-700"
                    : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="font-mono">
              {props.status?.dbPath ?? "Warehouse unavailable"}
            </Badge>
            {activeFilterCount > 0 ? (
              <Button variant="ghost" size="sm" onClick={props.onClearFilters} className="h-auto px-2 py-1 text-xs">
                Clear filters
              </Button>
            ) : null}
          </div>
          <div className="text-xs leading-5 text-slate-500">{props.actionState}</div>
        </div>
      </div>

      <FilterGroup
        title="Session type"
        description="Root sessions, subagents, or runtime-derived traces."
        values={props.facets?.traceKinds ?? []}
        selectedValues={props.filters.traceKinds}
        onToggle={(value) => props.onToggleFilter("traceKinds", value)}
      />
      <FilterGroup
        title="Error kinds"
        description="Filter down to API failures, tool errors, or other incident buckets."
        values={props.facets?.errorKinds ?? []}
        selectedValues={props.filters.errorKinds}
        onToggle={(value) => props.onToggleFilter("errorKinds", value)}
      />
      <FilterGroup
        title="Tools"
        description="Focus the dashboard on traces that used a specific tool."
        values={props.facets?.toolNames ?? []}
        selectedValues={props.filters.toolNames}
        onToggle={(value) => props.onToggleFilter("toolNames", value)}
        maxVisible={12}
      />
      <FilterGroup
        title="Keyword categories"
        description="Scope the dashboard to frustration, cursing, urgency, or other keyword classes."
        values={props.facets?.keywordCategories ?? []}
        selectedValues={props.filters.keywordCategories}
        onToggle={(value) => props.onToggleFilter("keywordCategories", value)}
      />
      <FilterGroup
        title="Sessions"
        description="Filter to the busiest sessions in the current slice."
        values={props.facets?.sessions ?? []}
        selectedValues={props.filters.sessionIds}
        onToggle={(value) => props.onToggleFilter("sessionIds", value)}
        maxVisible={10}
      />
    </aside>
  );
}
