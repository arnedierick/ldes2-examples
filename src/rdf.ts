/**
 * Small helpers to read RDF documents and descriptions with N3.js.
 */
import { DataFactory, Parser, Store } from "n3";
import type { Quad, Term } from "@rdfjs/types";

const N3_MEDIA_TYPES = ["text/turtle", "application/trig", "application/n-triples", "application/n-quads", "text/n3"];

/** Whether N3.js can parse a response with this content type */
export function parsableByN3(contentType: string): boolean {
    return N3_MEDIA_TYPES.includes(contentType.split(";")[0].trim().toLowerCase());
}

export function parseDocument(text: string, baseIRI: string, contentType = "text/turtle"): Store {
    const format = contentType.split(";")[0].trim();
    return new Store(new Parser({ baseIRI, format }).parse(text));
}

/**
 * Fetches and parses an RDF document in a serialization N3.js can read.
 * `format` overrides the content type of the response, for servers that do not state it (correctly).
 */
export async function fetchDocument(
    url: string,
    accept = "text/turtle",
    format?: string,
): Promise<{ store: Store; url: string }> {
    const response = await fetch(url, { headers: { accept } });
    if (!response.ok) throw new Error(`${url} responded with HTTP ${response.status}`);
    const contentType = format ?? response.headers.get("content-type") ?? accept;
    if (!parsableByN3(contentType)) {
        throw new Error(`${url} responded with ${contentType}, which cannot be parsed here`);
    }
    return { store: parseDocument(await response.text(), response.url || url, contentType), url: response.url || url };
}

/**
 * The Concise Bounded Description of a resource: its quads, and those of the blank nodes they refer to, recursively.
 * With `predicates`, only the quads of the resource itself with one of those predicates are included.
 */
export function cbd(store: Store, subject: Term, predicates?: string[]): Quad[] {
    const quads: Quad[] = [];
    const seen = new Set<string>();
    const visit = (node: Term, top: boolean) => {
        for (const quad of store.getQuads(node, null, null, null) as Quad[]) {
            if (top && predicates && !predicates.includes(quad.predicate.value)) continue;
            quads.push(quad);
            if (quad.object.termType === "BlankNode" && !seen.has(quad.object.value)) {
                seen.add(quad.object.value);
                visit(quad.object, false);
            }
        }
    };
    visit(subject, true);
    return quads;
}

/** The value of a property, preferring an English or untagged literal when there are several */
export function preferredValue(store: Store, subject: Term, predicate: string): string | undefined {
    const objects = store.getObjects(subject, DataFactory.namedNode(predicate), null);
    const ranked = [...objects].sort((a, b) => rank(a) - rank(b));
    return ranked[0]?.value;
}

function rank(term: Term): number {
    if (term.termType !== "Literal") return 1;
    return term.language === "en" ? 0 : term.language === "" ? 1 : 2;
}
