# probe/hls_aes128

- **family:** probe
- **fixture asset(s):** `fixtures/media/hls_aes128.m3u8` (+ siblings `hls_aes128_000..004.ts`, `hls_aes128.key`)
- **primaryMetric:** opsPerSec (shard carries only `wall` median; opsPerSec is the inverse)
- **passCount:** 2 of 7 (ffmpeg.wasm, mediabunny)

## Verdict

- **Best framework:** `ffmpeg.wasm@0.12.15`
- **Contested:** YES — two engines PASS (ffmpeg-wasm and mediabunny), both with identical correctness.
- **Decisive factor:** PERFORMANCE. Correctness is a tie (both pass `golden-metadata` with `durationDeltaSec=0`, 2 tracks matched), so the tiebreak falls to wall/opsPerSec. ffmpeg-wasm probes in **56.13 ms** vs mediabunny's **202.72 ms**.
- **Margin over runner-up:** **3.61x faster wall** (202.725 / 56.130 = 3.61). Both samples are `n==1`, `mad==0`, `cached==true`, so the margin is a single-shot, reused measurement — directionally strong (3.6x is well outside noise) but not multi-sample-validated.

## Per-engine results

| engine | status | oracles passed (name:pass) | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:true | 56.13 ms | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-metadata:true | 202.72 ms | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'hls' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'hls' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'hls' |
| remotion-webcodecs@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'hls:aes128' |
| remotion-media-parser@4.0.479 | NA_ENGINE | — | — | — | — | — | engine does not declare feature 'hls:aes128' |

(No `throughputRealtime`, `peakMemory`, or `longtasks` series are present in the shard for any engine — only the `wall` series with `n=1`.)

## Why the winner wins (deep technical)

**The operation.** This is a *probe* of an AES-128-encrypted HLS VOD playlist. The fixture `hls_aes128.m3u8` is a real EXT-X-VERSION:3 VOD list: `#EXT-X-KEY:METHOD=AES-128,URI="hls_aes128.key",IV=0x953e...` followed by five `#EXTINF:2.000000` segments (`hls_aes128_000..004.ts`, ~900 KB each). The container is HLS carrying H.264 video + AAC audio in MPEG-TS segments. Critically, the *playlist metadata is in the clear* — the AES-128 key gates only the segment payload, not the manifest — so a probe can legitimately report container/tracks/aggregated duration **without** the key (scenario note, `src/scenarios/probe/index.ts:142-154`). The golden (`fixtures/golden/hls_aes128.m3u8.meta.json`) asserts `container: hls`, `durationSec: 10` (5 × 2 s), and 2 tracks: `{video, h264, 1280x720, 30 fps}` + `{audio, aac, 48000 Hz, 2 ch}`.

**Both winners are genuinely correct, identically.** The gating oracle `golden-metadata` (`src/core/oracles.ts:595-657`) compares normalized container, duration (within an HLS *loose* tolerance band — see anti-cheat), and per-track codec/dims/fps/sampleRate/channels positionally. Both PASS engines reported `durationDeltaSec: 0`, `durationToleranceSec: 1.5` and `metadata matches golden (2 track(s))`. So on the correctness ladder they are tied at structural/metadata-exact level; neither reached a bit-exact tier (probe does not decode), and no engine fell to a smoke gate.

**Why ffmpeg-wasm is faster here.** ffmpeg-wasm's probe does NOT shell out to ffprobe — the vendored `@ffmpeg/core` 0.12.10 `_ffprobe` entry aborts without setting a return code, so the adapter derives metadata purely by parsing the `ffmpeg -i <in>` Input-block log (`src/engines/ffmpeg-wasm/adapter.ts:260-317`, `parseDurationSecFromLog`/`parseTracksFromLog` at lines 312-348). For HLS it materializes the sibling segments + key into MEMFS, then lets the native `hls/applehttp` demuxer read the manifest (`adapter.ts:35-36`, container map at `:797`). The `Duration:` and `Stream` lines come straight out of the C demuxer's header parse — a single in-WASM `-i` pass over the manifest header and segment headers, no per-sample scan. That single-pass header read is what lands it at **56.13 ms**.

Mediabunny is also a real, correct read: `metadataFromInput` (`src/engines/mediabunny/adapter.ts:417-451`) takes the *cheap* duration path first via `getDurationFromMetadata()` (`:421-430`) and only falls back to `computeDuration()` (a sample scan) when metadata yields null (`:434-439`). HLS opens through a `UrlSource`/`PathedSource` so EXT-X segment URIs resolve (`:243-292`), with `HlsInputFormat` in `ALL_FORMATS`. The 202.72 ms cost reflects its pure-TS ESM reader walking the playlist + child TS segment probing through the JS HLS reader rather than a compiled C demuxer — about 3.6x the work for the same answer on this container. Its `configUsed` confirms `coreBuild: pure-ts-esm`, `wasmThreads: 0`, `sharedArrayBuffer: false`, `coopCoep: not-required` — no native acceleration on the demux/parse path.

