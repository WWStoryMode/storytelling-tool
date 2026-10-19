import * as fs from "fs";
import { parseCommand } from "./commands";
import { type ChatEvent } from "./voting";

// Records incoming events to a JSON-lines file, so real WhatsApp and Signal shapes can become test fixtures.
// Only what the tool acts on is kept: story commands, reactions and redactions. Ordinary chat is never written.

export type LoggedEvent = { receivedAt: number; botUserId: string; event: ChatEvent };

export function forLog(event: ChatEvent, botUserId: string): ChatEvent | null {
    if (event.type === "m.room.message") {
        const body = event.content?.body;
        return typeof body === "string" && parseCommand(body) !== null ? event : null;
    }

    if (event.type !== "m.reaction" && event.type !== "m.room.redaction")
        return null;

    // A reaction on a member's message carries that message: keep its shape, drop its text
    if (event.prevEvent && event.prevEvent.sender !== botUserId)
        return { ...event, prevEvent: { ...event.prevEvent, content: {} } };

    return event;
}

export function appendEvent(file: string, entry: LoggedEvent) {
    fs.appendFileSync(file, `${JSON.stringify(entry)}\n`);
}

export function readEventLog(file: string): LoggedEvent[] {
    return fs.readFileSync(file, "utf8")
        .split("\n")
        .filter(line => line.trim())
        .map(line => JSON.parse(line));
}
