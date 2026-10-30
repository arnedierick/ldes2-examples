import {
    COMMON_OPTIONS,
    fail,
    handleError,
    parseCommandLine,
    parseFormats,
    parsePositiveInteger,
    sizeTable,
} from "../src/cli.ts";
import type { Sizes } from "../src/sizes.ts";

const usage = `Converts datasets into an LDES 2.0, in out/<dataset>/.

Usage: npm run convert -- <dataset>... [options]
       npm run convert -- --all [options]

Options (override datasets/<dataset>/dataset.json):
  --formats <list>     comma separated: turtle, trig, ntriples, nquads, jelly, link
  --page-size <n>      at most n members per page
  --bucket <unit>      start a new page every hour or day
  --from <dateTime>    only members at or after this time
  --until <dateTime>   only members before this time
  --limit <n>          at most n members
  --out <dir>          the output folder (default out/)
  --base-url <url>     the URL out/<dataset>/ will be published at (only needed for explicit membership)
  --verbose            show what ldes-client does`;

const { values, positionals } = parseCommandLine(
    {
        ...COMMON_OPTIONS,
        all: { type: "boolean" },
        formats: { type: "string" },
        "page-size": { type: "string" },
        bucket: { type: "string" },
        from: { type: "string" },
        until: { type: "string" },
        limit: { type: "string" },
        out: { type: "string" },
        "base-url": { type: "string" },
    },
    usage,
);

const { listDatasets, loadDataset } = await import("../src/config.ts");
const { convert, FORMAT_LABELS } = await import("../src/convert.ts");
const { createSource } = await import("../src/sources/index.ts");

const ids = values.all ? listDatasets() : positionals;
if (ids.length === 0) fail(usage);
if (values.bucket !== undefined && values.bucket !== "hour" && values.bucket !== "day")
    fail("--bucket must be hour or day");

try {
    for (const id of ids) {
        const config = loadDataset(id);
        console.error(`\n== ${id}`);
        const started = Date.now();
        const stats = await convert(config, createSource(config.source), {
            formats: parseFormats(values.formats),
            pages: {
                ...(values["page-size"] !== undefined && {
                    size: parsePositiveInteger(values["page-size"], "--page-size"),
                }),
                ...(values.bucket !== undefined && { bucket: values.bucket as "hour" | "day" }),
            },
            window: {
                ...(values.from !== undefined && { from: values.from }),
                ...(values.until !== undefined && { until: values.until }),
                ...(values.limit !== undefined && { limit: parsePositiveInteger(values.limit, "--limit") }),
            },
            outDir: values.out,
            baseUrl: values["base-url"],
            log: (line) => console.error(line),
        });
        console.error(`Done in ${((Date.now() - started) / 1000).toFixed(1)} s, written to out/${id}/\n`);
        const rows: [string, Sizes][] = Object.entries(stats.totals).map(([format, sizes]) => [
            FORMAT_LABELS[format as keyof typeof FORMAT_LABELS],
            sizes,
        ]);
        if (stats.baseline) rows.push([`source: ${stats.baseline.label}`, stats.baseline.sizes]);
        console.log(sizeTable(rows, stats.members));
    }
} catch (error) {
    handleError(error);
}
