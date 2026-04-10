import type {
  PlaygroundPageId,
  RuntimePluginsResponse,
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

export function RuntimePluginsPage(props: {
  activeSection?: string;
}) {
  const page: PlaygroundPageId = "runtime-plugins";
  const runtimePlugins = useEndpointQuery<RuntimePluginsResponse>("/api/v1/config/runtime/plugins");
  const operations = [
    {
      method: "GET",
      path: "/api/v1/config/runtime/plugins",
      detail: "List and search plugins loaded into the current runtime.",
      sectionId: "runtime-plugins-table",
    },
    {
      method: "GET",
      path: "/api/v1/metadata/definitions/runtime-plugin",
      detail: "Manage metadata fields for runtime-loaded plugins.",
      sectionId: "runtime-plugins-metadata",
    },
    {
      method: "PUT",
      path: "/api/v1/metadata/values/runtime-plugin/:resourceId",
      detail: "Write metadata onto a selected runtime plugin.",
      sectionId: "runtime-plugins-metadata",
    },
  ];
  const sections = [
    { id: "runtime-plugins-table", label: "Runtime plugins" },
    { id: "runtime-plugins-metadata", label: "Metadata" },
    { id: "runtime-plugins-payload", label: "Payload preview" },
  ];
  const exampleGroups = [
    {
      title: "Runtime plugins",
      buttonLabel: "Apply",
      items: [
        { label: "All runtime plugins", detail: "Reset the runtime plugin search.", action: () => runtimePlugins.setQuery("") },
        { label: "SDK tools", detail: "Search runtime plugins for SDK tooling.", action: () => runtimePlugins.setQuery("sdk") },
        { label: "Plugin dev", detail: "Search runtime plugins for development helpers.", action: () => runtimePlugins.setQuery("plugin") },
      ],
    },
  ];

  return (
    <section className="space-y-8">
      <SectionIntro
        eyebrow="Runtime Plugins"
        title="Runtime-loaded plugins"
        description="This page stays focused on the plugins Claude actually loaded into the current project runtime. The Configuration section owns installed plugin records, available catalog entries, and marketplace registries."
      />

      <PageBodyWithRail
        page={page}
        activeSection={props.activeSection}
        items={operations}
        exampleGroups={exampleGroups}
        sections={sections}
      >
        <div id="runtime-plugins-table">
          <CompactDataTable
            title="Runtime plugins"
            description="Plugins Claude reports as loaded in the current project runtime."
            search={{
              value: runtimePlugins.query,
              onChange: runtimePlugins.setQuery,
              placeholder: "Search runtime plugins",
            }}
            meta={<TableMetaBadges total={runtimePlugins.data?.total} noun="plugins" loading={runtimePlugins.loading} query={runtimePlugins.query} />}
            loading={runtimePlugins.loading}
            error={runtimePlugins.error}
            columns={["Plugin", "Source", "State"]}
            rows={(runtimePlugins.data?.plugins ?? []).map((plugin) => ({
              id: `${plugin.name}-${plugin.path}`,
              cells: [
                <span className="font-medium text-slate-900">{plugin.name}</span>,
                <span className="text-xs text-slate-500">{plugin.source ?? "Runtime"}</span>,
                <Badge variant="info">Loaded</Badge>,
              ],
              previewEyebrow: "Runtime Plugin",
              previewTitle: plugin.name,
              previewDescription: "Loaded into the active Claude runtime for this project.",
              previewMeta: [
                { label: "Path", value: plugin.path },
                { label: "Source", value: plugin.source ?? "Runtime" },
              ],
            }))}
            emptyTitle="No runtime plugins matched"
            emptyDetail="The middleware runtime plugin route did not return any plugins for this query."
          />
        </div>

        <div id="runtime-plugins-metadata">
          <ResourceMetadataWorkspace
            title="Runtime plugin metadata"
            description="Keep internal tags, ownership, or rollout context attached to runtime-loaded plugins."
            inventories={[
              {
                label: "Runtime plugins",
                resourceType: "runtime-plugin",
                items: (runtimePlugins.data?.plugins ?? []).map((plugin) => ({
                  id: `${plugin.name}::${plugin.path}`,
                  label: plugin.name,
                  detail: plugin.path,
                })),
              },
            ]}
          />
        </div>

        <div id="runtime-plugins-payload">
          <JsonPreview
            title="Runtime plugins payload"
            data={runtimePlugins.data}
            emptyMessage="Runtime plugin payload is not available yet."
          />
        </div>
      </PageBodyWithRail>
    </section>
  );
}
