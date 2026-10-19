import * as fs from "fs";
import path from "path";
import { validateInk, validateStoryJson } from "./validate";

export type StoryEntry = {
    id: string;        // file name without extension, lowercased: what `story start <name>` takes
    title: string;
    json: string;      // compiled Ink
    decisions: number;
    paths: number;
    endings: string[];
};

const STORY_EXTENSIONS = [".ink", ".json"];

// "The Lantern (2).ink" -> "the-lantern-2", the name `story start` takes; null for a file that isn't a story
export function storyIdFrom(fileName: string) {
    const base = path.basename(fileName);
    const extension = path.extname(base).toLowerCase();
    if (!STORY_EXTENSIONS.includes(extension)) return null;

    const id = base.slice(0, -extension.length).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return id || null;
}

// Compiles and checks one story file, with its problems as "line N: …" (when the line is known) if it fails
export function buildStory(fileName: string, text: string):
    { ok: true; story: StoryEntry } | { ok: false; problems: string[] } {
    const id = storyIdFrom(fileName);
    if (!id) return { ok: false, problems: [`"${fileName}" isn't an .ink or compiled .json story.`] };

    const result = path.extname(fileName).toLowerCase() === ".json" ? validateStoryJson(text) : validateInk(text);
    if (!result.ok || !result.json) {
        const problems = result.problems
            .filter(problem => problem.severity === "error")
            .map(problem => problem.line ? `line ${problem.line}: ${problem.message}` : problem.message);
        return { ok: false, problems };
    }

    return {
        ok: true,
        story: {
            id,
            title: result.title ?? id,
            json: result.json,
            decisions: result.decisions,
            paths: result.paths,
            endings: result.endings,
        },
    };
}

// Loads every .ink and compiled .json story in a folder, skipping any that fail validation
export function loadStoryDir(dir: string) {
    const stories: StoryEntry[] = [];
    const rejected: { file: string; problems: string[] }[] = [];

    for (const file of fs.readdirSync(dir).sort()) {
        const id = storyIdFrom(file);
        if (!id) continue;

        if (stories.some(story => story.id === id)) {
            rejected.push({ file, problems: [`Another file already uses the name "${id}".`] });
            continue;
        }

        const result = buildStory(file, fs.readFileSync(path.join(dir, file), "utf8"));
        if ("problems" in result)
            rejected.push({ file, problems: result.problems });
        else
            stories.push(result.story);
    }

    return { stories, rejected };
}
