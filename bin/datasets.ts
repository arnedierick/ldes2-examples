import fs from "fs";
import { COMMON_OPTIONS, handleError, parseCommandLine } from "../src/cli.ts";

const usage = `Lists the datasets, and whether they have been converted.

Usage: npm run datasets [-- --out <dir>]`;

const { values } = parseCommandLine({ ...COMMON_OPTIONS, out: { type: "string" } }, usage);
const { listDatasets, loadDataset } = await import("../src/config.ts");
const { OutputLayout } = await import("../src/output.ts");

try {
    for (const id of listDatasets()) {
        const config = loadDataset(id);
        const source = config.source.type === "ldes1" ? config.source.url : `RiverBench ${config.source.dataset}`;
        const layout = new OutputLayout(id, values.out);
        let state = "not converted";
        if (fs.existsSync(layout.statsFile)) {
            const stats = JSON.parse(fs.readFileSync(layout.statsFile, "utf8"));
            state = `${stats.members} members in ${stats.formats.join(", ")} (${stats.generatedAt.slice(0, 10)})`;
        }
        console.log(`${id.padEnd(36)} ${source}\n${"".padEnd(36)} ${state}`);
    }
} catch (error) {
    handleError(error);
}
