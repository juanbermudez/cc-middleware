import { useState } from "react";
import type { PlaygroundPageId, RuntimeResponse } from "../lib/playground";
import { buildPlaygroundHash } from "../lib/playground";
import { formatNumber } from "../lib/utils";
import {
  CompactDataTable,
  CompactStatGrid,
  JsonPreview,
  PageBodyWithRail,
  SectionIntro,
  TableMetaBadges,
} from "../components/playground-ui";
import { Badge } from "../components/ui/badge";

type RuntimePreviewSlice =
  | "summary"
  | "tools"
  | "commands"
  | "skills"
  | "plugins"
  | "mcp"
  | "agents"
  | "models";

function buildPreviewData(runtime: RuntimeResponse | null, slice: RuntimePreviewSlice): unknown {
  if (!runtime) {
    return null;
  }

  switch (slice) {
    case "tools":
      return { tools: runtime.tools, total: runtime.tools.length };
    case "commands":
      return {
        slashCommands: runtime.slashCommands,
        commands: runtime.commands,
        total: runtime.commands.length,
      };
    case "skills":
      return { skills: runtime.skills, total: runtime.skills.length };
    case "plugins":
      return { plugins: runtime.plugins, total: runtime.plugins.length };
    case "mcp":
      return { servers: runtime.mcpServers, total: runtime.mcpServers.length };
    case "agents":
      return {
        agentNames: runtime.agents,
        agentDetails: runtime.agentDetails,
        total: runtime.agentDetails.length,
      };
    case "models":
      return {
        models: runtime.models,
        outputStyle: runtime.outputStyle,
        availableOutputStyles: runtime.availableOutputStyles,
      };
    case "summary":
    default:
      return runtime;
  }
}

