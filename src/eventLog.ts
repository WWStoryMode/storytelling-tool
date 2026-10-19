import * as fs from "fs";
import { parseCommand } from "./commands";
import { type ChatEvent } from "./voting";

// Records incoming events to a JSON-lines file, so real WhatsApp and Signal shapes can become test fixtures.
// Only what the tool acts on is kept: story commands, reactions and redactions. Ordinary chat is never written,
// and of files only the name, type and size.

export type LoggedEvent = { receivedAt: number; botUserId: string; event: ChatEvent };

// A file's name, type and size, without its link; nothing at all of other content
function fileOnly(content: Record<string, any> = {}) {
    if (content.msgtype !== "m.file") return {};
    const { msgtype, body, filename, info } = content;
    return { msgtype, body, filename, info };
}

export function forLog(event: ChatEvent, botUserId: string): ChatEvent | null {
    let logged = event;

    if (event.type === "m.room.message") {
        const body = event.content?.body;
        if (typeof body !== "string" || parseCommand(body) === null) return null;
        // A file sent with a story command as its caption
        if (event.content?.msgtype === "m.file")
            logged = { ...event, content: fileOnly(event.content) };
    } else if (event.type !== "m.reaction" && event.type !== "m.room.redaction") {
        return null;
    }

    // A reaction or reply to a member's message carries that message: keep its shape, drop its text
    if (logged.prevEvent && logged.prevEvent.sender !== botUserId)
        logged = { ...logged, prevEvent: { ...logged.prevEvent, content: fileOnly(logged.prevEvent.content) } };

    return JSON.parse(JSON.stringify(logged));
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
