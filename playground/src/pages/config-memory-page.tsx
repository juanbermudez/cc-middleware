import { Badge } from "../components/ui/badge";
import type {
  ClaudeMdResponse,
  MemoryFilesResponse,
  MemoryProjectsResponse,
  MemorySummaryResponse,
  PlaygroundPageId,
  RulesResponse,
} from "../lib/playground";
import { useEndpointQuery } from "../lib/use-endpoint-query";
import { formatNumber, formatTimestamp } from "../lib/utils";
import {
  CompactDataTable,
  CompactStatGrid,
  CopyableValue,
  JsonPreview,
  PageBodyWithRail,
  SectionIntro,
  TableMetaBadges,
} from "../components/playground-ui";
import { ResourceMetadataWorkspace } from "../components/resource-metadata-workspace";

export function ConfigMemoryPage(props: {
  activeSection?: string;
}) {
  const page: PlaygroundPageId = "config-memory";
  const memorySummary = useEndpointQuery<MemorySummaryResponse>("/api/v1/config/memory");
  const memoryFiles = useEndpointQuery<MemoryFilesResponse>("/api/v1/config/memory/files");
  const memoryProjects = useEndpointQuery<MemoryProjectsResponse>("/api/v1/config/memory/projects");
  const claudeMdFiles = useEndpointQuery<ClaudeMdResponse>("/api/v1/config/claude-md");
  const rules = useEndpointQuery<RulesResponse>("/api/v1/config/rules");

  const operations = [
    {
      method: "GET",
      path: "/api/v1/config/memory",
      detail: "Inspect the current project's Claude memory directory and index status.",
      sectionId: "config-memory-summary",
    },
    {
      method: "GET",
      path: "/api/v1/config/memory/files",
      detail: "List and search project memory files.",
      sectionId: "config-memory-files",
    },
    {
      method: "GET",
      path: "/api/v1/config/claude-md",
      detail: "List and search CLAUDE.md instruction files.",
      sectionId: "config-memory-guidance",
    },
    {
      method: "GET",
      path: "/api/v1/config/rules",
      detail: "List and search rules files discovered by the middleware.",
      sectionId: "config-memory-rules",
    },
  ];

  const sections = [
    { id: "config-memory-summary", label: "Summary" },
    { id: "config-memory-files", label: "Memory files" },
    { id: "config-memory-projects", label: "Project memories" },
    { id: "config-memory-guidance", label: "CLAUDE.md files" },
    { id: "config-memory-rules", label: "Rules" },
    { id: "config-memory-metadata", label: "Metadata" },
    { id: "config-memory-payload", label: "Payload preview" },
  ];

  const exampleGroups = [
    {
      title: "Memory files",
      buttonLabel: "Apply",
      items: [
        { label: "All files", detail: "Reset the current project memory file search.", action: () => memoryFiles.setQuery("") },
        { label: "Reference", detail: "Search memory files for reference-type entries.", action: () => memoryFiles.setQuery("reference") },
        { label: "Feedback", detail: "Search memory files for feedback entries.", action: () => memoryFiles.setQuery("feedback") },
      ],
    },
    {
      title: "Guidance",
      buttonLabel: "Apply",
      items: [
        { label: "All guidance", detail: "Reset CLAUDE.md and rules searches.", action: () => {
          claudeMdFiles.setQuery("");
          rules.setQuery("");
        } },
        { label: "Import", detail: "Search CLAUDE.md files for imports.", action: () => claudeMdFiles.setQuery("import") },
        { label: "Rule paths", detail: "Search rules for scoped path matches.", action: () => rules.setQuery("paths") },
      ],
    },
  ];

  const topStats = [
    {
      label: "Project key",
      value: memorySummary.data?.projectKey ?? "Unavailable",
      detail: memorySummary.data?.hasIndex ? "Current project memory index is present." : "No current project memory index yet.",
      tone: memorySummary.data?.hasIndex ? "success" as const : "warning" as const,
    },
    {
      label: "Memory files",
      value: formatNumber(memorySummary.data?.fileCount),
      detail: "Current project memory topics excluding MEMORY.md.",
      tone: "neutral" as const,
    },
    {
      label: "Project memories",
      value: formatNumber(memoryProjects.data?.total),
      detail: "All project memory directories discovered on this machine.",
      tone: "info" as const,
    },
    {
      label: "Guidance files",
      value: formatNumber(claudeMdFiles.data?.total),
      detail: `${formatNumber(rules.data?.total)} rules files discovered.`,
      tone: "neutral" as const,
    },
  ];

  return (
    <section className="space-y-8">
      <SectionIntro
        eyebrow="Configuration"
        title="Memory and guidance content"
        description="This page brings together Claude-managed memory, project guidance files, and rules. These are configuration surfaces the middleware can read directly from disk to explain how Claude is being guided across projects."
      />

      <PageBodyWithRail
        page={page}
        activeSection={props.activeSection}
        items={operations}
        exampleGroups={exampleGroups}
        sections={sections}
      >
        <div id="config-memory-summary" className="space-y-4">
          <div>
            <div className="text-sm font-medium text-slate-900">Summary</div>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Current project memory state plus the broader machine-level memory and guidance footprint discovered by the middleware.
            </p>
          </div>
          <CompactStatGrid items={topStats} />
        </div>

        <div id="config-memory-files">
          <CompactDataTable
            title="Current project memory files"
            description="Memory topic files for the current project, discovered from Claude's managed project memory directory."
            search={{
              value: memoryFiles.query,
              onChange: memoryFiles.setQuery,
              placeholder: "Search memory files",
            }}
            meta={<TableMetaBadges total={memoryFiles.data?.total} noun="files" loading={memoryFiles.loading} query={memoryFiles.query} />}
            loading={memoryFiles.loading}
            error={memoryFiles.error}
            columns={["File", "Type", "Updated"]}
            rows={(memoryFiles.data?.files ?? []).map((file) => ({
              id: file.path,
              cells: [
                <span className="font-medium text-slate-900">{file.name}</span>,
                <Badge variant="outline">{file.type}</Badge>,
                <span className="text-xs text-slate-500">{formatTimestamp(file.lastModified)}</span>,
              ],
              previewEyebrow: "Memory File",
              previewTitle: file.name,
              previewDescription: file.description || "No description",
              previewMeta: [
                {
                  label: "Path",
                  value: <CopyableValue value={file.path} displayValue={file.path} mono className="max-w-[260px]" />,
                },
                { label: "Type", value: file.type },
              ],
            }))}
            emptyTitle="No memory files matched"
            emptyDetail="The project memory files route did not return any files for this query."
          />
        </div>

        <div id="config-memory-projects">
          <CompactDataTable
            title="All project memory directories"
            description="Memory directories discovered across all Claude project memory folders on this machine."
            search={{
              value: memoryProjects.query,
              onChange: memoryProjects.setQuery,
              placeholder: "Search project memories",
            }}
            meta={<TableMetaBadges total={memoryProjects.data?.total} noun="projects" loading={memoryProjects.loading} query={memoryProjects.query} />}
            loading={memoryProjects.loading}
            error={memoryProjects.error}
            columns={["Project key", "Directory"]}
            rows={(memoryProjects.data?.projects ?? []).map((project) => ({
              id: project.projectKey,
              cells: [
                <span className="font-medium text-slate-900">{project.projectKey}</span>,
                <CopyableValue value={project.dir} displayValue={project.dir} mono className="max-w-[320px]" />,
              ],
              previewEyebrow: "Project Memory",
              previewTitle: project.projectKey,
              previewDescription: "Claude project memory directory discovered on disk.",
              previewMeta: [
                { label: "Directory", value: project.dir },
              ],
            }))}
            emptyTitle="No project memories matched"
            emptyDetail="The machine-wide memory projects route did not return any directories for this query."
          />
        </div>

        <div id="config-memory-guidance">
          <CompactDataTable
            title="CLAUDE.md instruction files"
            description="Global, project, and local CLAUDE.md files discovered by the middleware."
            search={{
              value: claudeMdFiles.query,
              onChange: claudeMdFiles.setQuery,
              placeholder: "Search CLAUDE.md files",
            }}
            meta={<TableMetaBadges total={claudeMdFiles.data?.total} noun="files" loading={claudeMdFiles.loading} query={claudeMdFiles.query} />}
            loading={claudeMdFiles.loading}
            error={claudeMdFiles.error}
            columns={["File", "Scope", "Imports"]}
            rows={(claudeMdFiles.data?.files ?? []).map((file) => ({
              id: file.path,
              cells: [
                <span className="font-medium text-slate-900">{file.path.split("/").pop() ?? file.path}</span>,
                <Badge variant="outline">{file.scope}</Badge>,
                <Badge variant="outline">{formatNumber(file.imports.length)}</Badge>,
              ],
              previewEyebrow: "CLAUDE.md",
              previewTitle: file.path,
              previewDescription: "Instruction file discovered by the middleware.",
              previewMeta: [
                { label: "Scope", value: file.scope },
                { label: "Imports", value: file.imports.join(", ") || "None" },
              ],
            }))}
            emptyTitle="No CLAUDE.md files matched"
            emptyDetail="The CLAUDE.md route did not return any files for this query."
          />
        </div>

        <div id="config-memory-rules">
          <CompactDataTable
            title="Rules files"
            description="Rules discovered from user and project .claude/rules directories."
            search={{
              value: rules.query,
              onChange: rules.setQuery,
              placeholder: "Search rules",
            }}
            meta={<TableMetaBadges total={rules.data?.total} noun="rules" loading={rules.loading} query={rules.query} />}
            loading={rules.loading}
            error={rules.error}
            columns={["Rule", "Scope", "Paths"]}
            rows={(rules.data?.rules ?? []).map((rule) => ({
              id: rule.path,
              cells: [
                <span className="font-medium text-slate-900">{rule.path.split("/").pop() ?? rule.path}</span>,
                <Badge variant="outline">{rule.scope}</Badge>,
                <Badge variant="outline">{formatNumber(rule.paths?.length)}</Badge>,
              ],
              previewEyebrow: "Rule File",
              previewTitle: rule.path,
              previewDescription: "Rule file discovered by the middleware.",
              previewMeta: [
                { label: "Scoped paths", value: rule.paths?.join(", ") || "None" },
              ],
            }))}
            emptyTitle="No rules matched"
            emptyDetail="The rules route did not return any files for this query."
          />
        </div>

        <div id="config-memory-metadata">
          <ResourceMetadataWorkspace
            title="Memory and guidance metadata"
            description="Attach internal notes, ownership, or lifecycle tags to memory, guidance, and rules records."
            inventories={[
              {
                label: "Memory files",
                resourceType: "config-memory-file",
                items: (memoryFiles.data?.files ?? []).map((file) => ({
                  id: file.path,
                  label: file.name,
                  detail: file.path,
                })),
              },
              {
                label: "Project memories",
                resourceType: "config-memory-project",
                items: (memoryProjects.data?.projects ?? []).map((project) => ({
                  id: project.projectKey,
                  label: project.projectKey,
                  detail: project.dir,
                })),
              },
              {
                label: "CLAUDE.md files",
                resourceType: "config-claude-md",
                items: (claudeMdFiles.data?.files ?? []).map((file) => ({
                  id: file.path,
                  label: file.path.split("/").pop() ?? file.path,
                  detail: file.path,
                })),
              },
              {
                label: "Rules",
                resourceType: "config-rule",
                items: (rules.data?.rules ?? []).map((rule) => ({
                  id: rule.path,
                  label: rule.path.split("/").pop() ?? rule.path,
                  detail: rule.path,
                })),
              },
            ]}
          />
        </div>

        <div id="config-memory-payload">
          <JsonPreview
            title="Memory and guidance payload"
            data={{
              summary: memorySummary.data,
              files: memoryFiles.data,
              projects: memoryProjects.data,
              claudeMd: claudeMdFiles.data,
              rules: rules.data,
            }}
            emptyMessage="Memory and guidance payload is not available yet."
          />
        </div>
      </PageBodyWithRail>
    </section>
  );
}
