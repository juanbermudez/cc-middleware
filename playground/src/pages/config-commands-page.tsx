import type {
  ConfigCommandsResponse,
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

function formatArgumentHint(value: string | string[] | undefined): string {
  if (!value) {
    return "No args";
  }
  return Array.isArray(value) ? value.join(" ") : value;
}

export function ConfigCommandsPage(props: {
  activeSection?: string;
}) {
  const page: PlaygroundPageId = "config-commands";
  const discoveredCommands = useEndpointQuery<ConfigCommandsResponse>("/api/v1/config/commands");
  const operations = [
    {
      method: "GET",
      path: "/api/v1/config/commands",
      detail: "List and search legacy command markdown files discovered on disk.",
      sectionId: "config-commands-table",
    },
    {
      method: "GET",
      path: "/api/v1/metadata/definitions/config-command",
      detail: "Manage metadata fields for discovered command files.",
      sectionId: "config-commands-metadata",
    },
  ];
  const sections = [
    { id: "config-commands-table", label: "Commands" },
    { id: "config-commands-metadata", label: "Metadata" },
    { id: "config-commands-payload", label: "Payload preview" },
  ];
  const exampleGroups = [
    {
      title: "Command queries",
      buttonLabel: "Apply",
      items: [
        { label: "All commands", detail: "Reset the discovered command search.", action: () => discoveredCommands.setQuery("") },
        { label: "SDK", detail: "Search command files for SDK naming.", action: () => discoveredCommands.setQuery("sdk") },
        { label: "Plugin", detail: "Search command files by plugin source.", action: () => discoveredCommands.setQuery("plugin") },
      ],
    },
  ];

  return (
    <section className="space-y-8">
      <SectionIntro
        eyebrow="Configuration"
        title="Discovered command files"
        description="Legacy slash command files are a declarative surface, not a runtime guarantee. This page shows the files the middleware discovered, while the runtime commands page shows the structured commands Claude currently reports."
      />

      <PageBodyWithRail
        page={page}
        activeSection={props.activeSection}
        items={operations}
        exampleGroups={exampleGroups}
        sections={sections}
      >
        <div id="config-commands-table">
          <CompactDataTable
            title="Discovered command files"
            description="Legacy command markdown files discovered by the middleware."
            search={{
              value: discoveredCommands.query,
              onChange: discoveredCommands.setQuery,
              placeholder: "Search discovered command files",
            }}
            meta={<TableMetaBadges total={discoveredCommands.data?.total} noun="commands" loading={discoveredCommands.loading} query={discoveredCommands.query} />}
            loading={discoveredCommands.loading}
            error={discoveredCommands.error}
            columns={["Command", "Scope", "Args"]}
            rows={(discoveredCommands.data?.commands ?? []).map((command) => ({
              id: command.path,
              cells: [
                <span className="font-medium text-slate-900">/{command.qualifiedName ?? command.name}</span>,
                <Badge variant="outline">{command.scope}</Badge>,
                <span className="font-mono text-xs text-slate-500">{formatArgumentHint(command.argumentHint)}</span>,
              ],
              previewEyebrow: "Config Command",
              previewTitle: `/${command.qualifiedName ?? command.name}`,
              previewDescription: command.description || "No description",
              previewMeta: [
                {
                  label: "Path",
                  value: <CopyableValue value={command.path} displayValue={command.path} mono className="max-w-[260px]" />,
                },
                { label: "Source", value: command.pluginName ?? "Filesystem" },
              ],
            }))}
            emptyTitle="No discovered commands matched"
            emptyDetail="The discovered command route did not return any files for this query."
          />
        </div>

        <div id="config-commands-metadata">
          <ResourceMetadataWorkspace
            title="Command metadata"
            description="Attach internal rollout, owner, or domain tags to discovered command files."
            inventories={[
              {
                label: "Discovered command files",
                resourceType: "config-command",
                items: (discoveredCommands.data?.commands ?? []).map((command) => ({
                  id: command.path,
                  label: `/${command.qualifiedName ?? command.name}`,
                  detail: command.path,
                })),
              },
            ]}
          />
        </div>

        <div id="config-commands-payload">
          <JsonPreview
            title="Discovered commands payload"
            data={discoveredCommands.data}
            emptyMessage="Discovered command payload is not available yet."
          />
        </div>
      </PageBodyWithRail>
    </section>
  );
}
