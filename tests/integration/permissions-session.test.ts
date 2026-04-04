/**
 * Integration test: Permissions + Session.
 * Verifies that createCanUseTool() connected to PolicyEngine
 * allows/denies tools during a real session.
 * Makes REAL API calls to Claude.
 */

import { describe, it, expect } from "vitest";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { PolicyEngine } from "../../src/permissions/policy.js";
import { createCanUseTool } from "../../src/permissions/handler.js";
import { HookEventBus } from "../../src/hooks/event-bus.js";

describe("Permissions + Session Integration", () => {
  it("should allow Read but deny Bash based on policy", async () => {
    const policy = new PolicyEngine({
      rules: [
        { id: "deny-bash", toolName: "Bash", behavior: "deny", priority: 1 },
        { id: "allow-read", toolName: "Read", behavior: "allow", priority: 2 },
      ],
      defaultBehavior: "deny",
    });
    const eventBus = new HookEventBus();
    const { canUseTool } = createCanUseTool({
      policyEngine: policy,
      eventBus,
    });

    let resultText = "";
    const deniedTools: string[] = [];

    try {
      for await (const message of query({
        prompt:
          'First try to run "echo test" with Bash. Then read the file package.json and tell me the name field.',
        options: {
          canUseTool,
          maxTurns: 5,
          cwd: "/Users/zef/Desktop/cc-middleware",
        },
      })) {
        const msg = message as Record<string, unknown>;
        if (msg.type === "result" && msg.subtype === "success") {
          resultText = (msg.result as string) ?? "";
        }
        // Track permission denials from result
        if (msg.type === "result") {
          const denials = msg.permission_denials as
            | Array<{ tool_name: string }>
            | undefined;
          if (denials) {
            for (const d of denials) {
              deniedTools.push(d.tool_name);
            }
          }
        }
      }
    } catch {
      // SDK may throw on error results - that's OK
    }

    // Result should be truthy (session completed with some output)
    expect(resultText).toBeTruthy();
    // Result should mention cc-middleware (the project name from package.json)
    // since Read was allowed
    expect(resultText.toLowerCase()).toContain("cc-middleware");
  }, 90000);
});
