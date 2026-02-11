import { WebSocket, WebSocketServer as WSServer } from 'ws';
import { Server as HttpServer } from 'http';
import { randomUUID } from 'crypto';

interface ServerOptions {
  server: HttpServer;
  path?: string;
  heartbeatInterval?: number;
  maxPayload?: number;
}

interface Client {
  id: string;
  ws: WebSocket;
  rooms: Set<string>;
  isAlive: boolean;
  send: (event: string, data: any) => void;
  join: (room: string) => void;
  leave: (room: string) => void;
  disconnect: () => void;
}

type EventHandler = (client: Client, ...args: any[]) => void;

export class WebSocketServer {
  private wss: WSServer;
  private clients = new Map<string, Client>();
  private rooms = new Map<string, Set<Client>>();
  private handlers = new Map<string, EventHandler[]>();
  private heartbeatInterval?: NodeJS.Timeout;

  constructor(options: ServerOptions) {
    this.wss = new WSServer({
      server: options.server,
      path: options.path || '/ws',
      maxPayload: options.maxPayload || 1024 * 1024,
    });

    this.wss.on('connection', (ws) => this.handleConnection(ws));

    if (options.heartbeatInterval) {
      this.startHeartbeat(options.heartbeatInterval);
    }
  }

  private handleConnection(ws: WebSocket): void {
    const client = this.createClient(ws);
    this.clients.set(client.id, client);

    ws.on('message', (data) => {
      try {
        const { event, payload } = JSON.parse(data.toString());
        this.emit('message', client, event, payload);
        
        const handlers = this.handlers.get(event);
        handlers?.forEach((h) => h(client, payload));
      } catch {
        // Invalid message format
      }
    });

    ws.on('pong', () => {
      client.isAlive = true;
    });

    ws.on('close', () => {
      this.emit('disconnect', client);
      client.rooms.forEach((room) => this.rooms.get(room)?.delete(client));
      this.clients.delete(client.id);
    });

    ws.on('error', (error) => {
      this.emit('error', client, error);
    });

    this.emit('connection', client);
  }

  private createClient(ws: WebSocket): Client {
    const client: Client = {
      id: randomUUID(),
      ws,
      rooms: new Set(),
      isAlive: true,
      send: (event: string, data: any) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ event, data }));
        }
      },
      join: (room: string) => {
        client.rooms.add(room);
        if (!this.rooms.has(room)) {
          this.rooms.set(room, new Set());
        }
        this.rooms.get(room)!.add(client);
      },
      leave: (room: string) => {
        client.rooms.delete(room);
        this.rooms.get(room)?.delete(client);
      },
      disconnect: () => {
        ws.close();
      },
    };
    return client;
  }

  private startHeartbeat(interval: number): void {
    this.heartbeatInterval = setInterval(() => {
      this.clients.forEach((client) => {
        if (!client.isAlive) {
          client.ws.terminate();
          return;
        }
        client.isAlive = false;
        client.ws.ping();
      });
    }, interval);
  }

  on(event: string, handler: EventHandler): this {
    const handlers = this.handlers.get(event) || [];
    handlers.push(handler);
    this.handlers.set(event, handlers);
    return this;
  }

  private emit(event: string, ...args: any[]): void {
    this.handlers.get(event)?.forEach((h) => h(...args));
  }

  broadcast(event: string, data: any): void {
    this.clients.forEach((client) => client.send(event, data));
  }

  to(room: string): { emit: (event: string, data: any) => void } {
    return {
      emit: (event: string, data: any) => {
        this.rooms.get(room)?.forEach((client) => client.send(event, data));
      },
    };
  }

  getRoom(room: string): Set<Client> {
    return this.rooms.get(room) || new Set();
  }

  get allClients(): Map<string, Client> {
    return this.clients;
  }

  close(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    this.wss.close();
  }
}

// Client SDK
interface ClientOptions {
  reconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export class WebSocketClient {
  private ws?: WebSocket;
  private url: string;
  private options: Required<ClientOptions>;
  private handlers = new Map<string, ((data: any) => void)[]>();
  private reconnectAttempts = 0;
  private shouldReconnect = true;

  constructor(url: string, options: ClientOptions = {}) {
    this.url = url;
    this.options = {
      reconnect: options.reconnect ?? true,
      reconnectInterval: options.reconnectInterval ?? 1000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 10,
    };
  }

  connect(): void {
    this.shouldReconnect = true;
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.emit('connect', null);
    };

    this.ws.onmessage = (event) => {
      try {
        const { event: ev, data } = JSON.parse(event.data.toString());
        this.emit(ev, data);
      } catch {
        // Invalid message
      }
    };

    this.ws.onclose = () => {
      this.emit('disconnect', null);
      this.tryReconnect();
    };

    this.ws.onerror = (error) => {
      this.emit('error', error);
    };
  }

  private tryReconnect(): void {
    if (!this.options.reconnect || !this.shouldReconnect) return;
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) return;

    this.reconnectAttempts++;
    setTimeout(() => this.connect(), this.options.reconnectInterval);
  }

  on(event: string, handler: (data: any) => void): this {
    const handlers = this.handlers.get(event) || [];
    handlers.push(handler);
    this.handlers.set(event, handlers);
    return this;
  }

  private emit(event: string, data: any): void {
    this.handlers.get(event)?.forEach((h) => h(data));
  }

  send(event: string, data: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ event, payload: data }));
    }
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.ws?.close();
  }
}

export default WebSocketServer;