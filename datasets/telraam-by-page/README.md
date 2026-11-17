# Telraam traffic counts in Flanders, by page

The same LDES 1.0 as [telraam](../telraam), read from its other view: `by-page`, a linked list of pages of 500
members, from `?pageNumber=1` (the oldest page Telraam keeps) onwards. The conversion stops after 500 000 members:
the first 1000 pages.

```bash
npm run convert -- telraam-by-page
npm run check -- telraam-by-page --sample 100
```

## From LDES 1.0 to LDES 2.0

- **Start.** The client starts at the first page of the view (`source.view`), not at the event stream, of which
  `by-time` is the default view.
- **Pages.** Every page of the LDES 2.0 holds the members of one page of the LDES 1.0, in the same order
  (`"pages": { "source": true }`).
- **Order.** The pages of this view are in the order in which Telraam added the members, not in order of their
  timestamp, so the LDES 2.0 is in implicit order (`"timestampPath": null`): its relations carry page numbers.
- **Membership and size of the source:** as for [telraam](../telraam).

Telraam keeps one year of counts, so `?pageNumber=1` holds other members as time goes by: convert this dataset at
the same time as you record its LDES 1.0 for a comparison.

## License

[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/), as all Telraam data: see [telraam](../telraam).
