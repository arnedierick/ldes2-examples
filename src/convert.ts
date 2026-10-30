/**
 * Converts the members of a source into an LDES 2.0, in every configured format.
 *
 * Every member is checked against the rules of LDES 2.0 before it is written: the membership rule of the event
 * stream must find the member in its message, and the members must be in ascending order of their timestamp.
 * A conversion that breaks a rule stops with an error that says what to change, instead of writing an LDES 2.0
 * that a client would read differently.
 */
import fs from "fs";
import { DataFactory } from "n3";
import type { DatasetConfig, FormatName } from "./config.ts";
import {
    hasNamedGraphs,
    identifyMember,
    MemberError,
    memberTimestamp,
    memberTriple,
    relabelBlankNodes,
    type SourceMember,
} from "./members.ts";
import { OutputLayout, type Stats } from "./output.ts";
import { Pager, type PageInfo } from "./pager.ts";
import { inferPrefixes } from "./prefixes.ts";
import { catalog, eventStreamIri, rootPage, type Distribution, type PageLink } from "./root.ts";
import { resolveSettings, type Overrides, type Settings } from "./settings.ts";
import { addSizes, COMPRESSION_LEVELS, measure, NO_BYTES, type Sizes } from "./sizes.ts";
import type { Source, SourceDescription } from "./sources/index.ts";
import { compareTimestamps, formatInstant, justAfter, type Timestamp } from "./time.ts";
import { NS } from "./vocab.ts";
import { openPage, PAGE_FORMATS, type PageFormatName, type PageWriter } from "./writers.ts";

export type ConvertOptions = Overrides & {
    /** The folder that gets a folder per dataset (default out/) */
    outDir?: string;
    /** The URL the dataset folder will be published at, for the IRI of the event stream (see src/output.ts) */
    baseUrl?: string;
    log?: (line: string) => void;
};

export const FORMAT_LABELS: Record<FormatName, string> = {
    turtle: "Turtle",
    trig: "TriG",
    ntriples: "N-Triples",
    nquads: "N-Quads",
    jelly: "Jelly-RDF 1.2",
    link: "the Jelly file of the source",
};

/** Checks a member against the rules of the event stream, and throws an error that explains what to change */
function validateMember(member: SourceMember, settings: Settings) {
    if (!settings.graphs && hasNamedGraphs(member.quads)) {
        throw new MemberError(`<${member.id.value}> has named graphs: set "graphs": true for this dataset`);
    }
    if (settings.membership === "explicit") return;
    let found;
    try {
        found = identifyMember(settings.membership, member.quads);
    } catch (error) {
        throw new MemberError(`In the message of <${member.id.value}>, ${(error as Error).message}`);
    }
    if (!found.equals(member.id)) {
        throw new MemberError(`The membership rule finds <${found.value}> instead of the member <${member.id.value}>`);
    }
}

/** The number of members the prefixes of the text formats are chosen from */
const PREFIX_SAMPLE = 100;

/** Passes on all items, after reading the first `size` of them and handing those to `onHead` */
async function* lookahead<T>(items: AsyncIterable<T>, size: number, onHead: (head: T[]) => void): AsyncGenerator<T> {
    const iterator = items[Symbol.asyncIterator]();
    try {
        const head: T[] = [];
        while (head.length < size) {
            const next = await iterator.next();
            if (next.done) break;
            head.push(next.value);
        }
        onHead(head);
        yield* head;
        while (true) {
            const next = await iterator.next();
            if (next.done) return;
            yield next.value;
        }
    } finally {
        // Stops the source when the converter stops early
        await iterator.return?.();
    }
}

/** Checks that timestamps are in ascending order, and that either all or none of them have a timezone */
class OrderCheck {
    first?: Timestamp;
    last?: Timestamp;

