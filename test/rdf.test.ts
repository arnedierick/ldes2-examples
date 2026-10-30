/**
 * Parsing RDF documents: Turtle with N3.js, and JSON-LD with remote contexts from a local server.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import http from "http";
import type { AddressInfo } from "net";
import { DataFactory } from "n3";
import { parsable, parseDocument } from "../src/rdf.ts";

const { namedNode, literal } = DataFactory;

describe("parsing documents", () => {
    let contextRequests = 0;
    const server = http.createServer((request, response) => {
        if (request.url !== "/context.jsonld") {
            response.writeHead(404).end();
            return;
        }
        contextRequests++;
        response
            .writeHead(200, { "content-type": "application/ld+json" })
            .end(JSON.stringify({ "@context": { ex: "http://example.org/", name: "ex:name" } }));
    });
    const base = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    beforeAll(() => new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve)));
    afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

    test("Turtle, TriG, N-Triples, N-Quads and JSON-LD can be parsed, HTML not", () => {
        for (const type of [
            "text/turtle",
            "application/trig; charset=utf-8",
            "application/n-quads",
            "application/ld+json",
        ]) {
            expect(parsable(type)).toBe(true);
        }
        expect(parsable("text/html")).toBe(false);
    });

    test("Turtle", async () => {
        const store = await parseDocument('<a> <http://example.org/name> "A" .', "http://example.org/");
        expect(
            store.has(
                DataFactory.quad(namedNode("http://example.org/a"), namedNode("http://example.org/name"), literal("A")),
            ),
        ).toBe(true);
    });

    test("JSON-LD, with an inline context and relative IRIs", async () => {
        const store = await parseDocument(
            JSON.stringify({ "@context": { name: "http://example.org/name" }, "@id": "a", name: "A" }),
            "http://example.org/",
            "application/ld+json; charset=utf-8",
        );
        expect(store.size).toBe(1);
        expect(
            store.has(
                DataFactory.quad(namedNode("http://example.org/a"), namedNode("http://example.org/name"), literal("A")),
            ),
        ).toBe(true);
    });

    test("JSON-LD with a remote context, which is fetched once for every document and member that uses it", async () => {
        const member = (id: string) => ({ "@context": base() + "/context.jsonld", "@id": "ex:" + id, name: id });
        const page = {
            "@context": base() + "/context.jsonld",
            "@id": "ex:page",
            "@included": [member("a"), member("b")],
        };
        const first = await parseDocument(JSON.stringify(page), base() + "/page1", "application/ld+json");
        const second = await parseDocument(JSON.stringify(page), base() + "/page2", "application/ld+json");
        for (const store of [first, second]) {
            expect(
                store
                    .getQuads(null, namedNode("http://example.org/name"), null, null)
                    .map((q) => q.object.value)
                    .sort(),
            ).toEqual(["a", "b"]);
        }
        expect(contextRequests).toBe(1);
    });
});
