# demux/realworld_mdn_trex_mp3

family: demux | fixture asset: `realworld_mdn_trex.mp3` (39,868 bytes, MDN CC0 t-rex-roar.mp3) | primaryMetric: wall | passCount: 4

## Verdict

- Best framework: **mediabunny@1.48.0** (CONTESTED).
- This is a 4-way CORRECTNESS TIE: ffmpeg.wasm, remotion-media-parser, mediabunny, and remotion-webcodecs all pass the single gating oracle `golden-packets` with an identical, exact result (81/81 packets, 1 track compared, maxPtsDriftUs 0–1µs). No engine produced a stronger correctness signal than any other.
- Decisive factor: **wall-clock latency** (the scenario's primaryMetric). mediabunny posts the lowest wall median at **3.34 ms**, beating remotion-media-parser (3.90 ms, runner-up) by **1.17x**, ffmpeg.wasm (4.74 ms, 1.42x) and remotion-webcodecs (4.77 ms, 1.43x).
- Margin caveat: every PASS row is `cached==true` with `n==1` (single sample, mad==0, no spread). The 0.56 ms gap to the runner-up is small and on n==1 evidence, so the performance ranking is weak; the correctness verdict (all four exact) is the strong, reliable finding.

## Per-engine results

| engine | status | oracles passed | wall median | throughputRealtime | peakMemory | longtasks | reason |
|---|---|---|---|---|---|---|---|
| mediabunny@1.48.0 | PASS | golden-packets:true (81/81, drift≤1µs) | 3.34 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-media-parser@4.0.479 | PASS | golden-packets:true (81/81, drift=0µs) | 3.90 ms | n/a | n/a | n/a | cached previous PASS result |
| ffmpeg.wasm@0.12.15 | PASS | golden-packets:true (81/81, drift≤1µs) | 4.74 ms | n/a | n/a | n/a | cached previous PASS result |
| remotion-webcodecs@4.0.479 | PASS | golden-packets:true (81/81, drift=0µs) | 4.77 ms | n/a | n/a | n/a | cached previous PASS result |
| mp4box@2.3.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'mp3' |
| platform@chrome-149 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'mp3' |
| web-demuxer@4.0.0 | NA_ENGINE | — | — | — | — | — | engine does not declare input container 'mp3' |

No engine emitted throughputRealtime / peakMemory / longtasks for this row; the bench block contains only `wall`.

## Why the winner wins (deep technical)

The operation is pure container demux of a **raw MPEG-1 Layer III elementary stream** (no ISOBMFF/Matroska wrapper). The fixture is the authentic MDN t-rex-roar.mp3: 44.1 kHz stereo, ~150.7 kbps, durationSec 2.074 (from `fixtures/golden/realworld_mdn_trex.mp3.meta.json`). A correct demuxer must walk the bitstream frame-by-frame from MPEG audio sync words, deriving each frame's byte size from the header (bitrate/sample-rate/padding bit) since there is no sample table or index to consult. The golden (`realworld_mdn_trex.mp3.packets.json`) is 81 frames, each `keyframe:true` (every MP3 frame is independently decodable), with PTS advancing ~26122µs per frame (1152 samples / 44100 Hz ≈ 26.12 ms) and per-frame sizes varying (313, 417, 522, ...) — the variation is the tell-tale of genuine bitrate-reservoir VBR-ish framing rather than a fixed stride.

mediabunny's demux path is genuinely implemented and codec-correct. The MP3 container maps to mediabunny's `MP3_FORMAT` input singleton (`src/engines/mediabunny/codecs.ts:135`, `CANONICAL_TO_INPUT_FORMAT`). `MediabunnyEngine.demux` (`src/engines/mediabunny/adapter.ts:1152`) opens the file via `openInput`, enumerates tracks, and for the single audio track drains a real `EncodedPacketSink` with `sink.packets(undefined, undefined, { verifyKeyPackets: true })` (`adapter.ts:1162-1175`). Each yielded `EncodedPacket` contributes `size = pkt.byteLength`, `ptsUs = pkt.microsecondTimestamp`, and `keyframe = pkt.type === 'key'`. The adapter sets `dtsUs === ptsUs` deliberately (documented at `adapter.ts:1145-1150`) because MP3 has no reorder/DTS timeline — which is exactly right for audio and is why the `golden-packets` oracle measures `maxPtsDriftUs:1` (one-microsecond rounding at most) against ffprobe's golden.

Why it is fastest here: this is a tiny 39 KB file, so demux cost is dominated by parser setup and JS overhead, not I/O. mediabunny runs as `backend: webcodecs`, `coreBuild: pure-ts-esm`, `pipeline: streaming-lockstep`, `coopCoep: not-required`, `sharedArrayBuffer:false` (env.configUsed) — a pure-TypeScript ESM frame walker with no wasm module to instantiate and no worker handshake. That zero-warmup path is why it lands at 3.34 ms. Note: the `webcodecs`/`hwAccel` config fields are irrelevant to this row — demux extracts encoded packets and never invokes an `AudioDecoder`; the win is purely the lean MP3 frame-sync parser.

By contrast the runner-up remotion-media-parser (3.90 ms) also runs a pure JS streaming parser (`backend: cpu-js`, `pipeline: streaming`, `reader: webReader`, `fieldsTier: full-parse(demux)`) and is functionally exact (drift=0µs), but is 0.56 ms slower. ffmpeg.wasm (4.74 ms) is slowest of the wasm/native group because it carries the cost of the libavformat wasm runtime even for a 39 KB file; it is exact (drift≤1µs) but the wasm path adds fixed overhead. remotion-webcodecs (4.77 ms) is essentially tied with ffmpeg.wasm and exact (drift=0µs); its MP4-sample-table/HTTP-range fast paths (env.configUsed.adapterFastPaths) do not apply to a raw MP3 elementary stream, so it gets none of its specialized acceleration here.

## What each other framework did wrong

- **remotion-media-parser@4.0.479 (PASS, lost on perf):** correctness is co-equal (golden-packets 81/81, drift=0µs — actually the cleanest), but wall 3.90 ms vs 3.34 ms = 1.17x slower. Only loser by a hair; on n==1 cached evidence this gap is not robust.
- **ffmpeg.wasm@0.12.15 (PASS, lost on perf):** golden-packets 81/81, drift≤1µs. wall 4.74 ms = 1.42x slower; libavformat-in-wasm fixed init cost dominates this tiny file.
- **remotion-webcodecs@4.0.479 (PASS, lost on perf):** golden-packets 81/81, drift=0µs. wall 4.77 ms = 1.43x slower (slowest). Its MP4/MOV sample-table and MOV->MP4 fast paths are inapplicable to raw MP3.
- **mp4box@2.3.0 (NA_ENGINE):** "engine does not declare input container 'mp3'". HONEST — `containersIn: ['mp4', 'mov']` (`src/engines/mp4box/adapter.ts:645`); MP4Box.js is an ISOBMFF-only parser and genuinely cannot read a raw MPEG elementary stream.
- **platform@chrome-149 (NA_ENGINE):** "engine does not declare input container 'mp3'". HONEST — `containersIn: ['mp4', 'mov', 'webm', 'mkv', 'wav']` (`src/engines/platform/adapter.ts:240`); the WebCodecs/MSE platform path exposes no raw-MP3 elementary demuxer, so demuxing to a packet table is genuinely out of scope.
- **web-demuxer@4.0.0 (NA_ENGINE):** "engine does not declare input container 'mp3'". HONEST — `containersIn: ['mp4', 'mov', 'mkv', 'webm', 'ts']` (`src/engines/web-demuxer/adapter.ts:639`); no MP3 elementary support declared.

## Anti-cheat validation

- Scenario definition: `src/scenarios/demux/index.ts:213-221` (`id: 'realworld_mdn_trex_mp3'`, `asset: 'realworld_mdn_trex.mp3'`, container `mp3`, audioCodecs `['mp3']`). notes: "Real-world fetched corpus smoke: MDN CC0 t-rex-roar.mp3. Golden-packets validates frame walking against an authentic downloaded MP3, not only generated sine-wave fixtures."
- Fixture exists & is real: `fixtures/media/realworld_mdn_trex.mp3` = 39,868 bytes (`stat` confirmed). Not synthetic/empty — it is the genuine MDN CC0 download. Golden is `fixtures/golden/realworld_mdn_trex.mp3.packets.json` (81 packet entries, `grep -c trackIndex` = 81) and `...meta.json` (mp3, 2.074 s, 44.1 kHz stereo, 150735 bps).
- Oracle: `golden-packets` at `src/core/oracles.ts:701-796`. It performs a REAL comparison: it requires `got.length === want.length` (81==81), checks track-layout multiset, then per-track sorts by dts/pts and compares EXACT `size` and `keyframe` flags packet-by-packet, allowing only a constant per-track timestamp origin offset with a ±1ms residual tolerance (`tsTolUs = seekToleranceUs`). It cannot be satisfied by a wrong packet count, wrong sizes, or wrong keyframe flags. Measurements are physically plausible: 81 frames × ~26.12ms ≈ 2.116s ≈ the 2.074s golden duration; varying per-frame byte sizes (313/417/522…); maxPtsDriftUs 0–1µs.
- Winner adapter: `src/engines/mediabunny/adapter.ts:1152-1183` (`demux`) — genuinely drains a real `EncodedPacketSink.packets({verifyKeyPackets:true})` from the live mediabunny `Input`; emits real `byteLength`/`microsecondTimestamp`/`type`. No canned output, no copy-input-to-output, no short-circuit to the golden file, no error swallowing (errors propagate; `mbInput.dispose()` in finally).
- Cached note: the winning mediabunny row (and ALL four PASS rows) have `cached==true` ("cached previous PASS result"). The numbers were reused, not re-run this session — staleness/timing risk applies, which is why the perf margin is treated as weak evidence. The correctness result (81/81 exact) is the durable signal.
- Verdict: **REAL** — real downloaded fixture, real frame-walking implementation, and a strict exact-match packet oracle. The only soft spot is the cached, n==1 timing used to break a genuine correctness tie.

## Confidence & caveats

- Confidence: medium. The correctness verdict (mediabunny exact, tied with three others) is high-confidence and code-validated. The "winner" designation rests on a 1.17x wall margin from a single cached sample (n==1, mad==0) — fragile; a re-run could reorder mediabunny vs remotion-media-parser.
- All four PASS engines are functionally interchangeable for this row; if perf is not the priority, remotion-media-parser (drift=0µs) is an equally correct choice.
- The three NA_ENGINE results are honest capability gaps (MP3 elementary not in their declared containersIn), not under-declarations — mp4box/platform/web-demuxer architecturally lack a raw-MP3 frame walker.
