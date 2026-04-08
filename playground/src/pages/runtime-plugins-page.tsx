import type {
  ConfigPluginsResponse,
  PlaygroundPageId,
  RuntimePluginsResponse,
} from "../lib/playground";
import { useEndpointQuery } from "../lib/use-endpoint-query";
import { Badge } from "../components/ui/badge";
import {
  CompactDataTable,
  JsonPreview,
  PageBodyWithRail,
  SectionIntro,
  TableMetaBadges,
} from "../components/playground-ui";

function formatPluginFeatures(plugin: {
  hasCommands?: boolean;
  hasSkills?: boolean;
  hasAgents?: boolean;
  hasMcpServers?: boolean;
}): string {
  const features = [
    plugin.hasSkills ? "skills" : null,
    plugin.hasCommands ? "commands" : null,
    plugin.hasAgents ? "agents" : null,
    plugin.hasMcpServers ? "mcp" : null,
  ].filter(Boolean);

  return features.length > 0 ? features.join(", ") : "No bundled components";
}

export function RuntimePluginsPage(props: {
  activeSection?: string;
}) {
  const page: PlaygroundPageId = "runtime-plugins";
  const runtimePlugins = useEndpointQuery<RuntimePluginsResponse>("/api/v1/config/runtime/plugins");
  const discoveredPlugins = useEndpointQuery<ConfigPluginsResponse>("/api/v1/config/plugins");
  const operations = [
    {
      method: "GET",
      path: "/api/v1/config/runtime/plugins",
      detail: "List and search plugins loaded into the current runtime.",
      sectionId: "runtime-plugins-runtime",
    },
    {
      method: "GET",
      path: "/api/v1/config/plugins",
      detail: "List and search installed plugins discovered by the middleware.",
      sectionId: "runtime-plugins-installed",
    },
  ];
  const sections = [
    { id: "runtime-plugins-runtime", label: "Runtime plugins" },
    { id: "runtime-plugins-installed", label: "Installed plugins" },
    { id: "runtime-plugins-payload", label: "Payload preview" },
  ];
  const exampleGroups = [
    {
      title: "Runtime plugins",
      buttonLabel: "Apply",
      items: [
        { label: "All runtime plugins", detail: "Reset the runtime plugin search.", action: () => runtimePlugins.setQuery("") },
        { label: "SDK tools", detail: "Search runtime plugins for SDK tooling.", action: () => runtimePlugins.setQuery("sdk") },
        { label: "Plugin dev", detail: "Search runtime plugins for development helpers.", action: () => runtimePlugins.setQuery("plugin") },
      ],
    },
    {
      title: "Installed plugins",
      buttonLabel: "Apply",
      items: [
        { label: "All installed", detail: "Reset the installed plugin search.", action: () => discoveredPlugins.setQuery("") },
        { label: "Official", detail: "Search installed plugins by marketplace.", action: () => discoveredPlugins.setQuery("official") },
        { label: "Blocked", detail: "Search installed plugins by block state.", action: () => discoveredPlugins.setQuery("blocked") },
      ],
    },
  ];

  return (
    <section className="space-y-8">
      <SectionIntro
        eyebrow="Runtime Plugins"
        title="Runtime and installed plugins"
        description="Runtime-loaded plugins and installed plugin discovery often diverge, so this page keeps them separate. Search both surfaces through the middleware to validate what Claude loaded versus what is merely installed."
      />

      <PageBodyWithRail
        page={page}
        activeSection={props.activeSection}
        items={operations}
        exampleGroups={exampleGroups}
        sections={sections}
      >
        <div id="runtime-plugins-runtime">
          <CompactDataTable
            title="Runtime plugins"
            description="Plugins Claude reports as loaded in the current project runtime."
            search={{
              value: runtimePlugins.query,
              onChange: runtimePlugins.setQuery,
              placeholder: "Search runtime plugins",
            }}
            meta={
              <TableMetaBadges
                total={runtimePlugins.data?.total}
                noun="plugins"
                loading={runtimePlugins.loading}
                query={runtimePlugins.query}
              />
            }
            loading={runtimePlugins.loading}
            error={runtimePlugins.error}
            columns={["Plugin", "Source", "State"]}
            rows={(runtimePlugins.data?.plugins ?? []).map((plugin) => ({
              id: `${plugin.name}-${plugin.path}`,
              cells: [
                <span className="font-medium text-slate-900">{plugin.name}</span>,
                <span className="text-xs text-slate-500">{plugin.source ?? "Runtime"}</span>,
                <Badge variant="info">Loaded</Badge>,
              ],
              previewEyebrow: "Runtime Plugin",
              previewTitle: plugin.name,
              previewDescription: "Loaded into the active Claude runtime for this project.",
              previewBadges: [
                <Badge variant="info">Loaded</Badge>,
                <Badge variant="outline">Runtime</Badge>,
              ],
              previewMeta: [
                { label: "Path", value: plugin.path },
                { label: "Source", value: plugin.source ?? "Runtime" },
              ],
            }))}
            emptyTitle="No runtime plugins matched"
            emptyDetail="The middleware runtime plugin route did not return any plugins for this query."
          />
        </div>

        <div id="runtime-plugins-installed">
          <CompactDataTable
            title="Installed plugins"
            description="Installed plugins discovered by the middleware from Claude config and plugin registries."
            search={{
              value: discoveredPlugins.query,
              onChange: discoveredPlugins.setQuery,
              placeholder: "Search installed plugins",
            }}
            meta={
              <TableMetaBadges
                total={discoveredPlugins.data?.total}
                noun="plugins"
                loading={discoveredPlugins.loading}
                query={discoveredPlugins.query}
              />
            }
            loading={discoveredPlugins.loading}
            error={discoveredPlugins.error}
            columns={["Plugin", "Scope", "Features"]}
            rows={(discoveredPlugins.data?.plugins ?? []).map((plugin) => ({
              id: plugin.id,
              cells: [
                <span className="font-medium text-slate-900">{plugin.name}</span>,
                <Badge variant="outline">{plugin.scope}</Badge>,
                <span className="text-xs text-slate-500">{formatPluginFeatures(plugin)}</span>,
              ],
              previewEyebrow: "Installed Plugin",
              previewTitle: plugin.name,
              previewDescription: `${plugin.marketplace} · v${plugin.version}`,
              previewBadges: [
                <Badge variant={plugin.enabled ? "success" : "outline"}>
                  {plugin.enabled ? "Enabled" : "Disabled"}
                </Badge>,
                <Badge variant="outline">{plugin.scope}</Badge>,
                ...(plugin.blocked ? [<Badge variant="destructive">Blocked</Badge>] : []),
              ],
              previewMeta: [
                { label: "Plugin ID", value: plugin.id },
                { label: "Marketplace", value: plugin.marketplace },
                { label: "Features", value: formatPluginFeatures(plugin) },
              ],
            }))}
            emptyTitle="No installed plugins matched"
            emptyDetail="The installed plugin route did not return any plugins for this query."
          />
        </div>

        <div id="runtime-plugins-payload">
          <JsonPreview
            title="Runtime plugins payload"
            data={{
              runtime: runtimePlugins.data,
              installed: discoveredPlugins.data,
            }}
            emptyMessage="Runtime plugin payload is not available yet."
          />
        </div>
      </PageBodyWithRail>
    </section>
  );
}