**Net:** equal correctness, and ffmpeg-wasm's compiled-C single-pass header demux beats mediabunny's pure-TS playlist+TS walk by 3.61x wall. That is the decisive factor.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASSed (identical correctness, `durationDeltaSec=0`, 2 tracks) but LOST on performance: 202.72 ms vs 56.13 ms = **3.61x slower wall**. Pure-TS ESM reader (`configUsed.coreBuild=pure-ts-esm`, no wasm threads) walking the playlist + TS segments costs more than the compiled-C single-pass `-i` header read. n=1 cached sample.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare input container 'hls'". HONEST: its `containersIn` is `['mp4','mov','webm','mkv','wav']` (`src/engines/platform/adapter.ts:240`) — WebCodecs has no HLS/manifest demuxer, so the runner gates it at Pass-1 declaration (`src/core/runner.ts:123-125`).
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare input container 'hls'". HONEST: `containersIn: ['mp4','mov','mkv','webm','ts']` (`adapter.ts:639`) — it can read raw `.ts` but not an `.m3u8` playlist (no multi-segment/key resolution), so HLS is correctly undeclared.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'hls'". HONEST: `containersIn: ['mp4','mov']` (`adapter.ts:645`) — an ISO-BMFF box parser, structurally incapable of MPEG-TS/HLS.
- **remotion-webcodecs@4.0.479** — NA_ENGINE: "engine does not declare feature 'hls:aes128'". HONEST: it does not declare the `hls:aes128` feature token the scenario requires (`runner.ts:173`), so it never attempts encrypted-HLS probe.
- **remotion-media-parser@4.0.479** — NA_ENGINE: "engine does not declare feature 'hls:aes128'". HONEST: same — the AES-128-HLS feature is undeclared, gated at Pass-1.

All five NAs are genuine capability gaps (no HLS demuxer / no AES-128-HLS feature), not under-declared shortcuts; none of these libraries ships an HLS playlist+EXT-X-KEY reader.

## Anti-cheat validation

- **Scenario:** `src/scenarios/probe/index.ts:142-154` (entry `asset: 'hls_aes128.m3u8'`, `container: 'hls'`, `features: ['hls:aes128']`, `op: 'probe'`). Note explicitly states the probe reports container/tracks/aggregated duration *without* the key because manifest metadata is in the clear — a legitimate, well-reasoned gate.
- **Fixture exists & is real:** `fixtures/media/hls_aes128.m3u8` (378 B) plus five real ~900 KB encrypted TS segments and a 16 B AES key — verified present via `ls`/`stat`. Manifest content confirmed: real `#EXT-X-KEY:METHOD=AES-128` with a 128-bit IV and 5×2 s `#EXTINF` segments. Not synthetic/empty/mock.
- **Oracle:** `golden-metadata` at `src/core/oracles.ts:595-657`. It performs a REAL field-by-field comparison (container, duration, per-track codec/dims/fps/sr/channels) against `fixtures/golden/hls_aes128.m3u8.meta.json`. Measurements (`durationDeltaSec=0`, 2 tracks h264+aac) are physically plausible for this 10 s 1280x720@30 + 48 kHz stereo AES-128 HLS clip.
- **Tolerance note (WHY not stronger):** HLS is an *estimate-only* container, so duration uses a loose band (`durationToleranceSec=1.5` applied here, `oracles.ts:610-637`) rather than the strict ±1-frame band. The PASS is real and exact (Δ=0), but the *gate* is metadata-level, not bit-exact (probe does not decode), and the duration band is intentionally wide. This is correct for a probe scenario but means the win is structural-exact, not crypto/frame-exact.
- **Winner adapter:** `src/engines/ffmpeg-wasm/adapter.ts:260-348` (log-parse metadata derivation), `:35-36`/`:797` (HLS materialize + container map), caps declaring `hls` container and `hls:aes128` feature at `:1475,:1512`. The probe genuinely runs the native demuxer over the manifest; it does NOT return canned output, copy input to output, short-circuit to the golden, or swallow errors (the `^Input #` log check turns failed reads into honest throws).
- **Cached note:** BOTH PASS results have `cached: true` ("cached previous PASS result") — they were reused, not freshly re-run. Per the launcher seeding caveat, stale PASS reuse is a known risk; the 56.13 vs 202.72 ms numbers and the Δ=0 metadata are from a prior run, n=1 each. Directionally trustworthy but not a fresh-run measurement.
- **Verdict:** **REAL** — real encrypted-HLS fixture, real native-demux implementation in both passing engines, meaningful field-level metadata oracle with plausible measurements. The only softness is (a) the deliberately loose HLS duration band and (b) the cached n=1 timings, which lower confidence but do not indicate cheating.

## Confidence & caveats

- **Confidence: medium.** Correctness verdict is solid (both engines genuinely pass a real oracle on a real fixture). The performance winner is clear in direction (3.61x), but rests on `n==1`, `mad==0`, `cached==true` samples for both engines — single-shot reused timings, not multi-run statistics.
- The oracle gate is metadata-level with a loose HLS duration tolerance (1.5 s); it cannot distinguish a frame-exact reader from a header-only reader. A stronger run would add `golden-packets`/`segments` gating for this asset (goldens exist: `hls_aes128.m3u8.packets.json`, `.segments.json`).
- A fresh, multi-sample re-run (clearing the cache per the launcher seeding caveat) would harden the 3.61x margin and surface peakMemory/longtasks, which are absent here.
