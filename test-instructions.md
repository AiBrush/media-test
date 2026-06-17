# Browser Media-Engine Conformance & Benchmark Suite — Build Instructions

**Audience:** Claude Code agents building (and then continuously running) the suite.

**What this is:** a **library-agnostic, browser-only** test project. It defines a battery of media tests **once**, then runs that **same** battery — functional correctness, performance, and robustness — **inside real browsers** against **any media library you register behind a common adapter**. It produces a **comparison report** (every engine vs a chosen reference, default Mediabunny) so we can objectively measure the improvements we make or the libraries we evaluate. This is the measurement backbone for the `aibrush/media` decision (*optimize / adopt / skip*).

**Hard mandate — BROWSER ONLY.** The libraries under test run **in the browser** (WebCodecs / WASM / pure-JS). There is **no Node-library testing and no native binary in the test loop.** `@mediabunny/server`, `node-av`, native FFmpeg, and any other server/CLI codec path are **explicitly out of scope as engines** (they belong to a separate backend effort, not this suite). The only place a binary may run is a **one-time, offline fixture bake** that produces static media + golden data; once baked, the running suite touches nothing but the browser and the browser libraries.

---

## 0. The two rules that override everything

1. **No measurement → no claim. No green correctness oracle → no admissible benchmark.** Every number is produced in-browser by the suite, validated by a library-independent oracle, and reported with the engine, the browser, and the workload it is gated to. A speedup that fails conformance is a regression. (*INV §1, §13, §14*.)
2. **The comparison is the product.** The suite's deliverable is not "Mediabunny is fast" — it is a **matrix**: `engine × browser × scenario → {pass/fail/NA, metrics}`, with **deltas vs the reference engine**. That matrix is how we decide and how we prove an improvement.

The suite must be **fair across libraries**: it judges only **observable behavior** (bytes in → bytes/metadata/frames out, validated against ground truth), never a library's internals. Internals are engine-specific and live in an optional per-engine plugin (§10.4); they never enter the cross-engine comparison.

---

## 1. Agent operating rules (read every iteration)

- **Browser-only at test time.** All test execution and all measurement happen in a real browser page/Worker. If you find yourself measuring a library in Node, stop — it is out of scope.
- **No binary in the loop.** `ffmpeg`/`ffprobe`/Bento4 may run **only** in the offline `fixtures/bake` step, which is not part of `run`. The committed golden data is what the browser compares against.
- **No measurement is ever fabricated.** Not run = `—`. Unsupported = `NA` (and record *why*: engine-undeclared vs browser-unsupported). Never guess a number.
- **Correctness gates every benchmark**, per engine, per browser, per scenario.
- **Local only.** No deploy, no prod, no cloud beyond fetching/installing the libraries under test. Never touch AiBrush prod/dev.
- **Long runs go to background.** Browser bench matrices and the offline bake exceed the 60 s Bash limit — launch with `run_in_background` and poll.
- **Commit small, ignore large.** Commit suite code, scenario/corpus *manifests*, the *bake scripts*, golden *digests*, and the report. Git-ignore raw media, `node_modules`, library bundles, and raw per-run JSON.
- **Reference engine is pinned.** Default reference = Mediabunny at a recorded version. Deltas are always "vs reference on the same browser + same corpus."

---

## 2. Architecture

```
                         ┌─────────────────────────────────────────────┐
   offline, one-time     │  fixtures/bake  (ffmpeg + in-browser capture) │
   (binaries allowed)    │  → static media corpus + golden ground truth  │   ──► committed
                         └─────────────────────────────────────────────┘
                                          │ (static files, fetched in-page)
   ─────────────────────────────────────────────────────────────────────────────────────
   test time (browser only, no binaries)  ▼
                         ┌───────────────────────────────────────────────────────────┐
   launcher (Playwright, │   SUITE = a static browser app (runs in-page + in Workers) │
   automation only — NOT │                                                            │
   part of measurement)  │   registry of ENGINE ADAPTERS  (browser libs)              │
        │                │     • mediabunny (reference)   • ffmpeg.wasm               │
        ├─ Chromium ───► │     • mp4box.js                • platform (WebCodecs/<video>)│
        ├─ WebKit   ───► │     • aibrush/media (future)   • <your candidate>          │
        └─ Firefox  ───► │                                                            │
                         │   for each engine × scenario (capability-gated):           │
                         │     run op in-page/Worker → validate via browser-pure      │
                         │     ORACLE (golden digest / reference re-import / SSIM /    │
                         │     playback) → record conformance + in-browser metrics    │
                         └───────────────────────────────────────────────────────────┘
                                          │
                                          ▼
                         COMPARISON REPORT: engine × browser × scenario matrix + Δ vs reference
```

