import { useEffect, useState } from "react";
import type {
  AnalyticsToolPerformanceDetailResponse,
  AnalyticsToolPerformanceRow,
} from "../lib/playground";
import { formatNumber, formatTimestamp } from "../lib/utils";
import { Badge } from "./ui/badge";
import { InlineState, ModalSurface } from "./playground-ui";

async function fetchJson<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${text}`.trim());
  }
  return response.json() as Promise<T>;
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "percent",
    maximumFractionDigits: value >= 0.1 ? 0 : 1,
  }).format(value);
}

function getRateVariant(rate: number): "destructive" | "warning" | "info" | "success" {
  if (rate >= 0.5) {
    return "destructive";
  }
  if (rate >= 0.15) {
    return "warning";
  }
  if (rate > 0) {
    return "info";
  }
  return "success";
}

export function AnalyticsToolDrawer(props: {
  tool: AnalyticsToolPerformanceRow | null;
  queryString: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<AnalyticsToolPerformanceDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!props.tool) {
      setDetail(null);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const querySuffix = props.queryString ? `?${props.queryString}` : "";
    void fetchJson<AnalyticsToolPerformanceDetailResponse>(
      `/api/v1/analytics/tool-performance/${encodeURIComponent(props.tool.toolName)}${querySuffix}`,
      controller.signal
    )
      .then((nextDetail) => {
        setDetail(nextDetail);
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
  }, [props.queryString, props.tool]);

  return (
    <ModalSurface
      open={Boolean(props.tool)}
      title={props.tool?.toolName ?? "Tool detail"}
      description={props.tool ? "Failure drilldown for the current analytics slice." : undefined}
      onClose={props.onClose}
    >
      <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
        {loading ? (
          <InlineState
            variant="neutral"
            title="Loading tool drilldown"
            detail="Fetching recent failures and error breakdowns for this tool."
          />
        ) : null}

        {error ? (
          <InlineState
            variant="error"
            title="Could not load tool drilldown"
            detail={error}
          />
        ) : null}

        {detail ? (
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="analytics-drawer-stat">
                <div className="analytics-table-meta text-[11px] uppercase tracking-[0.16em]">Error rate</div>
                <div className="mt-1">
                  <Badge variant={getRateVariant(detail.tool.errorRate)}>
                    {formatPercent(detail.tool.errorRate)}
                  </Badge>
                </div>
              </div>
              <div className="analytics-drawer-stat">
                <div className="analytics-table-meta text-[11px] uppercase tracking-[0.16em]">Calls</div>
                <div className="mt-1 text-lg font-semibold text-slate-950">
                  {formatNumber(detail.tool.callCount)}
                </div>
              </div>
              <div className="analytics-drawer-stat">
                <div className="analytics-table-meta text-[11px] uppercase tracking-[0.16em]">Failures</div>
                <div className="mt-1 text-lg font-semibold text-slate-950">
                  {formatNumber(detail.tool.errorCount)}
                </div>
              </div>
              <div className="analytics-drawer-stat">
                <div className="analytics-table-meta text-[11px] uppercase tracking-[0.16em]">Coverage</div>
                <div className="mt-1 text-lg font-semibold text-slate-950">
                  {formatNumber(detail.tool.sessionCount)} sessions
                </div>
                <div className="analytics-table-meta text-xs">
                  {formatNumber(detail.tool.traceCount)} traces
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="text-sm font-medium text-slate-900">Error kinds</div>
              {detail.errorKinds.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {detail.errorKinds.map((entry) => (
                    <Badge key={entry.value} variant="outline">
                      {entry.value} {entry.count}
                    </Badge>
                  ))}
                </div>
              ) : (
                <div className="analytics-drawer-empty">No error kinds recorded for this tool in the current slice.</div>
              )}
            </div>

            <div className="space-y-3">
              <div className="text-sm font-medium text-slate-900">Recent failures</div>
              {detail.recentFailures.length > 0 ? (
                <div className="space-y-2">
                  {detail.recentFailures.map((failure) => (
                    <div key={failure.errorId} className="analytics-drawer-error-card">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="destructive">{failure.errorKind}</Badge>
                          {failure.errorCode ? <Badge variant="outline">{failure.errorCode}</Badge> : null}
                        </div>
                        <div className="analytics-table-meta text-xs">
                          {formatTimestamp(failure.timestamp ?? undefined)}
                        </div>
                      </div>
                      <div className="mt-3 text-sm leading-6 text-slate-700">
                        {failure.message}
                      </div>
                      <div className="analytics-table-meta mt-3 flex flex-wrap gap-2 text-xs">
                        <span>Session {failure.sessionId}</span>
                        <span>Trace {failure.traceId}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="analytics-drawer-empty">No failure details are available for this tool in the current slice.</div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </ModalSurface>
  );
}
