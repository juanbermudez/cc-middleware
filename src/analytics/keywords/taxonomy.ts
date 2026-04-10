import type { KeywordTaxonomy } from "./types.js";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wholeWord(term: string): RegExp {
  return new RegExp(`\\b${escapeRegExp(term)}\\b`, "iu");
}

function phrase(...parts: string[]): RegExp {
  return new RegExp(`\\b${parts.map(escapeRegExp).join("\\s+")}\\b`, "iu");
}

export const DEFAULT_KEYWORD_TAXONOMY: KeywordTaxonomy = [
  {
    id: "frustration-frustrated",
    category: "frustration",
    term: "frustrated",
    pattern: /\bfrustrat(?:ed|ing|ion)?\b/iu,
    severity: 2,
  },
  {
    id: "frustration-annoyed",
    category: "frustration",
    term: "annoyed",
    pattern: /\bannoy(?:ed|ing|ance)?\b/iu,
    severity: 2,
  },
  {
    id: "frustration-fed-up",
    category: "frustration",
    term: "fed up",
    pattern: phrase("fed", "up"),
    severity: 3,
  },
  {
    id: "frustration-ridiculous",
    category: "frustration",
    term: "ridiculous",
    pattern: wholeWord("ridiculous"),
    severity: 2,
  },
  {
    id: "frustration-what-the-hell",
    category: "frustration",
    term: "what the hell",
    pattern: /\bwhat(?:'s|\s+is)?\s+the\s+hell\b/iu,
    severity: 3,
  },
  {
    id: "cursing-bullshit",
    category: "cursing",
    term: "bullshit",
    pattern: wholeWord("bullshit"),
    severity: 3,
  },
  {
    id: "cursing-fuck",
    category: "cursing",
    term: "fuck",
    pattern: /\bfuck(?:ing|er|ers|ed)?\b/iu,
    severity: 3,
  },
  {
    id: "cursing-shit",
    category: "cursing",
    term: "shit",
    pattern: /\bshit(?:ty|load|show|head|heads)?\b/iu,
    severity: 3,
  },
  {
    id: "cursing-damn",
    category: "cursing",
    term: "damn",
    pattern: /\bdamn(?:ed|it)?\b/iu,
    severity: 2,
  },
  {
    id: "cursing-crap",
    category: "cursing",
    term: "crap",
    pattern: wholeWord("crap"),
    severity: 1,
  },
  {
    id: "cursing-wtf",
    category: "cursing",
    term: "wtf",
    pattern: /\bwtf\b/iu,
    severity: 3,
  },
  {
    id: "insult-idiot",
    category: "insult",
    term: "idiot",
    pattern: wholeWord("idiot"),
    severity: 3,
  },
  {
    id: "insult-moron",
    category: "insult",
    term: "moron",
    pattern: wholeWord("moron"),
    severity: 3,
  },
  {
    id: "insult-stupid",
    category: "insult",
    term: "stupid",
    pattern: /\bstupid(?:ly)?\b/iu,
    severity: 2,
  },
  {
    id: "insult-dumb",
    category: "insult",
    term: "dumb",
    pattern: wholeWord("dumb"),
    severity: 2,
  },
  {
    id: "insult-useless",
    category: "insult",
    term: "useless",
    pattern: wholeWord("useless"),
    severity: 2,
  },
  {
    id: "insult-incompetent",
    category: "insult",
    term: "incompetent",
    pattern: wholeWord("incompetent"),
    severity: 2,
  },
  {
    id: "aggression-shut-up",
    category: "aggression",
    term: "shut up",
    pattern: phrase("shut", "up"),
    severity: 3,
  },
  {
    id: "aggression-go-away",
    category: "aggression",
    term: "go away",
    pattern: phrase("go", "away"),
    severity: 2,
  },
  {
    id: "aggression-back-off",
    category: "aggression",
    term: "back off",
    pattern: phrase("back", "off"),
    severity: 2,
  },
  {
    id: "aggression-leave-me-alone",
    category: "aggression",
    term: "leave me alone",
    pattern: phrase("leave", "me", "alone"),
    severity: 2,
  },
  {
    id: "aggression-screw-you",
    category: "aggression",
    term: "screw you",
    pattern: phrase("screw", "you"),
    severity: 3,
  },
  {
    id: "urgency-asap",
    category: "urgency",
    term: "asap",
    pattern: wholeWord("asap"),
    severity: 2,
  },
  {
    id: "urgency-immediately",
    category: "urgency",
    term: "immediately",
    pattern: wholeWord("immediately"),
    severity: 2,
  },
  {
    id: "urgency-right-now",
    category: "urgency",
    term: "right now",
    pattern: phrase("right", "now"),
    severity: 2,
  },
  {
    id: "urgency-right-away",
    category: "urgency",
    term: "right away",
    pattern: phrase("right", "away"),
    severity: 2,
  },
  {
    id: "urgency-prioritize",
    category: "urgency",
    term: "prioritize",
    pattern: /\bprioriti[sz](?:e|ed|ing|ation)\b/iu,
    severity: 2,
  },
  {
    id: "urgency-expedite",
    category: "urgency",
    term: "expedite",
    pattern: /\bexpedite(?:d|s|ing)?\b/iu,
    severity: 2,
  },
] as const;
