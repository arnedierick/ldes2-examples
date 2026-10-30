# NERC Vocabulary Server: P01

The [NERC Vocabulary Server](https://vocab.nerc.ac.uk) of the British Oceanographic Data Centre publishes the
controlled vocabularies of oceanography. [P01](https://vocab.nerc.ac.uk/collection/P01/current/), the BODC Parameter
Usage Vocabulary, names what was measured, in what and how: about 50 000 concepts. Every vocabulary has an LDES 1.0 of
its changes at `http://vocab.nerc.ac.uk/ldes/<collection>/`; every member is a version of one `skos:Concept`:

```turtle
<http://vocab.nerc.ac.uk/collection/P01/current/SQPLPR01/1/> a skos:Concept ;
    dct:isVersionOf <http://vocab.nerc.ac.uk/collection/P01/current/SQPLPR01/> ;
    dct:modified "2026-10-21T09:54:12"^^xsd:dateTime ;
    skos:prefLabel "Sequence number of platform's profile"@en ;
    skos:notation "SDN:P01::SQPLPR01" ; ...
```

```bash
npm run convert -- nerc-p01
npm run check -- nerc-p01
```

## From LDES 1.0 to LDES 2.0

- **Entry point.** `http://vocab.nerc.ac.uk/ldes/P01/` serves the newest page, of which the base IRI is that page
  itself, and the event stream is `<feed>` relative to it, an IRI that does not resolve. ldes-client then finds no
  `tree:view` of the URL it was given. The configuration therefore starts at the newest page at the time it was
  written, `2026_10_15_10_13_02_2026_10_23_10_11_23.ttl`, which is the `tree:view` of the event stream in that page.
  Every page links to the previous one with a `tree:LessThanRelation`, so the conversion reads the whole history up to
  2026-10-23, and gives the same members every time. Point `source.url` at a newer page for newer changes.
- **Membership.** Every member is a `skos:Concept`, the only one in its message, so the LDES 2.0 uses
  `ldes:memberType skos:Concept`.
- **Order.** `ldes:timestampPath dct:modified` and `ldes:versionOfPath dct:isVersionOf` come from the LDES 1.0. These
  timestamps have no timezone, so no `ldes:defaultTimezone` is claimed.
- **Pages.** At most 1000 members per page (`"pages": { "size": 1000 }`).

## License

The vocabulary is published by the Natural Environment Research Council and created by the British Oceanographic Data
Centre, under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), as the description of the
[collection](https://vocab.nerc.ac.uk/collection/P01/current/) states. The LDES does not state a license itself, so
the configuration adds it to the catalog (`"license"`).
