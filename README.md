# Malam Serigala — Werewolf Online

Real-time multiplayer Werewolf/Mafia, server-authoritative, backed by Turso.
This is a **real application you deploy**, not a Claude.ai artifact — see
"Why this isn't a live artifact" below if you're wondering why.

## Architecture

```
client/   React + Vite frontend. Talks to the server only via Socket.IO.
server/   Express + Socket.IO + Turso (libSQL). Holds the ONE authoritative
          game state per room and sends each connected player a filtered
          ("redacted") view — this is what makes hidden roles actually safe
          online: the server decides what each socket is allowed to see,
          not the client.
```

One Node process serves both: Socket.IO for the realtime game, and the
built React app as static files. That means **one deployment**, not two.

### Why this isn't a live Claude.ai artifact

Two hard constraints ruled that out:
- **Credentials.** Artifact code is 100% client-side. Embedding a Turso
  token in it would expose your database to anyone who opens the artifact
  or its browser devtools.
- **Hidden roles need a server.** A database alone doesn't decide who's
  allowed to see what — something has to compute a different view per
  player and refuse to send secrets to the wrong socket. That's the whole
  job of `server/redact.js`. Artifacts can't run that kind of process.

### What's genuinely better about the online version

Going online wasn't just "same game, different wires" — a few things are
real upgrades over the offline pass-the-phone version:
- Every player reveals their own role independently on their own device —
  no more physically passing a phone around.
- Night-turn actions are submitted by the **actual player** holding that
  role, not relayed through a moderator.
- Day voting is a live, public ballot everyone can watch update — closer
  to how the social-deduction part of these games is meant to feel.
- Werewolves can now actually see their teammates' identities (the
  server tells them, since they're on the same team) without that leaking
  to anyone else — something a shared single device couldn't safely do.

## Local development

```bash
# Terminal 1 — backend (defaults to :3001)
cd server
npm install
npm run dev

# Terminal 2 — frontend (Vite dev server on :5173, proxies /socket.io to :3001)
cd client
npm install
npm run dev
```

Open `http://localhost:5173`. Without any Turso env vars set, the server
automatically uses a local SQLite file (`server/local-dev.db`) — so you can
develop and test the whole game with zero external accounts.

## Setting up Turso (for real deployment)

1. Install the Turso CLI and sign up (free tier is enough for a friend
   group): see `https://docs.turso.tech/quickstart`.
2. Create a database and grab its credentials:
   ```bash
   turso db create werewolf-online
   turso db show werewolf-online --url
   turso db tokens create werewolf-online
   ```
3. You now have a `TURSO_DATABASE_URL` (starts with `libsql://`) and a
   `TURSO_AUTH_TOKEN`. Keep the token secret — treat it like a password.

## Deploying

Pick any host that runs a persistent Node.js process with WebSocket
support (Socket.IO needs a long-lived process, not a serverless function
that spins down between requests) — Railway, Render, and Fly.io all work
well for a small project like this and have small free/cheap tiers.

General steps (same shape on most platforms):

1. Push this project to a Git repo.
2. Create a new service pointing at the repo, with a build step and a
   start step:
   - Build: `cd client && npm install && npm run build && cd ../server && npm install`
   - Start: `cd server && npm start`
3. Set these environment variables on the host (never commit them):
   - `TURSO_DATABASE_URL` — from `turso db show ... --url`
   - `TURSO_AUTH_TOKEN` — from `turso db tokens create ...`
   - `PORT` — most hosts set this for you automatically; only set it
     yourself if your host requires a specific value.
4. Deploy. Visit the URL your host gives you — that's the link you share
   with players. The room code is what they enter once inside.

If you'd rather deploy client and server separately (e.g. client on
Vercel/Netlify, server elsewhere), update `client/src/socket.js` to point
`io()` at the server's URL explicitly, and set `CLIENT_ORIGIN` server-side
to lock down CORS instead of the current `origin: '*'` (fine for a small
private game, not something to leave wide open on a public deployment you
care about).

## Running the tests

Everything here was tested before being handed to you — this isn't just
"should work," it's been run:

```bash
cd server
npm install
node test-logic.js       # 67 checks — the core game engine (reused from the offline version)
node test-redact.js      # 51 checks — the security-critical per-player redaction layer
node test-db.js          # 9 checks  — Turso/libSQL persistence (against a local SQLite file)
node test-integration.js # 46 checks — real Socket.IO clients playing a full game end-to-end
```

`test-integration.js` starts its own server on port 3901 — make sure
nothing else is using that port, or edit the `PORT`/`URL` constants at the
top of the server command and the test file to match.

## Room & identity model

There's no real user-account system — that would be overkill for a game
you run with friends. Instead:
- Creating a room makes you its **moderator** (the "Pemandu" from the
  original rules — a separate role from the 17 players, not one of them).
- Joining a room with a name adds you as a player and gives your browser
  a random token (stored in `localStorage`) that lets you resume as the
  same identity if you refresh or reconnect.
- This is fine for a trusted friend group. It is **not** designed to
  survive someone deliberately trying to cheat with server access or by
  reading network traffic — the same trust assumption any human moderator
  running a physical game already relies on.

## Design notes / assumptions

Carried over from the offline version, plus a couple of new calls made
specifically for the online model:
- Seer sees a target's **exact role**, not just "Werewolf / not Werewolf."
- A dead player's role is always revealed publicly (standard practice).
- Vote ties default to no elimination; the moderator can override and
  pick manually if your group prefers that.
- Guard blocks Werewolf attacks specifically — not Witch poison.
- Werewolves can see each other's identity; nobody else can see any
  living player's role except their own.
- Day voting is a fully open ballot (everyone sees who voted for whom,
  live) — night actions are the only genuinely secret phase.
