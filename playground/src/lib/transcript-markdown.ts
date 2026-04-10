const MARKDOWN_PATTERN = /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+\.\s|```|~~~|>\s|\[[^\]]+\]\([^)]+\))/m;
const TAGGED_PATTERN = /<([a-z][a-z0-9_-]*)>[\s\S]*?<\/\1>/i;

const INLINE_TAG_LABELS: Record<string, string> = {
  "command-name": "Command name",
  "command-message": "Command",
  "command-args": "Arguments",
  "task-id": "Task id",
  "tool-use-id": "Tool use id",
  "output-file": "Output file",
  "status": "Status",
  "summary": "Summary",
};

function cleanText(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function wrapInlineCode(value: string): string {
  const trimmed = cleanText(value);
  if (!trimmed) {
    return "";
  }

  if (!trimmed.includes("`")) {
    return `\`${trimmed}\``;
  }

  return `\`\`${trimmed}\`\``;
}

function buildLabeledLine(label: string, value: string, inline = false): string {
  const cleaned = cleanText(value);
  if (!cleaned) {
    return "";
  }

  return inline
    ? `**${label}:** ${wrapInlineCode(cleaned)}`
    : `- **${label}:** ${cleaned}`;
}

function replaceTaskNotification(markdown: string): string {
  return markdown.replace(
    /<task-notification>([\s\S]*?)<\/task-notification>/gi,
    (_match, inner: string) => {
      const lines = ["**Task notification**"];

      for (const [tag, label] of Object.entries(INLINE_TAG_LABELS)) {
        const tagMatch = inner.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"));
        const value = tagMatch?.[1];
        if (!value) {
          continue;
        }
        lines.push(buildLabeledLine(label, value));
      }

      return lines.join("\n");
    }
  );
}

function replaceCodeLikeTag(markdown: string, tag: string, label: string): string {
  return markdown.replace(
    new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "gi"),
    (_match, inner: string) => {
      const cleaned = cleanText(inner);
      if (!cleaned) {
        return "";
      }

      return `**${label}**\n\n\`\`\`text\n${cleaned}\n\`\`\``;
    }
  );
}

function replaceInlineTags(markdown: string): string {
  let next = markdown;

  for (const [tag, label] of Object.entries(INLINE_TAG_LABELS)) {
    next = next.replace(
      new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "gi"),
      (_match, inner: string) => buildLabeledLine(label, inner, true)
    );
  }

  return next;
}

function replaceGenericTags(markdown: string): string {
  return markdown.replace(
    /<([a-z][a-z0-9_-]*)>([\s\S]*?)<\/\1>/gi,
    (_match, tag: string, inner: string) => {
      const cleaned = cleanText(inner);
      if (!cleaned) {
        return "";
      }

      const label = tag
        .replace(/[_-]+/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());

      if (cleaned.includes("\n")) {
        return `**${label}**\n\n${cleaned}`;
      }

      return `**${label}:** ${cleaned}`;
    }
  );
}

export function looksLikeTranscriptMarkdown(text: string | undefined | null): boolean {
  if (!text) {
    return false;
  }

  return MARKDOWN_PATTERN.test(text) || TAGGED_PATTERN.test(text);
}

export function normalizeTranscriptMarkupToMarkdown(text: string): string {
  if (!TAGGED_PATTERN.test(text)) {
    return text;
  }

  let next = text;
  next = replaceTaskNotification(next);
  next = replaceCodeLikeTag(next, "local-command-stdout", "Local command output");
  next = replaceCodeLikeTag(next, "tool_use_error", "Tool error");
  next = replaceInlineTags(next);
  next = replaceGenericTags(next);

  return cleanText(next);
}

export function prepareTranscriptMarkdown(text: string): {
  markdown: string;
  isRich: boolean;
} {
  const normalized = normalizeTranscriptMarkupToMarkdown(text);
  return {
    markdown: normalized,
    isRich: looksLikeTranscriptMarkdown(text) || normalized !== text,
  };
}
