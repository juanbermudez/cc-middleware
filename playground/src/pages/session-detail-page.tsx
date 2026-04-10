import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Copy } from "lucide-react";
import { Button } from "../components/ui/button";
import { InlineState } from "../components/playground-ui";
import { SessionDetailSidebar } from "../components/session-detail-sidebar";
import type {
  SessionDetailResponse,
  SessionDetailTranscriptMessage,
  SessionDetailTranscriptTurn,
} from "../lib/playground";
import {
  normalizeApiSessionDetailResponse,
  type ApiSessionDetailResponse,
} from "../lib/session-detail";
import { formatNumber, formatTimestamp, truncate } from "../lib/utils";

async function fetchJson<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${text}`.trim());
  }
  return response.json() as Promise<T>;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${text}`.trim());
  }

  return response.json() as Promise<T>;
}

interface SessionLaunchResponse {
  sessionId: string;
  result?: string;
  errors?: string[];
  isError?: boolean;
}

function toLaunchableModel(model: string | undefined): string | undefined {
  if (!model) {
    return undefined;
  }

  const trimmed = model.trim();
  if (!trimmed) {
    return undefined;
  }

  if (trimmed.toLowerCase() === "synthetic" || /^<[^>]+>$/.test(trimmed)) {
    return undefined;
  }

  return trimmed;
}

function normalizeTranscript(detail: SessionDetailResponse | null): SessionDetailTranscriptMessage[] {
  if (!detail) {
    return [];
  }

  if (detail.transcript && detail.transcript.length > 0) {
    return detail.transcript;
  }

  if (detail.messages && detail.messages.length > 0) {
    return detail.messages;
  }

  if (detail.turns && detail.turns.length > 0) {
    return detail.turns.flatMap((turn) => {
      if (turn.messages && turn.messages.length > 0) {
        return turn.messages;
      }

      if (!turn.content && !turn.title) {
        return [];
      }

      return [
        {
          id: turn.id,
          role: turn.role,
          timestamp: turn.timestamp ?? null,
          title: turn.title,
          content: turn.content,
        },
      ];
    });
  }

  return [];
}

function normalizeTranscriptTurns(detail: SessionDetailResponse | null): SessionDetailTranscriptTurn[] {
  if (!detail) {
    return [];
  }

  if (detail.turns && detail.turns.length > 0) {
    return detail.turns;
  }

  const messages = normalizeTranscript(detail);
  if (messages.length === 0) {
    return [];
  }

  return [{
    id: `${detail.sessionId}:transcript`,
    role: "assistant",
    timestamp: messages[0]?.timestamp ?? null,
    title: "Transcript",
    summary: detail.summary,
    messages,
  }];
}

