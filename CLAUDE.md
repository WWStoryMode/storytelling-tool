# storytelling-tool

A Chat Hackers tool: a group plays a branching Ink story by voting with 1️⃣–4️⃣ reactions. Forked from `Chat-Hackers/example-tool`. The full design is in `SPEC.md`; the build plan is six phases (0 recon, 1 engine, 2 voting, 3 server + simulator, 4 real chat, 5 dashboard).

## Commands

Use Node 20 (`nvm use`, see `.nvmrc`); the system Node 14 is too old.

- `npm install`
- `npm test`: Vitest, run once (`npm run test:watch` to watch)
- `npm run dev`: compile with tsc and start the server on `PORT` (default 5049); writes `storytelling.json`, the registration file
- `npm run dev-web` / `npm run build-web`: dashboard dev server / single-file build into `web/dist/index.html`, served on `GET /`
- `npm run sim`: a pretend group chat in the terminal (`priya: story start`, `sam: 2`, `/wait 3`, `/skip`, `/state`), no hub needed
- `npm run check-story -- <file>` / `npm run play-story -- <file>`: validate / play an Ink story in the terminal; the writer's guide is `stories/README.md`
- `npm run replay -- events.jsonl`: plays a recording back through the game, showing each reaction's codepoints; record one by setting `EVENT_LOG=events.jsonl`
- Copy `.env.example` to `.env` for `PUBLIC_URL` (ngrok), `HUB_SECRET` and `HUB_URL`; the server warns at startup about any that are missing

## Rules

- The registration `id` stays `storytelling`.
- No Matrix or HTTP code inside the engine or voting modules (`src/engine.ts`, `src/validate.ts`, `src/voting.ts`, `src/format.ts`). They are pure and take time and randomness as arguments.
- Results show vote counts, never voter names, in chat and on the dashboard.
- Work one phase at a time, tests first, and commit after each phase.

## How the hub talks to the tool

- `POST /` receives `{ event, botUserId }` and replies `{ success: true, response }`, where `response` is one `{ message, context? }` or an array of them.
- For reactions and replies, the hub attaches the target message as `event.prevEvent`, including the `context` the tool sent with it (see `src/reactions.ts`). Check `prevEvent.sender === botUserId` before trusting it.
- Votes are matched to a beat by `prevEvent.content.context.beatId`, never by Matrix event IDs.
- The hub sends array responses in no fixed order. Post a vote result and the next beat as one message.
- Timer posts go through `POST {HUB_URL}/api/send?roomId=…&toolId=storytelling&secret=…` with body `{ event: { type: "m.room.message", msgtype: "m.text", body, context } }`. The `{ message }` form drops the context.
- The hub never forwards the bot's own messages, and `/api/send` returns no event ID.
- Full findings with source references are in `NOTES.md`.
