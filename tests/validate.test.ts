import { describe, expect, it } from "vitest";
import * as fs from "fs";
import path from "path";
import { compileInk, validateInk, validateStoryJson } from "../src/validate";

const stray = fs.readFileSync(path.resolve(__dirname, "../stories/the-stray.ink"), "utf8");

// Three decisions of two choices each, every path ending tagged: passes cleanly
function story(body: string) {
    return `# title: Test\n${body}`;
}

const GOOD = story(`-> one
=== one ===
First beat.
* [Left] -> two
* [Right] -> two
=== two ===
Second beat.
* [Up] -> three
* [Down] -> three
=== three ===
Third beat.
* [In] -> done
* [Out] -> done
=== done ===
# ending: Home
The end.
-> END
`);

const errors = (result: ReturnType<typeof validateInk>) => result.problems.filter(problem => problem.severity === "error");
const warnings = (result: ReturnType<typeof validateInk>) => result.problems.filter(problem => problem.severity === "warning");

describe("validateInk", () => {
    it("passes The Stray with no problems and counts its shape", () => {
        const result = validateInk(stray);

        expect(result.problems).toEqual([]);
        expect(result.ok).toBe(true);
        expect(result.title).toBe("The Stray");
        expect(result.decisions).toBe(3);
        expect(result.paths).toBe(27);
        expect(result.endings).toEqual([
            "A Territory of Your Own",
            "Everyone's Cat, Nobody's Cat",
            "Just Another Night",
        ]);
        expect(result.json).toBeTypeOf("string");
    });

    it("passes a small well-formed story", () => {
        const result = validateInk(GOOD);
        expect(result.problems).toEqual([]);
        expect(result.ok).toBe(true);
    });

    it("rejects a compile error with its line number", () => {
        const result = validateInk(`# title: Broken\nHello\n* [Go] -> nowhere\n`);

        expect(result.ok).toBe(false);
        expect(result.json).toBeNull();
        expect(errors(result)).toEqual([
            expect.objectContaining({ line: 3, message: expect.stringContaining("Divert target not found") }),
        ]);
    });

    it("rejects a dead end with the line where the flow runs out", () => {
        const result = validateInk(story(`-> start
=== start ===
Pick one.
* [A] -> a
* [B] -> b
=== a ===
# ending: A
Alpha.
-> END
=== b ===
Beta, and then nothing.
`));

        expect(result.ok).toBe(false);
        expect(errors(result)).toContainEqual(
            expect.objectContaining({ line: 12, message: expect.stringMatching(/dead end/i) })
        );
    });

    it("rejects a beat with more than four choices, pointing at its knot", () => {
        const result = validateInk(story(`-> start
=== start ===
Too many.
* [One] -> done
* [Two] -> done
* [Three] -> done
* [Four] -> done
* [Five] -> done
=== done ===
# ending: Done
Fin.
-> END
`));

        expect(result.ok).toBe(false);
        expect(errors(result)).toContainEqual(
            expect.objectContaining({ line: 3, message: expect.stringContaining("5 choices") })
        );
    });

    it("rejects a beat with a single choice", () => {
        const result = validateInk(story(`-> start
=== start ===
Only one way.
* [Onward] -> done
=== done ===
# ending: Done
Fin.
-> END
`));

        expect(result.ok).toBe(false);
        expect(errors(result)).toContainEqual(
            expect.objectContaining({ line: 3, message: expect.stringContaining("1 choice") })
        );
    });

    it("rejects a story that never ends", () => {
        const result = validateInk(story(`-> loop
=== loop ===
Round and round.
+ [Again] -> loop
+ [Once more] -> loop
`));

        expect(result.ok).toBe(false);
        expect(errors(result)).toContainEqual(
            expect.objectContaining({ message: expect.stringMatching(/never ends|too many paths/i) })
        );
    });

    it("warns about a choice label over 40 characters", () => {
        const long = "Walk all the way around the block to the far side";
        const result = validateInk(GOOD.replace("[Left]", `[${long}]`));

        expect(result.ok).toBe(true);
        expect(warnings(result)).toContainEqual(
            expect.objectContaining({ line: 5, message: expect.stringContaining(long) })
        );
    });

    it("warns about a beat over 700 characters", () => {
        const result = validateInk(GOOD.replace("First beat.", "Long words here. ".repeat(50).trim()));

        expect(result.ok).toBe(true);
        expect(warnings(result)).toContainEqual(
            expect.objectContaining({ line: 3, message: expect.stringMatching(/\d+ characters/) })
        );
    });

    it("warns about a choice whose text is not in brackets, on its own line", () => {
        const result = validateInk(GOOD.replace("* [Right] -> two", "* Right -> two"));

        expect(result.ok).toBe(true);
        expect(warnings(result)).toContainEqual(
            expect.objectContaining({ line: 6, message: expect.stringContaining("brackets") })
        );
    });

    it("warns when a story is shorter than three decisions", () => {
        const result = validateInk(story(`-> start
=== start ===
One choice to make.
* [A] -> done
* [B] -> done
=== done ===
# ending: Done
Fin.
-> END
`));

        expect(result.ok).toBe(true);
        expect(result.decisions).toBe(1);
        expect(warnings(result)).toContainEqual(
            expect.objectContaining({ message: expect.stringMatching(/1 decision.*3 to 6/) })
        );
    });

    it("warns about an ending without an ending tag", () => {
        const result = validateInk(GOOD.replace("# ending: Home\n", ""));

        expect(result.ok).toBe(true);
        expect(result.endings).toEqual([]);
        expect(warnings(result)).toContainEqual(
            expect.objectContaining({ message: expect.stringContaining("# ending:") })
        );
    });

    it("warns when the story has no title tag", () => {
        const result = validateInk(GOOD.replace("# title: Test\n", ""));

        expect(result.ok).toBe(true);
        expect(result.title).toBeNull();
        expect(warnings(result)).toContainEqual(
            expect.objectContaining({ message: expect.stringContaining("# title:") })
        );
    });

    it("reports each problem once, however many paths pass through it", () => {
        const long = "Walk all the way around the block to the far side";
        const result = validateInk(GOOD.replace("[In]", `[${long}]`));

        expect(warnings(result).filter(problem => problem.message.includes(long))).toHaveLength(1);
    });
});

describe("validateStoryJson", () => {
    it("checks an already compiled story, without line numbers", () => {
        const result = validateStoryJson(compileInk(stray).json as string);

        expect(result.ok).toBe(true);
        expect(result.decisions).toBe(3);
        expect(result.endings).toHaveLength(3);
    });

    it("rejects text that is not a compiled Ink story", () => {
        const result = validateStoryJson("{\"not\": \"ink\"}");

        expect(result.ok).toBe(false);
        expect(errors(result)[0].line).toBeNull();
    });
});
