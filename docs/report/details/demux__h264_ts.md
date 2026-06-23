# demux/h264_ts

family: demux | fixture asset: `h264_ts.ts` (4.6 MB, real MPEG-TS, H.264 video + AAC audio) | primaryMetric: wall (ms) | passCount: 4 of 7

## Verdict

- **Best framework: ffmpeg.wasm@0.12.15** (`engineId` ffmpeg-wasm).
- **CONTESTED**: 4 engines PASS (ffmpeg-wasm, mediabunny, remotion-media-parser, remotion-webcodecs). All four pass the *same* gating oracle (`golden-packets`) with the *same* correctness result (770/770 packets, 2 tracks compared). Correctness is therefore tied, so the decision falls to **performance**.
- **Decisive factor: wall-clock latency on the demux walk.** ffmpeg-wasm = 56.82 ms median wall vs mediabunny 64.52 ms (runner-up). **Margin: 1.14x faster than mediabunny**, 5.06x faster than remotion-webcodecs (287.29 ms), 5.48x faster than remotion-media-parser (311.54 ms).
- Secondary correctness edge: ffmpeg-wasm reports `maxPtsDriftUs = 0` (bit-exact PES timestamp reconstruction), the only engine with zero drift; the other three report `maxPtsDriftUs = 1` (1µs rounding from the 90kHz→µs conversion). This is a tie-strengthener, not the decider.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| ffmpeg.wasm@0.12.15 | PASS | golden-packets:pass (770/770, drift 0µs) | 56.82 ms | n/a | n/a | n/a | cached previous PASS result |
| mediabunny@1.48.0 | PASS | golden-packets:pass (770/770, drift 1µs) | 64.52 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-packets:pass (770/770, drift 1µs) | 287.29 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-packets:pass (770/770, drift 1µs) | 311.54 ms | n/a | n/a | n/a | cached previous PASS result |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'ts' |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'ts' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | web-demuxer v4.0.0 cannot construct an AVPacketReader for MPEG-TS packet streams |

