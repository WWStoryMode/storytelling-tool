import { type Mode } from "./voting";

// Parses `story …` chat messages. Pure: no chat or HTTP code.

export type Command =
    | { type: "start"; storyId: string | null; mode: Mode | null; quorum: number | null; minutes: number | null; reminders: number[] | null }
    | { type: "status" }
    | { type: "end" }
    | { type: "list" }
    | { type: "help" }
    | { type: "add" }
    | { type: "load"; url: string }
    | { type: "invalid"; message: string };

const QUORUM_HINT = "Quorum needs a whole number of at least 1, like \"quorum 4\".";
const MAX_MINUTES = 24 * 60;
const MINUTES_HINT = `Minutes needs a whole number from 1 to ${MAX_MINUTES} (24 hours), like "minutes 5".`;
const USAGE = "story start [name] [live or slow] [quorum N] [minutes N] [remind 60 30 10]";

// Minutes before the close; what a bare `remind` sends
export const DEFAULT_REMINDERS = [60, 30, 20, 10];
const REMINDERS_HINT = `Reminders need whole minutes from 1 to ${MAX_MINUTES} before the close, like "remind 60 30 10".`;

// A whole number from `min` to `max`, or null
function wholeNumber(value: string | undefined, min: number, max = Infinity) {
    if (!value || !/^\d+$/.test(value)) return null;
    const number = Number(value);
    return number >= min && number <= max ? number : null;
}

// `story start [name] [live or slow] [quorum N] [minutes N] [remind 60 30 10]`, options in any order
function parseStart(words: string[]): Command {
    let storyId: string | null = null;
    let mode: Mode | null = null;
    let quorum: number | null = null;
    let minutes: number | null = null;
    let reminders: number[] | null = null;

    for (let index = 0; index < words.length; index++) {
        const word = words[index];

        if (word === "live" || word === "slow") {
            if (mode && mode !== word)
                return { type: "invalid", message: "Choose live or slow, not both." };
            mode = word;
        } else if (word === "quorum") {
            quorum = wholeNumber(words[++index], 1);
            if (quorum === null)
                return { type: "invalid", message: QUORUM_HINT };
        } else if (word === "minutes" || word === "minute") {
            minutes = wholeNumber(words[++index], 1, MAX_MINUTES);
            if (minutes === null)
                return { type: "invalid", message: MINUTES_HINT };
        } else if (word === "remind") {
            // The minutes that follow, written as "60 30", "60,30" or "[60, 30]"; none means the defaults
            const listed: string[] = [];
            while (index + 1 < words.length && /^[\[\],\d-]+$/.test(words[index + 1]) && /[\d\[\]-]/.test(words[index + 1]))
                listed.push(words[++index]);

            const values = listed.join(",").replace(/[\[\]]/g, "").split(",").filter(Boolean);
            const numbers = values.map(value => wholeNumber(value, 1, MAX_MINUTES));
            if (numbers.some(number => number === null))
                return { type: "invalid", message: REMINDERS_HINT };

            reminders = numbers.length > 0
                ? [...new Set(numbers as number[])].sort((a, b) => b - a)
                : DEFAULT_REMINDERS;
        } else if (storyId === null) {
            storyId = word;
        } else {
            return { type: "invalid", message: `I didn't understand "${word}". Try: ${USAGE}` };
        }
    }

    return { type: "start", storyId, mode, quorum, minutes, reminders };
}

const LOAD_HINT = "Paste the story's raw link after it, like: story load https://raw.githubusercontent.com/you/stories/main/lantern.ink";

// Returns null for anything that isn't a story command
export function parseCommand(body: string): Command | null {
    // Some bridges send a reply with the quoted message first, as "> " lines
    const text = body.replace(/^(>.*\n)+\n?/, "");
    const original = text.trim().split(/\s+/);
    const words = original.map(word => word.toLowerCase());
    if (words[0] !== "story") return null;

    const [command, ...rest] = words.slice(1);
    switch (command) {
        case undefined:
        case "help":
            return { type: "help" };
        case "start":
            return parseStart(rest);
        case "status":
        case "end":
        case "list":
            return { type: command };
        case "add":
            return { type: "add" };
        case "load":
            // Links are case-sensitive, so this one comes from the message as sent
            return original[2] ? { type: "load", url: original[2] } : { type: "invalid", message: LOAD_HINT };
        default:
            return { type: "invalid", message: `I don't know "story ${command}". Send "story help" for the commands.` };
    }
}
