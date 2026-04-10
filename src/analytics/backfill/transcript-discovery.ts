import { readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { homedir } from "node:os";
import type { TranscriptFileDescriptor } from "./types.js";

function defaultProjectsRoot(): string {
  return resolve(homedir(), ".claude", "projects");
}

async function listProjectDirectories(projectsRoot: string): Promise<string[]> {
  try {
    const entries = await readdir(projectsRoot, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(projectsRoot, entry.name))
      .sort();
  } catch {
    return [];
  }
}

async function discoverProjectTranscriptFiles(
  projectDir: string,
  projectKey: string
): Promise<TranscriptFileDescriptor[]> {
  const descriptors: TranscriptFileDescriptor[] = [];

  let entries;
  try {
    entries = await readdir(projectDir, { withFileTypes: true });
  } catch {
    return descriptors;
  }

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      const sessionId = entry.name.slice(0, -".jsonl".length);
      descriptors.push({
        projectKey,
        rootSessionId: sessionId,
        sessionId,
        transcriptKind: "root",
        transcriptPath: join(projectDir, entry.name),
      });
      continue;
    }

    if (!entry.isDirectory()) {
      continue;
    }

    const rootSessionId = entry.name;
    const subagentDir = join(projectDir, rootSessionId, "subagents");

    try {
      const subagentEntries = await readdir(subagentDir, { withFileTypes: true });
      for (const subagentEntry of subagentEntries.sort((a, b) => a.name.localeCompare(b.name))) {
        if (!subagentEntry.isFile() || !subagentEntry.name.endsWith(".jsonl")) {
          continue;
        }

        const sessionId = subagentEntry.name.slice(0, -".jsonl".length);
        descriptors.push({
          projectKey,
          rootSessionId,
          sessionId,
          transcriptKind: "subagent",
          transcriptPath: join(subagentDir, subagentEntry.name),
        });
      }
    } catch {
      // Sidechain directory is optional.
    }
  }

  return descriptors;
}

export async function discoverTranscriptFiles(options?: {
  projectsRoot?: string;
  projectKey?: string;
  rootSessionId?: string;
}): Promise<TranscriptFileDescriptor[]> {
  const projectsRoot = resolve(options?.projectsRoot ?? defaultProjectsRoot());
  const projectDirs = await listProjectDirectories(projectsRoot);
  const descriptors: TranscriptFileDescriptor[] = [];

  for (const projectDir of projectDirs) {
    const projectKey = projectDir.split("/").pop();
    if (!projectKey) {
      continue;
    }
    if (options?.projectKey && options.projectKey !== projectKey) {
      continue;
    }

    descriptors.push(...(await discoverProjectTranscriptFiles(projectDir, projectKey)));
  }

  return descriptors.filter((descriptor) =>
    options?.rootSessionId ? descriptor.rootSessionId === options.rootSessionId : true
  );
}
