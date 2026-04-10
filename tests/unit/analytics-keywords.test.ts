import { describe, expect, it } from "vitest";
import { DEFAULT_KEYWORD_TAXONOMY, matchKeywordMentions } from "../../src/analytics/keywords/index.js";

describe("analytics keyword matcher", () => {
  it("matches the main keyword categories and preserves context metadata", () => {
    const timestamp = new Date("2026-04-08T12:30:00.000Z");
    const matches = matchKeywordMentions(
      "I am frustrated because this is bullshit. You are an idiot and I need this right now, shut up.",
      {
        speaker: "user",
        sessionId: "session-123",
        interactionId: "interaction-456",
        timestamp,
      }
    );

    expect(matches.map((match) => match.category)).toEqual([
      "frustration",
      "cursing",
      "insult",
      "urgency",
      "aggression",
    ]);

    expect(matches[0]).toMatchObject({
      speaker: "user",
      sessionId: "session-123",
      interactionId: "interaction-456",
      timestamp: timestamp.getTime(),
      term: "frustrated",
      matchedText: "frustrated",
      severity: 2,
    });

    expect(matches.some((match) => match.ruleId === "cursing-bullshit")).toBe(true);
    expect(matches.some((match) => match.ruleId === "insult-idiot")).toBe(true);
    expect(matches.some((match) => match.ruleId === "urgency-right-now")).toBe(true);
    expect(matches.some((match) => match.ruleId === "aggression-shut-up")).toBe(true);
  });

  it("avoids obvious false positives by using boundaries and phrase matching", () => {
    const matches = matchKeywordMentions(
      "The crapshoot was discussed in a classy way, and the assistant stayed calm."
    );

    expect(matches).toHaveLength(0);
  });

  it("matches repeated mentions and phrase-specific urgency terms", () => {
    const matches = matchKeywordMentions(
      "Please prioritize this ASAP. We need this immediately and ASAP again."
    );

    expect(matches.map((match) => match.ruleId)).toEqual([
      "urgency-prioritize",
      "urgency-asap",
      "urgency-immediately",
      "urgency-asap",
    ]);
    expect(matches.filter((match) => match.ruleId === "urgency-asap")).toHaveLength(2);
  });

  it("exposes the default taxonomy for reuse by backfill and live capture code", () => {
    expect(DEFAULT_KEYWORD_TAXONOMY.length).toBeGreaterThan(0);
    expect(new Set(DEFAULT_KEYWORD_TAXONOMY.map((rule) => rule.category))).toEqual(
      new Set(["frustration", "cursing", "insult", "aggression", "urgency"])
    );
  });
});
