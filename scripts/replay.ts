// Plays a recorded events.jsonl back through the game, on a clock that follows the recording.
// Usage: npm run replay -- events.jsonl
import path from "path";
import { Game } from "../src/game";
import { readEventLog } from "../src/eventLog";
import { loadStoryDir } from "../src/library";
import { tally, type ChatMessage } from "../src/voting";
import { VirtualClock } from "./virtualClock";

const file = process.argv[2];
if (!file) {
    console.log("Usage: npm run replay -- <events.jsonl>");
    process.exit(1);
}

const entries = readEventLog(file);
if (entries.length === 0) {
    console.log(`${file} has no events.`);
    process.exit(0);
}

function print(label: string, messages: ChatMessage[]) {
    for (const { message, context } of messages)
        console.log(`\n  ${label}${context ? ` (beat ${context.beatId})` : ""}:\n${message.replace(/^/gm, "    ")}`);
}

// Recorded reactions name their beat as "<session id>:<n>". A replayed start reuses the next recorded session ID,
// so those reactions match the replayed beats.
let current = 0;
const used = new Set<string>();
function recordedSessionId() {
    for (const { event } of entries.slice(current + 1)) {
        const beatId = event.prevEvent?.content?.context?.beatId;
        const id = typeof beatId === "string" ? beatId.slice(0, beatId.lastIndexOf(":")) : null;
        if (id && !used.has(id)) {
            used.add(id);
            return id;
        }
    }
    return `replay${used.size + 1}`;
}

const clock = new VirtualClock(entries[0].receivedAt);
const { stories } = loadStoryDir(path.resolve(__dirname, "../stories"));
const game = new Game(stories, { clock, newId: recordedSessionId, post: (_roomId, messages) => print("Storytelling (timer)", messages) });

async function main() {
    for (const [index, { receivedAt, botUserId, event }] of entries.entries()) {
        current = index;
        // Timers that were due between recorded events fire first, as they did live
        clock.advance(Math.max(0, receivedAt - clock.now()));

        const key = event.content?.["m.relates_to"]?.key;
        const what = event.type === "m.room.message" ? JSON.stringify(event.content?.body) : event.type === "m.reaction" ? `reacted ${key} (${[...String(key)].map(char => `U+${char.codePointAt(0)!.toString(16).toUpperCase()}`).join(" ")})` : event.type;
        console.log(`\n${new Date(receivedAt).toISOString()} ${event.sender} ${what}`);

        // The replay downloads nothing: the recording keeps no file links, and story load has no loader here,
        // so a story added live can't be started in the replay
        const replies = await game.handle(event, botUserId);
        if (replies.length === 0) {
            const session = game.session(event.room_id);
            const counted = event.type !== "m.room.message" && session?.status === "voting";
            console.log(counted ? `  (no reply; votes per choice now ${JSON.stringify(tally(session))})` : "  (no reply)");
        }
        print("Storytelling", replies);
    }

    console.log("\n(end of recording)");
}

main();
