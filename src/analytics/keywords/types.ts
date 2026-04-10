export type KeywordCategory =
  | "frustration"
  | "cursing"
  | "insult"
  | "aggression"
  | "urgency";

export interface KeywordMatchContext {
  speaker?: string;
  sessionId?: string;
  interactionId?: string;
  timestamp?: number | string | Date;
}

export interface KeywordRule {
  id: string;
  category: KeywordCategory;
  term: string;
  pattern: RegExp;
  severity: number;
}

export interface KeywordMatch extends Omit<KeywordMatchContext, "timestamp"> {
  ruleId: string;
  category: KeywordCategory;
  term: string;
  matchedText: string;
  start: number;
  end: number;
  severity: number;
  timestamp?: number;
}

export type KeywordTaxonomy = readonly KeywordRule[];
