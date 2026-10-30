/**
 * An LDES 1.0 as a source, read with ldes-client.
 *
 * There are two ways to find the members of a time window:
 *  - from the event stream itself, with the `after` and `before` conditions of the client. This works when the
 *    relations of the LDES let the client skip what is outside the window;
 *  - from `fragments`: a URL template of the fragment of every hour or day. Some LDESs (such as Telraam) only have
 *    relations with a lower bound, so the client would read the whole retained stream to find one hour.
 */
import { DataFactory } from "n3";
import type { Quad } from "@rdfjs/types";
import type { Ldes1SourceConfig } from "../config.ts";
import { readMembers, recordingFetch, type ReadOptions, type Response } from "../client.ts";
import { memberTimestamp, type SourceMember } from "../members.ts";
import { cbd, fetchDocument, parsableByN3, parseDocument, preferredValue } from "../rdf.ts";
import { addSizes, measure, NO_BYTES, type Sizes } from "../sizes.ts";
import {
    bucketEnd,
    bucketLabel,
    bucketStart,
    bucketsIn,
    compareTimestamps,
    formatInstant,
    justAfter,
    type Bucket,
} from "../time.ts";
import { LDES_EVENT_STREAM, NS, RDF_TYPE } from "../vocab.ts";
import type {
    Baseline,
    MemberOptions,
    Reference,
    ReferenceOptions,
    SampledMember,
    Source,
    SourceDescription,
} from "./source.ts";

/** What the description of the event stream contributes to the catalog */
const CATALOG_PREDICATES = [
    ...["title", "description", "license", "rights", "accessRights", "publisher", "creator", "issued", "language"].map(
        (name) => NS.dct + name,
    ),
    ...["contactPoint", "keyword", "theme", "landingPage", "temporalResolution"].map((name) => NS.dcat + name),
];

/** One harvest of the LDES 1.0: an entry point and which members it covers */
type Harvest = { label: string; url: string; read: ReadOptions; includes: (member: SampledMember) => boolean };

export class Ldes1Source implements Source {
    private readonly config: Ldes1SourceConfig;
    private readonly accept: string;
    private bytes: Sizes = NO_BYTES;
    private contentType = "";

    constructor(config: Ldes1SourceConfig) {
        this.config = config;
        this.accept = config.accept ?? "text/turtle";
    }

    async describe(): Promise<SourceDescription> {
        const { store } = await fetchDocument(this.config.url, this.accept);
        let stream = DataFactory.namedNode(this.config.url);
        if (store.getQuads(stream, null, null, null).length === 0) {
            const streams = store.getSubjects(RDF_TYPE, LDES_EVENT_STREAM, null);
            if (streams.length !== 1 || streams[0].termType !== "NamedNode") {
                throw new Error(`${this.config.url} does not describe one ldes:EventStream`);
            }
            stream = streams[0];
        }
        const iri = (predicate: string) =>
            store
                .getObjects(stream, DataFactory.namedNode(predicate), null)
                .find((term) => term.termType === "NamedNode")?.value;
        return {
            iri: stream.value,
            title: preferredValue(store, stream, NS.dct + "title"),
            description: preferredValue(store, stream, NS.dct + "description"),
            license: iri(NS.dct + "license"),
            catalog: cbd(store, stream, CATALOG_PREDICATES),
            timestampPath: iri(NS.ldes + "timestampPath"),
            versionOfPath: iri(NS.ldes + "versionOfPath"),
            // An LDES 1.0 lists its members with tree:member, which an LDES 2.0 message cannot express by itself
            membership: undefined,
            graphs: false,
        };
    }

    async *members(options: MemberOptions): AsyncGenerator<SourceMember> {
        this.bytes = NO_BYTES;
        const fetch = recordingFetch(this.accept, (response) => {
            this.bytes = addSizes(this.bytes, measure(response.body));
            this.contentType = response.contentType;
        });
        for (const harvest of this.harvests(options.from, options.until)) {
            if (!this.config.fragments) {
                yield* readMembers(harvest.url, {
                    ...harvest.read,
                    ascending: options.timestampPath !== undefined,
                    fetch,
                });
                continue;
            }
            // The members of a fragment are not necessarily in order: they are sorted per fragment
            const fragment: SourceMember[] = [];
            for await (const member of readMembers(harvest.url, { ...harvest.read, fetch })) fragment.push(member);
            if (options.timestampPath) {
                const path = options.timestampPath;
                const timestamps = new Map(fragment.map((member) => [member, memberTimestamp(member, path)]));
                fragment.sort((a, b) => compareTimestamps(timestamps.get(a)!, timestamps.get(b)!));
            }
            yield* fragment;
        }
    }

    async baseline(): Promise<Baseline | undefined> {
        if (this.bytes.raw === 0) return undefined;
        return { label: `the LDES 1.0 pages (${this.contentType.split(";")[0]})`, sizes: this.bytes };
    }