**Pieces:**

- **Engine adapter** — a thin shim implementing the suite's `MediaEngine` interface for one browser library, plus a **declared capability set** (§5). Adding a library = adding one adapter file. This is what makes the suite agnostic.
- **Scenario** — one engine-independent test/benchmark case: `(operation, input asset, options, required-capabilities, oracles, metrics)`. Scenarios never name a library.
- **Capability negotiation** — the runner runs a scenario on an engine only if the engine declares the needed capabilities **and** the current browser supports the needed WebCodecs codecs (runtime feature-detect). Otherwise `NA`, with the reason.
- **Browser-pure oracle** — validates an engine's observable output using only the browser + committed golden data + the reference engine (§8).
- **Comparison engine** — assembles the matrix and the deltas-vs-reference (§12).

---

## 3. Scope boundaries (in / out)

| In scope (browser) | Out of scope |
| --- | --- |
| Libraries that run in the browser: WebCodecs orchestrators (Mediabunny), WASM (ffmpeg.wasm), pure-JS (mp4box.js), and the raw platform (WebCodecs + `<video>`/MSE/MediaRecorder) | Node-only libraries; `@mediabunny/server`/node-av; native FFmpeg/CLI **as engines under test** |
| Test execution + measurement entirely in-page / in Workers | Any measurement in Node or via a binary |
| Cross-browser: Chromium, WebKit, Firefox | Headless "fake" codecs that don't reflect real browser behavior |
| Offline, one-time fixture bake (may use ffmpeg + an in-browser MediaRecorder capture) to produce **static** corpus + golden data | Running ffmpeg/ffprobe/Bento4 during `run` (the test loop) |
| All containers/codecs/API aspects the browser libraries expose | Server transcode pipelines, hardware-context/AVFrame paths |

