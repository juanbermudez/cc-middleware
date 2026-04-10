/**
 * Unit tests for the live analytics capture layer.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createMemoryLiveAnalyticsSink,
  setLiveAnalyticsSink,
} from "../../src/analytics/live/index.js";
import { launchSession } from "../../src/sessions/launcher.js";
import { launchStreamingSession } from "../../src/sessions/streaming.js";

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
}));

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: queryMock,
}));

function mockQuery(messages: unknown[]): void {
  queryMock.mockReturnValue({
    [Symbol.asyncIterator]: async function* () {
      for (const message of messages) {
        yield message;
      }
    },
  });
}

beforeEach(() => {
  queryMock.mockReset();
  setLiveAnalyticsSink();
});

afterEach(() => {
  setLiveAnalyticsSink();
});

describe("live analytics capture", () => {
  it("records raw sdk messages during launchSession", async () => {
    const memory = createMemoryLiveAnalyticsSink();
    setLiveAnalyticsSink(memory.sink);

    mockQuery([
      {
        type: "system",
        session_id: "session-launch-1",
        cwd: "/tmp/project",
      },
      {
        type: "result",
        session_id: "session-launch-1",
        subtype: "success",
        is_error: false,
        duration_ms: 25,
        duration_api_ms: 10,
        total_cost_usd: 0.12,
        num_turns: 1,
        stop_reason: "end_turn",
        usage: {
          input_tokens: 12,
          output_tokens: 9,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
        modelUsage: {},
        permission_denials: [],
      },
    ]);

    const result = await launchSession({
      prompt: "say hello",
      cwd: "/tmp/project",
      analytics: {
        source: "api",
        label: "launch-test",
      },
    });

    expect(result.sessionId).toBe("session-launch-1");
    expect(memory.records.sdkMessages).toHaveLength(2);
    expect(memory.records.sdkMessages[0]).toMatchObject({
      kind: "sdk_message",
      phase: "launch",
      source: "api",
      label: "launch-test",
      messageType: "system",
      prompt: "say hello",
      sessionId: "session-launch-1",
    });
    expect(memory.records.sdkMessages[1]).toMatchObject({
      messageType: "result",
      sessionId: "session-launch-1",
    });
  });

  it("notifies callers when launchSession learns the real session id", async () => {
    mockQuery([
      {
        type: "system",
        session_id: "session-launch-2",
      },
      {
        type: "result",
        session_id: "session-launch-2",
        subtype: "success",
        is_error: false,
        duration_ms: 10,
        duration_api_ms: 5,
        total_cost_usd: 0.01,
        num_turns: 1,
        stop_reason: "end_turn",
        usage: {
          input_tokens: 1,
          output_tokens: 1,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
        modelUsage: {},
        permission_denials: [],
      },
    ]);

    const onSessionId = vi.fn();

    await launchSession({
      prompt: "track session id",
      onSessionId,
    });

    expect(onSessionId).toHaveBeenCalledWith("session-launch-2");
  });

  it("records raw sdk messages during streaming", async () => {
    const memory = createMemoryLiveAnalyticsSink();
    setLiveAnalyticsSink(memory.sink);

    mockQuery([
      {
        type: "stream_event",
        session_id: "session-stream-1",
        event: {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "Hello" },
        },
      },
      {
        type: "assistant",
        session_id: "session-stream-1",
        content: [{ type: "text", text: "Hello there" }],
      },
      {
        type: "result",
        session_id: "session-stream-1",
        subtype: "success",
        is_error: false,
        duration_ms: 42,
        duration_api_ms: 18,
        total_cost_usd: 0.34,
        num_turns: 2,
        stop_reason: "end_turn",
        usage: {
          input_tokens: 22,
          output_tokens: 13,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
        modelUsage: {},
        permission_denials: [],
      },
    ]);

    const streaming = await launchStreamingSession({
      prompt: "stream hello",
      cwd: "/tmp/project",
      analytics: {
        source: "websocket",
      },
    });

    const events = [];
    for await (const event of streaming.events) {
      events.push(event);
    }

    const result = await streaming.result;

    expect(result.sessionId).toBe("session-stream-1");
    expect(events.some((event) => event.type === "text_delta")).toBe(true);
    expect(events.some((event) => event.type === "assistant_message")).toBe(true);
    expect(memory.records.sdkMessages).toHaveLength(3);
    expect(memory.records.sdkMessages[0]).toMatchObject({
      kind: "sdk_message",
      phase: "streaming",
      source: "websocket",
      messageType: "stream_event",
      prompt: "stream hello",
      sessionId: "session-stream-1",
    });
    expect(memory.records.sdkMessages[2]).toMatchObject({
      messageType: "result",
      sessionId: "session-stream-1",
    });
  });

  it("notifies callers when streaming learns the real session id", async () => {
    mockQuery([
      {
        type: "stream_event",
        session_id: "session-stream-2",
        event: {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "Hello" },
        },
      },
      {
        type: "result",
        session_id: "session-stream-2",
        subtype: "success",
        is_error: false,
        duration_ms: 42,
        duration_api_ms: 18,
        total_cost_usd: 0.34,
        num_turns: 2,
        stop_reason: "end_turn",
        usage: {
          input_tokens: 22,
          output_tokens: 13,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
        modelUsage: {},
        permission_denials: [],
      },
    ]);

    const onSessionId = vi.fn();
    const streaming = await launchStreamingSession({
      prompt: "stream hello",
      onSessionId,
    });

    for await (const _event of streaming.events) {
      // Drain the stream.
    }

    expect(onSessionId).toHaveBeenCalledWith("session-stream-2");
  });
});
