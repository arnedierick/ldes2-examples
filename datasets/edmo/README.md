# EDMO: European Directory of Marine Organisations

[EDMO](https://edmo.seadatanet.org) is the directory of the organisations that take part in European marine research
and data management, maintained by [SeaDataNet](https://www.seadatanet.org). It publishes every change to an
organisation as an LDES 1.0 at <https://edmo.seadatanet.org/ldes/feed>: every member is a version of one
`org:Organization`, with its name, address, contacts, affiliations and location:

```turtle
<https://edmo.seadatanet.org/report/1801?t=2026-10-28T16%3A58%3A51%2B01%3A00> a org:Organization ;
    dct:isVersionOf <https://edmo.seadatanet.org/report/1801> ;
    dct:modified "2026-10-28T16:58:51+01:00"^^xsd:dateTime ;
    org:name "University of Southampton School of Ocean and Earth Science" ;
    org:hasAffiliation <https://edmo.seadatanet.org/report/4457> ;
    geosparql:hasGeometry <https://edmo.seadatanet.org/report/1801/geometry> ; ...
```

```bash
npm run convert -- edmo                              # the changes from 2026-01-01 until 2026-10-29 (UTC)
npm run check -- edmo
```

## From LDES 1.0 to LDES 2.0

- **Window.** Every page holds the changes of some days, and links to the previous page with a
  `tree:LessThanOrEqualToRelation` on `dct:modified`, so a client can find a window from the event stream.
- **Shape.** The `tree:shape` of the LDES requires properties that the members in its pages lack. ldes-client then
  dereferences every member, and EDMO answers with the web page of the organisation, of which the client would add
  the RDFa (stylesheets, an icon) to the member. The configuration therefore extracts every member as the Concise
  Bounded Description of its IRI, as the pages contain it (`"shape": false`), and no member is dereferenced.
- **Membership.** Every member is an `org:Organization`, the only one in its message, so the LDES 2.0 uses
  `ldes:memberType org:Organization`.
- **Order.** `ldes:timestampPath dct:modified` and `ldes:versionOfPath dct:isVersionOf` come from the LDES 1.0. Unlike
  the other examples, its timestamps have a timezone offset (`+01:00`, `+02:00`), which is kept; pages are split per
  day in UTC.
- **Pages.** One page per day in which organisations changed (`"pages": { "bucket": "day" }`).
- **Retention.** The LDES 1.0 keeps only the latest version of every organisation (`ldes:versionAmount 1`), so
  converting the same window later can give fewer members.

## License

EDMO is open data, available through [EMODnet](https://emodnet.ec.europa.eu/en/) under its
[terms of use](https://emodnet.ec.europa.eu/en/terms-use-emodnet-online-services-data-and-data-products), which
license EMODnet data under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The LDES does not state a
license itself, so the configuration adds it to the catalog (`"license"`).

The terms ask to acknowledge EMODnet and the data originator when you use the data, e.g.: "This data was downloaded
from the EMODnet Portal (https://emodnet.ec.europa.eu/en/). The data originator is SeaDataNet (EDMO)."
