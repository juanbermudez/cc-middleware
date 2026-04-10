/**
 * Configuration API endpoints.
 * Exposes Claude Code's entire configuration system through the REST API.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { readAllSettings, mergeSettings } from "../../config/settings.js";
import {
  updateSettings,
  addPermissionRule,
  removePermissionRule,
  getSettingsPath,
} from "../../config/settings-writer.js";
import {
  listInstalledPlugins,
  listAvailablePluginsViaCli,
  getPluginDetails,
  getPluginProvenance,
  listKnownMarketplaces,
  listMarketplacePlugins,
  enablePlugin,
  disablePlugin,
  installPlugin,
  updatePlugin,
  uninstallPlugin,
  addMarketplace,
  removeMarketplace,
  updateMarketplace,
} from "../../config/plugins.js";
import {
  discoverSkills,
  discoverCommands,
  discoverAgents,
  discoverRules,
  discoverClaudeMd,
  createAgent,
  deleteAgent,
  updateAgent,
} from "../../config/components.js";
import { discoverMcpServers } from "../../config/mcp.js";
import { readProjectMemory, listAllProjectMemories } from "../../config/memory.js";
import { inspectClaudeRuntime } from "../../config/runtime.js";
import {
  readGlobalConfigSummary,
  listTrackedProjects,
  getTrackedProject,
  getCurrentProjectState,
  updateGlobalPreference,
} from "../../config/global.js";

/** Configuration context (project dir) */
export interface ConfigContext {
  projectDir?: string;
}

/** Request schemas */
const ScopeParam = z.enum(["user", "project", "local", "managed"]);
const WritableScopeParam = z.enum(["user", "project", "local"]);

const UpdateSettingSchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
});

const UpdateGlobalPreferenceSchema = z.object({
  value: z.unknown(),
});

const PermissionRuleSchema = z.object({
  rule: z.string().min(1),
  behavior: z.enum(["allow", "deny", "ask"]),
});

const CreateAgentSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  prompt: z.string().min(1),
  scope: z.enum(["project", "user"]).default("project"),
  model: z.string().optional(),
  tools: z.array(z.string()).optional(),
  maxTurns: z.number().int().positive().optional(),
  effort: z.string().optional(),
});

const UpdateAgentSchema = z.object({
  description: z.string().optional(),
  prompt: z.string().optional(),
  model: z.string().optional(),
  tools: z.array(z.string()).optional(),
  maxTurns: z.number().int().positive().optional(),
  effort: z.string().optional(),
});

const EnablePluginSchema = z.object({
  scope: z.enum(["user", "project", "local"]).default("user"),
  marketplace: z.string().default("claude-plugins-official"),
});

const PluginInstallSchema = z.object({
  name: z.string().min(1),
  scope: z.enum(["user", "project", "local"]).default("user"),
  marketplace: z.string().optional(),
});

const PluginUpdateSchema = z.object({
  scope: z.enum(["user", "project", "local", "managed"]).default("user"),
});

const PluginUninstallSchema = z.object({
  scope: z.enum(["user", "project", "local"]).default("user"),
  keepData: z.boolean().default(false),
});

const MarketplaceAddSchema = z.object({
  source: z.string().min(1),
  scope: z.enum(["user", "project", "local"]).default("user"),
  sparse: z.array(z.string().min(1)).optional(),
});

const MarketplaceUpdateSchema = z.object({
  name: z.string().min(1).optional(),
});

const ProjectLookupQuerySchema = z.object({
  path: z.string().min(1),
});

const ConfigSearchQuerySchema = z.object({
  q: z.string().optional(),
});

function qualifyPluginName(name: string, marketplace?: string): string {
  if (name.includes("@") || !marketplace) {
    return name;
  }
  return `${name}@${marketplace}`;
}

function normalizeSearchQuery(value?: string): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : undefined;
}

