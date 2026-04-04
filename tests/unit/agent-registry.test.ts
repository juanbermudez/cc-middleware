/**
 * Unit tests for the agent definition registry.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createAgentRegistry } from "../../src/agents/registry.js";

const TEST_DIR = "/tmp/cc-middleware-registry-test";

beforeAll(() => {
  mkdirSync(join(TEST_DIR, ".claude", "agents"), { recursive: true });

  writeFileSync(
    join(TEST_DIR, ".claude", "agents", "fs-agent.md"),
    `---
name: fs-agent
description: Filesystem agent
model: sonnet
---

Filesystem agent prompt.
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

describe("AgentRegistry", () => {
  it("should register and retrieve runtime agents", () => {
    const registry = createAgentRegistry();

    registry.register("test-agent", {
      description: "A test agent",
      prompt: "Be helpful",
      model: "sonnet",
    });

    const agent = registry.get("test-agent");
    expect(agent).toBeDefined();
    expect(agent!.name).toBe("test-agent");
    expect(agent!.description).toBe("A test agent");
    expect(agent!.source).toBe("runtime");
  });

  it("should list all agents", () => {
    const registry = createAgentRegistry();

    registry.register("agent-1", {
      description: "Agent 1",
      prompt: "Prompt 1",
    });
    registry.register("agent-2", {
      description: "Agent 2",
      prompt: "Prompt 2",
    });

    const all = registry.list();
    expect(all).toHaveLength(2);
    expect(all.map((a) => a.name).sort()).toEqual(["agent-1", "agent-2"]);
  });

  it("should list agents by source", () => {
    const registry = createAgentRegistry();

    registry.register("runtime-agent", {
      description: "Runtime",
      prompt: "Prompt",
    });

    const runtime = registry.listBySource("runtime");
    expect(runtime).toHaveLength(1);
    expect(runtime[0].name).toBe("runtime-agent");

    const project = registry.listBySource("project");
    expect(project).toHaveLength(0);
  });

  it("should unregister agents", () => {
    const registry = createAgentRegistry();

    registry.register("temp", { description: "Temp", prompt: "Prompt" });
    expect(registry.get("temp")).toBeDefined();

    registry.unregister("temp");
    expect(registry.get("temp")).toBeUndefined();
  });

  it("should load from filesystem", async () => {
    const registry = createAgentRegistry();

    await registry.loadFromFilesystem({
      projectDir: TEST_DIR,
      userDir: "/nonexistent/dir",
    });

    const fsAgent = registry.get("fs-agent");
    expect(fsAgent).toBeDefined();
    expect(fsAgent!.description).toBe("Filesystem agent");
    expect(fsAgent!.source).toBe("project");
  });

  it("should not overwrite runtime agents when loading filesystem", async () => {
    const registry = createAgentRegistry();

    // Register runtime agent first
    registry.register("fs-agent", {
      description: "Runtime override",
      prompt: "Runtime prompt",
    });

    // Load from filesystem
    await registry.loadFromFilesystem({
      projectDir: TEST_DIR,
      userDir: "/nonexistent/dir",
    });

    // Runtime should win
    const agent = registry.get("fs-agent");
    expect(agent).toBeDefined();
    expect(agent!.description).toBe("Runtime override");
    expect(agent!.source).toBe("runtime");
  });

  it("should convert to SDK agents format", () => {
    const registry = createAgentRegistry();

    registry.register("my-agent", {
      description: "SDK agent",
      prompt: "Be a good agent",
      model: "opus",
      tools: ["Read", "Write"],
      maxTurns: 5,
    });

    const sdkAgents = registry.toSDKAgents();
    expect(sdkAgents["my-agent"]).toBeDefined();
    expect(sdkAgents["my-agent"].description).toBe("SDK agent");
    expect(sdkAgents["my-agent"].prompt).toBe("Be a good agent");
    expect(sdkAgents["my-agent"].model).toBe("opus");
    expect(sdkAgents["my-agent"].tools).toEqual(["Read", "Write"]);
    expect(sdkAgents["my-agent"].maxTurns).toBe(5);
  });

  it("should track size and support clear", () => {
    const registry = createAgentRegistry();

    expect(registry.size).toBe(0);

    registry.register("a", { description: "A", prompt: "A" });
    registry.register("b", { description: "B", prompt: "B" });
    expect(registry.size).toBe(2);

    registry.clear();
    expect(registry.size).toBe(0);
    expect(registry.list()).toHaveLength(0);
  });
});
