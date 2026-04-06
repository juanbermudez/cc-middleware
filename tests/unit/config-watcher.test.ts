/**
 * Unit tests for the config and component file watcher.
 */

import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ConfigWatcher } from "../../src/sync/config-watcher.js";
import type {
  SettingsChangeEvent,
  ConfigChangeEvent,
  ComponentChangeEvent,
  TeamChangeEvent,
} from "../../src/sync/config-watcher.js";

describe("ConfigWatcher", () => {
  let tmpDir: string;
  let watcher: ConfigWatcher;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "ccm-config-watcher-"));
    // Create config structure
    mkdirSync(join(tmpDir, ".claude", "agents"), { recursive: true });
    mkdirSync(join(tmpDir, ".claude", "skills", "my-skill"), { recursive: true });
    mkdirSync(join(tmpDir, ".claude", "rules"), { recursive: true });
  });

  afterEach(async () => {
    if (watcher) {
      await watcher.stop();
    }
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should detect settings file changes", async () => {
    // Create initial settings file
    const settingsPath = join(tmpDir, ".claude", "settings.json");
    writeFileSync(settingsPath, "{}");

    watcher = new ConfigWatcher({
      projectDir: tmpDir,
      pollIntervalMs: 500,
      debounceMs: 100,
    });

    const events: SettingsChangeEvent[] = [];
    watcher.on("config:settings-changed", (data) => events.push(data));

    await watcher.start();
    await new Promise((r) => setTimeout(r, 200));

    // Modify settings
    writeFileSync(settingsPath, '{"permissions":{"allow":[]}}');

    await waitFor(() => events.length > 0, 5000);

    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].scope).toBe("project");
    expect(events[0].filePath).toBe(settingsPath);
  });

  it("should detect new agent definition", async () => {
    watcher = new ConfigWatcher({
      projectDir: tmpDir,
      pollIntervalMs: 500,
      debounceMs: 100,
    });

    const events: ComponentChangeEvent[] = [];
    watcher.on("config:agent-changed", (data) => events.push(data));

    await watcher.start();

    // Create new agent file
    const agentPath = join(tmpDir, ".claude", "agents", "test-agent.md");
    writeFileSync(agentPath, "---\nmodel: claude-sonnet-4-20250514\n---\nYou are a test agent.");

    await waitFor(() => events.length > 0, 5000);

    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].name).toBe("test-agent");
    expect(events[0].scope).toBe("project");
  });

  it("should detect new skill", async () => {
    watcher = new ConfigWatcher({
      projectDir: tmpDir,
      pollIntervalMs: 500,
      debounceMs: 100,
    });

    const events: ComponentChangeEvent[] = [];
    watcher.on("config:skill-changed", (data) => events.push(data));

    await watcher.start();

    // Create skill file
    const skillPath = join(tmpDir, ".claude", "skills", "my-skill", "SKILL.md");
    writeFileSync(skillPath, "---\ntitle: My Skill\n---\nDo something cool.");

    await waitFor(() => events.length > 0, 5000);

    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].name).toBe("my-skill");
  });

  it("should detect new rule", async () => {
    watcher = new ConfigWatcher({
      projectDir: tmpDir,
      pollIntervalMs: 500,
      debounceMs: 100,
    });

    const events: ComponentChangeEvent[] = [];
    watcher.on("config:rule-changed", (data) => events.push(data));

    await watcher.start();

    // Create rule file
    const rulePath = join(tmpDir, ".claude", "rules", "no-console.md");
    writeFileSync(rulePath, "Never use console.log in production code.");

    await waitFor(() => events.length > 0, 5000);

    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].name).toBe("no-console");
  });

  it("should detect MCP config changes", async () => {
    // Create initial .mcp.json
    const mcpPath = join(tmpDir, ".mcp.json");
    writeFileSync(mcpPath, "{}");

    watcher = new ConfigWatcher({
      projectDir: tmpDir,
      pollIntervalMs: 500,
      debounceMs: 100,
    });

    const events: ConfigChangeEvent[] = [];
    watcher.on("config:mcp-changed", (data) => events.push(data));

    await watcher.start();
    await new Promise((r) => setTimeout(r, 200));

    // Modify MCP config
    writeFileSync(mcpPath, '{"mcpServers":{"test":{}}}');

    await waitFor(() => events.length > 0, 5000);

    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  it("should report status correctly", async () => {
    watcher = new ConfigWatcher({
      projectDir: tmpDir,
      pollIntervalMs: 30000,
      debounceMs: 100,
    });

    await watcher.start();

    const status = watcher.getStatus();
    expect(status.watching).toBe(true);
    expect(status.watchedPaths).toBeGreaterThan(0);
  });

  it("should stop cleanly", async () => {
    watcher = new ConfigWatcher({
      projectDir: tmpDir,
      pollIntervalMs: 500,
      debounceMs: 100,
    });

    await watcher.start();
    expect(watcher.getStatus().watching).toBe(true);

    await watcher.stop();
    expect(watcher.getStatus().watching).toBe(false);
  });

  it("should debounce rapid config changes", async () => {
    const settingsPath = join(tmpDir, ".claude", "settings.json");
    writeFileSync(settingsPath, "{}");

    watcher = new ConfigWatcher({
      projectDir: tmpDir,
      pollIntervalMs: 10000,
      debounceMs: 500,
    });

    const events: SettingsChangeEvent[] = [];
    watcher.on("config:settings-changed", (data) => events.push(data));

    await watcher.start();
    await new Promise((r) => setTimeout(r, 200));

    // Rapid changes
    for (let i = 0; i < 5; i++) {
      writeFileSync(settingsPath, JSON.stringify({ version: i }));
      await new Promise((r) => setTimeout(r, 50));
    }

    // Wait for debounce
    await new Promise((r) => setTimeout(r, 1500));

    // Should have debounced to fewer events
    expect(events.length).toBeLessThanOrEqual(3);
  });
});

/** Helper: wait for condition */
async function waitFor(fn: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
}
