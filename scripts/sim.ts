// A pretend group chat for the tool, with no hub or WhatsApp.
// Usage: npm run sim
//   priya: story start       a message from Priya
//   sam: 2                   Sam reacts 2️⃣ to the latest story message (any emoji works: "sam: ❤️")
//   sam: 2 #3                Sam reacts to bot message #3 instead
//   sam: -                   Sam removes their latest reaction
//   /wait 3                  move the clock 3 minutes forward, firing any timers
//   /skip                    jump to the next timer and fire it
//   /state                   what the dashboard would see
import path from "path";
import * as readline from "readline";
import { Game, type Clock } from "../src/game";
import { loadStoryDir } from "../src/library";
import { sessionView, type ChatEvent, type ChatMessage } from "../src/voting";

const BOT = "@storytelling:sim";
const ROOM = "!sim:local";

// Time only moves when you say so, so a 24-hour vote can close in a keystroke
class VirtualClock implements Clock {
    private time = Date.now();
    private nextHandle = 0;
    private timers: { handle: number; at: number; callback: () => void }[] = [];

    now = () => this.time;

    setTimeout = (callback: () => void, ms: number) => {
        const handle = ++this.nextHandle;
        this.timers.push({ handle, at: this.time + ms, callback });
        return handle;
    };

    clearTimeout = (handle: unknown) => {
        this.timers = this.timers.filter(timer => timer.handle !== handle);
    };

    advance(ms: number) {
        const end = this.time + ms;
        for (;;) {
            const due = this.timers.filter(timer => timer.at <= end).sort((a, b) => a.at - b.at)[0];
            if (!due) break;
            this.clearTimeout(due.handle);
            this.time = due.at;
            due.callback();
        }
        this.time = end;
    }

    skip() {
        const next = [...this.timers].sort((a, b) => a.at - b.at)[0];
        if (!next) return false;
        this.advance(next.at - this.time);
        return true;
    }
}

type Posted = ChatMessage & { number: number };

const clock = new VirtualClock();
const posted: Posted[] = [];
const lastReaction = new Map<string, string>();
let nextId = 0;

function print(messages: ChatMessage[], via: string) {
    if (messages.length === 0) {
        console.log("  (no reply)");
        return;
    }
    for (const message of messages) {
        const entry = { ...message, number: posted.length + 1 };
        posted.push(entry);
        console.log(`\n[#${entry.number}] Storytelling${via}:\n${message.message}\n`);
    }
}

const { stories, rejected } = loadStoryDir(path.resolve(__dirname, "../stories"));
rejected.forEach(({ file, problems }) => console.log(`Skipped stories/${file}: ${problems.join("; ")}`));

const game = new Game(stories, { clock, post: (_roomId, messages) => print(messages, " (timer)") });

function asEvent(sender: string, type: string, content: Record<string, any>, extra: Partial<ChatEvent> = {}): ChatEvent {
    return { type, event_id: `$sim${++nextId}`, sender, room_id: ROOM, origin_server_ts: clock.now(), content, ...extra };
}

function react(sender: string, key: string, number: number | null) {
    const target = number === null
        ? [...posted].reverse().find(message => message.context)
        : posted.find(message => message.number === number);
    if (!target) {
        console.log("  (no story message to react to)");
        return;
    }

    // The hub attaches the reacted-to message, with the context the tool sent, as prevEvent
    const prevEvent = asEvent(BOT, "m.room.message", { msgtype: "m.text", body: target.message, context: target.context, moduleEvent: true });
    const event = asEvent(sender, "m.reaction", { "m.relates_to": { rel_type: "m.annotation", event_id: prevEvent.event_id, key } }, { prevEvent });
    lastReaction.set(sender, event.event_id);
    print(game.handle(event, BOT), "");
}

function unreact(sender: string) {
    const redacts = lastReaction.get(sender);
    if (!redacts) {
        console.log("  (no reaction to remove)");
        return;
    }
    lastReaction.delete(sender);
    print(game.handle(asEvent(sender, "m.room.redaction", { redacts }, { redacts }), BOT), "");
}

function run(line: string) {
    const [command, argument] = line.split(/\s+/);

    if (command === "/wait") {
        clock.advance(Number(argument || 1) * 60_000);
        console.log(`  (clock moved ${argument || 1} minutes)`);
        return;
    }
    if (command === "/skip") {
        if (!clock.skip()) console.log("  (no timer is waiting)");
        return;
    }
    if (command === "/state") {
        const session = game.session(ROOM);
        console.log(JSON.stringify(session ? sessionView(session) : null, null, 2));
        return;
    }

    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (!match) {
        console.log("  Type \"name: message\", \"name: 2\" to vote, or /wait, /skip, /state");
        return;
    }

    const sender = `@${match[1].trim().toLowerCase()}`;
    const text = match[2].trim();

    // A lone number, emoji or "-" is a reaction; anything else is a chat message
    const reaction = text.match(/^(\S+)(?:\s+#(\d+))?$/);
    if (reaction && (/^\d$/.test(reaction[1]) || /^\p{Extended_Pictographic}|⃣/u.test(reaction[1]))) {
        const key = /^\d$/.test(reaction[1]) ? `${reaction[1]}️⃣` : reaction[1];
        react(sender, key, reaction[2] ? Number(reaction[2]) : null);
    } else if (text === "-") {
        unreact(sender);
    } else {
        print(game.handle(asEvent(sender, "m.room.message", { msgtype: "m.text", body: text }), BOT), "");
    }
}

async function main() {
    console.log("Storytelling simulator. Try \"priya: story start\", then \"sam: 2\". /wait 3 moves the clock; /skip jumps to the next timer.");
    process.stdout.write("> ");
    for await (const line of readline.createInterface({ input: process.stdin })) {
        if (line.trim()) run(line.trim());
        process.stdout.write("> ");
    }
    process.exit(0);
}

main();
