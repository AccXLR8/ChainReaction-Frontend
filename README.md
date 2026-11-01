# Superkritical — Online Arena

The browser UI is a Next.js client for the Chain Reaction FastAPI backend. It supports Google and username/password accounts, guest play, online matchmaking, live game snapshots, move submission, reaction animations, reconnects, and match history synchronization.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The app uses the configured arena at `https://backend.samyakshrma.space` by default. Set `NEXT_PUBLIC_API_URL` to another API origin and `NEXT_PUBLIC_WS_URL` to its WebSocket origin when using a different backend. The Next.js `/backend/*` rewrite avoids browser CORS for the default API origin.

The board is authoritative to the backend engine. WebSockets carry live match events; HTTP move submission and history polling provide recovery if a WebSocket event is missed.

## Sign-in setup

The sign-in screen reads `NEXT_PUBLIC_GOOGLE_CLIENT_ID` and uses Google's Identity Services button when the ID is configured. Add the OAuth web client ID to the local environment and production deployment, then allow the local and production site origins in that Google OAuth client. Username/password sign-in and registration use the backend auth routes; guests can enter matchmaking without creating an account.

The backend exposes `POST /api/auth/google`, accepts `{ "credential": "<Google ID token>" }`, verifies the token server-side, and returns the game API session. Configure the same OAuth web client ID as `GOOGLE_CLIENT_ID` on the backend. The frontend does not verify Google credentials or mint the game API token itself.

## Player profiles

Open **Account** to load the signed-in player's profile, or search for a public profile by username. The panel reads stats, achievements, nationality, and orb-skin inventory from `/api/profiles/me`; avatar choices come from `/api/profiles/avatars`. Editing sends changed profile fields to `PATCH /api/profiles/me`. Profile data is fetched again each time the panel opens, so completed games are reflected without refreshing after every move.

## Matchmaking cancellation

The frontend checks `/api/matchmaking/status` before cancelling and connects immediately if the server has already assigned a game. For a race-free guarantee, `POST /api/matchmaking/leave` must atomically return `{ "status": "matched", "game_id": "…" }` when assignment wins the cancellation race; otherwise it should remove the queued player and return `{ "status": "left" }`. It must preserve and return a pending assignment instead of discarding it.

## Source structure

The route in `app/page.tsx` stays intentionally small. Feature code lives under `features/`, organized by responsibility:

- `application/` composes the lobby and game screens and restores the signed-in session.
- `auth/` contains sign-in and registration UI; `lobby/` contains the persistent lobby header and sample board.
- `matchmaking/` contains queue API calls, queue-state orchestration, and match-selection UI.
- `game/` owns board presentation, WebSocket state, move playback, latency measurement, and orb rendering.
- `profile/`, `nationality/`, and `skins/` own account data and the related selectors and displays.
- `lib/api/` contains shared HTTP request handling and API wrappers.
- `app/styles/` contains global styles split by screen or visual system. `app/globals.css` imports them in order; later files intentionally refine earlier base styles.

Start with `features/application/HomePage.tsx` for screen composition, then follow the relevant feature hook or component. The WebSocket is authoritative for live game state; `useReactionPlayback` animates its accepted move data while `useGameRuntime` handles connection recovery and move submission.
