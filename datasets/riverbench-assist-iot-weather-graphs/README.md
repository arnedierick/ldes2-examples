# ASSIST-IoT weather (graphs variant), from RiverBench

[RiverBench](https://w3id.org/riverbench) publishes benchmark datasets of RDF streams. In
[assist-iot-weather-graphs](https://w3id.org/riverbench/datasets/assist-iot-weather-graphs/dev), a Davis Vantage Pro 2
weather station of the Systems Research Institute of the Polish Academy of Sciences measured the weather every 10
seconds, during the ASSIST-IoT Horizon 2020 project. Every stream element is one named graph with the measurements of
one moment, annotated with its time in the default graph:

```trig
<https://assist-iot.eu/pilot2_rdf/graph/ws/ibs_1/2023-01-02T15%3A36%3A37.065535>
    prov:atTime "2023-01-02T15:36:37.065535"^^xsd:dateTime .                       # default graph
<https://assist-iot.eu/pilot2_rdf/graph/ws/ibs_1/2023-01-02T15%3A36%3A37.065535> {
    pilot:obs/humidity a sosa:Observation ; sosa:resultTime "2023-01-02T15:36:37.065535"^^xsd:dateTime ; ...
}
```

The configuration converts the first 10 000 of the 701 278 stream elements; set `"size"` to `100k` or `full` for more.

```bash
npm run convert -- riverbench-assist-iot-weather-graphs
npm run check -- riverbench-assist-iot-weather-graphs
```

## From RiverBench to LDES 2.0

Everything comes from the metadata of the dataset, so the configuration only names it:

- **Membership.** It is a timestamped named graph stream, so every member is the only named graph of its message
  (`ldes:memberGraph true`), and the triple with its timestamp in the default graph belongs to the same member.
- **Order.** RiverBench states that the stream elements are split in time on `prov:atTime` (`rb:hasTemporalProperty`),
  so that is the `ldes:timestampPath`. These timestamps have no timezone: a client compares them as if they were in
  the same, unknown, timezone, which is exact within this LDES. RiverBench does not state the timezone, so no
  `ldes:defaultTimezone` is claimed.
- **link.** Besides pages in TriG, N-Quads and Jelly-RDF 1.2, `link/root.trig` describes the Jelly file of RiverBench
  itself as the only page of an LDES 2.0: every Jelly frame is a member message. The file never changes, so it is
  marked `ldes:immutable`.
- **Check.** The members are compared with the Jelly 1.1 distribution and with the Jelly 1.2 distribution of RiverBench,
  which are encoded separately.

This follows the first LDES 2.0 example by Pieter Colpaert in
[ldes-client](https://github.com/rdf-connect/ldes-client) (`examples/riverbench`), which described this RiverBench
file as an LDES 2.0 by hand, with a catalog entry for it.

## License

The data is available under [CC BY 4.0](https://spdx.org/licenses/CC-BY-4.0), by the ASSIST-IoT Horizon 2020 project
and Piotr Sowiński. The generated `catalog.ttl` lists the creators as RiverBench states them.
