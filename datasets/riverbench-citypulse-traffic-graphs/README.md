# CityPulse traffic (graphs variant), from RiverBench

[RiverBench](https://w3id.org/riverbench) publishes benchmark datasets of RDF streams. In
[citypulse-traffic-graphs](https://w3id.org/riverbench/datasets/citypulse-traffic-graphs/dev), traffic sensors on the
roads of Aarhus report the average speed, the average and median travel time and the number of vehicles every five
minutes, as published by the CityPulse EU FP7 project. Every stream element is one named graph with the observations
of one sensor at one moment, annotated with its time in the default graph:

```trig
<.../traffic_oct_nov/graphs/0000000000> timeline:at "2014-10-01T01:45:00"^^xsd:dateTime .     # default graph
<.../traffic_oct_nov/graphs/0000000000> {
    <.../trafficData158324#observations_vehCount_...> a sao:Point ; ssn:featureOfInterest ... ; ...
}
```

The configuration converts the first 10 000 of the 4 382 599 stream elements; set `"size"` to `100k` or `full` for
more.

```bash
npm run convert -- riverbench-citypulse-traffic-graphs
npm run check -- riverbench-citypulse-traffic-graphs
```

## From RiverBench to LDES 2.0

- **Membership.** It is a timestamped named graph stream, so every member is the only named graph of its message
  (`ldes:memberGraph true`), and the triple with its timestamp in the default graph belongs to the same member.
- **Order.** RiverBench states `timeline:at` as the temporal property, but the stream is not in order of it: as its
  description says, it consists of the chronologically ordered observations of one sensor after the other. In the
  first 10 000 elements, time jumps back once, from November to October 2014, where the second sensor starts. An LDES
  2.0 with that
  `ldes:timestampPath` would promise an order that the pages do not have, so the configuration sets
  `"timestampPath": null`, and the pages keep the order of RiverBench (implicit order, with `ldes:pageNumber`).
- **link.** Besides pages in TriG, N-Quads and Jelly-RDF 1.2, `link/root.trig` describes the Jelly file of RiverBench
  itself as the only page of an LDES 2.0.
- **Check.** The members are compared with the Jelly 1.1 distribution and with the Jelly 1.2 distribution of RiverBench.

## License

The data is available under [CC BY 4.0](https://spdx.org/licenses/CC-BY-4.0), by the CityPulse EU FP7 project and
Piotr Sowiński. The generated `catalog.ttl` lists the creators as RiverBench states them.
