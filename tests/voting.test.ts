import { describe, expect, it } from "vitest";
import * as fs from "fs";
import path from "path";
import { compileInk } from "../src/validate";
import { endSession, handleEvent, handleTimer, sessionView, startSession, statusMessage, tally, WINDOW_MS, type ChatEvent, type Session } from "../src/voting";

const json = compileInk(fs.readFileSync(path.resolve(__dirname, "../stories/the-stray.ink"), "utf8")).json as string;

const BOT = "@storytelling:hub.example";
const ROOM = "!group:hub.example";
const T0 = 1_760_000_000_000;
const LIVE = WINDOW_MS.live;
const SLOW = WINDOW_MS.slow;

const env = (now = T0, random = () => 0) => ({ now, random, storyJson: json });

function begin(options: { quorum?: number; mode?: "live" | "slow" } = {}) {
    return startSession({ id: "s1", roomId: ROOM, storyId: "the-stray", storyJson: json, now: T0, ...options });
}

let nextId = 0;

// Shaped like the hub's events (tool-hub/types.ts): a reaction carries the message it targets as prevEvent
function beatMessage(beatId: string, sender = BOT, tool = "storytelling"): ChatEvent {
    return {
        type: "m.room.message",
        event_id: `$beat-${beatId}`,
        sender,
        room_id: ROOM,
        origin_server_ts: T0,
        content: { msgtype: "m.text", body: "A beat", context: { tool, beatId }, moduleEvent: true, wrapperEvent: false },
    };
}

function reaction(sender: string, key: string, target: ChatEvent | undefined, id = `$reaction-${++nextId}`, room = ROOM): ChatEvent {
    return {
        type: "m.reaction",
        event_id: id,
        sender,
        room_id: room,
        origin_server_ts: T0,
        content: { "m.relates_to": { rel_type: "m.annotation", event_id: target?.event_id ?? "$unknown", key } },
        prevEvent: target,
    };
}

function redaction(sender: string, redacts: string): ChatEvent {
    return {
        type: "m.room.redaction",
        event_id: `$redaction-${++nextId}`,
        sender,
        room_id: ROOM,
        origin_server_ts: T0,
        redacts,
        content: { redacts },
    };
}

type Options = { now?: number; random?: () => number; id?: string };

// A reaction on the session's current beat
function vote(session: Session, sender: string, key: string, options: Options = {}) {
    return handleEvent(session, reaction(sender, key, beatMessage(session.beatId), options.id), BOT, env(options.now, options.random));
}

function voteAll(session: Session, ballots: [string, string][], options: Options = {}) {
    let result: ReturnType<typeof handleEvent> = { session, messages: [] };
    for (const [sender, key] of ballots)
        result = vote(result.session, sender, key, options);
    return result;
}

const unchanged = (result: ReturnType<typeof handleEvent>, session: Session) => {
    expect(result.session).toBe(session);
    expect(result.messages).toEqual([]);
};

describe("startSession", () => {
    it("posts the opening beat with numbered choices and how the vote closes", () => {
        const { session, messages } = begin({ quorum: 4 });

        expect(messages).toHaveLength(1);
        const { message, context } = messages[0];
        expect(message.startsWith("THE STRAY — a story you decide together.\nRain hits the city just after dusk.")).toBe(true);
        expect(message.endsWith([
            "Where do you run?",
            "",
            "1️⃣ Under the bakery's back awning",
            "2️⃣ Up the fire escape to the roofs",
            "3️⃣ After the old man with the umbrella",
            "",
            "React to vote. Closes at 4 votes or in 3 minutes.",
        ].join("\n"))).toBe(true);
        expect(context).toEqual({ tool: "storytelling", beatId: "s1:1" });

        expect(session.status).toBe("voting");
        expect(session.beatId).toBe("s1:1");
        expect(session.choices).toHaveLength(3);
        expect(session.closesAt).toBe(T0 + LIVE);
        expect(session.title).toBe("The Stray");
    });

    it("defaults to Live mode with a quorum of 3", () => {
        const { session, messages } = begin();

        expect(session.mode).toBe("live");
        expect(session.quorum).toBe(3);
        expect(messages[0].message.endsWith("React to vote. Closes at 3 votes or in 3 minutes.")).toBe(true);
    });

    it("rejects a quorum that is not a positive whole number", () => {
        expect(() => begin({ quorum: 0 })).toThrow(RangeError);
        expect(() => begin({ quorum: 1.5 })).toThrow(RangeError);
    });
});

