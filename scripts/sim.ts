// A pretend group chat for the tool, with no hub or WhatsApp.
// Usage: npm run sim
//   priya: story start       a message from Priya
//   sam: 2                   Sam reacts 2️⃣ to the latest story message (any emoji works: "sam: ❤️")
//   sam: 2 #3                Sam reacts to bot message #3 instead
//   sam: -                   Sam removes their latest reaction
//   sam: /add my-story.ink   Sam sends a local file with "story add" as its caption
//   /wait 3                  move the clock 3 minutes forward, firing any timers
//   /skip                    jump to the next timer and fire it
//   /state                   what the dashboard would see
//
// npm run sim -- --server [url] sends the events to a running server instead (default http://localhost:5049),
// so its dashboard at /?roomId=!sim:local follows along. The server's real clock runs the timers there.
import * as fs from "fs";
import path from "path";
import * as readline from "readline";
import { createStoryLoader } from "../src/download";
import { Game } from "../src/game";
import { loadStoryDir } from "../src/library";
import { sessionView, type ChatEvent, type ChatMessage } from "../src/voting";
import { VirtualClock } from "./virtualClock";

const BOT = "@storytelling:sim";
const ROOM = "!sim:local";

type Posted = ChatMessage & { number: number };

const serverFlag = process.argv.indexOf("--server");
const server = serverFlag === -1 ? null : process.argv[serverFlag + 1] ?? "http://localhost:5049";

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

// Attachments come from local files here; story load fetches real links
const loader = {
    attachment: async (mxcUrl: string) => fs.readFileSync(decodeURIComponent(mxcUrl.replace("mxc://sim/", "")), "utf8"),
    url: createStoryLoader({ hubUrl: null }).url,
};

const game = new Game(stories, { clock, loader, post: (_roomId, messages) => print(messages, " (timer)") });

// In-process, or through a running server's POST / as the hub would send it
async function handle(event: ChatEvent): Promise<ChatMessage[]> {
    if (!server) return game.handle(event, BOT);

    const reply = await fetch(server, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event, botUserId: BOT }),
    });
    const { response } = await reply.json();
    return response === undefined ? [] : Array.isArray(response) ? response : [response];
}

function asEvent(sender: string, type: string, content: Record<string, any>, extra: Partial<ChatEvent> = {}): ChatEvent {
    return { type, event_id: `$sim${++nextId}`, sender, room_id: ROOM, origin_server_ts: clock.now(), content, ...extra };
}

async function react(sender: string, key: string, number: number | null) {
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
    print(await handle(event), "");
}

async function unreact(sender: string) {
    const redacts = lastReaction.get(sender);
    if (!redacts) {
        console.log("  (no reaction to remove)");
        return;
    }
    lastReaction.delete(sender);
    print(await handle(asEvent(sender, "m.room.redaction", { redacts }, { redacts })), "");
}

async function run(line: string) {
    const [command, argument] = line.split(/\s+/);

    if (server && (command === "/wait" || command === "/skip")) {
        console.log("  (the server's own clock runs the timers: start with \"minutes 1\" and watch its terminal for timer messages)");
        return;
    }
    if (server && command === "/state") {
        const reply = await fetch(`${server.replace(/\/+$/, "")}/api/sessions?roomId=${encodeURIComponent(ROOM)}`);
        console.log(JSON.stringify((await reply.json()).session, null, 2));
        return;
    }

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

    const attachment = text.match(/^\/add\s+(.+)$/);
    if (attachment) {
        if (server) {
            console.log("  (with --server, attachments go through the hub; use \"story load <raw link>\" instead)");
            return;
        }
        const file = path.resolve(attachment[1]);
        if (!fs.existsSync(file)) {
            console.log(`  (no file at ${file})`);
            return;
        }
        const content = { msgtype: "m.file", body: "story add", filename: path.basename(file), url: `mxc://sim/${encodeURIComponent(file)}`, info: { size: fs.statSync(file).size } };
        print(await handle(asEvent(sender, "m.room.message", content)), "");
        return;
    }

    // A lone number, emoji or "-" is a reaction; anything else is a chat message
    const reaction = text.match(/^(\S+)(?:\s+#(\d+))?$/);
    if (reaction && (/^\d$/.test(reaction[1]) || /^\p{Extended_Pictographic}|⃣/u.test(reaction[1]))) {
        const key = /^\d$/.test(reaction[1]) ? `${reaction[1]}️⃣` : reaction[1];
        await react(sender, key, reaction[2] ? Number(reaction[2]) : null);
    } else if (text === "-") {
        await unreact(sender);
    } else {
        print(await handle(asEvent(sender, "m.room.message", { msgtype: "m.text", body: text })), "");
    }
}

async function main() {
    console.log("Storytelling simulator. Try \"priya: story start\", then \"sam: 2\". /wait 3 moves the clock; /skip jumps to the next timer.");
    if (server)
        console.log(`Sending events to ${server}. Dashboard: ${server.replace(/\/+$/, "")}/?roomId=${encodeURIComponent(ROOM)}`);
    process.stdout.write("> ");
    for await (const line of readline.createInterface({ input: process.stdin })) {
        if (line.trim()) {
            try {
                await run(line.trim());
            } catch (err) {
                console.log(`  (couldn't reach ${server}: ${(err as Error).message})`);
            }
        }
        process.stdout.write("> ");
    }
    process.exit(0);
}

main();
