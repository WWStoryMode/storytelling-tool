// Plays an .ink story in the terminal, one numbered choice at a time
// Usage: npm run play-story -- stories/my-story.ink (defaults to The Stray)
import { readFileSync } from "fs";
import * as readline from "readline";
import { StoryRun } from "../src/engine";
import { compileInk } from "../src/validate";

async function main() {
    const file = process.argv[2] ?? "stories/the-stray.ink";
    const { json, errors } = compileInk(readFileSync(file, "utf8"));
    if (!json) {
        errors.forEach(error => console.log(`ERROR line ${error.line ?? "-"}: ${error.message}`));
        process.exit(1);
    }

    const run = StoryRun.start(json);
    const path: string[] = [];
    let beat = run.continue();

    const show = () => {
        console.log(`\n${beat.text}\n`);
        beat.choices.forEach((choice, index) => console.log(`  ${index + 1}. ${choice}`));
        process.stdout.write("> ");
    };

    console.log(`== ${run.title ?? "(no title)"} ==`);
    if (!beat.ended) show();

    for await (const line of readline.createInterface({ input: process.stdin })) {
        if (beat.ended) break;

        const index = Number(line) - 1;
        if (!(index >= 0 && index < beat.choices.length)) {
            process.stdout.write(`Pick 1 to ${beat.choices.length}\n> `);
            continue;
        }

        path.push(beat.choices[index]);
        beat = run.choose(index);
        if (beat.ended) break;
        show();
    }

    console.log(`\n${beat.text}\n`);
    console.log(`THE END — "${beat.endingTitle ?? "(no ending tag)"}"`);
    console.log(`Path: ${path.join(" → ")}`);
    console.log(`Variables: ${JSON.stringify(run.variables())}`);
    process.exit(0);
}

main();