// One test per row of SPEC.md's voting rules table, plus the edges around each
describe("voting rules", () => {
    it("counts a 1️⃣–4️⃣ reaction on the current beat", () => {
        const { session } = begin();
        const result = vote(session, "@priya", "2️⃣", { id: "$priya-2" });

        expect(result.messages).toEqual([]);
        expect(result.session.votes).toEqual({ "@priya": { choice: 1, reactionEventId: "$priya-2" } });
        expect(tally(result.session)).toEqual([0, 1, 0]);
    });

    it("accepts number emoji with or without the variation selector", () => {
        const { session } = begin();
        const result = voteAll(session, [["@priya", "2⃣"], ["@sam", "3️⃣"]]);

        expect(tally(result.session)).toEqual([0, 1, 1]);
    });

    it("ignores a number beyond the choices shown", () => {
        const { session } = begin();
        unchanged(vote(session, "@priya", "4️⃣"), session);
    });

    it("ignores other emoji", () => {
        const { session } = begin();
        for (const key of ["❤️", "👍", "5️⃣", "0️⃣", "2", "🔟"])
            unchanged(vote(session, "@priya", key), session);
    });

    it("ignores reactions on older beats", () => {
        const { session } = voteAll(begin().session, [["@priya", "1️⃣"], ["@sam", "1️⃣"], ["@jo", "1️⃣"]]);
        expect(session.beatId).toBe("s1:2");

        const stale = reaction("@dev", "2️⃣", beatMessage("s1:1"));
        unchanged(handleEvent(session, stale, BOT, env()), session);
    });

    it("ignores reactions on messages the bot didn't send, other tools' messages, or another room", () => {
        const { session } = begin();
        const noContext = { ...beatMessage("s1:1"), content: { msgtype: "m.text", body: "Hello" } };
        const targets = [beatMessage("s1:1", "@priya"), beatMessage("s1:1", BOT, "events"), noContext, undefined];

        for (const target of targets)
            unchanged(handleEvent(session, reaction("@sam", "1️⃣", target), BOT, env()), session);

        const elsewhere = reaction("@sam", "1️⃣", beatMessage("s1:1"), undefined, "!other:hub.example");
        unchanged(handleEvent(session, elsewhere, BOT, env()), session);
    });

    it("replaces a member's earlier vote with their latest", () => {
        const { session } = begin();
        const first = vote(session, "@priya", "1️⃣");
        const second = vote(first.session, "@priya", "3️⃣", { id: "$priya-3" });

        expect(second.session.votes).toEqual({ "@priya": { choice: 2, reactionEventId: "$priya-3" } });
        expect(tally(second.session)).toEqual([0, 0, 1]);
    });

    it("withdraws a vote when its reaction is redacted", () => {
        const { session } = voteAll(begin().session, [["@sam", "1️⃣"]]);
        const voted = vote(session, "@priya", "2️⃣", { id: "$priya-2" }).session;

        const result = handleEvent(voted, redaction("@priya", "$priya-2"), BOT, env());

        expect(result.messages).toEqual([]);
        expect(Object.keys(result.session.votes)).toEqual(["@sam"]);
    });

    it("keeps a changed vote when the old reaction's redaction arrives after the new one", () => {
        const { session } = begin();
        const first = vote(session, "@priya", "1️⃣", { id: "$priya-1" });
        const second = vote(first.session, "@priya", "2️⃣", { id: "$priya-2" });

        const result = handleEvent(second.session, redaction("@priya", "$priya-1"), BOT, env());

        unchanged(result, second.session);
    });

    it("ignores redactions of reactions it isn't tracking", () => {
        const { session } = voteAll(begin().session, [["@priya", "1️⃣"]]);
        unchanged(handleEvent(session, redaction("@sam", "$something-else"), BOT, env()), session);
    });

    it("closes as soon as the quorum votes, posting the result and the next beat as one message", () => {
        const now = T0 + 30_000;
        const { session, messages } = voteAll(begin().session, [["@priya", "2️⃣"], ["@sam", "2️⃣"], ["@jo", "1️⃣"]], { now });

        expect(messages).toHaveLength(1);
        const { message, context } = messages[0];
        expect(message.startsWith("The group chose 2️⃣ Up the fire escape to the roofs (2 of 3 votes).\nFour storeys up, the rain sounds like applause.")).toBe(true);
        expect(message).toContain("\n\n1️⃣ Eat the tuna, then slip away\n2️⃣ Hiss and vanish over the wall\n3️⃣ Let her stroke you, but don't follow\n\n");
        expect(context).toEqual({ tool: "storytelling", beatId: "s1:2" });

        expect(session.status).toBe("voting");
        expect(session.beatId).toBe("s1:2");
        expect(session.votes).toEqual({});
        expect(session.path).toEqual(["Up the fire escape to the roofs"]);
        expect(session.closesAt).toBe(now + LIVE);
    });

    it("closes on the timer below quorum when at least one vote is in", () => {
        const { session } = vote(begin().session, "@priya", "3️⃣");
        const { session: next, messages } = handleTimer(session, env(T0 + LIVE));

        expect(messages).toHaveLength(1);
        expect(messages[0].message.startsWith("The group chose 3️⃣ After the old man with the umbrella (1 of 1 vote).")).toBe(true);
        expect(next.beatId).toBe("s1:2");
    });

    it("does nothing when the timer fires before the window ends", () => {
        const { session } = vote(begin().session, "@priya", "3️⃣");
        unchanged(handleTimer(session, env(T0 + LIVE - 1)), session);
    });

    it("breaks a tie at random and says the story flipped a coin", () => {
        const { session } = voteAll(begin().session, [["@priya", "1️⃣"], ["@sam", "2️⃣"]]);

        const low = handleTimer(session, env(T0 + LIVE, () => 0));
        expect(low.messages[0].message.startsWith("It was a tie, so the story flipped a coin: 1️⃣ Under the bakery's back awning (1 of 2 votes).")).toBe(true);
        expect(low.session.path).toEqual(["Under the bakery's back awning"]);

        const high = handleTimer(session, env(T0 + LIVE, () => 0.99));
        expect(high.messages[0].message.startsWith("It was a tie, so the story flipped a coin: 2️⃣ Up the fire escape to the roofs (1 of 2 votes).")).toBe(true);
    });

    it("pauses with a nudge when the timer ends with no votes, and the next vote reopens a fresh window", () => {
        const { session } = begin();
        const paused = handleTimer(session, env(T0 + LIVE));

        expect(paused.session.status).toBe("paused");
        expect(paused.session.closesAt).toBeNull();
        expect(paused.messages).toHaveLength(1);
        expect(paused.messages[0].message).toBe("Nobody has voted yet, so the story is paused. React to the beat above whenever you're ready, and the vote reopens for 3 minutes.");
        expect(paused.messages[0].context).toEqual({ tool: "storytelling", beatId: "s1:1" });

        unchanged(handleTimer(paused.session, env(T0 + 10 * LIVE)), paused.session);

        const later = T0 + 60 * 60_000;
        const reopened = vote(paused.session, "@priya", "2️⃣", { now: later });

        expect(reopened.messages).toEqual([]);
        expect(reopened.session.status).toBe("voting");
        expect(reopened.session.closesAt).toBe(later + LIVE);
        expect(tally(reopened.session)).toEqual([0, 1, 0]);
    });

    it("ignores votes and timers while a close is in progress", () => {
        const { session } = vote(begin().session, "@priya", "1️⃣");
        const closing: Session = { ...session, status: "closing" };

        unchanged(vote(closing, "@sam", "2️⃣"), closing);
        unchanged(handleTimer(closing, env(T0 + LIVE)), closing);
    });

    it("ignores the bot's own reactions", () => {
        const { session } = begin();
        unchanged(vote(session, BOT, "1️⃣"), session);
    });
});

