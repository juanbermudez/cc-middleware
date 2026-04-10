import { useEffect, useMemo, useState } from "react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  CompactDataTable,
  JsonPreview,
  PageBodyWithRail,
  SectionIntro,
  TableMetaBadges,
  ToolbarPane,
} from "../components/playground-ui";
import { ResourceMetadataWorkspace } from "../components/resource-metadata-workspace";
import type {
  AgentDetailResponse,
  AgentsResponse,
  PlaygroundPageId,
} from "../lib/playground";
import { useEndpointQuery } from "../lib/use-endpoint-query";
import { formatNumber, truncate } from "../lib/utils";

export function AgentsPage(props: {
  activeSection?: string;
}) {
  const page: PlaygroundPageId = "agents";
  const [sessionScope, setSessionScope] = useState("");
  const normalizedSessionScope = sessionScope
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .join(",");
  const agents = useEndpointQuery<AgentsResponse>("/api/v1/agents", {
    params: {
      sessionIds: normalizedSessionScope || undefined,
    },
  });
  const [selectedAgent, setSelectedAgent] = useState("");
  const agentDetail = useEndpointQuery<AgentDetailResponse>(
    selectedAgent ? `/api/v1/agents/${encodeURIComponent(selectedAgent)}` : "/api/v1/agents",
    { enabled: Boolean(selectedAgent) }
  );

  useEffect(() => {
    if (!agents.data?.agents.length) {
      return;
    }

    if (selectedAgent && agents.data.agents.some((agent) => agent.name === selectedAgent)) {
      return;
    }

    setSelectedAgent(agents.data.agents[0].name);
  }, [agents.data, selectedAgent]);

  const operations = [
    {
      method: "GET",
      path: "/api/v1/agents",
      detail: "List and search registered agents from the middleware registry.",
      sectionId: "agents-table",
    },
    {
      method: "GET",
      path: "/api/v1/agents/:name",
      detail: "Inspect a single agent definition, including prompt and tool settings.",
      sectionId: "agents-detail",
    },
    {
      method: "GET",
      path: "/api/v1/metadata/definitions/agent-registry",
      detail: "Manage metadata fields for agent resources.",
      sectionId: "agents-metadata",
    },
    {
      method: "PUT",
      path: "/api/v1/metadata/values/agent-registry/:resourceId",
      detail: "Attach metadata to a registered agent resource.",
      sectionId: "agents-metadata",
    },
  ];
  const sections = [
    { id: "agents-table", label: "Agent registry" },
    { id: "agents-detail", label: "Selected agent" },
    { id: "agents-metadata", label: "Metadata" },
    { id: "agents-payload", label: "Payload preview" },
  ];
  const exampleGroups = [
    {
      title: "Agent queries",
      buttonLabel: "Apply",
      items: [
        { label: "All agents", detail: "Reset the registry search.", action: () => agents.setQuery("") },
        { label: "Runtime", detail: "Search by source or description.", action: () => agents.setQuery("runtime") },
        { label: "Read tool", detail: "Find agents mentioning the Read tool.", action: () => agents.setQuery("read") },
        { label: "Clear session scope", detail: "Remove any session-linked agent filter.", action: () => setSessionScope("") },
      ],
    },
    {
      title: "Agent detail",
      buttonLabel: "Run",
      items: [
        {
          label: "Inspect first agent",
          detail: "Load the first discovered agent definition.",
          action: () => {
            const firstAgent = agents.data?.agents[0]?.name;
            if (firstAgent) {
              setSelectedAgent(firstAgent);
            }
          },
        },
      ],
    },
  ];

  const metadataItems = useMemo(
    () => (agents.data?.agents ?? []).map((agent) => ({
      id: `${agent.name}::${agent.source}`,
      label: agent.name,
      detail: agent.source,
    })),
    [agents.data]
  );

  return (
    <section className="space-y-8">
      <SectionIntro
        eyebrow="Agents"
        title="Registered agents"
        description="Registered agents are exposed as their own searchable middleware resource. This page keeps the registry, definition detail, and metadata contract separate from teams and runtime-loaded agent state."
      />

      <PageBodyWithRail
        page={page}
        activeSection={props.activeSection}
        items={operations}
        exampleGroups={exampleGroups}
        sections={sections}
      >
        <ToolbarPane
          title="Session scope"
          description="Filter registered agents by one or more session ids. The middleware resolves these matches through indexed session relationship identifiers like agent id, teammate name, and slug."
        >
          <div className="flex flex-wrap gap-3">
            <Input
              value={sessionScope}
              onChange={(event) => setSessionScope(event.target.value)}
              className="min-w-[280px] flex-1"
              placeholder="session-1, session-2"
            />
            <Badge variant="outline">
              {normalizedSessionScope ? `${normalizedSessionScope.split(",").length} session ids` : "All sessions"}
            </Badge>
          </div>
        </ToolbarPane>

        <div id="agents-table">
          <CompactDataTable
            title="Agent registry"
            description="Searchable agent inventory from GET /api/v1/agents, with optional session-linked filtering."
            search={{
              value: agents.query,
              onChange: agents.setQuery,
              placeholder: "Search agents, models, tools, or source",
            }}
            meta={<TableMetaBadges total={agents.data?.total} noun="agents" loading={agents.loading} query={agents.query} />}
            loading={agents.loading}
            error={agents.error}
            columns={["Agent", "Source", "Model", "Actions"]}
            rows={(agents.data?.agents ?? []).map((agent) => ({
              id: `${agent.name}::${agent.source}`,
              cells: [
                <div className="space-y-0.5">
                  <div className="font-medium text-slate-900">{agent.name}</div>
                  <div className="text-xs text-slate-500">{truncate(agent.description, 72)}</div>
                </div>,
                <Badge variant="outline">{agent.source}</Badge>,
                agent.model
                  ? <Badge variant="outline">{agent.model}</Badge>
                  : <span className="text-xs text-slate-400">Default</span>,
                <Button
                  type="button"
                  variant={selectedAgent === agent.name ? "secondary" : "ghost"}
                  size="sm"
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedAgent(agent.name);
                  }}
                >
                  {selectedAgent === agent.name ? "Selected" : "Inspect"}
                </Button>,
              ],
              previewEyebrow: "Agent",
              previewTitle: agent.name,
              previewDescription: agent.description || "No description",
              previewMeta: [
                { label: "Source", value: agent.source },
                { label: "Model", value: agent.model ?? "Default" },
                { label: "Tools", value: formatNumber(agent.tools?.length) },
              ],
            }))}
            emptyTitle="No agents matched"
            emptyDetail="The agent registry did not return any agents for this query."
          />
        </div>

        <div id="agents-detail">
          <CompactDataTable
            title="Selected agent detail"
            description="Definition surface from GET /api/v1/agents/:name."
            meta={(
              <div className="flex flex-wrap gap-2">
                {agentDetail.data?.name ? <Badge variant="outline">{agentDetail.data.name}</Badge> : null}
                {agentDetail.data?.source ? <Badge variant="outline">{agentDetail.data.source}</Badge> : null}
                <TableMetaBadges total={agentDetail.data?.tools?.length} noun="tools" loading={agentDetail.loading} />
              </div>
            )}
            loading={agentDetail.loading}
            error={agentDetail.error}
            columns={["Setting", "Value"]}
            rows={agentDetail.data ? [
              {
                id: `${agentDetail.data.name}-description`,
                cells: [
                  <span className="font-medium text-slate-900">Description</span>,
                  <span className="text-sm text-slate-600">{truncate(agentDetail.data.description, 120)}</span>,
                ],
                previewEyebrow: "Agent Detail",
                previewTitle: agentDetail.data.name,
                previewDescription: agentDetail.data.description || "No description",
                previewMeta: [
                  { label: "Source", value: agentDetail.data.source },
                  { label: "Model", value: agentDetail.data.model ?? "Default" },
                ],
                drawerMeta: [
                  { label: "Name", value: agentDetail.data.name },
                  { label: "Source", value: agentDetail.data.source },
                  { label: "Model", value: agentDetail.data.model ?? "Default" },
                  { label: "Max turns", value: agentDetail.data.maxTurns ? `${agentDetail.data.maxTurns}` : "Default" },
                  { label: "Tools", value: agentDetail.data.tools?.join(", ") || "Default toolset" },
                  { label: "Disallowed", value: agentDetail.data.disallowedTools?.join(", ") || "None" },
                ],
                drawerContent: (
                  <JsonPreview
                    title="Agent definition"
                    data={agentDetail.data}
                    emptyMessage="Agent detail is not available."
                  />
                ),
              },
              {
                id: `${agentDetail.data.name}-prompt`,
                cells: [
                  <span className="font-medium text-slate-900">Prompt</span>,
                  <span className="text-sm text-slate-600">{truncate(agentDetail.data.prompt, 120)}</span>,
                ],
                previewEyebrow: "Agent Prompt",
                previewTitle: agentDetail.data.name,
                previewDescription: truncate(agentDetail.data.prompt, 300),
                previewMeta: [
                  { label: "Length", value: `${agentDetail.data.prompt.length} chars` },
                ],
              },
            ] : []}
            emptyTitle={selectedAgent ? "No detail returned" : "No agent selected"}
            emptyDetail={selectedAgent
              ? "The selected agent did not return definition details."
              : "Select an agent from the registry to inspect its definition."}
          />
        </div>

        <div id="agents-metadata">
          <ResourceMetadataWorkspace
            title="Agent metadata"
            description="Attach internal metadata to registry agents so downstream clients can search, group, and label them without mutating the agent definition itself."
            inventories={[
              {
                label: "Registered agents",
                resourceType: "agent-registry",
                items: metadataItems,
              },
            ]}
          />
        </div>

        <div id="agents-payload">
          <JsonPreview
            title="Agent payload"
            data={{
              agents: agents.data,
              selectedAgent: agentDetail.data,
            }}
            emptyMessage="Agent payload is not available yet."
          />
        </div>
      </PageBodyWithRail>
    </section>
  );
}
