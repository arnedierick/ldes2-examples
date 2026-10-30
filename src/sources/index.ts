import type { SourceConfig } from "../config.ts";
import { Ldes1Source } from "./ldes1.ts";
import { RiverBenchSource } from "./riverbench.ts";
import type { Source } from "./source.ts";

export type * from "./source.ts";

/** The source of a dataset. A new kind of source is added here and in SourceConfig. */
export function createSource(config: SourceConfig): Source {
    switch (config.type) {
        case "ldes1":
            return new Ldes1Source(config);
        case "riverbench":
            return new RiverBenchSource(config);
    }
}
