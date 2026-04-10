import { ArrowUpRight, RotateCcw, Send } from "lucide-react";
import type { ReactNode } from "react";
import { InlineState } from "./playground-ui";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { SessionDetailTranscript } from "./session-detail-transcript";
import type {
  SessionDetailConfigurationEntry,
  SessionDetailResponse,
  SessionDetailSubagentEntry,
  SessionDetailTranscriptMessage,
  SessionDetailTranscriptTurn,
} from "../lib/playground";
import { formatNumber, formatTimestamp, truncate } from "../lib/utils";

function Section(props: {
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 border-t themed-border py-4 first:border-t-0">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] themed-subtle">
          {props.title}
        </div>
        {props.count !== undefined ? (
          <div className="text-[11px] uppercase tracking-[0.16em] themed-subtle">
            {formatNumber(props.count)}
          </div>
        ) : null}
      </div>
      <div className="space-y-2">{props.children}</div>
    </section>
  );
}

function Row(props: {
  title: string;
  detail?: string;
  meta?: ReactNode;
  action?: ReactNode;
  tone?: "default" | "error";
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0 space-y-1">
        <div
          className={
            props.tone === "error"
              ? "min-w-0 text-sm font-medium themed-error-ink"
              : "min-w-0 text-sm font-medium themed-title"
          }
        >
          {props.title}
        </div>
        {props.detail ? (
          <div className="text-xs leading-5 themed-muted">
            {props.detail}
          </div>
        ) : null}
        {props.meta ? (
          <div className="text-xs leading-5 themed-subtle">
            {props.meta}
          </div>
        ) : null}
      </div>
      {props.action ? <div className="shrink-0">{props.action}</div> : null}
    </div>
  );
}

function EmptyState(props: { message: string }) {
  return (
    <div className="text-sm leading-6 themed-muted">
      {props.message}
    </div>
  );
}

function summarizeConfig(detail: SessionDetailResponse): SessionDetailConfigurationEntry[] {
  const entries: SessionDetailConfigurationEntry[] = [];

  if (detail.project) {
    entries.push({ key: "project", label: "Project", value: detail.project });
  }
  if (detail.cwd) {
    entries.push({ key: "cwd", label: "CWD", value: detail.cwd });
  }
  if (detail.gitBranch) {
    entries.push({ key: "branch", label: "Branch", value: detail.gitBranch });
  }
  if (detail.model) {
    entries.push({ key: "model", label: "Model", value: detail.model });
  }
  if (detail.status) {
    entries.push({ key: "status", label: "Session type", value: detail.status });
  }
  if (detail.parentSessionId) {
    entries.push({ key: "parent", label: "Parent", value: detail.parentSessionId });
  }

  return entries;
}

