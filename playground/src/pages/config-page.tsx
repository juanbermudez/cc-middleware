import { Badge } from "../components/ui/badge";
import type {
  ConfigAgentsResponse,
  ConfigCommandsResponse,
  ConfigMcpResponse,
  ConfigPluginsResponse,
  ConfigSkillsResponse,
  GlobalConfigSummaryResponse,
  PlaygroundPageId,
  TrackedProjectsResponse,
} from "../lib/playground";
import { buildPlaygroundHash } from "../lib/playground";
import { useEndpointQuery } from "../lib/use-endpoint-query";
import { formatNumber } from "../lib/utils";
import {
  CompactDataTable,
  CompactStatGrid,
  JsonPreview,
  PageBodyWithRail,
  SectionIntro,
  TableMetaBadges,
} from "../components/playground-ui";

export function ConfigPage(props: {
  activeSection?: string;
}) {
  const page: PlaygroundPageId = "config";
  const globalConfig = useEndpointQuery<GlobalConfigSummaryResponse>("/api/v1/config/global");
  const projects = useEndpointQuery<TrackedProjectsResponse>("/api/v1/config/projects");
  const plugins = useEndpointQuery<ConfigPluginsResponse>("/api/v1/config/plugins");
  const skills = useEndpointQuery<ConfigSkillsResponse>("/api/v1/config/skills");
  const commands = useEndpointQuery<ConfigCommandsResponse>("/api/v1/config/commands");
  const agents = useEndpointQuery<ConfigAgentsResponse>("/api/v1/config/agents");
  const mcp = useEndpointQuery<ConfigMcpResponse>("/api/v1/config/mcp");

  const summaryStats = [
    {
      label: "Tracked projects",
      value: formatNumber(projects.data?.total),
      detail: `${formatNumber(globalConfig.data?.trackedProjectCount)} projects recorded in global state.`,
      tone: "neutral" as const,
    },
    {
      label: "Installed plugins",
      value: formatNumber(plugins.data?.total),
      detail: "Registry-backed plugin discovery from Claude config and plugin caches.",
      tone: "info" as const,
    },
    {
      label: "Filesystem skills",
      value: formatNumber(skills.data?.total),
      detail: `${formatNumber(commands.data?.total)} command files and ${formatNumber(agents.data?.total)} agent files discovered.`,
      tone: "neutral" as const,
    },
    {
      label: "MCP configs",
      value: formatNumber(mcp.data?.total),
      detail: `${formatNumber(globalConfig.data?.userMcpCount)} user MCP entries referenced in global state.`,
      tone: "info" as const,
    },
  ];

  const operations = [
    {
      method: "GET",
      path: "/api/v1/config/runtime",
      detail: "Effective Claude runtime for the current project.",
      sectionId: "config-summary",
    },
    {
      method: "GET",
      path: "/api/v1/config/settings",
      detail: "Merged effective settings and permission state.",
      sectionId: "config-contract",
    },
    {
      method: "GET",
      path: "/api/v1/config/plugins",
      detail: "Installed plugin inventory discovered from Claude registries.",
      sectionId: "config-resource-families",
    },
    {
      method: "GET",
      path: "/api/v1/config/memory",
      detail: "Project memory and guidance content from Claude-managed files.",
      sectionId: "config-content-surfaces",
    },
  ];

  const sections = [
    { id: "config-summary", label: "Summary" },
    { id: "config-contract", label: "Contract" },
    { id: "config-resource-families", label: "Shared families" },
    { id: "config-content-surfaces", label: "Config-only surfaces" },
    { id: "config-payload", label: "Payload preview" },
  ];

  const runtimeVsConfig = [
    {
      id: "skills",
      label: "Skills",
      runtime: "Loaded into the active Claude runtime for this cwd.",
      config: "Discovered from user, project, and plugin skill files on disk.",
      runtimeHref: buildPlaygroundHash("runtime-skills", "runtime-skills-table"),
      configHref: buildPlaygroundHash("config-skills", "config-skills-table"),
      count: formatNumber(skills.data?.total),
    },
    {
      id: "commands",
      label: "Commands",
      runtime: "Structured commands Claude reports after runtime init.",
      config: "Legacy command markdown files discovered by the middleware.",
      runtimeHref: buildPlaygroundHash("runtime-commands", "runtime-commands-table"),
      configHref: buildPlaygroundHash("config-commands", "config-commands-table"),
      count: formatNumber(commands.data?.total),
    },
    {
      id: "plugins",
      label: "Plugins",
      runtime: "Plugins actually loaded for the current project runtime.",
      config: "Installed plugin records, marketplace registries, and CLI catalog.",
      runtimeHref: buildPlaygroundHash("runtime-plugins", "runtime-plugins-table"),
      configHref: buildPlaygroundHash("config-plugins", "config-plugins-installed"),
      count: formatNumber(plugins.data?.total),
    },
    {
      id: "mcp",
      label: "MCP servers",
      runtime: "Servers Claude currently reports as active or connected.",
      config: "Server definitions discovered from managed, user, local, project, and plugin config.",
      runtimeHref: buildPlaygroundHash("runtime-mcp", "runtime-mcp-table"),
      configHref: buildPlaygroundHash("config-mcp", "config-mcp-table"),
      count: formatNumber(mcp.data?.total),
    },
    {
      id: "agents",
      label: "Agents",
      runtime: "Agent details exposed by the current runtime.",
      config: "File-based agent definitions discovered across user, project, and plugin scopes.",
      runtimeHref: buildPlaygroundHash("runtime-agents", "runtime-agents-table"),
      configHref: buildPlaygroundHash("config-agents", "config-agents-table"),
      count: formatNumber(agents.data?.total),
    },
  ];

  const configOnlySurfaces = [
    {
      id: "settings",
      label: "Settings and projects",
      detail: "Merged settings, scope files, global preferences, and tracked project state.",
      count: formatNumber(projects.data?.total),
      href: buildPlaygroundHash("config-settings", "config-settings-global"),
    },
    {
      id: "memory",
      label: "Memory and guidance",
      detail: "Project memory, all memory directories, rules, and CLAUDE.md instruction files.",
      count: `${formatNumber(globalConfig.data?.featureFlagCount)} flags`,
      href: buildPlaygroundHash("config-memory", "config-memory-summary"),
    },
  ];

  return (
    <section className="space-y-8">
      <SectionIntro
        eyebrow="Configuration"
        title="Declarative and discovered Claude state"
        description="Runtime and configuration answer different questions, so they should be listed separately. Runtime is the effective project state Claude loaded right now. Configuration is the underlying settings, files, registries, and content the middleware can discover, manage, and compare against runtime."
      />

      <PageBodyWithRail
        page={page}
        activeSection={props.activeSection}
        items={operations}
        sections={sections}
      >
        <div id="config-summary" className="space-y-4">
          <div>
            <div className="text-sm font-medium text-slate-900">Summary</div>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              This section covers the persistent surfaces behind Claude Code: settings files, tracked projects, plugin registries, filesystem components, MCP config, and memory content.
            </p>
          </div>
          <CompactStatGrid items={summaryStats} />
        </div>

        <div id="config-contract">
          <CompactDataTable
            title="Why runtime and configuration stay separate"
            description="The playground now treats runtime as an effective view and configuration as a source/discovery view so consumers can reason about drift explicitly."
            columns={["Question", "Runtime answers", "Configuration answers"]}
            rows={[
              {
                id: "loaded-now",
                cells: [
                  <span className="font-medium text-slate-900">What did Claude actually load for this cwd?</span>,
                  <Badge variant="info">Runtime pages</Badge>,
                  <span className="text-xs text-slate-500">Not the primary source for this question.</span>,
                ],
                previewEyebrow: "Contract",
                previewTitle: "Effective runtime",
                previewDescription: "Use runtime pages when you need the active model, toolset, loaded plugins, runtime skills, runtime MCP state, or runtime agents for the current project.",
              },
              {
                id: "installed-on-disk",
                cells: [
                  <span className="font-medium text-slate-900">What is installed, declared, or discoverable on disk?</span>,
                  <span className="text-xs text-slate-500">Runtime may omit inactive or unloaded resources.</span>,
                  <Badge variant="info">Configuration pages</Badge>,
                ],
                previewEyebrow: "Contract",
                previewTitle: "Declarative and discovered config",
                previewDescription: "Use configuration pages when you need settings, tracked projects, plugin registries, command files, skill files, agent files, MCP definitions, memory, and CLAUDE.md instructions.",
              },
            ]}
            emptyTitle="Configuration contract unavailable"
            emptyDetail="The runtime/config separation matrix could not be rendered."
          />
        </div>

        <div id="config-resource-families">
          <CompactDataTable
            title="Resource families with both runtime and config views"
            description="These inventories exist in two layers. The playground now gives each layer its own page so API consumers can validate both cleanly."
            meta={<TableMetaBadges total={runtimeVsConfig.length} noun="families" />}
            columns={["Resource", "Runtime page", "Config page", "Config count"]}
            rows={runtimeVsConfig.map((item) => ({
              id: item.id,
              cells: [
                <span className="font-medium text-slate-900">{item.label}</span>,
                <a
                  href={item.runtimeHref}
                  onClick={(event) => event.stopPropagation()}
                  className="inline-flex h-7 items-center rounded-md border border-slate-200 px-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  Open runtime
                </a>,
                <a
                  href={item.configHref}
                  onClick={(event) => event.stopPropagation()}
                  className="inline-flex h-7 items-center rounded-md border border-slate-200 px-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  Open config
                </a>,
                <Badge variant="outline">{item.count}</Badge>,
              ],
              previewEyebrow: "Shared Resource Family",
              previewTitle: item.label,
              previewDescription: item.config,
              previewMeta: [
                { label: "Runtime meaning", value: item.runtime },
                { label: "Config meaning", value: item.config },
              ],
            }))}
            emptyTitle="No shared resource families"
            emptyDetail="The runtime/config resource map is unavailable."
          />
        </div>

        <div id="config-content-surfaces">
          <CompactDataTable
            title="Configuration-only surfaces"
            description="These are middleware-managed or filesystem-backed configuration surfaces that do not have a separate runtime inventory page."
            meta={<TableMetaBadges total={configOnlySurfaces.length} noun="surfaces" />}
            columns={["Surface", "Count", "Route"]}
            rows={configOnlySurfaces.map((item) => ({
              id: item.id,
              cells: [
                <span className="font-medium text-slate-900">{item.label}</span>,
                <Badge variant="outline">{item.count}</Badge>,
                <a
                  href={item.href}
                  onClick={(event) => event.stopPropagation()}
                  className="inline-flex h-7 items-center rounded-md border border-slate-200 px-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  Open page
                </a>,
              ],
              previewEyebrow: "Config Surface",
              previewTitle: item.label,
              previewDescription: item.detail,
              previewMeta: [
                { label: "Route", value: item.href.replace("#", "") },
                { label: "Purpose", value: item.detail },
              ],
            }))}
            emptyTitle="No config-only surfaces"
            emptyDetail="The configuration-only page map is unavailable."
          />
        </div>

        <div id="config-payload">
          <JsonPreview
            title="Configuration overview payload"
            data={{
              global: globalConfig.data,
              projects: projects.data,
              plugins: plugins.data,
              skills: skills.data,
              commands: commands.data,
              agents: agents.data,
              mcp: mcp.data,
            }}
            emptyMessage="Configuration overview payload is not available yet."
          />
        </div>
      </PageBodyWithRail>
    </section>
  );
}