    add(member: SourceMember, timestamp: Timestamp, path: string) {
        if (this.first && this.first.zoned !== timestamp.zoned) {
            throw new MemberError(
                `<${member.id.value}> has a timestamp ${timestamp.zoned ? "with" : "without"} a timezone, unlike the ` +
                    "members before it, so they cannot be ordered with certainty",
            );
        }
        if (this.last && compareTimestamps(timestamp, this.last) < 0) {
            throw new MemberError(
                `The members are not in ascending order of <${path}>: <${member.id.value}> (${timestamp.lexical}) comes ` +
                    `after a member of ${this.last.lexical}. Set "timestampPath": null to keep the order of the source.`,
            );
        }
        this.first ??= timestamp;
        this.last = timestamp;
    }
}

export async function convert(config: DatasetConfig, source: Source, options: ConvertOptions = {}): Promise<Stats> {
    const log = options.log ?? (() => undefined);
    const description = await source.describe();
    const settings = resolveSettings(config, description, options);
    const layout = new OutputLayout(config.id, options.outDir, options.baseUrl);
    layout.prepare(settings.formats);
    const pageFormats = settings.formats.filter((format): format is PageFormatName => format !== "link");
    const explicit = settings.membership === "explicit";
    if (explicit && !options.baseUrl) {
        log(
            "Explicit membership: the pages contain the IRI of the event stream on disk; use --base-url to publish them",
        );
    }
    const configuredPrefixes = explicit ? { ...settings.prefixes, ldes: NS.ldes } : settings.prefixes;
    // Chosen from the first members before the first page is opened, so that every page has the same prefixes
    let prefixes = configuredPrefixes;
    const choosePrefixes = (head: SourceMember[]) => {
        prefixes = inferPrefixes(
            head.map((member) => member.quads),
            configuredPrefixes,
        );
    };

    const pager = new Pager(settings.pages);
    const pageSizes = new Map<PageInfo, Partial<Record<PageFormatName, Sizes>>>();
    let writers = new Map<PageFormatName, PageWriter>();
    let open: PageInfo | undefined;
    const closePage = async () => {
        await Promise.all([...writers.values()].map((writer) => writer.end()));
        if (open) {
            const sizes: Partial<Record<PageFormatName, Sizes>> = {};
            for (const format of writers.keys())
                sizes[format] = measure(fs.readFileSync(layout.pageFile(format, open)));
            pageSizes.set(open, sizes);
        }
        writers = new Map();
    };

    const order = new OrderCheck();
    const { timestampPath, from, until, limit } = settings;
    let members = 0;
    let quads = 0;
    let truncated = false;
    try {
        const all = source.members({ from, until, timestampPath, membership: settings.membership });
        for await (const member of lookahead(all, PREFIX_SAMPLE, choosePrefixes)) {
            const timestamp = timestampPath ? memberTimestamp(member, timestampPath) : undefined;
            if (timestamp && from && timestamp.epochMs < from.getTime()) continue;
            if (timestamp && until && timestamp.epochMs >= until.getTime()) break;
            if (limit !== undefined && members >= limit) {
                truncated = true;
                break;
            }
            validateMember(member, settings);
            if (timestamp) order.add(member, timestamp, timestampPath!);

            const { page, isNew } = pager.place({ ...member, timestamp });
            if (isNew) {
                await closePage();
                open = page;
                for (const format of pageFormats) {
                    writers.set(
                        format,
                        openPage(format, layout.pageFile(format, page), { prefixes, graphs: settings.graphs }),
                    );
                }
            }
            const message = relabelBlankNodes(member.quads);
            for (const [format, writer] of writers) {
                const stream = DataFactory.namedNode(eventStreamIri(layout.rootIri(format)));
                await writer.addMessage(explicit ? [memberTriple(stream, member.id), ...message] : message);
            }
            members++;
            quads += member.quads.length;
            if (members % 10_000 === 0) log(`${members} members`);
        }
    } finally {
        await closePage();
    }
    const pages = pager.finish();
    if (members === 0) throw new Error("The source has no members in the window, so there is nothing to convert");
    log(`${members} members in ${pages.length} page(s)`);

    // After a limit, the source may have read more than was converted, so its size would not be comparable
    const baseline = truncated ? undefined : await source.baseline();
    const stats: Stats = {
        dataset: config.id,
        generatedAt: new Date().toISOString(),
        source: { type: config.source.type, iri: description.iri },
        membership: settings.membership,
        timestampPath,
        versionOfPath: settings.versionOfPath,
        formats: settings.formats,
        pageSize: settings.pages.size,
        bucket: settings.pages.bucket,
        window: { from: from?.toISOString(), until: until?.toISOString(), limit },
        truncated,
        members,
        quads,
        pages: pages.map((page) => ({ ...page, sizes: pageSizes.get(page) ?? {} })),
        totals: Object.fromEntries(
            pageFormats.map((format) => [
                format,
                pages.map((page) => pageSizes.get(page)?.[format] ?? NO_BYTES).reduce(addSizes, NO_BYTES),
            ]),
        ),
        baseline,
        compression: { ...COMPRESSION_LEVELS },
    };

    writeRoots(layout, settings, description, pages, { first: order.first, last: order.last, members });
    writeCatalog(layout, settings, description, stats);
    fs.writeFileSync(layout.statsFile, JSON.stringify(stats, null, 2) + "\n");
    return stats;
}

