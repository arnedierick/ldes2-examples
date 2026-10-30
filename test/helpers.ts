/**
 * Test data: small members in the shape of the real datasets.
 */
import { DataFactory } from "n3";
import type { Quad } from "@rdfjs/types";
import type { OrderedMember, SourceMember } from "../src/members.ts";
import { parseTimestamp } from "../src/time.ts";

const { namedNode, literal, blankNode, quad } = DataFactory;
export const EX = "http://example.org/";
export const ex = (name: string) => namedNode(EX + name);
const xsd = (name: string) => namedNode("http://www.w3.org/2001/XMLSchema#" + name);
export const CREATED = "http://purl.org/dc/terms/created";

/** A member like Telraam's: a typed resource with a timestamp and a nested blank node */
export function observation(name: string, time: string, value = 1): SourceMember {
    const id = ex(name);
    const result = blankNode();
    return {
        id,
        quads: [
            quad(id, namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#type"), ex("Observation")),
            quad(id, namedNode(CREATED), literal(time, xsd("dateTime"))),
            quad(id, ex("result"), result),
            quad(result, ex("value"), literal(String(value), xsd("integer"))),
            quad(result, ex("unit"), literal("vehicles", "en")),
        ] as Quad[],
    };
}

/** A member like RiverBench's timestamped named graphs: a graph, annotated with its timestamp in the default graph */
export function namedGraphElement(name: string, time: string): SourceMember {
    const graph = ex(name);
    return {
        id: graph,
        quads: [
            quad(graph, namedNode(CREATED), literal(time, xsd("dateTime"))),
            quad(ex(name + "/obs"), ex("value"), literal("21.5", xsd("decimal")), graph),
            quad(ex(name + "/obs"), ex("sensor"), ex("sensor-1"), graph),
        ] as Quad[],
    };
}

export function ordered(member: SourceMember, time?: string): OrderedMember {
    return { ...member, timestamp: time === undefined ? undefined : parseTimestamp(time) };
}
