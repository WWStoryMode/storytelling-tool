import { v4 as uuidv4 } from "uuid";
import { parseCommand } from "./commands";
import { checkStoryUrl, MAX_STORY_BYTES, type StoryLoader } from "./download";
import { formatAdded, formatHelp, formatList, formatNotAdded } from "./format";
import { buildStory, storyIdFrom, type StoryEntry } from "./library";
import {
    endSession,
    handleEvent,
    handleTimer,
    nextDue,
    startSession,
    statusMessage,
    type ChatEvent,
    type ChatMessage,
    type Result,
    type Session,
} from "./voting";

// One story session per room, plus the timer that closes each vote.
// Replies to an incoming event are returned; messages from a timer go through `post`.

export type Clock = {
    now: () => number;
    setTimeout: (callback: () => void, ms: number) => unknown;
    clearTimeout: (handle: unknown) => void;
};

export type Post = (roomId: string, messages: ChatMessage[]) => void | Promise<void>;

// Most replies are immediate; `story add` and `story load` wait for a download
export type Reply = ChatMessage[] | Promise<ChatMessage[]>;

// Stories a group adds with `story add` or `story load` belong to that group, and live in memory only
export const MAX_ADDED_STORIES = 10;

// What a bare `story start` plays: the starter story, whatever else is in the library
export const DEFAULT_STORY = "the-stray";

const ADD_HINT = "Reply to a .ink file with \"story add\", or send the file with \"story add\" as its caption.";

// A file message: the one sent with "story add" as its caption, or the one a "story add" replies to
function attachmentOf(event: ChatEvent) {
    for (const candidate of [event, event.prevEvent]) {
        const content = candidate?.content;
        if (content?.msgtype !== "m.file") continue;

        const name = typeof content.filename === "string" ? content.filename : content.body;
        const size = content.info?.size;
        return {
            name: typeof name === "string" ? name : "the file",
            mxcUrl: typeof content.url === "string" ? content.url : null,
            size: typeof size === "number" ? size : null,
        };
    }
    return null;
}

const realClock: Clock = {
    now: () => Date.now(),
    setTimeout: (callback, ms) => setTimeout(callback, ms),
    clearTimeout: handle => clearTimeout(handle as NodeJS.Timeout),
};

const NO_STORY = "No story is running. Send \"story start\" to play one.";

const reply = (message: string): ChatMessage[] => [{ message }];

export class Game {
    private readonly sessions = new Map<string, Session>();
    private readonly added = new Map<string, StoryEntry[]>();
    private readonly timers = new Map<string, { handle: unknown; at: number }>();
    private readonly clock: Clock;
    private readonly random: () => number;
    private readonly newId: () => string;

    constructor(
        readonly stories: StoryEntry[],
        private readonly options: { post: Post; clock?: Clock; random?: () => number; newId?: () => string; loader?: StoryLoader },
    ) {
        this.clock = options.clock ?? realClock;
        this.random = options.random ?? Math.random;
        this.newId = options.newId ?? (() => uuidv4().slice(0, 8));
    }

    session(roomId: string) {
        return this.sessions.get(roomId) ?? null;
    }

    // The shared stories, then the ones this group added
    library(roomId: string | null) {
        return [
            ...this.stories.map(story => ({ ...story, addedHere: false })),
            ...(roomId ? this.added.get(roomId) ?? [] : []).map(story => ({ ...story, addedHere: true })),
        ];
    }

    handle(event: ChatEvent, botUserId: string): Reply {
        if (event.sender === botUserId) return [];

        if (event.type === "m.room.message")
            return this.command(event);

        if (event.type === "m.reaction" || event.type === "m.room.redaction")
            return this.update(event.room_id, session => handleEvent(session, event, botUserId, this.env(session)));

        return [];
    }

    private story(roomId: string, storyId: string) {
        return this.stories.find(story => story.id === storyId)
            ?? this.added.get(roomId)?.find(story => story.id === storyId)
            ?? null;
    }

    private env(session: Session) {
        const story = this.story(session.roomId, session.storyId);
        if (!story) throw new Error(`Story "${session.storyId}" is no longer in the library`);
        return { now: this.clock.now(), random: this.random, storyJson: story.json };
    }

    private running(roomId: string) {
        const session = this.sessions.get(roomId);
        return session && session.status !== "ended" ? session : null;
    }

