import { useMemo, useState } from "react";
import { formatNumber, truncate } from "../lib/utils";

export function SessionDetailCodeViewer(props: {
  label?: string;
  code: string;
  language?: string;
  path?: string;
  showPathMeta?: boolean;
  className?: string;
}) {
  const lines = useMemo(() => props.code.split("\n"), [props.code]);
  const shouldCollapse = lines.length > 14 || props.code.length > 720;
  const [expanded, setExpanded] = useState(!shouldCollapse);
  const visibleLines = expanded ? lines : lines.slice(0, 14);
  const showPathMeta = props.showPathMeta ?? true;
  const metaText = [showPathMeta && props.path ? truncate(props.path, 56) : null, props.language ? props.language : null, `${formatNumber(lines.length)} lines`]
    .filter(Boolean)
    .join(" · ");
  const showHeader = Boolean(props.label || (showPathMeta && props.path) || props.language);

  return (
    <div className={props.className ?? "session-detail-code-viewer"}>
      {showHeader ? (
        <div className="session-detail-code-header">
          <div className="min-w-0 space-y-1">
            {props.label ? (
              <div className="session-detail-code-title">{props.label}</div>
            ) : null}
            <div className="session-detail-code-meta">{metaText}</div>
          </div>
          {shouldCollapse ? (
            <button
              type="button"
              className="session-detail-code-toggle"
              onClick={() => setExpanded((current) => !current)}
            >
              {expanded ? "Collapse" : "Expand"}
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="session-detail-code-shell">
        <pre className="session-detail-code-body">
          <code>{visibleLines.join("\n")}</code>
        </pre>
        {!expanded && shouldCollapse ? (
          <div className="session-detail-code-fade" />
        ) : null}
      </div>
      {shouldCollapse && !showHeader ? (
        <div className="session-detail-code-footer">
          <button
            type="button"
            className="session-detail-code-toggle"
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? "Collapse code" : "Expand code"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
