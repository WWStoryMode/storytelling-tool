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

// Loads every .ink and compiled .json story in a folder, skipping any that fail validation
export function loadStoryDir(dir: string) {
    const stories: StoryEntry[] = [];
    const rejected: { file: string; problems: string[] }[] = [];

    for (const file of fs.readdirSync(dir).sort()) {
        const extension = path.extname(file).toLowerCase();
        if (extension !== ".ink" && extension !== ".json") continue;

        const id = path.basename(file, path.extname(file)).toLowerCase();
        if (stories.some(story => story.id === id)) {
            rejected.push({ file, problems: [`Another file already uses the name "${id}".`] });
            continue;
        }

        const text = fs.readFileSync(path.join(dir, file), "utf8");
        const result = extension === ".ink" ? validateInk(text) : validateStoryJson(text);

        if (!result.ok || !result.json) {
            const problems = result.problems
                .filter(problem => problem.severity === "error")
                .map(problem => `line ${problem.line ?? "-"}: ${problem.message}`);
            rejected.push({ file, problems });
            continue;
        }

        stories.push({
            id,
            title: result.title ?? id,
            json: result.json,
            decisions: result.decisions,
            paths: result.paths,
            endings: result.endings,
        });
    }

    return { stories, rejected };
}
