/**
 * Writers of RDF Message logs: one page of an LDES 2.0, of which every message is one member.
 *
 *  - Turtle, TriG, N-Triples and N-Quads start with `VERSION "1.2-messages"` and separate messages with a `MESSAGE`
 *    line (https://w3c-cg.github.io/rsp/spec/messages). Turtle and TriG declare their prefixes once, at the top.
 *  - Jelly-RDF 1.2 (protocol tag 3) marks the message boundaries itself (stream type MESSAGES).
 */
import fs from "fs";
import { once } from "events";
import { Writer as N3Writer } from "n3";
import { PhysicalStreamType, RdfStreamType, Writer as JellyWriter } from "rdfjs-jelly";
import type { Quad, Term } from "@rdfjs/types";
import type { FormatName } from "./config.ts";

export type PageFormatName = Exclude<FormatName, "link">;

export type PageFormat = {
    name: PageFormatName;
    /** The file extension of a page. `.ldes.` tells a client that the file is an LDES 2.0 page. */
    extension: string;
    mediaType: string;
    /** Whether the format can contain named graphs */
    graphs: boolean;
};

export const PAGE_FORMATS: Record<PageFormatName, PageFormat> = {
    turtle: { name: "turtle", extension: "ldes.ttl", mediaType: "text/turtle", graphs: false },
    trig: { name: "trig", extension: "ldes.trig", mediaType: "application/trig", graphs: true },
    ntriples: { name: "ntriples", extension: "ldes.nt", mediaType: "application/n-triples", graphs: false },
    nquads: { name: "nquads", extension: "ldes.nq", mediaType: "application/n-quads", graphs: true },
    jelly: { name: "jelly", extension: "jelly", mediaType: "application/x-jelly-rdf", graphs: true },
};

export type PageWriterOptions = {
    /** Prefixes for Turtle and TriG */
    prefixes: Record<string, string>;
    /** Whether messages can have named graphs, which Jelly needs to know before the first message */
    graphs: boolean;
};

export interface PageWriter {
    addMessage(quads: Quad[]): Promise<void>;
    end(): Promise<void>;
}

export function openPage(format: PageFormatName, file: string, options: PageWriterOptions): PageWriter {
    if (format === "jelly") return new JellyPageWriter(file, options);
    return new TextPageWriter(format, file, options);
}

/** Waits until a file stream has written its buffer, so that a large page is not kept in memory */
async function drained(out: fs.WriteStream) {
    if (out.writableNeedDrain) await once(out, "drain");
}

function closed(out: fs.WriteStream): Promise<void> {
    return new Promise((resolve, reject) => {
        out.on("error", reject);
        out.end(() => resolve());
    });
}

class TextPageWriter implements PageWriter {
    private readonly format: Exclude<PageFormatName, "jelly">;
    private readonly options: PageWriterOptions;
    private readonly out: fs.WriteStream;
    private readonly n3Format: string;
    private readonly nested: boolean;
    private first = true;

    constructor(format: Exclude<PageFormatName, "jelly">, file: string, options: PageWriterOptions) {
        this.format = format;
        this.options = options;
        this.n3Format = { turtle: "Turtle", trig: "TriG", ntriples: "N-Triples", nquads: "N-Quads" }[format];
        this.nested = format === "turtle" || format === "trig";
        this.out = fs.createWriteStream(file);
        this.out.write('VERSION "1.2-messages"\n');
        if (this.nested) {
            for (const [prefix, iri] of Object.entries(options.prefixes))
                this.out.write(`PREFIX ${prefix}: <${iri}>\n`);
        }
    }

    async addMessage(quads: Quad[]) {
        if (!PAGE_FORMATS[this.format].graphs && hasGraphs(quads)) {
            throw new Error(`${this.n3Format} cannot contain the named graphs of this member`);
        }
        const writer = new N3Writer({
            format: this.n3Format,
            prefixes: this.nested ? this.options.prefixes : undefined,
        });
        if (this.nested) addNested(writer, quads);
        else writer.addQuads(quads);
        let text = "";
        writer.end((error, result: string) => {
            if (error) throw error;
            text = result;
        });
        // The prefixes are declared once, at the top of the page
        const body = text.replace(/^@prefix [^\n]*\n/gm, "").replace(/^\n+/, "");
        this.out.write(this.first ? body : `MESSAGE\n${body}`);
        this.first = false;
        await drained(this.out);
    }

    end() {
        return closed(this.out);
    }
}

function hasGraphs(quads: Quad[]): boolean {
    return quads.some((quad) => quad.graph.termType !== "DefaultGraph");
}

/**
 * Adds the quads of one message to a Turtle or TriG writer, with every blank node that is the object of exactly one
 * triple (in the same graph as its own triples) written inside that triple as `[ ... ]`.
 */
function addNested(writer: N3Writer, quads: Quad[]) {
    const key = (term: Term) => term.termType + term.value;
    const bySubject = new Map<string, Quad[]>();
    const references = new Map<string, number>();
    for (const quad of quads) {
        bySubject.set(key(quad.subject), [...(bySubject.get(key(quad.subject)) ?? []), quad]);
        if (quad.object.termType === "BlankNode")
            references.set(quad.object.value, (references.get(quad.object.value) ?? 0) + 1);
    }
    const nestable = (term: Term, graph: Term) =>
        term.termType === "BlankNode" &&
        references.get(term.value) === 1 &&
        (bySubject.get(key(term)) ?? []).every((quad) => quad.graph.equals(graph));
    const nested = new Set<string>();
    const object = (term: Quad["object"], graph: Term, ancestors: Set<string>): Quad["object"] => {
        if (!nestable(term, graph) || ancestors.has(term.value)) return term;
        nested.add(term.value);
        const inner = new Set([...ancestors, term.value]);
        const children = bySubject.get(key(term)) ?? [];
        return writer.blank(
            children.map((quad) => ({ predicate: quad.predicate, object: object(quad.object, graph, inner) })),
        ) as Quad["object"];
    };
    const isNestedSubject = (quad: Quad) =>
        quad.subject.termType === "BlankNode" &&
        references.get(quad.subject.value) === 1 &&
        quads.some((other) => other.object.equals(quad.subject) && nestable(quad.subject, other.graph));
    for (const quad of quads) {
        if (isNestedSubject(quad)) continue;
        writer.addQuad(
            quad.subject,
            quad.predicate,
            object(quad.object, quad.graph, new Set([quad.subject.value])),
            quad.graph,
        );
    }
    // Blank nodes in a cycle of single references have no triple at the top level to be nested in
    for (const quad of quads) {
        if (isNestedSubject(quad) && !nested.has(quad.subject.value)) writer.addQuad(quad);
    }
}

class JellyPageWriter implements PageWriter {
    private readonly out: fs.WriteStream;
    private readonly writer: JellyWriter;

    constructor(file: string, options: PageWriterOptions) {
        this.out = fs.createWriteStream(file);
        this.writer = new JellyWriter(this.out, {
            version: 3,
            streamType: RdfStreamType.MESSAGES,
            physicalType: options.graphs ? PhysicalStreamType.QUADS : PhysicalStreamType.TRIPLES,
        });
    }

    async addMessage(quads: Quad[]) {
        this.writer.addMessage(quads);
        await drained(this.out);
    }

    end(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.out.on("error", reject);
            this.out.on("finish", () => resolve());
            this.writer.end((error) => error && reject(error));
        });
    }
}
