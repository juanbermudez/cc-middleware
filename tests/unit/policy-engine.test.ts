/**
 * Unit tests for the permission policy engine.
 */

import { describe, it, expect } from "vitest";
import { PolicyEngine, createPolicyEngine } from "../../src/permissions/policy.js";
import type { PermissionRule } from "../../src/permissions/policy.js";

describe("PolicyEngine", () => {
  it("should allow when rule matches with allow behavior", () => {
    const engine = createPolicyEngine([
      { id: "r1", toolName: "Read", behavior: "allow", priority: 1 },
    ]);

    const result = engine.evaluate("Read", {});
    expect(result.decision).toBe("allow");
    expect(result.matchedRule?.id).toBe("r1");
  });

  it("should deny when rule matches with deny behavior", () => {
    const engine = createPolicyEngine([
      { id: "r1", toolName: "Bash", behavior: "deny", priority: 1 },
    ]);

    const result = engine.evaluate("Bash", { command: "rm -rf /" });
    expect(result.decision).toBe("deny");
    expect(result.matchedRule?.id).toBe("r1");
  });

  it("should use default behavior when no rule matches", () => {
    const engine = createPolicyEngine([], "ask");

    const result = engine.evaluate("Read", {});
    expect(result.decision).toBe("ask");
    expect(result.matchedRule).toBeUndefined();
  });

  it("should support Bash(pattern) conditions", () => {
    const engine = createPolicyEngine([
      {
        id: "r1",
        toolName: "Bash",
        behavior: "deny",
        condition: "Bash(rm *)",
        priority: 1,
      },
    ], "allow");

    // rm command should be denied
    const rmResult = engine.evaluate("Bash", { command: "rm -rf /" });
    expect(rmResult.decision).toBe("deny");
    expect(rmResult.matchedRule?.id).toBe("r1");

    // git command should fall through to default (allow)
    const gitResult = engine.evaluate("Bash", { command: "git status" });
    expect(gitResult.decision).toBe("allow");
    expect(gitResult.matchedRule).toBeUndefined();
  });

  it("should evaluate rules in priority order", () => {
    const engine = createPolicyEngine([
      {
        id: "r1",
        toolName: "Bash",
        behavior: "deny",
        condition: "Bash(rm *)",
        priority: 1,
      },
      {
        id: "r2",
        toolName: "Bash",
        behavior: "allow",
        priority: 2,
      },
    ]);

    // rm should be denied by higher-priority rule
    const rmResult = engine.evaluate("Bash", { command: "rm -rf /" });
    expect(rmResult.decision).toBe("deny");
    expect(rmResult.matchedRule?.id).toBe("r1");

    // git should be allowed by lower-priority catch-all
    const gitResult = engine.evaluate("Bash", { command: "git status" });
    expect(gitResult.decision).toBe("allow");
    expect(gitResult.matchedRule?.id).toBe("r2");
  });

  it("should support alternation patterns (Edit|Write)", () => {
    const engine = createPolicyEngine([
      { id: "r1", toolName: "Edit|Write", behavior: "allow", priority: 1 },
    ], "deny");

    expect(engine.evaluate("Edit", {}).decision).toBe("allow");
    expect(engine.evaluate("Write", {}).decision).toBe("allow");
    expect(engine.evaluate("Read", {}).decision).toBe("deny");
  });

  it("should support wildcard patterns (mcp__*)", () => {
    const engine = createPolicyEngine([
      { id: "r1", toolName: "mcp__*", behavior: "deny", priority: 1 },
    ], "allow");

    expect(engine.evaluate("mcp__github_issues", {}).decision).toBe("deny");
    expect(engine.evaluate("mcp__slack_send", {}).decision).toBe("deny");
    expect(engine.evaluate("Read", {}).decision).toBe("allow");
  });

  it("should support catch-all wildcard (*)", () => {
    const engine = createPolicyEngine([
      { id: "r1", toolName: "*", behavior: "allow", priority: 1 },
    ]);

    expect(engine.evaluate("Read", {}).decision).toBe("allow");
    expect(engine.evaluate("Bash", {}).decision).toBe("allow");
    expect(engine.evaluate("anything", {}).decision).toBe("allow");
  });

  it("should add and remove rules dynamically", () => {
    const engine = createPolicyEngine([], "deny");

    expect(engine.evaluate("Read", {}).decision).toBe("deny");

    engine.addRule({
      id: "r1",
      toolName: "Read",
      behavior: "allow",
      priority: 1,
    });
    expect(engine.evaluate("Read", {}).decision).toBe("allow");

    engine.removeRule("r1");
    expect(engine.evaluate("Read", {}).decision).toBe("deny");
  });

  it("should change default behavior", () => {
    const engine = createPolicyEngine([], "ask");

    expect(engine.evaluate("Read", {}).decision).toBe("ask");

    engine.setDefaultBehavior("allow");
    expect(engine.evaluate("Read", {}).decision).toBe("allow");
  });

  it("should return all rules", () => {
    const rules: PermissionRule[] = [
      { id: "r1", toolName: "Read", behavior: "allow", priority: 1 },
      { id: "r2", toolName: "Bash", behavior: "deny", priority: 2 },
    ];

    const engine = createPolicyEngine(rules);
    expect(engine.getRules()).toHaveLength(2);
    expect(engine.getRules()[0].id).toBe("r1");
    expect(engine.getRules()[1].id).toBe("r2");
  });
});
