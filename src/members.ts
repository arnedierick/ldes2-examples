/**
 * Members and the rules of LDES 2.0 that apply to one member message.
 */
import { DataFactory } from "n3";
import type { BlankNode, NamedNode, Quad, Term } from "@rdfjs/types";
import type { Membership } from "./config.ts";
import { parseTimestamp, type Timestamp } from "./time.ts";
import { LDES_MEMBER, RDF_TYPE } from "./vocab.ts";

/** A member as a source delivers it: its identifier and all quads that belong to it */
export type SourceMember = {
    id: NamedNode;
    quads: Quad[];
};

/** A member that is ready to be written: with its timestamp, if the dataset is ordered on time */
export type OrderedMember = SourceMember & { timestamp?: Timestamp };

export class MemberError extends Error {}

function onlyIri(candidates: Term[], rule: string): NamedNode {
    const unique = new Map(candidates.map((term) => [term.termType + term.value, term]));
    if (unique.size !== 1) {
        throw new MemberError(`${rule} finds ${unique.size} candidates instead of exactly one`);
    }
    const [term] = unique.values();
    if (term.termType !== "NamedNode") throw new MemberError(`${rule} finds a ${term.termType} instead of an IRI`);
    return term;
}

/**
 * The member that a client finds in a member message with this membership rule, as in the LDES 2.0 specification.
 * For "explicit" membership, the message has no other information than the ldes:member triple, so the caller
 * passes the identifier it will write in that triple.
 */
export function identifyMember(membership: Membership, quads: Quad[], explicitId?: NamedNode): NamedNode {
    if (membership === "explicit") {
        if (!explicitId) throw new MemberError("Explicit membership needs the identifier of the member");
        return explicitId;
    }
    if (membership === "graph") {
        return onlyIri(
            quads.map((quad) => quad.graph).filter((graph) => graph.termType !== "DefaultGraph"),
            "ldes:memberGraph",
        );
    }
    return onlyIri(
        quads
            .filter((quad) => quad.predicate.equals(RDF_TYPE) && quad.object.value === membership.type)
            .map((quad) => quad.subject),
        `ldes:memberType <${membership.type}>`,
    );
}

/** The timestamp of a member: the value of the timestamp path from the member, in any graph of the message */
export function memberTimestamp(member: SourceMember, timestampPath: string): Timestamp {
    const values = member.quads
        .filter((quad) => quad.subject.equals(member.id) && quad.predicate.value === timestampPath)
        .map((quad) => quad.object);
    const unique = new Set(values.map((value) => value.value));
    if (unique.size !== 1) {
        throw new MemberError(`<${member.id.value}> has ${unique.size} values for <${timestampPath}> instead of one`);
    }
    const timestamp = parseTimestamp(values[0].value);
    if (!timestamp)
        throw new MemberError(`<${member.id.value}> has a timestamp that is not an xsd:dateTime: ${values[0].value}`);
    return timestamp;
}

/**
 * Gives the blank nodes of a message short labels (b0, b1, ...). Blank nodes are local to an RDF Message, so this
 * does not change the meaning of the message, while the labels a parser generated can be long.
 */
export function relabelBlankNodes(quads: Quad[]): Quad[] {
    const labels = new Map<string, BlankNode>();
    const term = <T extends Term>(value: T): T => {
        if (value.termType !== "BlankNode") return value;
        if (!labels.has(value.value)) labels.set(value.value, DataFactory.blankNode(`b${labels.size}`));
        return labels.get(value.value) as unknown as T;
    };
    return quads.map(
        (quad) => DataFactory.quad(term(quad.subject), quad.predicate, term(quad.object), term(quad.graph)) as Quad,
    );
}

/** The triple that states membership explicitly, `<EventStream> ldes:member <member>` */
export function memberTriple(eventStream: NamedNode, member: NamedNode): Quad {
    return DataFactory.quad(eventStream, LDES_MEMBER, member) as Quad;
}

export function hasNamedGraphs(quads: Quad[]): boolean {
    return quads.some((quad) => quad.graph.termType !== "DefaultGraph");
}
