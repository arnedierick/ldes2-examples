import { expect, test } from "vitest";
import { inferPrefixes, namespaceOf } from "../src/prefixes.ts";
import { EX, namedGraphElement, observation } from "./helpers.ts";

test("the namespace of an IRI ends at its last # or /", () => {
    expect(namespaceOf("http://www.w3.org/ns/sosa/Observation")).toBe("http://www.w3.org/ns/sosa/");
    expect(namespaceOf("https://w3id.org/ldes#member")).toBe("https://w3id.org/ldes#");
    expect(namespaceOf("https://example.org")).toBeUndefined();
    expect(namespaceOf("urn:uuid:1234")).toBeUndefined();
});

test("namespaces that most members use get a prefix, configured prefixes are kept", () => {
    const members = ["a", "b"].map((name) => observation(name, "2026-01-01T00:00:00Z").quads);
    const prefixes = inferPrefixes(members, { mine: "http://www.w3.org/2001/XMLSchema#" });
    expect(prefixes.mine).toBe("http://www.w3.org/2001/XMLSchema#");
    expect(Object.values(prefixes).filter((iri) => iri === "http://www.w3.org/2001/XMLSchema#")).toHaveLength(1);
    expect(prefixes.ns1).toBe(EX);
});

test("a namespace of one member only gets no prefix", () => {
    // Every element has its own namespace http://example.org/<name>/ for its observation
    const members = ["g1", "g2", "g3"].map((name) => namedGraphElement(name, "2026-01-01T00:00:00Z").quads);
    const prefixes = inferPrefixes(members, {});
    expect(Object.values(prefixes)).not.toContain(EX + "g1/");
    expect(Object.values(prefixes)).toContain(EX);
});

test("well-known namespaces get their usual prefix, unless the name is taken", () => {
    const members = [namedGraphElement("g", "2026-01-01T00:00:00Z").quads];
    expect(inferPrefixes(members, {})).toMatchObject({ dct: "http://purl.org/dc/terms/" });
    const prefixes = inferPrefixes(members, { dct: "https://example.org/other/" });
    expect(prefixes.dct).toBe("https://example.org/other/");
    const dublinCore = Object.entries(prefixes).find(([, iri]) => iri === "http://purl.org/dc/terms/")?.[0];
    expect(dublinCore).toMatch(/^ns\d+$/);
});