> The backend/native story (the investigation's OPP-10, the real AiBrush perf lever) is deliberately **not** tested here. This suite answers a different question: *among libraries that run in the browser, which is most correct and fastest, and how much did our change improve things?*

---

## 4. Directory layout

you are in `media-browser-test/` . Self-contained.

```
media-browser-test/
├── README.md
├── package.json                # suite app + launcher deps (bundler, playwright). NOT the engines' runtime.
├── index.html                  # the suite app entry (open in ANY browser to run manually)
├── .gitignore                  # fixtures/media, node_modules, dist, results/raw, engine bundles
│
├── fixtures/                   # OFFLINE, one-time (binaries allowed here only)
│   ├── bake.mjs                # ffmpeg + headless-browser-capture → media/ + golden/
│   ├── manifest.json           # every asset: id, family, codecs, gen method, sha256, notes
│   ├── media/                  # GIT-IGNORED static media (rebuilt by bake.mjs)
│   └── golden/                 # COMMITTED ground-truth digests (small JSON) per asset/scenario
│
├── src/
│   ├── core/
│   │   ├── engine.ts           # the MediaEngine interface + normalized result types + CapabilitySet
│   │   ├── scenario.ts         # defineScenario(); the engine-independent case model
│   │   ├── registry.ts         # engine + scenario registration
│   │   ├── runner.ts           # capability negotiation + per-(engine,scenario) execution (in Worker)
│   │   ├── measure.ts          # in-browser metrics (wall, mem, longtasks, queue sizes, reads/writes)
│   │   ├── bench.ts            # warmup, N iters, median/p95/MAD, A/B alternation, significance
│   │   ├── oracles.ts          # browser-pure validators (golden digest, reimport, SSIM/PSNR, playback)
│   │   ├── feature-detect.ts   # per-browser WebCodecs/codec/WebGPU support probing
│   │   └── report.ts           # build the comparison matrix + Δ vs reference (JSON + markdown)
│   │
│   ├── engines/                # ONE adapter per library (this is the agnostic boundary)
│   │   ├── mediabunny/adapter.ts          # reference engine
│   │   ├── ffmpeg-wasm/adapter.ts
│   │   ├── mp4box/adapter.ts
│   │   ├── platform/adapter.ts            # raw WebCodecs + <video>/MSE/MediaRecorder
│   │   ├── aibrush-media/adapter.ts       # placeholder for the future drop-in
│   │   └── _template/adapter.ts           # copy this to add a new library
│   │
│   ├── scenarios/              # engine-independent cases, grouped by family (§9)
│   │   ├── probe/  demux/  remux/  transcode/  decode-seek/
│   │   ├── trim/  mux/  encryption/  metadata/  streaming-output/  audio-dsp/
│   │   └── robustness/         # edge / malformed / fuzz / property-metamorphic
│   │
│   └── app/                    # the in-page UI: pick engines+browsers+scenarios, run, view matrix
│
├── results/
│   ├── raw/                    # GIT-IGNORED per-run JSON (per engine × browser)
│   ├── runs/<iso-timestamp>/   # GIT-IGNORED snapshots
│   └── report.md               # COMMITTED comparison matrix + scorecards (§12)
│
└── scripts/
    ├── bake-fixtures.sh        # runs fixtures/bake.mjs (offline; binaries OK)
    ├── serve.sh               # static-serve the suite app for manual/in-browser runs
    ├── run.sh                 # launch Chromium/WebKit/Firefox, run the battery, collect results
    ├── compare.sh             # (re)build report.md from results/raw against the reference engine
    └── add-engine.sh          # scaffold a new adapter from _template
```

`.gitignore` (at least): `fixtures/media/`, `node_modules/`, `dist/`, `results/raw/`, `results/runs/`, `src/engines/**/vendor/`.

---

## 5. The engine adapter contract (`src/core/engine.ts`)

Everything is **bytes/blobs/metadata/frames in → bytes/metadata/frames out**, async, browser-native. No method exposes library internals.

```ts
export type BrowserName = 'chromium' | 'webkit' | 'firefox'

export interface MediaInput {
  id: string                              // corpus asset id
  url: string                             // served static; supports HTTP Range
  mime: string
  blob(): Promise<Blob>
  arrayBuffer(): Promise<ArrayBuffer>
}

export type MediaBytes = { bytes: Uint8Array; mime: string; container: string }

export interface NormalizedMetadata {
  container: string
  durationSec: number | null
  tracks: Array<{
    type: 'video' | 'audio' | 'subtitle' | 'other'
    codec: string
    width?: number; height?: number; fps?: number; rotation?: number
    sampleRate?: number; channels?: number
    bitrate?: number | null; language?: string | null
  }>
  tags?: Record<string, string>
}

export interface PacketInfo { trackIndex: number; size: number; ptsUs: number; dtsUs: number; keyframe: boolean }
export interface DemuxResult { metadata: NormalizedMetadata; packets: PacketInfo[] }

// frames are returned as digests (committed-golden comparison) and optionally raw for SSIM/PSNR
export interface FrameDigest { index: number; ptsUs: number; sha256: string /* of normalized RGBA */ }
export interface FrameSink { frames: FrameDigest[]; getPixels?(i: number): Promise<ImageData> }

export type Operation =
  | 'probe' | 'demux' | 'remux' | 'transcode'
  | 'decodeFrames' | 'seek' | 'trim' | 'mux' | 'decrypt'

export interface CapabilitySet {
  operations: Partial<Record<Operation, boolean>>
  containersIn: string[]                  // e.g. ['mp4','mov','mkv','webm','ts','wav','ogg','flac','mp3','adts','hls']
  containersOut: string[]
  videoCodecs: string[]                   // ['h264','hevc','vp8','vp9','av1', ...]
  audioCodecs: string[]                   // ['aac','opus','mp3','flac','vorbis','pcm-*', ...]
  encryption: Array<'cenc-ctr' | 'cenc-cbcs' | 'hls-aes128'>
  features: string[]                      // 'fragmented','fastStart:reserve','trim:frame-accurate',
                                          // 'metadata:write','alpha','resize','rotate','fanout', ...
}

export interface MediaEngine {
  readonly id: string                     // 'mediabunny@1.48.0', 'ffmpeg.wasm@0.12', 'aibrush-media@dev'
  capabilities(): CapabilitySet           // DECLARED; the runner also runtime-feature-detects per browser
  init?(): Promise<void>; dispose?(): Promise<void>

  probe(input: MediaInput): Promise<NormalizedMetadata>
  demux(input: MediaInput): Promise<DemuxResult>
  remux(input: MediaInput, opts: { container: string }): Promise<MediaBytes>
  transcode(input: MediaInput, opts: TranscodeOptions): Promise<MediaBytes>
  decodeFrames(input: MediaInput, opts?: { maxFrames?: number }): Promise<FrameSink>
  seek(input: MediaInput, tUs: number): Promise<{ landedPtsUs: number; frame: FrameDigest }>
  trim(input: MediaInput, range: { startUs: number; endUs: number }, opts: { container: string; frameAccurate: boolean }): Promise<MediaBytes>
  mux?(tracks: EncodedTracks, opts: { container: string }): Promise<MediaBytes>
  decrypt?(input: MediaInput, key: { kid?: string; keyHex: string; ivHex?: string }, opts: { scheme: 'cenc-ctr' | 'cenc-cbcs' | 'hls-aes128' }): Promise<MediaBytes>
}

export interface TranscodeOptions {
  container: string
  video?: { codec?: string; width?: number; height?: number; fps?: number; bitrate?: number; rotate?: number }
  audio?: { codec?: string; sampleRate?: number; channels?: number; bitrate?: number }
  variants?: TranscodeOptions['video'][]  // fan-out / ABR ladder (one input → N renditions)
}
```

**Capability + browser negotiation (`runner.ts` + `feature-detect.ts`):** a scenario declares `requires` (operation + containers + codecs + features). The runner runs it on engine E in browser B iff `E.capabilities()` covers `requires` **and** `feature-detect(B)` confirms the codecs are configurable (`VideoEncoder/Decoder.isConfigSupported`, `AudioEncoder/Decoder`, alpha, WebGPU). Otherwise it records:

- `NA(engine)` — engine does not declare the capability (e.g. mp4box can't transcode).
- `NA(browser)` — the browser lacks the WebCodecs codec (e.g. HEVC encode on Firefox).

Both are first-class results — *"works in Chromium, unsupported in WebKit"* is exactly the kind of finding a browser-only suite must surface.

---

## 6. Engines to ship (and how to add one)

Ship these adapters first; **Mediabunny is the reference**. Each declares capabilities honestly and is loaded as a **browser bundle**, dynamically imported so it never bloats the suite shell.

| Engine id | Role | Strengths to exercise | Known limits → many `NA` |
| --- | --- | --- | --- |
| `mediabunny` | **reference** | full container mux/demux + WebCodecs transcode/remux/trim/probe/decrypt | no image codecs; WebCodecs-gated transcode |
| `ffmpeg.wasm` | broad-coverage comparison | widest codec/container coverage; software decode/encode (no WebCodecs needed) | slow; large WASM; memory limits on big files |
| `mp4box.js` | demux/probe specialist | MP4/fragmentation/probe correctness | demux/probe/fragment only → `NA` for transcode/most remux |
| `platform` | "what the browser gives for free" baseline | WebCodecs decode/encode, `<video>` playback, MSE, MediaRecorder mux | not a container library; limited mux/remux |
| `aibrush-media` | **future candidate** | whatever we build | placeholder adapter + capability stub now |
| `_template` | scaffold | — | copy to add any new library |

**Adding a library (the workflow the user asked for):** `scripts/add-engine.sh <id>` copies `_template/adapter.ts`, you implement the interface against the new browser library and fill in `capabilities()`, register it, then `scripts/run.sh` runs the **entire existing battery** against it and `scripts/compare.sh` shows it **side-by-side vs the reference**. No scenario changes. That is the agnostic property: *drop in a library → get its full scorecard and its deltas.*

---

## 7. The corpus (static, browser-fetchable; baked offline once)

`fixtures/bake.mjs` produces a **fixed, checksummed** corpus + golden data. Binaries are allowed **here only**; output is static files the browser fetches. `manifest.json` records per asset: `id, family, container, codecs[], genMethod, sha256, sizeBytes, notes`. Media is git-ignored and rebuilt; **manifest + golden + bake script are committed**. Families (cover all aspects):

| Asset family | Examples | Feeds scenarios |
| --- | --- | --- |
| Video MP4/MOV | H.264 1080p/4K, HEVC, with/without B-frames, VFR, rotated, multi-track | probe/demux/remux/transcode/decode/seek/trim |
| Matroska/WebM | H.264 in MKV, VP8/VP9/AV1 WebM, **VP9 with alpha** | remux, transcode, alpha, demux |
| MPEG-TS / HLS | H.264 TS, HLS VOD playlist, **AES-128 encrypted HLS** | remux, TS demux, decrypt |
| Encrypted MP4 | **CENC `ctr`**, **CENC `cbcs`** | decrypt (capability-gated; bake via Bento4/Shaka offline) |
| Audio | WAV pcm_s16/s24/f32/**s16be**, MP3 (**Xing TOC** + CBR no-TOC), FLAC (**±SEEKTABLE**), AAC/ADTS, Opus/OGG | probe/decode/seek/transcode/audio-dsp |
| Recorder-origin | **headerless MediaRecorder WebM/Opus** (no Duration element) | probe/duration robustness — *bake in-browser via MediaRecorder*, then commit |
| Stress | multi-hour / many-samples file, zero-length, truncated, bit-flipped mutants | streaming-output, memory, robustness/fuzz |
| Image (negative) | JPEG/PNG/WebP | confirms `NA` for engines without image codecs |

**Browser-pure rule:** the *running* suite only `fetch()`es these static files. `ffmpeg` ran once, offline, to make them. The headerless-WebM asset is captured by a one-time in-browser MediaRecorder script (the faithful way to reproduce the missing-Duration case) and committed.

After bake: `sha256` every asset into `manifest.json`; the suite asserts checksums on load. A corpus mismatch invalidates all golden data — fail loudly.

---

## 8. Browser-pure oracles & golden ground truth (`oracles.ts` + `fixtures/golden/`)

Correctness is judged the **same way regardless of engine**, using only the browser + committed golden data + the reference engine. Pick the right mode per operation:

| Operation | Oracle (all browser-side at test time) | Pass criterion |
| --- | --- | --- |
| **probe / metadata** | compare `NormalizedMetadata` to committed `golden/<asset>.meta.json` (baked from ffprobe, offline) | duration within ±1 frame; codec/dims/fps/channels match |
| **demux** | compare packet table to committed `golden/<asset>.packets.json`; cross-check count/keyframes | track layout + timestamps + keyframe flags match |
| **remux** (lossless) | decode the engine's output **in-browser** (platform WebCodecs) → frame digests; compare to `golden/<asset>.frames.json`; also **re-import with the reference engine** and compare packet tables; also **`<video>` playback smoke** | decoded frames **bit-exact**; output re-imports; plays |
| **transcode / transform / alpha / fan-out** | decode output in-browser → **SSIM + PSNR in-browser** (JS/WebGL) vs committed reference frames; alpha plane compared separately | SSIM ≥ 0.99 (tune per codec); PSNR ≥ 40 dB; no color shift; plays |
| **decode / seek** | frame digest at timestamp vs golden; assert seek lands on expected keyframe | correct frame; seek accuracy within tolerance |
| **trim** | probe(out).duration ≈ requested; decoded boundary frames vs golden | duration + boundary frames correct |
| **decrypt** | decoded frames bit-exact vs `golden` (baked from an offline reference decrypt) | byte/frame-exact |
| **mux** | re-import with reference engine + playback; decoded frames vs source | round-trips; plays |
| **property / metamorphic** | computed entirely in-browser (see §11) | invariant holds |

**Golden artifacts are small JSON committed under `fixtures/golden/`** (metadata JSON, packet tables, frame-digest lists, reference SSIM frames as downsampled luma signatures) — **never raw media**. They are baked offline from independent tools (ffprobe/ffmpeg/Bento4) so the oracle is not "whatever the reference engine did," it is independent ground truth. The reference-engine re-import and `<video>` playback are *additional* browser-native cross-checks, not the sole truth.

---

## 9. Pillar 1 — Functional / conformance scenarios (full coverage, all aspects)

Every scenario is engine-independent and capability-gated. A scenario is declared like:

```ts
defineScenario({
  id: 'remux/h264_mp4_to_mkv',
  op: 'remux',
  input: 'h264_1080p_30s.mp4',
  options: { container: 'mkv' },
  requires: { operations: ['remux'], containersIn: ['mp4'], containersOut: ['mkv'], videoCodecs: ['h264'] },
  oracles: ['decoded-frames-bitexact', 'reference-reimport', 'playback-smoke'],
  metrics: ['wall', 'throughputRealtime', 'peakMemory', 'sourceReads', 'targetWrites', 'longtasks'],
})
```

Coverage families (each expands into many parameterized scenarios across the corpus):

| Family | What it asserts (across all applicable containers/codecs) |
| --- | --- |
| **Probe / metadata** | duration, container, per-track codec/dims/fps/sample-rate/channels/rotation/tags, for every container |
| **Demux** | packet tables (size/pts/dts/keyframe) match golden; lazy vs full read consistency |
| **Remux** | **cross-container matrix** (MP4↔MOV↔MKV↔WebM↔TS; audio WAV/MP3/FLAC/OGG/ADTS), **lossless** (decoded frames identical), output re-imports + plays |
| **Transcode** | **codec matrix** (H.264/HEVC/VP8/VP9/AV1; AAC/Opus/MP3/FLAC/PCM), resize, fps change, bitrate, rotate; SSIM/PSNR gated |
| **Decode / seek** | frame-accurate decode; keyframe & non-keyframe seek; VFR; B-frame reorder |
| **Trim** | keyframe-aligned and frame-accurate; duration + boundary correctness |
| **Mux** | from encoded tracks → container; round-trip + playback |
| **Encryption** | CENC `ctr`, CENC `cbcs`, AES-128 HLS decrypt; unencrypted input must be untouched |
| **Metadata / tags** | read everywhere; write where supported (then re-probe) |
| **Streaming / output targets** | buffer vs streaming output; fragmented/CMAF; `fastStart:reserve` large forward seek; tiny TS writes |
| **Audio DSP** | resample (up/down, ch-mix), PCM format conversions incl. big-endian and 24-bit |
| **Fan-out / ABR** | one input → N renditions; per-rendition fps/size; each rendition SSIM-validated |
| **Image (negative)** | feeding JPEG/PNG/WebP yields a clean `NA`/graceful error, never a crash |

`scripts/run.sh --pillar functional` runs all; conformance results land per `engine × browser × scenario`.

---

## 10. Pillar 2 — Performance benchmarks (cross-engine, in-browser)

### 10.1 What is measured

The **same operations** as the functional scenarios, but timed and resource-profiled, so the comparison is fair (observable op in → op out). Metrics (`measure.ts`, all in-browser):

| Metric | Source |
| --- | --- |
| Wall time / **throughput × real-time** (`mediaSec / wallSec`) | `performance.now()` |
| Peak JS heap / memory | `performance.measureUserAgentSpecificMemory()` (Chromium) — **capability-gated**; fallback `performance.memory`; else omit + flag |
| Main-thread blocking | `PerformanceObserver({type:'longtask'})`, sum of > 50 ms tasks |
| # source reads / range fetches | counting Source wrapper + `performance.getEntriesByType('resource')` |
| # target writes / bytes out | counting Target wrapper |
| Decode/encode throughput (frames/s) | per-op counters |

### 10.2 Protocol (`bench.ts`)

- Warm up ≥ 3 unmeasured iterations; measure ≥ 6 (browser is slow) — record actual N.
- **A/B alternation** when comparing two engines on the same machine/browser (interleave to cancel thermal drift); never "all A then all B."
- Each iteration in a **fresh Worker / page context** for clean memory; the machine on AC power, quiesced.
- Report **median, p95, MAD**; declare a difference only when it exceeds `max(noise-band, 3%)`; otherwise **within-noise**. Optional Mann–Whitney U.
- Tag every bench `e2e` (it is an observable operation). Engine-internal stage micro-benches are §10.4, not here.

### 10.3 Cross-browser is a first-class axis

Run every bench on Chromium, WebKit, and Firefox via the launcher. WebCodecs availability and hardware codec sessions vary by browser/OS/GPU (*INV §11*) — so a number is only comparable **within the same browser on the same machine**. The report never compares a Firefox number to a Chromium number; it compares **engines within a browser**.

### 10.4 Engine-internal benches & the encoder-starvation diagnostic (optional, per-engine)

Mediabunny-internal hot-path isolations (the *INV* OPP stage benches) and the **encoder-starvation** diagnostic (*INV §13*: is the WebCodecs encoder ever idle waiting on JS? poll `encodeQueueSize`/`decodeQueueSize`) are **engine-specific** and live under `src/engines/mediabunny/internal/`. They are **not** part of the cross-engine comparison (no other library has the same internals). Use them only when optimizing Mediabunny itself; record them in a separate per-engine annex of the report.

---

## 11. Pillar 3 — Robustness (edge / malformed / fuzz / property), in-browser

Run each engine in a **Worker** so a crash/hang is contained and detectable by timeout.

- **Edge cases:** open-GOP & B-frames; VFR; rotated; multi-track; headerless MediaRecorder WebM; big-endian/24-bit PCM; CBC chunk-boundary chaining; `cbcs` pattern (per-subsample IV); MP4 `fastStart:reserve`; fragmented/CMAF; multi-hour/many-samples; zero-length.
- **Malformed / fuzz:** in-browser byte mutation (bit-flips, header truncation, random spans) of valid assets → the engine must **fail gracefully** (throw / reject) within a timeout — **no crash, no hang, no unbounded memory.** Record `graceful` / `crash` / `timeout` / `OOM` per engine × browser.
- **Property / metamorphic invariants (all in-browser):**
  - `decode(remux(x)) == decode(x)` (remux lossless),
  - `demux(mux(x)) ≈ x`,
  - `probe(remux(x)).duration ≈ probe(x).duration`,
  - `trim(x, a..b) ++ trim(x, b..c) ≈ trim(x, a..c)` (decoded-frame level),
  - `probe(x).duration` consistent across containers of the same content.
- **Image negatives:** JPEG/PNG/WebP → clean `NA`/error, never a crash.

These produce a **robustness scorecard** per engine × browser (graceful-handling rate, invariants held).

---

## 12. The comparison report (`report.ts` → `results/report.md`) — the deliverable

This is what answers *"how do the libraries compare and how much did we improve?"* Build four artifacts from `results/raw/`:

1. **Capability matrix** — `engine × capability` (declared) and `engine × browser → supported codecs` (runtime-detected).
2. **Conformance matrix** — `engine × browser × scenario → PASS / FAIL / NA(engine) / NA(browser)`, with failure reasons. Summarized to a **conformance %** per engine × browser.
3. **Benchmark matrix** — `engine × browser × scenario → {median, p95, throughput×RT, peak mem, longtasks}`.
4. **Δ-vs-reference view** — pick the reference engine (default `mediabunny@<pinned>`); for every other engine (or candidate build) show **Δ% per scenario** (perf) and **conformance delta** (gained/lost cases), **within the same browser**. Verdict vocabulary per cell: `faster` / `slower` / `within-noise` / `gained` / `regressed` / `NA`.

Plus a **scorecard** per engine: conformance %, perf index (geomean of throughput ratios vs reference, per browser), capability breadth, robustness rate. Emit machine-readable `results/raw/*.json` alongside the markdown.

> Using it to measure an improvement: register the optimized library (or our fork, or `aibrush/media`) as a **new engine id**, run, and read its **Δ-vs-reference** column. A green improvement = faster-or-equal on the target scenarios **with no conformance regression** in **every** target browser.

---

## 13. Execution environments & reproducibility

- **Browsers:** Chromium, WebKit, Firefox, driven by Playwright **only as a launcher** (it starts the browser and serves the static suite; it performs no measurement). The same suite app also runs by simply opening `index.html` in any browser for manual runs.
- **Launch flags:** enable WebCodecs/WebGPU where the browser needs flags; record the exact browser build + GPU string in each run's `env`.
- **Pinning:** pin and record suite version, each engine's version/bundle hash, the corpus checksum set, browser versions. A change in any invalidates comparisons until re-baselined.
- **Caveats (write them into the report):** browser perf numbers are **indicative** — GPU/OS/thermals and the hardware **codec session limit** move them; always AC power + quiesced; never cross-machine or cross-browser compare a raw number; for OPP-11-style parallelism the ceiling is the codec session limit, not `navigator.hardwareConcurrency` (*INV §11*).

---

## 14. How you use it + the continuous loop

**Setup (once):** scaffold §4; `scripts/bake-fixtures.sh` (offline); build the core + the reference `mediabunny` adapter + the `platform` baseline; write the scenario families; `scripts/run.sh` across the three browsers; `scripts/compare.sh` → first `report.md` with Mediabunny as reference. Commit suite + manifest + golden + report.

**Loop (continuous, library-agnostic):** one iteration =

1. **Add or change an engine** — implement/adjust one adapter (a new library, our optimized fork as a new id, or `aibrush/media`). Never edit scenarios to favor an engine.
2. `scripts/run.sh --engine <id>` across all three browsers (background; poll).
3. **Conformance gate first** — the engine's scenarios must pass (or be honest `NA`); a `FAIL` blocks any perf claim for that scenario.
4. `scripts/compare.sh` — regenerate the matrix + Δ-vs-reference.
5. **Record honestly** — `faster` / `within-noise` / `regressed` / `gained` / `lost`, per browser. A within-noise delta is not a win; a conformance regression is a stop.
6. Commit (suite/adapters/golden/report; media + raw ignored). Next iteration.

Each `run.sh` call is idempotent and self-gating, so the loop never emits an unmeasured or uncorrected claim. Coverage grows by **adding scenarios** (any new aspect to test) and **adding engines** (any new library to compare) — both are append-only.

---

## 15. Honesty & anti-patterns

- ❌ Measuring or "testing" a library in Node, or via a binary, at test time. **Browser only.**
- ❌ Treating `@mediabunny/server`/native FFmpeg as an engine here. Out of scope.
- ❌ Running ffmpeg/ffprobe/Bento4 inside `run` — they belong to the offline bake; the suite compares against **committed golden** data.
- ❌ Judging an engine by its internals — only observable output, validated by oracles, enters the comparison.
- ❌ A perf number without a green conformance gate for that exact engine × browser × scenario.
- ❌ Quoting a number across browsers/machines; collapsing `NA(engine)` and `NA(browser)`.
- ❌ Editing scenarios to make a favored engine look better; scenarios are engine-blind.
- ❌ Calling a within-noise delta an improvement, or hiding a conformance regression.
- ❌ Blocking a foreground Bash call on a browser matrix run or the bake (use `run_in_background`).

---

## 16. Definition of Done — initial build

- [ ] **Offline bake** reproduces the full corpus + golden data deterministically; checksums asserted on load; binaries appear **only** in the bake.
- [ ] **Suite runs in a real browser** (open `index.html` works) and across Chromium/WebKit/Firefox via the launcher; the launcher does no measurement.
- [ ] **Engine adapters:** `mediabunny` (reference) + `platform` + at least one more (`ffmpeg.wasm` or `mp4box.js`), each with an honest `capabilities()`. `_template` + `add-engine.sh` work end-to-end (proven by scaffolding a throwaway adapter).
- [ ] **Capability/browser negotiation** records `NA(engine)` vs `NA(browser)` distinctly.
- [ ] **Pillar 1 (functional):** every family in §9 has scenarios; oracles are browser-pure (golden + reimport + SSIM/PSNR + playback); all green or honest-NA for the reference engine in every browser.
- [ ] **Pillar 2 (performance):** every functional scenario has a bench; cross-browser; protocol (warmup/N/median/p95/MAD/A-B) implemented.
- [ ] **Pillar 3 (robustness):** edge + malformed/fuzz (Worker-isolated, timeout-guarded) + property/metamorphic invariants run; robustness scorecard produced.
- [ ] **Comparison report** (`results/report.md`): capability + conformance + benchmark matrices + Δ-vs-reference + per-engine scorecards, with the browser caveats written in.
- [ ] **Self-test:** registering Mediabunny twice under two ids yields Δ ≈ 0 within noise on every scenario (proves the rig measures nothing where nothing changed).
- [ ] `README.md` documents: open-in-browser, `bake-fixtures`, `run`, `compare`, and `add-engine` (how to drop in a library and read its scorecard).

---

## 17. First actions for the agent

2. Define `src/core/engine.ts` (the §5 contract) and `src/core/scenario.ts` (`defineScenario`).
3. Write `fixtures/bake.mjs` (offline ffmpeg + in-browser MediaRecorder capture) + `manifest.json` for the core corpus; bake; commit manifest + golden.
4. Build `src/core/{feature-detect,measure,bench,oracles,runner,report}.ts`.
5. Implement the **reference `mediabunny` adapter** and the **`platform` adapter** (raw WebCodecs + `<video>`).
6. Write the first scenarios per family (§9) + their oracles (§8); get the reference engine green/NA across Chromium/WebKit/Firefox.
7. Add a second engine (`ffmpeg.wasm` or `mp4box.js`) → produce the first **comparison `report.md`**.
8. Implement the **self-test** (Mediabunny vs Mediabunny → Δ≈0).
9. Add robustness (§11) and the cross-browser launcher (§13).
10. Hand off to the loop (§14): coverage grows by adding scenarios; comparison grows by adding engines.

> The contract, restated: **browser only; measure or don't claim; correctness gates every number; judge observable output, not internals; the comparison vs the reference is the product.** This suite is the agnostic scoreboard — point it at any browser media library and it tells you, per browser, how correct and how fast that library is, and exactly how much an improvement moved the needle.