function writeRoots(
    layout: OutputLayout,
    settings: Settings,
    source: SourceDescription,
    pages: PageInfo[],
    all: { first?: Timestamp; last?: Timestamp; members: number },
) {
    const stream = {
        membership: settings.membership,
        timestampPath: settings.timestampPath,
        versionOfPath: settings.versionOfPath,
        derivedFrom: source.iri,
    };
    for (const format of settings.formats) {
        const header = [
            `The root page of an LDES 2.0 of ${settings.title ? `"${settings.title}"` : settings.id}, in ${FORMAT_LABELS[format]}.`,
            `Converted from <${source.iri}> by ldes2-examples (npm run convert -- ${settings.id}).`,
        ];
        let links: PageLink[];
        if (format === "link") {
            // One page: the file of the source, which holds all members
            const page: PageInfo = {
                number: 0,
                name: "",
                members: all.members,
                quads: 0,
                timeFrom: all.first?.lexical,
                timeUntil: all.last && formatInstant(justAfter(all.last), all.last.zoned),
            };
            links = [{ iri: source.link!.url, page }];
            header.push(
                "The only page is the Jelly file of the source itself: every stream element in it is a member message.",
            );
        } else {
            links = pages.map((page) => ({ iri: layout.pageName(format, page), page }));
            header.push(`${all.members} members in ${pages.length} page(s), one member per RDF Message.`);
        }
        fs.writeFileSync(layout.rootFile(format), rootPage(stream, links, header, settings.prefixes));
    }
}

function writeCatalog(layout: OutputLayout, settings: Settings, source: SourceDescription, stats: Stats) {
    const title = settings.title ?? settings.id;
    const distributions: Distribution[] = settings.formats.map((format) => ({
        root: layout.rootPath(format),
        title: `${title}, as an LDES 2.0 in ${FORMAT_LABELS[format]}`,
        mediaType: format === "link" ? source.link!.mediaType : PAGE_FORMATS[format].mediaType,
        bytes: stats.totals[format]?.raw,
    }));
    const header = [
        `The catalog entry of ${title}: the source dataset, and every serialization of it as an LDES 2.0.`,
        "Generated by ldes2-examples from what the source says about itself and datasets/" +
            settings.id +
            "/dataset.json.",
    ];
    const text = catalog(
        {
            iri: source.iri,
            quads: source.catalog,
            title: settings.title,
            description: settings.description,
            license: settings.license,
        },
        distributions,
        header,
    );
    fs.writeFileSync(layout.catalogFile, text);
}
