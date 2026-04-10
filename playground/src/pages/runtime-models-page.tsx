import type {
  PlaygroundPageId,
  RuntimeModelsResponse,
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

export function RuntimeModelsPage(props: {
  activeSection?: string;
}) {
  const page: PlaygroundPageId = "runtime-models";
  const runtimeModels = useEndpointQuery<RuntimeModelsResponse>("/api/v1/config/runtime/models");
  const operations = [
    {
      method: "GET",
      path: "/api/v1/config/runtime/models",
      detail: "List and search the runtime model catalog.",
      sectionId: "runtime-models-table",
    },
    {
      method: "GET",
      path: "/api/v1/metadata/definitions/runtime-model",
      detail: "Manage metadata fields for runtime model entries.",
      sectionId: "runtime-models-metadata",
    },
    {
      method: "PUT",
      path: "/api/v1/metadata/values/runtime-model/:resourceId",
      detail: "Write metadata onto a selected model entry.",
      sectionId: "runtime-models-metadata",
    },
  ];
  const sections = [
    { id: "runtime-models-table", label: "Models" },
    { id: "runtime-models-metadata", label: "Metadata" },
    { id: "runtime-models-payload", label: "Payload preview" },
  ];
  const exampleGroups = [
    {
      title: "Model queries",
      buttonLabel: "Apply",
      items: [
        { label: "All models", detail: "Reset the runtime model search.", action: () => runtimeModels.setQuery("") },
        { label: "Sonnet", detail: "Search the model catalog for Sonnet entries.", action: () => runtimeModels.setQuery("sonnet") },
        { label: "Haiku", detail: "Search the model catalog for Haiku entries.", action: () => runtimeModels.setQuery("haiku") },
      ],
    },
  ];

  return (
    <section className="space-y-8">
      <SectionIntro
        eyebrow="Runtime Models"
        title="Runtime model catalog"
        description="A focused reference page for the model catalog Claude reports for the current runtime. Search uses the middleware endpoint directly, and details stay in the hover preview so the table remains compact."
      />

      <PageBodyWithRail
        page={page}
        activeSection={props.activeSection}
        items={operations}
        exampleGroups={exampleGroups}
        sections={sections}
      >
        <div id="runtime-models-table">
          <CompactDataTable
            title="Runtime models"
            description="Models and display metadata reported by the middleware runtime route."
            search={{
              value: runtimeModels.query,
              onChange: runtimeModels.setQuery,
              placeholder: "Search runtime models",
            }}
            meta={
              <TableMetaBadges
                total={runtimeModels.data?.total}
                noun="models"
                loading={runtimeModels.loading}
                query={runtimeModels.query}
              />
            }
            loading={runtimeModels.loading}
            error={runtimeModels.error}
            columns={["Model", "Display", "State"]}
            rows={(runtimeModels.data?.models ?? []).map((model) => ({
              id: model.value ?? model.displayName ?? "unknown-model",
              cells: [
                <span className="font-medium text-slate-900">{model.value ?? "Unknown"}</span>,
                <span className="text-xs text-slate-500">{model.displayName ?? "No display name"}</span>,
                <Badge variant="outline">Runtime</Badge>,
              ],
              previewEyebrow: "Runtime Model",
              previewTitle: model.displayName ?? model.value ?? "Unknown model",
              previewDescription: model.description || "No description",
              previewBadges: [
                <Badge variant="outline">Runtime</Badge>,
                ...(model.value ? [<Badge variant="info">{model.value}</Badge>] : []),
              ],
              previewMeta: [
                { label: "Default output style", value: runtimeModels.data?.outputStyle ?? "Unavailable" },
                {
                  label: "Available output styles",
                  value: runtimeModels.data?.availableOutputStyles.join(", ") || "Unavailable",
                },
              ],
            }))}
            emptyTitle="No runtime models matched"
            emptyDetail="The runtime models route did not return any models for this query."
          />
        </div>

        <div id="runtime-models-metadata">
          <ResourceMetadataWorkspace
            title="Model metadata"
            description="Attach internal annotations to runtime model catalog entries without changing Claude's reported model list."
            inventories={[
              {
                label: "Runtime models",
                resourceType: "runtime-model",
                items: (runtimeModels.data?.models ?? []).map((model) => ({
                  id: model.value ?? model.displayName ?? "unknown-model",
                  label: model.displayName ?? model.value ?? "Unknown model",
                  detail: model.value ?? "No value",
                })),
              },
            ]}
          />
        </div>

        <div id="runtime-models-payload">
          <JsonPreview
            title="Runtime models payload"
            data={runtimeModels.data}
            emptyMessage="Runtime model payload is not available yet."
          />
        </div>
      </PageBodyWithRail>
    </section>
  );
}
