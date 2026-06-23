# probe/flac_seektable

- **family:** probe
- **fixture asset:** `fixtures/media/flac_seektable.flac` (raw native FLAC stream, 143 KB, with a SEEKTABLE metadata block)
- **golden:** `fixtures/golden/flac_seektable.flac.meta.json` (container=flac, durationSec=10, 1 audio track: flac / 48000 Hz / 2 ch / bitrate 114346)
- **primaryMetric:** wall (only `wall` is benched for this probe row; no `opsPerSec`/throughput recorded)
- **passCount:** 4 of 7

## Verdict

- **Best framework:** `remotion-media-parser@4.0.479`
- **Contested:** YES — 4 engines PASS (remotion-media-parser, mediabunny, ffmpeg.wasm, remotion-webcodecs).
- **Decisive factor:** Correctness is a TIE — all four pass the single gating oracle `golden-metadata` with identical measurements (`durationDeltaSec: 0`, `durationToleranceSec: 0.041666…`, "metadata matches golden (1 track)"). The tie therefore breaks on **performance / wall median**, where remotion-media-parser is fastest at **2.295 ms**.
- **Margin over runner-up:** vs mediabunny (2.565 ms) → **1.12x faster wall**; vs remotion-webcodecs (3.335 ms) → 1.45x; vs ffmpeg.wasm (7.17 ms) → 3.12x. NOTE: this is a narrow margin on **n==1** samples (mad=0 because a single sample), so the perf ranking is weak evidence — see caveats.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| remotion-media-parser@4.0.479 | PASS | golden-metadata:true | 2.295 ms | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-metadata:true | 2.565 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-metadata:true | 3.335 ms | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-metadata:true | 7.17 ms | n/a | n/a | n/a | cached previous PASS result |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'flac' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'flac' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'flac' |

No `throughputRealtime`, `peakMemory`, or `longtasks` metrics were recorded for any engine on this probe row; the only bench metric present is `wall` (n=1, warmup=1).

## Why the winner wins (deep technical)

This is a **pure metadata-probe of a raw FLAC stream** — a native FLAC file (not FLAC-in-MP4/Ogg), beginning with the `fLaC` magic followed by metadata blocks: STREAMINFO (sample rate, channels, total samples → duration) and a SEEKTABLE block. The operation requires only reading the header metadata region; no audio frame decoding is needed to satisfy the golden, which asserts container=flac, durationSec=10 (derived from STREAMINFO total-samples / 48000), codec=flac, 48000 Hz, 2 channels.

All four passers produce byte/metadata-correct results, so the gating oracle (`src/core/oracles.ts:595` `goldenMetadata`) cannot separate them: it compares container, duration (within a strict ±1-frame band ≈ 0.0417 s, `oracles.ts:614-637`), and per-track codec/sampleRate/channels (`oracles.ts:659-682`). Every passer reports `durationDeltaSec: 0` — i.e. each independently computes exactly 10.000 s from STREAMINFO, matching the golden to the millisecond. Correctness is genuinely identical, so the contest is decided on speed.

**remotion-media-parser** wins on wall (2.295 ms). Its probe path (`src/engines/remotion-media-parser/adapter.ts:348` `probe()`) calls the real `@remotion/media-parser` `parseMedia()` (invoked via `runParse`, adapter.ts:335) at the **metadata-only fields tier** (adapter.ts:374-383): it requests only `durationInSeconds`, `container`, `tracks`, `metadata`, `rotation`. Per env.configUsed it ran `backend: "cpu-js"`, `fieldsTier: "metadata-only"`, `reader: "webReader"`, no worker. Because FLAC is not HLS/WebM/TS/ADTS, none of the packet-fallback branches fire (adapter.ts:393-401), so the parser stops after reading the FLAC metadata blocks and never walks the audio frames — the minimal read path. That header-only, single-tier read is what undercuts the others by a small margin.

