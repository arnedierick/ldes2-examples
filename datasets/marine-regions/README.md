# Marine Regions gazetteer

[Marine Regions](https://www.marineregions.org) is a standard list of marine place names and boundaries (seas, sea
areas, EEZs, seamounts, ...), maintained by the Flanders Marine Institute (VLIZ). It publishes every change to a place
as an LDES 1.0 at <https://www.marineregions.org/feed>: every member is a version of one `mr:MRGeoObject`, with its
names, its place types, its relations to other places (`mr:contains`, `mr:isPartOf`, ...) and its matches in other
gazetteers.

```bash
npm run convert -- marine-regions                    # the changes from 2025-01-01 until 2026-10-29 (UTC)
npm run check -- marine-regions
```

## From LDES 1.0 to LDES 2.0

- **Window.** The LDES has one page per hour in which places changed, linked to the previous and the next page by
  `tree:LessThanRelation` and `tree:GreaterThanOrEqualToRelation` on `dct:modified`, so a client can find a window
  from the event stream. The gazetteer changes slowly: the configured window of almost two years has about 3 700
  members.
- **Membership.** Every member is a `mr:MRGeoObject`, the only one in its message, so the LDES 2.0 uses
  `ldes:memberType mr:MRGeoObject`.
- **Order.** `ldes:timestampPath dct:modified` and `ldes:versionOfPath dct:isVersionOf` come from the LDES 1.0.
- **Pages.** One page per day in which places changed (`"pages": { "bucket": "day" }`).
- **Check.** A member is more than the Concise Bounded Description of its IRI: the `tree:shape` of the LDES includes
  the gazetteers it matches (`skos:exactMatch`), with their `schema:identifier` and `schema:url`, and ldes-client
  extracts those too. The check therefore compares the members only with what ldes-client extracts from the LDES 1.0
  (`"rawReference": false`), not with the CBD in the raw pages.
- **Retention.** The LDES 1.0 keeps only the latest version of every place (`ldes:versionAmount 1`), so a place that
  changed again later is missing from the earlier pages. Converting the same window later can therefore give fewer
  members.

## License

Marine Regions licenses its products under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) (see its
[disclaimer](https://www.marineregions.org/disclaimer.php)). The LDES does not state a license itself, so the
configuration adds it to the catalog (`"license"`).
