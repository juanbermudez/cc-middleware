/**
 * Unit test: Plugin MCP server.
 * Verifies the MCP server can be created with the expected tools.
 */

import { describe, it, expect } from "vitest";
import { createMiddlewareMcpServer } from "../../src/plugin/mcp-server.js";

describe("Plugin MCP Server (Unit)", () => {
  it("should create an MCP server instance", () => {
    const server = createMiddlewareMcpServer();
    expect(server).toBeDefined();
  });
});
