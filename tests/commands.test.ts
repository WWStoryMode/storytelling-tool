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
        expect(parseCommand("story start")).toEqual({ type: "start", storyId: null, mode: null, quorum: null, minutes: null, reminders: null });
    });

    it("reads a story name, mode and quorum in any order", () => {
        const expected = { type: "start", storyId: "the-stray", mode: "slow", quorum: 4, minutes: 10, reminders: null };
        expect(parseCommand("story start the-stray slow quorum 4 minutes 10")).toEqual(expected);
        expect(parseCommand("story start minutes 10 quorum 4 The-Stray slow")).toEqual(expected);
        expect(parseCommand("story start live")).toEqual({ type: "start", storyId: null, mode: "live", quorum: null, minutes: null, reminders: null });
        expect(parseCommand("story start quorum 5")).toEqual({ type: "start", storyId: null, mode: null, quorum: 5, minutes: null, reminders: null });
        expect(parseCommand("story start minutes 1")).toMatchObject({ type: "start", minutes: 1 });
        expect(parseCommand("story start minutes 1440")).toMatchObject({ type: "start", minutes: 1440 });
    });

    it("explains a quorum that is missing or not a whole number of at least 1", () => {
        for (const body of ["story start quorum", "story start quorum 0", "story start quorum two", "story start quorum 2.5"]) {
            const command = parseCommand(body);
            expect(command?.type).toBe("invalid");
            expect(command && "message" in command && command.message).toContain("quorum 4");
        }
    });

    it("explains minutes that are missing, not a whole number, or over 24 hours", () => {
        for (const body of ["story start minutes", "story start minutes 0", "story start minutes five", "story start minutes 1.5", "story start minutes 1441"]) {
            const command = parseCommand(body);
            expect(command?.type).toBe("invalid");
            expect(command && "message" in command && command.message).toContain("minutes 5");
        }
    });

    it("reads remind with the default reminders, or a list of minutes before the close", () => {
        expect(parseCommand("story start remind")).toMatchObject({ type: "start", reminders: [60, 30, 20, 10] });
        expect(parseCommand("story start slow remind 120 30")).toMatchObject({ type: "start", mode: "slow", reminders: [120, 30] });
        expect(parseCommand("story start remind 10,60, 30")).toMatchObject({ type: "start", reminders: [60, 30, 10] });
        expect(parseCommand("story start remind [10, 20, 30, 60]")).toMatchObject({ type: "start", reminders: [60, 30, 20, 10] });
        expect(parseCommand("story start remind 30 30 10 the-stray")).toMatchObject({ type: "start", storyId: "the-stray", reminders: [30, 10] });
    });

    it("explains reminder minutes that are not whole numbers from 1 to 1440", () => {
        for (const body of ["story start remind 0", "story start remind 30 2000", "story start remind [30, -5]"]) {
            const command = parseCommand(body);
            expect(command?.type).toBe("invalid");
            expect(command && "message" in command && command.message).toContain("remind 60 30 10");
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