export function SessionDetailSidebar(props: {
  detail: SessionDetailResponse;
  transcript: SessionDetailTranscriptMessage[];
  transcriptTurns: SessionDetailTranscriptTurn[];
  onOpenSessionDetail: (sessionId: string) => void;
  composerMessage: string;
  composerPendingAction: "resume" | "restart" | null;
  composerError: string | null;
  composerResult: {
    variant: "neutral" | "error";
    title: string;
    detail: string;
  } | null;
  onComposerMessageChange: (value: string) => void;
  onResumeSession: () => void;
  onRestartSession: () => void;
}) {
  const summary = summarizeConfig(props.detail);
  const files = props.detail.files ?? [];
  const tools = props.detail.tools ?? [];
  const errors = props.detail.errors ?? [];
  const skills = props.detail.skills ?? [];
  const subagents = props.detail.subagents ?? [];
  const config = props.detail.configuration ?? [];
  const configEntries = config.length > 0 ? config : summary;

  return (
    <aside className="session-detail-sidebar-shell">
      <div className="session-detail-sidebar-frame">
        <Tabs defaultValue="chat" className="session-detail-sidebar-tabs">
          <TabsList className="session-detail-chat-tabs-list">
            <TabsTrigger
              value="chat"
              className="session-detail-chat-tab-trigger"
            >
              Chat log
            </TabsTrigger>
            <TabsTrigger
              value="activity"
              className="session-detail-chat-tab-trigger"
            >
              Activity
            </TabsTrigger>
            <TabsTrigger
              value="context"
              className="session-detail-chat-tab-trigger"
            >
              Context
            </TabsTrigger>
            <TabsTrigger
              value="subagents"
              className="session-detail-chat-tab-trigger"
            >
              Subagents
            </TabsTrigger>
          </TabsList>

          <TabsContent value="chat" className="session-detail-sidebar-tab mt-0">
            <div className="session-detail-chat-panel session-detail-chat-shell">
              <SessionDetailTranscript
                turns={props.transcriptTurns}
                messages={props.transcript}
                onOpenSubagent={props.onOpenSessionDetail}
                compact
                fillHeight
                showHeader={false}
                containerClassName="session-detail-chat-body"
                className="session-detail-chat-scroll"
              />

              <div className="session-detail-chat-composer">
                <div className="session-detail-chat-composer-shell">
                  <Textarea
                    value={props.composerMessage}
                    onChange={(event) => props.onComposerMessageChange(event.target.value)}
                    onKeyDown={(event) => {
                      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                        event.preventDefault();
                        if (!props.composerPendingAction && props.composerMessage.trim()) {
                          props.onResumeSession();
                        }
                      }
                    }}
                    placeholder="Continue the thread, ask for a revision, or kick off a fresh run from this workspace."
                    className="session-detail-chat-input border-none bg-transparent px-0 py-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                  />

                  <div className="session-detail-chat-composer-footer">
                    <div className="session-detail-chat-composer-meta">
                      Cmd/Ctrl+Enter sends. New session keeps this workspace.
                    </div>
                    <div className="session-detail-chat-composer-actions">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={props.onRestartSession}
                        disabled={
                          props.composerPendingAction !== null
                          || !props.composerMessage.trim()
                          || !props.detail.cwd
                        }
                        className="session-detail-chat-secondary-action"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        {props.composerPendingAction === "restart" ? "Starting..." : "New session"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={props.onResumeSession}
                        disabled={props.composerPendingAction !== null || !props.composerMessage.trim()}
                        className="session-detail-chat-send-action"
                      >
                        <Send className="h-3.5 w-3.5" />
                        {props.composerPendingAction === "resume" ? "Sending..." : "Send"}
                      </Button>
                    </div>
                  </div>
                </div>

                {props.composerError ? (
                  <InlineState
                    variant="error"
                    title="Could not send message"
                    detail={props.composerError}
                  />
                ) : null}

                {props.composerResult ? (
                  <InlineState
                    variant={props.composerResult.variant}
                    title={props.composerResult.title}
                    detail={props.composerResult.detail}
                  />
                ) : null}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="activity" className="session-detail-sidebar-tab session-detail-sidebar-scroll mt-0 space-y-0">
            <Section title="Files" count={files.length}>
              {files.length > 0 ? (
                <div className="divide-y divide-[color:var(--panel-border)]">
                  {files.map((file) => (
                    <Row
                      key={file.path}
                      title={truncate(file.path, 68)}
                      detail={
                        [
                          file.status ? file.status : null,
                          file.count ? `${formatNumber(file.count)} touches` : null,
                          file.timestamp ? formatTimestamp(file.timestamp) : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      }
                    />
                  ))}
                </div>
              ) : (
                <EmptyState message="No file activity was returned." />
              )}
            </Section>

            <Section title="Tools" count={tools.length}>
              {tools.length > 0 ? (
                <div className="divide-y divide-[color:var(--panel-border)]">
                  {tools.map((tool) => (
                    <Row
                      key={tool.toolName}
                      title={tool.toolName}
                      detail={
                        [
                          `${formatNumber(tool.callCount)} calls`,
                          tool.errorCount ? `${formatNumber(tool.errorCount)} errors` : null,
                          tool.lastSeenAt ? `last ${formatTimestamp(tool.lastSeenAt)}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      }
                      meta={tool.description}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState message="No tool activity was returned." />
              )}
            </Section>

            <Section title="Errors" count={errors.length}>
              {errors.length > 0 ? (
                <div className="divide-y divide-[color:var(--panel-border)]">
                  {errors.map((error) => (
                    <Row
                      key={error.errorId}
                      title={error.message}
                      detail={
                        [
                          error.kind,
                          error.toolName ? `tool ${error.toolName}` : null,
                          error.timestamp ? formatTimestamp(error.timestamp) : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      }
                      meta={error.code}
                      tone="error"
                    />
                  ))}
                </div>
              ) : (
                <EmptyState message="No errors were returned." />
              )}
            </Section>
          </TabsContent>

          <TabsContent value="context" className="session-detail-sidebar-tab session-detail-sidebar-scroll mt-0 space-y-0">
            <Section title="Configuration" count={configEntries.length}>
              {configEntries.length > 0 ? (
                <div className="divide-y divide-[color:var(--panel-border)]">
                  {configEntries.map((entry) => (
                    <Row
                      key={entry.key}
                      title={entry.label}
                      detail={entry.value}
                      meta={entry.description}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState message="No configuration fields were returned." />
              )}
            </Section>

            <Section title="Skills" count={skills.length}>
              {skills.length > 0 ? (
                <div className="divide-y divide-[color:var(--panel-border)]">
                  {skills.map((skill) => (
                    <Row
                      key={`${skill.scope ?? "skill"}:${skill.name}`}
                      title={skill.name}
                      detail={skill.description}
                      meta={
                        [
                          skill.scope ?? null,
                          skill.loadedAt ? `loaded ${formatTimestamp(skill.loadedAt)}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      }
                    />
                  ))}
                </div>
              ) : (
                <EmptyState message="No skills were returned." />
              )}
            </Section>
          </TabsContent>

          <TabsContent value="subagents" className="session-detail-sidebar-tab session-detail-sidebar-scroll mt-0 space-y-0">
            <Section title="Lineage" count={subagents.length}>
              {subagents.length > 0 ? (
                <div className="divide-y divide-[color:var(--panel-border)]">
                  {subagents.map((subagent: SessionDetailSubagentEntry) => (
                    <Row
                      key={subagent.sessionId}
                      title={subagent.title ?? subagent.slug ?? subagent.agentId ?? subagent.sessionId}
                      detail={
                        [
                          subagent.agentId ? `agent ${subagent.agentId}` : null,
                          subagent.startedAt ? `started ${formatTimestamp(subagent.startedAt)}` : null,
                          subagent.messageCount ? `${formatNumber(subagent.messageCount)} messages` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      }
                      meta={
                        [
                          subagent.status ?? null,
                          subagent.errorCount ? `${formatNumber(subagent.errorCount)} errors` : null,
                          subagent.toolCount ? `${formatNumber(subagent.toolCount)} tools` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      }
                      action={
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => props.onOpenSessionDetail(subagent.sessionId)}
                          className="h-7 rounded-full px-3 text-xs"
                        >
                          Open
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </Button>
                      }
                    />
                  ))}
                </div>
              ) : (
                <EmptyState message="No subagents were returned." />
              )}
            </Section>
          </TabsContent>
        </Tabs>
      </div>
    </aside>
  );
}
