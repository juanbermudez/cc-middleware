import { Play, Radio, RefreshCw } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { ScrollArea } from "../components/ui/scroll-area";
import { Badge } from "../components/ui/badge";
import type { CheckResult, EventLogEntry, PlaygroundPageId } from "../lib/playground";
import { eventBadgeVariant } from "../lib/playground";
import { formatTimestamp } from "../lib/utils";
import {
  CheckBadge,
  InlineState,
  JsonPreview,
  PageBodyWithRail,
  SectionIntro,
  ToolbarPane,
} from "../components/playground-ui";

export function LiveFeedPage(props: {
  activeSection?: string;
  websocketCheck: CheckResult;
  eventLog: EventLogEntry[];
  streamPrompt: string;
  sessionEventCount: number;
  hookEventCount: number;
  teamEventCount: number;
  onStreamPromptChange: (value: string) => void;
  onRunStreamDemo: () => void;
  onSendPing: () => void;
  onReconnect: () => void;
}) {
  const page: PlaygroundPageId = "live-feed";
  const operations = [
    {
      method: "WS",
      path: "/api/v1/ws",
      detail: "Subscribe to session, hook, and team activity.",
      sectionId: "live-feed-log",
    },
    {
      method: "WS",
      path: "launch",
      detail: "Start a one-turn proof session from the WebSocket channel.",
      sectionId: "live-feed-controls",
    },
  ];
  const sections = [
    { id: "live-feed-controls", label: "Live feed controls" },
    { id: "live-feed-log", label: "Event log" },
    { id: "live-feed-notes", label: "Hook notes" },
  ];
  const exampleGroups = [
    {
      title: "Realtime",
      items: [
        {
          label: "Launch proof session",
          detail: "Start a one-turn demo session over the WebSocket channel.",
          action: props.onRunStreamDemo,
        },
        {
          label: "Ping the socket",
          detail: "Verify that the live feed is still connected.",
          action: props.onSendPing,
        },
        {
          label: "Reconnect stream",
          detail: "Force a fresh WebSocket subscription.",
          action: props.onReconnect,
        },
      ],
    },
  ];

  return (
    <section className="space-y-8">
      <SectionIntro
        eyebrow="Realtime"
        title="Live sessions, hooks, and event traffic"
        description="This is the runtime proof surface. Keep it open while you use Claude or the middleware elsewhere and the event stream will show what actually reaches the WebSocket broadcaster."
      />

      <PageBodyWithRail
        page={page}
        activeSection={props.activeSection}
        items={operations}
        exampleGroups={exampleGroups}
        sections={sections}
      >
        <div id="live-feed-controls">
          <ToolbarPane
            title="Live feed controls"
            description="Open the socket, send a test launch, and inspect the event stream without leaving the page."
          >
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
              <Input
                className="h-9"
                value={props.streamPrompt}
                onChange={(event) => props.onStreamPromptChange(event.target.value)}
                placeholder="What is 2 + 2? Reply with the answer only."
              />
              <Button onClick={props.onRunStreamDemo}>
                <Play className="h-4 w-4" />
                Run
              </Button>
              <Button variant="secondary" onClick={props.onSendPing}>
                <Radio className="h-4 w-4" />
                Ping
              </Button>
              <Button variant="outline" onClick={props.onReconnect}>
                <RefreshCw className="h-4 w-4" />
                Reconnect
              </Button>
            </div>

            <JsonPreview
              title="Feed summary"
              data={{
                websocket: props.websocketCheck.status,
                sessionEvents: props.sessionEventCount,
                hookEvents: props.hookEventCount,
                teamEvents: props.teamEventCount,
              }}
              emptyMessage="The feed summary is not available yet."
            />
          </ToolbarPane>
        </div>

        <div id="live-feed-log" className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-slate-900">Event log</div>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Latest session, hook, team, and local events from the WebSocket feed.
              </p>
            </div>
            <CheckBadge result={props.websocketCheck} />
          </div>

          <ScrollArea className="event-console h-[560px] rounded-lg">
            <div className="divide-y divide-white/8">
              {props.eventLog.map((entry) => (
                <div key={entry.id} className="space-y-2 px-4 py-4 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium text-white">{entry.title}</div>
                    <Badge
                      variant={eventBadgeVariant(entry.category)}
                      className="border-white/10 bg-white/10 text-white"
                    >
                      {entry.category}
                    </Badge>
                  </div>
                  <p className="leading-6 text-slate-300">{entry.detail}</p>
                  <div className="text-xs text-slate-500">{formatTimestamp(entry.timestamp)}</div>
                </div>
              ))}

              {props.eventLog.length === 0 ? (
                <div className="px-4 py-8 text-sm leading-6 text-slate-400">
                  No live messages yet. The socket will populate as soon as you run the stream demo or use the middleware elsewhere.
                </div>
              ) : null}
            </div>
          </ScrollArea>
        </div>

        <div id="live-feed-notes">
          <InlineState
            variant="neutral"
            title="How to verify hooks"
            detail="Leave this page open, then run a Claude workflow that sends hook traffic through the middleware. When the event bus sees it, the log will update here."
          />
        </div>
      </PageBodyWithRail>
    </section>
  );
}
