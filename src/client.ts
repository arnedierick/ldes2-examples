/**
 * Reading an LDES (1.0 or 2.0) with ldes-client (https://github.com/rdf-connect/ldes-client).
 */
import { replicateLDES, type Client } from "ldes-client";
import type { NamedNode } from "@rdfjs/types";
import type { SourceMember } from "./members.ts";

/** A member as the client emits it (the type is not exported by ldes-client itself) */
export type ClientMember = Parameters<Parameters<Client["init"]>[0]>[0];

export type ReadOptions = {
    /** Start at this page instead of looking for a view of the event stream (LDES 1.0) */
    urlIsView?: boolean;
    after?: Date;
    before?: Date;
    /** Ask the client to emit the members in ascending order of their timestamp */
    ascending?: boolean;
    fetch?: typeof fetch;
};

/** All members of an LDES, as the client extracts them */
export async function* readMembers(url: string, options: ReadOptions = {}): AsyncGenerator<SourceMember> {
    const client = replicateLDES(
        {
            url,
            urlIsView: options.urlIsView ?? false,
            after: options.after,
            before: options.before,
            fetch: options.fetch,
        },
        options.ascending ? "ascending" : "none",
    );
    const reader = client.stream({ highWaterMark: 100 }).getReader();
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) return;
            if (value.id.termType !== "NamedNode") {
                throw new Error(`The client found a member that is not an IRI: ${value.id.value}`);
            }
            yield { id: value.id as NamedNode, quads: value.quads };
        }
    } finally {
        // Stops the client when the caller stops early, e.g. after a limit
        await reader.cancel().catch(() => undefined);
        await client.close().catch(() => undefined);
    }
}

export type Response = { url: string; contentType: string; body: Buffer };

/**
 * A fetch that requests a media type, and passes every response body to a callback,
 * e.g. to measure how many bytes an LDES 1.0 server sends.
 */
export function recordingFetch(accept: string | undefined, onResponse: (response: Response) => void): typeof fetch {
    return async (input, init) => {
        const headers = new Headers(init?.headers);
        if (accept) headers.set("accept", accept);
        const response = await fetch(input, { ...init, headers });
        const body = Buffer.from(await response.clone().arrayBuffer());
        const url = response.url || (input instanceof Request ? input.url : String(input));
        onResponse({ url, contentType: response.headers.get("content-type") ?? "", body });
        return response;
    };
}
