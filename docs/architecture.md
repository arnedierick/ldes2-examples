# Architecture

```
bin/                    the commands: convert, check, datasets (option parsing and output only)
src/
  config.ts             dataset.json: types, defaults and validation
  settings.ts           configuration + what the source says + command line → the settings of one conversion
  convert.ts            the conversion: source → validated members → pages → root pages, catalog, stats.json
  check.ts              the check: every serialization read back, and a sample compared with the source
  sources/
    source.ts           the Source interface
    ldes1.ts            an LDES 1.0, read with ldes-client
    riverbench.ts       a RiverBench dataset, read from its Jelly distributions
    index.ts            createSource(): the configuration of a source → a Source
  members.ts            the rules of LDES 2.0 for one member message: membership, timestamp, blank nodes
  pager.ts              ordered members → pages, with the interval or number of every page
  writers.ts            RDF Message logs: Turtle, TriG, N-Triples, N-Quads, Jelly-RDF 1.2
  root.ts               the root page and the DCAT catalog
  prefixes.ts           prefixes for the text formats, from the data
  compare.ts            members compared by isomorphism, and a readable difference
  time.ts               xsd:dateTime values, without losing their lexical form or precision
  sizes.ts              bytes, raw and compressed
  client.ts             reading an LDES with ldes-client
  rdf.ts                reading RDF documents with N3.js, and JSON-LD with jsonld-streaming-parser
  output.ts             the layout of out/<dataset>/ and stats.json
test/                   vitest; no network needed
```

## The flow of a conversion

1. `createSource()` makes a `Source` for the configuration of the dataset.
2. `source.describe()` says what the source knows about itself: its IRI, title, license, timestamp path, how members
   can be identified, whether they have named graphs, and statements for the catalog.
3. `resolveSettings()` completes the configuration with that description and the command line, and rejects
   contradictions (e.g. Turtle for members with named graphs) before anything is read.
4. `source.members()` streams the members. For every member, `convert()`:
   - skips it when it is outside the window, and stops at the end of the window or at the limit;
   - checks it: the membership rule must find exactly this member, its timestamp must not be earlier than that of the
     member before it, and either all or no timestamps have a timezone;
   - lets the `Pager` decide whether it starts a new page, and closes and measures the files of the previous page;
   - gives its blank nodes short labels, and writes it as one message to the page in every format.
5. The root page of every format, the catalog and `stats.json` are written.

Nothing is buffered except the first 100 members (to choose prefixes) and, for an LDES 1.0 read per fragment, the
members of one fragment (to sort them). Writers wait for the disk, so a large page is not kept in memory.

## Adding a kind of source

A source is anything that can stream members and read some of them again. To add one, for example for a SPARQL
endpoint:

1. Add its configuration type to `SourceConfig` in `src/config.ts`, and read it in `readSource()`.
2. Implement `Source` (`src/sources/source.ts`) in `src/sources/sparql.ts`:
   - `describe()`: what the source knows about itself. Leave out what it does not know: the configuration of a
     dataset can fill it in.
   - `members()`: the members, in ascending order of their timestamp when there is a timestamp path. Stop cleanly
     when the converter stops reading (a `finally` block in an async generator).
   - `baseline()`: the bytes the source used to deliver the members, to compare with; `undefined` when that cannot
     be measured.
   - `references()`: the sampled members, read again from the source, as independently from `members()` as possible:
     another request, another serialization, another parser. Add `counts` for parts of the source of which the
     LDES 2.0 must have the same number of members.
3. Create it in `createSource()` in `src/sources/index.ts`.
4. Add a dataset that uses it, and a test with a small source in `test/`.

The converter and the checker need no changes: they only use the `Source` interface.

## Design decisions

- **Validate, don't repair.** The converter does not reorder members or invent identifiers: when the data does not
  fit a rule of LDES 2.0, it stops and says which setting to change, so that every LDES 2.0 it writes is read by a
  client exactly as the source intended.
- **Relative IRIs.** Root pages and the catalog use relative IRIs, so the output can be published anywhere. Only
  explicit membership needs the absolute IRI of the event stream in every message (`--base-url`).
- **Independent references.** The checker compares with data that did not pass through the converter: a new harvest,
  a raw parse without ldes-client, or another distribution of the source.
- **Fair sizes.** Every format gets the same members with the same short blank node labels, text formats get prefixes,
  and every file is compressed on its own as an HTTP server would.
