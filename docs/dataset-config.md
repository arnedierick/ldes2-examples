# Dataset configuration

Every dataset is a folder in `datasets/`, of which the name is the name of the dataset. Its `dataset.json` says where
the members come from, and what the LDES 2.0 should look like. Everything that is not configured comes from the source
itself where possible. `src/config.ts` checks the configuration, and names the field that is wrong.

```json
{
  "$comment": "Anything: a note for whoever reads this file",
  "title": "Telraam traffic counts in Flanders",
  "description": "...",
  "license": "https://spdx.org/licenses/CC-BY-4.0",
  "source": { "type": "ldes1", "url": "https://ldes.telraam-api.net/measurements" },
  "membership": { "type": "https://data.vlaanderen.be/ns/verkeersmetingen#Verkeersmeting" },
  "timestampPath": "http://www.w3.org/ns/prov#generatedAtTime",
  "versionOfPath": "http://purl.org/dc/terms/isVersionOf",
  "graphs": false,
  "window": { "from": "2026-10-28T08:00:00Z", "until": "2026-10-28T10:00:00Z", "limit": 100000 },
  "pages": { "size": 500, "bucket": "hour" },
  "formats": ["turtle", "ntriples", "jelly"],
  "prefixes": { "sosa": "http://www.w3.org/ns/sosa/" }
}
```

## `source`

**An LDES 1.0** (`"type": "ldes1"`):

| Field | Meaning |
| --- | --- |
| `url` | The IRI of the `ldes:EventStream`. Its description provides the title, description, license, timestamp path and version path. |
| `fragments` | Optional. `{ "template": "...{year}-{month}-{day}T{hour}...", "every": "hour" }`: the fragment with the members of every hour (or `day`). `{year}`, `{month}`, `{day}` and `{hour}` become the zero padded UTC start of the hour or day. Use this when the relations of the LDES do not let a client skip to a time window: then the client starts at every fragment instead of at the event stream. It needs a window with `from` and `until`. |
| `accept` | The media type to request the pages in (default `text/turtle`): Turtle, TriG, N-Triples, N-Quads or JSON-LD (`application/ld+json`). This is also the serialization in which the size of the LDES 1.0 is measured. |
| `rawReference` | `false` to compare members only with what ldes-client extracts, not also with their Concise Bounded Description in the raw pages (default `true`). Switch it off when members are not the CBD of their identifier, e.g. when the LDES extracts them with a shape. |
| `shape` | `false` to extract every member as the Concise Bounded Description of its IRI, instead of with the `tree:shape` of the LDES (default `true`). With a shape, ldes-client dereferences a member that lacks a property the shape requires; when the server answers with a web page, the conversion stops, rather than adding the RDFa of that page to the member. |

**A RiverBench dataset** (`"type": "riverbench"`):

| Field | Meaning |
| --- | --- |
| `dataset` | The identifier of the dataset, e.g. `assist-iot-weather-graphs`. Its metadata provides the title, description, license, creators, temporal property and kind of stream. |
| `version` | The RiverBench version (default `dev`). |
| `size` | `10k`, `100k` or `full`: which Jelly distribution to convert (default `10k`). |

## The event stream

| Field | Meaning | Default |
| --- | --- | --- |
| `membership` | How a client finds the member in a message: `"graph"` (`ldes:memberGraph`: the member is the named graph of the message), `{ "type": "<class IRI>" }` (`ldes:memberType`: the only subject of that class in the message), or `"explicit"` (an `<EventStream> ldes:member <member>` triple in every message: always possible, but it costs bytes, and its IRI depends on `--base-url`). | RiverBench: `"graph"` for named graph streams, `"explicit"` for subject graph streams. LDES 1.0: none, as `tree:member` does not fit in a message, so it must be configured. |
| `timestampPath` | The predicate from a member to its timestamp, an `xsd:dateTime`. `null` keeps the order of the source instead (implicit order). Only a single predicate is supported, not a longer SHACL path. | The `ldes:timestampPath` of an LDES 1.0, the temporal property of a RiverBench dataset. |
| `versionOfPath` | The predicate from a member to the object it is a version of. `null` leaves it out. | The `ldes:versionOfPath` of an LDES 1.0. |
| `graphs` | Whether members have named graphs. Turtle and N-Triples cannot hold them. | From the kind of RiverBench stream; `false` for an LDES 1.0. |

## What to convert

| Field | Meaning |
| --- | --- |
| `title`, `description`, `license` | Override what the source says, for the catalog. |
| `window.from`, `window.until` | Only members with a timestamp in `[from, until)`. Needs a timestamp path. |
| `window.limit` | At most this many members. A check does not compare the number of members of a limited conversion. |
| `pages.size` | At most this many members per page (default: no maximum). |
| `pages.bucket` | `"hour"` or `"day"`: a new page every hour or day (UTC). Needs a timestamp path. |
| `formats` | Which of `turtle`, `trig`, `ntriples`, `nquads`, `jelly` and `link` to write. By default: Turtle, N-Triples and Jelly, or TriG, N-Quads and Jelly when members have named graphs; and `link` when the source has a file to link to, membership is not explicit and there is no window. |
| `prefixes` | Prefixes for Turtle and TriG pages, which take precedence over the ones the converter chooses. |

The command line overrides `formats`, `pages` and `window` (see `npm run convert -- --help`).

## The `link` format

The `link` format writes no pages: its root page has one relation, to a file of the source that is an LDES 2.0 page as
it is. For RiverBench, that is the Jelly distribution: every stream element in it is one Jelly frame, which a client
reads as one member message. The converter still reads all members, to check that the membership rule finds them and
that they are in order, and to write the interval of the relation. This is how the first LDES 2.0 example in
ldes-client described the RiverBench dataset `assist-iot-weather-graphs`.
