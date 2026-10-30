import { describe, expect, test } from "vitest";
import { Pager } from "../src/pager.ts";
import { observation, ordered } from "./helpers.ts";

const at = (time: string) => ordered(observation(time, time), time);

function paginate(pager: Pager, times: string[]) {
    const starts = times.map((time) => pager.place(at(time)).isNew);
    return { starts, pages: pager.finish() };
}

describe("Pager", () => {
    test("without a page size or bucket, all members are in one page with the interval of their timestamps", () => {
        const { pages } = paginate(new Pager({}), ["2026-01-01T00:00:00Z", "2026-01-01T00:30:00Z"]);
        expect(pages).toEqual([
            {
                number: 0,
                name: "page-00000",
                members: 2,
                quads: 10,
                timeFrom: "2026-01-01T00:00:00Z",
                timeUntil: "2026-01-01T00:30:00.001Z",
            },
        ]);
    });

    test("a page size splits the members", () => {
        const { starts, pages } = paginate(new Pager({ size: 2 }), [
            "2026-01-01T00:00:00Z",
            "2026-01-01T00:10:00Z",
            "2026-01-01T00:20:00Z",
        ]);
        expect(starts).toEqual([true, false, true]);
        expect(pages.map((page) => [page.name, page.members, page.timeFrom, page.timeUntil])).toEqual([
            ["page-00000", 2, "2026-01-01T00:00:00Z", "2026-01-01T00:10:00.001Z"],
            ["page-00001", 1, "2026-01-01T00:20:00Z", "2026-01-01T00:20:00.001Z"],
        ]);
    });

    test("buckets give every hour its own pages, which together cover the hour", () => {
        const { pages } = paginate(new Pager({ size: 2, bucket: "hour" }), [
            "2026-01-01T08:00:00Z",
            "2026-01-01T08:00:00Z",
            "2026-01-01T08:00:00Z",
            "2026-01-01T09:15:00Z",
        ]);
        expect(pages.map((page) => [page.name, page.members, page.timeFrom, page.timeUntil])).toEqual([
            ["2026-01-01T08-0000", 2, "2026-01-01T08:00:00.000Z", "2026-01-01T08:00:00.001Z"],
            // Members with the same timestamp in two pages: the intervals overlap
            ["2026-01-01T08-0001", 1, "2026-01-01T08:00:00Z", "2026-01-01T09:00:00.000Z"],
            ["2026-01-01T09-0000", 1, "2026-01-01T09:00:00.000Z", "2026-01-01T10:00:00.000Z"],
        ]);
    });

    test("pages per bucket without a page size are named after the bucket", () => {
        const { pages } = paginate(new Pager({ bucket: "day" }), ["2026-01-01T08:00:00Z", "2026-01-02T08:00:00Z"]);
        expect(pages.map((page) => page.name)).toEqual(["2026-01-01", "2026-01-02"]);
    });

    test("timestamps without timezone give bounds without timezone", () => {
        const { pages } = paginate(new Pager({ bucket: "hour" }), ["2023-01-02T15:36:37.065535"]);
        expect([pages[0].timeFrom, pages[0].timeUntil]).toEqual(["2023-01-02T15:00:00.000", "2023-01-02T16:00:00.000"]);
    });

    test("members without timestamps (implicit order) only get page numbers", () => {
        const pager = new Pager({ size: 1 });
        pager.place(ordered(observation("a", "x")));
        pager.place(ordered(observation("b", "x")));
        expect(pager.finish().map((page) => [page.number, page.timeFrom, page.timeUntil])).toEqual([
            [0, undefined, undefined],
            [1, undefined, undefined],
        ]);
    });

    test("buckets need timestamps, and a page size must be a positive integer", () => {
        expect(() => new Pager({ bucket: "hour" }).place(ordered(observation("a", "x")))).toThrow(/timestamp/);
        expect(() => new Pager({ size: 0 })).toThrow(/positive integer/);
    });
});
