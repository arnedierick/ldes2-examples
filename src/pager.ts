/**
 * Splits an ordered stream of members into pages, and computes what a relation to every page says about it.
 *
 * A new page starts when the current page has `size` members, or when a member is in a new hour or day (`bucket`).
 * For a timestamp ordered LDES, every page gets the interval [timeFrom, timeUntil) of its members:
 *  - the first page of a bucket starts at the start of the bucket, other pages at the timestamp of their first member;
 *  - the last page of a bucket ends at the end of the bucket, other pages just after their last member.
 * Members with the same timestamp can end up in two pages, so the intervals of pages can overlap; a client merges
 * the pages as sorted logs, so that is allowed.
 * For an LDES in implicit order, the relations carry the page number instead.
 */
import type { OrderedMember } from "./members.ts";
import { bucketEnd, bucketLabel, bucketStart, formatInstant, justAfter, type Bucket, type Timestamp } from "./time.ts";

export type PageSpec = {
    /** The maximum number of members per page */
    size?: number;
    /** Start a new page at every hour or day */
    bucket?: Bucket;
};

export type PageInfo = {
    /** The number of the page in the LDES, from 0 */
    number: number;
    /** The file name of the page, without extension */
    name: string;
    members: number;
    quads: number;
    /** The interval of the timestamps in the page (timestamp order only), as xsd:dateTime literals */
    timeFrom?: string;
    timeUntil?: string;
};

type Open = { page: PageInfo; bucket?: number; last?: Timestamp; indexInBucket: number };

export class Pager {
    private readonly spec: PageSpec;
    private readonly pages: PageInfo[] = [];
    private open?: Open;

    constructor(spec: PageSpec) {
        this.spec = spec;
        if (spec.size !== undefined && !(Number.isInteger(spec.size) && spec.size > 0)) {
            throw new Error(`A page size must be a positive integer, found ${spec.size}`);
        }
    }

    /**
     * Assigns the next member to a page. Returns the page, and whether it is a new page:
     * the caller then closes the files of the previous page and opens new ones.
     */
    place(member: OrderedMember): { page: PageInfo; isNew: boolean } {
        const { bucket, size } = this.spec;
        if (bucket && !member.timestamp) throw new Error("Pages per hour or day need members with a timestamp");
        const memberBucket = bucket && member.timestamp ? bucketStart(member.timestamp, bucket) : undefined;
        const current = this.open;
        const newBucket = current !== undefined && memberBucket !== current.bucket;
        const full = current !== undefined && size !== undefined && current.page.members >= size;

        let isNew = false;
        if (!current || newBucket || full) {
            if (current) this.close(current, newBucket);
            const indexInBucket = current && !newBucket ? current.indexInBucket + 1 : 0;
            this.open = {
                page: this.newPage(member, memberBucket, indexInBucket),
                bucket: memberBucket,
                indexInBucket,
            };
            this.pages.push(this.open.page);
            isNew = true;
        }
        const open = this.open!;
        open.page.members++;
        open.page.quads += member.quads.length;
        open.last = member.timestamp;
        return { page: open.page, isNew };
    }

    /** Closes the last page, and returns all pages */
    finish(): PageInfo[] {
        if (this.open) this.close(this.open, true);
        this.open = undefined;
        return this.pages;
    }

    private newPage(member: OrderedMember, memberBucket: number | undefined, indexInBucket: number): PageInfo {
        const { bucket, size } = this.spec;
        const number = this.pages.length;
        let name: string;
        if (bucket && memberBucket !== undefined) {
            const label = bucketLabel(memberBucket, bucket);
            name = size === undefined ? label : `${label}-${String(indexInBucket).padStart(4, "0")}`;
        } else {
            name = `page-${String(number).padStart(5, "0")}`;
        }
        const page: PageInfo = { number, name, members: 0, quads: 0 };
        if (member.timestamp) {
            page.timeFrom =
                bucket && memberBucket !== undefined && indexInBucket === 0
                    ? formatInstant(memberBucket, member.timestamp.zoned)
                    : member.timestamp.lexical;
        }
        return page;
    }

    /** Sets the upper bound of a page, now that its last member is known */
    private close(open: Open, lastOfBucket: boolean) {
        if (!open.last) return;
        const { bucket } = this.spec;
        open.page.timeUntil =
            bucket && open.bucket !== undefined && lastOfBucket
                ? formatInstant(bucketEnd(open.bucket, bucket), open.last.zoned)
                : formatInstant(justAfter(open.last), open.last.zoned);
    }
}
