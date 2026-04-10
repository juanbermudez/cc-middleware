import { Badge } from "../components/ui/badge";
import type {
  AvailablePluginsCatalogResponse,
  ConfigPluginsResponse,
  MarketplacesResponse,
  PlaygroundPageId,
} from "../lib/playground";
import { useEndpointQuery } from "../lib/use-endpoint-query";
import { formatNumber, formatTimestamp } from "../lib/utils";
import {
  CompactDataTable,
  CopyableValue,
  JsonPreview,
  PageBodyWithRail,
  SectionIntro,
  TableMetaBadges,
} from "../components/playground-ui";
import { ResourceMetadataWorkspace } from "../components/resource-metadata-workspace";

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

export function ConfigPluginsPage(props: {
  activeSection?: string;
}) {
  const page: PlaygroundPageId = "config-plugins";
  const installedPlugins = useEndpointQuery<ConfigPluginsResponse>("/api/v1/config/plugins");
  const availablePlugins = useEndpointQuery<AvailablePluginsCatalogResponse>("/api/v1/config/plugins/available");
  const marketplaces = useEndpointQuery<MarketplacesResponse>("/api/v1/config/marketplaces");

  const operations = [
    {
      method: "GET",
      path: "/api/v1/config/plugins",
      detail: "Installed plugin inventory discovered from Claude registries and cache metadata.",
      sectionId: "config-plugins-installed",
    },
    {
      method: "GET",
      path: "/api/v1/config/plugins/available",
      detail: "CLI-backed catalog of currently available marketplace plugins.",
      sectionId: "config-plugins-catalog",
    },
    {
      method: "GET",
      path: "/api/v1/config/marketplaces",
      detail: "Known marketplace registries and their install locations.",
      sectionId: "config-plugins-marketplaces",
    },
    {
      method: "GET",
      path: "/api/v1/metadata/definitions/config-plugin",
      detail: "Manage metadata fields for plugin and marketplace records.",
      sectionId: "config-plugins-metadata",
    },
  ];

  const sections = [
    { id: "config-plugins-installed", label: "Installed plugins" },
    { id: "config-plugins-catalog", label: "Available catalog" },
    { id: "config-plugins-marketplaces", label: "Marketplaces" },
    { id: "config-plugins-metadata", label: "Metadata" },
    { id: "config-plugins-payload", label: "Payload preview" },
  ];

  const exampleGroups = [
    {
      title: "Installed plugins",
      buttonLabel: "Apply",
      items: [
        { label: "All installed", detail: "Reset the installed plugin search.", action: () => installedPlugins.setQuery("") },
        { label: "Official", detail: "Search by marketplace or official naming.", action: () => installedPlugins.setQuery("official") },
        { label: "Blocked", detail: "Search by block state or blocked metadata.", action: () => installedPlugins.setQuery("blocked") },
      ],
    },
    {
      title: "Available catalog",
      buttonLabel: "Apply",
      items: [
        { label: "All available", detail: "Reset the available catalog search.", action: () => availablePlugins.setQuery("") },
        { label: "SDK", detail: "Search marketplace catalog for SDK plugins.", action: () => availablePlugins.setQuery("sdk") },
        { label: "GitHub", detail: "Search the catalog for GitHub-related plugins.", action: () => availablePlugins.setQuery("github") },
      ],
    },
    {
      title: "Marketplaces",
      buttonLabel: "Apply",
      items: [
        { label: "All marketplaces", detail: "Reset marketplace search.", action: () => marketplaces.setQuery("") },
        { label: "External", detail: "Search for external marketplace install paths.", action: () => marketplaces.setQuery("external") },
        { label: "Plugins", detail: "Search by marketplace plugin path or count.", action: () => marketplaces.setQuery("plugins") },
      ],
    },
  ];

  return (
    <section className="space-y-8">
      <SectionIntro
        eyebrow="Configuration"
        title="Plugins and marketplaces"
        description="This page is the declarative side of plugin exposure: installed plugin records, available marketplace catalog, and marketplace registries. It complements the runtime plugin page by showing what exists and what could be enabled, not just what is loaded now."
      />

      <PageBodyWithRail
        page={page}
        activeSection={props.activeSection}
        items={operations}
        exampleGroups={exampleGroups}
        sections={sections}
      >
        <div id="config-plugins-installed">
          <CompactDataTable
            title="Installed plugins"
            description="Installed plugin records discovered from Claude's plugin registries, manifests, and cache directories."
            search={{
              value: installedPlugins.query,
              onChange: installedPlugins.setQuery,
              placeholder: "Search installed plugins",
            }}
            meta={<TableMetaBadges total={installedPlugins.data?.total} noun="plugins" loading={installedPlugins.loading} query={installedPlugins.query} />}
            loading={installedPlugins.loading}
            error={installedPlugins.error}
            columns={["Plugin", "Scope", "State", "Features"]}
            rows={(installedPlugins.data?.plugins ?? []).map((plugin) => ({
              id: plugin.id,
              cells: [
                <span className="font-medium text-slate-900">{plugin.name}</span>,
                <Badge variant="outline">{plugin.scope}</Badge>,
                <div className="flex flex-wrap gap-2">
                  <Badge variant={plugin.enabled ? "success" : "outline"}>
                    {plugin.enabled ? "Enabled" : "Disabled"}
                  </Badge>
                  {plugin.blocked ? <Badge variant="destructive">Blocked</Badge> : null}
                </div>,
                <span className="text-xs text-slate-500">{formatPluginFeatures(plugin)}</span>,
              ],
              previewEyebrow: "Installed Plugin",
              previewTitle: plugin.name,
              previewDescription: `${plugin.marketplace} · v${plugin.version}`,
              previewMeta: [
                { label: "Plugin id", value: plugin.id },
                { label: "Features", value: formatPluginFeatures(plugin) },
                { label: "Installed at", value: formatTimestamp(plugin.installedAt) },
              ],
              drawerMeta: [
                { label: "Plugin id", value: plugin.id },
                { label: "Marketplace", value: plugin.marketplace },
                { label: "Scope", value: plugin.scope },
                { label: "Version", value: plugin.version },
                { label: "State", value: plugin.enabled ? "Enabled" : "Disabled" },
              ],
            }))}
            emptyTitle="No installed plugins matched"
            emptyDetail="The installed plugin route did not return any plugins for this query."
          />
        </div>

        <div id="config-plugins-catalog">
          <CompactDataTable
            title="Available marketplace catalog"
            description="Installable plugin catalog from Claude CLI, which can differ from the installed registry and runtime-loaded plugin list."
            search={{
              value: availablePlugins.query,
              onChange: availablePlugins.setQuery,
              placeholder: "Search available plugins",
            }}
            meta={<TableMetaBadges total={availablePlugins.data?.available.length} noun="available entries" loading={availablePlugins.loading} query={availablePlugins.query} />}
            loading={availablePlugins.loading}
            error={availablePlugins.error}
            columns={["Plugin", "Marketplace", "Version"]}
            rows={(availablePlugins.data?.available ?? []).map((plugin) => ({
              id: plugin.pluginId,
              cells: [
                <span className="font-medium text-slate-900">{plugin.name ?? plugin.pluginId}</span>,
                <Badge variant="outline">{plugin.marketplaceName ?? "Unknown"}</Badge>,
                <span className="text-xs text-slate-500">{plugin.version ?? "Unknown"}</span>,
              ],
              previewEyebrow: "Available Plugin",
              previewTitle: plugin.name ?? plugin.pluginId,
              previewDescription: plugin.description || "No description",
              previewMeta: [
                { label: "Plugin id", value: plugin.pluginId },
                { label: "Marketplace", value: plugin.marketplaceName ?? "Unknown" },
              ],
            }))}
            emptyTitle="No available plugins matched"
            emptyDetail="The available plugin catalog route did not return any entries for this query."
          />
        </div>

        <div id="config-plugins-marketplaces">
          <CompactDataTable
            title="Known marketplaces"
            description="Configured plugin marketplaces and their install locations on disk."
            search={{
              value: marketplaces.query,
              onChange: marketplaces.setQuery,
              placeholder: "Search marketplaces",
            }}
            meta={<TableMetaBadges total={marketplaces.data?.total} noun="marketplaces" loading={marketplaces.loading} query={marketplaces.query} />}
            loading={marketplaces.loading}
            error={marketplaces.error}
            columns={["Marketplace", "Installed", "Plugins", "Location"]}
            rows={(marketplaces.data?.marketplaces ?? []).map((marketplace) => ({
              id: marketplace.name,
              cells: [
                <span className="font-medium text-slate-900">{marketplace.name}</span>,
                <Badge variant="outline">{formatNumber(marketplace.installedCount)}</Badge>,
                <Badge variant="outline">{formatNumber(marketplace.pluginCount)}</Badge>,
                marketplace.installLocation ? (
                  <CopyableValue
                    value={marketplace.installLocation}
                    displayValue={marketplace.installLocation}
                    mono
                    className="max-w-[260px]"
                  />
                ) : (
                  <span className="text-xs text-slate-400">Unavailable</span>
                ),
              ],
              previewEyebrow: "Marketplace",
              previewTitle: marketplace.name,
              previewDescription: marketplace.exists ? "Marketplace install location is present on disk." : "Marketplace registry exists, but the install location is missing.",
              previewMeta: [
                { label: "Plugins", value: `${formatNumber(marketplace.pluginCount)} discovered` },
                { label: "Blocked", value: `${formatNumber(marketplace.blockedCount)} blocked` },
                { label: "Updated", value: formatTimestamp(marketplace.lastUpdated) },
              ],
            }))}
            emptyTitle="No marketplaces matched"
            emptyDetail="The marketplace route did not return any entries for this query."
          />
        </div>

        <div id="config-plugins-metadata">
          <ResourceMetadataWorkspace
            title="Plugin and marketplace metadata"
            description="Attach internal rollout notes, ownership, or policy tags to installed plugins, available catalog entries, and marketplace registries."
            inventories={[
              {
                label: "Installed plugins",
                resourceType: "config-plugin",
                items: (installedPlugins.data?.plugins ?? []).map((plugin) => ({
                  id: plugin.id,
                  label: plugin.name,
                  detail: `${plugin.marketplace} · ${plugin.scope}`,
                })),
              },
              {
                label: "Available plugins",
                resourceType: "config-available-plugin",
                items: (availablePlugins.data?.available ?? []).map((plugin) => ({
                  id: plugin.pluginId,
                  label: plugin.name ?? plugin.pluginId,
                  detail: plugin.marketplaceName ?? "Unknown marketplace",
                })),
              },
              {
                label: "Marketplaces",
                resourceType: "config-marketplace",
                items: (marketplaces.data?.marketplaces ?? []).map((marketplace) => ({
                  id: marketplace.name,
                  label: marketplace.name,
                  detail: marketplace.installLocation ?? "No install location",
                })),
              },
            ]}
          />
        </div>

        <div id="config-plugins-payload">
          <JsonPreview
            title="Plugins payload"
            data={{
              installed: installedPlugins.data,
              available: availablePlugins.data,
              marketplaces: marketplaces.data,
            }}
            emptyMessage="Plugin payload is not available yet."
          />
        </div>
      </PageBodyWithRail>
    </section>
  );
}
