/**
 * WebSocket client for real-time events from the CC-Middleware API.
 * Used by streaming commands (hooks listen, sessions stream).
 */

import WebSocket from "ws";

/** Message received from the middleware WebSocket server */
export interface WsMessage {
  type: string;
  [key: string]: unknown;
}

/** WebSocket client for the middleware */
export class MiddlewareWsClient {
  private ws: WebSocket | null = null;
  private handlers: Array<(msg: WsMessage) => void> = [];
  private closeHandlers: Array<() => void> = [];

  constructor(private wsUrl: string) {}

  /** Connect to the WebSocket server */
  async connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.on("open", () => resolve());
      this.ws.on("error", (err) => reject(err));

      this.ws.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString()) as WsMessage;
          for (const handler of this.handlers) {
            handler(msg);
          }
        } catch {
          // Ignore non-JSON messages
        }
      });

      this.ws.on("close", () => {
        for (const handler of this.closeHandlers) {
          handler();
        }
      });
    });
  }

  /** Subscribe to event types */
  subscribe(events: string[]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket not connected");
    }
    this.ws.send(JSON.stringify({ type: "subscribe", events }));
  }

  /** Register a message handler */
  onMessage(handler: (msg: WsMessage) => void): void {
    this.handlers.push(handler);
  }

  /** Register a close handler */
  onClose(handler: () => void): void {
    this.closeHandlers.push(handler);
  }

  /** Send a message */
  send(msg: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket not connected");
    }
    this.ws.send(JSON.stringify(msg));
  }

  /** Close the connection */
  close(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /** Whether the client is connected */
  get connected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}