    /** The harvests that cover a window: one per fragment, or one from the event stream */
    private harvests(from: Date | undefined, until: Date | undefined): Harvest[] {
        const fragments = this.config.fragments;
        if (!fragments) {
            return [
                {
                    label: "the LDES 1.0",
                    url: this.config.url,
                    read: { after: from, before: until },
                    includes: () => true,
                },
            ];
        }
        if (!from || !until) {
            throw new Error("An LDES 1.0 that is read per fragment needs a window: give --from and --until");
        }
        return bucketsIn(from, until, fragments.every).map((start) => this.fragmentHarvest(start, fragments.every));
    }

    private fragmentHarvest(start: number, every: Bucket): Harvest {
        const date = new Date(start);
        const pad = (n: number) => String(n).padStart(2, "0");
        const url = this.config
            .fragments!.template.replaceAll("{year}", String(date.getUTCFullYear()))
            .replaceAll("{month}", pad(date.getUTCMonth() + 1))
            .replaceAll("{day}", pad(date.getUTCDate()))
            .replaceAll("{hour}", pad(date.getUTCHours()));
        return {
            label: `the fragment of ${bucketLabel(start, every)}`,
            url,
            read: { urlIsView: true },
            includes: (member) =>
                member.timestamp !== undefined &&
                member.timestamp.epochMs >= start &&
                member.timestamp.epochMs < bucketEnd(start, every),
        };
    }

    /**
     * Two references: the members as the client extracts them again, and (unless switched off) the Concise Bounded
     * Description of every member in the raw pages, parsed without the client.
     */
    async references(sample: SampledMember[], options: ReferenceOptions): Promise<Reference[]> {
        const ids = new Set(sample.map((member) => member.id));
        const harvests = this.referenceHarvests(sample, options);
        const fromClient: Reference = { name: "the LDES 1.0, read with ldes-client", members: new Map(), counts: [] };
        const fromPages: Reference = {
            name: "the LDES 1.0 pages, without ldes-client (CBD)",
            members: new Map(),
            counts: [],
        };
        const raw = this.config.rawReference ?? true;
        const inWindow = (member: SampledMember) =>
            member.timestamp === undefined ||
            ((options.from === undefined || member.timestamp.epochMs >= options.from.getTime()) &&
                (options.until === undefined || member.timestamp.epochMs < options.until.getTime()));

        for (const harvest of harvests) {
            const fetch = recordingFetch(
                this.accept,
                (response) => raw && this.addDescriptions(response, ids, fromPages),
            );
            let count = 0;
            for await (const member of readMembers(harvest.url, { ...harvest.read, fetch })) {
                const timestamp = options.timestampPath ? memberTimestamp(member, options.timestampPath) : undefined;
                const sampled = { id: member.id.value, timestamp };
                if (harvest.includes(sampled) && inWindow(sampled)) count++;
                if (ids.has(member.id.value)) fromClient.members.set(member.id.value, member.quads);
            }
            fromClient.counts.push({
                label: harvest.label,
                expected: count,
                includes: (member) => harvest.includes(member) && inWindow(member),
            });
        }
        return raw ? [fromClient, fromPages] : [fromClient];
    }

    /** What to harvest again: the fragments of the sampled members, or the stretch of the stream they are in */
    private referenceHarvests(sample: SampledMember[], options: ReferenceOptions): Harvest[] {
        const timestamps = sample.map((member) => member.timestamp).filter((timestamp) => timestamp !== undefined);
        const fragments = this.config.fragments;
        if (fragments && timestamps.length === sample.length) {
            const starts = [...new Set(timestamps.map((timestamp) => bucketStart(timestamp, fragments.every)))].sort();
            return starts.map((start) => this.fragmentHarvest(start, fragments.every));
        }
        if (timestamps.length === sample.length && sample.length > 0 && !fragments) {
            const sorted = [...timestamps].sort(compareTimestamps);
            const from = options.from ?? new Date(sorted[0].epochMs);
            const until = options.until ?? new Date(justAfter(sorted[sorted.length - 1]));
            return [
                {
                    label: `the LDES 1.0 from ${formatInstant(from.getTime(), true)} until ${formatInstant(until.getTime(), true)}`,
                    url: this.config.url,
                    read: { after: from, before: until },
                    includes: (member) =>
                        member.timestamp !== undefined &&
                        member.timestamp.epochMs >= from.getTime() &&
                        member.timestamp.epochMs < until.getTime(),
                },
            ];
        }
        return this.harvests(options.from, options.until);
    }

    /** Adds the CBD of every sampled member that a raw page describes */
    private addDescriptions(response: Response, ids: Set<string>, reference: Reference) {
        if (!parsableByN3(response.contentType)) return;
        const store = parseDocument(response.body.toString("utf8"), response.url, response.contentType);
        for (const id of ids) {
            const quads: Quad[] = cbd(store, DataFactory.namedNode(id));
            if (quads.length > 0) reference.members.set(id, [...(reference.members.get(id) ?? []), ...quads]);
        }
    }
}
