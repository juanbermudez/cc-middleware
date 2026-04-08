import type {
  PlaygroundPageId,
  RuntimeToolsResponse,
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

export function RuntimeToolsPage(props: {
  activeSection?: string;
}) {
  const page: PlaygroundPageId = "runtime-tools";
  const runtimeTools = useEndpointQuery<RuntimeToolsResponse>("/api/v1/config/runtime/tools");
  const operations = [
    {
      method: "GET",
      path: "/api/v1/config/runtime/tools",
      detail: "List and search runtime tools exactly as Claude reports them.",
      sectionId: "runtime-tools-table",
    },
  ];
  const sections = [
    { id: "runtime-tools-table", label: "Runtime tools" },
    { id: "runtime-tools-payload", label: "Payload preview" },
  ];
  const exampleGroups = [
    {
      title: "Tool queries",
      buttonLabel: "Apply",
      items: [
        { label: "All tools", detail: "Reset the runtime tool search.", action: () => runtimeTools.setQuery("") },
        { label: "Read", detail: "Look for the Read tool in the runtime list.", action: () => runtimeTools.setQuery("read") },
        { label: "Bash", detail: "Look for Bash or shell-like tools.", action: () => runtimeTools.setQuery("bash") },
      ],
    },
  ];

  return (
    <section className="space-y-8">
      <SectionIntro
        eyebrow="Runtime Tools"
        title="Runtime tool inventory"
        description="A compact reference page for the exact tool names Claude exposes in the current project runtime. Search runs against the middleware endpoint, not a local in-memory copy."
      />

      <PageBodyWithRail
        page={page}
        activeSection={props.activeSection}
        items={operations}
        exampleGroups={exampleGroups}
        sections={sections}
      >
        <div id="runtime-tools-table">
          <CompactDataTable
            title="Runtime tools"
            description="Tool names surfaced by Claude for the active project runtime."
            search={{
              value: runtimeTools.query,
              onChange: runtimeTools.setQuery,
              placeholder: "Search runtime tools",
            }}
            meta={
              <TableMetaBadges
                total={runtimeTools.data?.total}
                noun="tools"
                loading={runtimeTools.loading}
                query={runtimeTools.query}
              />
            }
            loading={runtimeTools.loading}
            error={runtimeTools.error}
            columns={["Tool", "Source"]}
            rows={(runtimeTools.data?.tools ?? []).map((tool) => ({
              id: tool,
              cells: [
                <span className="font-medium text-slate-900">{tool}</span>,
                <Badge variant="outline">Runtime</Badge>,
              ],
              previewEyebrow: "Runtime Tool",
              previewTitle: tool,
              previewDescription: "Reported directly by Claude for the current project runtime.",
              previewBadges: [
                <Badge variant="info">Tool</Badge>,
                <Badge variant="outline">Runtime</Badge>,
              ],
              previewMeta: [
                { label: "Endpoint", value: "/api/v1/config/runtime/tools" },
                { label: "Search query", value: runtimeTools.query.trim() || "None" },
              ],
            }))}
            emptyTitle="No tools matched"
            emptyDetail="The middleware runtime tool route did not return any tools for this query."
          />
        </div>

        <div id="runtime-tools-payload">
          <JsonPreview
            title="Runtime tools payload"
            data={runtimeTools.data}
            emptyMessage="Runtime tool payload is not available yet."
          />
        </div>
      </PageBodyWithRail>
    </section>
  );
}
