import { describe, expect, test } from "vitest";
import {
    bucketLabel,
    bucketStart,
    bucketsIn,
    compareTimestamps,
    formatInstant,
    justAfter,
    parseTimestamp,
} from "../src/time.ts";

const ts = (value: string) => parseTimestamp(value)!;

describe("timestamps", () => {
    test("parses timestamps with and without timezone, keeping their lexical form", () => {
        expect(ts("2026-10-28T08:00:00+02:00")).toEqual({
            lexical: "2026-10-28T08:00:00+02:00",
            epochMs: Date.parse("2026-10-28T06:00:00Z"),
            subMs: "",
            zoned: true,
        });
        // RiverBench timestamps have microseconds and no timezone
        expect(ts("2023-01-02T15:36:37.065535")).toMatchObject({
            epochMs: Date.parse("2023-01-02T15:36:37.065Z"),
            subMs: "535",
            zoned: false,
        });
        expect(parseTimestamp("2026-10-28")).toBeUndefined();
        expect(parseTimestamp("yesterday")).toBeUndefined();
    });

    test("compares beyond milliseconds", () => {
        expect(compareTimestamps(ts("2023-01-02T15:36:37.065535"), ts("2023-01-02T15:36:37.0655351"))).toBe(-1);
        expect(compareTimestamps(ts("2023-01-02T15:36:37.0655"), ts("2023-01-02T15:36:37.065500"))).toBe(0);
        expect(compareTimestamps(ts("2026-10-28T08:00:00Z"), ts("2026-10-28T09:00:00+02:00"))).toBe(1);
    });

    test("an upper bound just after a timestamp includes it, also with microseconds", () => {
        const value = ts("2023-01-02T15:36:37.065999");
        const bound = ts(formatInstant(justAfter(value), value.zoned));
        expect(compareTimestamps(value, bound)).toBe(-1);
        expect(bound.lexical).toBe("2023-01-02T15:36:37.066");
    });

    test("buckets are hours or days in UTC", () => {
        const start = bucketStart(ts("2026-10-28T08:59:59Z"), "hour");
        expect(new Date(start).toISOString()).toBe("2026-10-28T08:00:00.000Z");
        expect(bucketLabel(start, "hour")).toBe("2026-10-28T08");
        expect(bucketLabel(start, "day")).toBe("2026-10-28");
        expect(bucketsIn(new Date("2026-10-28T08:30:00Z"), new Date("2026-10-28T10:00:00Z"), "hour")).toHaveLength(2);
    });
});
