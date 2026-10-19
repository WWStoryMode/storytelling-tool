import { Beat, StoryRun } from "./engine";
import { formatBeat, formatEndedEarly, formatEnding, formatNudge, formatResult, formatStatusLead, formatTitle } from "./format";

// Voting for one room's session. Pure: time, randomness and the story come in as arguments,
// and every function returns a new session plus the messages to post.

export const TOOL_ID = "storytelling";

export const WINDOW_MS = {
    live: 3 * 60_000,
    slow: 24 * 60 * 60_000,
};

export const DEFAULT_LIVE_QUORUM = 3;

export type Mode = keyof typeof WINDOW_MS;

export type Vote = {
    choice: number;          // 0-based choice index
    reactionEventId: string; // so a redaction can withdraw it
};

export type Session = {
    id: string;
    roomId: string;
    storyId: string;
    title: string | null;
    mode: Mode;
    quorum: number | null;   // null: slow mode's first beat, which closes on the timer only
    inkState: string;        // StoryRun.saveState()
    beatNumber: number;
    beatId: string;          // `${id}:${beatNumber}`, sent as the beat message's context
    beatText: string;
    choices: string[];
    votes: Record<string, Vote>; // sender -> vote, latest wins
    path: string[];          // chosen labels, for the recap
    voters: string[];        // everyone whose vote was counted at a close
    closesAt: number | null; // ms timestamp
    status: "voting" | "closing" | "paused" | "ended";
    ending: string | null;
    scores: Record<string, unknown> | null; // Ink variables at the ending
};

export type BeatContext = { tool: typeof TOOL_ID; beatId: string };

export type ChatMessage = { message: string; context?: BeatContext };

export type Result = { session: Session; messages: ChatMessage[] };

// The fields of a hub event this module reads (tool-hub/types.ts)
export type ChatEvent = {
    type: string;
    event_id: string;
    sender: string;
    room_id: string;
    origin_server_ts?: number;
    content: Record<string, any>;
    redacts?: string;
    prevEvent?: ChatEvent;
};

export type Env = {
    now: number;
    random: () => number; // [0, 1), for tie-breaks
    storyJson: string;
};

// "2️⃣", "2⃣" and "2︎⃣" all mean choice index 1
function choiceFromKey(key: unknown) {
    if (typeof key !== "string") return null;
    const match = key.replace(/[︎️]/g, "").trim().match(/^([1-4])⃣$/);
    return match ? Number(match[1]) - 1 : null;
}

export function tally(session: Session) {
    const counts = session.choices.map(() => 0);
    for (const vote of Object.values(session.votes))
        counts[vote.choice]++;
    return counts;
}

// Moves the session onto the beat the story just reached: a new vote, or the ending
function arrive(session: Session, run: StoryRun, beat: Beat, now: number, lead: string | null): Result {
    const base = { ...session, inkState: run.saveState(), beatText: beat.text, votes: {} };

    if (beat.ended) {
        const scores = run.variables();
        const ended: Session = { ...base, choices: [], closesAt: null, status: "ended", ending: beat.endingTitle, scores };
        const message = formatEnding({
            lead,
            text: beat.text,
            endingTitle: beat.endingTitle,
            path: ended.path,
            scores,
            voterCount: ended.voters.length,
            storyId: ended.storyId,
        });
        return { session: ended, messages: [{ message }] };
    }

    const beatNumber = session.beatNumber + 1;
    const beatId = `${session.id}:${beatNumber}`;
    const windowMs = WINDOW_MS[session.mode];
    const next: Session = { ...base, beatNumber, beatId, choices: beat.choices, closesAt: now + windowMs, status: "voting" };
    const message = formatBeat({ lead, text: beat.text, choices: beat.choices, quorum: next.quorum, windowMs });

    return { session: next, messages: [{ message, context: { tool: TOOL_ID, beatId } }] };
}

function close(session: Session, env: Env): Result {
    const counts = tally(session);
    const total = counts.reduce((sum, count) => sum + count, 0);
    const top = Math.max(...counts);
    const tied = counts.flatMap((count, index) => count === top ? [index] : []);
    const choice = tied.length === 1 ? tied[0] : tied[Math.min(tied.length - 1, Math.floor(env.random() * tied.length))];
    const label = session.choices[choice];

    const run = StoryRun.resume(env.storyJson, session.inkState);
    const beat = run.choose(choice);
    const lead = formatResult({ choice, label, count: counts[choice], total, coinFlip: tied.length > 1 });

    const voters = [...session.voters];
    for (const sender of Object.keys(session.votes))
        if (!voters.includes(sender)) voters.push(sender);

    const next: Session = {
        ...session,
        path: [...session.path, label],
        voters,
        // Slow mode's default: half the people who voted on the first beat
        quorum: session.quorum ?? Math.max(1, Math.ceil(total / 2)),
    };

    return arrive(next, run, beat, env.now, lead);
}