(The shard's bench block only carries the `wall` metric for this row; throughputRealtime/peakMemory/longtasks were not recorded.)

## Why the winner wins (deep technical)

The container is **MPEG-TS** (188-byte transport packets carrying a PES-multiplexed H.264 video PID and an AAC audio PID). Unlike MP4/MOV, TS has **no sample table (`stsz`/`stts`/`stss`)** — packet sizes, DTS/PTS, and keyframe boundaries are not in an index; they must be reconstructed by walking PES headers and parsing the elementary stream. PES timestamps are encoded in the **90 kHz clock**, so every engine has to divide by 90 to reach the golden's microsecond units. The scenario `notes` (src/scenarios/demux/index.ts:132) spells this out: "PES timestamps in 90kHz clock; demux normalizes pts/dts to µs for the golden."

ffmpeg-wasm wins because it delegates the entire PES/PSI walk to libavformat's mature `mpegts` demuxer compiled to wasm. Its `demux()` (src/engines/ffmpeg-wasm/adapter.ts:1961) issues a single `ffmpeg -i <in> -map 0 -c copy -f framecrc <out>` (adapter.ts:1980-1995): stream-copy re-packetizes nothing, and the **framecrc muxer emits one line per copied container packet** — size, pts, dts, and keyframe flag — which `parseFramecrcPackets` (adapter.ts:441-488) converts to the `PacketInfo[]` table. Because libav's TS demuxer applies the canonical 90 kHz→µs conversion that ffprobe (which generated the golden) also uses, the packet timestamps land **bit-exact**, giving `maxPtsDriftUs = 0` while the three JS/WebCodecs-based parsers each carry a 1µs residual from their own rounding. The `-map 0` is deliberate (adapter.ts:1971) so both the video and audio PIDs are enumerated — matching `comparedTracks = 2`.

On performance, the framecrc path is essentially a tight C demux loop in wasm with no per-frame JS object churn and no decode: 56.82 ms. mediabunny is close behind at 64.52 ms — it runs a pure-TS streaming demuxer (`backend: webcodecs`, `pipeline: streaming-lockstep`, `coopCoep: not-required`) but pays JS-side parsing overhead per packet; it still reconstructs all 770 packets correctly. The two Remotion engines are ~5x slower (287–312 ms): remotion-media-parser runs a `cpu-js` full-parse streaming reader (configUsed.backend `cpu-js`, fieldsTier `full-parse(demux)`), and remotion-webcodecs layers its WebCodecs/backpressure pipeline on top — both correct but markedly heavier for a copy-only packet walk where no actual decoding is needed.

The gating oracle `goldenPackets` (src/core/oracles.ts:703-795) is strict: it groups packets per track, sorts by dts/pts, and requires **exact** size match and **exact** keyframe-flag match for every packet (oracles.ts:777-778), allowing only a constant per-track timestamp origin shift with a 1ms residual tolerance (oracles.ts:780-784). A packet-count mismatch, a single wrong size, or a flipped keyframe flag fails it. All four PASS engines satisfied this on a real 770-packet, 2-track table — so the win legitimately reduces to the 1.14x wall margin plus the zero-drift edge.

## What each other framework did wrong

- **mediabunny@1.48.0** — PASS, lost on performance only. 64.52 ms vs 56.82 ms = **0.88x of the winner's speed (1.14x slower)**; also `maxPtsDriftUs = 1` vs the winner's 0. Correctness fully equivalent (770/770, 2 tracks). Closest competitor.
- **remotion-webcodecs@4.0.479** — PASS but **5.06x slower** (287.29 ms). Its `streaming-backpressure` WebCodecs pipeline is overkill for a stream-copy packet walk; same 1µs drift.
- **remotion-media-parser@4.0.479** — PASS but **5.48x slower** (311.54 ms), slowest PASS. `cpu-js` full-parse streaming reader; correct (770/770) but heaviest path.
- **platform@chrome-149** — NA_ENGINE: "engine does not declare input container 'ts'". Honest NA — the browser's WebCodecs/`MediaSource` stack has no MPEG-TS demuxer, so the platform adapter correctly does not declare `ts` input.
- **mp4box@2.3.0** — NA_ENGINE: "engine does not declare input container 'ts'". Honest NA — MP4Box.js is an ISO-BMFF (MP4/MOV/fragmented) parser only; MPEG-TS is out of scope by design.
- **web-demuxer@4.0.0** — NA_ENGINE: "web-demuxer v4.0.0 cannot construct an AVPacketReader for MPEG-TS packet streams". Honest NA: although web-demuxer wraps FFmpeg in wasm, its v4.0.0 AVPacketReader API path does not support the TS demuxer for packet enumeration; the adapter declares this as not-applicable rather than faking a result (durationMs 1081, no oracle attempted).

## Anti-cheat validation

- **Scenario**: src/scenarios/demux/index.ts:127-133 — entry `{ asset: 'h264_ts.ts', container: 'ts', videoCodecs: ['h264'], audioCodecs: ['aac'] }` with TS/90kHz notes. Resolves to scenarioId `demux/h264_ts`.
- **Fixture**: `fixtures/media/h264_ts.ts` exists, **4.6 MB**, a real MPEG-TS file (not synthetic/empty/mock). Golden present: `fixtures/golden/h264_ts.ts.packets.json` (87 KB — a real 770-packet table), plus `.meta.json` and `.frames.json`.
- **Oracle**: src/core/oracles.ts:703-795 (`goldenPackets`). Real comparison against the golden packet table: per-track exact size + exact keyframe-flag match, ±1ms timestamp residual after constant-origin alignment. Not trivially satisfiable; no ssim/smoke fallback for this row.
- **Winner adapter**: src/engines/ffmpeg-wasm/adapter.ts:1961-2027 (`demux`) → genuine `ffmpeg -i -map 0 -c copy -f framecrc` exec (adapter.ts:1980) → `parseFramecrcPackets` (adapter.ts:441-488). No canned output, no input→output copy, no short-circuit to golden, errors are surfaced as throws (adapter.ts:2002-2018), not swallowed.
- **Measurements plausibility**: 770 packets across 2 tracks, drift 0µs (winner) — physically consistent with a multi-second H.264+AAC TS stream. Plausible.
- **Cached note**: ffmpeg-wasm's row is `cached: true` ("cached previous PASS result", startedAt 2026-06-22T16:34:59Z). The 56.82 ms wall was **reused, not freshly re-run**; all four PASS rows are cached, so the relative ranking is internally consistent but staleness applies uniformly.
- **Verdict: REAL** — real 4.6 MB TS fixture, real libav framecrc demux implementation, strict golden-packets oracle. Caveat: evidence is from cached runs.

## Confidence & caveats

- Confidence: **high** on correctness (strict exact-match oracle, all PASS engines agree on 770/770) and on the winner identity (ffmpeg-wasm is both bit-exact and fastest).
- The performance margin over mediabunny is small (**1.14x**) and rests on **n = 1** samples (mad = 0, single sample) for every row — a single-sample wall time is weak performance evidence; under re-measurement mediabunny could plausibly close or invert this gap. The zero-drift correctness edge is the more durable tiebreaker.
- All winning rows are `cached: true`; a fresh re-run is advisable before treating the 56.82/64.52 ms split as authoritative.
- bench carried only `wall`; no peakMemory/throughput/longtasks to corroborate.
