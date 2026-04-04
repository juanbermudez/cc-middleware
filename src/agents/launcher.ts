/**
 * Programmatic agent launching.
 * Launches sessions with specific agent definitions via the SDK.
 */

import type { SessionManager } from "../sessions/manager.js";
import type { AgentRegistry } from "./registry.js";
import type { AgentDefinitionSource } from "./definitions.js";
import type { LaunchOptions, LaunchResult } from "../sessions/launcher.js";
import { AgentNotFoundError } from "../types/errors.js";

/**
 * Agent launcher that uses the agent registry and session manager.
 */
export class AgentLauncher {
  constructor(
    private sessionManager: SessionManager,
    private agentRegistry: AgentRegistry
  ) {}

  /**
   * Launch a session using a registered agent by name.
   */
  async launchAgent(
    agentName: string,
    prompt: string,
    options?: Partial<LaunchOptions>
  ): Promise<LaunchResult> {
    const agent = this.agentRegistry.get(agentName);
    if (!agent) {
      throw new AgentNotFoundError(agentName);
    }

    return this.launchWithDefinition(agent, prompt, options);
  }

  /**
   * Launch a session with an inline agent definition.
   */
  async launchWithDefinition(
    definition: AgentDefinitionSource,
    prompt: string,
    options?: Partial<LaunchOptions>
  ): Promise<LaunchResult> {
    // Build SDK agents option with this agent
    const agents: Record<string, unknown> = {
      [definition.name]: {
        description: definition.description,
        prompt: definition.prompt,
        model: definition.model,
        tools: definition.tools,
        disallowedTools: definition.disallowedTools,
        maxTurns: definition.maxTurns,
      },
    };

    return this.sessionManager.launch({
      prompt,
      ...options,
      // Merge agents - the SDK agents option enables sub-agents
      hooks: {
        ...(options?.hooks ?? {}),
      },
    });
  }
}

/**
 * Create a new agent launcher.
 */
export function createAgentLauncher(
  sessionManager: SessionManager,
  agentRegistry: AgentRegistry
): AgentLauncher {
  return new AgentLauncher(sessionManager, agentRegistry);
}
