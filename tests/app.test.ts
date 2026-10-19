import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import path from "path";
import { type Server } from "http";
import { createApp } from "../src/app";
import { Game } from "../src/game";
import { loadStoryDir } from "../src/library";
import { type ChatEvent, type ChatMessage } from "../src/voting";

// The Stray only, so stories that writers add to the folder don't change these tests
const stories = loadStoryDir(path.resolve(__dirname, "../stories")).stories.filter(story => story.id === "the-stray");

const BOT = "@storytelling:hub.example";
const ROOM = "!group:hub.example";

let server: Server;
let base: string;
let nextId = 0;

async function listen(options: { dashboardHtml?: string; eventLog?: string | null } = {}) {
    const stray = fs.readFileSync(path.resolve(__dirname, "../stories/the-stray.ink"), "utf8");
    const game = new Game(stories, { post: () => {}, random: () => 0, loader: { attachment: async () => stray, url: async () => stray } });
    const app = createApp({ game, dashboardHtml: options.dashboardHtml ?? "/no/such/index.html", eventLog: options.eventLog ?? null });
    server = await new Promise<Server>(resolve => { const s = app.listen(0, () => resolve(s)); });
    const address = server.address();
    base = `http://localhost:${typeof address === "object" && address ? address.port : 0}`;
}

beforeEach(() => listen());

afterEach(() => new Promise<void>(resolve => server.close(() => resolve())));

async function send(event: ChatEvent) {
    const response = await fetch(`${base}/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event, botUserId: BOT }),
    });
    return response.json();
}

const say = (sender: string, body: string) =>
    send({ type: "m.room.message", event_id: `$m${++nextId}`, sender, room_id: ROOM, content: { msgtype: "m.text", body } });

function react(sender: string, key: string, beat: ChatMessage) {
    const prevEvent: ChatEvent = { type: "m.room.message", event_id: `$bot${++nextId}`, sender: BOT, room_id: ROOM, content: { body: beat.message, context: beat.context } };
    return send({ type: "m.reaction", event_id: `$r${++nextId}`, sender, room_id: ROOM, content: { "m.relates_to": { event_id: prevEvent.event_id, key } }, prevEvent });
}

describe("POST /", () => {
    it("replies with one message as an object, and with none as success alone", async () => {
        const started = await say("@priya", "story start");
        expect(started.success).toBe(true);
        expect(started.response.context.beatId).toMatch(/:1$/);

        expect(await say("@priya", "see you later")).toEqual({ success: true });
    });
});

describe("GET /api/sessions", () => {
    it("needs a roomId", async () => {
        expect((await fetch(`${base}/api/sessions`)).status).toBe(400);
    });

    it("gives the room's session with the server's clock, and no voter names", async () => {
        const before = Date.now();
        const { response: beat } = await say("@priya", "story start");
        await react("@sam", "2️⃣", beat);

        const body = await (await fetch(`${base}/api/sessions?roomId=${encodeURIComponent(ROOM)}`)).json();

        expect(body.now).toBeGreaterThanOrEqual(before);
        expect(body.session).toMatchObject({ title: "The Stray", status: "voting", tally: [0, 1, 0], votesIn: 1 });
        expect(JSON.stringify(body)).not.toMatch(/priya|sam/);
    });

    it("gives null for a room with no story", async () => {
        const body = await (await fetch(`${base}/api/sessions?roomId=${encodeURIComponent("!other:hub.example")}`)).json();
        expect(body.session).toBeNull();
    });
});

describe("GET /api/stories", () => {
    it("lists the library without the compiled story", async () => {
        const list = await (await fetch(`${base}/api/stories`)).json();

        expect(list[0]).toMatchObject({ id: "the-stray", title: "The Stray", decisions: 3 });
        expect(list[0].endings).toHaveLength(3);
        expect(list[0]).not.toHaveProperty("json");
    });

    it("includes the stories a group added, for that group only", async () => {
        const added = await send({ type: "m.room.message", event_id: "$f", sender: "@priya", room_id: ROOM, content: { msgtype: "m.file", body: "story add", filename: "copy.ink", url: "mxc://m/copy" } });
        expect(added.response.message).toContain("story start copy");

        const here = await (await fetch(`${base}/api/stories?roomId=${encodeURIComponent(ROOM)}`)).json();
        const shared = await (await fetch(`${base}/api/stories`)).json();

        expect(here.map((story: { id: string; addedHere: boolean }) => [story.id, story.addedHere])).toEqual([["the-stray", false], ["copy", true]]);
        expect(shared.map((story: { id: string }) => story.id)).toEqual(["the-stray"]);
    });
});

describe("GET /", () => {
    it("serves the built dashboard", async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-"));
        const html = path.join(dir, "index.html");
        fs.writeFileSync(html, "<!doctype html><title>Storytelling</title>");

        await new Promise<void>(resolve => server.close(() => resolve()));
        await listen({ dashboardHtml: html });

        const response = await fetch(`${base}/?roomId=${encodeURIComponent(ROOM)}`);
        expect(await response.text()).toContain("<title>Storytelling</title>");
    });

    it("says how to build the dashboard when it hasn't been built", async () => {
        const response = await fetch(`${base}/`);

        expect(response.status).toBe(503);
        expect(await response.text()).toContain("npm run build-web");
    });
});
