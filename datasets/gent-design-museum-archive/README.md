# Archive of Design Museum Gent, in JSON-LD

The museums and archives of Ghent publish their collections as LDES 1.0 in JSON-LD, listed in the
[CoGhent catalog](https://apidg.gent.be/opendata/adlib2eventstream/v1/). This dataset is the archive of
[Design Museum Gent](https://www.designmuseumgent.be): posters, prints and other documents, in the Flemish application
profile for [cultural heritage objects](https://data.vlaanderen.be/ns/cultureel-erfgoed). Every member is a version of
one object (`MensgemaaktObject`, `cidoc:E22_Human-Made_Object`), with its identifiers, title, makers, dimensions and
the collection it belongs to:

```json
{
  "@context": ["https://apidg.gent.be/opendata/adlib2eventstream/v1/context/cultureel-erfgoed-object-ap.jsonld", "..."],
  "@id": "https://stad.gent/id/mensgemaaktobject/dmg/536003495/2023-06-24T00:00:06.686Z",
  "@type": "MensgemaaktObject",
  "dcterms:isVersionOf": "https://stad.gent/id/mensgemaaktobject/dmg/536003495",
  "prov:generatedAtTime": "2023-06-24T00:00:06.686Z",
  "MensgemaaktObject.titel": { "@value": "100 jaar, 100 mensen, 100 objecten", "@language": "nl" },
  "...": "..."
}
```

It is the only example whose source is JSON-LD, and every member refers to remote JSON-LD contexts. The LDES has a
single page of 131 members, so the conversion reads all of it.

```bash
npm run convert -- gent-design-museum-archive
npm run check -- gent-design-museum-archive
```

## From LDES 1.0 to LDES 2.0

- **JSON-LD.** The server only serves JSON-LD (`"accept": "application/ld+json"`), which is also what the size of the
  source is measured in. ldes-client reads the members; the description of the event stream and the raw pages that
  `check` compares with are parsed with [jsonld-streaming-parser](https://github.com/rubensworks/jsonld-streaming-parser.js),
  which fetches every remote context once.
- **Entry point.** `.../dmg/archief` redirects to its page, which is the `tree:view` of the event stream. ldes-client
  does not find that view from the URL before the redirect, so the configuration starts at the page itself. The event
  stream has no other page.
- **Membership.** Every member is a `cidoc:E22_Human-Made_Object`, the only one in its message, so the LDES 2.0 uses
  `ldes:memberType cidoc:E22_Human-Made_Object`.
- **Order.** Members have a `prov:generatedAtTime`, and the relations of the other CoGhent streams use it, but the
  event stream does not state an `ldes:timestampPath`, so ldes-client cannot give the members in order of time. The
  pages keep the order of the source (`"timestampPath": null`, implicit order). `ldes:versionOfPath dct:isVersionOf`
  is configured, as the event stream does not state it either.
- **Pages.** At most 50 members per page (`"pages": { "size": 50 }`).

## Other CoGhent streams

The other streams of the catalog are much larger, which makes them less suited as examples:

- People (`adlib/personen`) has over 230 000 members. Its timestamps cannot be used to choose a window, as above, and
  without them `check` reads the whole stream again to find a sample.
- The exhibitions of Design Museum Gent (`dmg/tentoonstellingen`) have pages of 6.8 MB, with members of about 80 KB
  that each refer to six remote contexts. With jsonld-streaming-parser, 20 of those members already take 10 seconds to
  parse, and a page has 208; a conversion did not get past the first page in 15 minutes.

## License

The CoGhent catalog publishes the stream under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/), by Design
Museum Gent. The event stream does not state a license itself, so the configuration adds it to the catalog
(`"license"`).