describe("a full playthrough", () => {
    const players = ["@priya", "@sam", "@jo", "@dev"];

    function playToEnd() {
        let { session } = begin({ quorum: 4 });
        const rounds: string[][] = [["2️⃣", "2️⃣", "1️⃣", "2️⃣"], ["2️⃣", "1️⃣", "2️⃣", "2️⃣"], ["1️⃣", "1️⃣", "3️⃣", "1️⃣"]];
        const posted: string[] = [];

        for (const round of rounds) {
            const result = voteAll(session, round.map((key, index) => [players[index], key]));
            posted.push(...result.messages.map(message => message.message));
            session = result.session;
        }
        return { session, posted };
    }

    it("plays The Stray to an ending and posts the recap from the spec", () => {
        const { session, posted } = playToEnd();

        expect(posted).toHaveLength(3);
        const ending = posted[2];
        expect(ending.startsWith("The group chose 1️⃣ Stare down the fox from the park wall (3 of 4 votes).\nThe rooftops are yours now.")).toBe(true);
        expect(ending.endsWith([
            "",
            "THE END — \"A Territory of Your Own\"",
            "Your path: Up the fire escape to the roofs → Hiss and vanish over the wall → Stare down the fox from the park wall",
            "Boldness 6 · Trust 0",
            "4 people voted across 3 decisions. Play again with: story start the-stray",
        ].join("\n"))).toBe(true);

        expect(session.status).toBe("ended");
        expect(session.ending).toBe("A Territory of Your Own");
        expect(session.scores).toEqual({ boldness: 6, trust: 0 });
        expect(session.voters).toHaveLength(4);
        expect(session.closesAt).toBeNull();
        expect(session.choices).toEqual([]);
    });

    it("sends the ending without a beat context, and ignores votes and timers after it", () => {
        const { session } = playToEnd();

        unchanged(vote(session, "@priya", "1️⃣"), session);
        unchanged(handleTimer(session, env(T0 + 10 * LIVE)), session);
    });

    it("shows counts, never voter names", () => {
        const { posted } = playToEnd();
        for (const message of posted)
            for (const name of ["priya", "sam", "jo", "dev"])
                expect(message.toLowerCase()).not.toContain(`@${name}`);
    });

    it("does not change the session it is given", () => {
        const { session } = voteAll(begin().session, [["@priya", "1️⃣"], ["@sam", "1️⃣"]]);
        const before = structuredClone(session);

        vote(session, "@jo", "1️⃣");
        handleEvent(session, redaction("@priya", session.votes["@priya"].reactionEventId), BOT, env());
        handleTimer(session, env(T0 + LIVE));

        expect(session).toEqual(before);
    });
});

