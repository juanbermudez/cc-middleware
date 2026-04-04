/**
 * Agent and team types for CC-Middleware.
 */

/** Model options for agents */
export type AgentModel = "sonnet" | "opus" | "haiku" | "inherit";

/** MCP server specification for an agent */
export interface AgentMcpServerSpec {
  name: string;
  url?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}

/** Agent definition, aligned with SDK AgentDefinition */
export interface AgentDefinition {
  /** Agent name (derived from filename or explicit) */
  name: string;
  /** Required: description of what the agent does */
  description: string;
  /** Required: system prompt for the agent */
  prompt: string;
  /** Allowed tools (array of tool names) */
  tools?: string[];
  /** Disallowed tools */
  disallowedTools?: string[];
  /** Model to use */
  model?: AgentModel;
  /** MCP servers available to this agent */
  mcpServers?: AgentMcpServerSpec[];
  /** Skills available to this agent */
  skills?: string[];
  /** Maximum turns for the agent */
  maxTurns?: number;
  /** Experimental: critical system reminder */
  criticalSystemReminder_EXPERIMENTAL?: string;
}

/** Light metadata about an agent */
export interface AgentInfo {
  name: string;
  description: string;
  model?: AgentModel;
}

/** Team configuration */
export interface TeamConfig {
  name: string;
  members: TeamMember[];
  taskListPath?: string;
}

/** A member of a team */
export interface TeamMember {
  name: string;
  agentId: string;
  agentType: string;
  status: TeamMemberStatus;
}

/** Team member status */
export type TeamMemberStatus = "idle" | "working" | "stopped" | "error";

/** A task assigned to a team */
export interface TeamTask {
  id: string;
  description: string;
  status: TeamTaskStatus;
  assignee?: string;
  dependencies?: string[];
}

/** Task status */
export type TeamTaskStatus = "pending" | "in_progress" | "completed" | "failed";
