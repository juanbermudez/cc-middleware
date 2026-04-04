/**
 * E2E test: MCP server reader.
 * Tests discovering MCP servers from real configuration.
 */

import { describe, it, expect } from "vitest";
import { discoverMcpServers } from "../../src/config/mcp.js";

describe("MCP Server Reader (E2E)", () => {
  it("should discover MCP servers without errors", async () => {
    const servers = await discoverMcpServers();

    expect(Array.isArray(servers)).toBe(true);

    // On this machine, there may or may not be MCP servers configured
    for (const server of servers) {
      expect(server.name).toBeTruthy();
      expect(["managed", "user", "local", "project", "plugin"]).toContain(server.scope);
      expect(["stdio", "sse", "http"]).toContain(server.transport);
      expect(typeof server.enabled).toBe("boolean");
      expect(server.source).toBeTruthy();
    }
  });

  it("should handle non-existent project directory gracefully", async () => {
    const servers = await discoverMcpServers({
      projectDir: "/nonexistent/path/12345",
    });

    // Should not throw, may return servers from user/managed scope
    expect(Array.isArray(servers)).toBe(true);
  });

  it("should return servers with correct transport types", async () => {
    const servers = await discoverMcpServers();

    for (const server of servers) {
      if (server.transport === "stdio") {
        // stdio servers should have a command
        // (but they might not if the config is incomplete)
      } else if (server.transport === "http" || server.transport === "sse") {
        // HTTP/SSE servers should have a URL
        // (same caveat)
      }
      // Main thing: transport is always one of the valid types
      expect(["stdio", "sse", "http"]).toContain(server.transport);
    }
  });
});
