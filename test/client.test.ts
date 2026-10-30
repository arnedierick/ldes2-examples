/**
 * Reading an LDES 1.0 from a local server that drops connections, as a server under load does.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import http from "http";
import type { AddressInfo } from "net";
import { readMembers, recordingFetch } from "../src/client.ts";

const PREFIXES = `@prefix tree: <https://w3id.org/tree#> .
@prefix ldes: <https://w3id.org/ldes#> .
@prefix ex: <http://example.org/> .
`;

/** Two pages of two members each; the second page is only served after `drops` dropped connections */
function serve(): { server: http.Server; base: () => string; drop: (times: number) => void } {
    let drops = 0;
    const server = http.createServer((request, response) => {
        const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        const page = (members: string[], next?: string) =>
            PREFIXES +
            `<${base}/stream> a ldes:EventStream ; tree:view <${base}/page1> ;
                tree:member ${members.map((m) => "ex:" + m).join(", ")} .
            <${request.url === "/page1" ? base + "/page1" : base + "/page2"}> a tree:Node` +
            (next ? ` ; tree:relation [ a tree:Relation ; tree:node <${base}${next}> ] .` : " .") +
            members.map((m) => `\nex:${m} a ex:Thing ; ex:name "${m}" .`).join("");
        if (request.url === "/page2" && drops > 0) {
            drops--;
            // Half a response, then the connection is closed, like "other side closed"
            response.writeHead(200, { "content-type": "text/turtle", "content-length": "1000" });
            response.write(PREFIXES);
            response.socket?.destroy();
            return;
        }
        const body =
            request.url === "/page2"
                ? page(["c", "d"])
                : request.url === "/stream" || request.url === "/page1"
                  ? page(["a", "b"], "/page2")
                  : undefined;
        if (body === undefined) {
            response.writeHead(404).end();
            return;
        }
        response.writeHead(200, { "content-type": "text/turtle" }).end(body);
    });
    return {
        server,
        base: () => `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
        drop: (times) => (drops = times),
    };
}

async function names(url: string, attempts?: number): Promise<string[]> {
    const fetch = recordingFetch("text/turtle", () => undefined, { attempts, delay: 1 });
    const found: string[] = [];
    for await (const member of readMembers(url, { fetch }))
        found.push(member.id.value.replace("http://example.org/", ""));
    return found.sort();
}

describe("a server that drops connections", () => {
    const local = serve();
    beforeAll(() => new Promise<void>((resolve) => local.server.listen(0, "127.0.0.1", resolve)));
    afterAll(() => new Promise<void>((resolve) => local.server.close(() => resolve())));

    test("all members are read when the server answers", async () => {
        local.drop(0);
        expect(await names(local.base() + "/stream")).toEqual(["a", "b", "c", "d"]);
    });

    test("a dropped connection is tried again", async () => {
        local.drop(2);
        expect(await names(local.base() + "/stream", 3)).toEqual(["a", "b", "c", "d"]);
    });

    test("a page that cannot be fetched stops the reading, instead of leaving out its members", async () => {
        local.drop(10);
        await expect(names(local.base() + "/stream", 3)).rejects.toThrow(/page2/);
    });
});

/**
 * One page with two members, of which the tree:shape requires a property they do not have, so that ldes-client
 * dereferences them; the server answers for members with a web page with RDFa, as EDMO does, or drops the connection.
 */
function serveShaped(): {
    server: http.Server;
    base: () => string;
    memberRequests: () => number;
    dropMembers: (drop: boolean) => void;
} {
    let memberRequests = 0;
    let dropMembers = false;
    const server = http.createServer((request, response) => {
        const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        if (request.url?.startsWith("/member/")) {
            memberRequests++;
            if (dropMembers) {
                response.socket?.destroy();
                return;
            }
            response
                .writeHead(200, { "content-type": "text/html; charset=utf-8" })
                .end(
                    `<!doctype html><html><head><link rel="stylesheet" href="/style.css"></head><body>A member</body></html>`,
                );
            return;
        }
        if (request.url !== "/stream") {
            response.writeHead(404).end();
            return;
        }
        response.writeHead(200, { "content-type": "text/turtle" }).end(
            `${PREFIXES}@prefix sh: <http://www.w3.org/ns/shacl#> .
            <${base}/stream> a ldes:EventStream ; tree:view <${base}/stream> ;
                tree:shape [ a sh:NodeShape ; sh:property [ sh:path ex:required ; sh:minCount 1 ] ] ;
                tree:member <${base}/member/a>, <${base}/member/b> .
            <${base}/member/a> a ex:Thing ; ex:name "a" .
            <${base}/member/b> a ex:Thing ; ex:name "b" .`,
        );
    });
    return {
        server,
        base: () => `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
        memberRequests: () => memberRequests,
        dropMembers: (drop) => (dropMembers = drop),
    };
}

describe("members that the server only describes in web pages", () => {
    const local = serveShaped();
    beforeAll(() => new Promise<void>((resolve) => local.server.listen(0, "127.0.0.1", resolve)));
    afterAll(() => new Promise<void>((resolve) => local.server.close(() => resolve())));

    const read = async (noShape: boolean) => {
        const fetch = recordingFetch("text/turtle", () => undefined, { attempts: 1 });
        const members = [];
        for await (const member of readMembers(local.base() + "/stream", { fetch, noShape })) members.push(member);
        return members;
    };

    test("a web page stops the reading, instead of adding its RDFa to a member", async () => {
        local.dropMembers(false);
        await expect(read(false)).rejects.toThrow(/web page.*"shape": false/);
    });

    test("a member that cannot be dereferenced stops the reading", async () => {
        local.dropMembers(true);
        await expect(read(false)).rejects.toThrow(/member\/a/);
    });

    test('with "shape": false, members are their CBD, and are not dereferenced', async () => {
        const before = local.memberRequests();
        const members = await read(true);
        expect(members.map((member) => member.id.value.split("/").pop()).sort()).toEqual(["a", "b"]);
        expect(members.every((member) => member.quads.length === 2)).toBe(true);
        expect(local.memberRequests()).toBe(before);
    });
});
