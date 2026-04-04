/**
 * E2E test: Skills, agents, rules, CLAUDE.md discovery.
 * Tests reading components from real filesystem.
 */

import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  discoverSkills,
  discoverAgents,
  discoverRules,
  discoverClaudeMd,
  createAgent,
  deleteAgent,
  updateAgent,
} from "../../src/config/components.js";

let tempDir: string;

// Create a temp project directory with test components
beforeAll(() => {
  tempDir = mkdtempSync(join(tmpdir(), "cc-components-test-"));

  // Create .claude/agents/ with a test agent
  mkdirSync(join(tempDir, ".claude", "agents"), { recursive: true });
  writeFileSync(
    join(tempDir, ".claude", "agents", "test-agent.md"),
    `---
name: test-agent
description: A test agent for unit testing
model: sonnet
tools: Read, Grep, Glob
maxTurns: 10
---

You are a test agent. Analyze code and report findings.
`
  );

  // Create .claude/rules/ with a test rule
  mkdirSync(join(tempDir, ".claude", "rules"), { recursive: true });
  writeFileSync(
    join(tempDir, ".claude", "rules", "test-rule.md"),
    `---
paths:
  - "src/**/*.ts"
  - "tests/**/*.ts"
---

# Test Rule

- Always write unit tests
- Follow TypeScript strict mode
`
  );

  // Create .claude/skills/test-skill/SKILL.md
  mkdirSync(join(tempDir, ".claude", "skills", "test-skill"), { recursive: true });
  writeFileSync(
    join(tempDir, ".claude", "skills", "test-skill", "SKILL.md"),
    `---
name: test-skill
description: A skill for testing
---

# Test Skill

Use this skill to run tests.
`
  );

  // Create CLAUDE.md
  writeFileSync(
    join(tempDir, "CLAUDE.md"),
    `# Test Project

This is a test project.

@README.md
@docs/architecture.md
`
  );
});

afterAll(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
});

describe("Component Discovery (E2E)", () => {
  describe("discoverAgents", () => {
    it("should find project agents", async () => {
      const agents = await discoverAgents({ projectDir: tempDir });

      const testAgent = agents.find((a) => a.name === "test-agent");
      expect(testAgent).toBeDefined();
      expect(testAgent!.description).toBe("A test agent for unit testing");
      expect(testAgent!.model).toBe("sonnet");
      expect(testAgent!.tools).toEqual(["Read", "Grep", "Glob"]);
      expect(testAgent!.maxTurns).toBe(10);
      expect(testAgent!.scope).toBe("project");
      expect(testAgent!.prompt).toContain("test agent");
    });
  });

  describe("discoverRules", () => {
    it("should find project rules with path scoping", async () => {
      const rules = await discoverRules({ projectDir: tempDir });

      expect(rules.length).toBeGreaterThan(0);
      const testRule = rules.find((r) => r.path.includes("test-rule.md"));
      expect(testRule).toBeDefined();
      expect(testRule!.scope).toBe("project");
      expect(testRule!.paths).toEqual(["src/**/*.ts", "tests/**/*.ts"]);
      expect(testRule!.content).toContain("unit tests");
    });
  });

  describe("discoverSkills", () => {
    it("should find project skills", async () => {
      const skills = await discoverSkills({ projectDir: tempDir });

      const testSkill = skills.find((s) => s.name === "test-skill");
      expect(testSkill).toBeDefined();
      expect(testSkill!.description).toBe("A skill for testing");
      expect(testSkill!.scope).toBe("project");
      expect(testSkill!.content).toContain("Test Skill");
    });
  });

  describe("discoverClaudeMd", () => {
    it("should find project CLAUDE.md", async () => {
      const files = await discoverClaudeMd({ projectDir: tempDir });

      const projectMd = files.find((f) => f.scope === "project");
      expect(projectMd).toBeDefined();
      expect(projectMd!.content).toContain("Test Project");
    });

    it("should extract @import references", async () => {
      const files = await discoverClaudeMd({ projectDir: tempDir });
      const projectMd = files.find((f) => f.scope === "project");

      expect(projectMd!.imports).toContain("README.md");
      expect(projectMd!.imports).toContain("docs/architecture.md");
    });
  });

  describe("Agent CRUD", () => {
    it("should create and read back an agent", async () => {
      const filePath = await createAgent(
        "project",
        "crud-test-agent",
        {
          description: "Created by test",
          model: "haiku",
          prompt: "You are a CRUD test agent.",
          tools: ["Read", "Edit"],
        },
        tempDir
      );

      expect(filePath).toContain("crud-test-agent.md");

      const agents = await discoverAgents({ projectDir: tempDir });
      const found = agents.find((a) => a.name === "crud-test-agent");
      expect(found).toBeDefined();
      expect(found!.description).toBe("Created by test");
      expect(found!.model).toBe("haiku");
    });

    it("should update an existing agent", async () => {
      const agents = await discoverAgents({ projectDir: tempDir });
      const agent = agents.find((a) => a.name === "crud-test-agent");
      expect(agent).toBeDefined();

      await updateAgent(agent!.path, {
        description: "Updated description",
        model: "opus",
      });

      const updated = await discoverAgents({ projectDir: tempDir });
      const updatedAgent = updated.find((a) => a.name === "crud-test-agent");
      expect(updatedAgent!.description).toBe("Updated description");
      expect(updatedAgent!.model).toBe("opus");
    });

    it("should delete an agent", async () => {
      const agents = await discoverAgents({ projectDir: tempDir });
      const agent = agents.find((a) => a.name === "crud-test-agent");
      expect(agent).toBeDefined();

      await deleteAgent(agent!.path);

      const remaining = await discoverAgents({ projectDir: tempDir });
      expect(remaining.find((a) => a.name === "crud-test-agent")).toBeUndefined();
    });
  });
});
