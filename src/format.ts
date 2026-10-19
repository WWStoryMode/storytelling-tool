// Chat text for beats, results and recaps. Shows vote counts, never voter names.

export const NUMBER_EMOJI = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"];

function plural(count: number, word: string, many = `${word}s`) {
    return `${count} ${count === 1 ? word : many}`;
}

export function formatDuration(ms: number) {
    const minutes = Math.round(ms / 60_000);
    if (minutes < 1)
        return "under a minute";
    if (minutes < 60)
        return plural(minutes, "minute");

    return plural(Math.round(minutes / 60), "hour");
}

export function formatTitle(title: string) {
    return `${title.toUpperCase()} — a story you decide together.`;
}

// A null quorum means the vote only closes on the timer
export function formatFooter(quorum: number | null, windowMs: number) {
    const time = formatDuration(windowMs);
    if (quorum === null)
        return `React to vote. Closes in ${time}.`;

    return `React to vote. Closes at ${plural(quorum, "vote")} or in ${time}.`;
}

function withLead(lead: string | null | undefined, text: string) {
    return [lead, text].filter(Boolean).join("\n");
}

// With counts, each choice shows its votes so far, as in "1️⃣ Left (2)"
export function formatBeat(beat: { lead?: string | null; text: string; choices: string[]; counts?: number[]; quorum: number | null; windowMs: number }) {
    const choices = beat.choices
        .map((label, index) => `${NUMBER_EMOJI[index]} ${label}${beat.counts ? ` (${beat.counts[index]})` : ""}`)
        .join("\n");
    return [withLead(beat.lead, beat.text), choices, formatFooter(beat.quorum, beat.windowMs)].join("\n\n");
}

export function formatResult(result: { choice: number; label: string; count: number; total: number; coinFlip: boolean }) {
    const pick = `${NUMBER_EMOJI[result.choice]} ${result.label} (${result.count} of ${plural(result.total, "vote")})`;
    return result.coinFlip
        ? `It was a tie, so the story flipped a coin: ${pick}.`
        : `The group chose ${pick}.`;
}

export function formatReminderLead(votesIn: number, leftMs: number) {
    return `Reminder: ${plural(votesIn, "vote")} so far, ${formatDuration(leftMs)} left.`;
}

export function formatStatusLead(votesIn: number, paused: boolean) {
    return paused ? "The story is paused until someone votes." : `${plural(votesIn, "vote")} so far.`;
}

export function formatNudge(windowMs: number) {
    return `Nobody has voted yet, so the story is paused. React to the beat above whenever you're ready, and the vote reopens for ${formatDuration(windowMs)}.`;
}

// `team_spirit` reads as "Team spirit"
function label(name: string) {
    const words = name.replace(/_/g, " ");
    return words.charAt(0).toUpperCase() + words.slice(1);
}

export type Recap = {
    endingTitle: string | null;
    path: string[];
    scores: Record<string, unknown>;
    voterCount: number;
    storyId: string;
};

export function formatRecap(recap: Recap) {
    const lines = [recap.endingTitle ? `THE END — "${recap.endingTitle}"` : "THE END"];

    if (recap.path.length > 0)
        lines.push(`Your path: ${recap.path.join(" → ")}`);

    const scores = Object.entries(recap.scores);
    if (scores.length > 0)
        lines.push(scores.map(([name, value]) => `${label(name)} ${value}`).join(" · "));

    lines.push(`${plural(recap.voterCount, "person", "people")} voted across ${plural(recap.path.length, "decision")}. Play again with: story start ${recap.storyId}`);

    return lines.join("\n");
}

export function formatEnding(ending: Recap & { lead?: string | null; text: string }) {
    return [withLead(ending.lead, ending.text), formatRecap(ending)].join("\n\n");
}

export function formatEndedEarly(recap: Recap) {
    return ["Story ended early.", formatRecap(recap)].join("\n\n");
}

export function formatHelp() {
    return [
        "Storytelling commands:",
        "• story start [name] [live or slow] [quorum N] [minutes N] [remind]: start a story. It's Live, closing at 3 votes or 3 minutes, unless you say otherwise. \"remind\" reposts each choice 60, 30, 20 and 10 minutes before it closes, or give your own, like \"remind 30 10\"",
        "• story status: show the current choice and the votes so far",
        "• story end: stop the story and show the path so far",
        "• story list: list the stories you can play",
        "• story add: reply with this to a .ink file someone sent, or send the file with it as the caption, to add the story for this group",
        "• story load <link>: add a story from its raw link on GitHub or a gist",
        "• story help: show this message",
        "",
        "Vote by reacting 1️⃣ 2️⃣ 3️⃣ 4️⃣ to a story message. Results show how many people voted, never who. This tool only reads story commands and number reactions on its own messages, and keeps nothing else from the chat.",
    ].join("\n");
}

type Listed = { id: string; title: string; decisions: number; endings: string[] };

const listLine = (story: Listed) => `• ${story.id}: ${story.title} (${plural(story.decisions, "decision")}, ${plural(story.endings.length, "ending")})`;

export function formatList(stories: Listed[], added: Listed[] = []) {
    if (stories.length === 0 && added.length === 0)
        return "There are no stories in the library yet.";

    return [
        "Stories you can play:",
        ...stories.map(listLine),
        ...(added.length > 0 ? ["Added in this group:", ...added.map(listLine)] : []),
        "Start one with: story start <name>",
    ].join("\n");
}

export function formatAdded(story: Listed, replaced: boolean) {
    return `${replaced ? "Replaced" : "Added"} "${story.title}" (${plural(story.decisions, "decision")}, ${plural(story.endings.length, "ending")}). Start it with: story start ${story.id}`;
}

// The first few problems, so a broken story's reply stays readable in a chat
export function formatNotAdded(fileName: string, problems: string[]) {
    const shown = problems.slice(0, 5);
    return [
        `"${fileName}" wasn't added:`,
        ...shown.map(problem => `• ${problem}`),
        ...(problems.length > shown.length ? [`…and ${plural(problems.length - shown.length, "more problem")}.`] : []),
        "Fix it in Inky, or check it with: npm run check-story -- <file>",
    ].join("\n");
}
