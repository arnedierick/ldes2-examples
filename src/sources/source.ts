/**
 * A source of members: an LDES 1.0, a RiverBench dataset, or any other kind of data that a new source supports.
 *
 * To add a new kind of source, implement this interface in a file next to this one, add its configuration to
 * src/config.ts, and create it in src/sources/index.ts. The converter and the checker work for every source.
 */
import type { Quad } from "@rdfjs/types";
import type { Membership } from "../config.ts";
import type { SourceMember } from "../members.ts";
import type { Sizes } from "../sizes.ts";
import type { Timestamp } from "../time.ts";

/** What a source says about itself. It provides the defaults of the configuration of a dataset. */
export type SourceDescription = {
    /** The IRI of the source dataset, which the LDES 2.0 states it is derived from */
    iri: string;
    title?: string;
    description?: string;
    license?: string;
    /** Statements about the source dataset (its creators, themes, ...), copied into the catalog */
    catalog: Quad[];
    timestampPath?: string;
    versionOfPath?: string;
    /** How members can be identified, if the source knows it */
    membership?: Membership;
    /** Whether members have named graphs */
    graphs: boolean;
    /** A file of the source that is an LDES 2.0 page as it is, which the `link` format can point at */
    link?: { url: string; mediaType: string };
};

export type MemberOptions = {
    /** Only members at or after this time */
    from?: Date;
    /** Only members before this time */
    until?: Date;
    /** The timestamp path, for a source that has to order its members itself */
    timestampPath?: string;
    /** How the converter identifies members, for a source of which the data has no identifiers of its own */
    membership: Membership;
};

/** The bytes a source used to deliver the members that were read: the baseline to compare the LDES 2.0 with */
export type Baseline = { label: string; sizes: Sizes };

/** A member in the sample of the checker */
export type SampledMember = { id: string; timestamp?: Timestamp };

/**
 * An independent copy of the sampled members, read again from the source, to compare the LDES 2.0 with.
 * `counts` are numbers of members in parts of the source (e.g. "the fragment of 2026-10-28T08"), which the LDES 2.0
 * must have as well.
 */
export type Reference = {
    name: string;
    members: Map<string, Quad[]>;
    counts: { label: string; expected: number; includes: (member: SampledMember) => boolean }[];
};

export type ReferenceOptions = {
    membership: Membership;
    timestampPath?: string;
    /** The window of the conversion, to count the members the LDES 2.0 should have */
    from?: Date;
    until?: Date;
};

export interface Source {
    describe(): Promise<SourceDescription>;
    /**
     * The members, in ascending order of their timestamp when there is a timestamp path, or else in the order of the
     * source. The converter stops reading when it has enough members, which must stop the source as well.
     */
    members(options: MemberOptions): AsyncIterable<SourceMember>;
    /** What reading the members cost, once they are read; undefined when that cannot be measured */
    baseline(): Promise<Baseline | undefined>;
    /** Reads the sampled members again, in one or more independent ways */
    references(sample: SampledMember[], options: ReferenceOptions): Promise<Reference[]>;
}