describe("slow mode", () => {
    const five: [string, string][] = [["@a", "1️⃣"], ["@b", "1️⃣"], ["@c", "2️⃣"], ["@d", "1️⃣"], ["@e", "3️⃣"]];

    it("uses a 24-hour window and closes the first beat on the timer only", () => {
        const { session, messages } = begin({ mode: "slow" });
        expect(session.quorum).toBeNull();
        expect(session.closesAt).toBe(T0 + SLOW);
        expect(messages[0].message.endsWith("React to vote. Closes in 24 hours.")).toBe(true);

        const voted = voteAll(session, five);
        expect(voted.messages).toEqual([]);

        const closed = handleTimer(voted.session, env(T0 + SLOW));
        expect(closed.messages[0].message.startsWith("The group chose 1️⃣ Under the bakery's back awning (3 of 5 votes).")).toBe(true);
    });

    it("sets the quorum to half the people who voted on the first beat", () => {
        const voted = voteAll(begin({ mode: "slow" }).session, five);
        const { session, messages } = handleTimer(voted.session, env(T0 + SLOW));

        expect(session.quorum).toBe(3);
        expect(messages[0].message.endsWith("React to vote. Closes at 3 votes or in 24 hours.")).toBe(true);
    });

    it("keeps a quorum given at start", () => {
        const { session } = begin({ mode: "slow", quorum: 2 });
        const result = voteAll(session, [["@a", "1️⃣"], ["@b", "1️⃣"]]);

        expect(result.messages).toHaveLength(1);
        expect(result.session.beatId).toBe("s1:2");
        expect(result.session.quorum).toBe(2);
    });
});

