/**
 * The converter and the checker together, with an in-memory source, so without network.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import type { Quad } from "@rdfjs/types";
import { check } from "../src/check.ts";
import { parseConfig, type DatasetConfig, type Membership } from "../src/config.ts";
import { convert } from "../src/convert.ts";
import { MemberError, type SourceMember } from "../src/members.ts";
import { SettingsError } from "../src/settings.ts";
import type { Reference, SampledMember, Source, SourceDescription } from "../src/sources/index.ts";
import { CREATED, EX, observation } from "./helpers.ts";

/** A source of members in memory, which is its own reference */
class MemorySource implements Source {
    readonly items: SourceMember[];
    readonly description: Partial<SourceDescription>;

    constructor(items: SourceMember[], description: Partial<SourceDescription> = {}) {
        this.items = items;
        this.description = description;
    }

    async describe(): Promise<SourceDescription> {
        return { iri: EX + "source", catalog: [], timestampPath: CREATED, graphs: false, ...this.description };
    }

    async *members() {
        yield* this.items;
    }

    async baseline() {
        return undefined;
    }

    async references(sample: SampledMember[]): Promise<Reference[]> {
        const ids = new Set(sample.map((member) => member.id));
        return [
            {
                name: "the memory",
                members: new Map(this.items.filter((m) => ids.has(m.id.value)).map((m) => [m.id.value, m.quads])),
                counts: [{ label: "the memory", expected: this.items.length, includes: () => true }],
            },
        ];
    }
}

const members = Array.from({ length: 12 }, (_, i) =>
    observation(`m${i}`, `2026-01-01T0${Math.floor(i / 4)}:${String(i * 4).padStart(2, "0")}:00Z`, i),
);

let outDir: string;
beforeAll(() => {
    outDir = fs.mkdtempSync(path.join(os.tmpdir(), "ldes2-convert-"));
});
afterAll(() => fs.rmSync(outDir, { recursive: true, force: true }));

function config(id: string, extra: Record<string, unknown> = {}): DatasetConfig {
    return parseConfig({ source: { type: "riverbench", dataset: "unused" }, ...extra }, id);
}

const byType: Membership = { type: EX + "Observation" };

describe("convert and check", () => {
    test("a conversion in every page format passes the check", async () => {
        const source = new MemorySource(members, { membership: byType });
        const stats = await convert(config("all-formats", { pages: { size: 5, bucket: "hour" } }), source, { outDir });
        expect(stats.members).toBe(12);
        expect(stats.formats).toEqual(["turtle", "ntriples", "jelly"]);
        expect(stats.pages.map((page) => page.name)).toEqual([
            "2026-01-01T00-0000",
            "2026-01-01T01-0000",
            "2026-01-01T02-0000",
        ]);
        expect(fs.existsSync(path.join(outDir, "all-formats", "catalog.ttl"))).toBe(true);

        const result = await check(config("all-formats"), source, { outDir, sample: 5 });
        expect(result.failures).toEqual([]);
        expect(result.passed).toBeGreaterThan(5);
    });

    test("explicit membership adds an ldes:member triple, which the check accounts for", async () => {
        const source = new MemorySource(members, { membership: "explicit" });
        await convert(config("explicit", { formats: ["turtle", "jelly"] }), source, { outDir });
        const page = fs.readFileSync(path.join(outDir, "explicit", "turtle", "page-00000.ldes.ttl"), "utf8");
        expect(page).toContain("ldes:member");
        expect((await check(config("explicit"), source, { outDir, sample: 12 })).failures).toEqual([]);
    });

    test("a member that changed after the conversion is found by the check", async () => {
        const source = new MemorySource(members, { membership: byType });
        await convert(config("tampered", { formats: ["turtle"] }), source, { outDir });
        const file = path.join(outDir, "tampered", "turtle", "page-00000.ldes.ttl");
        fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace('"vehicles"@en', '"bicycles"@en'));

        const result = await check(config("tampered"), source, { outDir, sample: 12 });
        expect(result.failures).toHaveLength(1);
        expect(result.failures[0]).toMatch(/turtle = A: 11 of 12 members are identical/);
    });

    test("a limit and a window select members, and a limited conversion skips the counts", async () => {
        const source = new MemorySource(members, { membership: byType });
        const window = { from: "2026-01-01T01:00:00Z", until: "2026-01-01T03:00:00Z", limit: 6 };
        const stats = await convert(config("window", { window, formats: ["jelly"] }), source, { outDir });
        expect([stats.members, stats.truncated]).toEqual([6, true]);
        expect((await check(config("window"), source, { outDir, sample: 3 })).failures).toEqual([]);
    });

    test("members without timestamps are converted in implicit order", async () => {
        const source = new MemorySource(members, { membership: byType, timestampPath: undefined });
        const stats = await convert(config("implicit", { pages: { size: 5 }, formats: ["ntriples"] }), source, {
            outDir,
        });
        expect(stats.timestampPath).toBeUndefined();
        expect(fs.readFileSync(path.join(outDir, "implicit", "ntriples", "root.trig"), "utf8")).toContain(
            "ldes:pageNumber",
        );
        expect((await check(config("implicit"), source, { outDir })).failures).toEqual([]);
    });
});

describe("the converter refuses what a client would read differently", () => {
    test("members that are not in order of their timestamp", async () => {
        const source = new MemorySource([members[1], members[0]], { membership: byType });
        await expect(convert(config("unordered"), source, { outDir })).rejects.toThrow(/not in ascending order/);
    });

    test("a membership rule that does not find the member", async () => {
        const source = new MemorySource(members, { membership: { type: EX + "Other" } });
        await expect(convert(config("wrong-type"), source, { outDir })).rejects.toThrow(MemberError);
    });

    test("a source that does not say how members are identified, without configuration", async () => {
        await expect(convert(config("no-membership"), new MemorySource(members), { outDir })).rejects.toThrow(
            SettingsError,
        );
    });

    test("named graphs in a format that cannot hold them", async () => {
        const withGraph = {
            ...members[0],
            quads: members[0].quads.map((quad) => ({ ...quad, graph: members[0].id }) as Quad),
        };
        const source = new MemorySource([withGraph], { membership: byType, graphs: true });
        await expect(convert(config("graphs", { formats: ["turtle"] }), source, { outDir })).rejects.toThrow(
            /cannot contain/,
        );
    });
});
