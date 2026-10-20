# storytelling-tool

A [Chat Hackers](https://github.com/Chat-Hackers) tool that lets a WhatsApp or Signal group play a short branching story together. The bot posts a scene with numbered choices, members vote by reacting 1️⃣ 2️⃣ 3️⃣ 4️⃣, and the most votes decides what happens next. At the end it posts a recap of the path the group took.

Stories are written in [Ink](https://www.inklestudios.com/ink/) and run with `inkjs`. The tool plugs into the Chat Hackers Tool Hub, which bridges the chat. Forked from [example-tool](https://github.com/Chat-Hackers/example-tool); the full design is in [`SPEC.md`](SPEC.md).

```text
Priya: story start

Storytelling: THE STRAY — a story you decide together.
Rain hits the city just after dusk. …
Where do you run?
1️⃣ Under the bakery's back awning
2️⃣ Up the fire escape to the roofs
3️⃣ After the old man with the umbrella
React to vote. Closes at 3 votes or in 3 minutes.

(Sam reacts 2️⃣, Priya reacts 2️⃣, Alex reacts 1️⃣)

Storytelling: The group chose 2️⃣ Up the fire escape to the roofs (2 of 3 votes).
Four storeys up, the rain sounds like applause. …
```

## Features

### Chat commands

| Message | What it does |
| --- | --- |
| `story start [name] [live or slow] [quorum N] [minutes N] [remind]` | Starts a story. With no name it plays The Stray. Options can go in any order |
| `story status` | Reposts the current choice with the votes so far |
| `story end` | Stops the story and posts the path so far |
| `story list` | Lists the stories you can play, including any this group added |
| `story add` | As a reply to a `.ink` file someone sent, or as the file's caption: adds that story for this group |
| `story load <link>` | Adds a story from its raw link on GitHub, a gist or Pastebin |
| `story help` or `story` | Lists these commands |

`story start` options:

- **`live`** (the default): each vote closes at 3 votes or after 3 minutes, whichever comes first.
- **`slow`**: each vote stays open for 24 hours. The first closes on the timer only. After that, a vote also closes early once half as many people as voted the first time have voted.
- **`quorum N`**: close as soon as N people have voted.
- **`minutes N`**: keep each vote open for N minutes (1 to 1440) instead of the mode's window.
- **`remind`**: repost the choice with its vote counts 60, 30, 20 and 10 minutes before it closes, even with no votes. Give your own times with `remind 30 10` (also written `remind 30,10` or `remind [30, 10]`). Reminders that would come before a choice opens are skipped.

For example, `story start last-order quorum 4 minutes 10 remind 5` plays Last Order. Each vote stays open for 10 minutes or until 4 people have voted, with a reminder 5 minutes before it closes.

### Voting

- Each person has one vote per choice. Their latest reaction counts, and removing it withdraws the vote, if the chat bridge passes removals on.
- Only 1️⃣–4️⃣ reactions on the current story message count. Reactions on older messages, other emoji and numbers above the number of choices are ignored.
- A tie is settled by a coin flip, and the result says so.
- If nobody votes before the timer runs out, the story pauses with a short note instead of nagging. The next vote reopens it.
- Results show how many people voted, never who.

### Stories

Two stories are bundled in [`stories/`](stories/):

- **The Stray** (`the-stray`): a stray cat's night in the city. 3 decisions, 3 endings, about 10 minutes live.
- **Last Order** (`last-order`): one food delivery rider's shift, pulled between the app's rating and solidarity with other riders. 4 decisions, 3 endings.

Any group can add its own from the chat with `story add` or `story load`. The story is checked against the same rules as `npm run check-story`, and the reply names any problems with their line numbers. Added stories:

- belong to the group that added them
- replace an earlier story with the same name
- are limited to 10 per group, 200 KB each
- last until the server restarts

To keep a story for every group, put it in `stories/`. See [`stories/README.md`](stories/README.md) for how to write one.

### Dashboard

A live view for a projector or second screen. It shows:
- the current scene and a vote bar for each choice
- quorum progress and a countdown to the close
- the next reminder, and the path so far
- at the end, the ending and the story's scores

It refreshes every 2 seconds, shows counts only, and works in light or dark mode. With no story running, it lists the stories you can play.

Open it from the hub's dashboard, which links to `{hub}/storytelling?roomId=…`, or locally at `http://localhost:5049/?roomId=<room>`.

### Privacy

The tool reads only `story` messages, number reactions on its own messages and the removal of those reactions. It keeps nothing else from the chat. The server log records only each event's type and room ID, never message text or who sent it. The optional event recording (`EVENT_LOG`) follows the same rule and blanks the text of any member's message that a command replies to.

## Install

You need:

- **Node 20.19 or newer.** The repo pins 20.20.2 in `.nvmrc`. Older versions fail with errors like `SyntaxError: Unexpected token '{'`.
- **[ngrok](https://ngrok.com/)**, or another way to give your machine a public https address, to connect to a real chat.
- **Access to a Chat Hackers Tool Hub**, from the organiser, to connect to a real chat.

```sh
git clone https://github.com/WWStoryMode/storytelling-tool.git
cd storytelling-tool
nvm use        # or install Node 20 another way
npm install
npm test       # optional: runs the test suite
```

## Run it without a chat

None of these need the hub or ngrok:

| Command | What it does |
| --- | --- |
| `npm run sim` | A pretend group chat in the terminal. Type `priya: story start`, `sam: 2` to vote, `sam: -` to remove a vote, `sam: /add path/to/story.ink` to add a story, `/wait 3` to move the clock 3 minutes, `/skip` to jump to the next timer, and `/state` to see what the dashboard sees |
| `npm run play-story -- stories/last-order.ink` | Plays a story on your own in the terminal, as the group would see it |
| `npm run check-story -- stories/last-order.ink` | Checks a story and prints its decisions, paths and endings |

To watch the dashboard react, run the server and the simulator together:

```sh
npm run dev                 # terminal 1
npm run sim -- --server     # terminal 2: type "priya: story start", then vote
```

Then open `http://localhost:5049/?roomId=!sim:local`. With `--server`, the server's real clock runs the timers, so start with `minutes 1` to see one close.

## Connect it to a real group

1. **Open a tunnel** in its own terminal and leave it running:
   ```sh
   ngrok http 5049
   ```
   Note the `https://….ngrok-free.app` address. It changes every time ngrok restarts, and then steps 2–4 need repeating.

2. **Create `.env`** from the example:
   ```sh
   cp .env.example .env
   ```
   Set `PUBLIC_URL` to the ngrok address, and `HUB_URL` to the hub's address from the organiser. For `HUB_SECRET`, make up a long random string, for example with `openssl rand -hex 24`.

3. **Start the server**:
   ```sh
   npm run dev
   ```
   This builds the server and dashboard, starts on port 5049, and writes the registration file `storytelling.json`. Check that the terminal shows no `Setup:` warnings.

4. **Register the tool.** Give `storytelling.json` to the organiser to load into the hub. Send it to them directly: it contains your `HUB_SECRET`, so don't paste it into a shared document.

5. **Turn it on in a group.** In the WhatsApp or Signal group, send ⚙️ and react ❤️ to Storytelling in the hub's tool list, or turn it on from the hub's dashboard. Then send `story start`.

### Configuration

All settings go in `.env` (git-ignored):

| Variable | Needed for | What it is |
| --- | --- | --- |
| `PORT` | | Port to listen on. Default `5049` |
| `PUBLIC_URL` | Any real chat | The public https address the hub calls, usually ngrok's. It goes into `storytelling.json` |
| `HUB_SECRET` | Timer closes, reminders, pause notes | A random string you choose. It goes into `storytelling.json`, and the hub checks the tool's own messages against it |
| `HUB_URL` | Timer closes, reminders, pause notes, `story add` | The hub's address. A bare host gets `https://` added |
| `EVENT_LOG` | | A file, such as `events.jsonl`, to record story events in for `npm run replay` |

The hub calls the tool for each message and reaction, and the tool replies straight away, so commands and quorum closes work with only `PUBLIC_URL` set. Messages that start with the tool itself go through the hub's `/api/send`, which needs `HUB_URL` and `HUB_SECRET`. Those are timer closes, reminders and pause notes. Without these settings, they're printed in the terminal instead.

### Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| No reply at all in the chat | The organiser hasn't loaded `storytelling.json`, the tool isn't turned on in the group, the server isn't running, or the ngrok address changed |
| Commands work, but votes never close on the timer | `HUB_URL` or `HUB_SECRET` is missing or wrong. The terminal shows `The hub didn't send the message: …`. `story status` reposts the current choice |
| `story add` says it couldn't get the file | `HUB_URL` is missing or wrong |
| `story load` says HTTP 404 | The link is wrong or the file isn't public. GitHub answers 404 for private repos |
| The dashboard says it hasn't been built | Run `npm run build-web`, or `npm run dev`, which builds it |
| A story disappeared after a restart | Stories added from the chat are kept in memory only. Add it again, or put it in `stories/` |

To see exactly what the chat sends, set `EVENT_LOG=events.jsonl`, play for a while, then run `npm run replay -- events.jsonl`. It replays the recording and shows each reaction's emoji codepoints and whether it counted.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Builds everything and starts the server |
| `npm run build` / `npm start` | Builds the server and dashboard / starts the built server |
| `npm test` / `npm run test:watch` | Runs the tests once / on every change |
| `npm run sim` | The terminal chat simulator; add `-- --server` to drive a running server |
| `npm run play-story -- <file>` / `npm run check-story -- <file>` | Plays / checks one story |
| `npm run replay -- <events.jsonl>` | Replays a recording made with `EVENT_LOG` |
| `npm run dev-web` / `npm run build-web` | Dashboard dev server / dashboard build into `web/dist/index.html` |

## Project layout

| Path | What's there |
| --- | --- |
| `src/engine.ts`, `src/validate.ts` | Runs Ink stories, and checks them against the chat rules |
| `src/voting.ts`, `src/format.ts`, `src/commands.ts` | Voting rules, chat message text, and command parsing. Pure code, with no chat or HTTP |
| `src/game.ts` | One session per group, plus the timers |
| `src/app.ts`, `src/index.ts` | HTTP routes and startup |
| `src/hub.ts`, `src/download.ts` | Posting through the hub, and downloading stories |
| `web/` | The dashboard (React, built into one HTML file) |
| `scripts/` | The simulator, story player and checker, and replay |
| `stories/` | Bundled stories and the writer's guide |
| `SPEC.md`, `NOTES.md` | The design, and findings about how the hub works |
