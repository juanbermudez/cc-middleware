import { useMemo, useState } from "react";
import type {
  AnalyticsFacetValue,
  AnalyticsToolPerformanceRow,
} from "../lib/playground";
import { formatNumber, formatTimestamp } from "../lib/utils";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { InlineState } from "./playground-ui";

type ToolSortKey = "toolName" | "errorRate" | "scope" | "topError" | "lastSeen";
type SortDirection = "asc" | "desc";

function formatPercent(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "percent",
    maximumFractionDigits: value >= 0.1 ? 0 : 1,
  }).format(value);
}

function getRateTone(rate: number): {
  badge: "destructive" | "warning" | "info" | "success";
} {
  if (rate >= 0.5) {
    return { badge: "destructive" };
  }

  if (rate >= 0.15) {
    return { badge: "warning" };
  }

  return { badge: "success" };
}

function compareStrings(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

function compareNullableDates(a: string | null, b: string | null): number {
  const aTime = a ? Date.parse(a) : 0;
  const bTime = b ? Date.parse(b) : 0;
  return aTime - bTime;
}

function nextSortState(
  currentKey: ToolSortKey,
  currentDirection: SortDirection,
  nextKey: ToolSortKey
): { key: ToolSortKey; direction: SortDirection } {
  if (currentKey === nextKey) {
    return { key: nextKey, direction: currentDirection === "desc" ? "asc" : "desc" };
  }

  return {
    key: nextKey,
    direction: nextKey === "toolName" ? "asc" : "desc",
  };
}

function SortHeader(props: {
  label: string;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
  align?: "left" | "right";
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`analytics-table-sort ${
        props.align === "right" ? "analytics-table-sort-right" : ""
      }`}
    >
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

export function AnalyticsToolTable(props: {
  rows: AnalyticsToolPerformanceRow[];
  loading?: boolean;
  error?: string | null;
  availableTraceKinds: AnalyticsFacetValue[];
  selectedTraceKinds: string[];
  onToggleTraceKind: (value: string) => void;
  onSelectTool: (tool: AnalyticsToolPerformanceRow) => void;
}) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<ToolSortKey>("errorRate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return props.rows;
    }

    return props.rows.filter((row) =>
      [row.toolName, row.topErrorKind ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(normalized)
    );
  }, [props.rows, query]);

  const sortedRows = useMemo(() => {
    const rows = [...filteredRows];
    rows.sort((left, right) => {
      const direction = sortDirection === "desc" ? -1 : 1;
      let comparison = 0;

      switch (sortKey) {
        case "toolName":
          comparison = compareStrings(left.toolName, right.toolName);
          break;
        case "errorRate":
          comparison = left.errorRate - right.errorRate;
          if (comparison === 0) {
            comparison = left.errorCount - right.errorCount;
          }
          break;
        case "scope":
          comparison = left.sessionCount - right.sessionCount;
          if (comparison === 0) {
            comparison = left.traceCount - right.traceCount;
          }
          if (comparison === 0) {
            comparison = left.callCount - right.callCount;
          }
          break;
        case "topError":
          comparison = left.topErrorCount - right.topErrorCount;
          if (comparison === 0) {
            comparison = compareStrings(left.topErrorKind ?? "", right.topErrorKind ?? "");
          }
          break;
        case "lastSeen":
          comparison = compareNullableDates(left.lastSeenAt, right.lastSeenAt);
          break;
      }

      if (comparison === 0) {
        comparison = compareStrings(left.toolName, right.toolName);
      }

      return comparison * direction;
    });

    return rows;
  }, [filteredRows, sortDirection, sortKey]);

  const totals = useMemo(() => {
    return sortedRows.reduce(
      (summary, row) => {
        summary.calls += row.callCount;
        summary.failures += row.errorCount;
        return summary;
      },
      { calls: 0, failures: 0 }
    );
  }, [sortedRows]);

  if (props.error) {
    return (
      <InlineState
        variant="error"
        title="Could not load tool reliability"
        detail={props.error}
      />
    );
  }

  if (!props.loading && props.rows.length === 0) {
    return (
      <InlineState
        variant="neutral"
        title="No tool calls match the current filters"
        detail="Widen the time range or session filters to inspect tool-level failure rates."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            Session type
          </span>
          {props.availableTraceKinds.map((entry) => {
            const active = props.selectedTraceKinds.includes(entry.value);
            return (
              <button
                key={entry.value}
                type="button"
                onClick={() => props.onToggleTraceKind(entry.value)}
                className={`rounded-full border px-3 py-1.5 text-left text-sm transition ${
                  active
                    ? "border-sky-300 bg-sky-50 text-sky-700"
                    : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700"
                }`}
              >
                <span>{entry.value}</span>
                <span className="ml-1.5 text-xs text-slate-400">{entry.count}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{formatNumber(sortedRows.length)} tools</Badge>
          <Badge variant="outline">{formatNumber(totals.calls)} calls</Badge>
          <Badge variant={totals.failures > 0 ? "warning" : "success"}>
            {formatNumber(totals.failures)} failures
          </Badge>
        </div>
      </div>

      <div className="w-full max-w-sm">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search tools or error kinds"
        />
      </div>

      <div className="analytics-table-shell">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="analytics-table-head">
              <tr className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                <th className="px-3 py-2.5 font-medium">
                  <SortHeader
                    label="Tool"
                    active={sortKey === "toolName"}
                    direction={sortDirection}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDirection, "toolName");
                      setSortKey(next.key);
                      setSortDirection(next.direction);
                    }}
                  />
                </th>
                <th className="px-3 py-2.5 font-medium">
                  <SortHeader
                    label="Error rate"
                    active={sortKey === "errorRate"}
                    direction={sortDirection}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDirection, "errorRate");
                      setSortKey(next.key);
                      setSortDirection(next.direction);
                    }}
                  />
                </th>
                <th className="px-3 py-2.5 font-medium">
                  <SortHeader
                    label="Scope"
                    active={sortKey === "scope"}
                    direction={sortDirection}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDirection, "scope");
                      setSortKey(next.key);
                      setSortDirection(next.direction);
                    }}
                  />
                </th>
                <th className="px-3 py-2.5 font-medium">
                  <SortHeader
                    label="Top error"
                    active={sortKey === "topError"}
                    direction={sortDirection}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDirection, "topError");
                      setSortKey(next.key);
                      setSortDirection(next.direction);
                    }}
                  />
                </th>
                <th className="px-3 py-2.5 font-medium">
                  <SortHeader
                    label="Last seen"
                    active={sortKey === "lastSeen"}
                    direction={sortDirection}
                    onClick={() => {
                      const next = nextSortState(sortKey, sortDirection, "lastSeen");
                      setSortKey(next.key);
                      setSortDirection(next.direction);
                    }}
                    align="right"
                  />
                </th>
              </tr>
            </thead>
            <tbody className="analytics-table-body">
              {sortedRows.length > 0 ? (
                sortedRows.map((row) => {
                  const tone = getRateTone(row.errorRate);
                  const failedCallsLabel = `${formatNumber(row.errorCount)} failed call${row.errorCount === 1 ? "" : "s"} out of ${formatNumber(row.callCount)}`;

                  return (
                    <tr
                      key={row.toolName}
                      role="button"
                      tabIndex={0}
                      title={`Open ${row.toolName} failure drilldown`}
                      onClick={() => props.onSelectTool(row)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          props.onSelectTool(row);
                        }
                      }}
                      className="analytics-table-row cursor-pointer align-top"
                    >
                      <td className="px-3 py-3 text-sm">
                        <div className="space-y-1">
                          <div className="font-medium text-slate-900">{row.toolName}</div>
                          <div className="analytics-table-meta text-xs">{formatNumber(row.callCount)} calls</div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-sm text-slate-600">
                        <Badge variant={tone.badge} title={failedCallsLabel}>
                          {formatPercent(row.errorRate)}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-sm text-slate-600">
                        <div>{formatNumber(row.sessionCount)} sessions</div>
                        <div className="analytics-table-meta text-xs">
                          {formatNumber(row.traceCount)} traces
                        </div>
                      </td>
                      <td className="px-3 py-3 text-sm text-slate-600">
                        {row.topErrorKind ? (
                          <div>
                            <Badge variant="outline">{row.topErrorKind}</Badge>
                          </div>
                        ) : (
                          <span className="analytics-table-meta text-xs">
                            No tool-specific errors recorded
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-sm text-slate-600">
                        {formatTimestamp(row.lastSeenAt ?? undefined)}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="px-4 py-5">
                    <InlineState
                      variant="neutral"
                      title="No tools match this search"
                      detail="Clear the search or widen the dashboard filters to inspect more tool traffic."
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
