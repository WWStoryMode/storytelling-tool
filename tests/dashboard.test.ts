import { describe, expect, it } from "vitest";
import { apiUrl, countdown, leading, progress, shares } from "../web/view";

describe("apiUrl", () => {
    it("calls the API relative to the page, so it works through the hub's proxy", () => {
        const hub = { origin: "https://hub.example.org", pathname: "/storytelling" };
        expect(apiUrl(hub, "/api/sessions", { roomId: "!abc:matrix.org" }))
            .toBe("https://hub.example.org/storytelling/api/sessions?roomId=%21abc%3Amatrix.org");
    });

    it("doesn't double the slash when the page is the server's root", () => {
        expect(apiUrl({ origin: "http://localhost:5049", pathname: "/" }, "/api/stories"))
            .toBe("http://localhost:5049/api/stories");
        expect(apiUrl({ origin: "https://hub.example.org", pathname: "/storytelling/" }, "/api/stories"))
            .toBe("https://hub.example.org/storytelling/api/stories");
    });
});

describe("countdown", () => {
    it("reads as minutes and seconds in Live mode", () => {
        expect(countdown(2 * 60_000 + 5_000)).toBe("2:05");
        expect(countdown(59_400)).toBe("0:59");
    });

    it("reads as hours and minutes for a long window", () => {
        expect(countdown(23 * 3_600_000 + 5 * 60_000)).toBe("23h 05m");
        expect(countdown(3_600_000)).toBe("1h 00m");
    });

    it("stops at zero once the close is due", () => {
        expect(countdown(0)).toBe("0:00");
        expect(countdown(-4_000)).toBe("0:00");
    });
});

describe("shares", () => {
    it("gives each choice's share of the votes as a whole percentage", () => {
        expect(shares([1, 2, 0])).toEqual([33, 67, 0]);
        expect(shares([3, 1])).toEqual([75, 25]);
    });

    it("is all zeros before anyone votes", () => {
        expect(shares([0, 0, 0])).toEqual([0, 0, 0]);
    });
});

describe("leading", () => {
    it("marks the choices with the most votes, ties included", () => {
        expect(leading([1, 3, 0])).toEqual([false, true, false]);
        expect(leading([2, 2, 1])).toEqual([true, true, false]);
    });

    it("marks nothing before anyone votes", () => {
        expect(leading([0, 0])).toEqual([false, false]);
    });
});

describe("progress", () => {
    it("counts towards the quorum", () => {
        expect(progress(2, 3)).toBe("2 of 3 votes");
        expect(progress(1, 3)).toBe("1 of 3 votes");
    });

    it("counts votes alone when only the timer closes the vote", () => {
        expect(progress(1, null)).toBe("1 vote");
        expect(progress(0, null)).toBe("No votes yet");
    });
});
