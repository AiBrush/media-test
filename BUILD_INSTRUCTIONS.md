# Browser Media-Engine Conformance & Benchmark Suite — Build Instructions

> Canonical spec. The continuous-loop cron prompt points here. Read this each iteration.

**What this is:** a **library-agnostic, browser-only** test project. It defines a battery of
media tests **once**, then runs that **same** battery — functional correctness, performance, and
robustness — **inside real browsers** against **any media library registered behind a common
adapter**. It produces a **comparison report** (every engine vs a chosen reference, default
Mediabunny). This is the measurement backbone for the `aibrush/media` decision
(*optimize / adopt / skip*).

**Hard mandate — BROWSER ONLY.** Libraries under test run **in the browser** (WebCodecs / WASM /
pure-JS). There is **no Node-library testing and no native binary in the test loop.**
`@mediabunny/server`, `node-av`, native FFmpeg are **out of scope as engines**. The only place a
binary may run is the **one-time, offline fixture bake** that produces static media + golden data.

## 0. The two rules that override everything
1. **No measurement → no claim. No green correctness oracle → no admissible benchmark.** Every
   number is produced in-browser, validated by a library-independent oracle, reported with the
   engine + browser + workload. A speedup that fails conformance is a regression.
2. **The comparison is the product.** The deliverable is a **matrix**
   `engine × browser × scenario → {pass/fail/NA, metrics}` with **deltas vs the reference engine**.

The suite judges only **observable behavior** (bytes in → bytes/metadata/frames out, validated
against ground truth), never a library's internals. Engine-internal diagnostics live in an
optional per-engine annex (§10.4) and never enter the cross-engine comparison.

## 1. Agent operating rules (read every iteration)
- Browser-only at test time. If you find yourself measuring a library in Node, stop.
- No binary in the loop. `ffmpeg`/`ffprobe`/Bento4 only in offline `fixtures/bake`.
- No measurement fabricated. Not run = `—`. Unsupported = `NA` with *why* (engine vs browser).
- Correctness gates every benchmark, per engine, per browser, per scenario.
- Local only. No deploy/prod/cloud beyond fetching the libraries under test.
- Long runs go to background (`run_in_background`); poll.
- Commit small, ignore large. Commit suite code, manifests, bake scripts, golden digests, report.
  Git-ignore raw media, `node_modules`, bundles, raw per-run JSON.
- Reference engine pinned. Default reference = Mediabunny at a recorded version. Deltas are always
  "vs reference on the same browser + same corpus."
- **Tooling: use `bun`/`bunx` (npm/npx are unavailable in this environment).**

## 2. Architecture
```
offline one-time (binaries OK):  fixtures/bake  → static media corpus + golden ground truth  → committed
test time (browser only):        SUITE static app (in-page + Workers)
                                   registry of ENGINE ADAPTERS (browser libs)
                                   for each engine × scenario (capability-gated):
                                     run op → validate via browser-pure ORACLE → record conformance + metrics
launcher (Playwright, automation only, NOT measurement): Chromium / WebKit / Firefox
output:                          COMPARISON REPORT: engine × browser × scenario matrix + Δ vs reference
```
Pieces: **Engine adapter** (thin shim + declared `CapabilitySet`), **Scenario** (engine-independent
case), **Capability negotiation** (declared caps ∧ runtime browser feature-detect), **Browser-pure
oracle** (golden + reference re-import + SSIM/PSNR + playback), **Comparison engine** (matrix + Δ).

## 3. Scope (in / out)
IN: browser libraries (WebCodecs orchestrators e.g. Mediabunny; WASM e.g. ffmpeg.wasm; pure-JS e.g.
mp4box.js; raw platform WebCodecs + `<video>`/MSE/MediaRecorder); execution + measurement in
page/Workers; Chromium/WebKit/Firefox; offline one-time bake.
OUT: Node-only libs; `@mediabunny/server`/node-av; native FFmpeg/CLI as engines; any measurement in
Node or via a binary; running ffmpeg/ffprobe/Bento4 during `run`; server transcode/AVFrame paths.

