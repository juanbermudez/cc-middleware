import type {
  ConfigSkillsResponse,
  PlaygroundPageId,
  RuntimeSkillsResponse,
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
import { truncate } from "../lib/utils";

export function RuntimeSkillsPage(props: {
  activeSection?: string;
}) {
  const page: PlaygroundPageId = "runtime-skills";
  const runtimeSkills = useEndpointQuery<RuntimeSkillsResponse>("/api/v1/config/runtime/skills");
  const discoveredSkills = useEndpointQuery<ConfigSkillsResponse>("/api/v1/config/skills");
  const operations = [
    {
      method: "GET",
      path: "/api/v1/config/runtime/skills",
      detail: "List and search skills loaded into the current Claude runtime.",
      sectionId: "runtime-skills-loaded",
    },
    {
      method: "GET",
      path: "/api/v1/config/skills",
      detail: "List and search skills discovered across user, project, and plugin scopes.",
      sectionId: "runtime-skills-discovered",
    },
  ];
  const sections = [
    { id: "runtime-skills-loaded", label: "Loaded skills" },
    { id: "runtime-skills-discovered", label: "Discovered skills" },
    { id: "runtime-skills-payload", label: "Payload preview" },
  ];
  const exampleGroups = [
    {
      title: "Loaded skills",
      buttonLabel: "Apply",
      items: [
        { label: "All loaded", detail: "Reset the runtime skill search.", action: () => runtimeSkills.setQuery("") },
        { label: "SDK", detail: "Search loaded skills for SDK-related names.", action: () => runtimeSkills.setQuery("sdk") },
        { label: "Verifier", detail: "Search for verifier-style skill names.", action: () => runtimeSkills.setQuery("verifier") },
      ],
    },
    {
      title: "Discovered skills",
      buttonLabel: "Apply",
      items: [
        { label: "All discovered", detail: "Reset the discovered skill search.", action: () => discoveredSkills.setQuery("") },
        { label: "Plugin skills", detail: "Search discovered skills by plugin scope.", action: () => discoveredSkills.setQuery("plugin") },
        { label: "Workflow", detail: "Search discovered skills by common labels.", action: () => discoveredSkills.setQuery("workflow") },
      ],
    },
  ];

  return (
    <section className="space-y-8">
      <SectionIntro
        eyebrow="Runtime Skills"
        title="Loaded and discovered skills"
        description="Runtime-loaded skills and discovered filesystem skills are related but separate inventories. This page keeps both searchable through the middleware so we can compare what Claude actually loads to what is installed on disk."
      />

      <PageBodyWithRail
        page={page}
        activeSection={props.activeSection}
        items={operations}
        exampleGroups={exampleGroups}
        sections={sections}
      >
        <div id="runtime-skills-loaded">
          <CompactDataTable
            title="Loaded skills"
            description="Skill names Claude reports as active in the current runtime."
            search={{
              value: runtimeSkills.query,
              onChange: runtimeSkills.setQuery,
              placeholder: "Search loaded skills",
            }}
            meta={
              <TableMetaBadges
                total={runtimeSkills.data?.total}
                noun="skills"
                loading={runtimeSkills.loading}
                query={runtimeSkills.query}
              />
            }
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
              drawerMeta: [
                { label: "State", value: "Loaded" },
                { label: "Source", value: "Runtime" },
                { label: "Endpoint", value: "/api/v1/config/runtime/skills" },
                { label: "Search query", value: runtimeSkills.query.trim() || "None" },
              ],
            }))}
            emptyTitle="No loaded skills matched"
            emptyDetail="The middleware runtime skills route did not return any skills for this query."
          />
        </div>

        <div id="runtime-skills-discovered">
          <CompactDataTable
            title="Discovered skills"
            description="Filesystem skills found by the middleware across user, project, and plugin scopes."
            search={{
              value: discoveredSkills.query,
              onChange: discoveredSkills.setQuery,
              placeholder: "Search discovered skills",
            }}
            meta={
              <TableMetaBadges
                total={discoveredSkills.data?.total}
                noun="skills"
                loading={discoveredSkills.loading}
                query={discoveredSkills.query}
              />
            }
            loading={discoveredSkills.loading}
            error={discoveredSkills.error}
            columns={["Skill", "Scope", "Source"]}
            rows={(discoveredSkills.data?.skills ?? []).map((skill) => {
              const description = skill.description || "No description";
              const source = skill.pluginName ?? "Filesystem";

              return {
                id: skill.path,
                cells: [
                  <span className="font-medium text-slate-900">
                    {skill.qualifiedName ?? skill.name}
                  </span>,
                  <Badge variant="outline">{skill.scope}</Badge>,
                  <span className="text-xs text-slate-500">
                    {skill.pluginName ?? "Filesystem"}
                  </span>,
                ],
                previewEyebrow: "Discovered Skill",
                previewTitle: skill.qualifiedName ?? skill.name,
                previewDescription: truncate(description, 300),
                previewMeta: [
                  {
                    label: "Path",
                    value: (
                      <CopyableValue
                        value={skill.path}
                        displayValue={truncate(skill.path, 72)}
                        mono
                      />
                    ),
                  },
                  { label: "Marketplace", value: skill.pluginMarketplace ?? "N/A" },
                ],
                drawerDescription: description,
                drawerMeta: [
                  {
                    label: "Path",
                    value: (
                      <CopyableValue
                        value={skill.path}
                        displayValue={skill.path}
                        mono
                      />
                    ),
                  },
                  { label: "Scope", value: skill.scope },
                  { label: "Source", value: source },
                  { label: "Marketplace", value: skill.pluginMarketplace ?? "N/A" },
                ],
              };
            })}
            emptyTitle="No discovered skills matched"
            emptyDetail="The discovered skill route did not return any skills for this query."
          />
        </div>

        <div id="runtime-skills-payload">
          <JsonPreview
            title="Runtime skills payload"
            data={{
              runtime: runtimeSkills.data,
              discovered: discoveredSkills.data,
            }}
            emptyMessage="Runtime skill payload is not available yet."
          />
        </div>
      </PageBodyWithRail>
    </section>
  );
}
