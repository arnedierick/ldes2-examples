/**
 * The configuration of a dataset: `datasets/<id>/dataset.json`. See docs/dataset-config.md for every field.
 *
 * A configuration only states what cannot be derived from the source: everything else (the timestamp path, how
 * members are identified, the title and license, ...) defaults to what the source says about itself.
 */
import fs from "fs";
import path from "path";
import type { Bucket } from "./time.ts";

/** The serializations a dataset can be written in. `link` writes no pages: its root links to a file of the source. */
export const FORMAT_NAMES = ["turtle", "trig", "ntriples", "nquads", "jelly", "link"] as const;
export type FormatName = (typeof FORMAT_NAMES)[number];

/**
 * How the LDES 2.0 states which resource in a member message is the member:
 *  - "graph":     `ldes:memberGraph true`, the member is the only named graph of the message;
 *  - { type }:    `ldes:memberType <type>`, the member is the only subject of that type in the message;
 *  - "explicit":  every message gets an `<EventStream> ldes:member <member>` triple. Always possible, but costs bytes.
 */
export type Membership = "graph" | "explicit" | { type: string };

export type Ldes1SourceConfig = {
    type: "ldes1";
    /** The IRI of the ldes:EventStream */
    url: string;
    /**
     * Where the members of every hour or day are, for an LDES 1.0 of which the relations do not let a client skip to
     * a time window. `{year}`, `{month}`, `{day}` and `{hour}` are replaced by the (zero padded, UTC) start of the bucket.
     */
    fragments?: { template: string; every: Bucket };
    /** The media type to request the pages in, which is also what the size of the LDES 1.0 is measured in */
    accept?: string;
    /** Whether check also compares members with their Concise Bounded Description in the raw pages (default true) */
    rawReference?: boolean;
    /**
     * Whether ldes-client extracts members with the tree:shape of the LDES (default true). false: a member is the
     * Concise Bounded Description of its IRI, and the client never dereferences it.
     */
    shape?: boolean;
};

export type RiverBenchSourceConfig = {
    type: "riverbench";
    /** The identifier of the dataset, e.g. "assist-iot-weather-graphs" */
    dataset: string;
    /** The RiverBench version (default "dev") */
    version?: string;
    /** Which distribution to read: the first 10 000 or 100 000 stream elements, or all of them (default "10k") */
    size?: "10k" | "100k" | "full";
};

export type SourceConfig = Ldes1SourceConfig | RiverBenchSourceConfig;

export type DatasetConfig = {
    /** The name of the folder of the dataset, which is also the name of its output folder */
    id: string;
    title?: string;
    description?: string;
    /** The IRI of the license of the data, e.g. https://spdx.org/licenses/CC-BY-4.0 */
    license?: string;
    source: SourceConfig;
    membership?: Membership;
    /** The predicate from the member to its timestamp. null orders the members on their position instead. */
    timestampPath?: string | null;
    /** The predicate from a member version to the object it is a version of. null leaves it out. */
    versionOfPath?: string | null;
    /** Whether members have named graphs, which rules out Turtle and N-Triples */
    graphs?: boolean;
    /** Which members to convert, by default */
    window?: Window;
    pages?: PageConfig;
    formats?: FormatName[];
    /** Prefixes for the Turtle and TriG pages */
    prefixes?: Record<string, string>;
};

export type Window = {
    /** Only members with a timestamp at or after this xsd:dateTime */
    from?: string;
    /** Only members with a timestamp before this xsd:dateTime */
    until?: string;
    /** At most this many members */
    limit?: number;
};

export type PageConfig = {
    /** The maximum number of members per page (default: no maximum) */
    size?: number;
    /** Start a new page at every hour or day (only for timestamp ordered datasets) */
    bucket?: Bucket;
};

export class ConfigError extends Error {}

type Json = Record<string, unknown>;

/** Reads values from a JSON object, with errors that name the field that is wrong */
class Reader {
    private readonly json: Json;
    private readonly where: string;

    constructor(json: Json, where: string) {
        this.json = json;
        this.where = where;
    }

    private fail(key: string, expected: string): never {
        throw new ConfigError(`${this.where}.${key} must be ${expected}, found ${JSON.stringify(this.json[key])}`);
    }

    allowOnly(keys: string[]) {
        for (const key of Object.keys(this.json)) {
            if (key !== "$comment" && !keys.includes(key)) {
                throw new ConfigError(
                    `${this.where} has an unknown field "${key}", expected one of ${keys.join(", ")}`,
                );
            }
        }
    }

    has(key: string): boolean {
        return this.json[key] !== undefined;
    }

    string(key: string): string | undefined {
        const value = this.json[key];
        if (value === undefined) return undefined;
        if (typeof value !== "string" || value.length === 0) this.fail(key, "a non-empty string");
        return value;
    }

    requiredString(key: string): string {
        return this.string(key) ?? this.fail(key, "a non-empty string");
    }

    iri(key: string): string | undefined {
        const value = this.string(key);
        if (value !== undefined && !/^[a-z][a-z0-9+.-]*:\S+$/i.test(value)) this.fail(key, "an absolute IRI");
        return value;
    }

    /** An IRI, or null to switch off what the source would give */
    nullableIri(key: string): string | null | undefined {
        return this.json[key] === null ? null : this.iri(key);
    }

    boolean(key: string): boolean | undefined {
        const value = this.json[key];
        if (value !== undefined && typeof value !== "boolean") this.fail(key, "true or false");
        return value as boolean | undefined;
    }

    positiveInteger(key: string): number | undefined {
        const value = this.json[key];
        if (value !== undefined && !(Number.isInteger(value) && (value as number) > 0)) {
            this.fail(key, "a positive integer");
        }
        return value as number | undefined;
    }