## 4. Directory layout
```
media-browser-test/
├── README.md  BUILD_INSTRUCTIONS.md  package.json  tsconfig.json  index.html  .gitignore
├── fixtures/  bake.mjs  manifest.json  media/(gitignored)  golden/(committed JSON)
├── src/
│   ├── core/  engine.ts scenario.ts registry.ts runner.ts measure.ts bench.ts oracles.ts feature-detect.ts report.ts
│   ├── engines/  mediabunny/ ffmpeg-wasm/ mp4box/ platform/ aibrush-media/ _template/
│   ├── scenarios/  probe/ demux/ remux/ transcode/ decode-seek/ trim/ mux/ encryption/ metadata/ streaming-output/ audio-dsp/ robustness/
│   └── app/  (in-page UI: pick engines+scenarios, run, view matrix)
├── results/  raw/(gitignored) runs/(gitignored) report.md(committed)
└── scripts/  bake-fixtures.sh serve.sh run.sh compare.sh add-engine.sh
```

## 5. Engine adapter contract → `src/core/engine.ts`
Bytes/blobs/metadata/frames in → out, async, browser-native. No method exposes internals. See the
TypeScript in `src/core/engine.ts` (authoritative): `MediaInput`, `MediaBytes`,
`NormalizedMetadata`, `PacketInfo`, `DemuxResult`, `FrameDigest`, `FrameSink`, `Operation`,
`CapabilitySet`, `MediaEngine`, `TranscodeOptions`, `EncodedTracks`.
Negotiation (`runner.ts` + `feature-detect.ts`): run scenario on engine E in browser B iff
`E.capabilities()` covers `requires` AND `feature-detect(B)` confirms codecs configurable. Else
record `NA(engine)` (undeclared) or `NA(browser)` (unsupported) — distinctly.

## 6. Engines to ship (Mediabunny is the reference)
| id | role | notes |
|---|---|---|
| `mediabunny` | **reference** | full mux/demux + WebCodecs transcode/remux/trim/probe/decrypt; no image codecs |
| `ffmpeg.wasm` | broad coverage | widest codecs; software; slow; large WASM; memory limits |
| `mp4box.js` | demux/probe specialist | MP4/fragmentation/probe; `NA` for transcode/most remux |
| `platform` | browser baseline | WebCodecs decode/encode, `<video>`, MSE, MediaRecorder |
| `aibrush-media` | future candidate | placeholder adapter + capability stub |
| `_template` | scaffold | copy to add any new library |
Add a library: `scripts/add-engine.sh <id>` → implement interface + `capabilities()` → register →
`run.sh` runs the whole battery → `compare.sh` shows side-by-side vs reference. No scenario changes.

## 7. Corpus (static, baked offline once)
`fixtures/bake.mjs` → fixed, checksummed corpus + golden. `manifest.json` per asset: `id, family,
container, codecs[], genMethod, sha256, sizeBytes, notes`. Media git-ignored; manifest + golden +
bake script committed. Families: Video MP4/MOV (H.264/HEVC, B-frames, VFR, rotated, multi-track);
Matroska/WebM (VP8/VP9/AV1, VP9 alpha); MPEG-TS/HLS (incl. AES-128); Encrypted MP4 (CENC ctr/cbcs);
Audio (WAV s16/s24/f32/s16be, MP3 Xing/CBR, FLAC ±SEEKTABLE, AAC/ADTS, Opus/OGG); Recorder-origin
(headerless MediaRecorder WebM/Opus — baked in-browser); Stress (multi-hour, zero-length, truncated,
bit-flipped); Image negatives (JPEG/PNG/WebP). After bake: sha256 → manifest; suite asserts on load.

