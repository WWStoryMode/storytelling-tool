// Checks an .ink or compiled .json story against the authoring conventions
// Usage: npm run check-story -- stories/my-story.ink
import { readFileSync } from "fs";
import { validateInk, validateStoryJson } from "../src/validate";

const file = process.argv[2];
if (!file) {
    console.log("Usage: npm run check-story -- <file.ink or file.json>");
    process.exit(1);
}

const text = readFileSync(file, "utf8");
const result = file.endsWith(".json") ? validateStoryJson(text) : validateInk(text);

console.log(`${result.ok ? "OK" : "REJECTED"}: ${result.title ?? "(no title)"}`);
console.log(`${result.decisions} decisions on the longest path, ${result.paths} paths, ${result.endings.length} endings`);
result.endings.forEach(ending => console.log(`  - ${ending}`));

for (const problem of result.problems)
    console.log(`${problem.severity.toUpperCase()} line ${problem.line ?? "-"}: ${problem.message}`);

process.exit(result.ok ? 0 : 1);
