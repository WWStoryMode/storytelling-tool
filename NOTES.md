# Phase 0 recon: how the hub and tools work

Read on 2026-10-17 from `Chat-Hackers/tool-hub` (3933e9b), `Chat-Hackers/events-tool` (177a780) and `Chat-Hackers/example-tool` (aa74a36). Line numbers refer to those commits.

## Decision: how votes are matched to a beat

**Use message context, not event IDs.** Every beat is sent with a `context` such as `{ tool: "storytelling", beatId: "<sessionId>:<n>" }`. When someone reacts, the hub fetches the message they reacted to and attaches it as `event.prevEvent`, context included. A vote counts only when all of these hold:

- `event.prevEvent.sender === botUserId`
- `prevEvent.content.context.tool === "storytelling"`
- `prevEvent.content.context.beatId === session.beatId`

This replaces the spec's "beat event ID" question. The tool never needs a Matrix event ID for its own messages, and reactions on old beats are rejected because their `beatId` doesn't match the current one.

Evidence:
- `tool-hub/src/index.ts:265-269`: any event with `m.relates_to` (reactions and replies) gets `event.prevEvent = await getEvent(roomId, relatesTo.event_id)`.
- `tool-hub/src/index.ts:176-180`, `188-192`: a tool's `response.context` is spread into the sent message's `content.context`, alongside `moduleEvent: true` and `wrapperEvent: false`.
- `example-tool/src/reactions.ts:84-87`, `99`: example-tool already does this. It checks `prevEvent.sender !== botUserId` and reads `prevEvent.content.context.id`.

## Answers

### 1. Does `/api/send` return the sent event's ID?
**No.** It returns `{ success: true }` or `{ success: false, message }`, and doesn't even wait for Matrix (`tool-hub/src/webserver.ts:102-132`). It doesn't need to, given the decision above.

### 2. Does the hub forward the bot's own messages back to the tool?
**No.** Events from the bot are filtered out before routing: `event.sender !== userId` (`tool-hub/src/index.ts:248`).

### 3. What `/api/send` expects
- `POST {hub}/api/send?roomId=<roomId>&toolId=storytelling&secret=<secret>`. The secret goes in the query string.
- The body is either `{ message: "text" }`, which is sent as plain `m.text` with **no context**, or `{ event: { type: "m.room.message", msgtype: "m.text", body, context } }`, which is sent as is through `sendEvent`.
- **Timer-closed beats must use the `event` form**, so that they still carry `context.beatId`. Source: `tool-hub/src/webserver.ts:119-126`, `tool-hub/src/matrixClientRequests.ts:47-70`.
- The secret is checked against `secret` in our registration file (`webserver.ts:112`). The tool must also be active in the room (`webserver.ts:118`), otherwise the reply is `"module is not active in this room"`.
- events-tool builds the hub URL from `dashboard_url` (a host, `https://` added unless it contains localhost) and the secret from its own `.env` (`events-tool/src/requests.ts:1-15`). We use `HUB_URL` and `HUB_SECRET`. `roomId` should be passed through `encodeURIComponent`.

### 4. What the tool receives on `POST /`, and what it must return
- Request body: `{ event, botUserId, displayName }` (`tool-hub/src/index.ts:23-28`). The event has `type`, `event_id`, `sender`, `origin_server_ts`, `room_id` and `content`, plus `prevEvent` (when it relates to another message) and `displayname` (`tool-hub/types.ts:1-11`).
- A reaction's `content["m.relates_to"]` is `{ rel_type: "m.annotation", event_id, key }`.
- Response: `{ success: true, response }`, where `response` is one of:
  - a string
  - `{ message, context?, recipient? }`
  - an array of those objects

  An empty or missing `response` sends nothing (`index.ts:164-195`).
- **Arrays are sent with `forEach(async …)` without awaiting, so their order in the chat is not guaranteed** (`index.ts:185-193`). Send the result and the next beat as **one message**, as the spec's sample already shows. The beat's context then goes on that combined message.

