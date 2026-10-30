/**
 * Small helpers to read RDF documents and descriptions: with N3.js, and JSON-LD with jsonld-streaming-parser.
 */
import { DataFactory, Parser, Store } from "n3";
import { JsonLdParser } from "jsonld-streaming-parser";
import type { Quad, Term } from "@rdfjs/types";

const N3_MEDIA_TYPES = ["text/turtle", "application/trig", "application/n-triples", "application/n-quads", "text/n3"];
const JSON_LD_MEDIA_TYPES = ["application/ld+json"];

function mediaType(contentType: string): string {
    return contentType.split(";")[0].trim().toLowerCase();
}

/** Whether a response with this content type can be parsed here */
export function parsable(contentType: string): boolean {
    const type = mediaType(contentType);
    return N3_MEDIA_TYPES.includes(type) || JSON_LD_MEDIA_TYPES.includes(type);
}

/**
 * The remote JSON-LD contexts, fetched once: an LDES in JSON-LD often refers to the same contexts on every page,
 * and in every member.
 */
const contexts = new Map<string, Promise<any>>();
const documentLoader = {
    load(url: string): Promise<any> {
        let context = contexts.get(url);
        if (!context) {
            context = fetch(url, { headers: { accept: "application/ld+json, application/json" } }).then((response) => {
                if (!response.ok) throw new Error(`The JSON-LD context ${url} responded with HTTP ${response.status}`);
                return response.json();
            });
            // A failed fetch is tried again by the next document that needs it
            context.catch(() => contexts.delete(url));
            contexts.set(url, context);
        }
        return context;
    },
};

export async function parseDocument(text: string, baseIRI: string, contentType = "text/turtle"): Promise<Store> {
    const format = mediaType(contentType);
    if (!JSON_LD_MEDIA_TYPES.includes(format)) return new Store(new Parser({ baseIRI, format }).parse(text));
    const parser = new JsonLdParser({ baseIRI, documentLoader });
    const quads: Quad[] = [];
    await new Promise<void>((resolve, reject) => {
        parser.on("data", (quad: Quad) => quads.push(quad));
        parser.on("error", reject);
        parser.on("end", resolve);
        parser.end(text);
    });
    return new Store(quads);
}

/**
 * Fetches and parses an RDF document in a serialization that can be parsed here.
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
    if (!parsable(contentType)) {
        throw new Error(`${url} responded with ${contentType}, which cannot be parsed here`);
    }
    const store = await parseDocument(await response.text(), response.url || url, contentType);
    return { store, url: response.url || url };
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
