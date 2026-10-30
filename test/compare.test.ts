import { describe, expect, test } from "vitest";
import { DataFactory } from "n3";
import type { Quad } from "@rdfjs/types";
import { difference, readableLines, sameQuads } from "../src/compare.ts";
import { relabelBlankNodes } from "../src/members.ts";
import { ex, observation } from "./helpers.ts";

const { blankNode, quad, literal } = DataFactory;

describe("comparing members", () => {
    test("members are equal regardless of their blank node labels", () => {
        const member = observation("a", "2026-01-01T00:00:00Z").quads;
        expect(sameQuads(member, relabelBlankNodes(member))).toBe(true);
    });

    test("a changed literal, a missing quad and an extra quad are differences", () => {
        const expected = observation("a", "2026-01-01T00:00:00Z", 1).quads;
        expect(sameQuads(expected, observation("a", "2026-01-01T00:00:00Z", 2).quads)).toBe(false);
        expect(sameQuads(expected, expected.slice(1))).toBe(false);
        expect(sameQuads(expected, [...expected, quad(ex("a"), ex("p"), ex("o")) as Quad])).toBe(false);
    });

    test("blank nodes that are not a tree are compared by isomorphism", () => {
        const cycle = (a: string, b: string) =>
            [quad(blankNode(a), ex("next"), blankNode(b)), quad(blankNode(b), ex("next"), blankNode(a))] as Quad[];
        const chain = [
            quad(blankNode("x"), ex("next"), blankNode("y")),
            quad(blankNode("y"), ex("next"), blankNode("z")),
        ] as Quad[];
        expect(sameQuads(cycle("a", "b"), cycle("c", "d"))).toBe(true);
        expect(sameQuads(cycle("a", "b"), chain)).toBe(false);
    });

    test("a difference is shown with nested blank nodes, without their labels", () => {
        expect(readableLines(observation("a", "2026-01-01T00:00:00Z", 1).quads)).toContain(
            '<http://example.org/a> <http://example.org/result> [ <http://example.org/unit> "vehicles"@en ; <http://example.org/value> "1"^^<http://www.w3.org/2001/XMLSchema#integer> ]',
        );
        const lines = difference(
            observation("a", "2026-01-01T00:00:00Z", 1).quads,
            observation("a", "2026-01-01T00:00:00Z", 2).quads,
        );
        expect(lines).toHaveLength(2);
        expect(lines[0]).toMatch(/^- .*"1"/);
        expect(lines[1]).toMatch(/^\+ .*"2"/);
    });

    test("literals with another language or datatype differ", () => {
        expect(
            sameQuads(
                [quad(ex("a"), ex("p"), literal("x", "en")) as Quad],
                [quad(ex("a"), ex("p"), literal("x", "nl")) as Quad],
            ),
        ).toBe(false);
    });
});
