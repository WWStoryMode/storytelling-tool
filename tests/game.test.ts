import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import path from "path";
import { Game } from "../src/game";
import { loadStoryDir } from "../src/library";
import { WINDOW_MS, type ChatEvent, type ChatMessage } from "../src/voting";

const { stories } = loadStoryDir(path.resolve(__dirname, "../stories"));

const BOT = "@storytelling:hub.example";
const ROOM = "!group:hub.example";
const T0 = 1_760_000_000_000;
const LIVE = WINDOW_MS.live;

let nextId = 0;
let posted: { roomId: string; messages: ChatMessage[] }[];
let game: Game;

beforeEach(() => {
    vi.useFakeTimers({ now: T0 });
    posted = [];
    game = new Game(stories, { post: (roomId, messages) => { posted.push({ roomId, messages }); }, random: () => 0 });
});

afterEach(() => {
    vi.useRealTimers();
});

function say(sender: string, body: string, room = ROOM): ChatMessage[] {
    const event: ChatEvent = { type: "m.room.message", event_id: `$m${++nextId}`, sender, room_id: room, content: { msgtype: "m.text", body } };
    return game.handle(event, BOT);
}

// The hub attaches the reacted-to message as prevEvent, with the context the tool sent
function react(sender: string, key: string, target: ChatMessage, room = ROOM, id = `$r${++nextId}`): ChatMessage[] {
    const prevEvent: ChatEvent = {
        type: "m.room.message",
        event_id: `$bot${nextId}`,
        sender: BOT,
        room_id: room,
        content: { msgtype: "m.text", body: target.message, context: target.context, moduleEvent: true },
    };
    const event: ChatEvent = { type: "m.reaction", event_id: id, sender, room_id: room, content: { "m.relates_to": { event_id: prevEvent.event_id, key } }, prevEvent };
    return game.handle(event, BOT);
}

function only(messages: ChatMessage[]) {
    expect(messages).toHaveLength(1);
    return messages[0];
}

