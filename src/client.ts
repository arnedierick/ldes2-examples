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

/**
 * All members of an LDES, as the client extracts them.
 *
 * ldes-client logs a page it cannot fetch and goes on without it, which would silently leave out the members of that
 * page, and of every page behind it. A fetch that fails is therefore an error here, once the client is done.
 */
export async function* readMembers(url: string, options: ReadOptions = {}): AsyncGenerator<SourceMember> {
    const failures: string[] = [];
    const fetch = options.fetch;
    const client = replicateLDES(
        {
            url,
            urlIsView: options.urlIsView ?? false,
            after: options.after,
            before: options.before,
            fetch:
                fetch &&
                (async (input, init) => {
                    try {
                        return await fetch(input, init);
                    } catch (error) {
                        failures.push(`${input instanceof Request ? input.url : String(input)} (${describe(error)})`);
                        throw error;
                    }
                }),
        },
        options.ascending ? "ascending" : "none",
    );
    const incomplete = (cause?: unknown) =>
        new Error(`Could not fetch ${failures.join(", ")}, so the members of the LDES are incomplete`, { cause });
    const reader = client.stream({ highWaterMark: 100 }).getReader();
    try {
        while (true) {
            // The client either ends its stream with an error, or ends it as if nothing was missing
            const { done, value } = await reader.read().catch((error) => {
                throw failures.length > 0 ? incomplete(error) : error;
            });
            if (done) {
                if (failures.length > 0) throw incomplete();
                return;
            }
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

/** How often a request is tried, and how long to wait before the second try (doubled before every next one) */
export type Retry = { attempts?: number; delay?: number };

/**
 * A fetch that requests a media type, and passes every response body to a callback,
 * e.g. to measure how many bytes an LDES 1.0 server sends.
 *
 * A request that fails on the network, also while its body is read (e.g. "other side closed"), is tried again: the
 * retries of ldes-client only cover HTTP status codes such as 503.
 */
export function recordingFetch(
    accept: string | undefined,
    onResponse: (response: Response) => void,
    retry: Retry = {},
): typeof fetch {
    const attempts = retry.attempts ?? 5;
    return async (input, init) => {
        const headers = new Headers(init?.headers);
        if (accept) headers.set("accept", accept);
        let delay = retry.delay ?? 500;
        for (let attempt = 1; ; attempt++) {
            try {
                const response = await fetch(input, { ...init, headers });
                const body = Buffer.from(await response.clone().arrayBuffer());
                const url = response.url || (input instanceof Request ? input.url : String(input));
                onResponse({ url, contentType: response.headers.get("content-type") ?? "", body });
                return response;
            } catch (error) {
                if (attempt >= attempts || init?.signal?.aborted) throw error;
                await new Promise((resolve) => setTimeout(resolve, delay));
                delay *= 2;
            }
        }
    };
}

/** The cause of a failed fetch, as Node.js puts it in `cause` */
function describe(error: unknown): string {
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
    return cause instanceof Error ? cause.message : String(cause);
}
