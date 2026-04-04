/**
 * Permission policy engine.
 * Evaluates permission rules to make allow/deny/ask decisions for tool calls.
 */

/** A single permission rule */
export interface PermissionRule {
  id: string;
  /** Tool name pattern: supports regex alternation (Edit|Write) and wildcard (*) */
  toolName: string;
  /** What to do when this rule matches */
  behavior: "allow" | "deny";
  /** Bash(pattern) syntax: matches against input.command for Bash tool */
  condition?: string;
  /** Lower number = higher priority (evaluated first) */
  priority: number;
}

/** A complete permission policy */
export interface PermissionPolicy {
  rules: PermissionRule[];
  /** What to do when no rule matches */
  defaultBehavior: "allow" | "deny" | "ask";
}

/** Result of evaluating a tool call against the policy */
export interface PolicyDecision {
  decision: "allow" | "deny" | "ask";
  matchedRule?: PermissionRule;
}

/**
 * Convert a tool name pattern to a regex.
 * Supports:
 * - Exact match: "Read" -> /^Read$/
 * - Alternation: "Edit|Write" -> /^(Edit|Write)$/
 * - Wildcard: "mcp__*" -> /^mcp__.*$/
 * - Full glob: "*" -> /^.*$/
 */
function toolPatternToRegex(pattern: string): RegExp {
  // If it contains |, wrap each alternative
  if (pattern.includes("|")) {
    const parts = pattern.split("|").map((p) => escapeAndGlob(p));
    return new RegExp(`^(${parts.join("|")})$`);
  }
  return new RegExp(`^${escapeAndGlob(pattern)}$`);
}

function escapeAndGlob(pattern: string): string {
  // Escape regex special chars except *
  const escaped = pattern.replace(/[.+?^${}()\[\]\\]/g, "\\$&");
  // Replace * with .* for glob matching
  return escaped.replace(/\*/g, ".*");
}

/**
 * Check if a Bash condition matches the input command.
 * Supports Bash(pattern) syntax where pattern is a glob.
 * e.g., Bash(rm *) matches input.command starting with "rm "
 * e.g., Bash(git *) matches input.command starting with "git "
 */
function matchBashCondition(
  condition: string,
  input: Record<string, unknown>
): boolean {
  // Parse Bash(pattern) syntax
  const match = condition.match(/^Bash\((.+)\)$/);
  if (!match) {
    return false;
  }

  const pattern = match[1];
  const command = input.command;
  if (typeof command !== "string") {
    return false;
  }

  // Convert glob pattern to regex
  const regex = new RegExp(`^${escapeAndGlob(pattern)}$`);
  return regex.test(command);
}

/**
 * Permission policy engine.
 * Evaluates tool calls against a set of rules.
 */
export class PolicyEngine {
  private rules: PermissionRule[];
  private defaultBehavior: "allow" | "deny" | "ask";

  constructor(policy: PermissionPolicy) {
    this.rules = [...policy.rules].sort((a, b) => a.priority - b.priority);
    this.defaultBehavior = policy.defaultBehavior;
  }

  /**
   * Evaluate a tool call against the policy.
   * Returns the decision and the matched rule (if any).
   */
  evaluate(
    toolName: string,
    input: Record<string, unknown>
  ): PolicyDecision {
    for (const rule of this.rules) {
      const toolRegex = toolPatternToRegex(rule.toolName);

      if (!toolRegex.test(toolName)) {
        continue;
      }

      // If rule has a condition, check it
      if (rule.condition) {
        if (matchBashCondition(rule.condition, input)) {
          return { decision: rule.behavior, matchedRule: rule };
        }
        // Condition didn't match, continue to next rule
        continue;
      }

      // No condition, tool name matched
      return { decision: rule.behavior, matchedRule: rule };
    }

    // No matching rule
    return { decision: this.defaultBehavior };
  }

  /**
   * Add a rule to the policy.
   * Re-sorts rules by priority.
   */
  addRule(rule: PermissionRule): void {
    this.rules.push(rule);
    this.rules.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Remove a rule by ID.
   */
  removeRule(id: string): void {
    this.rules = this.rules.filter((r) => r.id !== id);
  }

  /**
   * Get all rules.
   */
  getRules(): PermissionRule[] {
    return [...this.rules];
  }

  /**
   * Set the default behavior when no rule matches.
   */
  setDefaultBehavior(behavior: "allow" | "deny" | "ask"): void {
    this.defaultBehavior = behavior;
  }
}

/**
 * Create a policy engine with the given rules and default behavior.
 */
export function createPolicyEngine(
  rules: PermissionRule[] = [],
  defaultBehavior: "allow" | "deny" | "ask" = "ask"
): PolicyEngine {
  return new PolicyEngine({ rules, defaultBehavior });
}
