# storytelling-tool

A Chat Hackers tool that lets a WhatsApp or Signal group play a short branching story together, deciding each turn by voting with emoji reactions. Stories are written in [Ink](https://www.inklestudios.com/ink/) and run with `inkjs`. Forked from [example-tool](https://github.com/Chat-Hackers/example-tool). See `SPEC.md` for the design.

## Getting started

1. Use Node 20: `nvm use`
1. `npm install`
1. Copy `.env.example` to `.env` and set `PUBLIC_URL` to your ngrok URL, `HUB_URL` to the hub's address from the organiser, and `HUB_SECRET` to a long random string you make up (for example `openssl rand -hex 24`); the hub learns it from `storytelling.json`
1. `npm run dev` (this writes the registration file `storytelling.json`)
1. Give `storytelling.json` to the organiser directly to load into the hub. It contains `HUB_SECRET`, so don't paste it into the shared hack day document
1. In the group, send ⚙️ and react ❤️ to Storytelling in the hub's tool list (or turn it on from the hub dashboard), then send `story start`

## Writing stories

See [`stories/README.md`](stories/README.md) for the rules a chat story follows and how to check and play one: `npm run check-story -- <file>` and `npm run play-story -- <file>`.

## Tests

`npm test`
