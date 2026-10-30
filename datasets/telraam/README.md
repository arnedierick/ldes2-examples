# Telraam traffic counts in Flanders

[Telraam](https://telraam.net) sensors count pedestrians, bicycles, cars and heavy vehicles from the windows of
volunteers. Telraam publishes these counts for Flanders as an LDES 1.0 at
<https://ldes.telraam-api.net/measurements>, with the data model of the Flemish
[traffic measurements](https://data.vlaanderen.be/ns/verkeersmetingen) (`verkeer:Verkeersmeting`).

Every member is the count of one kind of traffic, in one direction, by one sensor, during one hour: about 30 000
members per hour. A member has about 20 triples, among which nested blank nodes for its time and its characteristic.

```bash
npm run convert -- telraam                                              # 2026-10-28, 08:00 to 10:00 (UTC)
npm run convert -- telraam --from 2026-10-29T00:00:00Z --until 2026-10-30T00:00:00Z --page-size 500
npm run check -- telraam --sample 100
```

## From LDES 1.0 to LDES 2.0

- **Window.** The LDES has two views: `by-page`, and `by-time`, which is fragmented per year, month, day and hour.
  Its relations only have a lower bound (`tree:GreaterThanOrEqualToRelation`), so a client that looks for one hour
  from the root has to read every fragment before it. The configuration therefore gives the template of the fragment of
  every hour, and the client starts at each of them (`source.fragments`). Telraam keeps one year of counts
  (`ldes:retentionPolicy` of `P1Y`): choose a window within the last year.
- **Membership.** Every member is a `verkeer:Verkeersmeting` (an `impl:Verkeerstelling` or an
  `impl:Verkeerssnelheidsmeting`), and it is the only one in its message, so the LDES 2.0 uses
  `ldes:memberType verkeer:Verkeersmeting` instead of a `tree:member` triple per member.
- **Order.** `ldes:timestampPath prov:generatedAtTime` and `ldes:versionOfPath dct:isVersionOf` come from the
  LDES 1.0. All members of an hour have the same timestamp, the start of that hour, so the pages of one hour have
  overlapping intervals when they are split by `--page-size`.
- **Pages.** One page per hour by default (`"pages": { "bucket": "hour" }`), like the fragments of the LDES 1.0.
- **Size of the source.** The LDES 1.0 is measured in Turtle (`"accept": "text/turtle"`), its most compact
  serialization: Telraam serves N-Quads at more than twice the size, and its TriG endpoint returns an error.

## License

The Flemish data catalog lists the dataset as
[public](https://www.vlaanderen.be/datavindplaats/catalogus/telraam-ldes-verkeerstellingen-in-vlaanderen)
(`dct:accessRights` `EAR:PUBLIC` in the description of the LDES), but neither the catalog nor the LDES states a
license. Converted data is therefore not included in this repository: ask Telraam before you publish it.
