import { DEFAULT_KEYWORD_TAXONOMY } from "./taxonomy.js";
import type {
  KeywordMatch,
  KeywordMatchContext,
  KeywordRule,
  KeywordTaxonomy,
} from "./types.js";

function normalizeTimestamp(timestamp: KeywordMatchContext["timestamp"]): number | undefined {
  if (timestamp instanceof Date) {
    return timestamp.getTime();
  }

  if (typeof timestamp === "number") {
    return Number.isFinite(timestamp) ? timestamp : undefined;
  }

  if (typeof timestamp === "string") {
    const parsed = Date.parse(timestamp);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  return undefined;
}

function cloneGlobalRegex(pattern: RegExp): RegExp {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const normalizedFlags = flags.includes("u") ? flags : `${flags}u`;
  return new RegExp(pattern.source, normalizedFlags);
}

function scanRuleMatches(
  text: string,
  rule: KeywordRule,
  context: KeywordMatchContext
): KeywordMatch[] {
  const matches: KeywordMatch[] = [];
  const regex = cloneGlobalRegex(rule.pattern);
  const timestamp = normalizeTimestamp(context.timestamp);

  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const matchedText = match[0];
    if (!matchedText) {
      regex.lastIndex += 1;
      continue;
    }

    matches.push({
      ruleId: rule.id,
      category: rule.category,
      term: rule.term,
      matchedText,
      start: match.index,
      end: match.index + matchedText.length,
      severity: rule.severity,
      speaker: context.speaker,
      sessionId: context.sessionId,
      interactionId: context.interactionId,
      timestamp,
    });
  }

  return matches;
}

export function matchKeywordMentions(
  text: string,
  context: KeywordMatchContext = {},
  taxonomy: KeywordTaxonomy = DEFAULT_KEYWORD_TAXONOMY
): KeywordMatch[] {
  if (!text.trim()) {
    return [];
  }

  const allMatches = taxonomy.flatMap((rule) => scanRuleMatches(text, rule, context));
  const deduped = new Map<string, KeywordMatch>();

  for (const match of allMatches) {
    const key = `${match.ruleId}:${match.start}:${match.end}`;
    if (!deduped.has(key)) {
      deduped.set(key, match);
    }
  }

  return Array.from(deduped.values()).sort((left, right) => {
    if (left.start !== right.start) {
      return left.start - right.start;
    }

    if (left.severity !== right.severity) {
      return right.severity - left.severity;
    }

    return left.ruleId.localeCompare(right.ruleId);
  });
}
