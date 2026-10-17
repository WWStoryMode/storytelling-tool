# storytelling-tool — Design Spec for Chat Hackers

Oct 17, 2026 · @William

## Overview

storytelling-tool (shown in the chat as Storytelling) lets a WhatsApp or Signal group play a short branching story together, deciding each turn by voting with emoji reactions. It is a Chat Hackers tool: an HTTP server registered with the Tool Hub, activated by reacting to its introduction, with a React dashboard on `GET /`.

The bot posts a story beat with two to four numbered choices. Members react with 1️⃣ 2️⃣ 3️⃣ to vote, the vote closes on a quorum or a timer, and the bot posts the next beat. A full story runs three to six decisions and ends with a recap of the path the group took.

It is the only playful tool in a set that is otherwise all utility (welcome, events, publish, Trello, emails, voice, Spacetube). It answers several hack-sheet concerns at once: collective rather than individual participation, a low-stakes way in for quiet members, and a reason for a new group to talk. On the day it fits Table A as a core tool, and its idea brief (last section) is ready for Table D.

Stories are written in Ink, an open-source narrative scripting language, and run on the server with `inkjs`. Writers never touch the tool's code.

## Links

Everything Claude Code needs to read before building is in these links. The hack day document holds the technical guide, the registration JSON tab and the project briefs.