describe("Game commands", () => {
    it("ignores ordinary chat and the bot's own messages", () => {
        expect(say("@priya", "hello everyone")).toEqual([]);
        expect(say(BOT, "story start")).toEqual([]);
    });

    it("replies to story help with the commands and what the tool reads", () => {
        const { message } = only(say("@priya", "story help"));
        expect(message).toContain("[minutes N]");
        expect(message).toContain("[remind]");
        for (const command of ["story start", "story status", "story end", "story list", "story help"])
            expect(message).toContain(command);
        expect(message).toContain("never who");
        expect(only(say("@priya", "story")).message).toBe(message);
    });

    it("lists the stories in the library", () => {
        const { message } = only(say("@priya", "story list"));
        expect(message).toContain("the-stray: The Stray (3 decisions, 3 endings)");
        expect(message).toContain("story start <name>");
    });

    it("explains unknown commands, unknown stories and bad options", () => {
        expect(only(say("@priya", "story dance")).message).toContain("story help");
        expect(only(say("@priya", "story start dragons")).message).toBe("There's no story called \"dragons\". Send \"story list\" to see what you can play.");
        expect(only(say("@priya", "story start quorum none")).message).toContain("quorum 4");
        expect(game.session(ROOM)).toBeNull();
    });

    it("starts the first story with the options given", () => {
        const beat = only(say("@priya", "Story start the-stray slow quorum 4"));

        expect(beat.message.startsWith("THE STRAY — a story you decide together.")).toBe(true);
        expect(beat.message.endsWith("React to vote. Closes at 4 votes or in 24 hours.")).toBe(true);
        expect(beat.context).toMatchObject({ tool: "storytelling" });
        expect(game.session(ROOM)).toMatchObject({ storyId: "the-stray", mode: "slow", quorum: 4, status: "voting" });
    });

    it("closes on a custom number of minutes", () => {
        const beat = only(say("@priya", "story start minutes 5"));
        expect(beat.message.endsWith("React to vote. Closes at 3 votes or in 5 minutes.")).toBe(true);

        react("@priya", "1️⃣", beat);
        vi.advanceTimersByTime(5 * 60_000 - 1);
        expect(posted).toEqual([]);
        vi.advanceTimersByTime(1);
        expect(posted).toHaveLength(1);
    });

    it("posts reminders through the post function before the timer closes the vote", () => {
        const beat = only(say("@priya", "story start minutes 30 remind 20 10"));
        expect(beat.message.endsWith("React to vote. Closes at 3 votes or in 30 minutes.")).toBe(true);

        vi.advanceTimersByTime(10 * 60_000);
        expect(posted).toHaveLength(1);
        expect(only(posted[0].messages).message.startsWith("Reminder: 0 votes so far, 20 minutes left.")).toBe(true);

        react("@sam", "2️⃣", only(posted[0].messages));
        vi.advanceTimersByTime(10 * 60_000);
        expect(only(posted[1].messages).message.startsWith("Reminder: 1 vote so far, 10 minutes left.")).toBe(true);

        vi.advanceTimersByTime(10 * 60_000 - 1);
        expect(posted).toHaveLength(2);
        vi.advanceTimersByTime(1);
        expect(only(posted[2].messages).message.startsWith("The group chose 2️⃣")).toBe(true);
    });

    it("refuses a second story while one is running, and allows one after it ends", () => {
        say("@priya", "story start");

        expect(only(say("@sam", "story start")).message).toContain("already running");

        expect(only(say("@sam", "story end")).message).toContain("THE END");
        expect(only(say("@sam", "story start")).message.startsWith("THE STRAY")).toBe(true);
    });

    it("says when there is no story to show or end", () => {
        expect(only(say("@priya", "story status")).message).toBe("No story is running. Send \"story start\" to play one.");
        expect(only(say("@priya", "story end")).message).toBe("No story is running. Send \"story start\" to play one.");
    });

    it("reposts the current beat with the votes so far, and counts votes on the repost", () => {
        const beat = only(say("@priya", "story start"));
        react("@priya", "2️⃣", beat);
        vi.advanceTimersByTime(60_000);

        const status = only(say("@sam", "story status"));
        expect(status.message.startsWith("1 vote so far.\nRain hits the city")).toBe(true);
        expect(status.message).toContain("2️⃣ Up the fire escape to the roofs (1)");
        expect(status.message.endsWith("React to vote. Closes at 3 votes or in 2 minutes.")).toBe(true);
        expect(status.context).toEqual(beat.context);

        react("@sam", "2️⃣", status);
        expect(game.session(ROOM)?.votes).toHaveProperty("@sam");
    });

    it("ends a story early with the path so far and stops its timer", () => {
        const beat = only(say("@priya", "story start"));
        const next = only([react("@priya", "1️⃣", beat), react("@sam", "1️⃣", beat), react("@jo", "1️⃣", beat)].flat());

        const { message } = only(say("@dev", "story end"));
        expect(message).toBe([
            "Story ended early.",
            "",
            "THE END",
            "Your path: Under the bakery's back awning",
            "Boldness 1 · Trust 1",
            "3 people voted across 1 decision. Play again with: story start the-stray",
        ].join("\n"));

        expect(react("@priya", "1️⃣", next)).toEqual([]);
        vi.advanceTimersByTime(10 * LIVE);
        expect(posted).toEqual([]);
    });
});

