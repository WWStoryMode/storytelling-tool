import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import path from "path";
import { buildStory, loadStoryDir, storyIdFrom } from "../src/library";

describe("loadStoryDir", () => {
    it("loads the bundled stories with their shape", () => {
        const { stories, rejected } = loadStoryDir(path.resolve(__dirname, "../stories"));

        expect(rejected).toEqual([]);
        const stray = stories.find(story => story.id === "the-stray");
        expect(stray).toMatchObject({ title: "The Stray", decisions: 3, paths: 27 });
        expect(stray?.endings).toHaveLength(3);
        expect(typeof stray?.json).toBe("string");
    });

    it("skips stories that fail validation, and files that are not stories", () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stories-"));
        fs.copyFileSync(path.resolve(__dirname, "../stories/the-stray.ink"), path.join(dir, "Good.ink"));
        fs.writeFileSync(path.join(dir, "broken.ink"), "# title: Broken\nHello\n* [One]\n  Nowhere\n");
        fs.writeFileSync(path.join(dir, "README.md"), "# Notes");

        const { stories, rejected } = loadStoryDir(dir);

        expect(stories.map(story => story.id)).toEqual(["good"]);
        expect(rejected).toHaveLength(1);
        expect(rejected[0].file).toBe("broken.ink");
        expect(rejected[0].problems.length).toBeGreaterThan(0);
    });
});

describe("storyIdFrom", () => {
    it("turns a file name into the name story start takes", () => {
        expect(storyIdFrom("The Lantern.ink")).toBe("the-lantern");
        expect(storyIdFrom("lantern (2).INK")).toBe("lantern-2");
        expect(storyIdFrom("compiled.json")).toBe("compiled");
        expect(storyIdFrom("../../etc/passwd.ink")).toBe("passwd");
    });

    it("rejects files that aren't stories", () => {
        expect(storyIdFrom("notes.pdf")).toBeNull();
        expect(storyIdFrom("lantern")).toBeNull();
        expect(storyIdFrom("!!!.ink")).toBeNull();
    });
});

describe("buildStory", () => {
    it("checks an Ink file and gives its library entry", () => {
        const result = buildStory("Good.ink", fs.readFileSync(path.resolve(__dirname, "../stories/the-stray.ink"), "utf8"));

        expect(result.ok).toBe(true);
        expect(result.ok && result.story).toMatchObject({ id: "good", title: "The Stray", decisions: 3 });
    });

    it("gives each problem, with its line number when it has one", () => {
        const missing = buildStory("broken.ink", "# title: Broken\nHello\n* [One] -> nowhere\n* [Two] -> END\n");
        const single = buildStory("broken.ink", "# title: Broken\nHello\n* [One]\n  Nowhere\n");

        expect(!missing.ok && missing.problems).toEqual(["line 3: Divert target not found: '-> nowhere'"]);
        expect(!single.ok && single.problems).toEqual(["This beat offers 1 choice; use 2 to 4."]);
    });
});
