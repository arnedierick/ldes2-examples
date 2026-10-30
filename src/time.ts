/**
 * xsd:dateTime values as they are needed to order members and to write the intervals of relations.
 *
 * A timestamp keeps its lexical form, so that an interval bound written by the converter is the timestamp of a member
 * exactly as the source wrote it. Timestamps without a timezone (such as those of RiverBench) are compared as if they
 * were in UTC: that is exact as long as all timestamps of a dataset lack a timezone, which the converter enforces.
 */

export type Timestamp = {
    /** The literal as it appears in the data */
    lexical: string;
    /** Milliseconds since the epoch, reading a value without timezone as UTC */
    epochMs: number;
    /** The digits of the second fraction beyond milliseconds, e.g. "535" for ".065535" */
    subMs: string;
    /** Whether the literal has a timezone */
    zoned: boolean;
};

const DATE_TIME = /^-?\d{4,}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/;

export function parseTimestamp(lexical: string): Timestamp | undefined {
    const value = lexical.trim();
    const match = DATE_TIME.exec(value);
    if (!match) return undefined;
    const fraction = (match[1] ?? ".").slice(1);
    const zoned = match[2] !== undefined;
    const ms = value.replace(/\.\d+/, "." + fraction.slice(0, 3).padEnd(3, "0"));
    const epochMs = Date.parse(zoned ? ms : ms + "Z");
    if (Number.isNaN(epochMs)) return undefined;
    return { lexical: value, epochMs, subMs: fraction.slice(3).replace(/0+$/, ""), zoned };
}

export function compareTimestamps(a: Timestamp, b: Timestamp): number {
    if (a.epochMs !== b.epochMs) return a.epochMs < b.epochMs ? -1 : 1;
    const length = Math.max(a.subMs.length, b.subMs.length);
    const x = a.subMs.padEnd(length, "0");
    const y = b.subMs.padEnd(length, "0");
    return x === y ? 0 : x < y ? -1 : 1;
}

/** Writes a point in time as an xsd:dateTime, with a "Z" timezone or, for datasets without timezones, without one */
export function formatInstant(epochMs: number, zoned: boolean): string {
    const iso = new Date(epochMs).toISOString();
    return zoned ? iso : iso.slice(0, -1);
}

/** The first millisecond after a timestamp: an exclusive upper bound that includes the timestamp itself */
export function justAfter(timestamp: Timestamp): number {
    return timestamp.epochMs + 1;
}

export type Bucket = "hour" | "day";

const BUCKET_MS: Record<Bucket, number> = { hour: 3_600_000, day: 86_400_000 };

/** The start of the hour or day (in UTC) that a timestamp is in */
export function bucketStart(timestamp: Timestamp, bucket: Bucket): number {
    return Math.floor(timestamp.epochMs / BUCKET_MS[bucket]) * BUCKET_MS[bucket];
}

export function bucketEnd(start: number, bucket: Bucket): number {
    return start + BUCKET_MS[bucket];
}

/** All bucket starts that overlap the window [from, until) */
export function bucketsIn(from: Date, until: Date, bucket: Bucket): number[] {
    const starts: number[] = [];
    const size = BUCKET_MS[bucket];
    for (let start = Math.floor(from.getTime() / size) * size; start < until.getTime(); start += size) {
        starts.push(start);
    }
    return starts;
}

/** A name for a bucket that can be used in a file name, e.g. "2026-10-28T08" for an hour */
export function bucketLabel(start: number, bucket: Bucket): string {
    return new Date(start).toISOString().slice(0, bucket === "hour" ? 13 : 10);
}
