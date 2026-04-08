import type { ReactNode } from "react";
import type {
  ConfigCommandsResponse,
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
import { truncate } from "../lib/utils";

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
  const discoveredCommands = useEndpointQuery<ConfigCommandsResponse>("/api/v1/config/commands");
  const operations = [
    {
      method: "GET",
      path: "/api/v1/config/runtime/commands",
      detail: "List and search structured commands reported by Claude runtime init.",
      sectionId: "runtime-commands-table",
    },
    {
      method: "GET",
      path: "/api/v1/config/commands",
      detail: "List and search discovered legacy slash command files.",
      sectionId: "runtime-commands-discovered",
    },
  ];
  const sections = [
    { id: "runtime-commands-table", label: "Supported commands" },
    { id: "runtime-commands-discovered", label: "Discovered command files" },
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
    {
      title: "Discovered files",
      buttonLabel: "Apply",
      items: [
        { label: "All files", detail: "Reset the discovered command search.", action: () => discoveredCommands.setQuery("") },
        { label: "SDK", detail: "Search discovered command files for SDK commands.", action: () => discoveredCommands.setQuery("sdk") },
        { label: "Plugin", detail: "Search discovered command files by plugin source.", action: () => discoveredCommands.setQuery("plugin") },
      ],
    },
  ];

  return (
    <section className="space-y-8">
      <SectionIntro
        eyebrow="Runtime Commands"
        title="Supported command inventory"
        description="Structured runtime commands and discovered legacy slash command files live on separate surfaces. This page keeps both searchable through the middleware so we can validate what Claude loads versus what the filesystem readers find."
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
            title="Supported commands"
            description="Structured command definitions returned by the runtime command endpoint."
            search={{
              value: runtimeCommands.query,
              onChange: runtimeCommands.setQuery,
              placeholder: "Search runtime commands",
            }}
            meta={
              <TableMetaBadges
                total={runtimeCommands.data?.total}
                noun="commands"
                loading={runtimeCommands.loading}
                query={runtimeCommands.query}
              />
            }
            loading={runtimeCommands.loading}
            error={runtimeCommands.error}
            columns={["Command", "Args", "Source"]}
            rows={(runtimeCommands.data?.commands ?? []).map((command) => ({
              id: command.name,
              cells: [
                <span className="font-medium text-slate-900">/{command.name}</span>,
                <span className="font-mono text-xs text-slate-500">
                  {formatArgumentHint(command.argumentHint)}
                </span>,
                <Badge variant="outline">Runtime</Badge>,
              ],
              previewEyebrow: "Runtime Command",
              previewTitle: `/${command.name}`,
              previewDescription: command.description || "No description",
              previewBadges: [
                <Badge variant="info">Runtime</Badge>,
                <Badge variant="outline">Command</Badge>,
              ],
              previewMeta: [
                {
                  label: "Argument hint",
                  value: (
                    <span className="font-mono text-xs text-slate-600">
                      {formatArgumentHint(command.argumentHint)}
                    </span>
                  ),
                },
                { label: "Endpoint", value: "/api/v1/config/runtime/commands" },
              ],
            }))}
            emptyTitle="No commands matched"
            emptyDetail="The middleware runtime command route did not return any commands for this query."
          />
        </div>

        <div id="runtime-commands-discovered">
          <CompactDataTable
            title="Discovered command files"
            description="Legacy slash command markdown files discovered by the middleware."
            search={{
              value: discoveredCommands.query,
              onChange: discoveredCommands.setQuery,
              placeholder: "Search discovered command files",
            }}
            meta={
              <TableMetaBadges
                total={discoveredCommands.data?.total}
                noun="files"
                loading={discoveredCommands.loading}
                query={discoveredCommands.query}
              />
            }
            loading={discoveredCommands.loading}
            error={discoveredCommands.error}
            columns={["Command", "Scope", "Source"]}
            rows={(discoveredCommands.data?.commands ?? []).map((command) => {
              const badges: ReactNode[] = [<Badge variant="outline">{command.scope}</Badge>];
              if (command.pluginName) {
                badges.push(<Badge variant="info">{command.pluginName}</Badge>);
              }

              return {
                id: command.path,
                cells: [
                  <span className="font-medium text-slate-900">
                    /{command.qualifiedName ?? command.name}
                  </span>,
                  <Badge variant="outline">{command.scope}</Badge>,
                  <span className="text-xs text-slate-500">
                    {command.pluginName ?? "Filesystem"}
                  </span>,
                ],
                previewEyebrow: "Command File",
                previewTitle: `/${command.qualifiedName ?? command.name}`,
                previewDescription: command.description || "No description",
                previewBadges: badges,
                previewMeta: [
                  {
                    label: "Argument hint",
                    value: (
                      <span className="font-mono text-xs text-slate-600">
                        {formatArgumentHint(command.argumentHint)}
                      </span>
                    ),
                  },
                  { label: "Path", value: truncate(command.path, 108) },
                ],
              };
            })}
            emptyTitle="No discovered command files matched"
            emptyDetail="The discovered command route did not return any files for this query."
          />
        </div>

        <div id="runtime-commands-payload">
          <JsonPreview
            title="Runtime commands payload"
            data={{
              runtime: runtimeCommands.data,
              discovered: discoveredCommands.data,
            }}
            emptyMessage="Runtime command payload is not available yet."
          />
        </div>
      </PageBodyWithRail>
    </section>
  );
}
