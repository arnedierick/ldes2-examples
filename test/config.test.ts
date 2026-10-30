import { describe, expect, test } from "vitest";
import { ConfigError, listDatasets, loadDataset, parseConfig } from "../src/config.ts";

const riverbench = { source: { type: "riverbench", dataset: "assist-iot-weather-graphs" } };

describe("dataset configuration", () => {
    test("a minimal configuration only names its source", () => {
        expect(parseConfig(riverbench, "rb")).toMatchObject({
            id: "rb",
            source: { type: "riverbench", dataset: "assist-iot-weather-graphs" },
        });
    });

    test("all fields are read", () => {
        const config = parseConfig(
            {
                title: "Telraam",
                license: "https://spdx.org/licenses/CC-BY-4.0",
                source: {
                    type: "ldes1",
                    url: "https://example.org/ldes",
                    fragments: { template: "https://example.org/ldes?hour={hour}", every: "hour" },
                    accept: "text/turtle",
                    rawReference: false,
                    shape: false,
                },
                membership: { type: "https://example.org/Observation" },
                timestampPath: null,
                versionOfPath: "http://purl.org/dc/terms/isVersionOf",
                graphs: false,
                window: { from: "2026-10-28T08:00:00Z", until: "2026-10-28T10:00:00Z", limit: 5 },
                pages: { size: 500, bucket: "hour" },
                formats: ["turtle", "jelly"],
                prefixes: { ex: "https://example.org/" },
            },
            "telraam",
        );
        expect(config.source).toMatchObject({ rawReference: false, shape: false });
        expect(config.timestampPath).toBeNull();
        expect(config.pages).toEqual({ size: 500, bucket: "hour" });
        expect(config.prefixes).toEqual({ ex: "https://example.org/" });
    });

    test.each([
        [{}, /source is required/],
        [{ source: { type: "sparql" } }, /source.type/],
        [{ ...riverbench, membership: "type" }, /membership must be/],
        [{ ...riverbench, formats: ["xml"] }, /formats must be/],
        [{ ...riverbench, pages: { size: 0 } }, /pages.size must be a positive integer/],
        [{ ...riverbench, timestampPath: "created" }, /timestampPath must be an absolute IRI/],
        [{ ...riverbench, titel: "typo" }, /unknown field "titel"/],
        [
            { source: { type: "ldes1", url: "https://example.org", fragments: { template: "https://example.org" } } },
            /must contain/,
        ],
    ])("invalid configurations name the field that is wrong: %j", (json, message) => {
        expect(() => parseConfig(json, "x")).toThrow(ConfigError);
        expect(() => parseConfig(json, "x")).toThrow(message);
    });

    test("every dataset in datasets/ has a valid configuration", () => {
        const ids = listDatasets();
        expect(ids.length).toBeGreaterThan(0);
        for (const id of ids) expect(loadDataset(id).id).toBe(id);
    });
});
