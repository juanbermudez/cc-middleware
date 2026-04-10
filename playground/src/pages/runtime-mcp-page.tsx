import type {
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
import { ResourceMetadataWorkspace } from "../components/resource-metadata-workspace";

export function RuntimeMcpPage(props: {
  activeSection?: string;
}) {
  const page: PlaygroundPageId = "runtime-mcp";
  const runtimeMcp = useEndpointQuery<RuntimeMcpResponse>("/api/v1/config/runtime/mcp");
  const operations = [
    {
      method: "GET",
      path: "/api/v1/config/runtime/mcp",
      detail: "List and search MCP servers reported by the current runtime.",
      sectionId: "runtime-mcp-table",
    },
    {
      method: "GET",
      path: "/api/v1/metadata/definitions/runtime-mcp",
      detail: "Manage metadata fields for runtime MCP servers.",
      sectionId: "runtime-mcp-metadata",
    },
    {
      method: "PUT",
      path: "/api/v1/metadata/values/runtime-mcp/:resourceId",
      detail: "Write metadata onto a selected runtime MCP server.",
      sectionId: "runtime-mcp-metadata",
    },
  ];
  const sections = [
    { id: "runtime-mcp-table", label: "Runtime MCP" },
    { id: "runtime-mcp-metadata", label: "Metadata" },
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
  ];

  return (
    <section className="space-y-8">
      <SectionIntro
        eyebrow="Runtime MCP"
        title="Runtime MCP servers"
        description="This page focuses on live MCP runtime status only. The Configuration section owns discovered MCP definitions from settings and config files."
      />

      <PageBodyWithRail
        page={page}
        activeSection={props.activeSection}
        items={operations}
        exampleGroups={exampleGroups}
        sections={sections}
      >
        <div id="runtime-mcp-table">
          <CompactDataTable
            title="Runtime MCP servers"
            description="Servers Claude reports as part of the active runtime."
            search={{
              value: runtimeMcp.query,
              onChange: runtimeMcp.setQuery,
              placeholder: "Search runtime MCP servers",
            }}
            meta={<TableMetaBadges total={runtimeMcp.data?.total} noun="servers" loading={runtimeMcp.loading} query={runtimeMcp.query} />}
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
              previewMeta: [
                { label: "Endpoint", value: "/api/v1/config/runtime/mcp" },
                { label: "Search query", value: runtimeMcp.query.trim() || "None" },
              ],
            }))}
            emptyTitle="No runtime MCP servers matched"
            emptyDetail="The runtime MCP route did not return any servers for this query."
          />
        </div>

        <div id="runtime-mcp-metadata">
          <ResourceMetadataWorkspace
            title="Runtime MCP metadata"
            description="Attach internal notes or ownership metadata to runtime MCP exposure."
            inventories={[
              {
                label: "Runtime MCP",
                resourceType: "runtime-mcp",
                items: (runtimeMcp.data?.servers ?? []).map((server) => ({
                  id: server.name,
                  label: server.name,
                  detail: server.status,
                })),
              },
            ]}
          />
        </div>

        <div id="runtime-mcp-payload">
          <JsonPreview
            title="Runtime MCP payload"
            data={runtimeMcp.data}
            emptyMessage="Runtime MCP payload is not available yet."
          />
        </div>
      </PageBodyWithRail>
    </section>
  );
}
