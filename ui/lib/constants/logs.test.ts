import { describe, expect, it } from "vitest";

import { RequestTypeColors, RequestTypeLabels, RequestTypes } from "./logs";

describe("logs constants", () => {
	it("registers realtime turn as a known request type", () => {
		expect(RequestTypes).toContain("realtime.turn");
		expect(RequestTypeLabels["realtime.turn"]).toBe("实时轮次");
		expect(RequestTypeColors["realtime.turn"]).toBeTruthy();
	});
});