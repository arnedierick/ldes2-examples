/**
 * Checks that a conversion lost no information.
 *
 *  1. Every format is read back with ldes-client, which must find the same members in all of them, and as many as
 *     the conversion wrote.
 *  2. The number of members per part of the source (e.g. per hour), read again now, must be the same in the LDES 2.0,
 *     unless the conversion was cut off by a limit.
 *  3. A seeded random sample of members is read again from the source, in one or more independent ways (see the
 *     `references` of every source), and every sampled member of every format must have the same quads as in every
 *     reference (blank nodes compared by isomorphism).
 */
import type { Quad } from "@rdfjs/types";
import type { DatasetConfig, FormatName } from "./config.ts";
import { readMembers } from "./client.ts";
import { difference, sameQuads } from "./compare.ts";
import { memberTimestamp } from "./members.ts";
import { OutputLayout, readStats, type Stats } from "./output.ts";
import type { SampledMember, Source } from "./sources/index.ts";
import { NS } from "./vocab.ts";

export type CheckOptions = {
    outDir?: string;
    /** The number of members to compare with the source */
    sample?: number;
    /** The seed of the random sample, so that a check can be repeated */
    seed?: number;
    /** Only check these formats */
    formats?: FormatName[];
    log?: (line: string) => void;
};

export type CheckResult = {
    passed: number;
    failures: string[];
    stats: Stats;
    /** The number of sampled members */
    sample: number;
    /** The number of comparisons of a sampled member in one format with one reference */
    comparisons: number;
};

/** A seeded pseudo random number generator (mulberry32) */
export function random(seed: number): () => number {
    let state = seed;
    return () => {
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Picks `size` different items, the same ones for the same seed */
export function pickSample<T>(items: T[], size: number, seed: number): T[] {
    const next = random(seed);
    const picked = new Set<number>();
    while (picked.size < Math.min(size, items.length)) picked.add(Math.floor(next() * items.length));
    return [...picked].sort((a, b) => a - b).map((index) => items[index]);
}

/** The quads of a member as the converter got them: without the ldes:member triple it adds for explicit membership */
function withoutMemberTriple(quads: Quad[], id: string): Quad[] {
    return quads.filter((quad) => !(quad.predicate.value === NS.ldes + "member" && quad.object.value === id));
}

export async function check(config: DatasetConfig, source: Source, options: CheckOptions = {}): Promise<CheckResult> {
    const log = options.log ?? (() => undefined);
    const layout = new OutputLayout(config.id, options.outDir);
    const stats = readStats(layout);
    const formats = options.formats ?? stats.formats;
    const failures: string[] = [];
    let passed = 0;
    const verify = (ok: boolean, message: string, details: string[] = []) => {
        log(`  ${ok ? "ok  " : "FAIL"} ${message}`);
        for (const line of details) log(`         ${line}`);
        if (ok) passed++;
        else failures.push(message);
    };
    const timestampPath = stats.timestampPath;

    // 1. Every format read back: all members of the first, to sample from and count, and the IDs of the others
    log(`1. Every format, read back with ldes-client, has all ${stats.members} converted members`);
    const all: SampledMember[] = [];
    for await (const member of readMembers(layout.rootFile(formats[0]))) {
        all.push({
            id: member.id.value,
            timestamp: timestampPath ? memberTimestamp(member, timestampPath) : undefined,
        });
    }
    verify(all.length === stats.members, `${formats[0]}: ${all.length} members (converted: ${stats.members})`);
    const sample = pickSample(all, options.sample ?? 50, options.seed ?? 1);
    const sampleIds = new Set(sample.map((member) => member.id));
    const allIds = all
        .map((member) => member.id)
        .sort()
        .join("\n");
    const converted = new Map<FormatName, Map<string, Quad[]>>();
    for (const format of formats) {
        const members = new Map<string, Quad[]>();
        const ids: string[] = [];
        for await (const member of readMembers(layout.rootFile(format))) {
            ids.push(member.id.value);
            if (sampleIds.has(member.id.value)) members.set(member.id.value, member.quads);
        }
        converted.set(format, members);
        if (format !== formats[0]) {
            verify(ids.sort().join("\n") === allIds, `${format}: the same ${all.length} members as ${formats[0]}`);
        }
    }

    // The source, read again now, independently of the conversion
    const references = await source.references(sample, {
        membership: stats.membership,
        timestampPath,
        from: stats.window.from ? new Date(stats.window.from) : undefined,
        until: stats.window.until ? new Date(stats.window.until) : undefined,
    });
    const letters = references.map((_, i) => String.fromCharCode(65 + i));

    // 2. The number of members per part of the source
    log("");
    log("2. The LDES 2.0 has as many members as the source, which is read again now");
    if (stats.truncated) {
        log("  (skipped: the conversion stopped at its limit, so it does not have all members of the source)");
    } else {
        for (const reference of references) {
            for (const count of reference.counts) {
                const actual = all.filter(count.includes).length;
                verify(
                    actual === count.expected,
                    `${count.label}: ${count.expected} members in the source, ${actual} in the LDES 2.0`,
                );
            }
        }
    }

    // 3. Every sampled member, in every format, against every reference
    log("");
    log(
        `3. A random sample of ${sample.length} members (seed ${options.seed ?? 1}) is identical, quad by quad, to the source`,
    );
    log("   The sample is read again from the source in independent ways:");
    references.forEach((reference, i) => log(`     ${letters[i]}: ${reference.name}`));
    let comparisons = 0;
    for (const format of formats) {
        for (const [i, reference] of references.entries()) {
            const differences: string[] = [];
            let different = 0;
            for (const { id } of sample) {
                comparisons++;
                const expected = reference.members.get(id);
                const actual = converted.get(format)!.get(id);
                if (!expected || !actual) {
                    different++;
                    differences.push(`<${id}> is not in ${!expected ? letters[i] : format}`);
                } else if (!sameQuads(expected, withoutMemberTriple(actual, id))) {
                    different++;
                    const lines = difference(expected, withoutMemberTriple(actual, id));
                    differences.push(
                        `<${id}> differs (- only in ${letters[i]}, + only in ${format}):`,
                        ...lines.map((line) => `  ${line}`),
                    );
                }
            }
            verify(
                different === 0,
                `${format} = ${letters[i]}: ${sample.length - different} of ${sample.length} members are identical`,
                differences,
            );
        }
    }
    return { passed, failures, stats, sample: sample.length, comparisons };
}
