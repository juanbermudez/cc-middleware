/**
 * AskUserQuestion handling.
 * Manages answering AskUserQuestion tool calls programmatically.
 *
 * When canUseTool receives toolName "AskUserQuestion":
 * 1. Emits event on event bus
 * 2. If a registered handler exists, calls it
 * 3. If no handler, creates a pending question for external resolution
 * 4. If timeout, denies the tool call
 */

import type { PermissionResult } from "./handler.js";
import type { HookEventBus } from "../hooks/event-bus.js";
import { generateId } from "../utils/id.js";

/** Question option */
export interface QuestionOption {
  label: string;
  description: string;
  preview?: string;
}

/** A single question in an AskUserQuestion call */
export interface Question {
  question: string;
  header: string;
  options: QuestionOption[];
  multiSelect: boolean;
}

/** Input to AskUserQuestion */
export interface AskUserQuestionInput {
  questions: Question[];
  toolUseID: string;
  sessionId: string;
}

/** A handler function for answering questions */
export type QuestionHandler = (
  input: AskUserQuestionInput
) => Promise<PermissionResult>;

/** A pending question awaiting external resolution */
export interface PendingQuestion {
  id: string;
  input: AskUserQuestionInput;
  createdAt: number;
  resolve: (result: PermissionResult) => void;
}

/**
 * Manager for AskUserQuestion handling.
 */
export class AskUserQuestionManager {
  private handler: QuestionHandler | null = null;
  private pending = new Map<string, PendingQuestion>();
  private defaultAnswers: Record<string, string> = {};
  private eventBus?: HookEventBus;
  private answerTimeout: number;

  constructor(options?: {
    eventBus?: HookEventBus;
    answerTimeout?: number;
  }) {
    this.eventBus = options?.eventBus;
    this.answerTimeout = options?.answerTimeout ?? 30000;
  }

  /**
   * Register a handler for answering questions.
   * Returns an unregister function.
   */
  registerHandler(handler: QuestionHandler): () => void {
    this.handler = handler;
    return () => {
      this.handler = null;
    };
  }

  /**
   * Set default answers used when no handler is registered.
   * Keys are question headers, values are selected option labels.
   */
  setDefaultAnswers(defaults: Record<string, string>): void {
    this.defaultAnswers = { ...defaults };
  }

  /**
   * Handle an AskUserQuestion tool call.
   * Called from the canUseTool callback when toolName is "AskUserQuestion".
   */
  async handle(
    toolName: string,
    input: Record<string, unknown>,
    toolUseID: string,
    sessionId: string = ""
  ): Promise<PermissionResult> {
    const askInput: AskUserQuestionInput = {
      questions: (input.questions as Question[]) ?? [],
      toolUseID,
      sessionId,
    };

    // Emit event
    if (this.eventBus) {
      this.eventBus.dispatch("Notification", {
        session_id: sessionId,
        cwd: "",
        hook_event_name: "Notification",
      } as unknown as import("../types/hooks.js").HookInput);
    }

    // If handler registered, use it
    if (this.handler) {
      return this.handler(askInput);
    }

    // Try default answers
    if (Object.keys(this.defaultAnswers).length > 0) {
      return this.buildDefaultResponse(askInput);
    }

    // Create pending question for external resolution
    return new Promise<PermissionResult>((resolve) => {
      const id = generateId("ask");

      const timeoutId = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          resolve({
            behavior: "deny",
            message: `AskUserQuestion timed out after ${this.answerTimeout}ms`,
            toolUseID,
          });
        }
      }, this.answerTimeout);

      const pending: PendingQuestion = {
        id,
        input: askInput,
        createdAt: Date.now(),
        resolve: (result) => {
          clearTimeout(timeoutId);
          this.pending.delete(id);
          resolve(result);
        },
      };

      this.pending.set(id, pending);
    });
  }

  /** Get pending questions */
  getPendingQuestions(): PendingQuestion[] {
    return Array.from(this.pending.values());
  }

  /** Answer a pending question */
  answerQuestion(id: string, answers: Record<string, string>): void {
    const pending = this.pending.get(id);
    if (pending) {
      pending.resolve({
        behavior: "allow",
        updatedInput: {
          questions: pending.input.questions,
          answers,
        },
        toolUseID: pending.input.toolUseID,
      });
    }
  }

  /**
   * Build a response using default answers.
   * Picks the first option if no default matches.
   */
  private buildDefaultResponse(
    input: AskUserQuestionInput
  ): PermissionResult {
    const answers: Record<string, string> = {};

    for (const q of input.questions) {
      if (this.defaultAnswers[q.header]) {
        answers[q.header] = this.defaultAnswers[q.header];
      } else if (q.options.length > 0) {
        // Pick first option as default
        answers[q.header] = q.options[0].label;
      }
    }

    return {
      behavior: "allow",
      updatedInput: {
        questions: input.questions,
        answers,
      },
      toolUseID: input.toolUseID,
    };
  }
}

/**
 * Create a new AskUserQuestion manager.
 */
export function createAskUserQuestionManager(options?: {
  eventBus?: HookEventBus;
  answerTimeout?: number;
}): AskUserQuestionManager {
  return new AskUserQuestionManager(options);
}