describe("Game voting", () => {
    it("closes on quorum and replies with the result and next beat as one message", () => {
        const beat = only(say("@priya", "story start"));

        expect(react("@priya", "2️⃣", beat)).toEqual([]);
        expect(react("@sam", "2️⃣", beat)).toEqual([]);
        const next = only(react("@jo", "1️⃣", beat));

        expect(next.message.startsWith("The group chose 2️⃣ Up the fire escape to the roofs (2 of 3 votes).")).toBe(true);
        expect(next.context).not.toEqual(beat.context);
        expect(react("@dev", "1️⃣", beat)).toEqual([]);
    });

    it("closes on the timer through the post function", () => {
        const beat = only(say("@priya", "story start"));
        react("@priya", "3️⃣", beat);

        vi.advanceTimersByTime(LIVE - 1);
        expect(posted).toEqual([]);

        vi.advanceTimersByTime(1);
        expect(posted).toHaveLength(1);
        expect(posted[0].roomId).toBe(ROOM);
        expect(only(posted[0].messages).message.startsWith("The group chose 3️⃣ After the old man with the umbrella (1 of 1 vote).")).toBe(true);
    });

    it("pauses once when nobody votes, and a later vote restarts the timer", () => {
        const beat = only(say("@priya", "story start"));

        vi.advanceTimersByTime(LIVE);
        expect(posted).toHaveLength(1);
        expect(only(posted[0].messages).message).toContain("paused");

        vi.advanceTimersByTime(10 * LIVE);
        expect(posted).toHaveLength(1);

        react("@sam", "1️⃣", beat);
        vi.advanceTimersByTime(LIVE);
        expect(posted).toHaveLength(2);
        expect(only(posted[1].messages).message.startsWith("The group chose 1️⃣")).toBe(true);
    });

    it("keeps each room's story separate", () => {
        const here = only(say("@priya", "story start"));
        const there = only(say("@priya", "story start", "!other:hub.example"));

        react("@sam", "1️⃣", here);
        expect(game.session(ROOM)?.votes).toHaveProperty("@sam");
        expect(game.session("!other:hub.example")?.votes).toEqual({});

        // A beat from one room doesn't count in the other
        expect(react("@sam", "1️⃣", here, "!other:hub.example")).toEqual([]);
        expect(game.session("!other:hub.example")?.votes).toEqual({});
        expect(there.context).not.toEqual(here.context);
    });

    it("plays The Stray to an ending from chat events alone", () => {
        let beat = only(say("@priya", "story start the-stray quorum 2"));
        for (const key of ["2️⃣", "2️⃣"]) {
            react("@priya", key, beat);
            beat = only(react("@sam", key, beat));
        }
        react("@priya", "1️⃣", beat);
        const ending = only(react("@sam", "1️⃣", beat));

        expect(ending.message).toContain("THE END — \"A Territory of Your Own\"");
        expect(ending.message).toContain("2 people voted across 3 decisions.");
        expect(ending.context).toBeUndefined();
        expect(game.session(ROOM)?.status).toBe("ended");
    });
});