**mediabunny** (2.565 ms, env backend `webcodecs`, `coreBuild: pure-ts-esm`, `coopCoep: not-required`, `sharedArrayBuffer: false`) also does a pure-TS metadata probe and lands only 0.27 ms behind (1.12x). It is a legitimate, strong second — same correctness, no COOP/COEP requirement, no SAB — and on a different sample draw could plausibly win, given n==1.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASS, but lost on perf: wall 2.565 ms vs winner 2.295 ms (**1.12x slower**). Correctness identical (golden-metadata:true, durationDeltaSec 0). A near-tie on n==1.
- **remotion-webcodecs@4.0.479** — PASS, lost on perf: wall 3.335 ms (**1.45x slower**). Same correctness. cached==true.
- **ffmpeg.wasm@0.12.15** — PASS, lost on perf: wall 7.17 ms (**3.12x slower**), the slowest passer — consistent with wasm libavformat probe overhead vs pure-JS header readers. Same correctness.
- **web-demuxer@4.0.0** — NA_ENGINE: "engine does not declare input container 'flac'". HONEST NA — web-demuxer's declared `containersIn` does not include the raw `flac` container, so the runner negotiates NA rather than FAIL. Not an under-declaration penalty; it genuinely targets ffmpeg-wasm-backed mux/demux containers and excludes raw FLAC.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'flac'". HONEST NA — MP4Box.js is an ISO-BMFF (MP4/MOV/CMAF) parser; raw native FLAC is outside its container scope by design.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare input container 'flac'". HONEST NA — the WebCodecs/`MediaSource`-shaped platform adapter does not declare a demuxer for the raw FLAC container (Chrome has no general container-probe API for native .flac in this adapter's surface).

## Anti-cheat validation

- **Scenario definition:** `src/scenarios/probe/index.ts:212` — `{ asset: 'flac_seektable.flac', container: 'flac', audioCodecs: ['flac'] }`. Declared `operations: ['probe']`; codecs declared so non-FLAC engines negotiate NA honestly (file header comment, index.ts:1-31).
- **Fixture exists & is real:** `fixtures/media/flac_seektable.flac` present, 143 KB — a genuine native FLAC file with a SEEKTABLE block (the sibling `flac_noseektable.flac` case at index.ts:214 explicitly contrasts the no-SEEKTABLE path), not synthetic/empty/mock.
- **Golden:** `fixtures/golden/flac_seektable.flac.meta.json` present with physically plausible values (10 s, 48000 Hz, 2 ch, bitrate 114346 ≈ 143 KB × 8 / 10 s, consistent). An independent `.packets.json` golden (12 KB) also exists.
- **Oracle:** `src/core/oracles.ts:595` `goldenMetadata` performs a real field-by-field comparison (container, duration within a STRICT per-frame band ~0.0417 s for precise containers like flac, codec, sampleRate, channels, track count). Not trivially satisfiable: a wrong duration/codec/channel count FAILs. Measured `durationDeltaSec: 0` is exact, not a wide-tolerance pass.
- **Winner adapter:** `src/engines/remotion-media-parser/adapter.ts:348` `probe()` → real `parseMedia()` (adapter.ts:335) at metadata-only tier (adapter.ts:374-383). No canned/hardcoded metadata, no short-circuit to the golden file, no error-swallowing-as-success. FLAC is genuinely parsed by the library.
- **Cached note:** ALL four passers have `cached: true` ("cached previous PASS result"). The result was reused, not re-run in this batch. Correctness caching is low-risk (golden is committed and deterministic), but the **wall timings are stale** and the 0.27 ms winner→runner-up gap could invert on a fresh run.
- **Verdict:** REAL — real fixture, real `parseMedia()` implementation, meaningful strict-band metadata oracle, exact measured match.

## Confidence & caveats

- **Confidence: medium.** Correctness/best-engine eligibility is rock-solid (real fixture, strict exact-match oracle, genuine library call). The perf *ranking* is weak: every bench has **n==1** (mad=0 is an artifact of a single sample), and the winner→runner-up gap is only **0.27 ms (1.12x)**, well within noise. mediabunny is effectively co-best and could win on a fresh, multi-sample run.
- All four passer rows are **cached==true** → timings are stale; a re-run is advisable before treating the wall ordering as authoritative.
- The three NA engines are all **honest container-scope NAs** (raw FLAC not declared), not under-declared capabilities.
