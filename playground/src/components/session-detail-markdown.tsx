import type { ReactNode } from "react";
import { isValidElement, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SessionDetailCodeViewer } from "./session-detail-code-viewer";
import { cn } from "../lib/utils";
import { prepareTranscriptMarkdown } from "../lib/transcript-markdown";

function extractText(children: ReactNode): string {
  return Array.isArray(children)
    ? children.map((child) => extractText(child)).join("")
    : typeof children === "string"
      ? children
      : typeof children === "number"
        ? String(children)
        : children && typeof children === "object" && "props" in children
          ? extractText((children as { props?: { children?: React.ReactNode } }).props?.children ?? "")
          : "";
}

function extractCodeNodeProps(children: ReactNode): {
  code: string;
  language?: string;
} | null {
  if (!isValidElement(children)) {
    return null;
  }

  const props = children.props as {
    className?: string;
    children?: ReactNode;
  };
  const code = extractText(props.children ?? "").replace(/\n$/, "");
  if (!code) {
    return null;
  }

  const language = props.className?.startsWith("language-")
    ? props.className.slice("language-".length)
    : undefined;

  return {
    code,
    language,
  };
}

export function SessionDetailMarkdown(props: {
  content: string;
  className?: string;
  variant?: "user" | "default";
}) {
  const prepared = useMemo(() => prepareTranscriptMarkdown(props.content), [props.content]);
  const lines = useMemo(() => prepared.markdown.split("\n"), [prepared.markdown]);
  const shouldCollapse = lines.length > 16 || prepared.markdown.length > 900;
  const [expanded, setExpanded] = useState(!shouldCollapse);

  return (
    <div
      className={cn(
        "session-detail-markdown-shell",
        props.variant === "user" ? "session-detail-markdown-shell-user" : null,
        props.className
      )}
    >
      <div
        className={cn(
          "session-detail-markdown-body",
          !expanded && shouldCollapse ? "session-detail-markdown-collapsed" : null
        )}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({ children }) => <p className="session-detail-markdown-paragraph">{children}</p>,
            ul: ({ children }) => <ul className="session-detail-markdown-list">{children}</ul>,
            ol: ({ children }) => <ol className="session-detail-markdown-list list-decimal">{children}</ol>,
            li: ({ children }) => <li className="session-detail-markdown-list-item">{children}</li>,
            blockquote: ({ children }) => (
              <blockquote className="session-detail-markdown-quote">{children}</blockquote>
            ),
            strong: ({ children }) => (
              <strong className="font-semibold themed-title">{children}</strong>
            ),
            em: ({ children }) => <em className="italic">{children}</em>,
            a: ({ href, children }) => (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="session-detail-markdown-link"
              >
                {children}
              </a>
            ),
            code: ({ children }) => {
              const raw = extractText(children).replace(/\n$/, "");
              return <code className="session-detail-inline-code">{raw}</code>;
            },
            pre: ({ children }) => {
              const codeNode = extractCodeNodeProps(children);
              if (!codeNode) {
                return <>{children}</>;
              }

              return (
                <SessionDetailCodeViewer
                  code={codeNode.code}
                  language={codeNode.language}
                />
              );
            },
          }}
        >
          {prepared.markdown}
        </ReactMarkdown>
        {!expanded && shouldCollapse ? (
          <div className="session-detail-markdown-fade" />
        ) : null}
      </div>
      {shouldCollapse ? (
        <button
          type="button"
          className="session-detail-markdown-toggle"
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? "Collapse" : "Expand"}
        </button>
      ) : null}
    </div>
  );
}
