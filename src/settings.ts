/**
 * The settings of a conversion: the configuration of the dataset, completed with what the source says about itself
 * and overridden by the command line. Contradictions are reported here, before anything is read or written.
 */
import type { DatasetConfig, FormatName, Membership, Window } from "./config.ts";
import type { PageSpec } from "./pager.ts";
import type { SourceDescription } from "./sources/index.ts";
import { DEFAULT_PREFIXES } from "./vocab.ts";
import { PAGE_FORMATS } from "./writers.ts";

export type Overrides = {
    formats?: FormatName[];
    pages?: PageSpec;
    window?: Window;
};

export type Settings = {
    id: string;
    title?: string;
    description?: string;
    license?: string;
    membership: Membership;
    timestampPath?: string;
    versionOfPath?: string;
    graphs: boolean;
    formats: FormatName[];
    pages: PageSpec;
    from?: Date;
    until?: Date;
    limit?: number;
    prefixes: Record<string, string>;
};

export class SettingsError extends Error {}

/** Takes the configured value; null switches off the value of the source */
function choose<T>(configured: T | null | undefined, fromSource: T | undefined): T | undefined {
    return configured === null ? undefined : (configured ?? fromSource);
}

function date(value: string | undefined, what: string): Date | undefined {
    if (value === undefined) return undefined;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) throw new SettingsError(`${what} is not a date and time: ${value}`);
    return parsed;
}

export function resolveSettings(config: DatasetConfig, source: SourceDescription, overrides: Overrides = {}): Settings {
    const membership = config.membership ?? source.membership;
    if (!membership) {
        throw new SettingsError(
            `The source does not say how its members are identified. Set "membership" in datasets/${config.id}/dataset.json ` +
                'to "explicit" (an ldes:member triple per member) or to { "type": "<the class of every member>" }.',
        );
    }
    const graphs = config.graphs ?? source.graphs;
    if (membership === "graph" && !graphs) {
        throw new SettingsError('"membership": "graph" needs members with named graphs ("graphs": true)');
    }
    const timestampPath = choose(config.timestampPath, source.timestampPath);

    const window = { ...config.window, ...overrides.window };
    const from = date(window.from, "The start of the window");
    const until = date(window.until, "The end of the window");
    if ((from || until) && !timestampPath) {
        throw new SettingsError("A time window needs a timestamp path, but this dataset is in implicit order");
    }
    if (from && until && from >= until) throw new SettingsError("The window ends before it starts");

    const pages = { ...config.pages, ...overrides.pages };
    if (pages.bucket && !timestampPath) {
        throw new SettingsError("Pages per hour or day need a timestamp path, but this dataset is in implicit order");
    }

    const linkable = source.link !== undefined && membership !== "explicit" && !from && !until && !window.limit;
    const formats = overrides.formats ?? config.formats ?? defaultFormats(graphs, linkable);
    for (const format of formats) {
        if (format === "link") {
            if (!source.link) throw new SettingsError('The source has no file that the "link" format can point at');
            if (membership === "explicit") {
                throw new SettingsError(
                    'The "link" format needs membership without ldes:member triples, as it cannot add them',
                );
            }
            if (from || until || window.limit) {
                throw new SettingsError(
                    'The "link" format points at all members of the source, so it cannot have a window',
                );
            }
        } else if (graphs && !PAGE_FORMATS[format].graphs) {
            throw new SettingsError(
                `The members have named graphs, which ${format} cannot contain: choose trig or nquads`,
            );
        }
    }

    return {
        id: config.id,
        title: config.title ?? source.title,
        description: config.description ?? source.description,
        license: config.license ?? source.license,
        membership,
        timestampPath,
        versionOfPath: choose(config.versionOfPath, source.versionOfPath),
        graphs,
        formats,
        pages,
        from,
        until,
        limit: window.limit,
        prefixes: { ...DEFAULT_PREFIXES, ...config.prefixes },
    };
}

/** All page formats that can hold the members, and the link format when the source has a file it can point at */
function defaultFormats(graphs: boolean, linkable: boolean): FormatName[] {
    const formats: FormatName[] = graphs ? ["trig", "nquads", "jelly"] : ["turtle", "ntriples", "jelly"];
    return linkable ? [...formats, "link"] : formats;
}
