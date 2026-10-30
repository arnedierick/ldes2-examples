/**
 * A RiverBench dataset (https://w3id.org/riverbench) as a source.
 *
 * RiverBench describes every dataset in RDF: its license, creators, the kind of stream it is (STaX stream types), and
 * the property that orders its stream elements in time. Every dataset has Jelly distributions in which every stream
 * element is one frame (Jelly-RDF 1.1) or one message (Jelly-RDF 1.2). Every stream element becomes one member.
 *
 * Downloads are kept in cache/riverbench/ and checked against the SHA-1 checksum RiverBench publishes.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { createGunzip } from "zlib";
import { DataFactory, type Store } from "n3";
import { StreamParser } from "rdfjs-jelly";
import type { NamedNode, Quad, Term } from "@rdfjs/types";
import type { Membership, RiverBenchSourceConfig } from "../config.ts";
import { identifyMember, memberTimestamp, MemberError, type SourceMember } from "../members.ts";
import { cbd, fetchDocument, preferredValue } from "../rdf.ts";
import { measure } from "../sizes.ts";
import { NS, RDF_TYPE } from "../vocab.ts";
import type {
    Baseline,
    MemberOptions,
    Reference,
    ReferenceOptions,
    SampledMember,
    Source,
    SourceDescription,
} from "./source.ts";

const RB = "https://w3id.org/riverbench/schema/metadata#";
const STAX = "https://w3id.org/stax/ontology#";
const SPDX = "http://spdx.org/rdf/terms#";
const RBDOC = "https://w3id.org/riverbench/schema/documentation#";

export const CACHE_DIR = path.resolve(import.meta.dirname, "..", "..", "cache", "riverbench");

/** What the dataset description contributes to the catalog */
const CATALOG_PREDICATES = [
    ...["title", "description", "creator", "license", "issued", "modified", "language", "identifier"].map(
        (name) => NS.dct + name,
    ),
    ...["landingPage", "theme", "temporalResolution", "keyword", "version"].map((name) => NS.dcat + name),
];

/** The STaX stream types, as far as they matter for the conversion */
const STREAM_TYPES = {
    namedGraphs: ["timestampedNamedGraphStream", "namedGraphStream"],
    subjectGraphs: ["subjectGraphStream", "timestampedSubjectGraphStream"],
    quads: ["timestampedNamedGraphStream", "namedGraphStream", "datasetStream", "flatQuadStream"],
};

type Distribution = { url: string; fileName: string; sha1?: string };

export class RiverBenchSource implements Source {
    private readonly config: RiverBenchSourceConfig;
    readonly datasetIri: string;
    private metadata?: Promise<{ store: Store; streamTypes: string[] }>;
    private complete = false;
    private file?: string;

    constructor(config: RiverBenchSourceConfig) {
        this.config = config;
        this.datasetIri = `https://w3id.org/riverbench/datasets/${config.dataset}/${config.version ?? "dev"}`;
    }

    private get size() {
        return this.config.size ?? "10k";
    }

    private load() {
        // RiverBench serves its .ttl files as application/octet-stream
        this.metadata ??= fetchDocument(this.datasetIri + ".ttl", "text/turtle", "text/turtle").then(({ store }) => {
            const dataset = DataFactory.namedNode(this.datasetIri);
            if (store.getQuads(dataset, RDF_TYPE, DataFactory.namedNode(RB + "Dataset"), null).length === 0) {
                throw new Error(`${this.datasetIri} is not a RiverBench dataset`);
            }
            const streamTypes = store
                .getObjects(dataset, DataFactory.namedNode(STAX + "hasStreamTypeUsage"), null)
                .flatMap((usage) => store.getObjects(usage, DataFactory.namedNode(STAX + "hasStreamType"), null))
                .map((type) => type.value.replace(STAX, ""));
            return { store, streamTypes };
        });
        return this.metadata;
    }

