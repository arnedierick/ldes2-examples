# OfficeGraph, from RiverBench

[RiverBench](https://w3id.org/riverbench) publishes benchmark datasets of RDF streams.
[OfficeGraph](https://w3id.org/riverbench/datasets/officegraph/dev) holds the measurements of 444 IoT devices in a
Dutch office building of seven floors, during 11 months, in the [SAREF](https://saref.etsi.org/core/) ontology. Every
stream element is one measurement, with the type of the property it measures:

```turtle
ex:measurement_R5_56__co2__0 a saref:Measurement ;
    saref:hasTimestamp "2022-02-28T23:59:00"^^xsd:dateTime ;
    saref:hasValue "504"^^xsd:float ;
    saref:isMeasuredIn om:partsPerMillion ;
    saref:relatesToProperty ex:property_R5_56__co2_ .
ex:property_R5_56__co2_ a ex:CO2Level .
```

The configuration converts the first 10 000 of the 14 930 478 stream elements; set `"size"` to `100k`, `1M`, `10M` or
`full` for more.

```bash
npm run convert -- riverbench-officegraph
npm run check -- riverbench-officegraph
```

## From RiverBench to LDES 2.0

- **Membership.** It is a subject graph stream, which by default gets an explicit `ldes:member` triple per message.
  But every element has two subjects that are IRIs, the measurement and its property, so the subject does not say
  which one is the member. Every element has exactly one `saref:Measurement`, so the configuration uses
  `ldes:memberType saref:Measurement` instead, which also costs no triple per member.
- **Order.** RiverBench states `sosa:resultTime` as the temporal property, but no element has it: the description of
  the dataset says the elements are ordered by `saref:hasTimestamp`, so the configuration sets that as the
  `ldes:timestampPath`. These timestamps have no timezone, so no `ldes:defaultTimezone` is claimed.
- **Check.** The members are compared with the Jelly 1.1 distribution and with the Jelly 1.2 distribution of RiverBench.

## License

The data is available under [CC BY 4.0](https://spdx.org/licenses/CC-BY-4.0), by Roderick van der Weerdt, Victor de
Boer, Ronnie Groenewold, Frank van Harmelen and Ronald Siebes (OfficeGraph), and Adam Skaskiewicz (RiverBench). The
generated `catalog.ttl` lists the creators as RiverBench states them.
