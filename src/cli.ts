/**
 * What the commands in bin/ share: option parsing, errors and tables.
 */
import { parseArgs, type ParseArgsConfig } from "util";
import { ConfigError, FORMAT_NAMES, type FormatName } from "./config.ts";
import { MemberError } from "./members.ts";
import { SettingsError } from "./settings.ts";
import type { Sizes } from "./sizes.ts";

/**
 * Parses the command line. ldes-client logs every page it reads, so its log level is set before it is loaded:
 * the commands import the rest of the code after calling this.
 */
export function parseCommandLine<T extends NonNullable<ParseArgsConfig["options"]>>(options: T, usage: string) {
    const parse = () => {
        try {
            return parseArgs({ options, allowPositionals: true, strict: true });
        } catch (error) {
            fail(`${(error as Error).message}\n\n${usage}`);
        }
    };
    const flags = parseArgs({ options: COMMON_OPTIONS, allowPositionals: true, strict: false }).values;
    if (flags.help) {
        console.log(usage);
        process.exit(0);
    }
    process.env.LOG_LEVEL ??= flags.verbose ? "info" : "warn";
    return parse();
}

/** Options that every command has; they are part of the options of every command as well */
export const COMMON_OPTIONS = {
    help: { type: "boolean", short: "h" },
    verbose: { type: "boolean" },
} as const;

export function fail(message: string): never {
    console.error(message);
    process.exit(2);
}

/** Errors in a configuration or in the data are explained without a stack trace */
export function handleError(error: unknown): never {
    if (error instanceof ConfigError || error instanceof SettingsError || error instanceof MemberError) {
        console.error(`\n${error.message}`);
    } else {
        console.error(error);
    }
    process.exit(1);
}

export function parseFormats(value: string | undefined): FormatName[] | undefined {
    if (value === undefined) return undefined;
    const formats = value.split(",").map((format) => format.trim());
    for (const format of formats) {
        if (!FORMAT_NAMES.includes(format as FormatName)) {
            fail(`Unknown format "${format}", choose from ${FORMAT_NAMES.join(", ")}`);
        }
    }
    return formats as FormatName[];
}

export function parsePositiveInteger(value: string | undefined, option: string): number | undefined {
    if (value === undefined) return undefined;
    const number = Number(value);
    if (!Number.isInteger(number) || number <= 0) fail(`${option} must be a positive integer, found ${value}`);
    return number;
}

/** A table of bytes per member, for every format and the baseline */
export function sizeTable(rows: [string, Sizes][], members: number): string {
    const cell = (value: number) => (value / members).toFixed(1).padStart(10);
    const lines = [
        `Bytes per member (${members} members); every file compressed on its own:`,
        "".padEnd(46) + ["raw", "gzip", "zstd", "brotli"].map((h) => h.padStart(10)).join(""),
        ...rows.map(
            ([label, sizes]) => label.padEnd(46) + [sizes.raw, sizes.gzip, sizes.zstd, sizes.brotli].map(cell).join(""),
        ),
    ];
    return lines.join("\n");
}
