# storytelling-tool

A Chat Hackers tool that lets a WhatsApp or Signal group play a short branching story together, deciding each turn by voting with emoji reactions. Stories are written in [Ink](https://www.inklestudios.com/ink/) and run with `inkjs`. Forked from [example-tool](https://github.com/Chat-Hackers/example-tool). See `SPEC.md` for the design.

## Getting started

1. Use Node 20: `nvm use`
1. `npm install`
1. Copy `.env.example` to `.env` and set `PUBLIC_URL` to your ngrok URL and `HUB_SECRET`
1. `npm run dev` (this writes the registration file `storytelling.json`)
1. Paste the registration JSON into the hack day document's registration tab for the organiser to load
1. React 📖 to the tool's introduction in the group, then send `story start`

## Tests

`npm test`
