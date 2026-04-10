import type {
  PlaygroundPageId,
  RuntimeSkillsResponse,
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

export function RuntimeSkillsPage(props: {
  activeSection?: string;
}) {
  const page: PlaygroundPageId = "runtime-skills";
  const runtimeSkills = useEndpointQuery<RuntimeSkillsResponse>("/api/v1/config/runtime/skills");
  const operations = [
    {
      method: "GET",
      path: "/api/v1/config/runtime/skills",
      detail: "List and search skills loaded into the current Claude runtime.",
      sectionId: "runtime-skills-table",
    },
    {
      method: "GET",
      path: "/api/v1/metadata/definitions/runtime-skill",
      detail: "Manage metadata fields for loaded runtime skills.",
      sectionId: "runtime-skills-metadata",
    },
    {
      method: "PUT",
      path: "/api/v1/metadata/values/runtime-skill/:resourceId",
      detail: "Write metadata onto a selected runtime skill.",
      sectionId: "runtime-skills-metadata",
    },
  ];
  const sections = [
    { id: "runtime-skills-table", label: "Runtime skills" },
    { id: "runtime-skills-metadata", label: "Metadata" },
    { id: "runtime-skills-payload", label: "Payload preview" },
  ];
  const exampleGroups = [
    {
      title: "Runtime skills",
      buttonLabel: "Apply",
      items: [
        { label: "All loaded", detail: "Reset the runtime skill search.", action: () => runtimeSkills.setQuery("") },
        { label: "SDK", detail: "Search loaded skills for SDK-related names.", action: () => runtimeSkills.setQuery("sdk") },
        { label: "Verifier", detail: "Search for verifier-style skill names.", action: () => runtimeSkills.setQuery("verifier") },
      ],
    },
  ];

  return (
    <section className="space-y-8">
      <SectionIntro
        eyebrow="Runtime Skills"
        title="Loaded runtime skills"
        description="This page stays strictly runtime-scoped. It shows the skills Claude actually loaded for the current project, while the Configuration section owns discovered skill files on disk."
      />

      <PageBodyWithRail
        page={page}
        activeSection={props.activeSection}
        items={operations}
        exampleGroups={exampleGroups}
        sections={sections}
      >
        <div id="runtime-skills-table">
          <CompactDataTable
            title="Runtime skills"
            description="Skill names Claude reports as active in the current runtime."
            search={{
              value: runtimeSkills.query,
              onChange: runtimeSkills.setQuery,
              placeholder: "Search runtime skills",
            }}
            meta={<TableMetaBadges total={runtimeSkills.data?.total} noun="skills" loading={runtimeSkills.loading} query={runtimeSkills.query} />}
            loading={runtimeSkills.loading}
            error={runtimeSkills.error}
            columns={["Skill", "State"]}
            rows={(runtimeSkills.data?.skills ?? []).map((skill) => ({
              id: skill,
              cells: [
                <span className="font-medium text-slate-900">{skill}</span>,
                <Badge variant="info">Loaded</Badge>,
              ],
              previewEyebrow: "Runtime Skill",
              previewTitle: skill,
              previewDescription: "Loaded into the effective Claude runtime for this project.",
              previewMeta: [
                { label: "Endpoint", value: "/api/v1/config/runtime/skills" },
                { label: "Search query", value: runtimeSkills.query.trim() || "None" },
              ],
            }))}
            emptyTitle="No runtime skills matched"
            emptyDetail="The middleware runtime skills route did not return any skills for this query."
          />
        </div>

        <div id="runtime-skills-metadata">
          <ResourceMetadataWorkspace
            title="Runtime skill metadata"
            description="Attach internal taxonomy and ownership metadata to the runtime-loaded skill inventory."
            inventories={[
              {
                label: "Runtime skills",
                resourceType: "runtime-skill",
                items: (runtimeSkills.data?.skills ?? []).map((skill) => ({
                  id: skill,
                  label: skill,
                })),
              },
            ]}
          />
        </div>

        <div id="runtime-skills-payload">
          <JsonPreview
            title="Runtime skills payload"
            data={runtimeSkills.data}
            emptyMessage="Runtime skill payload is not available yet."
          />
        </div>
      </PageBodyWithRail>
    </section>
  );
}
