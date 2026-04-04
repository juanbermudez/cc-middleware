/**
 * Central registry for agent definitions.
 * Aggregates agents from filesystem and runtime sources.
 */

import {
  readAgentDefinitions,
  type AgentDefinitionSource,
  type AgentSource,
} from "./definitions.js";

/**
 * Central registry for agent definitions.
 * Supports filesystem loading and runtime registration.
 * Runtime agents override filesystem agents with the same name.
 */
export class AgentRegistry {
  private agents = new Map<string, AgentDefinitionSource>();

  /**
   * Load agent definitions from the filesystem.
   * Reads from project and user agent directories.
   */
  async loadFromFilesystem(options?: {
    projectDir?: string;
    userDir?: string;
    pluginDirs?: string[];
  }): Promise<void> {
    const definitions = await readAgentDefinitions(options);

    for (const def of definitions) {
      // Don't overwrite runtime agents
      const existing = this.agents.get(def.name);
      if (existing && existing.source === "runtime") {
        continue;
      }
      this.agents.set(def.name, def);
    }
  }

  /**
   * Register a runtime agent definition.
   * Overrides any existing definition with the same name.
   */
  register(name: string, definition: Omit<AgentDefinitionSource, "name" | "source">): void {
    this.agents.set(name, {
      ...definition,
      name,
      source: "runtime",
    });
  }

  /**
   * Unregister an agent by name.
   */
  unregister(name: string): void {
    this.agents.delete(name);
  }

  /**
   * Get an agent definition by name.
   */
  get(name: string): AgentDefinitionSource | undefined {
    return this.agents.get(name);
  }

  /**
   * List all registered agent definitions.
   */
  list(): AgentDefinitionSource[] {
    return Array.from(this.agents.values());
  }

  /**
   * List agents filtered by source.
   */
  listBySource(source: AgentSource): AgentDefinitionSource[] {
    return this.list().filter((a) => a.source === source);
  }

  /**
   * Convert all agents to the SDK's agents option format.
   * Returns a Record<string, AgentDefinition> for use with query().
   */
  toSDKAgents(): Record<string, { description: string; prompt: string; model?: string; tools?: string[]; disallowedTools?: string[]; maxTurns?: number }> {
    const sdkAgents: Record<string, { description: string; prompt: string; model?: string; tools?: string[]; disallowedTools?: string[]; maxTurns?: number }> = {};

    for (const agent of this.agents.values()) {
      sdkAgents[agent.name] = {
        description: agent.description,
        prompt: agent.prompt,
        model: agent.model,
        tools: agent.tools,
        disallowedTools: agent.disallowedTools,
        maxTurns: agent.maxTurns,
      };
    }

    return sdkAgents;
  }

  /**
   * Get the count of registered agents.
   */
  get size(): number {
    return this.agents.size;
  }

  /**
   * Clear all registered agents.
   */
  clear(): void {
    this.agents.clear();
  }
}

/**
 * Create a new agent registry.
 */
export function createAgentRegistry(): AgentRegistry {
  return new AgentRegistry();
}
