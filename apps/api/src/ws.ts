import WebSocket from "ws";
import {
  JSONRPCServer,
  JSONRPCClient,
  JSONRPCServerAndClient,
} from "json-rpc-2.0";

export class WsClient {
  readonly rpc: JSONRPCServerAndClient;
  private ws: WebSocket;
  private closedPromise: Promise<number | undefined>;
  private resolveClose!: (code?: number) => void;
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  private constructor(ws: WebSocket) {
    this.ws = ws;
    this.closedPromise = new Promise((resolve) => {
      this.resolveClose = resolve;
    });

    this.rpc = new JSONRPCServerAndClient(
      new JSONRPCServer(),
      new JSONRPCClient((request) => {
        try {
          this.ws.send(JSON.stringify(request));
          return Promise.resolve();
        } catch (error) {
          return Promise.reject(error);
        }
      })
    );

    this.ws.on("message", (data) => {
      try {
        this.rpc.receiveAndSend(JSON.parse(data.toString()));
      } catch {
        // ignore malformed
      }
    });

    this.ws.on("close", (code?: number) => {
      this.stopPing();
      this.rpc.rejectAllPendingRequests("WebSocket closed");
      this.resolveClose(code);
    });

    this.ws.on("error", () => {});

    this.startPing();
  }

  private startPing(): void {
    this.pingInterval = setInterval(async () => {
      try {
        const result = await Promise.race([
          this.rpc.request("ping", {}),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Ping timeout")), 5000)
          ),
        ]);
        if (result !== "pong") {
          console.warn("[ws] Unexpected ping response, closing");
          this.forceClose();
        }
      } catch {
        console.warn("[ws] Ping failed, closing");
        this.forceClose();
      }
    }, 10000);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  static connect(url: string): Promise<WsClient> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      let settled = false;

      ws.on("error", () => {});

      ws.once("open", () => {
        settled = true;
        resolve(new WsClient(ws));
      });

      ws.once("close", () => {
        if (!settled) {
          settled = true;
          reject(new Error(`Failed to connect to ${url}`));
        }
      });
    });
  }

  request(method: string, params?: unknown): PromiseLike<unknown> {
    return this.rpc.request(method, params);
  }

  notify(method: string, params?: unknown): void {
    try {
      this.rpc.notify(method, params);
    } catch {
      // dead connection, will be detected by ping
    }
  }

  waitClosed(): Promise<number | undefined> {
    return this.closedPromise;
  }

  private forceClose(): void {
    this.stopPing();
    try {
      this.ws.terminate();
    } catch {}
  }

  close(): void {
    this.stopPing();
    this.ws.close();
  }

  terminate(): void {
    this.stopPing();
    try {
      this.ws.terminate();
    } catch {}
  }
}