    private command(event: ChatEvent): Reply {
        const body = event.content?.body;
        const command = typeof body === "string" ? parseCommand(body) : null;
        if (!command) return [];

        const roomId = event.room_id;

        switch (command.type) {
            case "help":
                return reply(formatHelp());

            case "list":
                return reply(formatList(this.stories, this.added.get(roomId) ?? []));

            case "add": {
                const file = attachmentOf(event);
                if (!file) return reply(ADD_HINT);
                if (!file.mxcUrl) return reply(`Couldn't get "${file.name}": the attachment has no file link.`);
                if (file.size !== null && file.size > MAX_STORY_BYTES)
                    return reply(`"${file.name}" is too big to be a story (the limit is ${MAX_STORY_BYTES / 1024} KB).`);

                const mxcUrl = file.mxcUrl;
                return this.addStory(roomId, file.name, loader => loader.attachment(mxcUrl));
            }

            case "load": {
                const link = checkStoryUrl(command.url);
                if ("message" in link) return reply(link.message);
                return this.addStory(roomId, link.fileName, loader => loader.url(link.url));
            }

            case "invalid":
                return reply(command.message);

            case "status": {
                const session = this.running(roomId);
                return session ? [statusMessage(session, this.clock.now())] : reply(NO_STORY);
            }

            case "end":
                if (!this.running(roomId)) return reply(NO_STORY);
                return this.update(roomId, session => endSession(session, this.env(session)));

            case "start": {
                if (this.running(roomId))
                    return reply("A story is already running here. Send \"story status\" to see the current choice, or \"story end\" to stop it.");

                const story = command.storyId
                    ? this.story(roomId, command.storyId)
                    : this.stories.find(story => story.id === DEFAULT_STORY) ?? this.stories[0];
                if (!story)
                    return reply(command.storyId
                        ? `There's no story called "${command.storyId}". Send "story list" to see what you can play.`
                        : "There are no stories in the library yet.");

                const { session, messages } = startSession({
                    id: this.newId(),
                    roomId,
                    storyId: story.id,
                    storyJson: story.json,
                    now: this.clock.now(),
                    mode: command.mode ?? undefined,
                    quorum: command.quorum ?? undefined,
                    windowMs: command.minutes === null ? undefined : command.minutes * 60_000,
                    reminders: command.reminders ?? undefined,
                });
                this.sessions.set(roomId, session);
                this.schedule(roomId);
                return messages;
            }
        }
    }

    // Checks what it can before downloading, then compiles and checks the story and adds it to this group
    private addStory(roomId: string, fileName: string, download: (loader: StoryLoader) => Promise<string>): Reply {
        const id = storyIdFrom(fileName);
        if (!id) return reply(`Only .ink files, or compiled .json from Inky, can be added. "${fileName}" isn't one.`);

        const added = this.added.get(roomId) ?? [];
        const replacing = added.some(story => story.id === id);

        if (this.stories.some(story => story.id === id))
            return reply(`There's already a story called "${id}" in the shared library. Rename the file and add it again.`);
        if (this.running(roomId)?.storyId === id)
            return reply(`"${id}" is being played. Send "story end" first, then add it again.`);
        if (!replacing && added.length >= MAX_ADDED_STORIES)
            return reply(`This group already has ${MAX_ADDED_STORIES} stories added, the most it can keep. Adding one with the same name as an earlier one replaces it.`);

        const loader = this.options.loader;
        if (!loader) return reply("Adding stories isn't set up on this server.");

        return download(loader).then(
            text => {
                const result = buildStory(fileName, text);
                if ("problems" in result) return reply(formatNotAdded(fileName, result.problems));

                // Checked again: the room may have started this story, or filled up, during the download
                if (this.running(roomId)?.storyId === id)
                    return reply(`"${id}" is being played. Send "story end" first, then add it again.`);
                const current = this.added.get(roomId) ?? [];
                const replaced = current.some(story => story.id === id);
                if (!replaced && current.length >= MAX_ADDED_STORIES)
                    return reply(`This group already has ${MAX_ADDED_STORIES} stories added, the most it can keep.`);

                this.added.set(roomId, [...current.filter(story => story.id !== id), result.story]);
                return reply(formatAdded(result.story, replaced));
            },
            (err: unknown) => reply(`Couldn't get "${fileName}": ${err instanceof Error ? err.message : "the download failed"}`),
        );
    }

    // Applies a step to the room's session, keeping its timer in line with the result
    private update(roomId: string, step: (session: Session) => Result): ChatMessage[] {
        const session = this.sessions.get(roomId);
        if (!session) return [];

        const result = step(session);
        if (result.session !== session) {
            this.sessions.set(roomId, result.session);
            this.schedule(roomId);
        }
        return result.messages;
    }

    private schedule(roomId: string) {
        const timer = this.timers.get(roomId);
        if (timer) {
            this.clock.clearTimeout(timer.handle);
            this.timers.delete(roomId);
        }

        const session = this.sessions.get(roomId);
        const at = session ? nextDue(session) : null;
        if (at === null) return;

        const handle = this.clock.setTimeout(() => this.fire(roomId, at), Math.max(0, at - this.clock.now()));
        this.timers.set(roomId, { handle, at });
    }

    // Sends a reminder or closes the vote, whichever was due at `at`
    private fire(roomId: string, at: number) {
        this.timers.delete(roomId);

        const messages = this.update(roomId, session => handleTimer(session, {
            ...this.env(session),
            // A timer can wake a moment early; what it was set for is still due
            now: Math.max(this.clock.now(), at),
        }));

        if (messages.length > 0)
            Promise.resolve(this.options.post(roomId, messages))
                .catch(err => console.error(`Couldn't post the timer's message to ${roomId}. "story status" in the chat reposts the current choice.`, err));
    }
}
