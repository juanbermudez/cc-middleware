/**
 * E2E test: Plugin reader.
 * Uses a seeded fake Claude home so plugin discovery stays deterministic.
 */

import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { listInstalledPlugins, getPluginDetails, isPluginEnabled } from "../../src/config/plugins.js";

let tempHome: string;
let originalHome: string | undefined;
let originalUserProfile: string | undefined;

beforeAll(() => {
  tempHome = mkdtempSync(join(tmpdir(), "cc-plugin-reader-test-"));
  originalHome = process.env.HOME;
  originalUserProfile = process.env.USERPROFILE;
  process.env.HOME = tempHome;
  process.env.USERPROFILE = tempHome;

  const claudeDir = join(tempHome, ".claude");
  const marketplaceRoot = join(
    claudeDir,
    "plugins",
    "marketplaces",
    "claude-plugins-official"
  );
  const sourcePluginRoot = join(marketplaceRoot, "plugins");
  const cachePluginRoot = join(
    claudeDir,
    "plugins",
    "cache",
    "claude-plugins-official",
    "plugin-dev",
    "snapshot"
  );

  mkdirSync(join(claudeDir, "plugins"), { recursive: true });
  writeFileSync(
    join(claudeDir, "settings.json"),
    JSON.stringify({
      enabledPlugins: {
        "plugin-dev@claude-plugins-official": true,
      },
    })
  );

  mkdirSync(join(sourcePluginRoot, "plugin-dev", ".claude-plugin"), { recursive: true });
  writeFileSync(
    join(sourcePluginRoot, "plugin-dev", ".claude-plugin", "plugin.json"),
    JSON.stringify({
      name: "plugin-dev",
      version: "1.0.0",
      description: "Plugin development helpers",
    })
  );

  mkdirSync(join(cachePluginRoot, ".claude-plugin"), { recursive: true });
  mkdirSync(join(cachePluginRoot, "skills", "creator"), { recursive: true });
  writeFileSync(
    join(cachePluginRoot, ".claude-plugin", "plugin.json"),
    JSON.stringify({
      name: "plugin-dev",
      version: "1.0.0",
      description: "Plugin development helpers",
    })
  );
  writeFileSync(
    join(cachePluginRoot, "skills", "creator", "SKILL.md"),
    "---\nname: plugin-dev\n---\n\nCreate plugins.\n"
  );

  writeFileSync(
    join(claudeDir, "plugins", "installed_plugins.json"),
    JSON.stringify({
      version: 2,
      plugins: {
        "plugin-dev@claude-plugins-official": [
          {
            scope: "user",
            installPath: cachePluginRoot,
            version: "1.0.0",
            installedAt: "2026-04-06T12:00:00.000Z",
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
        source: { type: "github" },
      },
    })
  );
});

afterAll(() => {
  if (tempHome) rmSync(tempHome, { recursive: true, force: true });
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

describe("Plugin Reader (E2E)", () => {
  it("should list installed plugins", async () => {
    const plugins = await listInstalledPlugins();

    expect(Array.isArray(plugins)).toBe(true);
    expect(plugins).toHaveLength(1);
    expect(plugins[0].name).toBe("plugin-dev");
    expect(plugins[0].marketplace).toBe("claude-plugins-official");
    expect(plugins[0].version).toBe("1.0.0");
    expect(plugins[0].enabled).toBe(true);
    expect(plugins[0].hasSkills).toBe(true);
  });

  it("should return undefined for non-existent plugin", async () => {
    const plugin = await getPluginDetails("totally-nonexistent-plugin-12345");
    expect(plugin).toBeUndefined();
  });

  it("should check if a plugin is enabled", async () => {
    const enabled = await isPluginEnabled("plugin-dev");
    expect(enabled).toBe(true);
  });

  it("should have expected fields for known plugins", async () => {
    const plugins = await listInstalledPlugins();
    const pluginDev = plugins.find((p) => p.name === "plugin-dev");

    expect(pluginDev).toBeDefined();
    expect(pluginDev?.marketplace).toBe("claude-plugins-official");
    expect(pluginDev?.enabled).toBe(true);
    expect(pluginDev?.cachePath).toBeTruthy();
    expect(pluginDev?.sourcePath).toBeTruthy();
  });
});