describe("Game adding stories", () => {
    const OTHER = "!other:hub.example";
    const LANTERN = `# title: The Lantern
-> one
=== one ===
A light in the window.
* [Knock] -> two
* [Wait] -> two
=== two ===
The door opens.
* [Enter] -> three
* [Run] -> three
=== three ===
A voice calls.
* [Answer] -> done
* [Hide] -> done
=== done ===
# ending: Home
The end.
-> END
`;

    let files: Record<string, string>;
    let downloads: string[];

    beforeEach(() => {
        files = { "mxc://matrix.example/lantern": LANTERN, "https://raw.githubusercontent.com/priya/s/main/lantern.ink": LANTERN };
        downloads = [];
        const fetchFrom = async (key: string) => {
            downloads.push(key);
            if (!(key in files)) throw new Error("HTTP 404");
            return files[key];
        };
        game = new Game(stories, {
            post: () => {},
            random: () => 0,
            loader: { attachment: fetchFrom, url: fetchFrom },
        });
    });

    const fileContent = (name: string, mxc = "mxc://matrix.example/lantern", caption?: string) =>
        ({ msgtype: "m.file", body: caption ?? name, ...(caption ? { filename: name } : {}), url: mxc, info: { mimetype: "application/octet-stream" } });

    async function send(event: ChatEvent) {
        return game.handle(event, BOT);
    }

    // Sends the file with "story add" as its caption
    function attach(name: string, mxc?: string, room = ROOM) {
        return send({ type: "m.room.message", event_id: `$f${++nextId}`, sender: "@priya", room_id: room, content: fileContent(name, mxc, "story add") });
    }

    // Replies "story add" to a file someone sent, as the hub attaches it
    function replyAdd(name: string, body = "story add") {
        const prevEvent: ChatEvent = { type: "m.room.message", event_id: `$f${++nextId}`, sender: "@sam", room_id: ROOM, content: fileContent(name) };
        return send({
            type: "m.room.message", event_id: `$m${++nextId}`, sender: "@priya", room_id: ROOM,
            content: { msgtype: "m.text", body, "m.relates_to": { "m.in_reply_to": { event_id: prevEvent.event_id } } },
            prevEvent,
        });
    }

    it("adds a story sent with story add as its caption", async () => {
        const { message } = only(await attach("Lantern.ink"));

        expect(message).toBe("Added \"The Lantern\" (3 decisions, 1 ending). Start it with: story start lantern");
        expect(downloads).toEqual(["mxc://matrix.example/lantern"]);
    });

    it("adds a story from the file a story add replies to, quoted reply or not", async () => {
        expect(only(await replyAdd("lantern.ink")).message).toContain("Added \"The Lantern\"");
        expect(only(await replyAdd("lantern.ink", "> <@sam> lantern.ink\n\nstory add")).message).toContain("Replaced \"The Lantern\"");
    });

    it("plays an added story, in that group only", async () => {
        await attach("lantern.ink");

        expect(only(say("@priya", "story list")).message).toContain("lantern: The Lantern (3 decisions, 1 ending)");
        expect(only(say("@priya", "story list", OTHER)).message).not.toContain("lantern");
        expect(only(say("@priya", "story start lantern", OTHER)).message).toContain("There's no story called \"lantern\"");

        expect(only(say("@priya", "story start lantern")).message).toContain("A light in the window.");
        expect(game.session(ROOM)?.storyId).toBe("lantern");
    });

    it("explains how to add when there's no file", async () => {
        expect(only(await send({ type: "m.room.message", event_id: "$x", sender: "@priya", room_id: ROOM, content: { msgtype: "m.text", body: "story add" } })).message)
            .toContain("Reply to a .ink file with \"story add\"");
        expect(downloads).toEqual([]);
    });

    it("only takes .ink and compiled .json files, before downloading anything", async () => {
        expect(only(await replyAdd("notes.pdf")).message).toContain("Only .ink files");
        expect(downloads).toEqual([]);
    });

    it("lists a broken story's problems with line numbers and doesn't add it", async () => {
        files["mxc://matrix.example/broken"] = "# title: Broken\nHello\n* [One] -> nowhere\n* [Two] -> END\n";
        const { message } = only(await attach("broken.ink", "mxc://matrix.example/broken"));

        expect(message).toMatch(/^"broken.ink" wasn't added:/);
        expect(message).toContain("• line 3: Divert target not found: '-> nowhere'");
        expect(only(say("@priya", "story list")).message).not.toContain("broken");
    });

    it("won't take a bundled story's name, or replace a story that's being played", async () => {
        expect(only(await attach("the-stray.ink")).message).toContain("already a story called \"the-stray\"");

        await attach("lantern.ink");
        say("@priya", "story start lantern");
        expect(only(await attach("lantern.ink")).message).toContain("\"story end\"");
        expect(downloads).toEqual(["mxc://matrix.example/lantern"]);
    });

    it("says when the file can't be downloaded", async () => {
        expect(only(await attach("lantern.ink", "mxc://matrix.example/gone")).message).toBe("Couldn't get \"lantern.ink\": HTTP 404");
    });

    it("keeps at most 10 added stories per group", async () => {
        for (let i = 1; i <= 10; i++)
            expect(only(await attach(`tale-${i}.ink`)).message).toContain("Added");

        expect(only(await attach("tale-11.ink")).message).toContain("10 stories");
        expect(only(await attach("tale-3.ink")).message).toContain("Replaced");
    });

    it("loads a story from a raw link", async () => {
        const { message } = only(await send({ type: "m.room.message", event_id: "$l", sender: "@priya", room_id: ROOM, content: { msgtype: "m.text", body: "story load https://raw.githubusercontent.com/priya/s/main/lantern.ink" } }));

        expect(message).toBe("Added \"The Lantern\" (3 decisions, 1 ending). Start it with: story start lantern");
        expect(downloads).toEqual(["https://raw.githubusercontent.com/priya/s/main/lantern.ink"]);
    });

    it("refuses a link from another site without fetching it", async () => {
        const { message } = only(await send({ type: "m.room.message", event_id: "$l", sender: "@priya", room_id: ROOM, content: { msgtype: "m.text", body: "story load https://example.com/lantern.ink" } }));

        expect(message).toContain("raw.githubusercontent.com");
        expect(downloads).toEqual([]);
    });

    it("lists added stories for the dashboard by room", async () => {
        await attach("lantern.ink");

        expect(game.library(ROOM).map(story => [story.id, story.addedHere])).toEqual([["the-stray", false], ["lantern", true]]);
        expect(game.library(OTHER).map(story => story.id)).toEqual(["the-stray"]);
    });
});