    oneOf<T extends string>(key: string, options: readonly T[]): T | undefined {
        const value = this.json[key];
        if (value !== undefined && !options.includes(value as T)) this.fail(key, `one of ${options.join(", ")}`);
        return value as T | undefined;
    }

    dateTime(key: string): string | undefined {
        const value = this.string(key);
        if (value !== undefined && Number.isNaN(Date.parse(value))) this.fail(key, "an xsd:dateTime");
        return value;
    }

    object(key: string): Reader | undefined {
        const value = this.json[key];
        if (value === undefined) return undefined;
        if (typeof value !== "object" || value === null || Array.isArray(value)) this.fail(key, "an object");
        return new Reader(value as Json, `${this.where}.${key}`);
    }

    raw(key: string): unknown {
        return this.json[key];
    }
}

function readSource(reader: Reader): SourceConfig {
    const type = reader.oneOf("type", ["ldes1", "riverbench"]);
    if (type === "ldes1") {
        reader.allowOnly(["type", "url", "fragments", "accept", "rawReference", "shape"]);
        const fragments = reader.object("fragments");
        if (fragments) {
            fragments.allowOnly(["template", "every"]);
            const template = fragments.requiredString("template");
            if (!/\{(year|month|day|hour)\}/.test(template)) {
                throw new ConfigError("source.fragments.template must contain {year}, {month}, {day} and/or {hour}");
            }
        }
        return {
            type,
            url: reader.iri("url") ?? reader.requiredString("url"),
            fragments: fragments && {
                template: fragments.requiredString("template"),
                every: fragments.oneOf("every", ["hour", "day"]) ?? "hour",
            },
            accept: reader.string("accept"),
            rawReference: reader.boolean("rawReference"),
            shape: reader.boolean("shape"),
        };
    }
    if (type === "riverbench") {
        reader.allowOnly(["type", "dataset", "version", "size"]);
        return {
            type,
            dataset: reader.requiredString("dataset"),
            version: reader.string("version"),
            size: reader.oneOf("size", ["10k", "100k", "full"]),
        };
    }
    throw new ConfigError('source.type must be "ldes1" or "riverbench"');
}

function readMembership(value: unknown): Membership | undefined {
    if (value === undefined || value === "graph" || value === "explicit") return value;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        const reader = new Reader(value as Json, "membership");
        reader.allowOnly(["type"]);
        const type = reader.iri("type");
        if (type) return { type };
    }
    throw new ConfigError(
        `membership must be "graph", "explicit" or { "type": "<class IRI>" }, found ${JSON.stringify(value)}`,
    );
}

/** Validates the parsed JSON of a dataset configuration */
export function parseConfig(json: unknown, id: string): DatasetConfig {
    if (typeof json !== "object" || json === null || Array.isArray(json)) {
        throw new ConfigError("A dataset configuration must be a JSON object");
    }
    const reader = new Reader(json as Json, "dataset");
    reader.allowOnly([
        "title",
        "description",
        "license",
        "source",
        "membership",
        "timestampPath",
        "versionOfPath",
        "graphs",
        "window",
        "pages",
        "formats",
        "prefixes",
    ]);
    const source = reader.object("source");
    if (!source) throw new ConfigError("dataset.source is required");

    const window = reader.object("window");
    window?.allowOnly(["from", "until", "limit"]);
    const pages = reader.object("pages");
    pages?.allowOnly(["size", "bucket"]);

    const formats = reader.raw("formats");
    if (
        formats !== undefined &&
        !(Array.isArray(formats) && formats.length > 0 && formats.every((f) => FORMAT_NAMES.includes(f)))
    ) {
        throw new ConfigError(`dataset.formats must be a list of ${FORMAT_NAMES.join(", ")}`);
    }
    const prefixes = reader.object("prefixes");
    const prefixMap: Record<string, string> = {};
    for (const prefix of Object.keys((reader.raw("prefixes") as Json | undefined) ?? {})) {
        prefixMap[prefix] = prefixes!.iri(prefix)!;
    }

    return {
        id,
        title: reader.string("title"),
        description: reader.string("description"),
        license: reader.iri("license"),
        source: readSource(source),
        membership: readMembership(reader.raw("membership")),
        timestampPath: reader.nullableIri("timestampPath"),
        versionOfPath: reader.nullableIri("versionOfPath"),
        graphs: reader.boolean("graphs"),
        window: window && {
            from: window.dateTime("from"),
            until: window.dateTime("until"),
            limit: window.positiveInteger("limit"),
        },
        pages: pages && { size: pages.positiveInteger("size"), bucket: pages.oneOf("bucket", ["hour", "day"]) },
        formats: formats as FormatName[] | undefined,
        prefixes: prefixes && prefixMap,
    };
}

export const DATASETS_DIR = path.resolve(import.meta.dirname, "..", "datasets");

/** The identifiers of all datasets: the folders in datasets/ with a dataset.json */
export function listDatasets(dir = DATASETS_DIR): string[] {
    return fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(dir, entry.name, "dataset.json")))
        .map((entry) => entry.name)
        .sort();
}

export function loadDataset(id: string, dir = DATASETS_DIR): DatasetConfig {
    const file = path.join(dir, id, "dataset.json");
    if (!fs.existsSync(file)) {
        throw new ConfigError(`There is no dataset "${id}". The datasets are: ${listDatasets(dir).join(", ")}`);
    }
    let json: unknown;
    try {
        json = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (error) {
        throw new ConfigError(`${file} is not valid JSON: ${(error as Error).message}`);
    }
    try {
        return parseConfig(json, id);
    } catch (error) {
        if (error instanceof ConfigError) throw new ConfigError(`${file}: ${error.message}`);
        throw error;
    }
}
