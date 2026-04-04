/**
 * Integration test: HTTP Hook Server + Claude CLI.
 * Starts our hook server, runs `claude -p` with --settings pointing hooks
 * to our server, and verifies events are received.
 * Makes REAL API calls to Claude via CLI.
 */

import { describe, it, expect, afterAll } from "vitest";
import { execSync } from "child_process";
import { HookEventBus } from "../../src/hooks/event-bus.js";
import { BlockingHookRegistry } from "../../src/hooks/blocking.js";
import { createHookServer } from "../../src/hooks/server.js";
import type { HookServer } from "../../src/hooks/server.js";
import type { HookInput } from "../../src/types/hooks.js";

describe("HTTP Hook Server + Claude CLI", () => {
  let server: HookServer | undefined;

  afterAll(async () => {
    if (server) {
      await server.stop();
    }
  });

  it("should receive PostToolUse events from a real claude -p session", async () => {
    const eventBus = new HookEventBus();
    const registry = new BlockingHookRegistry();
    const port = 13580 + Math.floor(Math.random() * 1000);

    server = await createHookServer({
      port,
      host: "127.0.0.1",
      eventBus,
      blockingRegistry: registry,
    });
    await server.start();

    const receivedEvents: HookInput[] = [];
    eventBus.on("PostToolUse", (input) => receivedEvents.push(input));

    // Build settings JSON with hooks pointing to our server
    const settings = {
      hooks: {
        PostToolUse: [
          {
            matcher: "Read",
            hooks: [
              {
                type: "http",
                url: `http://127.0.0.1:${port}/hooks/PostToolUse`,
                timeout: 10,
              },
            ],
          },
        ],
      },
    };

    const settingsJson = JSON.stringify(settings);

    // Run claude -p with settings routing hooks to our server
    try {
      execSync(
        `/Users/zef/.local/bin/claude -p "Read the file package.json and tell me the name field" --allowedTools "Read" --settings '${settingsJson}' --output-format json`,
        {
          cwd: "/Users/zef/Desktop/cc-middleware",
          timeout: 60000,
          encoding: "utf-8",
        }
      );
    } catch (e) {
      // CLI may exit non-zero in some cases - check if events arrived anyway
      const err = e as { status?: number; stdout?: string; stderr?: string };
      if (err.stderr) {
        console.error("CLI stderr:", err.stderr.slice(0, 500));
      }
    }

    // Give a moment for async HTTP delivery
    await new Promise((r) => setTimeout(r, 2000));

    expect(receivedEvents.length).toBeGreaterThan(0);
    const firstEvent = receivedEvents[0] as Record<string, unknown>;
    expect(firstEvent.tool_name).toBe("Read");
  }, 90000);
});
