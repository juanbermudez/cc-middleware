/**
 * E2E test: Plugin reader.
 * Tests listing installed plugins and reading their details.
 */

import { describe, it, expect } from "vitest";
import { listInstalledPlugins, getPluginDetails, isPluginEnabled } from "../../src/config/plugins.js";

describe("Plugin Reader (E2E)", () => {
  it("should list installed plugins", async () => {
    const plugins = await listInstalledPlugins();

    expect(Array.isArray(plugins)).toBe(true);

    // Based on research, we know there are plugins installed
    if (plugins.length > 0) {
      const plugin = plugins[0];
      expect(plugin.name).toBeTruthy();
      expect(plugin.marketplace).toBeTruthy();
      expect(plugin.version).toBeTruthy();
      expect(typeof plugin.enabled).toBe("boolean");
      expect(typeof plugin.hasHooks).toBe("boolean");
      expect(typeof plugin.hasSkills).toBe("boolean");
      expect(typeof plugin.hasAgents).toBe("boolean");
      expect(typeof plugin.hasMcpServers).toBe("boolean");
    }
  });

  it("should return undefined for non-existent plugin", async () => {
    const plugin = await getPluginDetails("totally-nonexistent-plugin-12345");
    expect(plugin).toBeUndefined();
  });

  it("should check if a plugin is enabled", async () => {
    const plugins = await listInstalledPlugins();

    if (plugins.length > 0) {
      const enabled = await isPluginEnabled(plugins[0].name);
      expect(typeof enabled).toBe("boolean");
    }
  });

  it("should have expected fields for known plugins", async () => {
    const plugins = await listInstalledPlugins();
    const pluginDev = plugins.find((p) => p.name === "plugin-dev");

    if (pluginDev) {
      expect(pluginDev.marketplace).toBe("claude-plugins-official");
      expect(pluginDev.enabled).toBe(true);
      expect(pluginDev.cachePath).toBeTruthy();
    }
  });
});
