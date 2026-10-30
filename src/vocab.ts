/**
 * The namespaces and terms that the converter writes itself.
 */
import { DataFactory } from "n3";

export const NS = {
    rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    rdfs: "http://www.w3.org/2000/01/rdf-schema#",
    xsd: "http://www.w3.org/2001/XMLSchema#",
    ldes: "https://w3id.org/ldes#",
    tree: "https://w3id.org/tree#",
    dct: "http://purl.org/dc/terms/",
    dcat: "http://www.w3.org/ns/dcat#",
    prov: "http://www.w3.org/ns/prov#",
    foaf: "http://xmlns.com/foaf/0.1/",
    sh: "http://www.w3.org/ns/shacl#",
} as const;

/** Prefixes used in every Turtle and TriG page, next to the prefixes of the dataset */
export const DEFAULT_PREFIXES: Record<string, string> = {
    rdf: NS.rdf,
    rdfs: NS.rdfs,
    xsd: NS.xsd,
    dct: NS.dct,
    prov: NS.prov,
};

export const RDF_TYPE = DataFactory.namedNode(NS.rdf + "type");
export const LDES_MEMBER = DataFactory.namedNode(NS.ldes + "member");
export const LDES_EVENT_STREAM = DataFactory.namedNode(NS.ldes + "EventStream");
