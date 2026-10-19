import { TOOL_ID, type ChatMessage } from "./voting";

// Posts messages that have no incoming event to reply to (timer closes, pauses, reminders)
// through the hub's /api/send. See NOTES.md, "What /api/send expects".

const TIMEOUT_MS = 10_000;

// HUB_URL may be a bare host, as events-tool's dashboard_url is: https:// is added, or http:// for localhost
export function hubBaseUrl(value: string) {
    const url = value.trim().replace(/\/+$/, "");
    if (/^https?:\/\//i.test(url)) return url;

    const scheme = /^(localhost|127\.0\.0\.1)(:|$)/i.test(url) ? "http" : "https";
    return `${scheme}://${url}`;
}

export function sendUrl(hubUrl: string, roomId: string, secret: string) {
    const query = new URLSearchParams({ roomId, toolId: TOOL_ID, secret });
    return `${hubBaseUrl(hubUrl)}/api/send?${query}`;
}

// The event form: the hub sends it as is, so the beat's context survives. `{ message }` would drop it.
export function sendBody(message: ChatMessage) {
    return {
        event: {
            type: "m.room.message",
            msgtype: "m.text",
            body: message.message,
            ...(message.context ? { context: message.context } : {}),
        },
    };
}

export function createHubPoster(options: { hubUrl: string; secret: string; fetch?: typeof fetch }) {
    const send = options.fetch ?? fetch;

    return async (roomId: string, messages: ChatMessage[]) => {
        // One at a time, stopping at a failure. A timer sends one message, which is what keeps chat order:
        // /api/send replies before Matrix has the message, so even sequential sends could cross
        for (const message of messages) {
            const response = await send(sendUrl(options.hubUrl, roomId, options.secret), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(sendBody(message)),
                signal: AbortSignal.timeout(TIMEOUT_MS),
            });
            const result: { success?: boolean; message?: string } | null = await response.json().catch(() => null);

            // The URL holds the secret, so errors name the reason only
            if (!response.ok || !result?.success)
                throw new Error(`The hub didn't send the message: ${result?.message ?? `HTTP ${response.status}`}`);
        }
    };
}
