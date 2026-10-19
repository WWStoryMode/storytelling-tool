import { describe, expect, it } from "vitest";
import { configProblems } from "../src/config";

const GOOD = { PUBLIC_URL: "https://abc.ngrok-free.app", HUB_SECRET: "secret", HUB_URL: "hub.example.org" };

describe("configProblems", () => {
    it("has nothing to say about a complete setup", () => {
        expect(configProblems(GOOD)).toEqual([]);
    });

    it("warns when the hub can't reach the tool", () => {
        expect(configProblems({ ...GOOD, PUBLIC_URL: undefined })[0]).toContain("PUBLIC_URL");
        expect(configProblems({ ...GOOD, PUBLIC_URL: "http://localhost:5049" })[0]).toContain("localhost");
        expect(configProblems({ ...GOOD, PUBLIC_URL: "http://abc.ngrok-free.app" })[0]).toContain("https");
    });

    it("warns when timer messages can't be sent", () => {
        expect(configProblems({ ...GOOD, HUB_SECRET: "" })[0]).toContain("HUB_SECRET");
        expect(configProblems({ ...GOOD, HUB_URL: undefined })[0]).toContain("HUB_URL");
    });

    it("reports every problem at once", () => {
        expect(configProblems({})).toHaveLength(3);
    });
});
