import type {
  ConfigAgentsResponse,
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

export function ConfigAgentsPage(props: {
  activeSection?: string;
}) {
  const page: PlaygroundPageId = "config-agents";
  const discoveredAgents = useEndpointQuery<ConfigAgentsResponse>("/api/v1/config/agents");
  const operations = [
    {
      method: "GET",
      path: "/api/v1/config/agents",
      detail: "List and search discovered file-based agent definitions.",
      sectionId: "config-agents-table",
    },
    {
      method: "GET",
      path: "/api/v1/metadata/definitions/config-agent",
      detail: "Manage metadata fields for discovered agent files.",
      sectionId: "config-agents-metadata",
    },
  ];
  const sections = [
    { id: "config-agents-table", label: "Agent files" },
    { id: "config-agents-metadata", label: "Metadata" },
    { id: "config-agents-payload", label: "Payload preview" },
  ];
  const exampleGroups = [
    {
      title: "Agent queries",
      buttonLabel: "Apply",
      items: [
        { label: "All agents", detail: "Reset the discovered agent search.", action: () => discoveredAgents.setQuery("") },
        { label: "Project", detail: "Search agent files by project scope.", action: () => discoveredAgents.setQuery("project") },
        { label: "Sonnet", detail: "Search agent files by model naming.", action: () => discoveredAgents.setQuery("sonnet") },
      ],
    },
  ];

  return (
    <section className="space-y-8">
      <SectionIntro
        eyebrow="Configuration"
        title="Discovered agent files"
        description="This page shows the agent definitions the middleware discovered on disk across user, project, and plugin scopes. It stays separate from runtime agents so consumers can distinguish definitions from what Claude actually loaded."
      />

      <PageBodyWithRail
        page={page}
        activeSection={props.activeSection}
        items={operations}
        exampleGroups={exampleGroups}
        sections={sections}
      >
        <div id="config-agents-table">
          <CompactDataTable
            title="Discovered agent files"
            description="File-based agent definitions discovered by the middleware."
            search={{
              value: discoveredAgents.query,
              onChange: discoveredAgents.setQuery,
              placeholder: "Search discovered agents",
            }}
            meta={<TableMetaBadges total={discoveredAgents.data?.total} noun="agents" loading={discoveredAgents.loading} query={discoveredAgents.query} />}
            loading={discoveredAgents.loading}
            error={discoveredAgents.error}
            columns={["Agent", "Scope", "Model"]}
            rows={(discoveredAgents.data?.agents ?? []).map((agent) => ({
              id: agent.path,
              cells: [
                <span className="font-medium text-slate-900">{agent.qualifiedName ?? agent.name}</span>,
                <Badge variant="outline">{agent.scope}</Badge>,
                <span className="text-xs text-slate-500">{agent.model ?? "Default"}</span>,
              ],
              previewEyebrow: "Config Agent",
              previewTitle: agent.qualifiedName ?? agent.name,
              previewDescription: agent.description || "No description",
              previewMeta: [
                {
                  label: "Path",
                  value: <CopyableValue value={agent.path} displayValue={agent.path} mono className="max-w-[260px]" />,
                },
                { label: "Tools", value: agent.tools?.join(", ") || "Default toolset" },
              ],
            }))}
            emptyTitle="No discovered agents matched"
            emptyDetail="The discovered agent route did not return any agent files for this query."
          />
        </div>

        <div id="config-agents-metadata">
          <ResourceMetadataWorkspace
            title="Agent file metadata"
            description="Attach internal labels or ownership metadata to discovered agent files."
            inventories={[
              {
                label: "Discovered agent files",
                resourceType: "config-agent",
                items: (discoveredAgents.data?.agents ?? []).map((agent) => ({
                  id: agent.path,
                  label: agent.qualifiedName ?? agent.name,
                  detail: agent.path,
                })),
              },
            ]}
          />
        </div>

        <div id="config-agents-payload">
          <JsonPreview
            title="Discovered agents payload"
            data={discoveredAgents.data}
            emptyMessage="Discovered agent payload is not available yet."
          />
        </div>
      </PageBodyWithRail>
    </section>
  );
}
