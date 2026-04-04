/**
 * Unit test: Settings writer.
 * Tests atomic writes, permission rule management, and scope validation.
 * Uses temp directories to avoid touching real settings files.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  updateSettings,
  addPermissionRule,
  removePermissionRule,
  setSettingValue,
  getSettingsPath,
} from "../../src/config/settings-writer.js";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "cc-settings-writer-test-"));
  // Create .claude directory for project/local scope
  mkdirSync(join(tempDir, ".claude"), { recursive: true });
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf-8"));
}

describe("Settings Writer", () => {
  describe("getSettingsPath", () => {
    it("should return correct path for project scope", () => {
      const path = getSettingsPath("project", tempDir);
      expect(path).toContain(".claude/settings.json");
    });

    it("should return correct path for local scope", () => {
      const path = getSettingsPath("local", tempDir);
      expect(path).toContain(".claude/settings.local.json");
    });
  });

  describe("updateSettings", () => {
    it("should set a value in a new file", async () => {
      await updateSettings(
        {
          scope: "project",
          path: ["effortLevel"],
          operation: "set",
          value: "high",
        },
        tempDir
      );

      const path = getSettingsPath("project", tempDir);
      const content = readJson(path);
      expect(content.effortLevel).toBe("high");
    });

    it("should set a nested value", async () => {
      await updateSettings(
        {
          scope: "project",
          path: ["permissions", "defaultMode"],
          operation: "set",
          value: "acceptEdits",
        },
        tempDir
      );

      const path = getSettingsPath("project", tempDir);
      const content = readJson(path);
      expect((content.permissions as Record<string, unknown>).defaultMode).toBe("acceptEdits");
    });

    it("should append to an array", async () => {
      // First write some initial data
      const path = getSettingsPath("project", tempDir);
      writeFileSync(path, JSON.stringify({ permissions: { allow: ["Read"] } }));

      await updateSettings(
        {
          scope: "project",
          path: ["permissions", "allow"],
          operation: "append",
          value: "Edit",
        },
        tempDir
      );

      const content = readJson(path);
      const allow = (content.permissions as Record<string, unknown>).allow as string[];
      expect(allow).toContain("Read");
      expect(allow).toContain("Edit");
    });

    it("should not duplicate when appending existing value", async () => {
      const path = getSettingsPath("project", tempDir);
      writeFileSync(path, JSON.stringify({ permissions: { allow: ["Read"] } }));

      await updateSettings(
        {
          scope: "project",
          path: ["permissions", "allow"],
          operation: "append",
          value: "Read",
        },
        tempDir
      );

      const content = readJson(path);
      const allow = (content.permissions as Record<string, unknown>).allow as string[];
      expect(allow.length).toBe(1);
    });

    it("should remove a value from an array", async () => {
      const path = getSettingsPath("project", tempDir);
      writeFileSync(path, JSON.stringify({ permissions: { allow: ["Read", "Edit", "Glob"] } }));

      await updateSettings(
        {
          scope: "project",
          path: ["permissions", "allow"],
          operation: "remove",
          value: "Edit",
        },
        tempDir
      );

      const content = readJson(path);
      const allow = (content.permissions as Record<string, unknown>).allow as string[];
      expect(allow).toEqual(["Read", "Glob"]);
    });

    it("should delete a key", async () => {
      const path = getSettingsPath("project", tempDir);
      writeFileSync(path, JSON.stringify({ effortLevel: "high", model: "sonnet" }));

      await updateSettings(
        {
          scope: "project",
          path: ["effortLevel"],
          operation: "delete",
        },
        tempDir
      );

      const content = readJson(path);
      expect(content.effortLevel).toBeUndefined();
      expect(content.model).toBe("sonnet");
    });

    it("should return before and after values", async () => {
      const path = getSettingsPath("project", tempDir);
      writeFileSync(path, JSON.stringify({ effortLevel: "low" }));

      const { before, after } = await updateSettings(
        {
          scope: "project",
          path: ["effortLevel"],
          operation: "set",
          value: "high",
        },
        tempDir
      );

      expect(before).toBe("low");
      expect(after).toBe("high");
    });

    it("should throw when attempting to write to managed scope", async () => {
      await expect(
        updateSettings({
          scope: "managed" as "user",
          path: ["key"],
          operation: "set",
          value: "val",
        })
      ).rejects.toThrow("Cannot write to managed settings scope");
    });
  });

  describe("addPermissionRule", () => {
    it("should add a permission rule", async () => {
      await addPermissionRule("project", "Bash(echo *)", "allow", tempDir);

      const path = getSettingsPath("project", tempDir);
      const content = readJson(path);
      const allow = (content.permissions as Record<string, unknown>).allow as string[];
      expect(allow).toContain("Bash(echo *)");
    });
  });

  describe("removePermissionRule", () => {
    it("should remove a permission rule", async () => {
      const path = getSettingsPath("project", tempDir);
      writeFileSync(path, JSON.stringify({ permissions: { allow: ["Read", "Edit"] } }));

      await removePermissionRule("project", "Read", "allow", tempDir);

      const content = readJson(path);
      const allow = (content.permissions as Record<string, unknown>).allow as string[];
      expect(allow).toEqual(["Edit"]);
    });
  });

  describe("setSettingValue", () => {
    it("should set a value using dot-notation key", async () => {
      await setSettingValue("project", "permissions.defaultMode", "auto", tempDir);

      const path = getSettingsPath("project", tempDir);
      const content = readJson(path);
      expect((content.permissions as Record<string, unknown>).defaultMode).toBe("auto");
    });
  });
});