## 8. Browser-pure oracles → `src/core/oracles.ts` + `fixtures/golden/`
| op | oracle | pass |
|---|---|---|
| probe | vs `golden/<a>.meta.json` | duration ±1 frame; codec/dims/fps/channels match |
| demux | vs `golden/<a>.packets.json` | track layout + ts + keyframe flags match |
| remux | decode output in-browser → frame digests vs `golden/<a>.frames.json`; reference re-import; `<video>` smoke | frames bit-exact; re-imports; plays |
| transcode/alpha/fanout | decode → SSIM+PSNR vs reference frames; alpha plane separate | SSIM ≥ 0.99 (tune); PSNR ≥ 40 dB; plays |
| decode/seek | frame digest vs golden; seek lands on expected keyframe | correct frame; accuracy within tol |
| trim | probe(out).dur ≈ requested; boundary frames vs golden | duration + boundaries correct |
| decrypt | decoded frames bit-exact vs golden | byte/frame-exact |
| mux | reference re-import + playback; frames vs source | round-trips; plays |
| property/metamorphic | computed in-browser (§11) | invariant holds |
Golden = small JSON committed (metadata, packet tables, frame-digest lists, downsampled luma sigs) —
never raw media. Baked from independent tools (ffprobe/ffmpeg/Bento4) so the oracle is independent
ground truth, not "whatever the reference engine did."

## 9. Pillar 1 — functional/conformance (`defineScenario`, engine-independent, capability-gated)
Families: Probe/metadata; Demux; Remux (cross-container matrix, lossless); Transcode (codec matrix,
resize/fps/bitrate/rotate, SSIM/PSNR-gated); Decode/seek (frame-accurate, VFR, B-frames); Trim
(keyframe + frame-accurate); Mux; Encryption (CENC ctr/cbcs, AES-128 HLS; unencrypted untouched);
Metadata/tags (read everywhere, write where supported then re-probe); Streaming/output (buffer vs
streaming, fragmented/CMAF, fastStart:reserve, tiny TS writes); Audio DSP (resample, ch-mix, PCM
incl. big-endian/24-bit); Fan-out/ABR (1→N renditions, each SSIM-validated); Image negatives (clean
`NA`/error, never crash).

## 10. Pillar 2 — performance (cross-engine, in-browser)
Metrics (`measure.ts`): wall / throughput×realtime (`mediaSec/wallSec`); peak mem
(`measureUserAgentSpecificMemory` Chromium, capability-gated; fallback `performance.memory`; else
omit+flag); longtasks (PerformanceObserver >50ms); source reads/range fetches; target writes/bytes;
decode/encode fps. Protocol (`bench.ts`): warmup ≥3, measure ≥6 (record actual N); A/B alternation
(never all-A-then-all-B); fresh Worker/page per iter; median/p95/MAD; difference only if >
max(noise-band, 3%) else within-noise; optional Mann–Whitney U; tag every bench `e2e`. Cross-browser
is a first-class axis — never compare a number across browsers/machines. Engine-internal benches +
encoder-starvation diagnostic (poll `encode/decodeQueueSize`) live under
`src/engines/mediabunny/internal/`, separate annex only.

## 11. Pillar 3 — robustness (Worker-isolated, timeout-guarded)
Edge: open-GOP/B-frames, VFR, rotated, multi-track, headerless WebM, big-endian/24-bit PCM,
cbc/cbcs boundaries, fastStart:reserve, fragmented/CMAF, multi-hour, zero-length. Malformed/fuzz:
in-browser byte mutation → engine must fail gracefully within timeout (no crash/hang/OOM); record
`graceful`/`crash`/`timeout`/`OOM`. Property/metamorphic (in-browser): `decode(remux(x))==decode(x)`;
`demux(mux(x))≈x`; `probe(remux(x)).dur≈probe(x).dur`; `trim(a..b)++trim(b..c)≈trim(a..c)`;
`probe(x).dur` consistent across containers. Image negatives → clean `NA`/error.

