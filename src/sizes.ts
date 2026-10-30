/**
 * How many bytes a file takes, uncompressed and with the compressions an HTTP server would use.
 * Every file is compressed on its own, the way a server compresses every response on its own.
 */
import { brotliCompressSync, constants, gzipSync, zstdCompressSync } from "zlib";

export type Sizes = { raw: number; gzip: number; zstd: number; brotli: number };

/** The compression levels, which are written to stats.json next to the sizes */
export const COMPRESSION_LEVELS = { gzip: 6, zstd: 3, brotli: 5 } as const;

export const NO_BYTES: Sizes = { raw: 0, gzip: 0, zstd: 0, brotli: 0 };

export function measure(bytes: Uint8Array): Sizes {
    return {
        raw: bytes.length,
        gzip: gzipSync(bytes, { level: COMPRESSION_LEVELS.gzip }).length,
        zstd: zstdCompressSync(bytes, { params: { [constants.ZSTD_c_compressionLevel]: COMPRESSION_LEVELS.zstd } })
            .length,
        brotli: brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: COMPRESSION_LEVELS.brotli } })
            .length,
    };
}

export function addSizes(a: Sizes, b: Sizes): Sizes {
    return { raw: a.raw + b.raw, gzip: a.gzip + b.gzip, zstd: a.zstd + b.zstd, brotli: a.brotli + b.brotli };
}
