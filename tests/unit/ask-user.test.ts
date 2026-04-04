/**
 * Unit tests for AskUserQuestion handling.
 */

import { describe, it, expect, vi } from "vitest";
import { createAskUserQuestionManager } from "../../src/permissions/ask-user.js";
import type { AskUserQuestionInput } from "../../src/permissions/ask-user.js";

function makeAskInput(): AskUserQuestionInput {
  return {
    questions: [
      {
        question: "Do you want to proceed?",
        header: "Confirm",
        options: [
          { label: "Yes", description: "Proceed with the action" },
          { label: "No", description: "Cancel the action" },
        ],
        multiSelect: false,
      },
    ],
    toolUseID: "tool-123",
    sessionId: "session-456",
  };
}

describe("AskUserQuestionManager", () => {
  it("should use registered handler to answer questions", async () => {
    const manager = createAskUserQuestionManager();

    manager.registerHandler(async (input: AskUserQuestionInput) => ({
      behavior: "allow" as const,
      updatedInput: {
        questions: input.questions,
        answers: { Confirm: "Yes" },
      },
      toolUseID: input.toolUseID,
    }));

    const result = await manager.handle(
      "AskUserQuestion",
      { questions: makeAskInput().questions },
      "tool-123",
      "session-456"
    );

    expect(result.behavior).toBe("allow");
    if (result.behavior === "allow") {
      expect(result.updatedInput).toBeDefined();
    }
  });

  it("should use default answers when no handler is registered", async () => {
    const manager = createAskUserQuestionManager();

    manager.setDefaultAnswers({ Confirm: "Yes" });

    const result = await manager.handle(
      "AskUserQuestion",
      { questions: makeAskInput().questions },
      "tool-123"
    );

    expect(result.behavior).toBe("allow");
    if (result.behavior === "allow") {
      expect(
        (result.updatedInput as Record<string, unknown>)?.answers
      ).toEqual({ Confirm: "Yes" });
    }
  });

  it("should pick first option when no default matches", async () => {
    const manager = createAskUserQuestionManager();

    // Set defaults but not for our question header
    manager.setDefaultAnswers({ Other: "value" });

    const result = await manager.handle(
      "AskUserQuestion",
      { questions: makeAskInput().questions },
      "tool-123"
    );

    expect(result.behavior).toBe("allow");
    if (result.behavior === "allow") {
      const answers = (result.updatedInput as Record<string, unknown>)
        ?.answers as Record<string, string>;
      expect(answers.Confirm).toBe("Yes"); // First option
    }
  });

  it("should create pending question for external resolution", async () => {
    const manager = createAskUserQuestionManager({ answerTimeout: 60000 });

    // Start question handling (don't await)
    const resultPromise = manager.handle(
      "AskUserQuestion",
      { questions: makeAskInput().questions },
      "tool-123",
      "session-456"
    );

    // Give a tick
    await new Promise((r) => setTimeout(r, 10));

    // Should have a pending question
    const pending = manager.getPendingQuestions();
    expect(pending).toHaveLength(1);
    expect(pending[0].input.toolUseID).toBe("tool-123");

    // Answer the question
    manager.answerQuestion(pending[0].id, { Confirm: "No" });

    const result = await resultPromise;
    expect(result.behavior).toBe("allow");
    if (result.behavior === "allow") {
      const answers = (result.updatedInput as Record<string, unknown>)
        ?.answers as Record<string, string>;
      expect(answers.Confirm).toBe("No");
    }
  });

  it("should timeout pending questions", async () => {
    const manager = createAskUserQuestionManager({ answerTimeout: 100 });

    const result = await manager.handle(
      "AskUserQuestion",
      { questions: makeAskInput().questions },
      "tool-123"
    );

    expect(result.behavior).toBe("deny");
    if (result.behavior === "deny") {
      expect(result.message).toContain("timed out");
    }
  });

  it("should unregister handler", async () => {
    const manager = createAskUserQuestionManager({ answerTimeout: 100 });

    const unregister = manager.registerHandler(async () => ({
      behavior: "allow" as const,
      updatedInput: { questions: [], answers: {} },
    }));

    // Handler is registered
    let result = await manager.handle(
      "AskUserQuestion",
      { questions: makeAskInput().questions },
      "tool-123"
    );
    expect(result.behavior).toBe("allow");

    // Unregister
    unregister();

    // Now should timeout (no handler, no defaults)
    result = await manager.handle(
      "AskUserQuestion",
      { questions: makeAskInput().questions },
      "tool-456"
    );
    expect(result.behavior).toBe("deny");
  });
});
