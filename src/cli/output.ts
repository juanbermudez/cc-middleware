/**
 * Output formatting utilities for the CLI.
 * Supports human-readable tables/text and JSON output modes.
 */

import chalk from "chalk";
import Table from "cli-table3";

/** Output options controlled by global CLI flags */
export interface OutputOptions {
  json: boolean;
  verbose: boolean;
  noColor: boolean;
}

/** Print data as a formatted table */
export function printTable(
  headers: string[],
  rows: string[][],
  options: OutputOptions,
): void {
  if (options.json) {
    // For JSON mode, convert table to array of objects
    const objects = rows.map((row) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => {
        obj[h] = row[i] ?? "";
      });
      return obj;
    });
    console.log(JSON.stringify(objects, null, 2));
    return;
  }

  const table = new Table({
    head: headers.map((h) => (options.noColor ? h : chalk.bold.cyan(h))),
    style: { head: [], border: [] },
    chars: {
      top: "", "top-mid": "", "top-left": "", "top-right": "",
      bottom: "", "bottom-mid": "", "bottom-left": "", "bottom-right": "",
      left: "  ", "left-mid": "", mid: "", "mid-mid": "",
      right: "", "right-mid": "", middle: "  ",
    },
  });

  for (const row of rows) {
    table.push(row);
  }

  console.log(table.toString());
}

/** Print data as JSON */
export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

/** Print key-value pairs in a formatted block */
export function printKeyValue(
  pairs: Record<string, unknown>,
  options: OutputOptions,
): void {
  if (options.json) {
    console.log(JSON.stringify(pairs, null, 2));
    return;
  }

  const maxKeyLen = Math.max(...Object.keys(pairs).map((k) => k.length));
  for (const [key, value] of Object.entries(pairs)) {
    const label = options.noColor ? key.padEnd(maxKeyLen) : chalk.bold(key.padEnd(maxKeyLen));
    const val = typeof value === "object" ? JSON.stringify(value) : String(value ?? "");
    console.log(`  ${label}  ${val}`);
  }
}

/** Print streaming text with a label prefix */
export function printStream(label: string, text: string): void {
  const prefix = chalk.dim(`${label}  `);
  process.stdout.write(`${prefix}${text}\n`);
}

/** Print an error message */
export function printError(message: string, details?: string): void {
  console.error(chalk.red(`Error: ${message}`));
  if (details) {
    console.error(chalk.dim(details));
  }
}

/** Print a success message */
export function printSuccess(message: string): void {
  console.log(chalk.green(message));
}

/** Print a warning message */
export function printWarning(message: string): void {
  console.log(chalk.yellow(message));
}

/** Truncate a string to maxLen, adding "..." if truncated */
export function truncate(str: string, maxLen: number): string {
  if (!str) return "";
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}

/** Format a date string for table display */
export function formatDate(dateStr: string | number | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
