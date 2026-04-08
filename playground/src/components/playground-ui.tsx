import {
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  LoaderCircle,
  Search,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ScrollArea } from "./ui/scroll-area";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Select } from "./ui/select";
import type {
  CheckResult,
  NavigationSection,
  PlaygroundPageId,
  PlaygroundRoute,
  SessionMetadataDefinition,
} from "../lib/playground";
import { buildPlaygroundHash } from "../lib/playground";
import { formatNumber } from "../lib/utils";
import { cn } from "../lib/utils";

export function SectionIntro(props: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
        {props.eyebrow}
      </div>
      <h1 className="text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
        {props.title}
      </h1>
      <p className="max-w-4xl text-sm leading-7 text-slate-600">{props.description}</p>
    </div>
  );
}

export function PageBodyWithRail(props: {
  page: PlaygroundPageId;
  activeSection?: string;
  items: Array<{ method: string; path: string; detail: string; sectionId?: string }>;
  exampleGroups?: Array<{
    title: string;
    buttonLabel?: string;
    items: Array<{ label: string; detail: string; action: () => void }>;
  }>;
  sections?: Array<{ id: string; label: string }>;
  children: ReactNode;
}) {
  const sections = props.sections ?? [];
  const exampleGroups = props.exampleGroups?.filter((group) => group.items.length > 0) ?? [];

  return (
    <div className="min-[1120px]:grid min-[1120px]:grid-cols-[minmax(0,1fr)_288px] min-[1120px]:items-start min-[1120px]:gap-7 xl:gap-10">
      <div className="min-w-0 space-y-8">{props.children}</div>

      <aside className="mt-8 hidden min-[1120px]:block min-[1120px]:mt-0">
        <div className="sticky top-8 space-y-8 border-l border-slate-200 pl-5">
          <div className="space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
              Endpoints
            </div>
            <div className="space-y-1">
              {props.items.map((operation) => {
                const active = Boolean(
                  operation.sectionId && props.activeSection === operation.sectionId
                );

                return (
                  <a
                    key={`${operation.method}-${operation.path}`}
                    href={buildPlaygroundHash(props.page, operation.sectionId)}
                    className={cn(
                      "block rounded-md px-2 py-2 transition-colors hover:bg-white/80",
                      active ? "bg-white text-slate-950" : "text-slate-600"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <MethodBadge method={operation.method} />
                      <code className="truncate text-[11px] text-slate-900">
                        {operation.path}
                      </code>
                    </div>
                    <p className="mt-1 text-[11px] leading-5 text-slate-500">
                      {operation.detail}
                    </p>
                  </a>
                );
              })}
            </div>
          </div>

          {exampleGroups.length > 0 ? (
            <div className="space-y-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                Examples
              </div>
              <div className="space-y-4">
                {exampleGroups.map((group) => (
                  <ExampleSelect
                    key={group.title}
                    label={group.title}
                    buttonLabel={group.buttonLabel}
                    items={group.items}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {sections.length > 0 ? (
            <div className="space-y-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                On this page
              </div>
              <div className="space-y-1">
                {sections.map((section) => {
                  const active = props.activeSection === section.id;

                  return (
                    <a
                      key={section.id}
                      href={buildPlaygroundHash(props.page, section.id)}
                      className={cn(
                        "block rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-white/80",
                        active ? "bg-white text-slate-950" : "text-slate-500"
                      )}
                    >
                      {section.label}
                    </a>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

export function ToolbarPane(props: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3 border-y border-slate-200 py-3", props.className)}>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
        <div className="text-sm font-medium text-slate-900">{props.title}</div>
        {props.description ? (
          <p className="max-w-3xl text-xs leading-5 text-slate-500">{props.description}</p>
        ) : null}
      </div>
      <div className="space-y-3">{props.children}</div>
    </div>
  );
}

export function MethodBadge(props: { method: string }) {
  const tone = props.method === "GET"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : props.method === "POST"
      ? "border-sky-200 bg-sky-50 text-sky-700"
      : props.method === "PUT"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : props.method === "WS"
          ? "border-violet-200 bg-violet-50 text-violet-700"
          : "border-slate-200 bg-slate-100 text-slate-700";

  return (
    <span className={`inline-flex min-w-12 items-center justify-center rounded-md border px-2 py-0.5 text-[11px] font-semibold tracking-[0.16em] ${tone}`}>
      {props.method}
    </span>
  );
}

export function ActionPane(props: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`${props.className ?? ""} space-y-4 border-y border-slate-200 py-4`}>
      <div className="space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
          {props.eyebrow}
        </div>
        <div className="text-sm font-medium text-slate-900">{props.title}</div>
        <p className="text-sm leading-6 text-slate-500">{props.description}</p>
      </div>
      <div className="space-y-4">{props.children}</div>
    </div>
  );
}

export function SidebarSection(props: {
  section: NavigationSection;
  expanded: boolean;
  currentRoute: PlaygroundRoute;
  onToggle: () => void;
  onNavigate: (page: PlaygroundPageId, section?: string) => void;
}) {
  const sectionActive = props.currentRoute.page === props.section.id
    || props.section.children.some((child) => (child.page ?? props.section.id) === props.currentRoute.page);

  return (
    <div className="sidebar-section">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => props.onNavigate(props.section.id)}
          className={`nav-link flex min-w-0 flex-1 items-center rounded-md px-2.5 py-1.5 text-left text-[13px] font-medium ${
            sectionActive ? "nav-link-active text-slate-950" : "text-slate-700"
          }`}
        >
          <span className="truncate">{props.section.label}</span>
        </button>
        <button
          type="button"
          onClick={props.onToggle}
          className="sidebar-toggle inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400"
          aria-label={`${props.expanded ? "Collapse" : "Expand"} ${props.section.label}`}
        >
          <ChevronRight className={`h-4 w-4 transition-transform ${props.expanded ? "rotate-90" : ""}`} />
        </button>
      </div>
      {props.expanded ? (
        <div className="mt-0.5 space-y-0.5 pl-3">
          {props.section.children.map((child) => {
            const childPage = child.page ?? props.section.id;
            const active = props.currentRoute.page === childPage
              && (child.sectionId ? props.currentRoute.section === child.sectionId : true);

            return (
              <button
                key={child.id}
                type="button"
                onClick={() => props.onNavigate(childPage, child.sectionId)}
                className={`sidebar-child-link block w-full rounded-md px-2.5 py-1 text-left text-[11px] ${
                  active ? "sidebar-child-link-active text-slate-900" : "text-slate-500"
                }`}
              >
                {child.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function ExampleSelect(props: {
  label: string;
  items: Array<{ label: string; detail: string; action: () => void }>;
  buttonLabel?: string;
  className?: string;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedItem = props.items[selectedIndex] ?? props.items[0];

  if (props.items.length === 0) {
    return null;
  }

  return (
    <div className={cn("space-y-2", props.className)}>
      <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
        {props.label}
      </div>
      <div className="flex gap-2">
        <Select
          value={String(selectedIndex)}
          onChange={(event) => setSelectedIndex(Number(event.target.value))}
          className="h-9"
        >
          {props.items.map((item, index) => (
            <option key={item.label} value={index}>
              {item.label}
            </option>
          ))}
        </Select>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => selectedItem?.action()}
        >
          {props.buttonLabel ?? "Run"}
        </Button>
      </div>
      <p className="text-xs leading-5 text-slate-500">{selectedItem?.detail}</p>
    </div>
  );
}

export function CheckBadge(props: { result: CheckResult }) {
  if (props.result.status === "loading") {
    return (
      <Badge variant="info" className="gap-1">
        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
        Running
      </Badge>
    );
  }

  if (props.result.status === "pass") {
    return (
      <Badge variant="success" className="gap-1">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Pass
      </Badge>
    );
  }

  if (props.result.status === "error") {
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="h-3.5 w-3.5" />
        Error
      </Badge>
    );
  }

  return <Badge variant="outline">Idle</Badge>;
}

export function InlineState(props: {
  title: string;
  detail: string;
  variant: "neutral" | "warning" | "error";
}) {
  const tone = props.variant === "error"
    ? "border-rose-200 text-rose-700"
    : props.variant === "warning"
      ? "border-amber-200 text-amber-700"
      : "border-slate-200 text-slate-600";

  return (
    <div className={`border-l-2 pl-4 ${tone}`}>
      <div className="text-sm font-medium">{props.title}</div>
      <p className="mt-1 text-sm leading-6">{props.detail}</p>
    </div>
  );
}

export function LinearList(props: {
  title: string;
  description: string;
  children: ReactNode;
  emptyTitle: string;
  emptyDetail: string;
}) {
  const hasChildren = Array.isArray(props.children)
    ? props.children.length > 0
    : Boolean(props.children);

  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm font-medium text-slate-900">{props.title}</div>
        <p className="mt-1 text-sm leading-6 text-slate-500">{props.description}</p>
      </div>
      <div className="border-y border-slate-200">
        {hasChildren ? (
          <div className="divide-y divide-slate-200">{props.children}</div>
        ) : (
          <div className="py-6">
            <InlineState
              variant="neutral"
              title={props.emptyTitle}
              detail={props.emptyDetail}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function MetadataSchemaTable(props: { definitions: SessionMetadataDefinition[] }) {
  if (props.definitions.length === 0) {
    return (
      <div className="border-y border-slate-200 py-6">
        <InlineState
          variant="neutral"
          title="No metadata fields yet"
          detail="Register a field from the metadata lab to start attaching project-specific attributes to sessions."
        />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white/85">
      <table className="w-full text-left">
        <thead className="border-b border-slate-200 bg-slate-50/90">
          <tr className="text-xs uppercase tracking-[0.16em] text-slate-400">
            <th className="px-4 py-3 font-medium">Field</th>
            <th className="px-4 py-3 font-medium">Key</th>
            <th className="px-4 py-3 font-medium">Search</th>
            <th className="px-4 py-3 font-medium">Filter</th>
            <th className="px-4 py-3 font-medium">Description</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {props.definitions.map((definition) => (
            <tr key={definition.key} className="align-top">
              <td className="px-4 py-3 text-sm font-medium text-slate-900">
                {definition.label}
              </td>
              <td className="px-4 py-3 text-sm text-slate-600">{definition.key}</td>
              <td className="px-4 py-3 text-sm text-slate-600">
                {definition.searchable ? "Yes" : "No"}
              </td>
              <td className="px-4 py-3 text-sm text-slate-600">
                {definition.filterable ? "Yes" : "No"}
              </td>
              <td className="px-4 py-3 text-sm leading-6 text-slate-500">
                {definition.description ?? "No description"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type CompactDataTableMetaItem = {
  label: string;
  value: ReactNode;
};

type CompactDataTableRow = {
  id: string;
  cells: ReactNode[];
  previewEyebrow?: ReactNode;
  previewTitle: ReactNode;
  previewDescription?: ReactNode;
  previewBadges?: ReactNode[];
  previewMeta?: CompactDataTableMetaItem[];
  drawerEyebrow?: ReactNode;
  drawerTitle?: ReactNode;
  drawerDescription?: ReactNode;
  drawerBadges?: ReactNode[];
  drawerMeta?: CompactDataTableMetaItem[];
  drawerContent?: ReactNode;
};

export function CopyableValue(props: {
  value: string;
  displayValue?: ReactNode;
  ariaLabel?: string;
  className?: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timeoutId = window.setTimeout(() => setCopied(false), 1200);
    return () => window.clearTimeout(timeoutId);
  }, [copied]);

  async function handleCopy(event: MouseEvent<HTMLButtonElement>): Promise<void> {
    event.stopPropagation();

    try {
      await navigator.clipboard.writeText(props.value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={cn("flex min-w-0 items-center gap-1.5", props.className)}>
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-sm text-slate-600",
          props.mono ? "font-mono text-xs" : null
        )}
      >
        {props.displayValue ?? props.value}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleCopy}
        className="h-7 w-7 shrink-0 rounded-md p-0 text-slate-400 hover:bg-slate-100 hover:text-slate-900"
        aria-label={props.ariaLabel ?? "Copy to clipboard"}
        title={copied ? "Copied" : "Copy to clipboard"}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

function CompactDataTableMetaList(props: {
  items: CompactDataTableMetaItem[];
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", props.className)}>
      {props.items.map((item) => (
        <div key={item.label} className="space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            {item.label}
          </div>
          <div className="text-sm leading-6 text-slate-600">{item.value}</div>
        </div>
      ))}
    </div>
  );
}

function ResourceDetailDrawer(props: {
  row: CompactDataTableRow;
  onClose: () => void;
}) {
  const title = props.row.drawerTitle ?? props.row.previewTitle;
  const eyebrow = props.row.drawerEyebrow ?? props.row.previewEyebrow;
  const description = props.row.drawerDescription ?? props.row.previewDescription;
  const badges = props.row.drawerBadges ?? props.row.previewBadges;
  const meta = props.row.drawerMeta ?? props.row.previewMeta;

  return createPortal(
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/10 backdrop-blur-[1px]"
        aria-label="Close details"
        onClick={props.onClose}
      />
      <aside className="runtime-detail-drawer absolute inset-y-0 right-0 w-[min(432px,100vw)] border-l border-slate-200 bg-white/98">
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
            <div className="min-w-0 space-y-2">
              {eyebrow ? (
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                  {eyebrow}
                </div>
              ) : null}
              <div className="text-base font-semibold tracking-tight text-slate-950">
                {title}
              </div>
              {description ? (
                <div className="text-sm leading-6 text-slate-500">{description}</div>
              ) : null}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={props.onClose}
              className="h-8 w-8 shrink-0 rounded-md p-0 text-slate-400 hover:bg-slate-100 hover:text-slate-900"
              aria-label="Close details drawer"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-5 px-5 py-5">
              {badges && badges.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {badges.map((badge, index) => (
                    <div key={index}>{badge}</div>
                  ))}
                </div>
              ) : null}

              {meta && meta.length > 0 ? (
                <div className="border-y border-slate-200 py-4">
                  <CompactDataTableMetaList items={meta} />
                </div>
              ) : null}

              {props.row.drawerContent ? (
                <div className="space-y-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                    Detail
                  </div>
                  <div className="text-sm leading-6 text-slate-600">
                    {props.row.drawerContent}
                  </div>
                </div>
              ) : null}
            </div>
          </ScrollArea>
        </div>
      </aside>
    </div>,
    document.body
  );
}

export function CompactDataTable(props: {
  title: string;
  description: string;
  columns: string[];
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
  };
  meta?: ReactNode;
  loading?: boolean;
  error?: string | null;
  rows: CompactDataTableRow[];
  emptyTitle: string;
  emptyDetail: string;
}) {
  const hidePreviewTimeoutRef = useRef<number | null>(null);
  const [activePreview, setActivePreview] = useState<{
    rowId: string;
    rect: DOMRect;
  } | null>(null);
  const [drawerRowId, setDrawerRowId] = useState<string | null>(null);
  const activeRow = props.rows.find((row) => row.id === activePreview?.rowId) ?? null;
  const drawerRow = props.rows.find((row) => row.id === drawerRowId) ?? null;

  useEffect(() => {
    return () => {
      if (hidePreviewTimeoutRef.current !== null) {
        window.clearTimeout(hidePreviewTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!activePreview) {
      return;
    }

    const clearPreview = () => setActivePreview(null);
    window.addEventListener("scroll", clearPreview, true);
    window.addEventListener("resize", clearPreview);

    return () => {
      window.removeEventListener("scroll", clearPreview, true);
      window.removeEventListener("resize", clearPreview);
    };
  }, [activePreview]);

  useEffect(() => {
    if (!drawerRowId) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDrawerRowId(null);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [drawerRowId]);

  useEffect(() => {
    if (drawerRowId && !props.rows.some((row) => row.id === drawerRowId)) {
      setDrawerRowId(null);
    }
  }, [drawerRowId, props.rows]);

  function clearHidePreviewTimeout(): void {
    if (hidePreviewTimeoutRef.current !== null) {
      window.clearTimeout(hidePreviewTimeoutRef.current);
      hidePreviewTimeoutRef.current = null;
    }
  }

  function showPreview(rowId: string, element: HTMLElement | null): void {
    if (!element) {
      return;
    }

    clearHidePreviewTimeout();

    setActivePreview({
      rowId,
      rect: element.getBoundingClientRect(),
    });
  }

  function openDrawer(rowId: string): void {
    clearHidePreviewTimeout();
    setActivePreview(null);
    setDrawerRowId(rowId);
  }

  function hidePreviewSoon(): void {
    clearHidePreviewTimeout();

    hidePreviewTimeoutRef.current = window.setTimeout(() => {
      setActivePreview(null);
      hidePreviewTimeoutRef.current = null;
    }, 140);
  }

  const previewPosition = activePreview
    ? (() => {
        const width = 336;
        const gap = 10;
        const viewportPadding = 16;
        let left = activePreview.rect.right + gap;

        if (left + width > window.innerWidth - viewportPadding) {
          left = Math.max(
            viewportPadding,
            activePreview.rect.left - width - gap
          );
        }

        const top = Math.max(
          viewportPadding,
          Math.min(activePreview.rect.top - 8, window.innerHeight - 280)
        );

        return { top, left, width };
      })()
    : null;

  const stateBlock = props.error ? (
    <InlineState
      variant="error"
      title="Could not load this table"
      detail={props.error}
    />
  ) : (
    <InlineState
      variant="neutral"
      title={props.emptyTitle}
      detail={props.emptyDetail}
    />
  );
  const shouldShowTable = props.loading || props.rows.length > 0;

  if (!shouldShowTable) {
    return (
      <div className="space-y-4">
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="text-sm font-medium text-slate-900">{props.title}</div>
            <p className="text-sm leading-6 text-slate-500">{props.description}</p>
          </div>
          {(props.search || props.meta) ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {props.search ? (
                <div className="w-full max-w-sm">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                      className="h-9 pl-9"
                      value={props.search.value}
                      onChange={(event) => props.search?.onChange(event.target.value)}
                      placeholder={props.search.placeholder}
                    />
                  </div>
                </div>
              ) : <div />}
              {props.meta ? (
                <div className="flex flex-wrap gap-2 sm:justify-end">{props.meta}</div>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="border-y border-slate-200 py-6">
          {stateBlock}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="space-y-2">
          <div className="text-sm font-medium text-slate-900">{props.title}</div>
          <p className="text-sm leading-6 text-slate-500">{props.description}</p>
        </div>
        {(props.search || props.meta) ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {props.search ? (
              <div className="w-full max-w-sm">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    className="h-9 pl-9"
                    value={props.search.value}
                    onChange={(event) => props.search?.onChange(event.target.value)}
                    placeholder={props.search.placeholder}
                  />
                </div>
              </div>
            ) : <div />}
            {props.meta ? (
              <div className="flex flex-wrap gap-2 sm:justify-end">{props.meta}</div>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="relative overflow-visible">
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white/85">
          <table className="w-full text-left">
            <thead className="border-b border-slate-200 bg-slate-50/90">
              <tr className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                {props.columns.map((column) => (
                  <th key={column} className="px-3 py-2.5 font-medium">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {props.rows.length > 0 ? (
                props.rows.map((row) => {
                  const active = row.id === activeRow?.id;

                  return (
                    <tr
                      key={row.id}
                      tabIndex={0}
                      onMouseEnter={(event) => showPreview(row.id, event.currentTarget)}
                      onFocus={(event) => showPreview(row.id, event.currentTarget)}
                      onClick={() => openDrawer(row.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openDrawer(row.id);
                        }
                      }}
                      onMouseLeave={hidePreviewSoon}
                      onBlur={hidePreviewSoon}
                      className={cn(
                        "cursor-pointer align-top transition-colors outline-none",
                        active ? "bg-slate-50/90" : "hover:bg-slate-50/70"
                      )}
                    >
                      {row.cells.map((cell, cellIndex) => (
                        <td key={cellIndex} className="px-3 py-2.5 text-sm leading-6 text-slate-600">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={props.columns.length} className="px-3 py-0">
                    <div className="h-28" />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {props.loading ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-white/55 backdrop-blur-[1px]">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/96 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin text-slate-500" />
              Loading
            </div>
          </div>
        ) : null}
      </div>
      {activeRow && previewPosition
        ? createPortal(
            <div
              className="runtime-preview-popover fixed z-50"
              style={{
                top: `${previewPosition.top}px`,
                left: `${previewPosition.left}px`,
                width: `${previewPosition.width}px`,
              }}
              onMouseEnter={clearHidePreviewTimeout}
              onMouseLeave={hidePreviewSoon}
            >
              <div className="runtime-preview-card rounded-xl border border-slate-200 bg-white/96 p-4">
                <div key={activeRow.id} className="runtime-preview-content space-y-4">
                  {activeRow.previewEyebrow ? (
                    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                      {activeRow.previewEyebrow}
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <div className="text-sm font-medium text-slate-950">{activeRow.previewTitle}</div>
                    {activeRow.previewDescription ? (
                      <div className="text-sm leading-6 text-slate-500">
                        {activeRow.previewDescription}
                      </div>
                    ) : null}
                  </div>

                  {activeRow.previewBadges && activeRow.previewBadges.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {activeRow.previewBadges.map((badge, index) => (
                        <div key={index}>{badge}</div>
                      ))}
                    </div>
                  ) : null}

                  {activeRow.previewMeta && activeRow.previewMeta.length > 0 ? (
                    <div className="border-t border-slate-200 pt-3">
                      <CompactDataTableMetaList items={activeRow.previewMeta} />
                    </div>
                  ) : null}
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
      {drawerRow ? (
        <ResourceDetailDrawer row={drawerRow} onClose={() => setDrawerRowId(null)} />
      ) : null}
    </div>
  );
}

export function TableMetaBadges(props: {
  total?: number;
  noun?: string;
  loading?: boolean;
  query?: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Badge variant="outline">
        {formatNumber(props.total)} {props.noun ?? "items"}
      </Badge>
      {props.query?.trim() ? <Badge variant="info">Filtered</Badge> : null}
      {props.loading ? <Badge variant="warning">Loading</Badge> : null}
    </div>
  );
}

export function DefinitionRow(props: {
  label: string;
  value: string;
  detail: string;
  hideValue?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-4">
      <div className="space-y-1">
        <div className="text-sm font-medium text-slate-900">{props.label}</div>
        <div className="text-sm leading-6 text-slate-500">{props.detail}</div>
      </div>
      {props.hideValue ? null : (
        <div className="shrink-0 text-sm font-medium text-slate-700">
          {props.value}
        </div>
      )}
    </div>
  );
}

export function JsonPreview(props: {
  title: string;
  data: unknown;
  emptyMessage: string;
}) {
  return (
    <div className="space-y-3">
      <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
        {props.title}
      </div>
      <div className="rounded-lg border border-slate-200 bg-slate-50">
        <ScrollArea className="max-h-[320px]">
          <pre className="px-4 py-3 text-xs leading-6 text-slate-700">
            {props.data ? JSON.stringify(props.data, null, 2) : props.emptyMessage}
          </pre>
        </ScrollArea>
      </div>
    </div>
  );
}

export function CompactStatGrid(props: {
  items: Array<{
    label: string;
    value: string;
    detail: string;
    tone?: "neutral" | "success" | "warning" | "info";
  }>;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "stat-surface grid gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200/90 md:grid-cols-2 xl:grid-cols-4",
        props.className
      )}
    >
      {props.items.map((item) => (
        <CompactStatTile key={`${item.label}-${item.value}`} {...item} />
      ))}
    </div>
  );
}

function CompactStatTile(props: {
  label: string;
  value: string;
  detail: string;
  tone?: "neutral" | "success" | "warning" | "info";
}) {
  const toneClass = props.tone === "success"
    ? "stat-cell-success"
    : props.tone === "warning"
      ? "stat-cell-warning"
      : props.tone === "info"
        ? "stat-cell-info"
        : "stat-cell-neutral";

  return (
    <div className={`stat-cell space-y-1 px-3 py-2.5 sm:px-3.5 sm:py-3 ${toneClass}`}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
        {props.label}
      </div>
      <div className="text-base font-semibold tracking-tight text-slate-950 sm:text-lg">
        {props.value}
      </div>
      <div className="text-[11px] leading-4 text-slate-500">
        {props.detail}
      </div>
    </div>
  );
}