    async describe(): Promise<SourceDescription> {
        const { store, streamTypes } = await this.load();
        const dataset = DataFactory.namedNode(this.datasetIri);
        const named = (subject: Term, predicate: string) =>
            store
                .getObjects(subject, DataFactory.namedNode(predicate), null)
                .find((term) => term.termType === "NamedNode")?.value;
        // The temporal property is in the time based stream element split, if the dataset has one
        const temporal = store
            .getObjects(dataset, DataFactory.namedNode(RB + "hasStreamElementSplit"), null)
            .map((split) => named(split, RB + "hasTemporalProperty"))
            .find((property) => property !== undefined);
        const is = (types: string[]) => streamTypes.some((type) => types.includes(type));
        const jelly = await this.distribution("jelly");
        return {
            iri: this.datasetIri,
            title: preferredValue(store, dataset, NS.dct + "title"),
            description: preferredValue(store, dataset, NS.dct + "description"),
            license: named(dataset, NS.dct + "license"),
            // Without the hints for RiverBench's own documentation pages
            catalog: cbd(store, dataset, CATALOG_PREDICATES).filter((quad) => !quad.predicate.value.startsWith(RBDOC)),
            timestampPath: temporal,
            membership: is(STREAM_TYPES.namedGraphs)
                ? "graph"
                : is(STREAM_TYPES.subjectGraphs)
                  ? "explicit"
                  : undefined,
            graphs: is(STREAM_TYPES.quads),
            link: jelly && { url: jelly.url, mediaType: "application/x-jelly-rdf" },
        };
    }

    /** The Jelly 1.1 (`jelly`) or Jelly 1.2 (`jelly12`) distribution of the configured size */
    private async distribution(kind: "jelly" | "jelly12"): Promise<Distribution | undefined> {
        const { store } = await this.load();
        const identifier = `${kind}-${this.size}`;
        const node = store
            .getSubjects(DataFactory.namedNode(NS.dct + "identifier"), DataFactory.literal(identifier), null)
            .find((subject) => subject.value.startsWith(this.datasetIri));
        if (!node) return undefined;
        const url = store.getObjects(node, DataFactory.namedNode(NS.dcat + "downloadURL"), null)[0]?.value;
        if (!url) return undefined;
        const sha1 = store
            .getObjects(node, DataFactory.namedNode(SPDX + "checksum"), null)
            .find((checksum) =>
                store
                    .getObjects(checksum, DataFactory.namedNode(SPDX + "algorithm"), null)
                    .some((a) => a.value.endsWith("sha1")),
            );
        const value = sha1 && store.getObjects(sha1, DataFactory.namedNode(SPDX + "checksumValue"), null)[0]?.value;
        return { url, fileName: url.split("/").pop()!, sha1: value };
    }

    /** Downloads a distribution into the cache, unless it is there already with the right checksum */
    private async download(distribution: Distribution): Promise<string> {
        const dir = path.join(CACHE_DIR, this.config.dataset, this.config.version ?? "dev");
        const file = path.join(dir, distribution.fileName);
        if (fs.existsSync(file) && (await checksumMatches(file, distribution.sha1))) return file;
        fs.mkdirSync(dir, { recursive: true });
        console.error(`Downloading ${distribution.url}`);
        const response = await fetch(distribution.url);
        if (!response.ok || !response.body)
            throw new Error(`${distribution.url} responded with HTTP ${response.status}`);
        await pipeline(Readable.fromWeb(response.body as never), fs.createWriteStream(file));
        if (!(await checksumMatches(file, distribution.sha1))) {
            fs.rmSync(file);
            throw new Error(`${distribution.url} does not have the SHA-1 checksum that RiverBench states`);
        }
        return file;
    }

    async *members(options: MemberOptions): AsyncGenerator<SourceMember> {
        this.complete = false;
        const jelly = await this.distribution("jelly");
        if (!jelly) throw new Error(`${this.config.dataset} has no Jelly distribution of size ${this.size}`);
        const file = await this.download(jelly);
        const { streamTypes } = await this.load();
        for await (const quads of readElements(file)) {
            yield { id: elementId(quads, options.membership, streamTypes), quads };
        }
        this.complete = true;
        this.file = file;
    }

    async baseline(): Promise<Baseline | undefined> {
        // Only when all elements were converted is the distribution comparable with the LDES 2.0
        if (!this.complete || !this.file) return undefined;
        return { label: "the RiverBench Jelly 1.1 distribution", sizes: measure(await gunzipped(this.file)) };
    }