function parseSearchQuery(query: unknown): string | undefined {
  const parseResult = ConfigSearchQuerySchema.safeParse(query ?? {});
  return normalizeSearchQuery(parseResult.success ? parseResult.data.q : undefined);
}

function flattenSearchValues(values: unknown[]): string[] {
  const result: string[] = [];

  for (const value of values) {
    if (value == null) {
      continue;
    }

    if (Array.isArray(value)) {
      result.push(...flattenSearchValues(value));
      continue;
    }

    if (typeof value === "string") {
      result.push(value);
      continue;
    }

    if (typeof value === "number" || typeof value === "boolean") {
      result.push(String(value));
    }
  }

  return result;
}

function filterByQuery<T>(
  items: T[],
  query: string | undefined,
  getValues: (item: T) => unknown[]
): T[] {
  if (!query) {
    return items;
  }

  return items.filter((item) =>
    flattenSearchValues(getValues(item)).some((value) =>
      value.toLowerCase().includes(query)
    )
  );
}

/**
 * Register configuration routes on the Fastify instance.
 */
export function registerConfigRoutes(
  app: FastifyInstance,
  configCtx: ConfigContext
): void {
  const projectDir = configCtx.projectDir;

  // ========== Settings ==========

  // GET /api/v1/config/global - Get sanitized ~/.claude.json summary
  app.get("/api/v1/config/global", async () => {
    return readGlobalConfigSummary();
  });

  // GET /api/v1/config/projects - List tracked projects from ~/.claude.json
  app.get<{ Querystring: { q?: string } }>("/api/v1/config/projects", async (request) => {
    const query = parseSearchQuery(request.query);
    const projects = filterByQuery(
      await listTrackedProjects(),
      query,
      (project) => [
        project.path,
        project.allowedTools,
        project.mcpServerNames,
        project.enabledMcpjsonServers,
        project.disabledMcpjsonServers,
        project.hasTrustDialogAccepted,
        project.hasClaudeMdExternalIncludesApproved,
        project.hasClaudeMdExternalIncludesWarningShown,
      ]
    );
    return { projects, total: projects.length };
  });

  // GET /api/v1/config/projects/current - Get current project's tracked state
  app.get("/api/v1/config/projects/current", async (request, reply) => {
    const project = await getCurrentProjectState(projectDir);
    if (!project) {
      return reply.status(404).send({
        error: { code: "PROJECT_NOT_TRACKED", message: "Current project is not tracked in ~/.claude.json" },
      });
    }
    return reply.send(project);
  });

  // GET /api/v1/config/projects/lookup?path=... - Get one tracked project by path
  app.get<{
    Querystring: { path?: string };
  }>("/api/v1/config/projects/lookup", async (request, reply) => {
    const parseResult = ProjectLookupQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "Invalid query", details: parseResult.error.issues },
      });
    }

    const project = await getTrackedProject(parseResult.data.path);
    if (!project) {
      return reply.status(404).send({
        error: { code: "PROJECT_NOT_TRACKED", message: `Project ${parseResult.data.path} not found in ~/.claude.json` },
      });
    }

    return reply.send(project);
  });

  // PUT /api/v1/config/global/preferences/:key - Update one documented ~/.claude.json preference
  app.put<{
    Params: { key: string };
    Body: unknown;
  }>("/api/v1/config/global/preferences/:key", async (request, reply) => {
    const parseResult = UpdateGlobalPreferenceSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "Invalid request body", details: parseResult.error.issues },
      });
    }

    try {
      const result = await updateGlobalPreference(request.params.key, parseResult.data.value);
      return reply.send({
        status: "updated",
        key: result.key,
        before: result.before,
        after: result.after,
        path: result.path,
      });
    } catch (error) {
      return reply.status(400).send({
        error: {
          code: "INVALID_GLOBAL_PREFERENCE",
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });

  // GET /api/v1/config/settings - Get merged effective settings
  app.get("/api/v1/config/settings", async () => {
    const all = await readAllSettings(projectDir);
    const merged = mergeSettings(all.managed, all.user, all.project, all.local);
    return merged;
  });

  // GET /api/v1/config/settings/:scope - Get settings for specific scope
  app.get<{
    Params: { scope: string };
  }>("/api/v1/config/settings/:scope", async (request, reply) => {
    const scopeResult = ScopeParam.safeParse(request.params.scope);
    if (!scopeResult.success) {
      return reply.status(400).send({
        error: { code: "INVALID_SCOPE", message: `Invalid scope: ${request.params.scope}` },
      });
    }

    const scope = scopeResult.data;
    const all = await readAllSettings(projectDir);

    const file = scope === "managed" ? all.managed : all[scope];
    if (!file) {
      return reply.send({
        scope,
        exists: false,
        content: {},
      });
    }

    return reply.send(file);
  });

  // PUT /api/v1/config/settings/:scope - Update a setting value
  app.put<{
    Params: { scope: string };
    Body: unknown;
  }>("/api/v1/config/settings/:scope", async (request, reply) => {
    const scopeResult = WritableScopeParam.safeParse(request.params.scope);
    if (!scopeResult.success) {
      return reply.status(400).send({
        error: { code: "INVALID_SCOPE", message: "Cannot write to this scope" },
      });
    }

    const parseResult = UpdateSettingSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "Invalid request body", details: parseResult.error.issues },
      });
    }

    const { key, value } = parseResult.data;
    const scope = scopeResult.data;
    const path = key.split(".");

    const result = await updateSettings(
      { scope, path, operation: "set", value },
      projectDir
    );

    return reply.send(result);
  });

  // POST /api/v1/config/settings/:scope/permissions - Add a permission rule
  app.post<{
    Params: { scope: string };
    Body: unknown;
  }>("/api/v1/config/settings/:scope/permissions", async (request, reply) => {
    const scopeResult = WritableScopeParam.safeParse(request.params.scope);
    if (!scopeResult.success) {
      return reply.status(400).send({
        error: { code: "INVALID_SCOPE", message: "Cannot write to this scope" },
      });
    }

    const parseResult = PermissionRuleSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "Invalid request body", details: parseResult.error.issues },
      });
    }

    const { rule, behavior } = parseResult.data;
    await addPermissionRule(scopeResult.data, rule, behavior, projectDir);

    return reply.status(201).send({ status: "added", rule, behavior, scope: scopeResult.data });
  });

  // DELETE /api/v1/config/settings/:scope/permissions - Remove a permission rule
  app.delete<{
    Params: { scope: string };
    Body: unknown;
  }>("/api/v1/config/settings/:scope/permissions", async (request, reply) => {
    const scopeResult = WritableScopeParam.safeParse(request.params.scope);
    if (!scopeResult.success) {
      return reply.status(400).send({
        error: { code: "INVALID_SCOPE", message: "Cannot write to this scope" },
      });
    }

    const parseResult = PermissionRuleSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "Invalid request body", details: parseResult.error.issues },
      });
    }

    const { rule, behavior } = parseResult.data;
    await removePermissionRule(scopeResult.data, rule, behavior, projectDir);

    return reply.send({ status: "removed", rule, behavior, scope: scopeResult.data });
  });

  // ========== Plugins ==========

  // GET /api/v1/config/plugins - List all plugins
  app.get<{ Querystring: { q?: string } }>("/api/v1/config/plugins", async (request) => {
    const query = parseSearchQuery(request.query);
    const plugins = filterByQuery(
      await listInstalledPlugins(projectDir),
      query,
      (plugin) => [
        plugin.id,
        plugin.name,
        plugin.scope,
        plugin.marketplace,
        plugin.version,
        plugin.description,
        plugin.author?.name,
        plugin.sourcePath,
        plugin.cachePath,
        plugin.blockReason,
        plugin.blockMessage,
      ]
    );
    return { plugins, total: plugins.length };
  });

  // GET /api/v1/config/plugins/available - List installable plugins from Claude CLI
  app.get<{ Querystring: { q?: string } }>("/api/v1/config/plugins/available", async (request) => {
    const query = parseSearchQuery(request.query);
    const catalog = await listAvailablePluginsViaCli();
    const installed = filterByQuery(
      catalog.installed,
      query,
      (plugin) => [
        plugin.id,
        plugin.version,
        plugin.scope,
        plugin.installPath,
        plugin.projectPath,
      ]
    );
    const available = filterByQuery(
      catalog.available,
      query,
      (plugin) => [
        plugin.pluginId,
        plugin.name,
        plugin.description,
        plugin.marketplaceName,
        plugin.version,
      ]
    );
    return { installed, available };
  });

  // GET /api/v1/config/marketplaces - List known plugin marketplaces
  app.get<{ Querystring: { q?: string } }>("/api/v1/config/marketplaces", async (request) => {
    const query = parseSearchQuery(request.query);
    const marketplaces = filterByQuery(
      await listKnownMarketplaces(projectDir),
      query,
      (marketplace) => [
        marketplace.name,
        marketplace.installLocation,
        marketplace.pluginsPath,
        marketplace.externalPluginsPath,
        marketplace.pluginCount,
        marketplace.installedCount,
        marketplace.blockedCount,
      ]
    );
    return { marketplaces, total: marketplaces.length };
  });

  // POST /api/v1/config/marketplaces - Add a marketplace via Claude CLI
  app.post<{ Body: unknown }>("/api/v1/config/marketplaces", async (request, reply) => {
    const parseResult = MarketplaceAddSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "Invalid request body", details: parseResult.error.issues },
      });
    }

    const result = await addMarketplace(parseResult.data.source, {
      scope: parseResult.data.scope,
      sparse: parseResult.data.sparse,
    });

    if (!result.success) {
      return reply.status(502).send({
        error: { code: "CLAUDE_CLI_ERROR", message: result.output || "Failed to add marketplace" },
      });
    }

    return reply.status(201).send({
      status: "added",
      source: parseResult.data.source,
      scope: parseResult.data.scope,
      sparse: parseResult.data.sparse ?? [],
      output: result.output,
    });
  });

  // POST /api/v1/config/marketplaces/update - Update one or all marketplaces via Claude CLI
  app.post<{ Body: unknown }>("/api/v1/config/marketplaces/update", async (request, reply) => {
    const parseResult = MarketplaceUpdateSchema.safeParse(request.body ?? {});
    if (!parseResult.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "Invalid request body", details: parseResult.error.issues },
      });
    }

    const result = await updateMarketplace(parseResult.data.name);
    if (!result.success) {
      return reply.status(502).send({
        error: { code: "CLAUDE_CLI_ERROR", message: result.output || "Failed to update marketplace" },
      });
    }

    return reply.send({
      status: "updated",
      name: parseResult.data.name ?? null,
      output: result.output,
    });
  });

  // GET /api/v1/config/marketplaces/:name/plugins - List available marketplace plugins
  app.get<{
    Params: { name: string };
  }>("/api/v1/config/marketplaces/:name/plugins", async (request, reply) => {
    const marketplaces = await listKnownMarketplaces(projectDir);
    const marketplace = marketplaces.find((entry) => entry.name === request.params.name);
    if (!marketplace) {
      return reply.status(404).send({
        error: { code: "MARKETPLACE_NOT_FOUND", message: `Marketplace ${request.params.name} not found` },
      });
    }

    const plugins = await listMarketplacePlugins(request.params.name, projectDir);
    return reply.send({
      marketplace,
      plugins,
      total: plugins.length,
    });
  });

  // DELETE /api/v1/config/marketplaces/:name - Remove a marketplace via Claude CLI
  app.delete<{
    Params: { name: string };
  }>("/api/v1/config/marketplaces/:name", async (request, reply) => {
    const result = await removeMarketplace(request.params.name);
    if (!result.success) {
      return reply.status(502).send({
        error: { code: "CLAUDE_CLI_ERROR", message: result.output || "Failed to remove marketplace" },
      });
    }

    return reply.send({
      status: "removed",
      name: request.params.name,
      output: result.output,
    });
  });

  // GET /api/v1/config/plugins/:name - Get plugin details
  app.get<{
    Params: { name: string };
  }>("/api/v1/config/plugins/:name", async (request, reply) => {
    const plugin = await getPluginDetails(request.params.name, projectDir);
    if (!plugin) {
      return reply.status(404).send({
        error: { code: "PLUGIN_NOT_FOUND", message: `Plugin ${request.params.name} not found` },
      });
    }
    return reply.send(plugin);
  });

  // GET /api/v1/config/plugins/:name/provenance - Explain plugin activation state
  app.get<{
    Params: { name: string };
  }>("/api/v1/config/plugins/:name/provenance", async (request, reply) => {
    const provenance = await getPluginProvenance(request.params.name, projectDir);
    if (!provenance) {
      return reply.status(404).send({
        error: { code: "PLUGIN_NOT_FOUND", message: `Plugin ${request.params.name} not found` },
      });
    }
    return reply.send(provenance);
  });

  // POST /api/v1/config/plugins/install - Install a plugin via Claude CLI
  app.post<{ Body: unknown }>("/api/v1/config/plugins/install", async (request, reply) => {
    const parseResult = PluginInstallSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "Invalid request body", details: parseResult.error.issues },
      });
    }

    const qualifiedName = qualifyPluginName(
      parseResult.data.name,
      parseResult.data.marketplace
    );
    const result = await installPlugin(qualifiedName, {
      scope: parseResult.data.scope,
    });

    if (!result.success) {
      return reply.status(502).send({
        error: { code: "CLAUDE_CLI_ERROR", message: result.output || "Failed to install plugin" },
      });
    }

    return reply.status(201).send({
      status: "installed",
      name: qualifiedName,
      scope: parseResult.data.scope,
      output: result.output,
    });
  });

  // POST /api/v1/config/plugins/:name/enable - Enable a plugin
  app.post<{
    Params: { name: string };
    Body: unknown;
  }>("/api/v1/config/plugins/:name/enable", async (request, reply) => {
    const params = EnablePluginSchema.safeParse(request.body ?? {});
    const { scope, marketplace } = params.success ? params.data : { scope: "user" as const, marketplace: "claude-plugins-official" };

    await enablePlugin(request.params.name, marketplace, scope, projectDir);
    return reply.send({ status: "enabled", name: request.params.name, scope });
  });

  // POST /api/v1/config/plugins/:name/disable - Disable a plugin
  app.post<{
    Params: { name: string };
    Body: unknown;
  }>("/api/v1/config/plugins/:name/disable", async (request, reply) => {
    const params = EnablePluginSchema.safeParse(request.body ?? {});
    const { scope, marketplace } = params.success ? params.data : { scope: "user" as const, marketplace: "claude-plugins-official" };

    await disablePlugin(request.params.name, marketplace, scope, projectDir);
    return reply.send({ status: "disabled", name: request.params.name, scope });
  });

  // POST /api/v1/config/plugins/:name/update - Update a plugin via Claude CLI
  app.post<{
    Params: { name: string };
    Body: unknown;
  }>("/api/v1/config/plugins/:name/update", async (request, reply) => {
    const parseResult = PluginUpdateSchema.safeParse(request.body ?? {});
    if (!parseResult.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "Invalid request body", details: parseResult.error.issues },
      });
    }

    const result = await updatePlugin(request.params.name, {
      scope: parseResult.data.scope,
    });
    if (!result.success) {
      return reply.status(502).send({
        error: { code: "CLAUDE_CLI_ERROR", message: result.output || "Failed to update plugin" },
      });
    }

    return reply.send({
      status: "updated",
      name: request.params.name,
      scope: parseResult.data.scope,
      output: result.output,
    });
  });

  // POST /api/v1/config/plugins/:name/uninstall - Uninstall a plugin via Claude CLI
  app.post<{
    Params: { name: string };
    Body: unknown;
  }>("/api/v1/config/plugins/:name/uninstall", async (request, reply) => {
    const parseResult = PluginUninstallSchema.safeParse(request.body ?? {});
    if (!parseResult.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "Invalid request body", details: parseResult.error.issues },
      });
    }

    const result = await uninstallPlugin(request.params.name, {
      scope: parseResult.data.scope,
      keepData: parseResult.data.keepData,
    });
    if (!result.success) {
      return reply.status(502).send({
        error: { code: "CLAUDE_CLI_ERROR", message: result.output || "Failed to uninstall plugin" },
      });
    }

    return reply.send({
      status: "uninstalled",
      name: request.params.name,
      scope: parseResult.data.scope,
      keepData: parseResult.data.keepData,
      output: result.output,
    });
  });

  // ========== Skills, Agents, Rules ==========

  // GET /api/v1/config/skills - List all skills
  app.get<{ Querystring: { q?: string } }>("/api/v1/config/skills", async (request) => {
    const query = parseSearchQuery(request.query);
    const skills = filterByQuery(
      await discoverSkills({ projectDir }),
      query,
      (skill) => [
        skill.name,
        skill.qualifiedName,
        skill.description,
        skill.scope,
        skill.pluginId,
        skill.pluginName,
        skill.pluginMarketplace,
        skill.path,
      ]
    );
    return { skills, total: skills.length };
  });

  // GET /api/v1/config/commands - List all legacy slash commands
  app.get<{ Querystring: { q?: string } }>("/api/v1/config/commands", async (request) => {
    const query = parseSearchQuery(request.query);
    const commands = filterByQuery(
      await discoverCommands({ projectDir }),
      query,
      (command) => [
        command.name,
        command.qualifiedName,
        command.description,
        command.scope,
        command.pluginId,
        command.pluginName,
        command.pluginMarketplace,
        command.argumentHint,
        command.path,
      ]
    );
    return { commands, total: commands.length };
  });

  // GET /api/v1/config/agents - List all agent definitions (file-based)
  app.get<{ Querystring: { q?: string } }>("/api/v1/config/agents", async (request) => {
    const query = parseSearchQuery(request.query);
    const agents = filterByQuery(
      await discoverAgents({ projectDir }),
      query,
      (agent) => [
        agent.name,
        agent.qualifiedName,
        agent.description,
        agent.scope,
        agent.pluginId,
        agent.pluginName,
        agent.pluginMarketplace,
        agent.model,
        agent.tools,
        agent.disallowedTools,
        agent.effort,
        agent.permissionMode,
        agent.path,
      ]
    );
    return { agents, total: agents.length };
  });

  // POST /api/v1/config/agents - Create a new agent
  app.post<{ Body: unknown }>("/api/v1/config/agents", async (request, reply) => {
    const parseResult = CreateAgentSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "Invalid request body", details: parseResult.error.issues },
      });
    }

    const data = parseResult.data;
    const filePath = await createAgent(
      data.scope,
      data.name,
      {
        description: data.description,
        prompt: data.prompt,
        model: data.model,
        tools: data.tools,
        maxTurns: data.maxTurns,
        effort: data.effort,
      },
      projectDir
    );

    return reply.status(201).send({ status: "created", path: filePath, name: data.name });
  });

  // PUT /api/v1/config/agents/:name - Update agent definition
  app.put<{
    Params: { name: string };
    Body: unknown;
  }>("/api/v1/config/agents/:name", async (request, reply) => {
    const parseResult = UpdateAgentSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "Invalid request body", details: parseResult.error.issues },
      });
    }

    const agents = await discoverAgents({ projectDir });
    const agent = agents.find((a) => a.name === request.params.name);
    if (!agent) {
      return reply.status(404).send({
        error: { code: "AGENT_NOT_FOUND", message: `Agent ${request.params.name} not found` },
      });
    }

    await updateAgent(agent.path, parseResult.data);
    return reply.send({ status: "updated", name: request.params.name });
  });

  // DELETE /api/v1/config/agents/:name - Delete agent definition
  app.delete<{
    Params: { name: string };
  }>("/api/v1/config/agents/:name", async (request, reply) => {
    const agents = await discoverAgents({ projectDir });
    const agent = agents.find((a) => a.name === request.params.name);
    if (!agent) {
      return reply.status(404).send({
        error: { code: "AGENT_NOT_FOUND", message: `Agent ${request.params.name} not found` },
      });
    }

    await deleteAgent(agent.path);
    return reply.send({ status: "deleted", name: request.params.name });
  });

  // GET /api/v1/config/rules - List all rules
  app.get<{ Querystring: { q?: string } }>("/api/v1/config/rules", async (request) => {
    const query = parseSearchQuery(request.query);
    const rules = filterByQuery(
      await discoverRules({ projectDir }),
      query,
      (rule) => [rule.path, rule.scope, rule.paths, rule.content]
    );
    return { rules, total: rules.length };
  });

  // ========== MCP Servers ==========

  // GET /api/v1/config/mcp - List all MCP servers
  app.get<{ Querystring: { q?: string } }>("/api/v1/config/mcp", async (request) => {
    const query = parseSearchQuery(request.query);
    const servers = filterByQuery(
      await discoverMcpServers({ projectDir }),
      query,
      (server) => [
        server.name,
        server.scope,
        server.transport,
        server.command,
        server.args,
        server.url,
        server.source,
      ]
    );
    return { servers, total: servers.length };
  });

  // GET /api/v1/config/runtime - Inspect effective Claude runtime inventory
  app.get("/api/v1/config/runtime", async () => {
    const runtime = await inspectClaudeRuntime({ projectDir });
    return runtime;
  });

  // GET /api/v1/config/runtime/tools - Search runtime tools
  app.get<{ Querystring: { q?: string } }>("/api/v1/config/runtime/tools", async (request) => {
    const query = parseSearchQuery(request.query);
    const runtime = await inspectClaudeRuntime({ projectDir });
    const tools = filterByQuery(runtime.tools, query, (tool) => [tool]);
    return { tools, total: tools.length };
  });

  // GET /api/v1/config/runtime/commands - Search structured runtime commands
  app.get<{ Querystring: { q?: string } }>("/api/v1/config/runtime/commands", async (request) => {
    const query = parseSearchQuery(request.query);
    const runtime = await inspectClaudeRuntime({ projectDir });
    const commands = filterByQuery(
      runtime.commands,
      query,
      (command) => [command.name, command.description, command.argumentHint]
    );
    return { commands, total: commands.length, slashCommands: runtime.slashCommands };
  });

  // GET /api/v1/config/runtime/skills - Search runtime-loaded skills
  app.get<{ Querystring: { q?: string } }>("/api/v1/config/runtime/skills", async (request) => {
    const query = parseSearchQuery(request.query);
    const runtime = await inspectClaudeRuntime({ projectDir });
    const skills = filterByQuery(runtime.skills, query, (skill) => [skill]);
    return { skills, total: skills.length };
  });

  // GET /api/v1/config/runtime/plugins - Search runtime-loaded plugins
  app.get<{ Querystring: { q?: string } }>("/api/v1/config/runtime/plugins", async (request) => {
    const query = parseSearchQuery(request.query);
    const runtime = await inspectClaudeRuntime({ projectDir });
    const plugins = filterByQuery(
      runtime.plugins,
      query,
      (plugin) => [plugin.name, plugin.path, plugin.source]
    );
    return { plugins, total: plugins.length };
  });

  // GET /api/v1/config/runtime/mcp - Search runtime MCP servers
  app.get<{ Querystring: { q?: string } }>("/api/v1/config/runtime/mcp", async (request) => {
    const query = parseSearchQuery(request.query);
    const runtime = await inspectClaudeRuntime({ projectDir });
    const servers = filterByQuery(
      runtime.mcpServers,
      query,
      (server) => [server.name, server.status]
    );
    return { servers, total: servers.length };
  });

  // GET /api/v1/config/runtime/agents - Search runtime agent details
  app.get<{ Querystring: { q?: string } }>("/api/v1/config/runtime/agents", async (request) => {
    const query = parseSearchQuery(request.query);
    const runtime = await inspectClaudeRuntime({ projectDir });
    const agents = filterByQuery(
      runtime.agentDetails,
      query,
      (agent) => [agent.name, agent.description, agent.model]
    );
    return { agents, total: agents.length, names: runtime.agents };
  });

  // GET /api/v1/config/runtime/models - Search runtime model catalog
  app.get<{ Querystring: { q?: string } }>("/api/v1/config/runtime/models", async (request) => {
    const query = parseSearchQuery(request.query);
    const runtime = await inspectClaudeRuntime({ projectDir });
    const models = filterByQuery(
      runtime.models,
      query,
      (model) => [model.value, model.displayName, model.description]
    );
    return {
      models,
      total: models.length,
      outputStyle: runtime.outputStyle,
      availableOutputStyles: runtime.availableOutputStyles,
    };
  });

  // ========== Memory ==========

  // GET /api/v1/config/memory - Get project memory index
  app.get("/api/v1/config/memory", async () => {
    const memory = await readProjectMemory(projectDir);
    return {
      projectKey: memory.projectKey,
      memoryDir: memory.memoryDir,
      hasIndex: memory.indexContent.length > 0,
      indexContent: memory.indexContent,
      fileCount: memory.files.length,
    };
  });

  // GET /api/v1/config/memory/files - List memory files
  app.get<{ Querystring: { q?: string } }>("/api/v1/config/memory/files", async (request) => {
    const query = parseSearchQuery(request.query);
    const memory = await readProjectMemory(projectDir);
    const files = filterByQuery(
      memory.files,
      query,
      (file) => [file.name, file.type, file.description, file.path, file.content]
    );
    return {
      files: files.map((f) => ({
        name: f.name,
        type: f.type,
        description: f.description,
        lastModified: f.lastModified,
        path: f.path,
      })),
      total: files.length,
    };
  });

  // GET /api/v1/config/memory/files/:name - Read a memory file
  app.get<{
    Params: { name: string };
  }>("/api/v1/config/memory/files/:name", async (request, reply) => {
    const memory = await readProjectMemory(projectDir);
    const file = memory.files.find((f) => f.name === request.params.name);
    if (!file) {
      return reply.status(404).send({
        error: { code: "MEMORY_FILE_NOT_FOUND", message: `Memory file ${request.params.name} not found` },
      });
    }
    return reply.send(file);
  });

  // GET /api/v1/config/memory/projects - List all project memories
  app.get<{ Querystring: { q?: string } }>("/api/v1/config/memory/projects", async (request) => {
    const query = parseSearchQuery(request.query);
    const memories = filterByQuery(
      await listAllProjectMemories(),
      query,
      (memory) => [memory.projectKey, memory.dir]
    );
    return { projects: memories, total: memories.length };
  });

  // ========== CLAUDE.md ==========

  // GET /api/v1/config/claude-md - List all CLAUDE.md files
  app.get<{ Querystring: { q?: string } }>("/api/v1/config/claude-md", async (request) => {
    const query = parseSearchQuery(request.query);
    const files = filterByQuery(
      await discoverClaudeMd({ projectDir }),
      query,
      (file) => [file.path, file.scope, file.imports, file.content]
    );
    return { files, total: files.length };
  });
}
