import { describe, expect, it } from "vitest";
import { formatBeat, formatDuration, formatFooter, formatRecap, formatResult } from "../src/format";

describe("format", () => {
    it("writes durations in minutes under an hour, hours above", () => {
        expect(formatDuration(60_000)).toBe("1 minute");
        expect(formatDuration(3 * 60_000)).toBe("3 minutes");
        expect(formatDuration(60 * 60_000)).toBe("1 hour");
        expect(formatDuration(24 * 60 * 60_000)).toBe("24 hours");
    });

    it("says how the vote closes, with or without a quorum", () => {
        expect(formatFooter(3, 3 * 60_000)).toBe("React to vote. Closes at 3 votes or in 3 minutes.");
        expect(formatFooter(1, 3 * 60_000)).toBe("React to vote. Closes at 1 vote or in 3 minutes.");
        expect(formatFooter(null, 24 * 60 * 60_000)).toBe("React to vote. Closes in 24 hours.");
    });

    it("numbers the choices under the beat text", () => {
        expect(formatBeat({ text: "A fork in the road.", choices: ["Left", "Right"], quorum: 2, windowMs: 60_000 }))
            .toBe("A fork in the road.\n\n1️⃣ Left\n2️⃣ Right\n\nReact to vote. Closes at 2 votes or in 1 minute.");
    });

    it("puts a lead line, such as the previous result, directly above the text", () => {
        expect(formatBeat({ lead: "The group chose 1️⃣ Left (1 of 1 vote).", text: "Trees.", choices: ["Up", "Down"], quorum: 2, windowMs: 60_000 }))
            .toBe("The group chose 1️⃣ Left (1 of 1 vote).\nTrees.\n\n1️⃣ Up\n2️⃣ Down\n\nReact to vote. Closes at 2 votes or in 1 minute.");
    });

    it("announces a result with its count, or a coin flip for a tie", () => {
        expect(formatResult({ choice: 1, label: "Right", count: 3, total: 4, coinFlip: false }))
            .toBe("The group chose 2️⃣ Right (3 of 4 votes).");
        expect(formatResult({ choice: 0, label: "Left", count: 1, total: 1, coinFlip: false }))
            .toBe("The group chose 1️⃣ Left (1 of 1 vote).");
        expect(formatResult({ choice: 3, label: "Wait", count: 2, total: 4, coinFlip: true }))
            .toBe("It was a tie, so the story flipped a coin: 4️⃣ Wait (2 of 4 votes).");
    });

    it("writes a recap without an ending tag or variables, in the singular", () => {
        expect(formatRecap({ endingTitle: null, path: ["Left"], scores: {}, voterCount: 1, storyId: "fork" }))
            .toBe("THE END\nYour path: Left\n1 person voted across 1 decision. Play again with: story start fork");
    });

    it("turns variable names into readable labels", () => {
        expect(formatRecap({ endingTitle: "Home", path: ["A", "B"], scores: { team_spirit: 2 }, voterCount: 3, storyId: "x" }))
            .toBe("THE END — \"Home\"\nYour path: A → B\nTeam spirit 2\n3 people voted across 2 decisions. Play again with: story start x");
    });
});
