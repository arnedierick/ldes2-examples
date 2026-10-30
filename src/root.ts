/**
 * The root page of an LDES 2.0 and the DCAT catalog entry of a dataset.
 *
 * Both are written with IRIs relative to their own location (`<>`, `<#EventStream>`, `<page-00000.jelly>`), so that
 * the output folder can be moved or published anywhere. The pages of a root are in the same folder, except for the
 * `link` format, which links to a file of the source with an absolute IRI.
 */
import { DataFactory, Writer } from "n3";
import type { Quad, Term } from "@rdfjs/types";
import type { Membership } from "./config.ts";
import type { PageInfo } from "./pager.ts";
import { LDES_EVENT_STREAM, NS, RDF_TYPE } from "./vocab.ts";

const { namedNode, literal, quad } = DataFactory;
const ldes = (name: string) => namedNode(NS.ldes + name);
const typed = (value: string, datatype: string) => literal(value, namedNode(NS.xsd + datatype));

/** The fragment that identifies the event stream in its root page */
export const EVENT_STREAM_FRAGMENT = "#EventStream";

/** The absolute IRI of the event stream described by a root page, for explicit membership in the pages */
export function eventStreamIri(rootIri: string): string {
    return rootIri + EVENT_STREAM_FRAGMENT;
}

/** What the root page says about the event stream */
export type StreamDescription = {
    membership: Membership;
    timestampPath?: string;
    versionOfPath?: string;
    /** The IRI of the source the LDES is converted from */
    derivedFrom: string;
};

/** A relation from the root page to one page, of which the IRI is relative to the root page, or absolute */
export type PageLink = { iri: string; page: PageInfo };

type Item = Quad | ((writer: Writer) => void);

function serialize(header: string[], items: Item[], prefixes: Record<string, string>): string {
    const writer = new Writer({ format: "Turtle", prefixes });
    for (const item of items) {
        if (typeof item === "function") item(writer);
        else writer.addQuad(item);
    }
    let text = "";
    writer.end((error, result: string) => {
        if (error) throw error;
        text = result;
    });
    return header.map((line) => `# ${line}`.trimEnd()).join("\n") + "\n" + text;
}

/**
 * The root page: the description of the event stream, a relation to every page, and `ldes:immutable true` for every
 * page, as the pages of a conversion never change.
 */
export function rootPage(
    stream: StreamDescription,
    links: PageLink[],
    header: string[],
    prefixes: Record<string, string> = {},
): string {
    const es = namedNode(EVENT_STREAM_FRAGMENT);
    const root = namedNode("");
    const description: Quad[] = [quad(es, RDF_TYPE, LDES_EVENT_STREAM)];
    if (stream.membership === "graph") {
        description.push(quad(es, ldes("memberGraph"), typed("true", "boolean")));
    } else if (typeof stream.membership === "object") {
        description.push(quad(es, ldes("memberType"), namedNode(stream.membership.type)));
    }
    if (stream.timestampPath) description.push(quad(es, ldes("timestampPath"), namedNode(stream.timestampPath)));
    if (stream.versionOfPath) description.push(quad(es, ldes("versionOfPath"), namedNode(stream.versionOfPath)));
    description.push(quad(es, namedNode(NS.prov + "wasDerivedFrom"), namedNode(stream.derivedFrom)));

    const relations = links.map(({ iri, page }) => (writer: Writer) => {
        const fields: { predicate: Quad["predicate"]; object: Quad["object"] }[] = [
            { predicate: ldes("page"), object: namedNode(iri) },
        ];
        if (stream.timestampPath) {
            if (page.timeFrom) fields.push({ predicate: ldes("timeFrom"), object: typed(page.timeFrom, "dateTime") });
            if (page.timeUntil)
                fields.push({ predicate: ldes("timeUntil"), object: typed(page.timeUntil, "dateTime") });
        } else {
            fields.push({ predicate: ldes("pageNumber"), object: typed(String(page.number), "integer") });
        }
        writer.addQuad(root, ldes("relation"), writer.blank(fields));
    });
    const immutable = links.map(({ iri }) => quad(namedNode(iri), ldes("immutable"), typed("true", "boolean")));

    return serialize(header, [...description, ...relations, ...immutable], {
        ...prefixes,
        ldes: NS.ldes,
        xsd: NS.xsd,
        prov: NS.prov,
    });
}

/** One serialization of the dataset, for the catalog */
export type Distribution = {
    /** The root page, relative to the catalog */
    root: string;
    title: string;
    mediaType: string;
    bytes?: number;
};

/**
 * A DCAT description of the dataset: the source as a dcat:Dataset (with what the source says about itself), and
 * every serialization as an ldes:EventStream that is a dcat:Distribution of it.
 */
export function catalog(
    source: { iri: string; quads: Quad[]; title?: string; description?: string; license?: string },
    distributions: Distribution[],
    header: string[],
): string {
    const dataset = namedNode(source.iri);
    const dcat = (name: string) => namedNode(NS.dcat + name);
    const dct = (name: string) => namedNode(NS.dct + name);
    const quads: Quad[] = [quad(dataset, RDF_TYPE, dcat("Dataset")), ...source.quads];
    const has = (predicate: Term) =>
        source.quads.some((q) => q.subject.equals(dataset) && q.predicate.equals(predicate));
    if (source.title && !has(dct("title"))) quads.push(quad(dataset, dct("title"), literal(source.title, "en")));
    if (source.description && !has(dct("description"))) {
        quads.push(quad(dataset, dct("description"), literal(source.description, "en")));
    }
    if (source.license && !has(dct("license"))) quads.push(quad(dataset, dct("license"), namedNode(source.license)));
    for (const distribution of distributions) {
        const es = namedNode(distribution.root + EVENT_STREAM_FRAGMENT);
        quads.push(
            quad(dataset, dcat("distribution"), es),
            quad(es, RDF_TYPE, LDES_EVENT_STREAM),
            quad(es, RDF_TYPE, dcat("Distribution")),
            quad(es, dct("title"), literal(distribution.title, "en")),
            quad(es, dcat("accessURL"), namedNode(distribution.root)),
            quad(es, dcat("mediaType"), literal(distribution.mediaType)),
            quad(es, namedNode(NS.prov + "wasDerivedFrom"), dataset),
        );
        if (source.license) quads.push(quad(es, dct("license"), namedNode(source.license)));
        if (distribution.bytes !== undefined) {
            quads.push(quad(es, dcat("byteSize"), typed(String(distribution.bytes), "nonNegativeInteger")));
        }
    }
    return serialize(header, quads, {
        ldes: NS.ldes,
        dcat: NS.dcat,
        dct: NS.dct,
        prov: NS.prov,
        foaf: NS.foaf,
        xsd: NS.xsd,
    });
}
