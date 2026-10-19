import { type Mode } from "./voting";

// Parses `story …` chat messages. Pure: no chat or HTTP code.

export type Command =
    | { type: "start"; storyId: string | null; mode: Mode | null; quorum: number | null }
    | { type: "status" }
    | { type: "end" }
    | { type: "list" }
    | { type: "help" }
    | { type: "invalid"; message: string };

const QUORUM_HINT = "Quorum needs a whole number of at least 1, like \"quorum 4\".";

// `story start [name] [live or slow] [quorum N]`, options in any order
function parseStart(words: string[]): Command {
    let storyId: string | null = null;
    let mode: Mode | null = null;
    let quorum: number | null = null;

    for (let index = 0; index < words.length; index++) {
        const word = words[index];

        if (word === "live" || word === "slow") {
            if (mode && mode !== word)
                return { type: "invalid", message: "Choose live or slow, not both." };
            mode = word;
        } else if (word === "quorum") {
            const value = words[++index];
            if (!value || !/^\d+$/.test(value) || Number(value) < 1)
                return { type: "invalid", message: QUORUM_HINT };
            quorum = Number(value);
        } else if (storyId === null) {
            storyId = word;
        } else {
            return { type: "invalid", message: `I didn't understand "${word}". Try: story start [name] [live or slow] [quorum N]` };
        }
    }

    return { type: "start", storyId, mode, quorum };
}

// Returns null for anything that isn't a story command
export function parseCommand(body: string): Command | null {
    const words = body.trim().toLowerCase().split(/\s+/);
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
        default:
            return { type: "invalid", message: `I don't know "story ${command}". Send "story help" for the commands.` };
    }
}
