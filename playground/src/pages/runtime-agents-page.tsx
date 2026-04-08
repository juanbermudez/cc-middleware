import type {
  ConfigAgentsResponse,
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
import { truncate } from "../lib/utils";

export function RuntimeAgentsPage(props: {
  activeSection?: string;
}) {
  const page: PlaygroundPageId = "runtime-agents";
  const runtimeAgents = useEndpointQuery<RuntimeAgentsResponse>("/api/v1/config/runtime/agents");
  const discoveredAgents = useEndpointQuery<ConfigAgentsResponse>("/api/v1/config/agents");
  const operations = [
    {
      method: "GET",
      path: "/api/v1/config/runtime/agents",
      detail: "List and search agent details reported by the current runtime.",
      sectionId: "runtime-agents-runtime",
    },
    {
      method: "GET",
      path: "/api/v1/config/agents",
      detail: "List and search discovered file-based agent definitions.",
      sectionId: "runtime-agents-discovered",
    },
  ];
  const sections = [
    { id: "runtime-agents-runtime", label: "Runtime agents" },
    { id: "runtime-agents-discovered", label: "Discovered agents" },
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
    {
      title: "Discovered agents",
      buttonLabel: "Apply",
      items: [
        { label: "All discovered", detail: "Reset the discovered agent search.", action: () => discoveredAgents.setQuery("") },
        { label: "Project", detail: "Search discovered agents by scope.", action: () => discoveredAgents.setQuery("project") },
        { label: "API test", detail: "Search discovered agents for the API fixture agent.", action: () => discoveredAgents.setQuery("api-test") },
      ],
    },
  ];

  return (
    <section className="space-y-8">
      <SectionIntro
        eyebrow="Runtime Agents"
        title="Runtime agents and discovered agent files"
        description="Runtime agent details and discovered agent files are both useful, but they answer different questions. This page keeps both searchable through the middleware so we can validate file discovery against the active runtime."
      />

      <PageBodyWithRail
        page={page}
        activeSection={props.activeSection}
        items={operations}
        exampleGroups={exampleGroups}
        sections={sections}
      >
        <div id="runtime-agents-runtime">
          <CompactDataTable
            title="Runtime agents"
            description="Agent details Claude reports as part of the active runtime."
            search={{
              value: runtimeAgents.query,
              onChange: runtimeAgents.setQuery,
              placeholder: "Search runtime agents",
            }}
            meta={
              <TableMetaBadges
                total={runtimeAgents.data?.total}
                noun="agents"
                loading={runtimeAgents.loading}
                query={runtimeAgents.query}
              />
            }
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
              previewBadges: [
                <Badge variant="info">Runtime</Badge>,
                ...(agent.model ? [<Badge variant="outline">{agent.model}</Badge>] : []),
              ],
              previewMeta: [
                { label: "Endpoint", value: "/api/v1/config/runtime/agents" },
                { label: "Search query", value: runtimeAgents.query.trim() || "None" },
              ],
            }))}
            emptyTitle="No runtime agents matched"
            emptyDetail="The runtime agents route did not return any agents for this query."
          />
        </div>

        <div id="runtime-agents-discovered">
          <CompactDataTable
            title="Discovered agent files"
            description="Agent definitions discovered by the middleware from user, project, and plugin scopes."
            search={{
              value: discoveredAgents.query,
              onChange: discoveredAgents.setQuery,
              placeholder: "Search discovered agents",
            }}
            meta={
              <TableMetaBadges
                total={discoveredAgents.data?.total}
                noun="agents"
                loading={discoveredAgents.loading}
                query={discoveredAgents.query}
              />
            }
            loading={discoveredAgents.loading}
            error={discoveredAgents.error}
            columns={["Agent", "Scope", "Model"]}
            rows={(discoveredAgents.data?.agents ?? []).map((agent) => ({
              id: agent.path,
              cells: [
                <span className="font-medium text-slate-900">
                  {agent.qualifiedName ?? agent.name}
                </span>,
                <Badge variant="outline">{agent.scope}</Badge>,
                <span className="text-xs text-slate-500">{agent.model ?? "Default"}</span>,
              ],
              previewEyebrow: "Discovered Agent",
              previewTitle: agent.qualifiedName ?? agent.name,
              previewDescription: agent.description || "No description",
              previewBadges: [
                <Badge variant="outline">{agent.scope}</Badge>,
                ...(agent.model ? [<Badge variant="outline">{agent.model}</Badge>] : []),
              ],
              previewMeta: [
                { label: "Path", value: truncate(agent.path, 108) },
                { label: "Tools", value: agent.tools?.join(", ") || "Default toolset" },
              ],
            }))}
            emptyTitle="No discovered agents matched"
            emptyDetail="The discovered agents route did not return any agent files for this query."
          />
        </div>

        <div id="runtime-agents-payload">
          <JsonPreview
            title="Runtime agents payload"
            data={{
              runtime: runtimeAgents.data,
              discovered: discoveredAgents.data,
            }}
            emptyMessage="Runtime agent payload is not available yet."
          />
        </div>
      </PageBodyWithRail>
    </section>
  );
}
