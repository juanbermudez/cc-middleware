import type {
  ConfigMcpResponse,
  PlaygroundPageId,
} from "../lib/playground";
import { useEndpointQuery } from "../lib/use-endpoint-query";
import { Badge } from "../components/ui/badge";
import {
  CompactDataTable,
  CopyableValue,
  JsonPreview,
  PageBodyWithRail,
  SectionIntro,
  TableMetaBadges,
} from "../components/playground-ui";
import { ResourceMetadataWorkspace } from "../components/resource-metadata-workspace";

export function ConfigMcpPage(props: {
  activeSection?: string;
}) {
  const page: PlaygroundPageId = "config-mcp";
  const discoveredMcp = useEndpointQuery<ConfigMcpResponse>("/api/v1/config/mcp");
  const operations = [
    {
      method: "GET",
      path: "/api/v1/config/mcp",
      detail: "List and search MCP servers discovered from settings and config files.",
      sectionId: "config-mcp-table",
    },
    {
      method: "GET",
      path: "/api/v1/metadata/definitions/config-mcp",
      detail: "Manage metadata fields for discovered MCP definitions.",
      sectionId: "config-mcp-metadata",
    },
  ];
  const sections = [
    { id: "config-mcp-table", label: "MCP servers" },
    { id: "config-mcp-metadata", label: "Metadata" },
    { id: "config-mcp-payload", label: "Payload preview" },
  ];
  const exampleGroups = [
    {
      title: "MCP queries",
      buttonLabel: "Apply",
      items: [
        { label: "All servers", detail: "Reset the discovered MCP search.", action: () => discoveredMcp.setQuery("") },
        { label: "stdio", detail: "Search discovered MCP definitions by transport.", action: () => discoveredMcp.setQuery("stdio") },
        { label: "Plugin", detail: "Search for plugin-contributed MCP definitions.", action: () => discoveredMcp.setQuery("plugin") },
      ],
    },
  ];

  return (
    <section className="space-y-8">
      <SectionIntro
        eyebrow="Configuration"
        title="Discovered MCP definitions"
        description="The middleware can discover MCP server definitions even when they are not currently active in Claude runtime. This page exposes the config-backed definitions directly so consumers can compare source configuration against live runtime status."
      />

      <PageBodyWithRail
        page={page}
        activeSection={props.activeSection}
        items={operations}
        exampleGroups={exampleGroups}
        sections={sections}
      >
        <div id="config-mcp-table">
          <CompactDataTable
            title="Discovered MCP servers"
            description="MCP server definitions discovered from managed, user, project, local, and plugin config sources."
            search={{
              value: discoveredMcp.query,
              onChange: discoveredMcp.setQuery,
              placeholder: "Search discovered MCP servers",
            }}
            meta={<TableMetaBadges total={discoveredMcp.data?.total} noun="servers" loading={discoveredMcp.loading} query={discoveredMcp.query} />}
            loading={discoveredMcp.loading}
            error={discoveredMcp.error}
            columns={["Server", "Transport", "Scope"]}
            rows={(discoveredMcp.data?.servers ?? []).map((server) => ({
              id: `${server.name}-${server.source}`,
              cells: [
                <span className="font-medium text-slate-900">{server.name}</span>,
                <Badge variant="outline">{server.transport}</Badge>,
                <Badge variant="outline">{server.scope}</Badge>,
              ],
              previewEyebrow: "Config MCP",
              previewTitle: server.name,
              previewDescription: "Discovered from middleware MCP configuration readers.",
              previewMeta: [
                {
                  label: "Source",
                  value: <CopyableValue value={server.source} displayValue={server.source} mono className="max-w-[260px]" />,
                },
                { label: "Command", value: server.command ?? server.url ?? "No command or URL" },
              ],
            }))}
            emptyTitle="No discovered MCP servers matched"
            emptyDetail="The discovered MCP route did not return any servers for this query."
          />
        </div>

        <div id="config-mcp-metadata">
          <ResourceMetadataWorkspace
            title="MCP metadata"
            description="Attach internal ownership or rollout notes to discovered MCP server definitions."
            inventories={[
              {
                label: "Discovered MCP",
                resourceType: "config-mcp",
                items: (discoveredMcp.data?.servers ?? []).map((server) => ({
                  id: `${server.name}::${server.source}`,
                  label: server.name,
                  detail: server.source,
                })),
              },
            ]}
          />
        </div>

        <div id="config-mcp-payload">
          <JsonPreview
            title="Discovered MCP payload"
            data={discoveredMcp.data}
            emptyMessage="Discovered MCP payload is not available yet."
          />
        </div>
      </PageBodyWithRail>
    </section>
  );
}
