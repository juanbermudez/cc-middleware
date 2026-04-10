import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { Badge } from "./ui/badge";
import { formatNumber, formatTimestamp, truncate } from "../lib/utils";
import type { SessionExplorerEntry, SessionExplorerGroup } from "../lib/playground";
import { getSessionTitle } from "../lib/playground";

export function SessionDirectorySection(props: { group: SessionExplorerGroup }) {
  return (
    <div className="space-y-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="text-sm font-medium text-slate-900">{props.group.name}</div>
          <div className="text-xs leading-5 text-slate-500">
            {truncate(props.group.path || "Unknown cwd", 112)}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{props.group.sessionCount} sessions</Badge>
          {props.group.teamSessionCount > 0 ? (
            <Badge variant="secondary">{props.group.teamSessionCount} team</Badge>
          ) : null}
          {props.group.subagentSessionCount > 0 ? (
            <Badge variant="info">{props.group.subagentSessionCount} subagent</Badge>
          ) : null}
          {props.group.indexedSessionCount < props.group.sessionCount ? (
            <Badge variant="warning">
              {props.group.sessionCount - props.group.indexedSessionCount} unindexed
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="space-y-3">
        {props.group.sessions.map((session) => (
          <SessionParentRow key={session.id} session={session} />
        ))}
      </div>

      <div className="text-xs leading-5 text-slate-500">
        {props.group.gitBranches.length > 0 ? `Branches ${props.group.gitBranches.join(", ")}. ` : ""}
        {props.group.hasMoreSessions
          ? `Showing ${props.group.sessions.length} of ${props.group.sessionCount} parent sessions in this directory.`
          : `Showing all ${props.group.sessionCount} parent sessions in this directory.`}
      </div>
    </div>
  );
}

function SessionParentRow(props: { session: SessionExplorerEntry }) {
  const [showSubagents, setShowSubagents] = useState(false);
  const relationships = props.session.lineage.relationships;
  const metaRows = [
    { label: "Branch", value: props.session.gitBranch ?? "No branch captured" },
    {
      label: "Index",
      value: props.session.indexed
        ? `${formatNumber(props.session.messageCount)} messages indexed`
        : "Not indexed yet",
    },
    { label: "Updated", value: formatTimestamp(props.session.lastModified ?? props.session.createdAt) },
    {
      label: "Teams",
      value: props.session.lineage.teamNames.length > 0
        ? props.session.lineage.teamNames.join(", ")
        : "No team lineage",
    },
  ];

  return (
    <div className="session-row space-y-4 border-l-2 border-slate-200/80 py-2 pl-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <div className="text-sm font-medium text-slate-900">
              {getSessionTitle(props.session)}
            </div>
            <div className="text-xs font-normal text-slate-400">
              {props.session.sessionId}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="bg-transparent text-slate-600">
              {props.session.project}
            </Badge>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {props.session.tag ? <Badge variant="warning">{props.session.tag}</Badge> : null}
          {!props.session.lineage.hasSubagents && !props.session.lineage.hasTeamMembers ? (
            <Badge variant="outline" className="text-slate-500">main</Badge>
          ) : null}
          {props.session.lineage.teamNames.map((teamName) => (
            <Badge key={`${props.session.id}-${teamName}`} variant="secondary" className="capitalize">
              {teamName}
            </Badge>
          ))}
          {props.session.lineage.hasSubagents ? (
            <Badge variant="info" className="text-sky-800">
              {props.session.lineage.subagentCount} subagent{props.session.lineage.subagentCount === 1 ? "" : "s"}
            </Badge>
          ) : null}
          {props.session.relevanceScore !== undefined ? (
            <Badge variant="outline" className="text-slate-500">
              score {props.session.relevanceScore.toFixed(2)}
            </Badge>
          ) : null}
        </div>
      </div>

      <SessionMetadataGrid rows={metaRows} columnsClassName="sm:grid-cols-2 xl:grid-cols-3" compact />

      {props.session.metadata.length > 0 ? (
        <SessionMetadataTable
          title="Metadata fields"
          entries={props.session.metadata}
        />
      ) : null}

      {relationships.length > 0 ? (
        <div className="space-y-3 border-t border-slate-200/80 pt-3">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 text-left text-sm font-medium text-slate-700"
            onClick={() => setShowSubagents((current) => !current)}
          >
            <span>
              Subagent sessions
              <span className="ml-2 text-xs font-normal text-slate-400">
                {relationships.length} child {relationships.length === 1 ? "row" : "rows"}
              </span>
            </span>
            <ChevronRight
              className={`h-4 w-4 text-slate-400 transition-transform ${showSubagents ? "rotate-90" : ""}`}
            />
          </button>

          {showSubagents ? (
            <div className="space-y-2 border-l border-slate-200/80 pl-4">
              {relationships.map((relationship, index) => {
                const childRows = [
                  { label: "Started", value: formatTimestamp(relationship.startedAt) },
                  {
                    label: "Team",
                    value: relationship.teamName ?? relationship.teammateName ?? "No team metadata",
                  },
                  {
                    label: "Transcript",
                    value: relationship.path,
                  },
                  {
                    label: "Assistant UUID",
                    value: relationship.sourceToolAssistantUUID ?? "Unavailable",
                  },
                ];

                return (
                  <div key={relationship.id} className="space-y-3 py-2">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                          <div className="text-sm font-medium text-slate-800">
                            {relationship.slug ?? relationship.agentId ?? `Subagent ${index + 1}`}
                          </div>
                          <div className="text-xs text-slate-400">
                            {relationship.agentId ?? "Unknown agent ID"}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline" className="bg-transparent text-slate-500">
                            subagent
                          </Badge>
                          {relationship.teamName ? (
                            <Badge variant="secondary">{relationship.teamName}</Badge>
                          ) : null}
                          {relationship.teammateName ? (
                            <Badge variant="outline" className="text-slate-500">{relationship.teammateName}</Badge>
                          ) : null}
                        </div>
                      </div>
                      <div className="text-xs text-slate-400">
                        Parent {props.session.sessionId}
                      </div>
                    </div>
                    <SessionMetadataGrid rows={childRows} columnsClassName="sm:grid-cols-2 xl:grid-cols-3" compact />
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SessionMetadataTable(props: {
  title: string;
  entries: SessionExplorerEntry["metadata"];
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white/80">
      <div className="border-b border-slate-200 bg-slate-50/80 px-3 py-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
          {props.title}
        </div>
      </div>
      <table className="w-full text-left">
        <thead className="border-b border-slate-200 bg-white/60">
          <tr className="text-[10px] uppercase tracking-[0.16em] text-slate-400">
            <th className="px-3 py-2 font-medium">Field</th>
            <th className="px-3 py-2 font-medium">Value</th>
            <th className="px-3 py-2 font-medium">Updated</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {props.entries.map((entry) => (
            <tr key={`${entry.sessionId}-${entry.key}`} className="align-top">
              <td className="px-3 py-2 text-sm font-medium text-slate-900">
                {entry.label}
              </td>
              <td className="px-3 py-2 text-sm text-slate-600">{entry.value}</td>
              <td className="px-3 py-2 text-xs text-slate-500">
                {formatTimestamp(entry.updatedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SessionMetadataGrid(props: {
  rows: Array<{ label: string; value: string }>;
  columnsClassName?: string;
  compact?: boolean;
}) {
  return (
    <dl className={`grid gap-x-5 ${props.compact ? "gap-y-2" : "gap-y-3"} ${props.columnsClassName ?? "sm:grid-cols-2 xl:grid-cols-4"}`}>
      {props.rows.map((row) => (
        <div key={`${row.label}-${row.value}`} className="min-w-0">
          <dt className={`font-medium uppercase tracking-[0.16em] text-slate-400 ${props.compact ? "text-[10px]" : "text-[11px]"}`}>
            {row.label}
          </dt>
          <dd className={`mt-1 break-words text-slate-700 ${props.compact ? "text-[13px] leading-5" : "text-sm leading-6"}`}>
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
