/**
 * Every page format, read back by ldes-client: the client must find the same members, with the same quads.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import type { Membership } from "../src/config.ts";
import { readMembers } from "../src/client.ts";
import { sameQuads } from "../src/compare.ts";
import { relabelBlankNodes, type SourceMember } from "../src/members.ts";
import { Pager } from "../src/pager.ts";
import { rootPage } from "../src/root.ts";
import { openPage, PAGE_FORMATS, type PageFormatName } from "../src/writers.ts";
import { CREATED, EX, namedGraphElement, observation, ordered } from "./helpers.ts";

let dir: string;
beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "ldes2-writers-"));
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

/** Writes members as an LDES 2.0 with pages of `size` members, and reads it back with the client */
async function roundTrip(
    format: PageFormatName,
    members: SourceMember[],
    membership: Membership,
    size = 2,
    timestamps = true,
) {
    const folder = fs.mkdtempSync(path.join(dir, format + "-"));
    const pager = new Pager({ size });
    const graphs = members.some((member) => member.quads.some((quad) => quad.graph.termType !== "DefaultGraph"));
    let writer;
    try {
        for (const member of members) {
            const time = member.quads.find((quad) => quad.predicate.value === CREATED)!.object.value;
            const { page, isNew } = pager.place(ordered(member, timestamps ? time : undefined));
            if (isNew) {
                await writer?.end();
                writer = openPage(format, path.join(folder, `${page.name}.${PAGE_FORMATS[format].extension}`), {
                    prefixes: { ex: EX },
                    graphs,
                });
            }
            await writer!.addMessage(relabelBlankNodes(member.quads));
        }
    } finally {
        await writer?.end();
    }
    const pages = pager.finish();
    const links = pages.map((page) => ({ iri: `${page.name}.${PAGE_FORMATS[format].extension}`, page }));
    const stream = { membership, timestampPath: timestamps ? CREATED : undefined, derivedFrom: EX + "source" };
    fs.writeFileSync(path.join(folder, "root.trig"), rootPage(stream, links, ["test"]));

    const read: SourceMember[] = [];
    for await (const member of readMembers(path.join(folder, "root.trig"))) read.push(member);
    return { read, folder, pages };
}

const observations = [
    observation("a", "2026-01-01T00:00:00Z", 1),
    observation("b", "2026-01-01T00:10:00Z", 2),
    observation("c", "2026-01-01T00:20:00Z", 3),
];
const graphElements = [
    namedGraphElement("g1", "2023-01-02T15:36:37.065535"),
    namedGraphElement("g2", "2023-01-02T15:36:47.065535"),
    namedGraphElement("g3", "2023-01-02T15:36:57.065535"),
];

function expectSameMembers(read: SourceMember[], written: SourceMember[]) {
    expect(read.map((member) => member.id.value)).toEqual(written.map((member) => member.id.value));
    for (const [i, member] of read.entries()) {
        expect(sameQuads(member.quads, written[i].quads), `member ${member.id.value}`).toBe(true);
    }
}

describe.each(["turtle", "ntriples", "trig", "nquads", "jelly"] as const)("%s pages", (format) => {
    test("members identified by type, ordered on timestamp, in several pages", async () => {
        const { read, pages } = await roundTrip(format, observations, { type: EX + "Observation" });
        expect(pages).toHaveLength(2);
        expectSameMembers(read, observations);
    });

    test("members in implicit order", async () => {
        const { read } = await roundTrip(format, observations, { type: EX + "Observation" }, 1, false);
        expectSameMembers(read, observations);
    });

    if (PAGE_FORMATS[format].graphs) {
        test("members that are named graphs, with timestamps without timezone", async () => {
            const { read } = await roundTrip(format, graphElements, "graph");
            expectSameMembers(read, graphElements);
        });
    }
});

test("Turtle pages nest blank nodes and declare prefixes once", async () => {
    const { folder } = await roundTrip("turtle", observations, { type: EX + "Observation" }, 3);
    const text = fs.readFileSync(path.join(folder, "page-00000.ldes.ttl"), "utf8");
    expect(text.startsWith('VERSION "1.2-messages"\n')).toBe(true);
    expect(text.match(/PREFIX ex:/g)).toHaveLength(1);
    expect(text.match(/^MESSAGE$/gm)).toHaveLength(2);
    expect(text).toContain("ex:result [");
    expect(text).not.toContain("_:");
});

test("Turtle cannot hold named graphs", async () => {
    await expect(roundTrip("turtle", graphElements, "graph")).rejects.toThrow(/named graphs/);
});
