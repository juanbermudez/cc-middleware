import { useMemo, useState } from "react";
import type { AnalyticsTraceSummary } from "../lib/playground";
import { formatNumber, formatTimestamp, truncate } from "../lib/utils";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { InlineState } from "./playground-ui";

type TraceSortKey = "trace" | "window" | "errors" | "keywords" | "tokens";
type SortDirection = "asc" | "desc";

function compareStrings(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

function compareNullableDates(a: string | null, b: string | null): number {
  const aTime = a ? Date.parse(a) : 0;
  const bTime = b ? Date.parse(b) : 0;
  return aTime - bTime;
}

function nextSortState(
  currentKey: TraceSortKey,
  currentDirection: SortDirection,
  nextKey: TraceSortKey
): { key: TraceSortKey; direction: SortDirection } {
  if (currentKey === nextKey) {
    return { key: nextKey, direction: currentDirection === "desc" ? "asc" : "desc" };
  }

  return {
    key: nextKey,
    direction: nextKey === "trace" ? "asc" : "desc",
  };
}

function SortHeader(props: {
  label: string;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={props.onClick} className="analytics-table-sort">
      <span>{props.label}</span>
      <span
        className={`analytics-table-sort-indicator ${
          props.active ? "analytics-table-sort-indicator-active" : ""
        }`}
        aria-hidden="true"
      >
        {props.active ? (props.direction === "desc" ? "↓" : "↑") : "↕"}
      </span>
    </button>
  );
}

export function AnalyticsTraceTable(props: {
  traces: AnalyticsTraceSummary[];
  loading?: boolean;
  error?: string | null;
  query: string;
  onQueryChange: (value: string) => void;
  onSelectTrace: (trace: AnalyticsTraceSummary) => void;
}) {
  const [sortKey, setSortKey] = useState<TraceSortKey>("window");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const filteredTraces = useMemo(() => {
    const normalized = props.query.trim().toLowerCase();
    if (!normalized) {
      return props.traces;
    }

    return props.traces.filter((trace) =>
      [
        trace.traceId,
        trace.sessionId,
        trace.traceKind,
        trace.summary,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalized)
    );
  }, [props.query, props.traces]);

  const sortedTraces = useMemo(() => {
    const traces = [...filteredTraces];
    traces.sort((left, right) => {
      const direction = sortDirection === "desc" ? -1 : 1;
      let comparison = 0;

      switch (sortKey) {
        case "trace":
          comparison = compareStrings(left.traceId, right.traceId);
          if (comparison === 0) {
            comparison = compareStrings(left.sessionId, right.sessionId);
          }
          break;
        case "window":
          comparison = compareNullableDates(left.startedAt, right.startedAt);
          if (comparison === 0) {
            comparison = compareNullableDates(left.endedAt, right.endedAt);
          }
          break;
        case "errors":
          comparison = left.errors - right.errors;
          break;
        case "keywords":
          comparison = left.keywordMentions - right.keywordMentions;
          break;
        case "tokens":
          comparison = (left.inputTokens + left.outputTokens) - (right.inputTokens + right.outputTokens);
          break;
      }

      if (comparison === 0) {
        comparison = compareNullableDates(left.startedAt, right.startedAt);
      }
      if (comparison === 0) {
        comparison = compareStrings(left.traceId, right.traceId);
      }

      return comparison * direction;
    });

    return traces;
  }, [filteredTraces, sortDirection, sortKey]);

  if (props.error) {
    return (
      <InlineState
        variant="error"
        title="Could not load analytics traces"
        detail={props.error}
      />
    );
  }

  if (!props.loading && props.traces.length === 0) {
    return (
      <InlineState
        variant="neutral"
        title="No traces match the current filters"
        detail="Adjust the time range or trace search to widen the result set."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="w-full max-w-sm">
          <Input
            value={props.query}
            onChange={(event) => props.onQueryChange(event.target.value)}
            placeholder="Search trace id, session, or summary"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{formatNumber(sortedTraces.length)} traces</Badge>
          <Badge variant="outline">
            {formatNumber(sortedTraces.reduce((total, trace) => total + trace.errors, 0))} errors
          </Badge>
          <Badge variant="outline">
            {formatNumber(
              sortedTraces.reduce((total, trace) => total + trace.inputTokens + trace.outputTokens, 0)
            )} tokens
          </Badge>
        </div>
      </div>

      <div className="analytics-table-shell">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="analytics-table-head">
              <tr className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                <th className="px-3 py-2.5 font-medium">
                  <SortHeader
                    label="Trace"
                    active={sortKey === "trace"}
                    direction={sortDirection}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDirection, "trace");
                      setSortKey(next.key);
                      setSortDirection(next.direction);
                    }}
                  />
                </th>
                <th className="px-3 py-2.5 font-medium">
                  <SortHeader
                    label="Window"
                    active={sortKey === "window"}
                    direction={sortDirection}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDirection, "window");
                      setSortKey(next.key);
                      setSortDirection(next.direction);
                    }}
                  />
                </th>
                <th className="px-3 py-2.5 font-medium">
                  <SortHeader
                    label="Errors"
                    active={sortKey === "errors"}
                    direction={sortDirection}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDirection, "errors");
                      setSortKey(next.key);
                      setSortDirection(next.direction);
                    }}
                  />
                </th>
                <th className="px-3 py-2.5 font-medium">
                  <SortHeader
                    label="Keywords"
                    active={sortKey === "keywords"}
                    direction={sortDirection}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDirection, "keywords");
                      setSortKey(next.key);
                      setSortDirection(next.direction);
                    }}
                  />
                </th>
                <th className="px-3 py-2.5 font-medium">
                  <SortHeader
                    label="Tokens"
                    active={sortKey === "tokens"}
                    direction={sortDirection}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDirection, "tokens");
                      setSortKey(next.key);
                      setSortDirection(next.direction);
                    }}
                  />
                </th>
                <th className="px-3 py-2.5 font-medium">Summary</th>
              </tr>
            </thead>
            <tbody className="analytics-table-body">
              {sortedTraces.length > 0 ? (
                sortedTraces.map((trace) => (
                  <tr
                    key={trace.traceId}
                    onClick={() => props.onSelectTrace(trace)}
                    className="analytics-table-row cursor-pointer align-top"
                  >
                    <td className="px-3 py-3 text-sm">
                      <div className="space-y-1">
                        <div className="font-medium text-slate-900">{trace.traceId}</div>
                        <div className="analytics-table-meta text-xs">{trace.sessionId}</div>
                        <div className="analytics-table-meta text-[11px] uppercase tracking-[0.16em]">
                          {trace.traceKind}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-sm text-slate-600">
                      <div>{formatTimestamp(trace.startedAt ?? undefined)}</div>
                      <div className="analytics-table-meta text-xs">
                        {trace.endedAt ? `to ${formatTimestamp(trace.endedAt)}` : "Open interval"}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-sm text-slate-600">
                      {formatNumber(trace.errors)}
                    </td>
                    <td className="px-3 py-3 text-sm text-slate-600">
                      {formatNumber(trace.keywordMentions)}
                    </td>
                    <td className="px-3 py-3 text-sm text-slate-600">
                      {formatNumber(trace.inputTokens + trace.outputTokens)}
                    </td>
                    <td className="px-3 py-3 text-sm text-slate-600">
                      {truncate(trace.summary, 160)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-5">
                    <InlineState
                      variant="neutral"
                      title="No traces match this search"
                      detail="Clear the trace search or widen the dashboard filters to inspect more interactions."
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
