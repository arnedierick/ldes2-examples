import { describe, expect, test } from "vitest";
import { DataFactory } from "n3";
import type { Quad } from "@rdfjs/types";
import { identifyMember, memberTimestamp, relabelBlankNodes } from "../src/members.ts";
import { CREATED, EX, ex, namedGraphElement, observation } from "./helpers.ts";

describe("membership rules", () => {
    test("ldes:memberType finds the only subject of the type", () => {
        const member = observation("a", "2026-01-01T00:00:00Z");
        expect(identifyMember({ type: EX + "Observation" }, member.quads).value).toBe(EX + "a");
    });

    test("ldes:memberType fails when the type occurs zero or several times", () => {
        const two = [
            ...observation("a", "2026-01-01T00:00:00Z").quads,
            ...observation("b", "2026-01-01T00:00:00Z").quads,
        ];
        expect(() => identifyMember({ type: EX + "Observation" }, two)).toThrow(/2 candidates/);
        expect(() => identifyMember({ type: EX + "Other" }, two)).toThrow(/0 candidates/);
    });

    test("ldes:memberGraph finds the named graph", () => {
        expect(identifyMember("graph", namedGraphElement("g", "2026-01-01T00:00:00Z").quads).value).toBe(EX + "g");
    });

    test("explicit membership uses the identifier it is given", () => {
        expect(identifyMember("explicit", [], ex("m")).value).toBe(EX + "m");
        expect(() => identifyMember("explicit", [])).toThrow();
    });
});

describe("member timestamps", () => {
    test("the timestamp path is followed from the member, in any graph", () => {
        expect(memberTimestamp(namedGraphElement("g", "2026-01-01T00:00:00Z"), CREATED).lexical).toBe(
            "2026-01-01T00:00:00Z",
        );
    });

    test("a member needs exactly one timestamp that is an xsd:dateTime", () => {
        expect(() => memberTimestamp(observation("a", "2026-01-01T00:00:00Z"), EX + "missing")).toThrow(/0 values/);
        expect(() => memberTimestamp(observation("a", "not a date"), CREATED)).toThrow(/not an xsd:dateTime/);
    });
});

test("blank nodes get short labels per message, consistently within the message", () => {
    const { blankNode, quad } = DataFactory;
    const long = blankNode("df_123_456_abcdef");
    const quads = relabelBlankNodes([quad(ex("a"), ex("p"), long), quad(long, ex("q"), blankNode("other"))] as Quad[]);
    expect(quads.map((q) => [q.subject.value, q.object.value])).toEqual([
        [EX + "a", "b0"],
        ["b0", "b1"],
    ]);
});