| Resource | Link | Why it matters |
| --- | --- | --- |
| Hack day document | [Chat Hackers Hack Sheet](https://docs.google.com/document/d/1Zl9YJn-svfz8_RqmYhcVJytNOhQzNvR4kVKdZmDBbsA/edit) | Architecture, tool registration, ngrok setup, and the tab where registration JSON is pasted |
| GitHub organisation | [github.com/Chat-Hackers](https://github.com/Chat-Hackers) | All Chat Hackers repos |
| Base to fork | [example-tool](https://github.com/Chat-Hackers/example-tool) | Keyword, reaction and reply handling to build on |
| Scheduled sends | [events-tool](https://github.com/Chat-Hackers/events-tool) | How a tool posts through `/api/send` with its secret |
| The hub | [tool-hub](https://github.com/Chat-Hackers/tool-hub) | How events are routed and what `/api/send` accepts and returns |

The hack day document is a Google Doc, so Claude Code may not be able to open it without access. If it can't, export it as PDF or Markdown into the repo next to `SPEC.md`.

## The problem and who it helps

New organising groups go quiet after the first week, and a few voices dominate the rest. A vote by reaction is the lowest-effort way to take part in a chat: no typing, no opinion to defend, and everyone's vote counts the same.

| Use case | Who runs it | What the story is |
| --- | --- | --- |
| Icebreaker for a new group | Organiser, in the first week | A light, funny story that gets everyone reacting once |
| Scenario rehearsal | Campaign lead, before an action | A realistic campaign scenario: the council says no, the press calls, a meeting is cancelled |
| Volunteer onboarding | Volunteer coordinator | A story that walks through how the group works by playing it |
| Hack night or event activity | Event host, live in the room | A short story played in 15 minutes with fast votes |
| Collective storytelling | Any group | An open-ended story written by members and run as a weekly ritual |

The scenario rehearsal is the strongest pitch for Campaign Lab. A group that has argued through "the council rejects our petition, now what?" in a story has rehearsed the real conversation, and the recap shows which choices they made under pressure.

## Core loop

Every session runs the same loop: post a beat, collect votes, close the vote, advance the story, repeat until an ending, then post a recap.

1. **Start.** A member sends `story start`, or `story start <name>` to pick from the library.
2. **Beat.** The bot posts the story text and numbered choices, plus a footer saying how the vote closes.
3. **Vote.** Members react to the beat with a number emoji. One reaction per person per message is enforced by WhatsApp and Signal.
4. **Close.** The vote closes when quorum is reached or the timer runs out, whichever comes first.
5. **Result.** The bot announces the winning choice and the tally, then posts the next beat.
6. **Ending.** At an ending, the bot posts the final text and a recap of every choice the group made.

### Sample playthrough

This is how one decision looks in the chat, using the starter story.

```text
Priya: story start the-stray quorum 4

Storytelling: THE STRAY — a story you decide together.
Rain hits the city just after dusk. Your alley is flooding, and a delivery van is reversing toward your cardboard box.
Where do you run?

1️⃣ Under the bakery's back awning
2️⃣ Up the fire escape to the roofs
3️⃣ After the old man with the umbrella

React to vote. Closes at 4 votes or in 3 minutes.

[Priya reacts 2️⃣, Sam reacts 2️⃣, Jo reacts 1️⃣, Dev reacts 2️⃣]

Storytelling: The group chose 2️⃣ Up the fire escape to the roofs (3 of 4 votes).
Four storeys up, the rain sounds like applause...
```

A finished story ends with a recap like this.

```text
Storytelling: THE END — "A Territory of Your Own"
Your path: Up the fire escape to the roofs → Hiss and vanish over the wall → Stare down the fox from the park wall
Boldness 6 · Trust 0
4 people voted across 3 decisions. Play again with: story start the-stray
```

## Voting mechanics

A vote is one number-emoji reaction on the current beat, counted once per sender, with the latest reaction winning. Keying the tally by sender handles changed votes even if the bridge never sends a removal event.

| Situation | Rule |
| --- | --- |
| Valid vote | A 1️⃣–4️⃣ reaction on the current beat, within the number of choices shown |
| Other emoji, or reactions on older beats | Ignored |
| Member changes their reaction | Latest reaction from that sender replaces the earlier one |
| Member removes their reaction | If a redaction event arrives, their vote is withdrawn; otherwise it stands |
| Quorum | Vote closes as soon as N people have voted; N is set at start, default 3 |
| Timer | Vote closes when the window ends, even below quorum, if at least one vote is in |
| Tie | A random pick among the tied choices, announced as "the story flipped a coin" |
| No votes when the timer ends | Story pauses with a nudge message; the next valid vote reopens a fresh window |
| Votes arriving while a vote is closing | Ignored; the close is locked per room |
| The bot's own reactions | Ignored by sender |

Results show counts, never names: "3 of 4 votes", not "Priya, Sam and Dev chose 2". This keeps it low-stakes for quiet members, who are the people the tool most wants to reach.

Stories are capped at four choices per beat. Four number emoji are easy to tap on a phone, and more choices split a small group's vote into ties.

## Pacing modes

storytelling-tool runs at two speeds, because a story played live in a room and one played across a week are different experiences.

| Mode | Vote window | Default quorum | When to use it |
| --- | --- | --- | --- |
| Live | 3 minutes | 3 | Hack nights, workshops, the 5pm demo |
| Slow | 24 hours | Half the people who voted on the first beat | Icebreakers, weekly rituals, scenario rehearsals |

The mode is set at start: `story start the-stray slow`. Live is the default because it demos well and is the hack-day priority.

Slow mode posts the next beat at a fixed time of day rather than the moment a vote closes. A beat landing at 9am every day becomes a ritual. A beat landing at 2am because the last vote came in late is noise, which is the concern the hack sheet raises about scheduled messages.

## Story authoring with Ink

Stories are plain Ink files. Writers draft and playtest them in the free Inky editor, then upload the `.ink` or compiled `.json` on the dashboard, or paste a raw link in the chat with story load. The server runs them with `inkjs`, so any Ink feature works, but these conventions keep a story readable in a chat.

| Convention | Rule | Why |
| --- | --- | --- |
| Beat length | Up to about 700 characters of text before each set of choices | Fits one phone screen without scrolling |
| Choices per beat | 2 to 4 | Matches the number emoji and avoids split votes |
| Choice labels | Under 40 characters, written in brackets: `* [Start a petition]` | Brackets stop Ink repeating the label as story text |
| Story length | 3 to 6 decisions | About 15 minutes live, or a working week slow |
| Every path ends | Every branch reaches an ending or `-> END` | A story that stalls leaves the group stuck |

Three tags carry metadata the bot reads:

- `# title: The Stray` at the top of the file, shown when the story starts.
- `# ending: A Room of Our Own` on an ending, shown in the recap.
- `# image: <url>` on a beat, sent as an image before the text (stretch goal).

Ink variables let choices add up to an outcome instead of a single fork deciding everything. The starter story tracks `boldness` and `trust`, and the final knot routes to one of three endings based on them. The recap can also show those values, so the group sees what its choices built.

On upload, the dashboard checks the conventions and rejects stories that break the choice cap or have a dead end, with the line number. In code the run loop is short: `story.ContinueMaximally()` for the beat text, `story.currentChoices` for the options, `story.ChooseChoiceIndex(i)` to advance, and `story.state.toJson()` to save progress.

## Starter story: The Stray

The Stray is told from a stray cat's point of view: you roam a rainy city, dodge danger and meet humans, and every choice is yours. It has three decisions, nine choices and three endings, about 10 minutes in Live mode. It is apolitical on purpose, so it works as an icebreaker in any group, and its branch-and-rejoin structure keeps it quick to write while each choice still shifts the outcome through two variables.

&#91;embedded content: The Stray · 3 decisions, 9 choices, 3 endings\]

Each decision fans out to three choices and rejoins at the next beat, so the group never sees the structure, only that its choices add up.

| Decision | Choice | Boldness | Trust |
| --- | --- | --- | --- |
| 1. Shelter from the rain | Under the bakery's back awning | +1 | +1 |
| 1. Shelter from the rain | Up the fire escape to the roofs | +2 | 0 |
| 1. Shelter from the rain | After the old man with the umbrella | 0 | +2 |
| 2. The girl with the carrier | Eat the tuna, then slip away | +1 | +1 |
| 2. The girl with the carrier | Hiss and vanish over the wall | +2 | 0 |
| 2. The girl with the carrier | Let her stroke you, but don't follow | 0 | +1 |
| 3. Midnight | Stare down the fox from the park wall | +2 | 0 |
| 3. Midnight | Curl up on the old man's windowsill | 0 | +2 |
| 3. Midnight | Weave through the night market stalls | +1 | +1 |

Every ending keeps the cat free; the scores only change what kind of freedom it finds. **Everyone's Cat, Nobody's Cat** (boldness and trust both 3 or more): known and fed all along the street, owned by no one. **A Territory of Your Own** (either one at 4 or more, but not both at 3): the rooftops if boldness leads, a window always left open if trust leads. **Just Another Night** (everything else, only reachable by letting the girl stroke you and walking away): a warm car bonnet under the stars. No path ends in a carrier or a closed door. Freedom is never at stake; the group only chooses how the cat spends it.

```ink
# title: The Stray
VAR boldness = 0
VAR trust = 0

-> opening

=== opening ===
Rain hits the city just after dusk. Your alley is flooding, and a delivery van is reversing straight toward the cardboard box you slept in last night. Your whiskers twitch. Nobody tells you where to go. That is the best thing about being you.
Where do you run?
* [Under the bakery's back awning] -> bakery
* [Up the fire escape to the roofs] -> rooftops
* [After the old man with the umbrella] -> old_man

=== bakery ===
~ boldness += 1
~ trust += 1
The awning drips, but the vent by the back door breathes warm bread air. The baker spots you, pretends not to, and leaves a crust on the step.
-> stranger

=== rooftops ===
~ boldness += 2
Four storeys up, the rain sounds like applause. You can see the whole street from here: the van, the puddles, the lit windows. None of it can reach you.
-> stranger

=== old_man ===
~ trust += 2
You trot behind him, just out of reach. He stops under a bus shelter, tips his umbrella toward you, and says nothing at all. You decide you like him.
-> stranger

=== stranger ===
Next morning a girl in a yellow coat crouches in your path. {bakery: She smells of fresh bread.} {rooftops: She must have spotted you on the roofs.} {old_man: The old man is beside her, smiling.} She opens a tin of tuna and sets down a cat carrier with its door wide open.
What do you do?
* [Eat the tuna, then slip away]
    ~ boldness += 1
    ~ trust += 1
    You eat every last flake, wash your face in front of her, and stroll off before she can even reach for the carrier. She laughs.
* [Hiss and vanish over the wall]
    ~ boldness += 2
    One hiss, one leap, and you are gone. From the top of the wall you watch her close the empty carrier. You feel magnificent.
* [Let her stroke you, but don't follow]
    ~ trust += 1
    Her hand is warm and careful. You lean into it for exactly as long as you choose, then walk away. She does not follow.
- -> midnight

=== midnight ===
Midnight. A fox is hunting in the park, the night market is glowing three streets away, and the old man's window is still lit.
Where does the night take you?
* [Stare down the fox from the park wall]
    ~ boldness += 2
    -> ending
* [Curl up on the old man's windowsill]
    ~ trust += 2
    -> ending
* [Weave through the night market stalls]
    ~ boldness += 1
    ~ trust += 1
    -> ending

=== ending ===
{
    - boldness >= 3 && trust >= 3:
        -> everyones_cat
    - boldness >= 4 || trust >= 4:
        -> own_territory
    - else:
        -> just_another_night
}

=== everyones_cat ===
# ending: Everyone's Cat, Nobody's Cat
The baker calls you Crumb. The girl calls you Captain. The noodle seller calls you Boss. You answer to all of them and belong to none, and every door on the street is one you are free to walk away from.
-> END

=== own_territory ===
# ending: A Territory of Your Own
{boldness > trust: The rooftops are yours now. The foxes know it, the pigeons know it, and at night the whole city is a map only you can read.} {trust > boldness: The old man leaves his window open a crack every night. Some nights you come in. Some nights you don't. He never closes it.} Either way, you go where you please.
-> END

=== just_another_night ===
# ending: Just Another Night
You find a car bonnet still warm from its engine and stretch out under the stars. Nobody's cat, nobody's problem. Tomorrow the city will be new again, and you will choose all over again.
-> END
```

## Technical architecture

storytelling-tool is a fork of `example-tool`, which already builds its interface from keywords, reactions and replies, with the scheduled-send code borrowed from `events-tool`. It holds one game session per Matrix room and drives each session with an `inkjs` Story object.

### Registration

```ts
const moduleRegistration = {
  id: "storytelling",
  uuid: uuidv4(),
  url: process.env.PUBLIC_URL, // ngrok URL, never localhost
  emoji: "📖",
  title: "Storytelling",
  introduction: "React 📖 to play stories together. Send 'story start' to begin, then vote on each choice by reacting 1️⃣ 2️⃣ 3️⃣. The most votes decides what happens next. 'story help' lists commands.",
  description: "Branching stories the whole group plays by voting with reactions",
  secret: process.env.HUB_SECRET,
  event_types: ["m.room.message", "m.reaction", "m.room.redaction"],
};
```

The `introduction` is most of the user experience, so it names the three things a member needs: how to start, how to vote, and where help is. `m.room.redaction` is only needed for withdrawn votes and can be dropped if the hub or bridge does not forward it.

### Endpoints

| Method and path | Purpose |
| --- | --- |
| `POST /` | Receives chat events from the Tool Hub and returns messages to post |
| `GET /` | Serves the dashboard, built into one `index.html` with Vite single-file |
| `GET /api/stories` | Lists stories in the library |
| `POST /api/stories` | Uploads and validates an `.ink` or `.json` story |
| `GET /api/sessions` | Live state of every room's session, for the dashboard |

### Commands

| Message | Effect |
| --- | --- |
| `story start [name] [live or slow] [quorum N]` | Starts a session; defaults to the first story, Live, quorum 3 |
| `story status` | Reposts the current beat and its vote count |
| `story end` | Ends the session with a recap of the path so far |
| `story list` | Lists the stories in the library |
| `story help` | Lists these commands |
| `story load <url>` | Fetches a raw .ink file, compiles and checks it, and adds it to this room's library; loading the same URL again replaces it |

### Loading a story from a URL

Anyone in a group can load a story by pasting a link to its raw `.ink` file. The tool fetches it, compiles it with the inkjs compiler, checks the authoring conventions, and replies with the story's title and ID, or with the compile error and line number.

```text
Priya: story load https://gist.githubusercontent.com/.../the-stray.ink

Storytelling: Loaded "The Stray" (3 decisions, 3 endings).
Start it with: story start the-stray
```

```ts
import { Compiler } from "inkjs/full";
const json = new Compiler(source).Compile().ToJson();
```

**Where stories can live.** Any HTTPS link that returns the raw text works: a GitHub Gist, the "Raw" link of a file in a GitHub repo, or Pastebin's raw view. Google Docs and Drive share links do not work, because they return a web page. Stories must be a single file, since Ink's `INCLUDE` lines cannot be resolved from a URL.

**Reloading is the playtest loop.** Running `story load` on the same URL replaces the story, keyed by URL. A writer edits the gist, reloads, and replays it in the test group within seconds.

**Fetch limits.** The tool runs on a laptop behind ngrok, so an open fetch could be pointed at `localhost` or the home network. For the hack day, the fetch is locked down:

| Limit | Value |
| --- | --- |
| Protocol | HTTPS only |
| Allowed hosts | gist.githubusercontent.com, raw.githubusercontent.com, pastebin.com |
| File size | 200 KB maximum |
| Timeout | 5 seconds |
| Content type | Plain text only |

**Library scope.** A story loaded by URL belongs to the room that loaded it, so a campaign's private scenario never appears in other groups' `story list`. Stories bundled with the tool or uploaded on the dashboard are shared with every group.

### State model

```ts
type Session = {
  roomId: string;
  storyId: string;
  inkState: string;          // story.state.toJson()
  mode: "live" | "slow";
  quorum: number;
  beatEventId: string | null; // the beat message votes must target
  choices: string[];         // labels for the current beat
  votes: Map<string, number>; // sender -> choice index, latest wins
  path: string[];            // chosen labels, for the recap
  voters: Set<string>;       // everyone who has voted, for the recap count
  closesAt: number | null;   // ms timestamp
  status: "voting" | "closing" | "paused" | "ended";
};
const sessions = new Map<string, Session>(); // keyed by room_id
```

Sessions are written to a JSON file after every change, so a restart, which happens often with ngrok, does not lose a game in progress. The Ink state round-trips through `toJson()` and `LoadJson()`.

### Event handling

1. **`m.room.message` starting with `story`.** Parse the command. On start, load the story, call `ContinueMaximally()`, format the beat, set `status: "voting"` and start the timer.
2. **`m.reaction`.** Read `content["m.relates_to"]`. Ignore it unless `event_id` equals `beatEventId` and `key` is a number emoji within range. Set `votes[sender]`, then close the vote if quorum is reached.
3. **`m.room.redaction`.** If it removes a tracked vote reaction, delete that sender's vote.
4. **Close.** Set `status: "closing"`, tally, break ties at random, call `ChooseChoiceIndex()`, append to `path`, continue the story, and post the result and next beat together as an array of messages. At an ending, post the recap and set `status: "ended"`.

Closes triggered by a reaction can return their messages in the HTTP response. Closes triggered by the timer have no incoming event to respond to, so they post through the hub's `/api/send` with the registration secret, using the same code `events-tool` uses for reminders.

### The beat event ID

Votes must be matched to the beat they react to, so the tool needs the event ID of its own beat message. The hack sheet does not say how a tool learns this, and it decides how much of step 2 works. Check these in order before writing the vote logic:

1. **Does `/api/send` return the sent event's ID?** If so, post every beat through `/api/send` and store the ID from the response.
2. **Does the hub forward the bot's own messages back to the tool?** If so, store the ID of the next `m.room.message` from the bot account whose body starts with the story's beat marker.
3. **Fallback.** Accept number-emoji reactions on any message in the room while a vote is open. Old beats would accept stray votes, but for a hack-day demo that is acceptable.

Read how `example-tool` matches reactions to its own role messages first; it has already solved this one way or another.

## Dashboard

The dashboard on `GET /` has three views, and only the first is needed for the demo.

| View | What it shows | Hack-day priority |
| --- | --- | --- |
| Live session | The current beat, its choices, a live vote bar per choice, time left, quorum progress, and the path so far | Must have: put it on the projector during the demo |
| Story library | Uploaded stories with title, decision count and endings; an upload box for a file or URL that validates the conventions; these stories are shared with every group | Should have: the starter story can be bundled instead |
| Session history | Finished sessions with their path, ending and voter count, readable as a transcript | Stretch |

The live session view polls `GET /api/sessions` every two seconds. That is simpler than websockets and fast enough for a projector.

It shows vote counts, never voter names, matching the chat. Organisers who run a scenario rehearsal want to see which choices the group made, not who made them.

## Inclusion, consent and safety

storytelling-tool reads only what it needs: `story` commands, number-emoji reactions on its own beats, and redactions of those reactions. It never stores ordinary chat messages, and that should be said in the `story help` text.

- **No names in results.** Counts only, in the chat and on the dashboard, so voting never becomes a visible stance.
- **No penalty for silence.** Nobody is chased for not voting, and a stalled vote pauses rather than nagging.
- **One vote, one tap.** Reactions need no typing, no English fluency and no confidence to speak, which lowers the bar for the members the hack sheet worries about.
- **Low noise.** One beat message plus one result message per decision in Live mode, and one per day in Slow mode. `story end` stops a session at any point.
- **Story content.** The starter story is about a stray cat and deliberately apolitical; scenario stories written later may touch real politics. A library upload is visible to organisers on the dashboard before anyone plays it.
- **Admin control.** Anyone in a group can start a story today, as with every tool. When the Table E work on admin and moderator roles lands, `story start` is a natural candidate to restrict per group.

## Scope and hack-day plan

The hack-day goal is one complete playthrough of The Stray in a real WhatsApp group, in Live mode, with the dashboard on screen. That is about five working hours: 11:00 to 13:00 and 14:00 to 17:00.

### Must have for the 5pm demo

- [ ] Fork `example-tool`, change `id` to `storytelling`, name the repo storytelling-tool, run it behind ngrok
- [ ] Registration JSON pasted into the doc's registration tab and loaded by the organiser
- [ ] Answer the beat event ID question (Technical architecture)
- [ ] `story start` posts the opening beat from the bundled starter story
- [ ] Number-emoji reactions tallied per sender, latest wins
- [ ] Vote closes on quorum and posts the result plus next beat
- [ ] Vote closes on the timer through `/api/send`
- [ ] Ending posts the recap with path and scores
- [ ] Dashboard live session view

### Stretch

- Tie-break announcement and paused-story nudge
- `story status`, `story end`, `story list`, `story help`
- Session persistence to a JSON file
- Story upload with convention checks
- `story load` from a raw URL, with the host allowlist and per-room library
- Slow mode with a fixed daily posting time

### Later

- Session history view and transcripts
- `# image:` tags sent as images
- A small library of scenario stories written with organisers
- Admin-only `story start`, once Table E's roles work exists

### Today's schedule

| Time | Work | Done when |
| --- | --- | --- |
| 11:00 | Fork, ngrok, register | An incoming event logs in the terminal |
| 11:30 | Beat event ID question, command parsing, inkjs runs the story | The story plays through in the console |
| 12:15 | Post beats, tally reactions, close on quorum | One decision works in WhatsApp |
| 14:00 | Timer close through `/api/send` | A vote closes with no reaction trigger |
| 14:45 | Endings and recap | The full story plays to an ending |
| 15:30 | Dashboard live view | Vote bars move on screen as people react |
| 16:30 | Playtest with 3 or 4 people, rehearse the demo | Two clean runs in a row |

## Implementation and testing with Claude Code

Build in six phases, with everything that does not need WhatsApp proven locally before lunch. The real chat loop is slow to test, since every round trip goes through the bridge, the hub and a manually loaded registration.

### Setup

- Export this doc as Markdown into the repo root as `SPEC.md`, and the hack day document beside it if Claude Code cannot open the Google Doc.
- Add a `CLAUDE.md` with the run and test commands and two rules: the registration `id` stays `storytelling`, and no Matrix or HTTP code goes inside the engine or voting modules.
- Work one phase at a time in plan mode, tests first, and commit after each phase.

### Phases

| Phase | What Claude Code builds | How to test it | Done when |
| --- | --- | --- | --- |
| 0. Recon (11:00) | No code. Reads `example-tool`, `events-tool` and `tool-hub`, and reports how a tool learns its own message's event ID and what `/api/send` expects | Check its answers against the source | Both open questions in Risks have answers |
| 1. Story engine | `engine.ts` wrapping inkjs: load, current beat, choose, save and load state, recap; plus the story validator | Vitest plays all 27 paths through The Stray and checks each reaches the ending the scoring table predicts; validator tests use small broken stories | 27 of 27 paths pass |
| 2. Voting logic | A pure function `(session, event, now, random) → (session, messages)` covering tally, quorum, latest-wins, ties, pause and stray reactions | Unit tests feed fake Matrix events built from the hack sheet's sample event; time and randomness are passed in | Every row of the voting rules table has a test |
| 3. Server and simulator (by 13:00) | `POST /` wired to phases 1 and 2, the command parser, and a terminal simulator | `npm run sim`: type `priya: story start` or `sam: 2` as fake users and see what the bot would post | The Stray plays to an ending in the terminal |
| 4. Real chat (14:00) | ngrok, registration, timer closes through `/api/send`, beat event ID capture | Test WhatsApp group with two or three people; every incoming event logged to `events.jsonl` | One full playthrough in WhatsApp, including a timer close |
| 5. Dashboard (15:30) | Live session view, Vite single-file build | Watch it on a second screen during a playthrough | Vote bars update within a couple of seconds of a reaction |

Stretch features follow the same pattern: pure logic with unit tests, then a quick check in the real group.

### Testing aids

- **Simulator.** About 50 lines: read a line, turn it into a fake Matrix event, call the handler, print the response. It tests the whole game in seconds and doubles as a fallback demo.
- **Record and replay.** Events logged in phase 4 become test fixtures, so any surprise in how WhatsApp sends reactions is captured once and tested against the real shape.
- **Direct tests for risky parts.** `story load` must refuse `localhost`, `http://`, an unlisted host and a 300 KB file. Persistence is tested by starting a vote, killing the server, restarting it and checking the vote continues.

### Example phase prompt

```text
Read SPEC.md, sections "Voting mechanics" and "Technical architecture".
Build phase 2 only: a pure function in src/voting.ts. Write the Vitest tests
first, one per row of the voting rules table, then implement until they pass.
Pass time and randomness in as arguments. No HTTP or Matrix code.
```

## Risks and open questions

The biggest unknown is whether the tool can learn its own beat's event ID; everything else has a workable fallback.

| Question or risk | How to check | Fallback |
| --- | --- | --- |
| How does the tool learn its beat's event ID? | Read `example-tool` source; test `/api/send` response; log the bot's own messages | Accept votes on any message while a vote is open |
| What payload does `/api/send` expect? | Read `events-tool` and `tool-hub` source | Close votes only on quorum for the demo |
| Does the bridge send a redaction when someone changes or removes a reaction? | Change a reaction in the test group and log events | Latest reaction per sender wins; removed votes stand |
| Do number emoji arrive with the same codepoints from WhatsApp and Signal? | Log `key` from both platforms | Normalise by stripping variation selectors before matching |
| Does the hub forward reactions only after the tool is activated in a room? | Activate with 📖 in a fresh group and test | Activate before the demo |
| ngrok restarts change the URL | Keep one ngrok session running all day | Update the registration JSON and tell the organiser |
| Long beats get cut or split by WhatsApp | Post the longest beat in the test group | Trim the beat in the Ink file |
| Is a game welcome among utility tools? | Ask your table, then the room at the demo | Lead with the cat story as an icebreaker, then pitch scenario rehearsal as the next use |

## Demo script

The demo makes the audience the players: about five minutes, with the room voting from their own phones.

1. **Problem, 30 seconds.** New groups go quiet and a few voices dominate. Every Chat Hackers tool so far is utility; this one gets people talking.
2. **Setup, 30 seconds.** A QR code on screen joins the demo WhatsApp group. The dashboard live view sits beside the chat.
3. **Play, 3 minutes.** Send `story start the-stray quorum 5`. The room votes on all three decisions. Vote bars move on the projector as reactions land.
4. **Recap, 30 seconds.** Read out the ending and the path. Point at the boldness and trust scores: the room's choices built that outcome.
5. **Close, 30 seconds.** Stories are plain Ink files, so organisers can write scenario rehearsals for their own campaigns. The idea brief is in Table D.

Have a backup: a screen recording of a full playthrough from the 16:30 playtest, in case the bridge or ngrok drops during the demo.

## Table D idea brief

This is the hack sheet's "Capture each idea" template, filled in and ready to paste.

| Field | Answer |
| --- | --- |
| Idea name | storytelling-tool |
| Who it helps | Organisers of new or quiet groups; campaign leads preparing for an action; quieter members who rarely post |
| The organising problem, with a real example | A new local group goes quiet after its first week, and the same three people do all the talking. Nobody has rehearsed what to do if the council says no. |
| What someone sends or does | Sends `story start`, then reacts 1️⃣ 2️⃣ 3️⃣ to vote on each turn of a short branching story |
| What the tool should do or return | Post each story beat, count votes, close on quorum or timer, post the result and next beat, and end with a recap of the group's choices |
| Information or other services it would need | Stories written in Ink, uploaded or loaded from a raw link; the Tool Hub's `/api/send` for timed posts; nothing from outside the chat |
| What should stay under a person's control | Starting and ending a session, the pace (Live or Slow), and which stories are in the library; results show counts, never names |
| The smallest useful version | One bundled story, Live mode only, played to an ending in one group |
| Questions to explore with a builder | How a tool learns its own message's event ID; whether reaction removals reach the tool; who should be allowed to start a story |
| Names of people developing the idea | William Wong |
