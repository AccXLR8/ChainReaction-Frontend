# Superkritical — Online Arena

The browser UI is a Next.js client for the Chain Reaction FastAPI backend. It supports Google sign-in, online matchmaking, live game snapshots, move submission, reaction animations, reconnects, and match history synchronization.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The app uses the configured arena at `https://backend.samyakshrma.space` by default. Set `NEXT_PUBLIC_API_URL` to another API origin and `NEXT_PUBLIC_WS_URL` to its WebSocket origin when using a different backend. The Next.js `/backend/*` rewrite avoids browser CORS for the default API origin.

The board is authoritative to the backend engine. WebSockets carry live match events; HTTP move submission and history polling provide recovery if a WebSocket event is missed.

## Google sign-in setup

The sign-in screen reads `NEXT_PUBLIC_GOOGLE_CLIENT_ID` and uses Google's Identity Services button. Add the OAuth web client ID to the local environment and the production deployment, then allow the local and production site origins in that Google OAuth client.

The backend exposes `POST /api/auth/google`, accepts `{ "credential": "<Google ID token>" }`, verifies the token server-side, and returns the game API session. Configure the same OAuth web client ID as `GOOGLE_CLIENT_ID` on the backend. The frontend cannot safely verify Google credentials or mint the game API token itself; Google is the only sign-in option presented by the UI.

## Player profiles

Open **Account** to load the signed-in player's profile, or search for a public profile by username. The panel reads stats and achievements from `/api/profiles/me` and `/api/profiles/achievements`; avatar choices come from `/api/profiles/avatars`. Editing sends the changed username and/or avatar ID to `PATCH /api/profiles/me`. Profile data is fetched again each time the panel opens, so completed games are reflected without refreshing after every move.

## Matchmaking cancellation

The frontend checks `/api/matchmaking/status` before cancelling and connects immediately if the server has already assigned a game. For a race-free guarantee, `POST /api/matchmaking/leave` must atomically return `{ "status": "matched", "game_id": "…" }` when assignment wins the cancellation race; otherwise it should remove the queued player and return `{ "status": "left" }`. It must preserve and return a pending assignment instead of discarding it.