### 5. Activation and which events reach the tool
- The tool receives events only from rooms where it is active (`index.ts:155-160`), and only the types in `event_types` (`index.ts:160`).
- Events from before the hub started are skipped (`index.ts:248`).
- **Activation is not "react 📖".** A member sends ⚙️, the hub lists its tools, and the member reacts ❤️ to the Storytelling line (🙏 deactivates). It can also be toggled on the hub dashboard (`index.ts:75-139`, `webserver.ts:86-100`). The hub then posts `Turning on Storytelling. <introduction>` (`index.ts:44`). The tool's emoji (📜) only appears in that list.
- The registration is read from a JSON file in the hub's `registrations/` folder, `secret` included (`index.ts:202-212`). So the organiser needs our `storytelling.json`, and **whoever holds that file has the secret**. Don't paste the secret into the shared hack day document.

### 6. Redactions (withdrawn votes)
- The hub forwards `m.room.redaction` like any other event type. It has no `m.relates_to`, so there's no `prevEvent`.
- The redacted event's ID is in `event.redacts`, or `event.content.redacts` in newer room versions.
- To withdraw a vote, the tool must store each vote's reaction `event_id`, as `votes: Map<sender, { choice, reactionEventId }>`.
- Whether the WhatsApp bridge sends a redaction when someone removes or changes a reaction still needs a live check in Phase 4.

### 7. Dashboard routing
- The hub dashboard links each tool to `/<toolId>?roomId=<roomId>` (`tool-hub/web/Dashboard.tsx:83`), and proxies `/<toolId>/*` to the tool's `url` (`webserver.ts:29-33`).
- So the dashboard is opened **per room** at `{hub}/storytelling?roomId=…`. It must call its API relative to the page, as example-tool does (`web/requests.ts:1-2`), giving `{hub}/storytelling/api/sessions?roomId=…`.
- `GET /api/sessions` should accept `roomId` and return that room's session.

### 8. Attachments (for `story add`)
Read on 2026-10-19 from `tool-hub` (ed6f045); the route is older than the recon commit.
- The hub forwards every `m.room.message` to tools that are turned on, whatever its `msgtype`, so an attached file arrives as `msgtype: "m.file"` with an `mxc://` `url`, the file name in `body` (or `filename`, when `body` is a caption) and `info.size` (`index.ts:160`).
- A reply gets `prevEvent` like a reaction does, from `m.relates_to.m.in_reply_to` (`index.ts:266-268`). Replying `story add` to someone's file attaches that file message.
- `GET {hub}/api/content?mxcUrl=mxc://…` downloads Matrix media with the hub's login (`webserver.ts:164-182`, `matrixClientRequests.ts:221-235`). It needs no secret. The tool never has a Matrix token of its own.
- The hub waits for the tool's reply with no timeout (`forwardEvent`, `index.ts:20-36`), so the tool can download and check the file before replying.
- Still to check live: whether WhatsApp lets members send a `.ink` file as a document, and where the bridge puts the file name and any caption.

## Consequences for the plan and spec

| Spec item | Change |
| --- | --- |
| "The beat event ID" section and Risks row 1 | Resolved: match on `prevEvent.content.context.beatId` |
| Risks row 2, the `/api/send` payload | Resolved: use the `event` form with context; query `roomId`, `toolId`, `secret` |
| Event handling step 4 and Phase 2 output | One combined result-plus-beat message per close, not an array |
| Session state | `beatEventId` → `beatId` (our own ID); votes store `reactionEventId` for redactions |
| Registration `introduction` | Drop "React 📖 to play stories together"; the hub prepends "Turning on Storytelling." |
| Overview "activated by reacting to its introduction" | Activated with ⚙️ then ❤️ on the tool's line, or the hub dashboard |
| `GET /api/sessions` | Takes `roomId`; the dashboard is reached through the hub proxy at `/storytelling?roomId=…` |
| Registration hand-off | Give the organiser `storytelling.json` directly, not through the shared doc |

Still to check live in Phase 4:
- whether the bridge sends redactions for removed or changed reactions
- how the bridge sends an attached `.ink` file and its caption (§8)
- the emoji codepoints from WhatsApp and Signal
- long beats