## 12. The comparison report (`report.ts` → `results/report.md`)
(1) Capability matrix (declared + runtime-detected codecs). (2) Conformance matrix
`engine×browser×scenario → PASS/FAIL/NA(engine)/NA(browser)` + reasons → conformance %. (3) Benchmark
matrix `→ {median, p95, throughput×RT, peak mem, longtasks}`. (4) Δ-vs-reference (default
`mediabunny@<pinned>`): Δ% per scenario + conformance delta, **within the same browser**; vocabulary
`faster/slower/within-noise/gained/regressed/NA`. Plus per-engine scorecard (conformance %, perf
index = geomean throughput ratio vs reference per browser, capability breadth, robustness rate).
Emit machine-readable `results/raw/*.json` alongside markdown.

## 13. Reproducibility
Browsers Chromium/WebKit/Firefox via Playwright (launcher only, no measurement). Suite also runs by
opening `index.html`. Record exact browser build + GPU string per run `env`. Pin suite version,
engine versions/bundle hashes, corpus checksum set, browser versions. Caveats into the report:
browser numbers indicative (GPU/OS/thermals, hardware codec session limit); AC power + quiesced;
never cross-machine/cross-browser compare a raw number; parallelism ceiling is codec session limit,
not `navigator.hardwareConcurrency`.

## 14. Continuous loop (one iteration)
1. Add/change one engine adapter (new lib, optimized fork as new id, or aibrush/media). Never edit
   scenarios to favor an engine. 2. `run.sh --engine <id>` across all three browsers (bg; poll).
3. Conformance gate first — FAIL blocks any perf claim. 4. `compare.sh` → regenerate matrix + Δ.
5. Record honestly (faster/within-noise/regressed/gained/lost per browser). 6. Commit (suite/
adapters/golden/report; media + raw ignored). Coverage grows by adding scenarios + engines (both
append-only).

## 15. Anti-patterns
No measuring in Node/binary at test time. No server/native FFmpeg as engine. No ffmpeg/ffprobe/Bento4
in `run`. No judging by internals. No perf number without a green conformance gate. No quoting a
number across browsers/machines; no collapsing `NA(engine)`/`NA(browser)`. No editing scenarios to
favor an engine. No within-noise "improvement"; no hiding a conformance regression. No blocking a
foreground Bash call on a browser matrix/bake (use background).

## 16. Definition of Done — initial build
Offline bake reproduces corpus + golden deterministically, checksums asserted, binaries only in
bake. Suite runs in a real browser + across the three via launcher (launcher does no measurement).
Adapters: mediabunny (ref) + platform + ≥1 more, honest `capabilities()`; `_template` +
`add-engine.sh` proven. Negotiation records `NA(engine)` vs `NA(browser)` distinctly. Pillar 1: every
§9 family has scenarios, browser-pure oracles, all green or honest-NA for reference in every browser.
Pillar 2: every functional scenario has a bench, cross-browser, full protocol. Pillar 3: edge +
fuzz (Worker-isolated, timeout) + invariants → scorecard. Report: all matrices + Δ + scorecards +
caveats. Self-test: Mediabunny registered twice under two ids → Δ ≈ 0 within noise on every scenario.
README documents open-in-browser / bake / run / compare / add-engine.

## 17. First-actions order
2. `src/core/engine.ts` + `src/core/scenario.ts`. 3. `fixtures/bake.mjs` + `manifest.json`; bake;
commit manifest + golden. 4. core `{feature-detect,measure,bench,oracles,runner,report}.ts`. 5.
reference `mediabunny` + `platform` adapters. 6. first scenarios per family + oracles → reference
green/NA across the three browsers. 7. add a second engine → first `report.md`. 8. self-test
(Mediabunny vs Mediabunny → Δ≈0). 9. robustness + cross-browser launcher. 10. hand off to the loop.

## Orchestration note (this build)
Use subagents aggressively: fan out independent units (core modules, adapters, scenario families,
oracles, robustness, report sections) to parallel agents; prefer Workflow orchestration for large
multi-file batches. Launch spawned agents on **model: opus**. Author the shared contracts
(`engine.ts`, `scenario.ts`) coherently first, then parallelize downstream.
