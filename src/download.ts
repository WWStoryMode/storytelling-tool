import path from "path";
import { hubBaseUrl } from "./hub";

// Fetches story files for `story add` (an attachment, through the hub) and `story load` (a raw link).
// Anyone in a group can trigger these, so links are limited to known hosts, and every download is capped.

export const MAX_STORY_BYTES = 200 * 1024;
const TIMEOUT_MS = 10_000;

// Raw text hosts only, over https: a story link can't reach anything else from the server (SPEC, "Fetch limits")
export const STORY_HOSTS = ["raw.githubusercontent.com", "gist.githubusercontent.com", "pastebin.com"];

const HOSTS_HINT = `Story links must be https:// raw links from ${STORY_HOSTS.join(", ")}. Open the file and use its Raw button.`;

export type StoryLoader = {
    attachment: (mxcUrl: string) => Promise<string>;
    url: (url: string) => Promise<string>;
};

export function checkStoryUrl(text: string): { ok: true; url: string; fileName: string } | { ok: false; message: string } {
    let url: URL;
    try {
        url = new URL(text);
    } catch {
        return { ok: false, message: HOSTS_HINT };
    }

    // A GitHub file page has the same path as its raw link, apart from /blob
    const page = url.protocol === "https:" && url.hostname === "github.com" && url.pathname.match(/^(\/[^/]+\/[^/]+)\/blob(\/.+)$/);
    if (page)
        url = new URL(`https://raw.githubusercontent.com${page[1]}${page[2]}`);

    // A paste's page is pastebin.com/<id>; its text is at /raw/<id>
    const paste = url.protocol === "https:" && url.hostname === "pastebin.com" && url.pathname.match(/^\/(?:raw\/)?([A-Za-z0-9]+)\/?$/);
    if (paste)
        url = new URL(`https://pastebin.com/raw/${paste[1]}`);

    if (url.protocol !== "https:" || !STORY_HOSTS.includes(url.hostname) || (url.hostname === "pastebin.com" && !paste))
        return { ok: false, message: HOSTS_HINT };

    const last = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? "story");
    const fileName = [".ink", ".json"].includes(path.extname(last).toLowerCase()) ? last : `${last}.ink`;
    return { ok: true, url: url.toString(), fileName };
}

export async function downloadText(url: string, options: { fetch?: typeof fetch; maxBytes?: number; timeoutMs?: number } = {}) {
    const send = options.fetch ?? fetch;
    const maxBytes = options.maxBytes ?? MAX_STORY_BYTES;
    const tooBig = () => new Error(`the file is too big (the limit is ${Math.round(maxBytes / 1024)} KB)`);

    let response: Response;
    try {
        // No redirects: an allowed host could otherwise send the request somewhere else
        response = await send(url, { redirect: "error", signal: AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS) });
    } catch (err) {
        if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError"))
            throw new Error("the download took too long");
        throw new Error("the download failed");
    }

    // GitHub answers 404 for a private repo too
    if (response.status === 404) throw new Error("HTTP 404, not found. Check the link, and that the file is public.");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (Number(response.headers.get("content-length")) > maxBytes) throw tooBig();

    // Read in chunks, so a server that doesn't declare the size still can't send more than the limit
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (response.body) {
        const reader = response.body.getReader();
        for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
            size += chunk.value.byteLength;
            if (size > maxBytes) {
                await reader.cancel();
                throw tooBig();
            }
            chunks.push(chunk.value);
        }
    }

    return Buffer.concat(chunks).toString("utf8").replace(/^﻿/, "");
}

export function createStoryLoader(options: { hubUrl: string | null; fetch?: typeof fetch }): StoryLoader {
    return {
        // The hub downloads Matrix media with its own login, through /api/content
        attachment: async mxcUrl => {
            if (!options.hubUrl) throw new Error("the server needs HUB_URL set to download attachments");
            if (!/^mxc:\/\/[^/]+\/[^/]+$/.test(mxcUrl)) throw new Error("the attachment has no file link");

            const query = new URLSearchParams({ mxcUrl });
            return downloadText(`${hubBaseUrl(options.hubUrl)}/api/content?${query}`, { fetch: options.fetch });
        },
        url: async url => {
            const checked = checkStoryUrl(url);
            if ("message" in checked) throw new Error(checked.message);
            return downloadText(checked.url, { fetch: options.fetch });
        },
    };
}