export function SessionDetailPage(props: {
  sessionId?: string;
  activeSection?: string;
  onBackToSessions: () => void;
  onOpenSessionDetail: (sessionId: string) => void;
}) {
  const sessionId = props.sessionId?.trim() ?? "";
  const [detail, setDetail] = useState<SessionDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshRevision, setRefreshRevision] = useState(0);
  const [composerMessage, setComposerMessage] = useState("");
  const [composerPendingAction, setComposerPendingAction] = useState<"resume" | "restart" | null>(null);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [composerResult, setComposerResult] = useState<SessionLaunchResponse | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setDetail(null);
      setError("No session id was provided in the route.");
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    setLoading(true);
    setError(null);

    fetchJson<ApiSessionDetailResponse>(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}/detail`,
      controller.signal
    )
      .then((nextDetail) => {
        setDetail(normalizeApiSessionDetailResponse(nextDetail));
      })
      .catch((fetchError: unknown) => {
        if ((fetchError as { name?: string }).name === "AbortError") {
          return;
        }

        setDetail(null);
        setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [refreshRevision, sessionId]);

  useEffect(() => {
    setComposerMessage("");
    setComposerError(null);
    setComposerResult(null);
  }, [sessionId]);

  async function submitComposer(action: "resume" | "restart") {
    const prompt = composerMessage.trim();
    const model = toLaunchableModel(detail?.model);
    if (!prompt) {
      setComposerError("Write a message before sending it to the session.");
      return;
    }

    if (action === "restart" && !detail?.cwd) {
      setComposerError("This session does not expose a working directory, so a fresh restart is unavailable.");
      return;
    }

    setComposerPendingAction(action);
    setComposerError(null);
    setComposerResult(null);

    try {
      const response = action === "resume"
        ? await postJson<SessionLaunchResponse>(
            `/api/v1/sessions/${encodeURIComponent(sessionId)}/resume`,
            {
              prompt,
              ...(model ? { model } : {}),
            }
          )
        : await postJson<SessionLaunchResponse>(
            "/api/v1/sessions",
            {
              prompt,
              cwd: detail?.cwd,
              ...(model ? { model } : {}),
            }
          );

      setComposerResult(response);
      setComposerMessage("");

      if (response.sessionId && response.sessionId !== sessionId) {
        props.onOpenSessionDetail(response.sessionId);
        return;
      }

      setRefreshRevision((current) => current + 1);
    } catch (submitError) {
      setComposerError(submitError instanceof Error ? submitError.message : String(submitError));
    } finally {
      setComposerPendingAction(null);
    }
  }

  const transcript = useMemo(() => normalizeTranscript(detail), [detail]);
  const transcriptTurns = useMemo(() => normalizeTranscriptTurns(detail), [detail]);
  const title = detail?.title ?? detail?.summary ?? sessionId ?? "Session detail";
  const subtitle = detail?.summary
    ? detail.summary
    : detail?.project
      ? `${detail.project}${detail.gitBranch ? ` · ${detail.gitBranch}` : ""}`
      : "Transcript and inspector for the selected session.";
  const totals = detail?.totals;
  const recentFiles = detail?.files?.slice(0, 6) ?? [];
  const recentErrors = detail?.errors?.slice(0, 4) ?? [];
  const recentSubagents = detail?.subagents?.slice(0, 4) ?? [];
  const sessionFacts: Array<{ label: string; value?: string }> = [
    { label: "Session id", value: detail?.sessionId },
    { label: "Project", value: detail?.project },
    { label: "CWD", value: detail?.cwd },
    { label: "Branch", value: detail?.gitBranch },
    { label: "Model", value: detail?.model },
    { label: "Session type", value: detail?.status },
    { label: "Started", value: detail?.startedAt ? formatTimestamp(detail.startedAt) : undefined },
    { label: "Updated", value: detail?.updatedAt ? formatTimestamp(detail.updatedAt) : undefined },
    { label: "Parent", value: detail?.parentSessionId },
  ].filter((entry) => Boolean(entry.value));
  const activityRows: Array<{ label: string; value: string; detail?: string }> = [
    {
      label: "Messages",
      value: formatNumber(totals?.messages),
      detail: totals?.assistantMessages !== undefined && totals?.userMessages !== undefined
        ? `${formatNumber(totals.userMessages)} user · ${formatNumber(totals.assistantMessages)} assistant`
        : undefined,
    },
    {
      label: "Tool calls",
      value: formatNumber(totals?.tools),
      detail: totals?.toolMessages ? `${formatNumber(totals.toolMessages)} log items` : undefined,
    },
    {
      label: "Errors",
      value: formatNumber(totals?.errors),
      detail: recentErrors[0]?.kind ? `latest ${recentErrors[0].kind}` : undefined,
    },
    {
      label: "Files",
      value: formatNumber(totals?.files),
      detail: recentFiles[0]?.path ? truncate(recentFiles[0].path, 38) : undefined,
    },
    {
      label: "Skills",
      value: formatNumber(totals?.skills),
      detail: detail?.skills?.[0]?.name,
    },
    {
      label: "Subagents",
      value: formatNumber(totals?.subagents),
      detail: recentSubagents[0]?.title ?? recentSubagents[0]?.agentId,
    },
  ];

  return (
    <section className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] themed-subtle">
            Session detail
          </div>
          <div className="space-y-3">
            <h1 className="text-3xl font-semibold tracking-tight themed-title md:text-4xl">
              {title}
            </h1>
            <p className="max-w-4xl text-sm leading-7 themed-body">
              {subtitle}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs themed-muted">
            {detail?.project ? <span>{detail.project}</span> : null}
            {detail?.gitBranch ? <span>{detail.gitBranch}</span> : null}
            {detail?.model ? <span>{detail.model}</span> : null}
            {detail?.startedAt ? <span>Started {formatTimestamp(detail.startedAt)}</span> : null}
            {detail?.updatedAt ? <span>Updated {formatTimestamp(detail.updatedAt)}</span> : null}
            {detail?.parentSessionId ? <span>Parent {detail.parentSessionId}</span> : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={props.onBackToSessions}>
            <ArrowLeft className="h-4 w-4" />
            Sessions
          </Button>
          {detail?.sessionId ? (
            <Button
              variant="ghost"
              onClick={() => navigator.clipboard.writeText(detail.sessionId)}
            >
              <Copy className="h-4 w-4" />
              Copy id
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <InlineState
          variant="error"
          title="Could not load session detail"
          detail={error}
        />
      ) : null}

      {loading ? (
        <InlineState
          variant="neutral"
          title="Loading session detail"
          detail="Fetching transcript, configuration, files, tools, and subagent lineage."
        />
      ) : null}

      {!loading && !error && detail ? (
        <div className="grid gap-8 xl:items-stretch xl:grid-cols-[minmax(0,1fr)_520px] 2xl:grid-cols-[minmax(0,1fr)_580px]">
          <div className="min-w-0 space-y-8">
            <section className="space-y-4 border-y themed-border py-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] themed-subtle">
                Session overview
              </div>
              <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
                {sessionFacts.map((fact) => (
                  <div key={fact.label} className="space-y-1">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] themed-subtle">
                      {fact.label}
                    </div>
                    <div className="text-sm leading-6 themed-title">
                      {fact.value}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-4 border-b themed-border pb-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] themed-subtle">
                Activity overview
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {activityRows.map((row) => (
                  <div key={row.label} className="space-y-1 border-t themed-border pt-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] themed-subtle">
                      {row.label}
                    </div>
                    <div className="text-2xl font-semibold tracking-tight themed-title">
                      {row.value}
                    </div>
                    {row.detail ? (
                      <div className="text-sm leading-6 themed-muted">
                        {row.detail}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>

            <section className="grid gap-8 lg:grid-cols-2">
              <div className="space-y-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] themed-subtle">
                  Recent files
                </div>
                <div className="divide-y divide-[color:var(--panel-border)] border-t themed-border">
                  {recentFiles.length > 0 ? recentFiles.map((file) => (
                    <div key={file.path} className="space-y-1 py-3">
                      <div className="text-sm font-medium themed-title">
                        {truncate(file.path, 76)}
                      </div>
                      <div className="text-xs leading-5 themed-muted">
                        {[file.status, file.count ? `${formatNumber(file.count)} touches` : null, file.timestamp ? formatTimestamp(file.timestamp) : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </div>
                  )) : (
                    <div className="py-3 text-sm leading-6 themed-muted">
                      No file changes were derived for this session.
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] themed-subtle">
                  Error signals
                </div>
                <div className="divide-y divide-[color:var(--panel-border)] border-t themed-border">
                  {recentErrors.length > 0 ? recentErrors.map((errorEntry) => (
                    <div key={errorEntry.errorId} className="space-y-1 py-3">
                      <div className="text-sm font-medium themed-error-ink">
                        {errorEntry.message}
                      </div>
                      <div className="text-xs leading-5 themed-muted">
                        {[errorEntry.kind, errorEntry.toolName ? `tool ${errorEntry.toolName}` : null, errorEntry.timestamp ? formatTimestamp(errorEntry.timestamp) : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </div>
                  )) : (
                    <div className="py-3 text-sm leading-6 themed-muted">
                      No errors were captured for this session.
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className="space-y-4 border-t themed-border pt-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] themed-subtle">
                Lineage
              </div>
              <div className="divide-y divide-[color:var(--panel-border)] border-t themed-border">
                {recentSubagents.length > 0 ? recentSubagents.map((subagent) => (
                  <button
                    key={subagent.sessionId}
                    type="button"
                    onClick={() => props.onOpenSessionDetail(subagent.sessionId)}
                    className="themed-hover-fill flex w-full items-start justify-between gap-4 py-3 text-left"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="text-sm font-medium themed-title">
                        {subagent.title ?? subagent.agentId ?? subagent.sessionId}
                      </div>
                      <div className="text-xs leading-5 themed-muted">
                        {[subagent.agentId ? `agent ${subagent.agentId}` : null, subagent.startedAt ? formatTimestamp(subagent.startedAt) : null, subagent.messageCount ? `${formatNumber(subagent.messageCount)} messages` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </div>
                    <div className="shrink-0 text-[11px] uppercase tracking-[0.16em] themed-subtle">
                      Open
                    </div>
                  </button>
                )) : (
                  <div className="py-3 text-sm leading-6 themed-muted">
                    This session does not currently expose subagent lineage.
                  </div>
                )}
              </div>
            </section>
          </div>

          <SessionDetailSidebar
            detail={detail}
            transcript={transcript}
            transcriptTurns={transcriptTurns}
            onOpenSessionDetail={props.onOpenSessionDetail}
            composerMessage={composerMessage}
            composerPendingAction={composerPendingAction}
            composerError={composerError}
            composerResult={composerResult?.isError ? {
              variant: composerResult.isError ? "error" : "neutral",
              title: composerResult.isError ? "Session run returned an error" : "Message sent",
              detail: composerResult.result
                ? composerResult.result
                : composerResult.errors?.join(" · ") ?? `Session ${composerResult.sessionId} finished.`,
            } : null}
            onComposerMessageChange={setComposerMessage}
            onResumeSession={() => void submitComposer("resume")}
            onRestartSession={() => void submitComposer("restart")}
          />
        </div>
      ) : null}

      {!loading && !error && !detail ? (
        <InlineState
          variant="neutral"
          title="No session detail found"
          detail="The session detail endpoint returned no data for this session id."
        />
      ) : null}
    </section>
  );
}