    /** The sampled members from the Jelly 1.1 distribution, and from the Jelly 1.2 distribution if there is one */
    async references(sample: SampledMember[], options: ReferenceOptions): Promise<Reference[]> {
        const ids = new Set(sample.map((member) => member.id));
        const { streamTypes } = await this.load();
        const references: Reference[] = [];
        for (const [kind, name] of [
            ["jelly", "the RiverBench Jelly 1.1 distribution"],
            ["jelly12", "the RiverBench Jelly 1.2 distribution"],
        ] as const) {
            const distribution = await this.distribution(kind);
            if (!distribution) continue;
            const file = await this.download(distribution);
            const reference: Reference = { name, members: new Map(), counts: [] };
            const inWindow = (member: SampledMember) =>
                member.timestamp === undefined ||
                ((options.from === undefined || member.timestamp.epochMs >= options.from.getTime()) &&
                    (options.until === undefined || member.timestamp.epochMs < options.until.getTime()));
            let count = 0;
            for await (const quads of readElements(file)) {
                const id = elementId(quads, options.membership, streamTypes);
                const timestamp = options.timestampPath
                    ? memberTimestamp({ id, quads }, options.timestampPath)
                    : undefined;
                if (inWindow({ id: id.value, timestamp })) count++;
                if (ids.has(id.value)) reference.members.set(id.value, quads);
            }
            reference.counts.push({ label: name, expected: count, includes: inWindow });
            references.push(reference);
        }
        return references;
    }
}

async function checksumMatches(file: string, sha1: string | undefined): Promise<boolean> {
    if (!sha1) return true;
    const hash = crypto.createHash("sha1");
    await pipeline(fs.createReadStream(file), hash);
    return hash.digest("hex") === sha1.toLowerCase();
}

function isGzip(file: string): boolean {
    const header = Buffer.alloc(2);
    const fd = fs.openSync(file, "r");
    try {
        fs.readSync(fd, header, 0, 2, 0);
    } finally {
        fs.closeSync(fd);
    }
    return header[0] === 0x1f && header[1] === 0x8b;
}

function open(file: string): Readable {
    const stream = fs.createReadStream(file);
    return isGzip(file) ? stream.pipe(createGunzip()) : stream;
}

async function gunzipped(file: string): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of open(file)) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
}

/** The stream elements of a Jelly file: its frames (Jelly 1.1) or its messages (Jelly 1.2) */
export async function* readElements(file: string): AsyncGenerator<Quad[]> {
    const input = open(file);
    const parser = input.pipe(new StreamParser({ messages: true }));
    let current: Quad[] = [];
    let counter: number | undefined;
    try {
        for await (const item of parser as AsyncIterable<{ quad: Quad; messageCounter: number }>) {
            if (counter !== undefined && item.messageCounter !== counter) {
                yield current;
                current = [];
            }
            counter = item.messageCounter;
            current.push(item.quad);
        }
        if (current.length > 0) yield current;
    } finally {
        input.destroy();
        parser.destroy();
    }
}

/**
 * The identifier of a stream element: what the membership rule finds, or for explicit membership the subject of a
 * subject graph or the name of a named graph.
 */
function elementId(quads: Quad[], membership: Membership, streamTypes: string[]): NamedNode {
    if (membership !== "explicit") return identifyMember(membership, quads);
    if (streamTypes.some((type) => STREAM_TYPES.namedGraphs.includes(type))) return identifyMember("graph", quads);
    if (streamTypes.some((type) => STREAM_TYPES.subjectGraphs.includes(type))) {
        const subjects = new Map(
            quads
                .filter((quad) => quad.subject.termType === "NamedNode")
                .map((quad) => [quad.subject.value, quad.subject]),
        );
        if (subjects.size === 1) return [...subjects.values()][0] as NamedNode;
        throw new MemberError(`A subject graph has ${subjects.size} subjects that are IRIs instead of one`);
    }
    throw new MemberError(
        'The stream elements of this dataset have no identifier of their own: set "membership" to { "type": "<class>" }',
    );
}
