import { v4 as uuidv4 } from "uuid";
import { parseCommand } from "./commands";
import { formatHelp, formatList } from "./format";
import { type StoryEntry } from "./library";
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

const realClock: Clock = {
    now: () => Date.now(),
    setTimeout: (callback, ms) => setTimeout(callback, ms),
    clearTimeout: handle => clearTimeout(handle as NodeJS.Timeout),
};

const NO_STORY = "No story is running. Send \"story start\" to play one.";

const reply = (message: string): ChatMessage[] => [{ message }];

export class Game {
    private readonly sessions = new Map<string, Session>();
    private readonly timers = new Map<string, { handle: unknown; at: number }>();
    private readonly clock: Clock;
    private readonly random: () => number;
    private readonly newId: () => string;

    constructor(
        readonly stories: StoryEntry[],
        private readonly options: { post: Post; clock?: Clock; random?: () => number; newId?: () => string },
    ) {
        this.clock = options.clock ?? realClock;
        this.random = options.random ?? Math.random;
        this.newId = options.newId ?? (() => uuidv4().slice(0, 8));
    }

    session(roomId: string) {
        return this.sessions.get(roomId) ?? null;
    }

    handle(event: ChatEvent, botUserId: string): ChatMessage[] {
        if (event.sender === botUserId) return [];

        if (event.type === "m.room.message")
            return this.command(event);

        if (event.type === "m.reaction" || event.type === "m.room.redaction")
            return this.update(event.room_id, session => handleEvent(session, event, botUserId, this.env(session)));

        return [];
    }

    private story(storyId: string) {
        return this.stories.find(story => story.id === storyId) ?? null;
    }

    private env(session: Session) {
        const story = this.story(session.storyId);
        if (!story) throw new Error(`Story "${session.storyId}" is no longer in the library`);
        return { now: this.clock.now(), random: this.random, storyJson: story.json };
    }

    private running(roomId: string) {
        const session = this.sessions.get(roomId);
        return session && session.status !== "ended" ? session : null;
    }

    private command(event: ChatEvent): ChatMessage[] {
        const body = event.content?.body;
        const command = typeof body === "string" ? parseCommand(body) : null;
        if (!command) return [];

        const roomId = event.room_id;

        switch (command.type) {
            case "help":
                return reply(formatHelp());

            case "list":
                return reply(formatList(this.stories));

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

                const story = command.storyId ? this.story(command.storyId) : this.stories[0];
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
                .catch(err => console.error(`Couldn't post the timer's messages to ${roomId}:`, err));
    }
}
