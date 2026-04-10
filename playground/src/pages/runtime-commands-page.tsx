import type {
  PlaygroundPageId,
  RuntimeCommandsResponse,
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

function formatArgumentHint(value: string | string[] | undefined): string {
  if (!value) {
    return "No args";
  }
  return Array.isArray(value) ? value.join(" ") : value;
}

export function RuntimeCommandsPage(props: {
  activeSection?: string;
}) {
  const page: PlaygroundPageId = "runtime-commands";
  const runtimeCommands = useEndpointQuery<RuntimeCommandsResponse>("/api/v1/config/runtime/commands");
  const operations = [
    {
      method: "GET",
      path: "/api/v1/config/runtime/commands",
      detail: "List and search structured commands reported by Claude runtime init.",
      sectionId: "runtime-commands-table",
    },
    {
      method: "GET",
      path: "/api/v1/metadata/definitions/runtime-command",
      detail: "Manage metadata fields for runtime commands.",
      sectionId: "runtime-commands-metadata",
    },
    {
      method: "PUT",
      path: "/api/v1/metadata/values/runtime-command/:resourceId",
      detail: "Write metadata onto a specific runtime command.",
      sectionId: "runtime-commands-metadata",
    },
  ];
  const sections = [
    { id: "runtime-commands-table", label: "Runtime commands" },
    { id: "runtime-commands-metadata", label: "Metadata" },
    { id: "runtime-commands-payload", label: "Payload preview" },
  ];
  const exampleGroups = [
    {
      title: "Runtime commands",
      buttonLabel: "Apply",
      items: [
        { label: "All runtime commands", detail: "Reset the runtime command search.", action: () => runtimeCommands.setQuery("") },
        { label: "SDK", detail: "Search runtime commands for SDK-related names.", action: () => runtimeCommands.setQuery("sdk") },
        { label: "New app", detail: "Search runtime commands for app creation flows.", action: () => runtimeCommands.setQuery("new") },
      ],
    },
  ];

  return (
    <section className="space-y-8">
      <SectionIntro
        eyebrow="Runtime Commands"
        title="Supported runtime commands"
        description="This page is runtime-only. It shows the structured commands Claude reports after runtime initialization, while the Configuration section owns discovered legacy command files."
      />

      <PageBodyWithRail
        page={page}
        activeSection={props.activeSection}
        items={operations}
        exampleGroups={exampleGroups}
        sections={sections}
      >
        <div id="runtime-commands-table">
          <CompactDataTable
            title="Runtime commands"
            description="Structured command definitions returned by the runtime command endpoint."
            search={{
              value: runtimeCommands.query,
              onChange: runtimeCommands.setQuery,
              placeholder: "Search runtime commands",
            }}
            meta={<TableMetaBadges total={runtimeCommands.data?.total} noun="commands" loading={runtimeCommands.loading} query={runtimeCommands.query} />}
            loading={runtimeCommands.loading}
            error={runtimeCommands.error}
            columns={["Command", "Args", "Source"]}
            rows={(runtimeCommands.data?.commands ?? []).map((command) => ({
              id: command.name,
              cells: [
                <span className="font-medium text-slate-900">/{command.name}</span>,
                <span className="font-mono text-xs text-slate-500">{formatArgumentHint(command.argumentHint)}</span>,
                <Badge variant="outline">Runtime</Badge>,
              ],
              previewEyebrow: "Runtime Command",
              previewTitle: `/${command.name}`,
              previewDescription: command.description || "No description",
              previewMeta: [
                { label: "Argument hint", value: formatArgumentHint(command.argumentHint) },
                { label: "Endpoint", value: "/api/v1/config/runtime/commands" },
              ],
            }))}
            emptyTitle="No runtime commands matched"
            emptyDetail="The middleware runtime command route did not return any commands for this query."
          />
        </div>

        <div id="runtime-commands-metadata">
          <ResourceMetadataWorkspace
            title="Runtime command metadata"
            description="Keep internal labels, ownership, or rollout notes attached to runtime commands."
            inventories={[
              {
                label: "Runtime commands",
                resourceType: "runtime-command",
                items: (runtimeCommands.data?.commands ?? []).map((command) => ({
                  id: command.name,
                  label: `/${command.name}`,
                  detail: command.description || "Runtime command",
                })),
              },
            ]}
          />
        </div>

        <div id="runtime-commands-payload">
          <JsonPreview
            title="Runtime commands payload"
            data={runtimeCommands.data}
            emptyMessage="Runtime command payload is not available yet."
          />
        </div>
      </PageBodyWithRail>
    </section>
  );
}
