import { useEffect, useState, type ReactNode } from "react";
import type {
  AnalyticsSessionDetailResponse,
  AnalyticsTraceDetailResponse,
  AnalyticsTraceSummary,
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

export function AnalyticsDrawer(props: {
  trace: AnalyticsTraceSummary | null;
  onClose: () => void;
}) {
  const [traceDetail, setTraceDetail] = useState<AnalyticsTraceDetailResponse | null>(null);
  const [sessionDetail, setSessionDetail] = useState<AnalyticsSessionDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!props.trace) {
      setTraceDetail(null);
      setSessionDetail(null);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    Promise.all([
      fetchJson<AnalyticsTraceDetailResponse>(
        `/api/v1/analytics/traces/${encodeURIComponent(props.trace.traceId)}`,
        controller.signal
      ),
      fetchJson<AnalyticsSessionDetailResponse>(
        `/api/v1/analytics/sessions/${encodeURIComponent(props.trace.sessionId)}`,
        controller.signal
      ),
    ])
      .then(([nextTraceDetail, nextSessionDetail]) => {
        setTraceDetail(nextTraceDetail);
        setSessionDetail(nextSessionDetail);
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
  }, [props.trace]);

  return (
    <ModalSurface
      open={Boolean(props.trace)}
      title={props.trace?.traceId ?? "Analytics trace"}
      description={props.trace ? "Interaction drilldown across derived requests, tools, errors, and session context." : undefined}
      onClose={props.onClose}
    >
      <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
        {loading ? (
          <InlineState
            variant="neutral"
            title="Loading trace drilldown"
            detail="Fetching trace and session analytics."
          />
        ) : null}

        {error ? (
          <InlineState
            variant="error"
            title="Could not load analytics drilldown"
            detail={error}
          />
        ) : null}

        {traceDetail ? (
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-4">
              <Stat label="Errors" value={formatNumber(traceDetail.trace.errors)} />
              <Stat label="Keywords" value={formatNumber(traceDetail.trace.keywordMentions)} />
              <Stat label="Tools" value={formatNumber(traceDetail.trace.toolUses)} />
              <Stat label="Tokens" value={formatNumber(traceDetail.trace.inputTokens + traceDetail.trace.outputTokens)} />
            </div>

            <Section title="Requests">
              {traceDetail.requests.length > 0 ? (
                <div className="space-y-2">
                  {traceDetail.requests.map((request) => (
                    <div key={request.requestId} className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-medium text-slate-900">
                          {request.model ?? "Unknown model"}
                        </div>
                        <div className="text-xs text-slate-500">
                          {formatTimestamp(request.timestamp ?? undefined)}
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge variant="outline">in {formatNumber(request.inputTokens)}</Badge>
                        <Badge variant="outline">out {formatNumber(request.outputTokens)}</Badge>
                        <Badge variant="outline">ctx {formatNumber(request.contextEstimateTokens)}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyLine label="No request rows for this trace." />
              )}
            </Section>

            <Section title="Tool calls">
              {traceDetail.toolCalls.length > 0 ? (
                <div className="space-y-2">
                  {traceDetail.toolCalls.map((toolCall) => (
                    <div key={toolCall.toolCallId} className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-medium text-slate-900">{toolCall.toolName}</div>
                        <Badge variant={toolCall.isError ? "destructive" : "outline"}>
                          {toolCall.isError ? "Error" : "OK"}
                        </Badge>
                      </div>
                      <div className="mt-2 text-xs text-slate-500">
                        {formatTimestamp(toolCall.startedAt ?? undefined)}
                        {toolCall.finishedAt ? ` to ${formatTimestamp(toolCall.finishedAt)}` : ""}
                      </div>
                      {toolCall.errorMessage ? (
                        <div className="mt-2 text-sm text-rose-600">{toolCall.errorMessage}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyLine label="No tool calls for this trace." />
              )}
            </Section>

            <Section title="Errors and keywords">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-2">
                  {traceDetail.errors.length > 0 ? (
                    traceDetail.errors.map((errorItem) => (
                      <div key={errorItem.errorId} className="rounded-xl border border-rose-200 bg-rose-50/70 p-3">
                        <div className="text-sm font-medium text-rose-900">{errorItem.errorKind}</div>
                        <div className="mt-1 text-sm text-rose-700">{errorItem.message}</div>
                      </div>
                    ))
                  ) : (
                    <EmptyLine label="No error rows." />
                  )}
                </div>
                <div className="space-y-2">
                  {traceDetail.keywordMentions.length > 0 ? (
                    traceDetail.keywordMentions.map((mention) => (
                      <div key={mention.mentionId} className="rounded-xl border border-amber-200 bg-amber-50/70 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="warning">{mention.category}</Badge>
                          <span className="text-sm font-medium text-amber-900">{mention.term}</span>
                        </div>
                        <div className="mt-2 text-sm text-amber-800">{mention.matchedText}</div>
                      </div>
                    ))
                  ) : (
                    <EmptyLine label="No keyword hits in this trace." />
                  )}
                </div>
              </div>
            </Section>

            {sessionDetail ? (
              <Section title="Session context">
                <div className="grid gap-3 md:grid-cols-4">
                  <Stat label="Session traces" value={formatNumber(sessionDetail.traceCount)} />
                  <Stat label="Session errors" value={formatNumber(sessionDetail.totals.errors)} />
                  <Stat label="Session keywords" value={formatNumber(sessionDetail.totals.keywordMentions)} />
                  <Stat label="Session tools" value={formatNumber(sessionDetail.totals.toolUses)} />
                </div>
                {sessionDetail.subagents.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {sessionDetail.subagents.map((subagent) => (
                      <Badge key={`${subagent.sessionId}-${subagent.slug}`} variant="outline">
                        {subagent.slug ?? subagent.agentId ?? subagent.sessionId}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </Section>
            ) : null}
          </div>
        ) : null}
      </div>
    </ModalSurface>
  );
}

function Section(props: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="text-sm font-medium text-slate-900">{props.title}</div>
      {props.children}
    </div>
  );
}

function Stat(props: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">{props.label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-950">{props.value}</div>
    </div>
  );
}

function EmptyLine(props: { label: string }) {
  return <div className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-400">{props.label}</div>;
}
