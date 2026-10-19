import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import path from "path";
import { appendEvent, forLog, readEventLog } from "../src/eventLog";
import { type ChatEvent } from "../src/voting";

const BOT = "@storytelling:hub";

const message = (body: string, sender = "@priya:hub"): ChatEvent =>
    ({ type: "m.room.message", event_id: "$m", sender, room_id: "!r", content: { msgtype: "m.text", body } });

const reaction = (key: string, target: ChatEvent): ChatEvent =>
    ({ type: "m.reaction", event_id: "$r", sender: "@sam:hub", room_id: "!r", content: { "m.relates_to": { event_id: target.event_id, key } }, prevEvent: target });

describe("forLog", () => {
    it("keeps story commands, reactions and redactions", () => {
        const beat = { ...message("A beat", BOT), content: { body: "A beat", context: { tool: "storytelling", beatId: "s:1" } } };
        const redaction: ChatEvent = { type: "m.room.redaction", event_id: "$x", sender: "@sam:hub", room_id: "!r", redacts: "$r", content: {} };

        expect(forLog(message("Story start quorum 2"), BOT)).toEqual(message("Story start quorum 2"));
        expect(forLog(reaction("2️⃣", beat), BOT)).toEqual(reaction("2️⃣", beat));
        expect(forLog(redaction, BOT)).toEqual(redaction);
    });

    it("never keeps ordinary chat", () => {
        expect(forLog(message("see you at the meeting"), BOT)).toBeNull();
    });

    it("blanks the text of a member's message that someone reacted to", () => {
        const logged = forLog(reaction("❤️", message("my phone number is…")), BOT);

        expect(logged?.prevEvent?.sender).toBe("@priya:hub");
        expect(logged?.prevEvent?.content).toEqual({});
        expect(JSON.stringify(logged)).not.toContain("phone number");
    });
});

describe("appendEvent and readEventLog", () => {
    it("writes one JSON line per event and reads them back", () => {
        const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "events-")), "events.jsonl");

        appendEvent(file, { receivedAt: 1, botUserId: BOT, event: message("story start") });
        appendEvent(file, { receivedAt: 2, botUserId: BOT, event: message("story status") });

        expect(fs.readFileSync(file, "utf8").trim().split("\n")).toHaveLength(2);
        expect(readEventLog(file).map(entry => entry.event.content.body)).toEqual(["story start", "story status"]);
    });
});
