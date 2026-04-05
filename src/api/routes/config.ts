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
  getPluginDetails,
  enablePlugin,
  disablePlugin,
} from "../../config/plugins.js";
import {
  discoverSkills,
  discoverAgents,
  discoverRules,
  discoverClaudeMd,
  createAgent,
  deleteAgent,
  updateAgent,
} from "../../config/components.js";
import { discoverMcpServers } from "../../config/mcp.js";
import { readProjectMemory, listAllProjectMemories } from "../../config/memory.js";

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

/**
 * Register configuration routes on the Fastify instance.
 */
export function registerConfigRoutes(
  app: FastifyInstance,
  configCtx: ConfigContext
): void {
  const projectDir = configCtx.projectDir;

  // ========== Settings ==========

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
  app.get("/api/v1/config/plugins", async () => {
    const plugins = await listInstalledPlugins(projectDir);
    return { plugins, total: plugins.length };
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

  // ========== Skills, Agents, Rules ==========

  // GET /api/v1/config/skills - List all skills
  app.get("/api/v1/config/skills", async () => {
    const skills = await discoverSkills({ projectDir });
    return { skills, total: skills.length };
  });

  // GET /api/v1/config/agents - List all agent definitions (file-based)
  app.get("/api/v1/config/agents", async () => {
    const agents = await discoverAgents({ projectDir });
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
  app.get("/api/v1/config/rules", async () => {
    const rules = await discoverRules({ projectDir });
    return { rules, total: rules.length };
  });

  // ========== MCP Servers ==========

  // GET /api/v1/config/mcp - List all MCP servers
  app.get("/api/v1/config/mcp", async () => {
    const servers = await discoverMcpServers({ projectDir });
    return { servers, total: servers.length };
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
  app.get("/api/v1/config/memory/files", async () => {
    const memory = await readProjectMemory(projectDir);
    return {
      files: memory.files.map((f) => ({
        name: f.name,
        type: f.type,
        description: f.description,
        lastModified: f.lastModified,
        path: f.path,
      })),
      total: memory.files.length,
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
  app.get("/api/v1/config/memory/projects", async () => {
    const memories = await listAllProjectMemories();
    return { projects: memories, total: memories.length };
  });

  // ========== CLAUDE.md ==========

  // GET /api/v1/config/claude-md - List all CLAUDE.md files
  app.get("/api/v1/config/claude-md", async () => {
    const files = await discoverClaudeMd({ projectDir });
    return { files, total: files.length };
  });
}
