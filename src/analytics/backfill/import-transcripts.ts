import { discoverTranscriptFiles } from "./transcript-discovery.js";
import { parseTranscriptFile } from "./transcript-parser.js";
import type { TranscriptEventSink, TranscriptImportStats } from "./types.js";

export async function importTranscriptBackfill(options: {
  sink: TranscriptEventSink;
  projectsRoot?: string;
  projectKey?: string;
  rootSessionId?: string;
}): Promise<TranscriptImportStats> {
  const files = await discoverTranscriptFiles({
    projectsRoot: options.projectsRoot,
    projectKey: options.projectKey,
    rootSessionId: options.rootSessionId,
  });

  let filesImported = 0;
  let eventsImported = 0;

  for (const descriptor of files) {
    const events = await parseTranscriptFile(descriptor);
    if (events.length === 0) {
      continue;
    }

    await options.sink.writeRawTranscriptEvents(events);
    filesImported += 1;
    eventsImported += events.length;
  }

  return {
    filesDiscovered: files.length,
    filesImported,
    eventsImported,
  };
}
