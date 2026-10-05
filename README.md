# Reactor — Chain Reaction Arena

The browser UI is a Next.js client for the Chain Reaction FastAPI backend. It supports guest and password accounts, online matchmaking, live game snapshots, move submission, reaction animations, reconnects, and match history synchronization.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The app uses the configured arena at `http://20.240.198.63:8080` by default. Set `NEXT_PUBLIC_API_URL` to another API origin and `NEXT_PUBLIC_WS_URL` to its WebSocket origin when using a different backend. The Next.js `/backend/*` rewrite avoids browser CORS for the default API origin.

The board is authoritative to the backend engine. WebSockets carry live match events; HTTP move submission and history polling provide recovery if a WebSocket event is missed.
