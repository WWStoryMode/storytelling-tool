import { describe, expect, it } from "vitest";
import { createHubPoster, hubBaseUrl, sendBody, sendUrl } from "../src/hub";

type Call = { url: string; init: RequestInit };

function fakeFetch(replies: { status?: number; body: unknown }[] = []) {
    const calls: Call[] = [];
    const fetch = async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), init: init ?? {} });
        const reply = replies[calls.length - 1] ?? { body: { success: true } };
        return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200 });
    };
    return { calls, fetch: fetch as typeof globalThis.fetch };
}

describe("hubBaseUrl", () => {
    it("adds https:// to a bare host, or http:// for localhost, as events-tool does", () => {
        expect(hubBaseUrl("hub.example.org")).toBe("https://hub.example.org");
        expect(hubBaseUrl("localhost:3000")).toBe("http://localhost:3000");
        expect(hubBaseUrl("https://hub.example.org/")).toBe("https://hub.example.org");
        expect(hubBaseUrl("  http://10.0.0.5:8080  ")).toBe("http://10.0.0.5:8080");
    });
});

describe("sendUrl", () => {
    it("puts the room, tool ID and secret in the query string, encoded", () => {
        const url = new URL(sendUrl("hub.example.org", "!abc:matrix.org", "s3cr&t"));

        expect(url.origin + url.pathname).toBe("https://hub.example.org/api/send");
        expect(url.searchParams.get("roomId")).toBe("!abc:matrix.org");
        expect(url.searchParams.get("toolId")).toBe("storytelling");
        expect(url.searchParams.get("secret")).toBe("s3cr&t");
    });
});

describe("sendBody", () => {
    it("uses the event form, so the beat context reaches the chat", () => {
        expect(sendBody({ message: "A beat", context: { tool: "storytelling", beatId: "s1:2" } })).toEqual({
            event: { type: "m.room.message", msgtype: "m.text", body: "A beat", context: { tool: "storytelling", beatId: "s1:2" } },
        });
    });

    it("leaves out the context when a message has none", () => {
        expect(sendBody({ message: "THE END" })).toEqual({ event: { type: "m.room.message", msgtype: "m.text", body: "THE END" } });
    });
});

describe("createHubPoster", () => {
    it("posts each message in order, as JSON", async () => {
        const { calls, fetch } = fakeFetch();
        const post = createHubPoster({ hubUrl: "hub.example.org", secret: "s", fetch });

        await post("!room:hub", [{ message: "one" }, { message: "two", context: { tool: "storytelling", beatId: "x:1" } }]);

        expect(calls).toHaveLength(2);
        expect(calls[0].init.method).toBe("POST");
        expect(new Headers(calls[0].init.headers).get("Content-Type")).toBe("application/json");
        expect(JSON.parse(String(calls[0].init.body)).event.body).toBe("one");
        expect(JSON.parse(String(calls[1].init.body)).event.context).toEqual({ tool: "storytelling", beatId: "x:1" });
    });

    it("waits for each send before the next, so the chat sees them in order", async () => {
        const order: string[] = [];
        let release: () => void = () => {};
        const fetch = (async (_url: unknown, init?: RequestInit) => {
            const body = JSON.parse(String(init?.body)).event.body;
            order.push(`start ${body}`);
            if (body === "one") await new Promise<void>(resolve => { release = resolve; });
            order.push(`end ${body}`);
            return new Response(JSON.stringify({ success: true }));
        }) as typeof globalThis.fetch;

        const sending = createHubPoster({ hubUrl: "hub", secret: "s", fetch })("!r", [{ message: "one" }, { message: "two" }]);
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(order).toEqual(["start one"]);

        release();
        await sending;
        expect(order).toEqual(["start one", "end one", "start two", "end two"]);
    });

    it("fails with the hub's reason, without the secret, when the hub refuses", async () => {
        const { fetch } = fakeFetch([{ body: { success: false, message: "module is not active in this room" } }]);
        const post = createHubPoster({ hubUrl: "hub", secret: "top-secret", fetch });

        const error = await post("!r", [{ message: "x" }]).catch(err => err as Error);
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain("module is not active in this room");
        expect((error as Error).message).not.toContain("top-secret");
    });

    it("fails on an HTTP error or a reply that isn't JSON", async () => {
        const broken = (async () => new Response("<html>Bad gateway</html>", { status: 502 })) as typeof globalThis.fetch;
        await expect(createHubPoster({ hubUrl: "hub", secret: "s", fetch: broken })("!r", [{ message: "x" }])).rejects.toThrow("HTTP 502");
    });

    it("stops at the first failure, so later messages aren't sent out of order", async () => {
        const { calls, fetch } = fakeFetch([{ body: { success: false, message: "nope" } }]);
        await expect(createHubPoster({ hubUrl: "hub", secret: "s", fetch })("!r", [{ message: "one" }, { message: "two" }])).rejects.toThrow();
        expect(calls).toHaveLength(1);
    });
});
