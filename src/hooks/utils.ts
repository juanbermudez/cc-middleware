/**
 * Shared hook utilities.
 */

/**
 * Extract tool name from hook input payload.
 */
export function extractToolName(input: Record<string, unknown>): string | undefined {
  if (typeof input.tool_name === "string") {
    return input.tool_name;
  }
  return undefined;
}
