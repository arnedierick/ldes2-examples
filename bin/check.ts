import { COMMON_OPTIONS, fail, handleError, parseCommandLine, parseFormats, parsePositiveInteger } from "../src/cli.ts";

const usage = `Checks that the conversion of datasets lost no information (run convert first).

Usage: npm run check -- <dataset>... [options]
       npm run check -- --all [options]

Options:
  --sample <n>       the number of members to compare with the source (default 50)
  --seed <n>         the seed of the random sample (default 1)
  --formats <list>   only check these formats
  --out <dir>        the output folder (default out/)
  --verbose          show what ldes-client does`;

const { values, positionals } = parseCommandLine(
    {
        ...COMMON_OPTIONS,
        all: { type: "boolean" },
        sample: { type: "string" },
        seed: { type: "string" },
        formats: { type: "string" },
        out: { type: "string" },
    },
    usage,
);

const { listDatasets, loadDataset } = await import("../src/config.ts");
const { check } = await import("../src/check.ts");
const { createSource } = await import("../src/sources/index.ts");

const ids = values.all ? listDatasets() : positionals;
if (ids.length === 0) fail(usage);

let failed = false;
try {
    for (const id of ids) {
        const config = loadDataset(id);
        console.log(`\n== ${id}`);
        const result = await check(config, createSource(config.source), {
            sample: parsePositiveInteger(values.sample, "--sample"),
            seed: values.seed === undefined ? undefined : Number(values.seed),
            formats: parseFormats(values.formats),
            outDir: values.out,
            log: (line) => console.log(line),
        });
        const { stats } = result;
        if (result.failures.length === 0) {
            console.log(
                `\n${id}: all ${result.passed} checks passed. Every format has all ${stats.members} members` +
                    (stats.truncated ? "" : ", as many as the source") +
                    `, and the ${result.sample} sampled members are identical to the source in every format ` +
                    `(${result.comparisons} comparisons).`,
            );
        } else {
            const total = result.passed + result.failures.length;
            console.log(`\n${id}: ${result.failures.length} of ${total} checks failed (FAIL above).`);
            failed = true;
        }
    }
} catch (error) {
    handleError(error);
}
process.exit(failed ? 1 : 0);
