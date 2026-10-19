import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import path from "path";
import { loadStoryDir } from "../src/library";

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
