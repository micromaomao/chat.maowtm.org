export interface ChatSocketEvent {
  id: string;
  event: string;
  data?: any;
}

export class ChatSocket {
  private socket: WebSocket | null = null;
  private controller = new AbortController();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private cursor: string | null = null;
  private delay = 1000;
  private stopped = false;

  constructor(
    private session: string,
    private credentials: () => { chatToken: string | null; adminToken: string | null },
    private onEvent: (event: ChatSocketEvent) => void,
    private onError: (error: Error | null) => void,
  ) {}

  start(): Promise<void> {
    return this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.controller.abort();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.socket?.close();
    this.socket = null;
  }

  private retry(): void {
    if (this.stopped || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(error => {
        if (this.stopped) return;
        this.onError(error);
        this.retry();
      });
    }, this.delay);
    this.delay = Math.min(this.delay * 2, 30000);
  }

  private async connect(): Promise<void> {
    const credentials = this.credentials();
    const endpoint = `/api/v1/chat-session/${encodeURIComponent(this.session)}`;
    const query = credentials.chatToken ? `?chat_token=${encodeURIComponent(credentials.chatToken)}` : "";
    const headers: Record<string, string> = {};
    if (credentials.adminToken) headers.Authorization = `Bearer ${credentials.adminToken}`;
    const response = await fetch(`${endpoint}/ws-ticket${query}`, {
      method: "POST", headers, signal: this.controller.signal,
    });
    if (!response.ok) throw new Error(await response.text());
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null || !("ticket" in body) || typeof body.ticket !== "string") {
      throw new Error("The server returned an invalid WebSocket ticket");
    }
    const ticket = body.ticket;
    if (this.stopped) return;
    const url = new URL(`${endpoint}/ws`, location.href);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("ticket", ticket);
    if (this.cursor) url.searchParams.set("after", this.cursor);
    const socket = new WebSocket(url);
    this.socket = socket;
    let lastPong = Date.now();
    let ready = false;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Timed out connecting to the chat server"));
        socket.close();
      }, 20000);
      socket.onmessage = message => {
        if (this.stopped || this.socket !== socket) return;
        if (message.data === "pong") {
          lastPong = Date.now();
          return;
        }
        try {
          const event: ChatSocketEvent = JSON.parse(message.data);
          if (!/^\d+$/.test(event.id)) throw new Error("Invalid chat event cursor");
          if (event.event === "ready") {
            clearTimeout(timeout);
            ready = true;
            this.delay = 1000;
            this.onError(null);
            this.cursor = event.id;
            resolve();
          } else if (event.event === "snapshot" || !this.cursor || BigInt(event.id) > BigInt(this.cursor)) {
            this.onEvent(event);
            this.cursor = event.id;
          }
        } catch (error) {
          this.onError(error);
          socket.close(1002, "Invalid chat event");
        }
      };
      socket.onopen = () => {
        lastPong = Date.now();
        if (this.heartbeat) clearInterval(this.heartbeat);
        this.heartbeat = setInterval(() => {
          if (Date.now() - lastPong > 90000) {
            socket.close();
          } else if (socket.readyState === WebSocket.OPEN) {
            socket.send("ping");
          }
        }, 30000);
      };
      socket.onerror = () => {
        if (!ready) reject(new Error("Unable to establish a chat WebSocket connection"));
      };
      socket.onclose = () => {
        clearTimeout(timeout);
        if (this.heartbeat) clearInterval(this.heartbeat);
        this.heartbeat = null;
        if (this.stopped || this.socket !== socket) return;
        this.socket = null;
        if (!ready) reject(new Error("Chat connection closed before initialization"));
        this.onError(new Error("Reconnecting to the chat server..."));
        this.retry();
      };
    });
  }
}