export function RuntimePage(props: {
  activeSection?: string;
  runtime: RuntimeResponse | null;
}) {
  const page: PlaygroundPageId = "runtime";
  const [previewSlice, setPreviewSlice] = useState<RuntimePreviewSlice>("summary");
  const runtimeStats = [
    {
      label: "Model",
      value: props.runtime?.model ?? "Unavailable",
      detail: props.runtime?.permissionMode ?? "No permission mode reported.",
      tone: "neutral" as const,
    },
    {
      label: "Claude Code",
      value: props.runtime?.claudeCodeVersion ?? "Unavailable",
      detail: props.runtime?.outputStyle ?? "No output style reported.",
      tone: "neutral" as const,
    },
    {
      label: "Tools",
      value: formatNumber(props.runtime?.tools.length),
      detail: `${formatNumber(props.runtime?.commands.length)} structured runtime commands.`,
      tone: "info" as const,
    },
    {
      label: "Loaded skills",
      value: formatNumber(props.runtime?.skills.length),
      detail: "Runtime-loaded skills for the current project.",
      tone: "neutral" as const,
    },
    {
      label: "Plugins",
      value: formatNumber(props.runtime?.plugins.length),
      detail: "Runtime-loaded plugins for this project context.",
      tone: "neutral" as const,
    },
    {
      label: "MCP servers",
      value: formatNumber(props.runtime?.mcpServers.length),
      detail: "Servers Claude reports as part of the current runtime.",
      tone: "info" as const,
    },
    {
      label: "Runtime agents",
      value: formatNumber(props.runtime?.agentDetails.length),
      detail: `${formatNumber(props.runtime?.agents.length)} runtime agent names reported.`,
      tone: "neutral" as const,
    },
    {
      label: "Models",
      value: formatNumber(props.runtime?.models.length),
      detail: `${formatNumber(props.runtime?.availableOutputStyles.length)} available output styles.`,
      tone: "neutral" as const,
    },
  ];

  const operations = [
    {
      method: "GET",
      path: "/api/v1/config/runtime",
      detail: "Inspect the full effective Claude runtime for the current project.",
      sectionId: "runtime-summary",
    },
  ];
  const sections = [
    { id: "runtime-summary", label: "Runtime summary" },
    { id: "runtime-resources", label: "Resource pages" },
    { id: "runtime-payload", label: "Payload preview" },
  ];
  const exampleGroups = [
    {
      title: "Preview slice",
      buttonLabel: "Show",
      items: [
        { label: "Runtime summary", detail: "Inspect the full runtime payload.", action: () => setPreviewSlice("summary") },
        { label: "Tools", detail: "Preview the runtime tool list payload.", action: () => setPreviewSlice("tools") },
        { label: "Commands", detail: "Preview structured runtime command data.", action: () => setPreviewSlice("commands") },
        { label: "Skills", detail: "Preview loaded runtime skills.", action: () => setPreviewSlice("skills") },
        { label: "Plugins", detail: "Preview runtime-loaded plugins.", action: () => setPreviewSlice("plugins") },
        { label: "MCP", detail: "Preview runtime MCP status.", action: () => setPreviewSlice("mcp") },
        { label: "Agents", detail: "Preview runtime agent details.", action: () => setPreviewSlice("agents") },
        { label: "Models", detail: "Preview the runtime model catalog.", action: () => setPreviewSlice("models") },
      ],
    },
  ];
  const resourcePages = [
    {
      href: buildPlaygroundHash("runtime-tools", "runtime-tools-table"),
      label: "Runtime tools",
      detail: "Exact tool names surfaced by Claude for the current project.",
      count: props.runtime?.tools.length ?? 0,
    },
    {
      href: buildPlaygroundHash("runtime-commands", "runtime-commands-table"),
      label: "Supported commands",
      detail: "Structured runtime commands plus discovered legacy command files.",
      count: props.runtime?.commands.length ?? 0,
    },
    {
      href: buildPlaygroundHash("runtime-skills", "runtime-skills-loaded"),
      label: "Skills",
      detail: "Loaded runtime skills and discovered filesystem skills.",
      count: props.runtime?.skills.length ?? 0,
    },
    {
      href: buildPlaygroundHash("runtime-plugins", "runtime-plugins-runtime"),
      label: "Plugins",
      detail: "Runtime-loaded plugins compared against installed plugin discovery.",
      count: props.runtime?.plugins.length ?? 0,
    },
    {
      href: buildPlaygroundHash("runtime-mcp", "runtime-mcp-runtime"),
      label: "MCP servers",
      detail: "Runtime MCP status compared against discovered MCP configuration.",
      count: props.runtime?.mcpServers.length ?? 0,
    },
    {
      href: buildPlaygroundHash("runtime-agents", "runtime-agents-runtime"),
      label: "Agents",
      detail: "Runtime agent details compared against discovered agent files.",
      count: props.runtime?.agentDetails.length ?? 0,
    },
    {
      href: buildPlaygroundHash("runtime-models", "runtime-models-table"),
      label: "Models",
      detail: "The runtime model catalog and output style metadata.",
      count: props.runtime?.models.length ?? 0,
    },
  ];

  return (
    <section className="space-y-8">
      <SectionIntro
        eyebrow="Runtime"
        title="Effective Claude runtime"
        description="This overview keeps the runtime surface small: summary counts here, focused searchable inventories on their own pages. Use it to confirm the current project runtime, then drop into the specific resource page you want to validate."
      />

      <PageBodyWithRail
        page={page}
        activeSection={props.activeSection}
        items={operations}
        exampleGroups={exampleGroups}
        sections={sections}
      >
        <div id="runtime-summary" className="space-y-4">
          <div>
            <div className="text-sm font-medium text-slate-900">Runtime summary</div>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              High-level counts for the effective Claude runtime reported by the middleware.
            </p>
          </div>
          <CompactStatGrid items={runtimeStats} />
        </div>

        <div id="runtime-resources">
          <CompactDataTable
            title="Runtime resource pages"
            description="Each runtime inventory now has a dedicated searchable page backed by middleware endpoints."
            meta={
              <TableMetaBadges
                total={resourcePages.length}
                noun="pages"
              />
            }
            columns={["Resource", "Count", "Route"]}
            rows={resourcePages.map((resource) => ({
              id: resource.href,
              cells: [
                <span className="font-medium text-slate-900">{resource.label}</span>,
                <Badge variant="outline">{formatNumber(resource.count)}</Badge>,
                <a
                  href={resource.href}
                  onClick={(event) => event.stopPropagation()}
                  className="inline-flex h-7 items-center rounded-md border border-slate-200 px-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  Open page
                </a>,
              ],
              previewEyebrow: "Runtime Resource",
              previewTitle: resource.label,
              previewDescription: resource.detail,
              previewMeta: [
                { label: "Count", value: `${formatNumber(resource.count)} items` },
                { label: "Route", value: resource.href.replace("#", "") },
              ],
              drawerMeta: [
                { label: "Count", value: `${formatNumber(resource.count)} items` },
                { label: "Navigation target", value: resource.href },
              ],
              drawerContent: (
                <a
                  href={resource.href}
                  onClick={(event) => event.stopPropagation()}
                  className="inline-flex h-8 items-center rounded-md border border-slate-200 px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  Open {resource.label}
                </a>
              ),
            }))}
            emptyTitle="Runtime resource pages unavailable"
            emptyDetail="The runtime overview could not build the child resource map."
          />
        </div>

        <div id="runtime-payload">
          <JsonPreview
            title="Runtime payload preview"
            data={buildPreviewData(props.runtime, previewSlice)}
            emptyMessage="Runtime payload is not available yet."
          />
        </div>
      </PageBodyWithRail>
    </section>
  );
}
