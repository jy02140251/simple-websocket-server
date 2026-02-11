# Simple WebSocket Server

Production-ready WebSocket server with rooms, heartbeat, and reconnection support.

## Features

- Room-based messaging
- Automatic heartbeat/ping-pong
- Graceful reconnection
- Message queuing
- TypeScript support
- Works with Express/Fastify
- Client SDK included

## Installation

```bash
npm install simple-websocket-server
```

## Quick Start

### Server

```typescript
import { WebSocketServer } from 'simple-websocket-server';
import express from 'express';
import { createServer } from 'http';

const app = express();
const server = createServer(app);

const wss = new WebSocketServer({
  server,
  path: '/ws',
  heartbeatInterval: 30000,
});

// Handle connections
wss.on('connection', (client) => {
  console.log('Client connected:', client.id);
  
  // Join room
  client.join('general');
  
  // Send to client
  client.send('welcome', { message: 'Hello!' });
});

// Handle messages
wss.on('message', (client, event, data) => {
  console.log(`${client.id} sent ${event}:`, data);
  
  if (event === 'chat') {
    // Broadcast to room
    wss.to('general').emit('chat', {
      from: client.id,
      message: data.message,
    });
  }
});

// Handle disconnection
wss.on('disconnect', (client, reason) => {
  console.log('Client disconnected:', client.id, reason);
});

server.listen(3000);
```

### Client

```typescript
import { WebSocketClient } from 'simple-websocket-server/client';

const client = new WebSocketClient('ws://localhost:3000/ws', {
  reconnect: true,
  reconnectInterval: 1000,
  maxReconnectAttempts: 10,
});

client.on('connect', () => {
  console.log('Connected!');
  client.send('chat', { message: 'Hello everyone!' });
});

client.on('chat', (data) => {
  console.log(`${data.from}: ${data.message}`);
});

client.on('disconnect', () => {
  console.log('Disconnected');
});

client.connect();
```

## API Reference

### Server

```typescript
const wss = new WebSocketServer({
  server: httpServer,
  path: '/ws',
  heartbeatInterval: 30000,
  maxPayload: 1024 * 1024, // 1MB
});

// Broadcast to all
wss.broadcast('event', data);

// Broadcast to room
wss.to('room-name').emit('event', data);

// Get all clients
wss.clients; // Set<Client>

// Get room clients
wss.getRoom('room-name'); // Set<Client>
```

### Client Object

```typescript
client.id;           // Unique client ID
client.send(event, data);
client.join(room);
client.leave(room);
client.rooms;        // Set<string>
client.disconnect();
```

## License

MIT