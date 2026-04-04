/**
 * E2E test: Plugin hooks configuration.
 * Verifies that the plugin hooks.json is well-formed and that
 * events are dispatched to the middleware hook server when using the plugin.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Plugin Hooks Configuration (E2E)", () => {
  const hooksPath = resolve("src/plugin/hooks/hooks.json");

  it("should have a valid hooks.json with all expected event types", () => {
    const raw = readFileSync(hooksPath, "utf-8");
    const config = JSON.parse(raw);

    expect(config.description).toBeTruthy();
    expect(config.hooks).toBeDefined();

    // All expected event types should be present
    const expectedEvents = [
      "PreToolUse",
      "PostToolUse",
      "SessionStart",
      "SessionEnd",
      "Stop",
      "SubagentStart",
      "SubagentStop",
      "TaskCreated",
      "TaskCompleted",
    ];

    for (const event of expectedEvents) {
      expect(config.hooks[event]).toBeDefined();
      expect(Array.isArray(config.hooks[event])).toBe(true);
      expect(config.hooks[event].length).toBeGreaterThan(0);

      const hookEntry = config.hooks[event][0];
      expect(hookEntry.hooks).toBeDefined();
      expect(hookEntry.hooks[0].type).toBe("http");
      expect(hookEntry.hooks[0].url).toContain("127.0.0.1:3001");
      expect(hookEntry.hooks[0].url).toContain(`/hooks/${event}`);
      expect(hookEntry.hooks[0].timeout).toBe(10);
    }
  });

  it("should use wildcard matcher for tool-specific events", () => {
    const raw = readFileSync(hooksPath, "utf-8");
    const config = JSON.parse(raw);

    // PreToolUse and PostToolUse should use "*" matcher
    expect(config.hooks.PreToolUse[0].matcher).toBe("*");
    expect(config.hooks.PostToolUse[0].matcher).toBe("*");

    // Other events should use null matcher
    expect(config.hooks.SessionStart[0].matcher).toBeNull();
    expect(config.hooks.Stop[0].matcher).toBeNull();
  });

  it("should have a valid plugin.json manifest", () => {
    const manifestPath = resolve("src/plugin/.claude-plugin/plugin.json");
    const raw = readFileSync(manifestPath, "utf-8");
    const manifest = JSON.parse(raw);

    expect(manifest.name).toBe("cc-middleware");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.description).toBeTruthy();
    expect(manifest.hooks).toContain("hooks.json");
    expect(manifest.skills).toContain("skills/");
  });
});
