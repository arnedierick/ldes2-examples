/**
 * Compares the quads of a member in two serializations. Blank nodes get other labels in every serialization,
 * so two members are equal when their quads are isomorphic (RDF 1.1 graph isomorphism, extended to quads).
 */
import { isomorphic } from "rdf-isomorphic";
import type { Quad, Term } from "@rdfjs/types";

export function sameQuads(a: Quad[], b: Quad[]): boolean {
    return a.length === b.length && isomorphic(a, b);
}

function termString(term: Term): string {
    switch (term.termType) {
        case "NamedNode":
            return `<${term.value}>`;
        case "Literal":
            return JSON.stringify(term.value) + (term.language ? `@${term.language}` : `^^<${term.datatype.value}>`);
        case "DefaultGraph":
            return "";
        default:
            return `_:${term.value}`;
    }
}

/**
 * A readable form of a member to show how two members differ: one line per quad, in which a blank node that is
 * the object of exactly one quad is written inside that quad as `[ ... ]`, so that the labels of blank nodes do not
 * show up as differences. Other blank nodes keep their labels.
 */
export function readableLines(quads: Quad[]): string[] {
    const bySubject = new Map<string, Quad[]>();
    const references = new Map<string, number>();
    for (const quad of quads) {
        if (quad.subject.termType === "BlankNode") {
            bySubject.set(quad.subject.value, [...(bySubject.get(quad.subject.value) ?? []), quad]);
        }
        if (quad.object.termType === "BlankNode") {
            references.set(quad.object.value, (references.get(quad.object.value) ?? 0) + 1);
        }
    }
    const nestable = (term: Term) => term.termType === "BlankNode" && references.get(term.value) === 1;
    const write = (term: Term, ancestors: Set<string>): string => {
        if (!nestable(term) || ancestors.has(term.value)) return termString(term);
        const inner = new Set([...ancestors, term.value]);
        const children = (bySubject.get(term.value) ?? []).map(
            (quad) => `${termString(quad.predicate)} ${write(quad.object, inner)}`,
        );
        return `[ ${children.sort().join(" ; ")} ]`;
    };
    return quads
        .filter((quad) => !nestable(quad.subject))
        .map((quad) =>
            [
                termString(quad.subject),
                termString(quad.predicate),
                write(quad.object, new Set()),
                termString(quad.graph),
            ]
                .filter(Boolean)
                .join(" "),
        )
        .sort();
}

/** The lines that only `expected` has (-) and that only `actual` has (+), at most `max` of them */
export function difference(expected: Quad[], actual: Quad[], max = 10): string[] {
    const a = readableLines(expected);
    const b = readableLines(actual);
    const onlyA = a.filter((line) => !b.includes(line)).map((line) => `- ${line}`);
    const onlyB = b.filter((line) => !a.includes(line)).map((line) => `+ ${line}`);
    const lines = [...onlyA, ...onlyB];
    if (lines.length === 0 && a.length !== b.length) lines.push(`- ${a.length} quads`, `+ ${b.length} quads`);
    if (lines.length === 0) lines.push("(the members only differ in how their blank nodes are connected)");
    return lines.length > max ? [...lines.slice(0, max), `... ${lines.length - max} more`] : lines;
}
