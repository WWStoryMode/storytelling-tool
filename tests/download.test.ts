import { describe, expect, it } from "vitest";
import { checkStoryUrl, createStoryLoader, downloadText, MAX_STORY_BYTES } from "../src/download";

type Call = { url: string; init: RequestInit };

function fakeFetch(reply: (url: string) => Response | Promise<Response>) {
    const calls: Call[] = [];
    const fetch = async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), init: init ?? {} });
        return reply(String(url));
    };
    return { calls, fetch: fetch as typeof globalThis.fetch };
}

describe("checkStoryUrl", () => {
    it("accepts raw GitHub and gist links", () => {
        for (const link of [
            "https://raw.githubusercontent.com/priya/stories/main/lantern.ink",
            "https://gist.githubusercontent.com/priya/0a1b2c/raw/lantern.ink",
        ])
            expect(checkStoryUrl(link)).toEqual({ ok: true, url: link, fileName: "lantern.ink" });
    });

    it("turns a GitHub file page into its raw link", () => {
        expect(checkStoryUrl("https://github.com/priya/stories/blob/main/tales/The%20Lantern.ink")).toEqual({
            ok: true,
            url: "https://raw.githubusercontent.com/priya/stories/main/tales/The%20Lantern.ink",
            fileName: "The Lantern.ink",
        });
    });

    it("takes a paste's raw text, from its page link or its raw link", () => {
        for (const link of ["https://pastebin.com/AbC123xy", "https://pastebin.com/raw/AbC123xy"])
            expect(checkStoryUrl(link)).toEqual({ ok: true, url: "https://pastebin.com/raw/AbC123xy", fileName: "AbC123xy.ink" });
        expect(checkStoryUrl("https://pastebin.com/u/priya").ok).toBe(false);
    });

    it("treats a link with no extension as Ink", () => {
        expect(checkStoryUrl("https://gist.githubusercontent.com/priya/0a1b2c/raw")).toMatchObject({ ok: true, fileName: "raw.ink" });
    });

    it("refuses other hosts, plain http and things that aren't links", () => {
        for (const link of ["https://example.com/lantern.ink", "http://raw.githubusercontent.com/a/b/main/x.ink", "lantern.ink", "https://raw.githubusercontent.com.evil.example/x.ink"]) {
            const result = checkStoryUrl(link);
            expect(result.ok).toBe(false);
            expect(!result.ok && result.message).toContain("raw.githubusercontent.com");
        }
    });
});

describe("downloadText", () => {
    it("returns the text, without a byte order mark", async () => {
        const { fetch, calls } = fakeFetch(() => new Response("﻿# title: Lantern"));

        expect(await downloadText("https://raw.githubusercontent.com/x.ink", { fetch })).toBe("# title: Lantern");
        expect(calls[0].init.redirect).toBe("error");
        expect(calls[0].init.signal).toBeDefined();
    });

    it("says why when the server refuses", async () => {
        const { fetch } = fakeFetch(() => new Response("Not Found", { status: 404 }));
        await expect(downloadText("https://raw.githubusercontent.com/x.ink", { fetch })).rejects.toThrow("HTTP 404");
    });

    it("stops at the size limit, whether or not the server says the size", async () => {
        const big = "x".repeat(MAX_STORY_BYTES + 1);
        const declared = fakeFetch(() => new Response(big, { headers: { "Content-Length": String(big.length) } }));
        const streamed = fakeFetch(() => new Response(new Blob([big]).stream()));

        await expect(downloadText("https://raw.githubusercontent.com/x.ink", { fetch: declared.fetch })).rejects.toThrow("too big");
        await expect(downloadText("https://raw.githubusercontent.com/x.ink", { fetch: streamed.fetch })).rejects.toThrow("too big");
    });

    it("gives up after the timeout", async () => {
        const fetch = ((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) =>
            init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)))) as typeof globalThis.fetch;

        await expect(downloadText("https://raw.githubusercontent.com/x.ink", { fetch, timeoutMs: 20 })).rejects.toThrow("took too long");
    });
});

describe("createStoryLoader", () => {
    it("downloads an attachment through the hub's media route", async () => {
        const { fetch, calls } = fakeFetch(() => new Response("# title: Lantern"));
        const loader = createStoryLoader({ hubUrl: "hub.example.org", fetch });

        expect(await loader.attachment("mxc://matrix.example/AbC123")).toBe("# title: Lantern");
        expect(calls[0].url).toBe("https://hub.example.org/api/content?mxcUrl=mxc%3A%2F%2Fmatrix.example%2FAbC123");
    });

    it("refuses an attachment link that isn't Matrix media", async () => {
        const { fetch, calls } = fakeFetch(() => new Response(""));
        const loader = createStoryLoader({ hubUrl: "hub.example.org", fetch });

        await expect(loader.attachment("https://example.com/x.ink")).rejects.toThrow();
        expect(calls).toHaveLength(0);
    });

    it("explains that attachments need HUB_URL", async () => {
        const loader = createStoryLoader({ hubUrl: null });
        await expect(loader.attachment("mxc://matrix.example/AbC123")).rejects.toThrow("HUB_URL");
    });

    it("downloads a link directly", async () => {
        const { fetch, calls } = fakeFetch(() => new Response("# title: Lantern"));
        const loader = createStoryLoader({ hubUrl: null, fetch });

        expect(await loader.url("https://raw.githubusercontent.com/a/b/main/lantern.ink")).toBe("# title: Lantern");
        expect(calls[0].url).toBe("https://raw.githubusercontent.com/a/b/main/lantern.ink");
    });
});
