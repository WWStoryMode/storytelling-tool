import { describe, expect, it } from "vitest";
import * as fs from "fs";
import path from "path";
import { StoryRun } from "../src/engine";
import { compileInk } from "../src/validate";

const source = fs.readFileSync(path.resolve(__dirname, "../stories/the-stray.ink"), "utf8");
const json = compileInk(source).json as string;

// The spec's scoring table, decision by decision: [boldness, trust] per choice
const SCORES: [number, number][][] = [
    [[1, 1], [2, 0], [0, 2]],
    [[1, 1], [2, 0], [0, 1]],
    [[2, 0], [0, 2], [1, 1]],
];

function expectedEnding(boldness: number, trust: number) {
    if (boldness >= 3 && trust >= 3) return "Everyone's Cat, Nobody's Cat";
    if (boldness >= 4 || trust >= 4) return "A Territory of Your Own";
    return "Just Another Night";
}

const ALL_PATHS: number[][] = [];
for (let a = 0; a < 3; a++)
    for (let b = 0; b < 3; b++)
        for (let c = 0; c < 3; c++)
            ALL_PATHS.push([a, b, c]);

function play(choices: number[]) {
    const run = StoryRun.start(json);
    let beat = run.continue();
    for (const choice of choices)
        beat = run.choose(choice);
    return { run, beat };
}

describe("StoryRun with The Stray", () => {
    it("compiles without errors", () => {
        expect(compileInk(source).errors).toEqual([]);
    });

    it("reads the title from the global tag", () => {
        expect(StoryRun.start(json).title).toBe("The Stray");
    });

    it("opens with the first beat and its three choices", () => {
        const beat = StoryRun.start(json).continue();

        expect(beat.text.startsWith("Rain hits the city just after dusk.")).toBe(true);
        expect(beat.text.endsWith("Where do you run?")).toBe(true);
        expect(beat.choices).toEqual([
            "Under the bakery's back awning",
            "Up the fire escape to the roofs",
            "After the old man with the umbrella",
        ]);
        expect(beat.ended).toBe(false);
        expect(beat.endingTitle).toBeNull();
    });

    it.each(ALL_PATHS)("path %i-%i-%i reaches the ending the scoring table predicts", (...choices) => {
        const boldness = choices.reduce((sum, choice, decision) => sum + SCORES[decision][choice][0], 0);
        const trust = choices.reduce((sum, choice, decision) => sum + SCORES[decision][choice][1], 0);

        const { run, beat } = play(choices);

        expect(beat.ended).toBe(true);
        expect(beat.choices).toEqual([]);
        expect(run.variables()).toEqual({ boldness, trust });
        expect(beat.endingTitle).toBe(expectedEnding(boldness, trust));
    });

    it("reaches Just Another Night only by letting the girl stroke you", () => {
        for (const choices of ALL_PATHS) {
            const { beat } = play(choices);
            if (beat.endingTitle === "Just Another Night")
                expect(choices[1]).toBe(2);
        }
    });

    it("tells the rooftop or window version of A Territory of Your Own", () => {
        expect(play([1, 1, 0]).beat.text).toContain("The rooftops are yours now.");
        expect(play([2, 2, 1]).beat.text).toContain("The old man leaves his window open");
    });

    it("keeps beat text tidy: no doubled spaces, no blank or padded lines", () => {
        for (const choices of ALL_PATHS) {
            const run = StoryRun.start(json);
            const beats = [run.continue(), ...choices.map(choice => run.choose(choice))];
            for (const beat of beats) {
                expect(beat.text).not.toMatch(/ {2}/);
                for (const line of beat.text.split("\n"))
                    expect(line).toBe(line.trim());
                expect(beat.text).not.toMatch(/\n\n/);
            }
        }
    });

    it("does not leak the title or ending tags into the text", () => {
        const { beat } = play([0, 0, 0]);
        expect(beat.text).not.toContain("#");
        expect(StoryRun.start(json).continue().text).not.toContain("title");
    });

    it("saves and resumes mid-story to the same outcome", () => {
        const first = StoryRun.start(json);
        first.continue();
        first.choose(1);
        const saved = first.saveState();

        const resumed = StoryRun.resume(json, saved);
        expect(resumed.currentChoices()).toEqual([
            "Eat the tuna, then slip away",
            "Hiss and vanish over the wall",
            "Let her stroke you, but don't follow",
        ]);
        resumed.choose(1);
        const end = resumed.choose(0);

        expect(end.endingTitle).toBe("A Territory of Your Own");
        expect(resumed.variables()).toEqual({ boldness: 6, trust: 0 });
    });

    it("rejects a choice index that is out of range", () => {
        const run = StoryRun.start(json);
        run.continue();
        expect(() => run.choose(3)).toThrow(RangeError);
        expect(() => run.choose(-1)).toThrow(RangeError);
    });
});
