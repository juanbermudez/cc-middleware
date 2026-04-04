/**
 * E2E test: Plugin skill (SKILL.md).
 * Verifies the skill file exists and has proper frontmatter.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import matter from "gray-matter";

describe("Plugin Skill (E2E)", () => {
  const skillPath = resolve("src/plugin/skills/cc-middleware/SKILL.md");

  it("should have a valid SKILL.md with frontmatter", () => {
    const raw = readFileSync(skillPath, "utf-8");
    const { data, content } = matter(raw);

    expect(data.name).toBe("cc-middleware");
    expect(data.description).toBeTruthy();
    expect(data.description).toContain("middleware");

    // Content should have useful instructions
    expect(content).toContain("CC-Middleware");
    expect(content).toContain("/api/v1/status");
    expect(content).toContain("/api/v1/sessions");
    expect(content).toContain("$ARGUMENTS");
    expect(content).toContain("WebFetch");
  });

  it("should reference all key API endpoints", () => {
    const raw = readFileSync(skillPath, "utf-8");

    const expectedEndpoints = [
      "/api/v1/status",
      "/api/v1/sessions",
      "/api/v1/agents",
      "/api/v1/teams",
      "/api/v1/search",
      "/api/v1/config/settings",
      "/api/v1/config/plugins",
      "/api/v1/config/mcp",
    ];

    for (const endpoint of expectedEndpoints) {
      expect(raw).toContain(endpoint);
    }
  });
});
