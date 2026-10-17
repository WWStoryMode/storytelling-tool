import { Story } from "inkjs";
import { ErrorType } from "inkjs/engine/Error";

// One screen of story: the text up to the next set of choices, or up to an ending
export type Beat = {
    text: string;
    choices: string[];
    ended: boolean;
    endingTitle: string | null; // from `# ending: <title>`
    imageUrl: string | null;    // from `# image: <url>`
};

export function parseTag(tag: string) {
    const colon = tag.indexOf(":");
    if (colon === -1)
        return { key: tag.trim().toLowerCase(), value: "" };

    return {
        key: tag.slice(0, colon).trim().toLowerCase(),
        value: tag.slice(colon + 1).trim(),
    };
}

function findTag(tags: string[], key: string) {
    const tag = tags.map(parseTag).find(tag => tag.key === key);
    return tag ? tag.value : null;
}

// Collapse the stray spaces and blank lines Ink can leave, so a beat reads cleanly in a chat
function tidy(text: string) {
    return text
        .split("\n")
        .map(line => line.replace(/\s+/g, " ").trim())
        .filter(line => line.length > 0)
        .join("\n");
}

// A playthrough of one compiled Ink story. Holds no chat or HTTP state.
export class StoryRun {
    readonly errors: string[] = [];
    readonly warnings: string[] = [];

    private constructor(private readonly story: Story) {
        story.onError = (message, type) => {
            if (type === ErrorType.Error)
                this.errors.push(message);
            else
                this.warnings.push(message);
        };
    }

    static start(storyJson: string) {
        return new StoryRun(new Story(storyJson));
    }

    static resume(storyJson: string, savedState: string) {
        const run = StoryRun.start(storyJson);
        run.loadState(savedState);
        return run;
    }

    get title() {
        return findTag(this.story.globalTags ?? [], "title");
    }

    continue(): Beat {
        const lines: string[] = [];
        const tags: string[] = [];

        while (this.story.canContinue) {
            lines.push(this.story.Continue() ?? "");
            tags.push(...(this.story.currentTags ?? []));
        }

        const choices = this.currentChoices();

        return {
            text: tidy(lines.join("")),
            choices,
            ended: choices.length === 0,
            endingTitle: findTag(tags, "ending"),
            imageUrl: findTag(tags, "image"),
        };
    }

    choose(index: number): Beat {
        const count = this.story.currentChoices.length;
        if (!Number.isInteger(index) || index < 0 || index >= count)
            throw new RangeError(`Choice ${index} is out of range; this beat has ${count} choices`);

        this.story.ChooseChoiceIndex(index);
        return this.continue();
    }

    currentChoices() {
        return this.story.currentChoices.map(choice => choice.text.trim());
    }

    // Path of each current choice, such as "midnight.0.12"; the first part is its knot
    currentChoicePaths() {
        return this.story.currentChoices.map(choice => choice.sourcePath);
    }

    saveState() {
        return this.story.state.toJson();
    }

    loadState(savedState: string) {
        this.story.state.LoadJson(savedState);
    }

    variables() {
        const variables: Record<string, unknown> = {};
        for (const name of Object.keys(this.story.variablesState))
            variables[name] = this.story.variablesState.$(name);

        return variables;
    }
}