export function startSession(options: {
    id: string;
    roomId: string;
    storyId: string;
    storyJson: string;
    now: number;
    mode?: Mode;
    quorum?: number;
}): Result {
    if (options.quorum !== undefined && !(Number.isInteger(options.quorum) && options.quorum > 0))
        throw new RangeError(`Quorum must be a whole number of at least 1, not ${options.quorum}`);

    const mode = options.mode ?? "live";
    const run = StoryRun.start(options.storyJson);
    const session: Session = {
        id: options.id,
        roomId: options.roomId,
        storyId: options.storyId,
        title: run.title,
        mode,
        quorum: options.quorum ?? (mode === "live" ? DEFAULT_LIVE_QUORUM : null),
        inkState: "",
        beatNumber: 0,
        beatId: "",
        beatText: "",
        choices: [],
        votes: {},
        path: [],
        voters: [],
        closesAt: null,
        status: "voting",
        ending: null,
        scores: null,
    };

    return arrive(session, run, run.continue(), options.now, session.title ? formatTitle(session.title) : null);
}

function vote(session: Session, event: ChatEvent, botUserId: string, env: Env): Result {
    const unchanged = { session, messages: [] };

    const target = event.prevEvent;
    if (!target || target.sender !== botUserId) return unchanged;

    const context = target.content?.context;
    if (context?.tool !== TOOL_ID || context.beatId !== session.beatId) return unchanged;

    const choice = choiceFromKey(event.content?.["m.relates_to"]?.key);
    if (choice === null || choice >= session.choices.length) return unchanged;

    let next: Session = { ...session, votes: { ...session.votes, [event.sender]: { choice, reactionEventId: event.event_id } } };

    if (session.status === "paused")
        next = { ...next, status: "voting", closesAt: env.now + WINDOW_MS[session.mode] };

    if (next.quorum !== null && Object.keys(next.votes).length >= next.quorum)
        return close(next, env);

    return { session: next, messages: [] };
}

function withdraw(session: Session, event: ChatEvent): Result {
    const redacts = event.redacts ?? event.content?.redacts;
    const sender = Object.keys(session.votes).find(sender => session.votes[sender].reactionEventId === redacts);
    if (!sender) return { session, messages: [] };

    const votes = { ...session.votes };
    delete votes[sender];
    return { session: { ...session, votes }, messages: [] };
}

// Reactions vote, redactions withdraw a vote; everything else is ignored
export function handleEvent(session: Session, event: ChatEvent, botUserId: string, env: Env): Result {
    const unchanged = { session, messages: [] };

    if (session.status !== "voting" && session.status !== "paused") return unchanged;
    if (event.room_id !== session.roomId || event.sender === botUserId) return unchanged;

    if (event.type === "m.reaction")
        return vote(session, event, botUserId, env);

    if (event.type === "m.room.redaction")
        return withdraw(session, event);

    return unchanged;
}

// Called when the vote window may have ended; closes it, or pauses if nobody voted
export function handleTimer(session: Session, env: Env): Result {
    if (session.status !== "voting" || session.closesAt === null || env.now < session.closesAt)
        return { session, messages: [] };

    if (Object.keys(session.votes).length === 0) {
        const paused: Session = { ...session, status: "paused", closesAt: null };
        const message = formatNudge(WINDOW_MS[session.mode]);
        return { session: paused, messages: [{ message, context: { tool: TOOL_ID, beatId: session.beatId } }] };
    }

    return close(session, env);
}

// `story end`: stops a running story with a recap of the path so far
export function endSession(session: Session, env: Pick<Env, "storyJson">): Result {
    if (session.status === "ended")
        return { session, messages: [] };

    const scores = StoryRun.resume(env.storyJson, session.inkState).variables();
    const ended: Session = { ...session, status: "ended", closesAt: null, votes: {}, choices: [], scores, ending: null };
    const message = formatEndedEarly({
        endingTitle: null,
        path: ended.path,
        scores,
        voterCount: ended.voters.length,
        storyId: ended.storyId,
    });

    return { session: ended, messages: [{ message }] };
}

// `story status`: the current beat again, with the votes so far. It carries the beat's context, so votes on it count.
export function statusMessage(session: Session, now: number): ChatMessage {
    const paused = session.status === "paused" || session.closesAt === null;
    const windowMs = paused ? WINDOW_MS[session.mode] : Math.max(0, (session.closesAt as number) - now);
    const message = formatBeat({
        lead: formatStatusLead(Object.keys(session.votes).length, paused),
        text: session.beatText,
        choices: session.choices,
        counts: tally(session),
        quorum: session.quorum,
        windowMs,
    });

    return { message, context: { tool: TOOL_ID, beatId: session.beatId } };
}

// What the dashboard may show: counts and progress, never who voted
export function sessionView(session: Session) {
    return {
        storyId: session.storyId,
        title: session.title,
        mode: session.mode,
        quorum: session.quorum,
        status: session.status,
        beatNumber: session.beatNumber,
        beatText: session.beatText,
        choices: session.choices,
        tally: tally(session),
        votesIn: Object.keys(session.votes).length,
        closesAt: session.closesAt,
        path: session.path,
        voterCount: session.voters.length,
        ending: session.ending,
        scores: session.scores,
    };
}
