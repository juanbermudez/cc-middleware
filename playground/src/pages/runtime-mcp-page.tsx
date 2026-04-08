import type {
  ConfigMcpResponse,
  PlaygroundPageId,
  RuntimeMcpResponse,
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

export function RuntimeMcpPage(props: {
  activeSection?: string;
}) {
  const page: PlaygroundPageId = "runtime-mcp";
  const runtimeMcp = useEndpointQuery<RuntimeMcpResponse>("/api/v1/config/runtime/mcp");
  const discoveredMcp = useEndpointQuery<ConfigMcpResponse>("/api/v1/config/mcp");
  const operations = [
    {
      method: "GET",
      path: "/api/v1/config/runtime/mcp",
      detail: "List and search MCP servers reported by the current runtime.",
      sectionId: "runtime-mcp-runtime",
    },
    {
      method: "GET",
      path: "/api/v1/config/mcp",
      detail: "List and search MCP servers discovered from config files.",
      sectionId: "runtime-mcp-discovered",
    },
  ];
  const sections = [
    { id: "runtime-mcp-runtime", label: "Runtime MCP" },
    { id: "runtime-mcp-discovered", label: "Discovered MCP" },
    { id: "runtime-mcp-payload", label: "Payload preview" },
  ];
  const exampleGroups = [
    {
      title: "Runtime MCP",
      buttonLabel: "Apply",
      items: [
        { label: "All runtime MCP", detail: "Reset the runtime MCP search.", action: () => runtimeMcp.setQuery("") },
        { label: "Connected", detail: "Search runtime MCP by status.", action: () => runtimeMcp.setQuery("connected") },
        { label: "Local", detail: "Search runtime MCP by common local names.", action: () => runtimeMcp.setQuery("local") },
      ],
    },
    {
      title: "Discovered MCP",
      buttonLabel: "Apply",
      items: [
        { label: "All discovered", detail: "Reset the discovered MCP search.", action: () => discoveredMcp.setQuery("") },
        { label: "Global", detail: "Search discovered MCP by global config names.", action: () => discoveredMcp.setQuery("global") },
        { label: "stdio", detail: "Search discovered MCP by transport.", action: () => discoveredMcp.setQuery("stdio") },
      ],
    },
  ];

  return (
    <section className="space-y-8">
      <SectionIntro
        eyebrow="Runtime MCP"
        title="Runtime and discovered MCP servers"
        description="Runtime MCP status and filesystem-discovered MCP configuration do not always align. This page keeps both searchable through the middleware so we can validate server exposure cleanly."
      />

      <PageBodyWithRail
        page={page}
        activeSection={props.activeSection}
        items={operations}
        exampleGroups={exampleGroups}
        sections={sections}
      >
        <div id="runtime-mcp-runtime">
          <CompactDataTable
            title="Runtime MCP servers"
            description="Servers Claude reports as part of the active runtime."
            search={{
              value: runtimeMcp.query,
              onChange: runtimeMcp.setQuery,
              placeholder: "Search runtime MCP servers",
            }}
            meta={
              <TableMetaBadges
                total={runtimeMcp.data?.total}
                noun="servers"
                loading={runtimeMcp.loading}
                query={runtimeMcp.query}
              />
            }
            loading={runtimeMcp.loading}
            error={runtimeMcp.error}
            columns={["Server", "Status"]}
            rows={(runtimeMcp.data?.servers ?? []).map((server) => ({
              id: `${server.name}-${server.status}`,
              cells: [
                <span className="font-medium text-slate-900">{server.name}</span>,
                <Badge variant={server.status === "connected" ? "success" : "outline"}>
                  {server.status}
                </Badge>,
              ],
              previewEyebrow: "Runtime MCP",
              previewTitle: server.name,
              previewDescription: "Reported by the effective Claude runtime for the current project.",
              previewBadges: [
                <Badge variant={server.status === "connected" ? "success" : "outline"}>
                  {server.status}
                </Badge>,
                <Badge variant="outline">Runtime</Badge>,
              ],
              previewMeta: [
                { label: "Endpoint", value: "/api/v1/config/runtime/mcp" },
                { label: "Search query", value: runtimeMcp.query.trim() || "None" },
              ],
            }))}
            emptyTitle="No runtime MCP servers matched"
            emptyDetail="The runtime MCP route did not return any servers for this query."
          />
        </div>

        <div id="runtime-mcp-discovered">
          <CompactDataTable
            title="Discovered MCP servers"
            description="MCP servers discovered from managed, user, project, local, and plugin config sources."
            search={{
              value: discoveredMcp.query,
              onChange: discoveredMcp.setQuery,
              placeholder: "Search discovered MCP servers",
            }}
            meta={
              <TableMetaBadges
                total={discoveredMcp.data?.total}
                noun="servers"
                loading={discoveredMcp.loading}
                query={discoveredMcp.query}
              />
            }
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
              previewEyebrow: "Discovered MCP",
              previewTitle: server.name,
              previewDescription: "Discovered from middleware MCP config readers.",
              previewBadges: [
                <Badge variant="outline">{server.transport}</Badge>,
                <Badge variant="outline">{server.scope}</Badge>,
              ],
              previewMeta: [
                { label: "Source", value: server.source },
                { label: "Command", value: server.command ?? server.url ?? "No command or URL" },
              ],
            }))}
            emptyTitle="No discovered MCP servers matched"
            emptyDetail="The discovered MCP route did not return any servers for this query."
          />
        </div>

        <div id="runtime-mcp-payload">
          <JsonPreview
            title="Runtime MCP payload"
            data={{
              runtime: runtimeMcp.data,
              discovered: discoveredMcp.data,
            }}
            emptyMessage="Runtime MCP payload is not available yet."
          />
        </div>
      </PageBodyWithRail>
    </section>
  );
}
