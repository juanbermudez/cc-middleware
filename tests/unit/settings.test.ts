/**
 * Unit test: Settings reader.
 * Tests reading, merging, and precedence of settings files.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readSettingsFile, mergeSettings, readAllSettings } from "../../src/config/settings.js";
import type { SettingsFile } from "../../src/config/settings.js";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "cc-settings-test-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function makeSettingsFile(scope: SettingsFile["scope"], content: Record<string, unknown>): SettingsFile {
  return {
    scope,
    path: join(tempDir, `${scope}.json`),
    exists: true,
    content,
  };
}

describe("Settings Reader", () => {
  describe("readSettingsFile", () => {
    it("should read an existing settings file", async () => {
      const path = join(tempDir, "settings.json");
      writeFileSync(path, JSON.stringify({ effortLevel: "high" }));

      const result = await readSettingsFile(path, "user");

      expect(result.exists).toBe(true);
      expect(result.scope).toBe("user");
      expect(result.content.effortLevel).toBe("high");
      expect(result.lastModified).toBeGreaterThan(0);
    });

    it("should return empty content for non-existent file", async () => {
      const path = join(tempDir, "nonexistent.json");

      const result = await readSettingsFile(path, "project");

      expect(result.exists).toBe(false);
      expect(result.content).toEqual({});
    });

    it("should handle invalid JSON gracefully", async () => {
      const path = join(tempDir, "invalid.json");
      writeFileSync(path, "not valid json {{{");

      const result = await readSettingsFile(path, "local");

      expect(result.exists).toBe(false);
      expect(result.content).toEqual({});
    });
  });

  describe("mergeSettings", () => {
    it("should merge scalar values with correct precedence", () => {
      const user = makeSettingsFile("user", { effortLevel: "low", model: "sonnet" });
      const project = makeSettingsFile("project", { effortLevel: "medium" });
      const local = makeSettingsFile("local", { effortLevel: "high" });

      const merged = mergeSettings(undefined, user, project, local);

      // local (highest) wins
      expect(merged.settings.effortLevel).toBe("high");
      expect(merged.provenance.effortLevel).toBe("local");
      // model only in user, so user wins
      expect(merged.settings.model).toBe("sonnet");
      expect(merged.provenance.model).toBe("user");
    });

    it("should give managed scope highest precedence", () => {
      const managed = makeSettingsFile("managed", { effortLevel: "low" });
      const user = makeSettingsFile("user", { effortLevel: "high" });
      const project = makeSettingsFile("project", {});
      const local = makeSettingsFile("local", { effortLevel: "max" });

      const merged = mergeSettings(managed, user, project, local);

      expect(merged.settings.effortLevel).toBe("low");
      expect(merged.provenance.effortLevel).toBe("managed");
    });

    it("should concatenate and deduplicate permission allow rules", () => {
      const user = makeSettingsFile("user", {
        permissions: { allow: ["Read", "Glob"] },
      });
      const project = makeSettingsFile("project", {
        permissions: { allow: ["Bash(npm *)", "Read"] },
      });
      const local = makeSettingsFile("local", {
        permissions: { allow: ["Edit"] },
      });

      const merged = mergeSettings(undefined, user, project, local);

      // All unique rules concatenated
      expect(merged.permissions.allow).toContain("Read");
      expect(merged.permissions.allow).toContain("Glob");
      expect(merged.permissions.allow).toContain("Bash(npm *)");
      expect(merged.permissions.allow).toContain("Edit");
      // No duplicates
      expect(merged.permissions.allow.filter((r) => r === "Read").length).toBe(1);
    });

    it("should merge deny and ask rules separately", () => {
      const user = makeSettingsFile("user", {
        permissions: { deny: ["Bash(rm *)"], ask: ["Edit(*.ts)"] },
      });
      const project = makeSettingsFile("project", {
        permissions: { deny: ["Bash(sudo *)"], ask: ["Write"] },
      });
      const local = makeSettingsFile("local", { permissions: {} });

      const merged = mergeSettings(undefined, user, project, local);

      expect(merged.permissions.deny).toEqual(["Bash(rm *)", "Bash(sudo *)"]);
      expect(merged.permissions.ask).toEqual(["Edit(*.ts)", "Write"]);
    });

    it("should track provenance of permission rules", () => {
      const user = makeSettingsFile("user", {
        permissions: { allow: ["Read"] },
      });
      const project = makeSettingsFile("project", {
        permissions: { allow: ["Edit"] },
      });
      const local = makeSettingsFile("local", { permissions: {} });

      const merged = mergeSettings(undefined, user, project, local);

      expect(merged.permissions.sources["allow:Read"]).toBe("user");
      expect(merged.permissions.sources["allow:Edit"]).toBe("project");
    });

    it("should use highest precedence for defaultMode", () => {
      const user = makeSettingsFile("user", {
        permissions: { defaultMode: "default" },
      });
      const project = makeSettingsFile("project", {
        permissions: { defaultMode: "acceptEdits" },
      });
      const local = makeSettingsFile("local", { permissions: {} });

      const merged = mergeSettings(undefined, user, project, local);

      expect(merged.permissions.defaultMode).toBe("acceptEdits");
    });

    it("should handle missing permissions gracefully", () => {
      const user = makeSettingsFile("user", {});
      const project = makeSettingsFile("project", {});
      const local = makeSettingsFile("local", {});

      const merged = mergeSettings(undefined, user, project, local);

      expect(merged.permissions.allow).toEqual([]);
      expect(merged.permissions.deny).toEqual([]);
      expect(merged.permissions.ask).toEqual([]);
    });
  });

  describe("readAllSettings", () => {
    it("should read real user settings file", async () => {
      const result = await readAllSettings(process.cwd());

      // User settings should at least attempt to load
      expect(result.user).toBeDefined();
      expect(result.user.scope).toBe("user");

      // Project settings should at least attempt to load
      expect(result.project).toBeDefined();
      expect(result.project.scope).toBe("project");

      expect(result.local).toBeDefined();
      expect(result.local.scope).toBe("local");
    });
  });
});
