/**
 * Plugin MCP server.
 * Exposes middleware tools via the Agent SDK's createSdkMcpServer.
 * This provides Claude with direct tool access to the middleware API.
 */

import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const MIDDLEWARE_BASE = "http://127.0.0.1:3000";

/** Helper to fetch from middleware API */
async function fetchMiddleware(path: string): Promise<unknown> {
  const response = await fetch(`${MIDDLEWARE_BASE}${path}`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Middleware API error ${response.status}: ${text}`);
  }
  return response.json();
}

/** List recent Claude Code sessions */
const listSessionsTool = tool(
  "cc_list_sessions",
  "List recent Claude Code sessions managed by the middleware",
  { limit: z.number().optional().describe("Max sessions to return (default 10)"), project: z.string().optional().describe("Filter by project directory") },
  async ({ limit, project }) => {
    const params = new URLSearchParams();
    if (limit) params.set("limit", String(limit));
    if (project) params.set("project", project);
    const qs = params.toString();
    const data = await fetchMiddleware(`/api/v1/sessions${qs ? `?${qs}` : ""}`);
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  },
  { annotations: { readOnlyHint: true } }
);

/** Get middleware status */
const getStatusTool = tool(
  "cc_status",
  "Get the current status of the CC-Middleware including active sessions, agents, and hooks",
  {},
  async () => {
    const data = await fetchMiddleware("/api/v1/status");
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  },
  { annotations: { readOnlyHint: true } }
);

/** Search sessions */
const searchSessionsTool = tool(
  "cc_search_sessions",
  "Search through indexed Claude Code sessions by keyword",
  { query: z.string().describe("Search query"), limit: z.number().optional().describe("Max results (default 20)") },
  async ({ query, limit }) => {
    const params = new URLSearchParams({ q: query });
    if (limit) params.set("limit", String(limit));
    const data = await fetchMiddleware(`/api/v1/search?${params.toString()}`);
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  },
  { annotations: { readOnlyHint: true } }
);

/** List agents */
const listAgentsTool = tool(
  "cc_list_agents",
  "List all registered agents in the middleware",
  {},
  async () => {
    const data = await fetchMiddleware("/api/v1/agents");
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  },
  { annotations: { readOnlyHint: true } }
);

/** Create the MCP server */
export function createMiddlewareMcpServer() {
  return createSdkMcpServer({
    name: "cc-middleware",
    version: "0.1.0",
    tools: [listSessionsTool, getStatusTool, searchSessionsTool, listAgentsTool],
  });
}
