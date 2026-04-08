/**
 * E2E test: Configuration API endpoints.
 * Tests settings, global config, plugins, skills, agents, rules, MCP, memory,
 * runtime inventory, marketplaces, and CLAUDE.md.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createMiddlewareServer } from "../../src/api/server.js";
import { SessionManager } from "../../src/sessions/manager.js";
import { HookEventBus } from "../../src/hooks/event-bus.js";
import { BlockingHookRegistry } from "../../src/hooks/blocking.js";
import { PolicyEngine } from "../../src/permissions/policy.js";
import { AgentRegistry } from "../../src/agents/registry.js";
import { TeamManager } from "../../src/agents/teams.js";
import { PermissionManager } from "../../src/permissions/handler.js";
import { AskUserQuestionManager } from "../../src/permissions/ask-user.js";
import type { MiddlewareServer } from "../../src/api/server.js";

let server: MiddlewareServer;
let tempDir: string;
let tempHome: string;
let fakeClaudeLogPath: string;
let originalHome: string | undefined;
let originalUserProfile: string | undefined;
let originalClaudePath: string | undefined;
let originalFakeClaudeLog: string | undefined;
const baseUrl = "http://middleware.local";

beforeAll(async () => {
  // Create a temp project with config components
  tempDir = mkdtempSync(join(tmpdir(), "cc-api-config-test-"));
  tempHome = mkdtempSync(join(tmpdir(), "cc-api-config-home-"));
  originalHome = process.env.HOME;
  originalUserProfile = process.env.USERPROFILE;
  process.env.HOME = tempHome;
  process.env.USERPROFILE = tempHome;
  originalClaudePath = process.env.CLAUDE_PATH;
  originalFakeClaudeLog = process.env.FAKE_CLAUDE_LOG;

  const claudeDir = join(tempHome, ".claude");
  mkdirSync(claudeDir, { recursive: true });
  mkdirSync(join(claudeDir, "plugins"), { recursive: true });

  // Create ~/.claude/settings.json
  writeFileSync(
    join(claudeDir, "settings.json"),
    JSON.stringify({
      enabledPlugins: {
        "sdk-tools@claude-plugins-official": true,
      },
      permissions: {
        allow: ["Read"],
      },
      env: { HOME_TEST_VAR: "from-user" },
    })
  );

  // Create .claude/settings.json
  mkdirSync(join(tempDir, ".claude"), { recursive: true });
  writeFileSync(
    join(tempDir, ".claude", "settings.json"),
    JSON.stringify({
      permissions: {
        allow: ["Read", "Glob"],
      },
      env: { TEST_VAR: "hello" },
    })
  );

  // Create .claude/agents/test-agent.md
  mkdirSync(join(tempDir, ".claude", "agents"), { recursive: true });
  writeFileSync(
    join(tempDir, ".claude", "agents", "api-test-agent.md"),
    `---
name: api-test-agent
description: Agent for API testing
model: sonnet
---

You are a test agent.
`
  );

  // Create CLAUDE.md
  writeFileSync(join(tempDir, "CLAUDE.md"), "# API Config Test\n\nTest project.\n");

  // Create ~/.claude.json
  writeFileSync(
    join(tempHome, ".claude.json"),
    JSON.stringify({
      numStartups: 12,
      installMethod: "native",
      autoUpdates: true,
      hasCompletedOnboarding: true,
      lastOnboardingVersion: "2.1.92",
      lastReleaseNotesSeen: "2.1.92",
      hasSeenTasksHint: true,
      promptQueueUseCount: 3,
      autoConnectIde: true,
      autoInstallIdeExtension: false,
      editorMode: "vim",
      showTurnDuration: true,
      terminalProgressBarEnabled: false,
      teammateMode: "enabled",
      cachedGrowthBookFeatures: {
        alphaFeature: true,
        betaFeature: false,
      },
      mcpServers: {
        "global-test": {
          type: "stdio",
          command: "node",
        },
      },
      projects: {
        [tempDir]: {
          allowedTools: ["Read", "Glob"],
          mcpServers: {
            "local-test": {
              type: "stdio",
              command: "node",
            },
          },
          enabledMcpjsonServers: ["workspace-server"],
          disabledMcpjsonServers: ["blocked-server"],
          hasTrustDialogAccepted: true,
          hasClaudeMdExternalIncludesApproved: false,
          hasClaudeMdExternalIncludesWarningShown: true,
          projectOnboardingSeenCount: 2,
          lastCost: 0.42,
          lastDuration: 1800,
          lastSessionId: "session-123",
        },
      },
    })
  );

  const marketplaceRoot = join(
    claudeDir,
    "plugins",
    "marketplaces",
    "claude-plugins-official"
  );
  const sourcePluginRoot = join(marketplaceRoot, "plugins");
  const sourceExternalRoot = join(marketplaceRoot, "external_plugins");
  mkdirSync(sourcePluginRoot, { recursive: true });
  mkdirSync(sourceExternalRoot, { recursive: true });

  // Available marketplace plugin: sdk-tools
  mkdirSync(join(sourcePluginRoot, "sdk-tools", ".claude-plugin"), { recursive: true });
  mkdirSync(join(sourcePluginRoot, "sdk-tools", "commands"), { recursive: true });
  mkdirSync(join(sourcePluginRoot, "sdk-tools", "skills", "verifier"), { recursive: true });
  mkdirSync(join(sourcePluginRoot, "sdk-tools", "agents"), { recursive: true });
  writeFileSync(
    join(sourcePluginRoot, "sdk-tools", ".claude-plugin", "plugin.json"),
    JSON.stringify({
      name: "sdk-tools",
      version: "1.2.3",
      description: "SDK helper tools",
    })
  );
  writeFileSync(
    join(sourcePluginRoot, "sdk-tools", "commands", "new-sdk-app.md"),
    "# New SDK App\n"
  );
  writeFileSync(
    join(sourcePluginRoot, "sdk-tools", "skills", "verifier", "SKILL.md"),
    "---\nname: sdk-verifier\n---\n\nVerify SDK projects.\n"
  );
  writeFileSync(
    join(sourcePluginRoot, "sdk-tools", "agents", "sdk-agent.md"),
    `---
name: sdk-agent
description: SDK agent
model: sonnet
---

You are an SDK agent.
`
  );

  // Available marketplace external plugin
  mkdirSync(join(sourceExternalRoot, "vendor-db", ".claude-plugin"), { recursive: true });
  mkdirSync(join(sourceExternalRoot, "vendor-db", "skills", "db"), { recursive: true });
  writeFileSync(
    join(sourceExternalRoot, "vendor-db", ".claude-plugin", "plugin.json"),
    JSON.stringify({
      name: "vendor-db",
      version: "0.9.0",
      description: "Vendor database helpers",
    })
  );
  writeFileSync(
    join(sourceExternalRoot, "vendor-db", "skills", "db", "SKILL.md"),
    "---\nname: vendor-db\n---\n\nUse the vendor DB plugin.\n"
  );

  // Available but blocked marketplace plugin
  mkdirSync(join(sourcePluginRoot, "blocked-plugin", ".claude-plugin"), { recursive: true });
  writeFileSync(
    join(sourcePluginRoot, "blocked-plugin", ".claude-plugin", "plugin.json"),
    JSON.stringify({
      name: "blocked-plugin",
      version: "0.1.0",
      description: "Blocked plugin for tests",
    })
  );

  // Installed plugin cache for sdk-tools
  const cachePluginRoot = join(
    claudeDir,
    "plugins",
    "cache",
    "claude-plugins-official",
    "sdk-tools",
    "snapshot"
  );
  mkdirSync(join(cachePluginRoot, ".claude-plugin"), { recursive: true });
  mkdirSync(join(cachePluginRoot, "commands"), { recursive: true });
  mkdirSync(join(cachePluginRoot, "skills", "verifier"), { recursive: true });
  mkdirSync(join(cachePluginRoot, "agents"), { recursive: true });
  writeFileSync(
    join(cachePluginRoot, ".claude-plugin", "plugin.json"),
    JSON.stringify({
      name: "sdk-tools",
      version: "1.2.3",
      description: "SDK helper tools",
    })
  );
  writeFileSync(
    join(cachePluginRoot, "commands", "new-sdk-app.md"),
    "# New SDK App\n"
  );
  writeFileSync(
    join(cachePluginRoot, "skills", "verifier", "SKILL.md"),
    "---\nname: sdk-verifier\n---\n\nVerify SDK projects.\n"
  );
  writeFileSync(
    join(cachePluginRoot, "agents", "sdk-agent.md"),
    `---
name: sdk-agent
description: SDK agent
model: sonnet
---

You are an SDK agent.
`
  );

  writeFileSync(
    join(claudeDir, "plugins", "installed_plugins.json"),
    JSON.stringify({
      version: 2,
      plugins: {
        "sdk-tools@claude-plugins-official": [
          {
            scope: "user",
            installPath: cachePluginRoot,
            version: "1.2.3",
            installedAt: "2026-04-06T12:00:00.000Z",
            lastUpdated: "2026-04-06T12:00:00.000Z",
          },
        ],
      },
    })
  );

  writeFileSync(
    join(claudeDir, "plugins", "known_marketplaces.json"),
    JSON.stringify({
      "claude-plugins-official": {
        installLocation: marketplaceRoot,
        lastUpdated: "2026-04-06T12:00:00.000Z",
        source: {
          type: "github",
          repository: "anthropic/claude-plugins",
        },
      },
    })
  );

  writeFileSync(
    join(claudeDir, "plugins", "blocklist.json"),
    JSON.stringify({
      fetchedAt: "2026-04-06T12:00:00.000Z",
      plugins: [
        {
          plugin: "blocked-plugin@claude-plugins-official",
          reason: "policy",
          text: "Blocked in test fixture",
        },
      ],
    })
  );

  const fakeClaudePath = join(tempHome, "fake-claude");
  fakeClaudeLogPath = join(tempHome, "fake-claude-log.jsonl");
  writeFileSync(
    fakeClaudePath,
    `#!/usr/bin/env node
const fs = require("fs");
const args = process.argv.slice(2);
const logPath = process.env.FAKE_CLAUDE_LOG;
if (logPath) {
  fs.appendFileSync(logPath, JSON.stringify(args) + "\\n");
}

function writeJson(value) {
  process.stdout.write(JSON.stringify(value, null, 2));
}

if (args[0] === "plugin" && args[1] === "list" && args.includes("--json") && args.includes("--available")) {
  writeJson({
    installed: [
      {
        id: "sdk-tools@claude-plugins-official",
        scope: "user",
        enabled: true,
        version: "1.2.3",
      }
    ],
    available: [
      {
        pluginId: "sdk-tools@claude-plugins-official",
        name: "sdk-tools",
        marketplaceName: "claude-plugins-official",
        description: "SDK helper tools",
      },
      {
        pluginId: "vendor-db@claude-plugins-official",
        name: "vendor-db",
        marketplaceName: "claude-plugins-official",
        description: "Vendor database helpers",
      }
    ]
  });
  process.exit(0);
}

if (args[0] === "plugin" && args[1] === "marketplace" && args[2] === "list" && args.includes("--json")) {
  writeJson([
    {
      name: "claude-plugins-official",
      source: "github",
      repo: "anthropics/claude-plugins-official",
      installLocation: "${marketplaceRoot.replace(/\\/g, "\\\\")}",
    }
  ]);
  process.exit(0);
}

process.stdout.write("ok\\n");
`
  );
  chmodSync(fakeClaudePath, 0o755);
  process.env.CLAUDE_PATH = fakeClaudePath;
  process.env.FAKE_CLAUDE_LOG = fakeClaudeLogPath;

  server = await createMiddlewareServer({
    port: 0,
    host: "127.0.0.1",
    sessionManager: new SessionManager(),
    eventBus: new HookEventBus(),
    blockingRegistry: new BlockingHookRegistry(),
    policyEngine: new PolicyEngine({ rules: [], defaultBehavior: "allow" }),
    agentRegistry: new AgentRegistry(),
    teamManager: new TeamManager(),
    permissionManager: new PermissionManager(),
    askUserManager: new AskUserQuestionManager(),
    projectDir: tempDir,
  });
});

afterAll(async () => {
  if (server) await server.stop();
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  if (tempHome) rmSync(tempHome, { recursive: true, force: true });
  if (originalClaudePath === undefined) {
    delete process.env.CLAUDE_PATH;
  } else {
    process.env.CLAUDE_PATH = originalClaudePath;
  }
  if (originalFakeClaudeLog === undefined) {
    delete process.env.FAKE_CLAUDE_LOG;
  } else {
    process.env.FAKE_CLAUDE_LOG = originalFakeClaudeLog;
  }
  if (originalHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }
  if (originalUserProfile === undefined) {
    delete process.env.USERPROFILE;
  } else {
    process.env.USERPROFILE = originalUserProfile;
  }
});

function readFakeClaudeInvocations(): string[][] {
  try {
    return readFileSync(fakeClaudeLogPath, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as string[]);
  } catch {
    return [];
  }
}

async function apiFetch(
  input: string,
  options?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }
): Promise<{
  status: number;
  json: () => Promise<any>;
  text: () => Promise<string>;
}> {
  const parsed = input.startsWith("http://") || input.startsWith("https://")
    ? new URL(input)
    : new URL(input, "http://middleware.local");

  const response = await server.app.inject({
    method: options?.method ?? "GET",
    url: `${parsed.pathname}${parsed.search}`,
    headers: options?.headers,
    payload: options?.body,
  });

  return {
    status: response.statusCode,
    json: async () => response.json(),
    text: async () => response.body,
  };
}

describe("Configuration API Endpoints (E2E)", () => {
  describe("Global Config", () => {
    it("should get a sanitized ~/.claude.json summary", async () => {
      const resp = await apiFetch(`${baseUrl}/api/v1/config/global`);
      expect(resp.status).toBe(200);
      const body = await resp.json();

      expect(body.exists).toBe(true);
      expect(body.path).toContain(".claude.json");
      expect(body.stats.installMethod).toBe("native");
      expect(body.featureFlagCount).toBe(2);
      expect(body.userMcpCount).toBe(1);
      expect(body.trackedProjectCount).toBe(1);
    });

    it("should update a documented global preference", async () => {
      const resp = await apiFetch(`${baseUrl}/api/v1/config/global/preferences/autoConnectIde`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: false }),
      });
      expect(resp.status).toBe(200);
      const body = await resp.json();

      expect(body.status).toBe("updated");
      expect(body.key).toBe("autoConnectIde");
      expect(body.after).toBe(false);

      const globalConfig = JSON.parse(readFileSync(join(tempHome, ".claude.json"), "utf8")) as Record<string, unknown>;
      expect(globalConfig.autoConnectIde).toBe(false);
    });

    it("should reject unsupported global preferences", async () => {
      const resp = await apiFetch(`${baseUrl}/api/v1/config/global/preferences/notARealPreference`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: true }),
      });
      expect(resp.status).toBe(400);
    });

    it("should list tracked projects from ~/.claude.json", async () => {
      const resp = await apiFetch(`${baseUrl}/api/v1/config/projects`);
      expect(resp.status).toBe(200);
      const body = await resp.json();

      expect(body.total).toBe(1);
      expect(Array.isArray(body.projects)).toBe(true);
      expect(body.projects[0].path).toBe(tempDir);
    });

    it("should get the current tracked project state", async () => {
      const resp = await apiFetch(`${baseUrl}/api/v1/config/projects/current`);
      expect(resp.status).toBe(200);
      const body = await resp.json();

      expect(body.path).toBe(tempDir);
      expect(body.allowedToolsCount).toBe(2);
      expect(body.localMcpCount).toBe(1);
      expect(body.hasTrustDialogAccepted).toBe(true);
      expect(body.metrics.lastSessionId).toBe("session-123");
    });

    it("should look up a tracked project by path", async () => {
      const params = new URLSearchParams({ path: tempDir });
      const resp = await apiFetch(`${baseUrl}/api/v1/config/projects/lookup?${params.toString()}`);
      expect(resp.status).toBe(200);
      const body = await resp.json();

      expect(body.path).toBe(tempDir);
      expect(body.enabledMcpjsonServers).toEqual(["workspace-server"]);
    });

    it("should return 404 for an untracked project path", async () => {
      const params = new URLSearchParams({ path: join(tempDir, "missing-project") });
      const resp = await apiFetch(`${baseUrl}/api/v1/config/projects/lookup?${params.toString()}`);
      expect(resp.status).toBe(404);
    });
  });

  // ========== Settings ==========

  describe("Settings", () => {
    it("should get merged effective settings", async () => {
      const resp = await apiFetch(`${baseUrl}/api/v1/config/settings`);
      expect(resp.status).toBe(200);
      const body = await resp.json();

      expect(body.settings).toBeDefined();
      expect(body.provenance).toBeDefined();
      expect(body.permissions).toBeDefined();
      expect(body.permissions.allow).toBeDefined();
      expect(Array.isArray(body.permissions.allow)).toBe(true);
    });

    it("should get settings for a specific scope", async () => {
      const resp = await apiFetch(`${baseUrl}/api/v1/config/settings/project`);
      expect(resp.status).toBe(200);
      const body = await resp.json();

      expect(body.scope).toBe("project");
      expect(body.exists).toBe(true);
      expect(body.content.permissions).toBeDefined();
    });

    it("should return 400 for invalid scope", async () => {
      const resp = await apiFetch(`${baseUrl}/api/v1/config/settings/invalid`);
      expect(resp.status).toBe(400);
    });

    it("should update a setting value", async () => {
      const resp = await apiFetch(`${baseUrl}/api/v1/config/settings/local`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "effortLevel", value: "high" }),
      });
      expect(resp.status).toBe(200);
      const body = await resp.json();
      expect(body.after).toBe("high");
    });

    it("should add a permission rule", async () => {
      const resp = await apiFetch(
        `${baseUrl}/api/v1/config/settings/local/permissions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rule: "Bash(echo *)", behavior: "allow" }),
        }
      );
      expect(resp.status).toBe(201);
      const body = await resp.json();
      expect(body.status).toBe("added");
      expect(body.rule).toBe("Bash(echo *)");
    });

    it("should remove a permission rule", async () => {
      const resp = await apiFetch(
        `${baseUrl}/api/v1/config/settings/local/permissions`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rule: "Bash(echo *)", behavior: "allow" }),
        }
      );
      expect(resp.status).toBe(200);
      const body = await resp.json();
      expect(body.status).toBe("removed");
    });
  });

  // ========== Plugins ==========

  describe("Plugins", () => {
    it("should list installed plugins", async () => {
      const resp = await apiFetch(`${baseUrl}/api/v1/config/plugins`);
      expect(resp.status).toBe(200);
      const body = await resp.json();

      expect(body.plugins).toBeDefined();
      expect(Array.isArray(body.plugins)).toBe(true);
      expect(typeof body.total).toBe("number");
      expect(body.total).toBe(1);
      expect(body.plugins[0].name).toBe("sdk-tools");
    });

    it("should filter installed plugins by query", async () => {
      const resp = await apiFetch(`${baseUrl}/api/v1/config/plugins?q=sdk`);
      expect(resp.status).toBe(200);
      const body = await resp.json();

      expect(body.total).toBe(1);
      expect(body.plugins[0].name).toBe("sdk-tools");
    });

    it("should list available plugins from Claude CLI catalog", async () => {
      const resp = await apiFetch(`${baseUrl}/api/v1/config/plugins/available`);
      expect(resp.status).toBe(200);
      const body = await resp.json();

      expect(Array.isArray(body.installed)).toBe(true);
      expect(Array.isArray(body.available)).toBe(true);
      expect(body.available.some((plugin: { pluginId: string }) => plugin.pluginId === "vendor-db@claude-plugins-official")).toBe(true);
    });

    it("should return 404 for non-existent plugin", async () => {
      const resp = await apiFetch(
        `${baseUrl}/api/v1/config/plugins/nonexistent-plugin-99999`
      );
      expect(resp.status).toBe(404);
    });

    it("should install a plugin via Claude CLI", async () => {
      const resp = await apiFetch(`${baseUrl}/api/v1/config/plugins/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "vendor-db",
          marketplace: "claude-plugins-official",
          scope: "project",
        }),
      });
      expect(resp.status).toBe(201);
      const body = await resp.json();

      expect(body.status).toBe("installed");
      expect(body.name).toBe("vendor-db@claude-plugins-official");

      const invocations = readFakeClaudeInvocations();
      expect(invocations.some((args) => JSON.stringify(args) === JSON.stringify([
        "plugin",
        "install",
        "vendor-db@claude-plugins-official",
        "-s",
        "project",
      ]))).toBe(true);
    });

    it("should update a plugin via Claude CLI", async () => {
      const name = encodeURIComponent("sdk-tools@claude-plugins-official");
      const resp = await apiFetch(`${baseUrl}/api/v1/config/plugins/${name}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "user" }),
      });
      expect(resp.status).toBe(200);
      const body = await resp.json();

      expect(body.status).toBe("updated");

      const invocations = readFakeClaudeInvocations();
      expect(invocations.some((args) => JSON.stringify(args) === JSON.stringify([
        "plugin",
        "update",
        "sdk-tools@claude-plugins-official",
        "-s",
        "user",
      ]))).toBe(true);
    });

    it("should uninstall a plugin via Claude CLI", async () => {
      const name = encodeURIComponent("sdk-tools@claude-plugins-official");
      const resp = await apiFetch(`${baseUrl}/api/v1/config/plugins/${name}/uninstall`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "user", keepData: true }),
      });
      expect(resp.status).toBe(200);
      const body = await resp.json();

      expect(body.status).toBe("uninstalled");

      const invocations = readFakeClaudeInvocations();
      expect(invocations.some((args) => JSON.stringify(args) === JSON.stringify([
        "plugin",
        "uninstall",
        "sdk-tools@claude-plugins-official",
        "-s",
        "user",
        "--keep-data",
      ]))).toBe(true);
    });

    it("should explain installed plugin provenance", async () => {
      const resp = await apiFetch(`${baseUrl}/api/v1/config/plugins/sdk-tools/provenance`);
      expect(resp.status).toBe(200);
      const body = await resp.json();

      expect(body.id).toBe("sdk-tools@claude-plugins-official");
      expect(body.installed).toBe(true);
      expect(body.enabled).toBe(true);
      expect(body.enabledSourceScope).toBe("user");
      expect(body.marketplaceKnown).toBe(true);
      expect(body.marketplaceAvailable).toBe(true);
      expect(body.catalogAvailable).toBe(true);
      expect(Array.isArray(body.enablementSources)).toBe(true);
      expect(body.enablementSources.some((source: { scope: string; value?: boolean }) => source.scope === "user" && source.value === true)).toBe(true);
      expect(["active", "enabled_not_loaded"]).toContain(body.status);
    });

    it("should explain blocked plugin provenance", async () => {
      const resp = await apiFetch(`${baseUrl}/api/v1/config/plugins/blocked-plugin/provenance`);
      expect(resp.status).toBe(200);
      const body = await resp.json();

      expect(body.id).toBe("blocked-plugin@claude-plugins-official");
      expect(body.installed).toBe(false);
      expect(body.blocked).toBe(true);
      expect(body.status).toBe("blocked");
      expect(body.marketplaceAvailable).toBe(true);
      expect(body.blockReason).toBe("policy");
    });
  });

  describe("Marketplaces", () => {
    it("should list known marketplaces", async () => {
      const resp = await apiFetch(`${baseUrl}/api/v1/config/marketplaces`);
      expect(resp.status).toBe(200);
      const body = await resp.json();

      expect(body.total).toBe(1);
      expect(Array.isArray(body.marketplaces)).toBe(true);
      expect(body.marketplaces[0].name).toBe("claude-plugins-official");
      expect(body.marketplaces[0].pluginCount).toBe(3);
      expect(body.marketplaces[0].installedCount).toBe(1);
      expect(body.marketplaces[0].blockedCount).toBe(1);
    });

    it("should list marketplace plugins with install and blocklist state", async () => {
      const resp = await apiFetch(
        `${baseUrl}/api/v1/config/marketplaces/claude-plugins-official/plugins`
      );
      expect(resp.status).toBe(200);
      const body = await resp.json();

      expect(body.marketplace.name).toBe("claude-plugins-official");
      expect(body.total).toBe(3);
      expect(Array.isArray(body.plugins)).toBe(true);

      const sdkTools = body.plugins.find(
        (plugin: { name: string }) => plugin.name === "sdk-tools"
      );
      expect(sdkTools).toBeDefined();
      expect(sdkTools.installed).toBe(true);
      expect(sdkTools.enabled).toBe(true);
      expect(sdkTools.commandCount).toBe(1);
      expect(sdkTools.skillCount).toBe(1);
      expect(sdkTools.agentCount).toBe(1);

      const vendorDb = body.plugins.find(
        (plugin: { name: string }) => plugin.name === "vendor-db"
      );
      expect(vendorDb).toBeDefined();
      expect(vendorDb.sourceType).toBe("external_plugins");
      expect(vendorDb.installed).toBe(false);

      const blockedPlugin = body.plugins.find(
        (plugin: { name: string }) => plugin.name === "blocked-plugin"
      );
      expect(blockedPlugin).toBeDefined();
      expect(blockedPlugin.blocked).toBe(true);
      expect(blockedPlugin.blockReason).toBe("policy");
    });

    it("should add a marketplace via Claude CLI", async () => {
      const resp = await apiFetch(`${baseUrl}/api/v1/config/marketplaces`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "owner/example-marketplace",
          scope: "project",
          sparse: [".claude-plugin", "plugins"],
        }),
      });
      expect(resp.status).toBe(201);
      const body = await resp.json();

      expect(body.status).toBe("added");

      const invocations = readFakeClaudeInvocations();
      expect(invocations.some((args) => JSON.stringify(args) === JSON.stringify([
        "plugin",
        "marketplace",
        "add",
        "owner/example-marketplace",
        "--scope",
        "project",
        "--sparse",
        ".claude-plugin",
        "plugins",
      ]))).toBe(true);
    });

    it("should update marketplaces via Claude CLI", async () => {
      const resp = await apiFetch(`${baseUrl}/api/v1/config/marketplaces/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "claude-plugins-official" }),
      });
      expect(resp.status).toBe(200);
      const body = await resp.json();

      expect(body.status).toBe("updated");

      const invocations = readFakeClaudeInvocations();
      expect(invocations.some((args) => JSON.stringify(args) === JSON.stringify([
        "plugin",
        "marketplace",
        "update",
        "claude-plugins-official",
      ]))).toBe(true);
    });

    it("should remove a marketplace via Claude CLI", async () => {
      const resp = await apiFetch(`${baseUrl}/api/v1/config/marketplaces/test-marketplace`, {
        method: "DELETE",
      });
      expect(resp.status).toBe(200);
      const body = await resp.json();

      expect(body.status).toBe("removed");

      const invocations = readFakeClaudeInvocations();
      expect(invocations.some((args) => JSON.stringify(args) === JSON.stringify([
        "plugin",
        "marketplace",
        "remove",
        "test-marketplace",
      ]))).toBe(true);
    });

    it("should return 404 for an unknown marketplace", async () => {
      const resp = await apiFetch(`${baseUrl}/api/v1/config/marketplaces/missing/plugins`);
      expect(resp.status).toBe(404);
    });
  });

  // ========== Agents ==========

  describe("Agents", () => {
    it("should list agent definitions", async () => {
      const resp = await apiFetch(`${baseUrl}/api/v1/config/agents`);
      expect(resp.status).toBe(200);
      const body = await resp.json();

      expect(body.agents).toBeDefined();
      expect(Array.isArray(body.agents)).toBe(true);

      // Should find our test agent
      const testAgent = body.agents.find(
        (a: { name: string }) => a.name === "api-test-agent"
      );
      expect(testAgent).toBeDefined();
      expect(testAgent.description).toBe("Agent for API testing");
    });

    it("should filter agent definitions by query", async () => {
      const resp = await apiFetch(`${baseUrl}/api/v1/config/agents?q=api-test`);
      expect(resp.status).toBe(200);
      const body = await resp.json();

      expect(body.total).toBe(1);
      expect(body.agents[0].name).toBe("api-test-agent");
    });

    let createdAgentName: string;

    it("should create a new agent", async () => {
      createdAgentName = `api-crud-agent-${Date.now()}`;
      const resp = await apiFetch(`${baseUrl}/api/v1/config/agents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createdAgentName,
          description: "Created via API",
          prompt: "You are a test agent created via API.",
          scope: "project",
          model: "haiku",
        }),
      });
      expect(resp.status).toBe(201);
      const body = await resp.json();
      expect(body.status).toBe("created");
      expect(body.name).toBe(createdAgentName);
    });

    it("should update an agent", async () => {
      const resp = await apiFetch(
        `${baseUrl}/api/v1/config/agents/${createdAgentName}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description: "Updated via API" }),
        }
      );
      expect(resp.status).toBe(200);
      const body = await resp.json();
      expect(body.status).toBe("updated");
    });

    it("should delete an agent", async () => {
      const resp = await apiFetch(
        `${baseUrl}/api/v1/config/agents/${createdAgentName}`,
        { method: "DELETE" }
      );
      expect(resp.status).toBe(200);
      const body = await resp.json();
      expect(body.status).toBe("deleted");
    });

    it("should return 404 when deleting non-existent agent", async () => {
      const resp = await apiFetch(
        `${baseUrl}/api/v1/config/agents/nonexistent-agent-99999`,
        { method: "DELETE" }
      );
      expect(resp.status).toBe(404);
    });
  });

  // ========== Skills ==========

  describe("Skills", () => {
    it("should list skills", async () => {
      const resp = await apiFetch(`${baseUrl}/api/v1/config/skills`);
      expect(resp.status).toBe(200);
      const body = await resp.json();

      expect(body.skills).toBeDefined();
      expect(Array.isArray(body.skills)).toBe(true);
      expect(typeof body.total).toBe("number");
    });

    it("should filter skills by query", async () => {
      const resp = await apiFetch(`${baseUrl}/api/v1/config/skills?q=verifier`);
      expect(resp.status).toBe(200);
      const body = await resp.json();

      expect(body.total).toBe(1);
      expect(body.skills[0].name).toBe("sdk-verifier");
    });
  });

  describe("Commands", () => {
    it("should list legacy slash commands", async () => {
      const resp = await apiFetch(`${baseUrl}/api/v1/config/commands`);
      expect(resp.status).toBe(200);
      const body = await resp.json();

      expect(body.commands).toBeDefined();
      expect(Array.isArray(body.commands)).toBe(true);
      expect(typeof body.total).toBe("number");
    });

    it("should filter legacy slash commands by query", async () => {
      const resp = await apiFetch(`${baseUrl}/api/v1/config/commands?q=new-sdk`);
      expect(resp.status).toBe(200);
      const body = await resp.json();

      expect(body.total).toBe(1);
      expect(body.commands[0].name).toBe("new-sdk-app");
    });
  });

  // ========== Rules ==========

  describe("Rules", () => {
    it("should list rules", async () => {
      const resp = await apiFetch(`${baseUrl}/api/v1/config/rules`);
      expect(resp.status).toBe(200);
      const body = await resp.json();

      expect(body.rules).toBeDefined();
      expect(Array.isArray(body.rules)).toBe(true);
    });
  });

  // ========== MCP ==========

  describe("MCP", () => {
    it("should list MCP servers", async () => {
      const resp = await apiFetch(`${baseUrl}/api/v1/config/mcp`);
      expect(resp.status).toBe(200);
      const body = await resp.json();

      expect(body.servers).toBeDefined();
      expect(Array.isArray(body.servers)).toBe(true);
      expect(typeof body.total).toBe("number");
    });

    it("should filter MCP servers by query", async () => {
      const resp = await apiFetch(`${baseUrl}/api/v1/config/mcp?q=global-test`);
      expect(resp.status).toBe(200);
      const body = await resp.json();

      expect(body.total).toBe(1);
      expect(body.servers[0].name).toBe("global-test");
    });
  });

  describe("Runtime", () => {
    it("should inspect effective Claude runtime inventory", async () => {
      const resp = await apiFetch(`${baseUrl}/api/v1/config/runtime`);
      expect(resp.status).toBe(200);
      const body = await resp.json();

      expect(typeof body.cwd).toBe("string");
      expect(Array.isArray(body.slashCommands)).toBe(true);
      expect(Array.isArray(body.commands)).toBe(true);
      expect(Array.isArray(body.agentDetails)).toBe(true);
      expect(Array.isArray(body.plugins)).toBe(true);
    });

    it("should expose searchable runtime subresource routes", async () => {
      const checks = [
        { path: "/api/v1/config/runtime/tools", key: "tools" },
        { path: "/api/v1/config/runtime/commands", key: "commands" },
        { path: "/api/v1/config/runtime/skills", key: "skills" },
        { path: "/api/v1/config/runtime/plugins", key: "plugins" },
        { path: "/api/v1/config/runtime/mcp", key: "servers" },
        { path: "/api/v1/config/runtime/agents", key: "agents" },
        { path: "/api/v1/config/runtime/models", key: "models" },
      ] as const;

      for (const check of checks) {
        const resp = await apiFetch(`${baseUrl}${check.path}?q=sdk`);
        expect(resp.status).toBe(200);
        const body = await resp.json();

        expect(Array.isArray(body[check.key])).toBe(true);
        expect(typeof body.total).toBe("number");
      }
    });
  });

  // ========== Memory ==========

  describe("Memory", () => {
    it("should get project memory index", async () => {
      const resp = await apiFetch(`${baseUrl}/api/v1/config/memory`);
      expect(resp.status).toBe(200);
      const body = await resp.json();

      expect(body.projectKey).toBeTruthy();
      expect(body.memoryDir).toBeTruthy();
      expect(typeof body.hasIndex).toBe("boolean");
      expect(typeof body.fileCount).toBe("number");
    });

    it("should list memory files", async () => {
      const resp = await apiFetch(`${baseUrl}/api/v1/config/memory/files`);
      expect(resp.status).toBe(200);
      const body = await resp.json();

      expect(body.files).toBeDefined();
      expect(Array.isArray(body.files)).toBe(true);
    });

    it("should list all project memories", async () => {
      const resp = await apiFetch(`${baseUrl}/api/v1/config/memory/projects`);
      expect(resp.status).toBe(200);
      const body = await resp.json();

      expect(body.projects).toBeDefined();
      expect(Array.isArray(body.projects)).toBe(true);
    });

    it("should return 404 for non-existent memory file", async () => {
      const resp = await apiFetch(
        `${baseUrl}/api/v1/config/memory/files/nonexistent-file-99999`
      );
      expect(resp.status).toBe(404);
    });
  });

  // ========== CLAUDE.md ==========

  describe("CLAUDE.md", () => {
    it("should list CLAUDE.md files", async () => {
      const resp = await apiFetch(`${baseUrl}/api/v1/config/claude-md`);
      expect(resp.status).toBe(200);
      const body = await resp.json();

      expect(body.files).toBeDefined();
      expect(Array.isArray(body.files)).toBe(true);

      // Should find the project CLAUDE.md we created
      const projectMd = body.files.find(
        (f: { scope: string }) => f.scope === "project"
      );
      expect(projectMd).toBeDefined();
      expect(projectMd.content).toContain("API Config Test");
    });
  });
});
