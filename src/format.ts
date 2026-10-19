// Chat text for beats, results and recaps. Shows vote counts, never voter names.

export const NUMBER_EMOJI = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"];

function plural(count: number, word: string, many = `${word}s`) {
    return `${count} ${count === 1 ? word : many}`;
}

export function formatDuration(ms: number) {
    const minutes = Math.round(ms / 60_000);
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

export function formatBeat(beat: { lead?: string | null; text: string; choices: string[]; quorum: number | null; windowMs: number }) {
    const choices = beat.choices.map((label, index) => `${NUMBER_EMOJI[index]} ${label}`).join("\n");
    return [withLead(beat.lead, beat.text), choices, formatFooter(beat.quorum, beat.windowMs)].join("\n\n");
}

export function formatResult(result: { choice: number; label: string; count: number; total: number; coinFlip: boolean }) {
    const pick = `${NUMBER_EMOJI[result.choice]} ${result.label} (${result.count} of ${plural(result.total, "vote")})`;
    return result.coinFlip
        ? `It was a tie, so the story flipped a coin: ${pick}.`
        : `The group chose ${pick}.`;
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