describe("endSession", () => {
    it("stops a running story with a recap of the path so far", () => {
        const { session } = voteAll(begin().session, [["@priya", "3️⃣"], ["@sam", "3️⃣"], ["@jo", "1️⃣"]]);
        const { session: ended, messages } = endSession(session, env());

        expect(messages).toEqual([{ message: [
            "Story ended early.",
            "",
            "THE END",
            "Your path: After the old man with the umbrella",
            "Boldness 0 · Trust 2",
            "3 people voted across 1 decision. Play again with: story start the-stray",
        ].join("\n") }]);
        expect(ended).toMatchObject({ status: "ended", closesAt: null, votes: {}, choices: [], scores: { boldness: 0, trust: 2 }, ending: null });
    });

    it("leaves a story that has already ended alone", () => {
        const { session } = endSession(begin().session, env());
        unchanged(endSession(session, env()), session);
    });
});

describe("statusMessage", () => {
    it("reposts the beat with the votes so far, the time left and the same beat context", () => {
        const { session } = voteAll(begin().session, [["@priya", "2️⃣"], ["@sam", "1️⃣"]]);
        const { message, context } = statusMessage(session, T0 + 150_000);

        expect(message.startsWith("2 votes so far.\nRain hits the city")).toBe(true);
        expect(message).toContain("1️⃣ Under the bakery's back awning (1)\n2️⃣ Up the fire escape to the roofs (1)\n3️⃣ After the old man with the umbrella (0)");
        expect(message.endsWith("React to vote. Closes at 3 votes or in 1 minute.")).toBe(true);
        expect(context).toEqual({ tool: "storytelling", beatId: "s1:1" });
    });

    it("says when the story is paused, with the window a new vote would open", () => {
        const paused = handleTimer(begin().session, env(T0 + LIVE)).session;
        const { message } = statusMessage(paused, T0 + 2 * LIVE);

        expect(message.startsWith("The story is paused until someone votes.\n")).toBe(true);
        expect(message.endsWith("React to vote. Closes at 3 votes or in 3 minutes.")).toBe(true);
    });

    it("says under a minute when less than a minute is left", () => {
        const { message } = statusMessage(begin().session, T0 + LIVE - 20_000);
        expect(message.endsWith("in under a minute.")).toBe(true);
    });
});

describe("sessionView", () => {
    it("gives the dashboard counts and progress, never who voted", () => {
        const { session } = voteAll(begin().session, [["@priya", "2️⃣"], ["@sam", "2️⃣"]]);
        const view = sessionView(session);

        expect(view).toMatchObject({
            storyId: "the-stray",
            title: "The Stray",
            status: "voting",
            quorum: 3,
            choices: ["Under the bakery's back awning", "Up the fire escape to the roofs", "After the old man with the umbrella"],
            tally: [0, 2, 0],
            votesIn: 2,
            closesAt: T0 + LIVE,
            path: [],
            voterCount: 0,
        });
        expect(JSON.stringify(view)).not.toMatch(/priya|sam/);
        expect(view).not.toHaveProperty("inkState");
    });
});
