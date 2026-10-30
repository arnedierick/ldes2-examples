# LDES 2.0 examples

Example datasets for [Linked Data Event Streams](https://w3id.org/ldes/specification) 2.0, converted from existing
data, and the tools to make more of them:

- **`convert`** turns an LDES 1.0 or a [RiverBench](https://w3id.org/riverbench) dataset into an LDES 2.0, in Turtle,
  TriG, N-Triples, N-Quads and [Jelly-RDF 1.2](https://jelly-rdf.github.io), and measures the size of every
  serialization next to the source.
- **`check`** proves that the conversion lost no information: it reads every serialization back with
  [ldes-client](https://github.com/rdf-connect/ldes-client) and compares a sample of members, quad by quad, with the
  source.

LDES 2.0 (draft: [SEMICeu/LinkedDataEventStreams#116](https://github.com/SEMICeu/LinkedDataEventStreams/pull/116))
writes every page of an event stream as a log of [RDF Messages](https://w3c-cg.github.io/rsp/spec/messages.html): one
message per member, so that a client can stream a page member by member, in any RDF serialization that can mark the
boundaries of messages.

## Datasets

| Dataset | Source | Members | License of the data |
| --- | --- | --- | --- |
| [telraam](datasets/telraam) | the [Telraam LDES 1.0](https://ldes.telraam-api.net/measurements) of traffic counts in Flanders | ~30 000 per hour, default window 2 hours | public access, no explicit license (see the [dataset](datasets/telraam)) |
| [riverbench-assist-iot-weather-graphs](datasets/riverbench-assist-iot-weather-graphs) | the RiverBench dataset [assist-iot-weather-graphs](https://w3id.org/riverbench/datasets/assist-iot-weather-graphs/dev) | 10 000 (of 701 278) | CC BY 4.0 |
| [riverbench-citypulse-traffic-graphs](datasets/riverbench-citypulse-traffic-graphs) | the RiverBench dataset [citypulse-traffic-graphs](https://w3id.org/riverbench/datasets/citypulse-traffic-graphs/dev) | 10 000 (of 4 382 599) | CC BY 4.0 |
| [riverbench-officegraph](datasets/riverbench-officegraph) | the RiverBench dataset [officegraph](https://w3id.org/riverbench/datasets/officegraph/dev) | 10 000 (of 14 930 478) | CC BY 4.0 |
| [riverbench-muziekweb](datasets/riverbench-muziekweb) | the RiverBench dataset [muziekweb](https://w3id.org/riverbench/datasets/muziekweb/dev) | 10 000 (of 2 450 357) | ODC-By 1.0 |
| [marine-regions](datasets/marine-regions) | the [Marine Regions LDES 1.0](https://www.marineregions.org/feed) of changes to marine place names | 3 682, default window 2025-01-01 to 2026-10-29 | CC BY 4.0 |
| [gent-design-museum-archive](datasets/gent-design-museum-archive) | the [CoGhent LDES 1.0](https://apidg.gent.be/opendata/adlib2eventstream/v1/dmg/archief) of the archive of Design Museum Gent, in JSON-LD | 131 (all) | CC0 1.0 |
| [edmo](datasets/edmo) | the [EDMO LDES 1.0](https://edmo.seadatanet.org/ldes/feed) of changes to the European Directory of Marine Organisations | 133, default window 2026-01-01 to 2026-10-29 | CC BY 4.0, under the [EMODnet terms of use](https://emodnet.ec.europa.eu/en/terms-use-emodnet-online-services-data-and-data-products) |
| [nerc-p01](datasets/nerc-p01) | the [NERC Vocabulary Server LDES 1.0](http://vocab.nerc.ac.uk/ldes/P01/) of the P01 vocabulary | 50 612, all changes up to 2026-10-23 | CC BY 4.0 |

The converted data is not in this repository: it is generated in `out/` (see [Output](#output)).

## Getting started

You need [Node.js](https://nodejs.org) 24 or newer, and a build of ldes-client with LDES 2.0 support next to this
folder. That support is on the `experiment-ldes-2.0` branch and not released yet, so `package.json` refers to it as
`file:../ldes-client`. This local install is temporary: once ldes-client publishes a release with LDES 2.0 support
(e.g. an alpha on npm), this project will depend on that release, and a plain `npm install` will be enough.

```bash
git clone -b experiment-ldes-2.0 https://github.com/KNowledgeOnWebScale/ldes-client ../ldes-client
(cd ../ldes-client && npm install && npm run build)
npm install
```

Then convert a dataset and check it:

```bash
npm run datasets                                   # lists the datasets
npm run convert -- riverbench-assist-iot-weather-graphs
npm run check -- riverbench-assist-iot-weather-graphs
```

The converted LDES can be read like any other, for example with the client's command line:

```bash
npx ldes-client out/riverbench-assist-iot-weather-graphs/jelly/root.trig
```

### Options

Both commands take one or more dataset names, or `--all`. Options of `convert` override the configuration of the
dataset:

| Option | Meaning |
| --- | --- |
| `--formats turtle,jelly` | the serializations to write: `turtle`, `trig`, `ntriples`, `nquads`, `jelly`, `link` |
| `--page-size 500` | at most 500 members per page |
| `--bucket hour` | a new page every hour (or `day`) |
| `--from 2026-10-28T08:00:00Z --until 2026-10-28T12:00:00Z` | only members in this window |
| `--limit 1000` | at most 1000 members |
| `--out <dir>` | write to another folder than `out/` |
| `--base-url <url>` | the URL the dataset folder will be published at (only needed for explicit membership) |
| `--verbose` | show what ldes-client does |

`check` takes `--sample <n>` (default 50) and `--seed <n>` (default 1) to choose the members it compares, and
`--formats` to check only some serializations. It exits with status 1 when a check fails.

## Output

```
out/<dataset>/
  catalog.ttl                 DCAT: the source dataset, with every serialization as a distribution
  stats.json                  what was converted, and the size of every page in every format
  turtle/root.trig            the root page of the LDES 2.0 in Turtle
  turtle/<page>.ldes.ttl      its pages
  jelly/root.trig, ...        the same LDES in the other serializations
  link/root.trig              (RiverBench) an LDES 2.0 whose only page is the Jelly file of RiverBench itself
```

Root pages and the catalog only use relative IRIs, so a dataset folder can be moved or published anywhere.

`convert` prints the bytes per member of every serialization next to the source, uncompressed and compressed with
gzip (level 6), zstd (level 3) and brotli (quality 5). Every page is compressed on its own, as an HTTP server
compresses every response on its own; the source is measured the same way (every LDES 1.0 page on its own).
`stats.json` has these numbers for every page.

## How a conversion works

A conversion reads the members of the source in order, checks every member against the rules of LDES 2.0, and writes
it as one RDF Message in every page format. It stops with an error that says what to change, rather than writing an
LDES 2.0 that a client would read differently from the source.

- **One member per message.** Every message holds all quads of one member, so a client never has to look further
  than the message to know the member.
- **Membership.** The root page says how a client finds the member in a message:
  `ldes:memberGraph true` (the member is the named graph of the message), `ldes:memberType <class>` (the only subject
  of that class), or an explicit `<EventStream> ldes:member <member>` triple in every message. The converter checks
  for every member that the rule finds that member, and nothing else.
- **Order.** With a timestamp path (from the source or the configuration), every page is in ascending order of the
  timestamps of its members, and every relation in the root page has the interval `[ldes:timeFrom, ldes:timeUntil)`
  of the page. Without one, members keep the order of the source, and relations carry `ldes:pageNumber` (implicit
  order). Timestamps without a timezone (RiverBench) are kept that way.
- **Pages.** A page holds at most `size` members, and/or the members of one hour or day (`bucket`). All pages are
  marked `ldes:immutable true`, since a conversion never changes.
- **Blank nodes** are local to an RDF Message, so they get short labels per message (`_:b0`, ...). In Turtle and
  TriG, a blank node that is the object of one triple is written inside it as `[ ... ]`.
- **Prefixes.** Turtle and TriG pages declare prefixes once, at the top: the configured ones, the usual ones for
  well-known vocabularies, and `ns1`, `ns2`, ... for namespaces that most of the first 100 members use. Jelly splits
  IRIs into prefixes and names by itself, so without this the text formats would be compared at a disadvantage.
- **Catalog.** `catalog.ttl` describes the source as a `dcat:Dataset`, with what the source says about itself (title,
  creators, license, ...), and every serialization as an `ldes:EventStream` that is a `dcat:Distribution` of it.

## How a check works

1. Every serialization is read back with ldes-client. All of them must have the same members, as many as the
   conversion wrote.
2. A seeded random sample of members is read again from the source, independently of the conversion:
   - **LDES 1.0**: the fragments of the sampled members are harvested again with ldes-client, and the raw pages are
     also parsed without ldes-client, taking the Concise Bounded Description of every sampled member;
   - **RiverBench**: the Jelly 1.1 distribution is read again, and the Jelly 1.2 distribution of the same size too,
     which RiverBench encodes separately.
3. Every sampled member must have exactly the same quads in every serialization as in every reference. Blank nodes
   are compared by isomorphism ([rdf-isomorphic](https://github.com/rubensworks/rdf-isomorphic.js)), so different
   labels are not differences, but a changed literal, a missing or an extra quad are. A difference is shown quad by
   quad.
4. The number of members per fragment (LDES 1.0) or in the distribution (RiverBench) must be the same in the
   LDES 2.0, unless the conversion was stopped by `--limit`.

## Adding a dataset

A dataset is a folder in [datasets/](datasets) with a `dataset.json`, and a `README.md` that explains it. A
configuration only states what the source does not say itself; [docs/dataset-config.md](docs/dataset-config.md) lists
every field.

An LDES 1.0, of which the relations let a client find a time window:

```json
{
  "source": { "type": "ldes1", "url": "https://example.org/observations" },
  "membership": { "type": "http://www.w3.org/ns/sosa/Observation" },
  "window": { "from": "2026-10-01T00:00:00Z", "until": "2026-10-02T00:00:00Z" },
  "pages": { "bucket": "hour" }
}
```

A RiverBench dataset ([all datasets](https://w3id.org/riverbench/v/dev/datasets)):

```json
{
  "source": { "type": "riverbench", "dataset": "muziekweb", "size": "10k" }
}
```

RiverBench says how its stream elements are organized: timestamped named graphs become members with
`ldes:memberGraph`, subject graphs get explicit membership, and other kinds of stream elements need a `"membership"`
with the class of the one resource in every element. RiverBench datasets without a temporal property are converted in
implicit order.

Then convert it, check it, and add it to the table above:

```bash
npm run convert -- my-dataset --limit 1000   # try a small part first
npm run check -- my-dataset
```

To support another kind of source (a SPARQL endpoint, a Kafka topic, files on disk, ...), see
[docs/architecture.md](docs/architecture.md).

## Development

```bash
npm test             # unit tests, and conversions that ldes-client reads back (no network needed)
npm run typecheck
npm run format
```

The code is TypeScript that Node.js runs directly (type stripping), so there is no build step.
[docs/architecture.md](docs/architecture.md) explains how the code is organized.

## Licenses and credits

The code is available under the [MIT license](LICENSE). The data keeps the license of its source: see the table of
datasets and the README of every dataset. Check that license before you publish converted data.

- The RiverBench example follows the first LDES 2.0 example by Pieter Colpaert in
  [ldes-client](https://github.com/rdf-connect/ldes-client), which described a RiverBench Jelly file as an LDES 2.0.
- [RiverBench](https://w3id.org/riverbench) is by Piotr Sowiński and contributors; its datasets have their own
  creators and licenses, which the catalog of every converted dataset lists.
- [Telraam](https://telraam.net) publishes its traffic counts as an LDES 1.0 at
  [ldes.telraam-api.net](https://ldes.telraam-api.net/measurements).
- [Marine Regions](https://www.marineregions.org) is maintained by the Flanders Marine Institute (VLIZ), and the
  [NERC Vocabulary Server](https://vocab.nerc.ac.uk) by the British Oceanographic Data Centre.
- [EDMO](https://edmo.seadatanet.org) is maintained by SeaDataNet, and the archive of
  [Design Museum Gent](https://www.designmuseumgent.be) is published by the City of Ghent in the
  [CoGhent catalog](https://apidg.gent.be/opendata/adlib2eventstream/v1/).
