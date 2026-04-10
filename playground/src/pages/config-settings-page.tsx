import { Badge } from "../components/ui/badge";
import type {
  GlobalConfigSummaryResponse,
  MergedSettingsResponse,
  PlaygroundPageId,
  SettingsFileResponse,
  TrackedProjectsResponse,
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

export function ConfigSettingsPage(props: {
  activeSection?: string;
}) {
  const page: PlaygroundPageId = "config-settings";
  const globalSummary = useEndpointQuery<GlobalConfigSummaryResponse>("/api/v1/config/global");
  const mergedSettings = useEndpointQuery<MergedSettingsResponse>("/api/v1/config/settings");
  const managedSettings = useEndpointQuery<SettingsFileResponse>("/api/v1/config/settings/managed");
  const userSettings = useEndpointQuery<SettingsFileResponse>("/api/v1/config/settings/user");
  const projectSettings = useEndpointQuery<SettingsFileResponse>("/api/v1/config/settings/project");
  const localSettings = useEndpointQuery<SettingsFileResponse>("/api/v1/config/settings/local");
  const trackedProjects = useEndpointQuery<TrackedProjectsResponse>("/api/v1/config/projects");

  const operations = [
    {
      method: "GET",
      path: "/api/v1/config/global",
      detail: "Sanitized ~/.claude.json summary and writable preference list.",
      sectionId: "config-settings-global",
    },
    {
      method: "GET",
      path: "/api/v1/config/settings",
      detail: "Merged effective settings and merged permissions.",
      sectionId: "config-settings-files",
    },
    {
      method: "GET",
      path: "/api/v1/config/projects",
      detail: "Tracked projects, trust state, and project-scoped config hints.",
      sectionId: "config-settings-projects",
    },
    {
      method: "GET",
      path: "/api/v1/metadata/definitions/config-project",
      detail: "Manage metadata fields for tracked project records.",
      sectionId: "config-settings-metadata",
    },
  ];

  const sections = [
    { id: "config-settings-global", label: "Global preferences" },
    { id: "config-settings-files", label: "Settings files" },
    { id: "config-settings-projects", label: "Tracked projects" },
    { id: "config-settings-metadata", label: "Metadata" },
    { id: "config-settings-payload", label: "Payload preview" },
  ];

  const exampleGroups = [
    {
      title: "Project queries",
      buttonLabel: "Apply",
      items: [
        { label: "All projects", detail: "Reset the tracked project search.", action: () => trackedProjects.setQuery("") },
        { label: "Trust", detail: "Search tracked projects for trust-related state.", action: () => trackedProjects.setQuery("trust") },
        { label: "MCP", detail: "Search tracked projects for MCP-related configuration.", action: () => trackedProjects.setQuery("mcp") },
      ],
    },
  ];

  const settingsFiles = [
    managedSettings.data,
    userSettings.data,
    projectSettings.data,
    localSettings.data,
  ].filter(Boolean) as SettingsFileResponse[];

  const topStats = [
    {
      label: "Tracked projects",
      value: formatNumber(trackedProjects.data?.total),
      detail: `${formatNumber(globalSummary.data?.trackedProjectCount)} total project records in global state.`,
      tone: "neutral" as const,
    },
    {
      label: "Writable preferences",
      value: formatNumber(globalSummary.data?.writablePreferences.length),
      detail: `${formatNumber(Object.keys(globalSummary.data?.preferences ?? {}).length)} current global preference values.`,
      tone: "info" as const,
    },
    {
      label: "Allow rules",
      value: formatNumber(mergedSettings.data?.permissions.allow.length),
      detail: `${formatNumber(mergedSettings.data?.permissions.ask.length)} ask rules and ${formatNumber(mergedSettings.data?.permissions.deny.length)} deny rules.`,
      tone: "neutral" as const,
    },
    {
      label: "Settings files",
      value: formatNumber(settingsFiles.filter((file) => file.exists).length),
      detail: `${formatNumber(settingsFiles.length)} scopes inspected.`,
      tone: "info" as const,
    },
  ];

  return (
    <section className="space-y-8">
      <SectionIntro
        eyebrow="Configuration"
        title="Settings, preferences, and tracked projects"
        description="This page covers the declarative settings layer: global Claude preferences, merged effective settings, per-scope settings files, and tracked project state from global config. It is the right companion to runtime when you need to explain why the current project behaves the way it does."
      />

      <PageBodyWithRail
        page={page}
        activeSection={props.activeSection}
        items={operations}
        exampleGroups={exampleGroups}
        sections={sections}
      >
        <div id="config-settings-global" className="space-y-4">
          <div>
            <div className="text-sm font-medium text-slate-900">Global preferences</div>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Sanitized ~/.claude.json state plus the documented preference keys the middleware can manage safely.
            </p>
          </div>
          <CompactStatGrid items={topStats} />
          <CompactDataTable
            title="Writable global preferences"
            description="Documented preferences surfaced from global state. The middleware can safely manage these without exposing the rest of ~/.claude.json as a generic writable document."
            meta={<TableMetaBadges total={globalSummary.data?.writablePreferences.length} noun="preferences" loading={globalSummary.loading} />}
            loading={globalSummary.loading}
            error={globalSummary.error}
            columns={["Preference", "Value", "Type"]}
            rows={(globalSummary.data?.writablePreferences ?? []).map((preference) => ({
              id: preference.key,
              cells: [
                <span className="font-medium text-slate-900">{preference.key}</span>,
                <Badge variant="outline">
                  {String(globalSummary.data?.preferences[preference.key] ?? "Unset")}
                </Badge>,
                <span className="text-xs text-slate-500">{preference.valueType}</span>,
              ],
              previewEyebrow: "Global Preference",
              previewTitle: preference.key,
              previewDescription: preference.description,
              previewMeta: [
                { label: "Current value", value: String(globalSummary.data?.preferences[preference.key] ?? "Unset") },
                { label: "Type", value: preference.valueType },
              ],
            }))}
            emptyTitle="No writable preferences discovered"
            emptyDetail="The global configuration summary did not return any writable preferences."
          />
        </div>

        <div id="config-settings-files">
          <CompactDataTable
            title="Settings files"
            description="Per-scope Claude settings files inspected by the middleware, plus their existence and top-level key count."
            meta={<TableMetaBadges total={settingsFiles.length} noun="scopes" />}
            columns={["Scope", "Status", "Path", "Keys"]}
            rows={settingsFiles.map((file) => ({
              id: file.scope,
              cells: [
                <span className="font-medium text-slate-900">{file.scope}</span>,
                <Badge variant={file.exists ? "success" : "outline"}>
                  {file.exists ? "Present" : "Missing"}
                </Badge>,
                <CopyableValue value={file.path} displayValue={file.path} mono className="max-w-[340px]" />,
                <Badge variant="outline">{formatNumber(Object.keys(file.content).length)}</Badge>,
              ],
              previewEyebrow: "Settings File",
              previewTitle: file.scope,
              previewDescription: file.exists ? "Settings file is present and readable." : "Settings file does not exist for this scope.",
              previewMeta: [
                { label: "Path", value: file.path },
                { label: "Updated", value: formatTimestamp(file.lastModified) },
              ],
            }))}
            emptyTitle="No settings scope data"
            emptyDetail="The playground could not build the settings scope list."
          />
        </div>

        <div id="config-settings-projects">
          <CompactDataTable
            title="Tracked projects"
            description="Project records from global config, including allowed tool snapshots, MCP references, and trust-related state."
            search={{
              value: trackedProjects.query,
              onChange: trackedProjects.setQuery,
              placeholder: "Search tracked projects",
            }}
            meta={<TableMetaBadges total={trackedProjects.data?.total} noun="projects" loading={trackedProjects.loading} query={trackedProjects.query} />}
            loading={trackedProjects.loading}
            error={trackedProjects.error}
            columns={["Project", "Tools", "MCP", "Trust"]}
            rows={(trackedProjects.data?.projects ?? []).map((project) => ({
              id: project.path,
              cells: [
                <CopyableValue value={project.path} displayValue={project.path} mono className="max-w-[300px]" />,
                <Badge variant="outline">{formatNumber(project.allowedToolsCount)}</Badge>,
                <Badge variant="outline">{formatNumber(project.localMcpCount)}</Badge>,
                <Badge variant={project.hasTrustDialogAccepted ? "success" : "outline"}>
                  {project.hasTrustDialogAccepted ? "Trusted" : "Not trusted"}
                </Badge>,
              ],
              previewEyebrow: "Tracked Project",
              previewTitle: project.path,
              previewDescription: "Project-scoped state recorded in Claude global config.",
              previewMeta: [
                { label: "Allowed tools", value: project.allowedTools.join(", ") || "None recorded" },
                { label: "MCP servers", value: project.mcpServerNames.join(", ") || "None recorded" },
              ],
            }))}
            emptyTitle="No tracked projects matched"
            emptyDetail="The tracked project route did not return any projects for this query."
          />
        </div>

        <div id="config-settings-metadata">
          <ResourceMetadataWorkspace
            title="Tracked project metadata"
            description="Attach internal ownership, domain, or operational notes to tracked project records without changing Claude's settings files."
            inventories={[
              {
                label: "Tracked projects",
                resourceType: "config-project",
                items: (trackedProjects.data?.projects ?? []).map((project) => ({
                  id: project.path,
                  label: project.path,
                  detail: `${project.allowedToolsCount} tools · ${project.localMcpCount} MCP`,
                })),
              },
            ]}
          />
        </div>

        <div id="config-settings-payload">
          <JsonPreview
            title="Settings payload"
            data={{
              global: globalSummary.data,
              merged: mergedSettings.data,
              scopes: settingsFiles,
              projects: trackedProjects.data,
            }}
            emptyMessage="Settings payload is not available yet."
          />
        </div>
      </PageBodyWithRail>
    </section>
  );
}
