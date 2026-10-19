import { describe, expect, it } from "vitest";
import { parseCommand } from "../src/commands";

describe("parseCommand", () => {
    it("ignores messages that are not story commands", () => {
        for (const body of ["hello", "storytelling is fun", "my story start", "", "   "])
            expect(parseCommand(body)).toBeNull();
    });

    it("reads each command, in any case", () => {
        expect(parseCommand("story status")).toEqual({ type: "status" });
        expect(parseCommand("Story End")).toEqual({ type: "end" });
        expect(parseCommand("STORY LIST")).toEqual({ type: "list" });
        expect(parseCommand("story help")).toEqual({ type: "help" });
        expect(parseCommand("story")).toEqual({ type: "help" });
        expect(parseCommand("  story   status  ")).toEqual({ type: "status" });
    });

    it("starts with defaults when no options are given", () => {
        expect(parseCommand("story start")).toEqual({ type: "start", storyId: null, mode: null, quorum: null });
    });

    it("reads a story name, mode and quorum in any order", () => {
        const expected = { type: "start", storyId: "the-stray", mode: "slow", quorum: 4 };
        expect(parseCommand("story start the-stray slow quorum 4")).toEqual(expected);
        expect(parseCommand("story start quorum 4 The-Stray slow")).toEqual(expected);
        expect(parseCommand("story start live")).toEqual({ type: "start", storyId: null, mode: "live", quorum: null });
        expect(parseCommand("story start quorum 5")).toEqual({ type: "start", storyId: null, mode: null, quorum: 5 });
    });

    it("explains a quorum that is missing or not a whole number of at least 1", () => {
        for (const body of ["story start quorum", "story start quorum 0", "story start quorum two", "story start quorum 2.5"]) {
            const command = parseCommand(body);
            expect(command?.type).toBe("invalid");
            expect(command && "message" in command && command.message).toContain("quorum 4");
        }
    });

    it("explains extra words and clashing modes", () => {
        expect(parseCommand("story start the-stray tonight")).toMatchObject({ type: "invalid" });
        expect(parseCommand("story start live slow")).toMatchObject({ type: "invalid" });
    });

    it("points an unknown command at story help", () => {
        expect(parseCommand("story dance")).toEqual({ type: "invalid", message: "I don't know \"story dance\". Send \"story help\" for the commands." });
    });
});
