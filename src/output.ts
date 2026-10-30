/**
 * The output of a conversion:
 *
 *   out/<dataset>/
 *     catalog.ttl                 DCAT description of the dataset and its serializations
 *     stats.json                  what was converted, and the size of every page in every format
 *     <format>/root.trig          the root page of the LDES 2.0 in that format
 *     <format>/<page>.<extension> the pages
 *
 * Root pages and the catalog use IRIs relative to their own location. Only explicit membership needs the absolute
 * IRI of the event stream in every member message: it is based on --base-url, the URL the folder will be published
 * at, or else on the location of the folder on disk.
 */
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import type { FormatName, Membership } from "./config.ts";
import type { PageInfo } from "./pager.ts";
import type { Sizes } from "./sizes.ts";
import type { Baseline } from "./sources/index.ts";
import { PAGE_FORMATS, type PageFormatName } from "./writers.ts";

export const OUT_DIR = path.resolve(import.meta.dirname, "..", "out");

export class OutputLayout {
    readonly dir: string;
    readonly base: string;

    constructor(id: string, outDir = OUT_DIR, baseUrl?: string) {
        this.dir = path.join(outDir, id);
        const base = baseUrl ?? pathToFileURL(this.dir).href;
        this.base = base.endsWith("/") ? base : base + "/";
    }

    formatDir(format: FormatName) {
        return path.join(this.dir, format);
    }

    rootFile(format: FormatName) {
        return path.join(this.formatDir(format), "root.trig");
    }

    /** The root page, relative to the dataset folder */
    rootPath(format: FormatName) {
        return `${format}/root.trig`;
    }

    /** The absolute IRI of a root page, for the IRI of its event stream in explicit membership */
    rootIri(format: FormatName) {
        return new URL(this.rootPath(format), this.base).href;
    }

    /** The file name of a page, which is also its IRI relative to the root page */
    pageName(format: PageFormatName, page: PageInfo) {
        return `${page.name}.${PAGE_FORMATS[format].extension}`;
    }

    pageFile(format: PageFormatName, page: PageInfo) {
        return path.join(this.formatDir(format), this.pageName(format, page));
    }

    get catalogFile() {
        return path.join(this.dir, "catalog.ttl");
    }

    get statsFile() {
        return path.join(this.dir, "stats.json");
    }

    /** Empties the folders of the formats that are written again, so that no pages of an earlier run remain */
    prepare(formats: FormatName[]) {
        for (const format of formats) {
            fs.rmSync(this.formatDir(format), { recursive: true, force: true });
            fs.mkdirSync(this.formatDir(format), { recursive: true });
        }
    }
}

/** stats.json: what convert did, which check reads to know what to verify */
export type Stats = {
    dataset: string;
    generatedAt: string;
    source: { type: string; iri: string };
    membership: Membership;
    timestampPath?: string;
    versionOfPath?: string;
    formats: FormatName[];
    pageSize?: number;
    bucket?: string;
    window: { from?: string; until?: string; limit?: number };
    /** Whether the limit stopped the conversion before the window was complete */
    truncated: boolean;
    members: number;
    quads: number;
    pages: (PageInfo & { sizes: Partial<Record<PageFormatName, Sizes>> })[];
    totals: Partial<Record<FormatName, Sizes>>;
    baseline?: Baseline;
    compression: Record<string, number>;
};

export function readStats(layout: OutputLayout): Stats {
    if (!fs.existsSync(layout.statsFile)) {
        throw new Error(`${layout.statsFile} does not exist: convert the dataset first`);
    }
    return JSON.parse(fs.readFileSync(layout.statsFile, "utf8")) as Stats;
}
