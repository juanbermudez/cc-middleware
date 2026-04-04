/**
 * Session message reading.
 * Wraps Agent SDK's getSessionMessages() to read and normalize session messages.
 */

import { getSessionMessages } from "@anthropic-ai/claude-agent-sdk";
import type { SessionMessage } from "../types/sessions.js";

export interface ReadMessagesOptions {
  /** Project directory to find the session in */
  dir?: string;
  /** Maximum number of messages to return */
  limit?: number;
  /** Number of messages to skip from the start */
  offset?: number;
}

/**
 * Read messages from a specific session.
 * Returns normalized SessionMessage objects.
 */
export async function readSessionMessages(
  sessionId: string,
  options?: ReadMessagesOptions
): Promise<SessionMessage[]> {
  const sdkMessages = await getSessionMessages(sessionId, {
    dir: options?.dir,
    limit: options?.limit,
    offset: options?.offset,
  });

  return sdkMessages.map((msg) => ({
    type: msg.type,
    uuid: msg.uuid,
    session_id: msg.session_id,
    message: msg.message,
    parent_tool_use_id: msg.parent_tool_use_id ?? null,
  }));
}

/**
 * Extract text content from a raw message payload.
 * The SDK's message field is an opaque unknown payload that
 * needs parsing. This helper extracts readable text.
 */
export function extractTextContent(message: unknown): string {
  if (typeof message === "string") {
    return message;
  }

  if (message && typeof message === "object") {
    const msg = message as Record<string, unknown>;

    // Handle Anthropic API message format with content array
    if (Array.isArray(msg.content)) {
      return msg.content
        .filter(
          (block: unknown) =>
            typeof block === "object" &&
            block !== null &&
            (block as Record<string, unknown>).type === "text"
        )
        .map((block: unknown) => (block as Record<string, unknown>).text)
        .filter((text): text is string => typeof text === "string")
        .join("\n");
    }

    // Handle simple string content
    if (typeof msg.content === "string") {
      return msg.content;
    }
  }

  return "";
}

/**
 * Extract tool use information from a raw message payload.
 * Returns an array of tool use blocks found in the message.
 */
export function extractToolUses(
  message: unknown
): Array<{ id: string; name: string; input: unknown }> {
  if (!message || typeof message !== "object") {
    return [];
  }

  const msg = message as Record<string, unknown>;

  if (Array.isArray(msg.content)) {
    return msg.content
      .filter(
        (block: unknown) =>
          typeof block === "object" &&
          block !== null &&
          (block as Record<string, unknown>).type === "tool_use"
      )
      .map((block: unknown) => {
        const b = block as Record<string, unknown>;
        return {
          id: (b.id as string) ?? "",
          name: (b.name as string) ?? "",
          input: b.input,
        };
      });
  }

  return [];
}
