import type {
  ConfigSkillsResponse,
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

export function ConfigSkillsPage(props: {
  activeSection?: string;
}) {
  const page: PlaygroundPageId = "config-skills";
  const discoveredSkills = useEndpointQuery<ConfigSkillsResponse>("/api/v1/config/skills");
  const operations = [
    {
      method: "GET",
      path: "/api/v1/config/skills",
      detail: "List and search discovered skill files across user, project, and plugin scopes.",
      sectionId: "config-skills-table",
    },
    {
      method: "GET",
      path: "/api/v1/metadata/definitions/config-skill",
      detail: "Manage metadata fields for discovered skills.",
      sectionId: "config-skills-metadata",
    },
  ];
  const sections = [
    { id: "config-skills-table", label: "Skills" },
    { id: "config-skills-metadata", label: "Metadata" },
    { id: "config-skills-payload", label: "Payload preview" },
  ];
  const exampleGroups = [
    {
      title: "Skill queries",
      buttonLabel: "Apply",
      items: [
        { label: "All skills", detail: "Reset the discovered skills search.", action: () => discoveredSkills.setQuery("") },
        { label: "Plugin", detail: "Search skill files by plugin source.", action: () => discoveredSkills.setQuery("plugin") },
        { label: "Workflow", detail: "Search skill files by workflow wording.", action: () => discoveredSkills.setQuery("workflow") },
      ],
    },
  ];

  return (
    <section className="space-y-8">
      <SectionIntro
        eyebrow="Configuration"
        title="Discovered skill files"
        description="This page is the filesystem side of skill exposure. It shows the skill files the middleware discovered across user, project, and plugin scopes, independent of whether Claude loaded them into the active runtime."
      />

      <PageBodyWithRail
        page={page}
        activeSection={props.activeSection}
        items={operations}
        exampleGroups={exampleGroups}
        sections={sections}
      >
        <div id="config-skills-table">
          <CompactDataTable
            title="Discovered skills"
            description="Skill files discovered by the middleware from user, project, and plugin directories."
            search={{
              value: discoveredSkills.query,
              onChange: discoveredSkills.setQuery,
              placeholder: "Search discovered skills",
            }}
            meta={<TableMetaBadges total={discoveredSkills.data?.total} noun="skills" loading={discoveredSkills.loading} query={discoveredSkills.query} />}
            loading={discoveredSkills.loading}
            error={discoveredSkills.error}
            columns={["Skill", "Scope", "Source"]}
            rows={(discoveredSkills.data?.skills ?? []).map((skill) => ({
              id: skill.path,
              cells: [
                <span className="font-medium text-slate-900">{skill.qualifiedName ?? skill.name}</span>,
                <Badge variant="outline">{skill.scope}</Badge>,
                <span className="text-xs text-slate-500">{skill.pluginName ?? "Filesystem"}</span>,
              ],
              previewEyebrow: "Config Skill",
              previewTitle: skill.qualifiedName ?? skill.name,
              previewDescription: skill.description || "No description",
              previewMeta: [
                {
                  label: "Path",
                  value: <CopyableValue value={skill.path} displayValue={skill.path} mono className="max-w-[260px]" />,
                },
                { label: "Marketplace", value: skill.pluginMarketplace ?? "N/A" },
              ],
            }))}
            emptyTitle="No discovered skills matched"
            emptyDetail="The discovered skill route did not return any skills for this query."
          />
        </div>

        <div id="config-skills-metadata">
          <ResourceMetadataWorkspace
            title="Skill metadata"
            description="Attach internal taxonomy or ownership metadata to discovered skill files."
            inventories={[
              {
                label: "Discovered skills",
                resourceType: "config-skill",
                items: (discoveredSkills.data?.skills ?? []).map((skill) => ({
                  id: skill.path,
                  label: skill.qualifiedName ?? skill.name,
                  detail: skill.path,
                })),
              },
            ]}
          />
        </div>

        <div id="config-skills-payload">
          <JsonPreview
            title="Discovered skills payload"
            data={discoveredSkills.data}
            emptyMessage="Discovered skills payload is not available yet."
          />
        </div>
      </PageBodyWithRail>
    </section>
  );
}
