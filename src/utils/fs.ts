import { readFile } from "node:fs/promises";

export async function readFileSafe(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return null;
  }
}

export async function readJsonFileSafe(path: string): Promise<Record<string, unknown> | null> {
  const content = await readFileSafe(path);
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}
