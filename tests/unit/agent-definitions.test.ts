/**
 * Unit tests for agent definition reading and parsing.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  parseAgentMarkdown,
  readAgentDefinitions,
} from "../../src/agents/definitions.js";

const TEST_DIR = "/tmp/cc-middleware-agent-test";

beforeAll(() => {
  mkdirSync(join(TEST_DIR, ".claude", "agents"), { recursive: true });

  // Create test agent files
  writeFileSync(
    join(TEST_DIR, ".claude", "agents", "reviewer.md"),
    `---
name: code-reviewer
description: Reviews code for quality and security issues
model: sonnet
maxTurns: 20
tools: Read, Glob, Grep
disallowedTools: Write, Edit
---

You are a code reviewer. Analyze the provided code for:
- Security vulnerabilities
- Performance issues
- Code style problems

Be thorough but concise in your feedback.
`
  );

  writeFileSync(
    join(TEST_DIR, ".claude", "agents", "simple-agent.md"),
    `---
description: A simple helper agent
---

You help with simple tasks.
`
  );
});

afterAll(() => {
  try {
    rmSync(TEST_DIR, { recursive: true, force: true });
  } catch {
    // Ignore
  }
});

describe("parseAgentMarkdown", () => {
  it("should parse complete agent definition", () => {
    const content = `---
name: test-agent
description: A test agent
model: opus
maxTurns: 10
tools: Read, Write
disallowedTools: Bash
---

You are a test agent. Do test things.
`;

    const agent = parseAgentMarkdown(content, "/test/agent.md");

    expect(agent.name).toBe("test-agent");
    expect(agent.description).toBe("A test agent");
    expect(agent.model).toBe("opus");
    expect(agent.maxTurns).toBe(10);
    expect(agent.tools).toEqual(["Read", "Write"]);
    expect(agent.disallowedTools).toEqual(["Bash"]);
    expect(agent.prompt).toBe("You are a test agent. Do test things.");
    expect(agent.source).toBe("project");
  });

  it("should derive name from filename when not in frontmatter", () => {
    const content = `---
description: No name in frontmatter
---

Prompt text.
`;

    const agent = parseAgentMarkdown(content, "/test/my-agent.md");
    expect(agent.name).toBe("my-agent");
  });

  it("should handle missing optional fields", () => {
    const content = `---
description: Minimal agent
---

Just a prompt.
`;

    const agent = parseAgentMarkdown(content, "/test/minimal.md");
    expect(agent.name).toBe("minimal");
    expect(agent.description).toBe("Minimal agent");
    expect(agent.model).toBeUndefined();
    expect(agent.maxTurns).toBeUndefined();
    expect(agent.tools).toBeUndefined();
    expect(agent.disallowedTools).toBeUndefined();
    expect(agent.prompt).toBe("Just a prompt.");
  });

  it("should handle tools as array in frontmatter", () => {
    const content = `---
description: Array tools agent
tools:
  - Read
  - Write
  - Glob
---

Agent prompt.
`;

    const agent = parseAgentMarkdown(content, "/test/array.md");
    expect(agent.tools).toEqual(["Read", "Write", "Glob"]);
  });
});

describe("readAgentDefinitions", () => {
  it("should read agent definitions from project directory", async () => {
    const agents = await readAgentDefinitions({
      projectDir: TEST_DIR,
      userDir: "/nonexistent/dir", // Skip user agents
    });

    expect(agents.length).toBeGreaterThanOrEqual(2);

    const reviewer = agents.find((a) => a.name === "code-reviewer");
    expect(reviewer).toBeDefined();
    expect(reviewer!.description).toBe(
      "Reviews code for quality and security issues"
    );
    expect(reviewer!.model).toBe("sonnet");
    expect(reviewer!.maxTurns).toBe(20);
    expect(reviewer!.tools).toEqual(["Read", "Glob", "Grep"]);
    expect(reviewer!.disallowedTools).toEqual(["Write", "Edit"]);
    expect(reviewer!.prompt).toContain("code reviewer");
    expect(reviewer!.source).toBe("project");

    const simple = agents.find((a) => a.name === "simple-agent");
    expect(simple).toBeDefined();
    expect(simple!.description).toBe("A simple helper agent");
  });

  it("should handle non-existent directories gracefully", async () => {
    const agents = await readAgentDefinitions({
      projectDir: "/nonexistent/project",
      userDir: "/nonexistent/user",
    });

    expect(agents).toEqual([]);
  });

  it("should read from user agent directory", async () => {
    // This reads real ~/.claude/agents/ - may or may not have files
    const agents = await readAgentDefinitions({
      projectDir: "/nonexistent", // Skip project
    });

    expect(Array.isArray(agents)).toBe(true);
    // All returned should be "user" source
    for (const agent of agents) {
      expect(agent.source).toBe("user");
    }
  });
});
