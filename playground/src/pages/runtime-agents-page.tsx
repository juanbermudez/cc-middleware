import type {
  PlaygroundPageId,
  RuntimeAgentsResponse,
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

export function RuntimeAgentsPage(props: {
  activeSection?: string;
}) {
  const page: PlaygroundPageId = "runtime-agents";
  const runtimeAgents = useEndpointQuery<RuntimeAgentsResponse>("/api/v1/config/runtime/agents");
  const operations = [
    {
      method: "GET",
      path: "/api/v1/config/runtime/agents",
      detail: "List and search agent details reported by the current runtime.",
      sectionId: "runtime-agents-table",
    },
    {
      method: "GET",
      path: "/api/v1/metadata/definitions/runtime-agent",
      detail: "Manage metadata fields for runtime agents.",
      sectionId: "runtime-agents-metadata",
    },
    {
      method: "PUT",
      path: "/api/v1/metadata/values/runtime-agent/:resourceId",
      detail: "Write metadata onto a selected runtime agent.",
      sectionId: "runtime-agents-metadata",
    },
  ];
  const sections = [
    { id: "runtime-agents-table", label: "Runtime agents" },
    { id: "runtime-agents-metadata", label: "Metadata" },
    { id: "runtime-agents-payload", label: "Payload preview" },
  ];
  const exampleGroups = [
    {
      title: "Runtime agents",
      buttonLabel: "Apply",
      items: [
        { label: "All runtime agents", detail: "Reset the runtime agent search.", action: () => runtimeAgents.setQuery("") },
        { label: "Sonnet", detail: "Search runtime agents by model.", action: () => runtimeAgents.setQuery("sonnet") },
        { label: "Agent", detail: "Search runtime agents by common naming.", action: () => runtimeAgents.setQuery("agent") },
      ],
    },
  ];

  return (
    <section className="space-y-8">
      <SectionIntro
        eyebrow="Runtime Agents"
        title="Runtime agents"
        description="This page stays focused on the agents Claude actually reports in the active runtime. The Configuration section owns discovered agent files on disk."
      />

      <PageBodyWithRail
        page={page}
        activeSection={props.activeSection}
        items={operations}
        exampleGroups={exampleGroups}
        sections={sections}
      >
        <div id="runtime-agents-table">
          <CompactDataTable
            title="Runtime agents"
            description="Agent details Claude reports as part of the active runtime."
            search={{
              value: runtimeAgents.query,
              onChange: runtimeAgents.setQuery,
              placeholder: "Search runtime agents",
            }}
            meta={<TableMetaBadges total={runtimeAgents.data?.total} noun="agents" loading={runtimeAgents.loading} query={runtimeAgents.query} />}
            loading={runtimeAgents.loading}
            error={runtimeAgents.error}
            columns={["Agent", "Model", "State"]}
            rows={(runtimeAgents.data?.agents ?? []).map((agent) => ({
              id: `${agent.name}-${agent.model ?? "none"}`,
              cells: [
                <span className="font-medium text-slate-900">{agent.name}</span>,
                <span className="text-xs text-slate-500">{agent.model ?? "Default"}</span>,
                <Badge variant="info">Runtime</Badge>,
              ],
              previewEyebrow: "Runtime Agent",
              previewTitle: agent.name,
              previewDescription: agent.description || "No description",
              previewMeta: [
                { label: "Endpoint", value: "/api/v1/config/runtime/agents" },
                { label: "Search query", value: runtimeAgents.query.trim() || "None" },
              ],
            }))}
            emptyTitle="No runtime agents matched"
            emptyDetail="The runtime agents route did not return any agents for this query."
          />
        </div>

        <div id="runtime-agents-metadata">
          <ResourceMetadataWorkspace
            title="Runtime agent metadata"
            description="Track internal labels and ownership for runtime agents."
            inventories={[
              {
                label: "Runtime agents",
                resourceType: "runtime-agent",
                items: (runtimeAgents.data?.agents ?? []).map((agent) => ({
                  id: `${agent.name}::${agent.model ?? "default"}`,
                  label: agent.name,
                  detail: agent.model ?? "Default model",
                })),
              },
            ]}
          />
        </div>

        <div id="runtime-agents-payload">
          <JsonPreview
            title="Runtime agents payload"
            data={runtimeAgents.data}
            emptyMessage="Runtime agent payload is not available yet."
          />
        </div>
      </PageBodyWithRail>
    </section>
  );
}
