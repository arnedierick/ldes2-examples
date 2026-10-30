/**
 * Prefixes for Turtle and TriG pages, derived from the data.
 *
 * Without prefixes, every IRI in a text page is written in full, which makes Turtle and TriG look much bigger than
 * they need to be next to Jelly, which splits IRIs into a prefix and a name by itself. So the namespaces that most of
 * the first members use get a prefix: the usual one for well-known vocabularies, and ns1, ns2, ... for others.
 * Namespaces of one member only (e.g. of its own identifier) get none. Prefixes do not change the meaning of the data.
 * Prefixes in the configuration of a dataset take precedence.
 */
import type { Quad, Term } from "@rdfjs/types";

/** The usual prefixes of vocabularies that are common in LDES and RiverBench data */
export const WELL_KNOWN_PREFIXES: Record<string, string> = {
    rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    rdfs: "http://www.w3.org/2000/01/rdf-schema#",
    xsd: "http://www.w3.org/2001/XMLSchema#",
    owl: "http://www.w3.org/2002/07/owl#",
    dct: "http://purl.org/dc/terms/",
    dcat: "http://www.w3.org/ns/dcat#",
    prov: "http://www.w3.org/ns/prov#",
    foaf: "http://xmlns.com/foaf/0.1/",
    skos: "http://www.w3.org/2004/02/skos/core#",
    schema: "https://schema.org/",
    sosa: "http://www.w3.org/ns/sosa/",
    ssn: "http://www.w3.org/ns/ssn/",
    time: "http://www.w3.org/2006/time#",
    geo: "http://www.opengis.net/ont/geosparql#",
    om: "http://www.ontology-of-units-of-measure.org/resource/om-2/",
    qudt: "http://qudt.org/schema/qudt/",
    unit: "http://qudt.org/vocab/unit/",
    ldes: "https://w3id.org/ldes#",
    tree: "https://w3id.org/tree#",
    sh: "http://www.w3.org/ns/shacl#",
};

/** The namespace of an IRI: everything up to and including its last `#` or `/` */
export function namespaceOf(iri: string): string | undefined {
    const end = Math.max(iri.lastIndexOf("#"), iri.lastIndexOf("/"));
    return end > iri.indexOf("://") + 2 ? iri.slice(0, end + 1) : undefined;
}

function namespacesOf(quads: Quad[]): Set<string> {
    const namespaces = new Set<string>();
    const add = (term: Term) => {
        const iri =
            term.termType === "NamedNode" ? term.value : term.termType === "Literal" ? term.datatype.value : undefined;
        const namespace = iri && namespaceOf(iri);
        if (namespace) namespaces.add(namespace);
    };
    for (const quad of quads) [quad.subject, quad.predicate, quad.object, quad.graph].forEach(add);
    return namespaces;
}

/**
 * Prefixes for the namespaces that at least `share` of the members use, next to the configured prefixes.
 * Namespaces that already have a configured prefix keep it.
 */
export function inferPrefixes(
    members: Quad[][],
    configured: Record<string, string>,
    share = 0.5,
): Record<string, string> {
    const counts = new Map<string, number>();
    for (const member of members) {
        for (const namespace of namespacesOf(member)) counts.set(namespace, (counts.get(namespace) ?? 0) + 1);
    }
    const minimum = Math.max(1, share * members.length);

    const prefixes = { ...configured };
    const taken = new Set(Object.values(prefixes));
    const names = new Set(Object.keys(prefixes));
    const wellKnown = new Map(Object.entries(WELL_KNOWN_PREFIXES).map(([prefix, iri]) => [iri, prefix]));
    let next = 1;
    const used = [...counts].filter(([, n]) => n >= minimum).sort(([a], [b]) => a.localeCompare(b));
    for (const [namespace] of used) {
        if (taken.has(namespace)) continue;
        let name = wellKnown.get(namespace);
        if (name === undefined || names.has(name)) {
            while (names.has(`ns${next}`)) next++;
            name = `ns${next}`;
        }
        prefixes[name] = namespace;
        names.add(name);
        taken.add(namespace);
    }
    return prefixes;
}
