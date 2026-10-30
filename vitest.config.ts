import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["test/**/*.test.ts"],
        // The integration tests write LDES 2.0 pages to disk and read them back with the client
        testTimeout: 60_000,
        env: { LOG_LEVEL: "warn" },
    },
});
