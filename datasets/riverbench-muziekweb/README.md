# Muziekweb, from RiverBench

[RiverBench](https://w3id.org/riverbench) publishes benchmark datasets of RDF streams.
[Muziekweb](https://w3id.org/riverbench/datasets/muziekweb/dev) is the main graph of [Muziekweb](https://data.muziekweb.nl/),
a Dutch knowledge base about music: artists, CDs, LPs, and links to external resources. Every stream element is the
description of one resource:

```turtle
@prefix mw: <https://data.muziekweb.nl/vocab/> .
<https://data.muziekweb.nl/Link/00001178b1ca0a9390b0ea37d5e5b4dfaad63657> a mw:ExternalLink ;
    schema:url "https://open.spotify.com/album/13O0k9nDMic8IsZXjlB2Bl"^^xsd:anyURI ;
    rdfs:label "Listen to \"Lukas Passion 1748\" on \"Spotify\""@nl ;
    mw:provider "Spotify" .
```

The configuration converts the first 10 000 of the 2 450 357 stream elements; set `"size"` to `100k`, `1M` or `full`
for more.

```bash
npm run convert -- riverbench-muziekweb
npm run check -- riverbench-muziekweb
```

## From RiverBench to LDES 2.0

- **Membership.** It is a subject graph stream of resources of many classes, so there is no one class to use for
  `ldes:memberType`: every message has an explicit `<EventStream> ldes:member <member>` triple. Its IRI depends on
  where the dataset is published: use `--base-url` before you publish the pages.
- **Order.** A knowledge base has no time: RiverBench states no temporal property, so the pages keep the order of
  RiverBench (implicit order, with `ldes:pageNumber`).
- **Check.** The members are compared with the Jelly 1.1 distribution and with the Jelly 1.2 distribution of RiverBench.

## License

The data is available under [ODC-By 1.0](https://spdx.org/licenses/ODC-By-1.0), by the Netherlands Institute for Sound
and Vision, and Piotr Sowiński (RiverBench). The generated `catalog.ttl` lists the creators as RiverBench states them.
