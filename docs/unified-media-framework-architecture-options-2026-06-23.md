# Unified Media Framework — Architecture & DX Options Proposal

> **Purpose:** Lay out *multiple* concrete options for (1) the developer experience / public API and (2) the internal architecture of our unified in-browser media engine (`aibrush-media`), so the team can evaluate and select.
> **Companion:** [`unified-media-framework-feasibility-2026-06-23.md`](unified-media-framework-feasibility-2026-06-23.md) (why one framework can win; the 3-tier capability-routed model; benchmark evidence). This doc assumes that engine model and proposes *how to surface and structure it*.
> **Date:** 2026-06-23.

Where a choice is driven by the benchmark, it's flagged **[data]** (see [`report/leaderboard.md`](report/leaderboard.md)). The recurring constraints are: **bundle** (tree-shaking matters — mediabunny ~165 kB vs ffmpeg.wasm multi-MB), **main-thread jank** (many wins turned on the `longtasks` metric), **lazy per-codec wasm** (the heavy tail is ~5% of features), and **never probe via `<video>`** (600–7000× slower than reading bytes).

Each section presents options A/B/C…, a comparison table, and a **recommendation**. A combined recommended stack is in §3.

---

## 1. Developer Experience (DX) & Implementation

Three independent axes — **(1.1) Initialization**, **(1.2) Call syntax**, **(1.3) Data handling** — each with options that can be mixed.

## 1.1 Importing & Injection (how the library is initialized)

### Option A — Zero-config tree-shakeable functions (“batteries included”)

No instance. Import the operation you need; the engine self-configures (capability detection is lazy/internal). Global knobs via an optional `configure()`.

```ts
import { probe, convert } from '@aibrush/media'

const info = await probe(file)
const out  = await convert(file, { container: 'mp4', video: { codec: 'h264' } })

// optional, one-time, side-channel config:
import { configure } from '@aibrush/media'
configure({ wasmBaseUrl: '/wasm/', preferHardware: true })
```

- **Pros:** lowest friction; great for demos/docs; each named import is independently tree-shakeable.
- **Cons:** global mutable config is implicit (awkward for SSR/multiple configs/tests); harder to run two differently-configured engines on one page.

### Option B — Configured instance factory (dependency-injection friendly)

A `createMediaEngine(config)` returns an instance carrying all configuration. **[data]** `enableThreads` should default to `crossOriginIsolated` so the wasm tail only uses threads when COOP/COEP is present.

```ts
import { createMediaEngine } from '@aibrush/media'

const media = createMediaEngine({
  wasmBaseUrl: '/wasm/',          // where lazy per-codec modules are fetched
  preferHardware: true,           // WebCodecs hardware first
  enableThreads: crossOriginIsolated,
  determinism: 'auto',            // 'auto' | 'force-software' (cross-machine goldens)
  onLog: console.debug,
})

const info = await media.probe(file)
```

- **Pros:** explicit, testable, multi-instance, no globals; config travels with the object; clean SSR/worker story.
- **Cons:** a little ceremony; you pass `media` around (or wrap in your DI container / React context).

### Option C — Plugin / capability builder (maximal bundle control) **[data]**

The caller *registers* exactly the substrates and codecs they want. Nothing you don't `.use()` is in the bundle — the strongest possible tree-shaking, directly addressing the bundle constraint.

```ts
import { MediaEngine } from '@aibrush/media/core'
import { webcodecs }   from '@aibrush/media/webcodecs'   // 0-byte runtime (browser API)
import { gpuFilters }  from '@aibrush/media/gpu'         // WebGPU/WebGL pixel filters
import { wasmCodecs }  from '@aibrush/media/wasm'        // lazy per-codec fallbacks
import { mp4, webm, wav } from '@aibrush/media/containers'

const media = new MediaEngine()
  .use(mp4(), webm(), wav())                  // only the containers you ship
  .use(webcodecs())                            // hardware decode/encode
  .use(gpuFilters())                           // resize/crop/rotate/colorspace on GPU
  .use(wasmCodecs({ only: ['flac', 'opus'] })) // opt-in heavy tail, lazy-loaded
  .build()
```

- **Pros:** smallest possible footprint; explicit capability surface; easy to add a codec without touching core; plugins are independently versionable/testable.
- **Cons:** most verbose; users must know what they need; a “misconfigured = capability-miss at runtime” risk (mitigate with a dev-mode warning + a `presets/` of ready-made bundles).

| Init option | Friction | Bundle control | Multi-instance / DI | Best for |
|---|---|---|---|---|
| **A** Zero-config functions | Lowest | Good (per-import) | Weak (globals) | demos, simple apps |
| **B** Instance factory | Low | Good | Strong | most apps |
| **C** Plugin builder | Higher | **Best** | Strong | size-critical / advanced |

**Recommendation:** ship **B as the default surface** and **C as the power path** — make the default export a *pre-wired builder* (so `createMediaEngine()` is literally a preset over `MediaEngine`). A then becomes thin sugar over a lazily-created default instance. One engine, three ergonomic entry points.

## 1.2 Function Calls (syntax for invoking core operations)

Core ops: `probe, convert, remux, trim, mux, demux, decode, encode`. All async; all accept `{ signal?: AbortSignal, onProgress?: (p: Progress) => void }`.

### Option A — Flat task functions (one call per operation)

```ts
const info = await media.probe(input)
const out  = await media.convert(input, {
  container: 'mp4',
  video: { codec: 'h264', bitrate: 4_000_000, resize: { width: 1280, height: 720 } },
  audio: { codec: 'aac' },
}, { signal, onProgress })
const clip = await media.trim(input, { start: 0, end: 5 })
```

- **Pros:** most discoverable; flat options object is easy to type & document; trivially tree-shakeable; matches the 80% “do one thing” case.
- **Cons:** multi-stage custom pipelines get a big nested options object; less elegant for compositions.

### Option B — Fluent / chainable pipeline (recipe style)

```ts
const out = await media.load(input)
  .trim({ start: 0, end: 5 })
  .resize(1280, 720)
  .video({ codec: 'h264', bitrate: 4_000_000 })
  .audio({ codec: 'aac' })
  .to('mp4')
  .blob({ signal, onProgress })     // terminal: .blob() | .file() | .stream() | .toElement(el)
```

- **Pros:** reads like the operation; lazy until the terminal call; chain maps 1:1 to the internal pipeline graph; great for editors/compositions.
- **Cons:** errors surface at the terminal call; a bit more “magic”; harder to serialize.

### Option C — Declarative job spec (single `run(job)`)

```ts
const out = await media.run({
  input,
  ops: [{ op: 'trim', start: 0, end: 5 }, { op: 'resize', width: 1280, height: 720 }],
  output: { container: 'mp4', video: { codec: 'h264' }, audio: { codec: 'aac' } },
}, { signal, onProgress })
```

- **Pros:** the whole job is **data** — serializable, inspectable, cacheable, and shippable verbatim to a Worker or even a server; uniform single entry point; easy to log/replay.
- **Cons:** least “fluent”; needs a stable schema; verbose for one-liners.

### Option D — Low-level graph (escape hatch; complements the above)

Power users wire stages directly; A/B/C all compile down to this.

```ts
const src     = media.source(input)
const demuxed = media.demux(src)
const frames  = media.decode(demuxed.video)
const filtered= media.filter(frames, [resize(1280, 720)])
const encoded = media.encode(filtered, { codec: 'h264' })
const out     = await media.mux({ video: encoded, audio: demuxed.audio /* copy */ }, { container: 'mp4' }).toBlob()
```

- **Pros:** full control (e.g., remux audio while re-encoding video); needed for real-time/streaming; the public substrate for plugins.
- **Cons:** verbose; caller owns lifecycle/ordering.

> All four return a cancellable handle and stream progress; e.g. `const job = media.convert(…); job.onProgress(…); await job.cancel()` — or pass `{ signal }`.

| Call option | Ergonomics (simple) | Ergonomics (multi-stage) | Serializable | Streaming/real-time |
|---|---|---|---|---|
| **A** Flat tasks | **Best** | OK | partial | via D |
| **B** Fluent chain | Good | **Best** | no | yes |
| **C** Declarative job | OK | Good | **Yes** | via D |
| **D** Low-level graph | Verbose | **Best** | n/a | **Best** |

**Recommendation:** **A (flat tasks) as the primary API** for discoverability + tree-shaking, **D (graph) as the documented escape hatch**, and **C (declarative job)** as the *worker/serialization boundary* (the main thread sends a job spec to the worker). Offer **B (fluent)** as optional sugar that builds a C job under the hood. Don’t force one style — they share one executor.

## 1.3 Data Handling (passing file bytes *or* HTML tags)

The engine must accept raw bytes, Blobs/Files, URLs, streams, **and** `<video>`/`<audio>`/`MediaStream` — and emit Blobs, Files, streams, OPFS, or a playable element. Key rule **[data]**: for **probe/metadata**, read **bytes** (range request / header-only), **never** `<video>.loadedmetadata`.

### Option A — Polymorphic input (accept anything; normalize internally)

```ts
type MediaInput =
  | ArrayBuffer | Uint8Array | Blob | File
  | ReadableStream<Uint8Array> | URL | string /* url */
  | HTMLMediaElement | MediaStream

await media.probe(anyOfTheAbove)                       // library figures out the source kind
```

- **Pros:** “just pass what you have”; minimal API surface; great DX for newcomers.
- **Cons:** ambiguous edges (is a `string` a URL or a path?); larger internal normalization layer; type of output for an element input needs a default.

### Option B — Explicit source/sink constructors (canonical)

```ts
import { fromBytes, fromBlob, fromURL, fromElement, fromStream } from '@aibrush/media/sources'
import { toBlob, toFile, toStream, toElement, toOPFS }           from '@aibrush/media/sinks'

await media.convert(fromURL(url, { rangeRequests: true }), toOPFS('out.mp4'), { … })
//                     ^ probe reads only the moov/header via HTTP Range — fast [data]

const src = fromElement(document.querySelector('video')!, { mode: 'bytes' })  // see below
const out = await media.convert(src, toElement(previewEl, { via: 'mse' }), { … })
```

- **Pros:** self-documenting; each source/sink carries its own options (range requests, MIME hint, MSE vs Blob-URL); unambiguous; smallest normalization core.
- **Cons:** a bit more to import/learn (mitigated by A overloads).

### Option C — Web-streams-first (everything is a stream)

```ts
const res = await fetch(url)
const out: ReadableStream<Uint8Array> =
  media.convert(res.body!, { container: 'mp4', video: { codec: 'h264' } })
await out.pipeTo(await media.writableOPFS('out.mp4'))
```

- **Pros:** bounded memory on huge files (the `streaming-output` family’s point); native backpressure; composes with `fetch`/`Response`; ideal worker boundary (transferable).
- **Cons:** clunky for the trivial “I have a 2 MB ArrayBuffer” case (wrap in a one-chunk stream).

#### HTML-tag handling (applies to all three)

A `<video>`/`<audio>` element can be consumed two ways — make it explicit:

| Mode | Mechanism | Use when |
|---|---|---|
| **bytes** (default for probe/convert) | read `el.currentSrc` → `fetch` (Range) the underlying file | you want full fidelity / metadata / re-encode of the source file **[data: never `loadedmetadata`]** |
| **capture** (real-time) | `el.captureStream()` → `MediaStreamTrackProcessor` → WebCodecs `VideoFrame`/`AudioData` | you want “whatever is playing right now” / live |

Output **to** an element:

| Sink mode | Mechanism | Use when |
|---|---|---|
| `toElement(el, { via: 'blob' })` | `Blob` → `URL.createObjectURL` | whole-file result |
| `toElement(el, { via: 'mse' })` | MSE `SourceBuffer` append | progressive/streaming playback |
| `toElement(el, { via: 'stream' })` | `VideoEncoder` → `MediaStreamTrackGenerator` → `srcObject` | live preview |

| Data option | Beginner DX | Large-file memory | Worker transfer | Explicitness |
|---|---|---|---|---|
| **A** Polymorphic | **Best** | depends | OK | low |
| **B** Source/sink ctors | Good | Good | Good | **Best** |
| **C** Streams-first | OK | **Best** | **Best** | Good |

**Recommendation:** **B (explicit source/sink) as canonical**, with **A polymorphic overloads** that normalize to B for ergonomics, and **C streams used internally** for everything (sources adapt to streams at the edge; large jobs never fully buffer). Make element-handling **explicit** (`mode: 'bytes' | 'capture'`) with `bytes` the default so probe stays fast.

---

## 2. Framework Architecture (internal structure)

Four distinct internal structures. They’re partly composable (e.g., ARCH‑1 drivers running inside an ARCH‑4 worker), noted per option.

## ARCH‑1 — Layered capability router + pluggable backends (“microkernel + drivers”) **[recommended core]**

A thin core owns three things: the **type seams** (encoded `Packet`; WebCodecs `VideoFrame`/`AudioData`/`EncodedChunk`), a **capability registry**, and a **router** that picks a backend per pipeline stage. Backends are drivers behind narrow interfaces.

```
            ┌──────────────────────────────────────────────────────┐
 op ──────▶ │ ROUTER  (per-stage)                                   │
            │  pickContainer() · pickCodec() · pickFilter()         │
            │  rules: WebCodecs.isConfigSupported? → hardware       │
            │         else GPU (filters) · else lazy wasm driver    │
            │  cost model: latency · longtasks · already-loaded     │
            └───────┬───────────────┬──────────────────┬───────────┘
        ┌───────────┘               │                  └───────────┐
        ▼                           ▼                              ▼
  ContainerDriver[]           CodecDriver[]                 FilterDriver[]
  (TS: mp4/webm/wav/…)   (WebCodecs | wasm-flac | wasm-opus)   (GPU | wasm)
```

```ts
interface CodecDriver {
  id: string
  canDecode(cfg: DecoderConfig): Promise<boolean> | boolean   // wraps isConfigSupported / wasm caps
  canEncode(cfg: EncoderConfig): Promise<boolean> | boolean
  createDecoder(cfg: DecoderConfig): Decoder
  createEncoder(cfg: EncoderConfig): Encoder
  cost: { bundleKb: number; tier: 'hardware' | 'gpu' | 'wasm' }
}
interface ContainerDriver { id: string; canDemux(mime: string): boolean; canMux(mime: string): boolean; demux(src: Source): Demuxer; mux(streams: Streams, o: MuxOptions): Muxer }
interface FilterDriver  { id: string; supports(f: Filter): boolean; apply(frame: VideoFrame, f: Filter): VideoFrame }
```

- **Pros:** matches the substrate seams exactly; each tier is independently testable/tree-shakeable; adding FLAC = registering one driver; the **plugin builder (§1.1‑C) is literally this registry**. Capability routing is centralized and explainable.
- **Cons:** you must design good driver interfaces up front; the router’s cost model needs tuning.
- **Composes with:** ARCH‑4 (drivers in a worker), ARCH‑2 (router emits a graph).

## ARCH‑2 — Dataflow graph engine

Every job is a directed graph of streaming nodes (`source → demux → decode → filter → encode → mux → sink`); the engine schedules them with backpressure. Backends are node implementations.

```ts
const g = media.graph()
const s   = g.source(input)
const dx  = g.demux(s)
const dec = g.decode(dx.video)
const flt = g.filter(dec, resize(1280, 720))
const enc = g.encode(flt, { codec: 'h264' })
g.mux({ video: enc, audio: dx.audio }, { container: 'mp4' }).sink(toBlob())
const out = await g.run({ signal, onProgress })
```

- **Pros:** maximal composability; natural streaming/backpressure (bounded memory on huge inputs); the fluent/declarative DX maps 1:1; trivial to insert new node types.
- **Cons:** a real scheduler is non-trivial; overkill for one-shot `probe`; debugging dataflow is harder than a call stack.
- **Composes with:** ARCH‑1 (nodes resolve their backend via the router).

## ARCH‑3 — Monolithic facade over one backend + adapters (mediabunny‑style, extended) **[fastest to ship]**

A cohesive core that *owns* TS containers + WebCodecs directly, with wasm/GPU as internal adapters behind feature flags — not a general driver system. **[data]** This is closest to the engine that already wins 56% of features.

- **Pros:** simplest to build; smallest core; fastest path to a shippable MVP; fewer abstractions to get wrong.
- **Cons:** adding a substrate means editing the core; weaker separation/testability; the plugin/bundle-control story (§1.1‑C) is limited.
- **Composes with:** ARCH‑4. Natural **Phase‑1**; refactor into ARCH‑1 as the driver set grows.

## ARCH‑4 — Worker-first / off-main-thread **[recommended runtime]**

The engine runs in a Web Worker (or pool); the main-thread API is a thin RPC proxy (Comlink-style). wasm and `OffscreenCanvas`/WebGPU filters live in the worker. **[data]** Directly targets the `longtasks` metric that decided many wins — the UI thread never blocks on decode/encode/mux.

```ts
// main thread — thin proxy
const media = await createMediaEngine({ worker: true /* | workerPool: 4 */ })
const out = await media.convert(file, { container: 'mp4', video: { codec: 'h264' } })
// heavy work runs off-main-thread; pass Transferables (ArrayBuffer/streams) to avoid copies
```

- **Pros:** zero main-thread jank; clean home for wasm threads (when `crossOriginIsolated`); scales via a pool; isolates crashes.
- **Cons:** RPC/transfer overhead for tiny ops (offer a “main-thread mode” for trivial probes); some objects (e.g. `VideoFrame`) need careful transfer/lifetime handling; harder debugging.
- **Composes with:** ARCH‑1/2/3 (any of them can be the *engine that runs inside the worker*).

| Architecture | Build effort | Composability | Bundle/tree-shake | Main-thread jank | Streaming | Notes |
|---|---|---|---|---|---|---|
| **ARCH‑1** Router+drivers | Medium | High | **Best** | (via ARCH‑4) | good | the structural recommendation |
| **ARCH‑2** Graph engine | High | **Best** | Good | (via ARCH‑4) | **Best** | great executor, heavy to build alone |
| **ARCH‑3** Monolith facade | **Low** | Low | OK | (via ARCH‑4) | OK | fastest MVP; refactor later |
| **ARCH‑4** Worker-first | Medium | n/a (orthogonal) | neutral | **Best** | **Best** | a *deployment* layer over any core |

**Recommendation:** structure the core as **ARCH‑1 (router + drivers)**, give it a small **ARCH‑2 graph executor** for multi-stage jobs, and run it **ARCH‑4 worker-first** for heavy paths (with a main-thread fast path for cheap probes). If we need to ship sooner, start **ARCH‑3** and refactor into ARCH‑1 once a second/third driver appears — the public DX (§1) doesn’t change.

---

## 3. Recommended combined stack (one coherent pick)

A thread through the options that satisfies the benchmark constraints (small eager bundle, no main-thread jank, lazy heavy tail, no forced isolation):

- **Init:** §1.1‑**B** default (`createMediaEngine`) + §1.1‑**C** builder for size-critical users (same engine, two entry points).
- **Calls:** §1.2‑**A** flat tasks (primary) + §1.2‑**D** graph (escape hatch); §1.2‑**C** job spec as the worker boundary; §1.2‑**B** fluent as optional sugar.
- **Data:** §1.3‑**B** explicit sources/sinks (canonical) + §1.3‑**A** polymorphic overloads; §1.3‑**C** streams internally; element input defaults to **bytes** mode so probe stays fast.
- **Architecture:** **ARCH‑1** core + **ARCH‑2** executor, deployed **ARCH‑4** worker-first; **ARCH‑3** acceptable as the Phase‑1 MVP.

### Cross-cutting (decide once, applies to all options)

- **Cancellation & progress:** every op takes `{ signal }` and emits `onProgress`; returns a handle (`.cancel()`, `.progress`).
- **Capability misses:** when the router finds no backend (e.g., 10-bit HEVC encode — a no-winner case **[data]**), throw a typed `CapabilityError { op, reason, suggestion }`, never silently degrade.
- **Determinism mode:** a `force-software` switch (GPU/hardware off) for cross-machine golden tests **[data: hardware decode is platform-specific]**.
- **Strict self-validation:** ship bit-exact/structural oracles internally **[data: 206 WEAK-GATE, 3 SUSPECT — do not emulate the shortcut “wins”]**.

### Suggested decision matrix

| If you prioritize… | Init | Calls | Data | Arch |
|---|---|---|---|---|
| Fastest MVP | A/B | A | A | ARCH‑3 (+4) |
| Smallest bundle | **C** | A | B | ARCH‑1 |
| Editor / compositions | B | **B**/D | B | ARCH‑2 (+1, +4) |
| Server-portable jobs | B | **C** | C | ARCH‑1 (+4) |
| Smoothest UI at scale | B | A | C | **ARCH‑4** + ARCH‑1 |

---

### Appendix — open API questions to resolve before locking

- Naming: **resolved** -- `convert` (+ `transcode` alias) and `probe`; see Final decision.
- Options shape: flat (`{ video:{codec} }`) vs string DSL (`'h264/aac@mp4'`) — recommend flat + typed.
- Output default for element input (Blob vs MSE) and for streams (eager vs lazy).
- Plugin/version contract for third-party drivers (semver of the driver interface).
- Preset bundles to publish (`/preset/web` = WebCodecs+containers; `/preset/full` = +wasm tail).

---

### Final decision

> Driven by four product directives (2026-06-23): **(D1)** the developer never names a backend -- they call "do X", and we internally try the top-performance path, falling through if it is unavailable in this environment; **(D2)** keep explicit `fromX` AND add a universal `from(...)`; **(D3)** bundle size is not a primary constraint (<= ~500 kB JS glue is fine); **(D4)** load only what the developer actually calls (probe-only => ship only probe).

**Governing principle:** *Opaque capability ladder + lazily-loaded drivers behind a flat API.* The developer expresses **intent** (`probe`, `convert`, `trim`, ...); the engine owns **mechanism** (WebCodecs / GPU / WASM / TS) and **loading** (each op and each backend imports itself on first use). This single move satisfies D1-D4 together and retires the bundle-era complexity (the plugin builder as a bundle tool, and the preset bundles, are dropped).

**Status legend:** `[DECIDED]` locked · `[PROPOSED]` recommended default, needs confirm · `[OPEN]` placeholder, not yet decided.

#### 1. Developer Experience

**1.1 Importing & Injection (how the library is initialized)**

- `[DECIDED]` Zero backend config, ever: `const media = createMedia()`. The developer never chooses WebCodecs/WASM/GPU. A default singleton also backs bare `import { probe } from '@aibrush/media'` sugar.
- `[DECIDED]` Lazy loading is the init model. **JS** (kernel + op modules + TS containers + driver glue) goes through the developer's bundler: a tiny eager kernel (<= ~50 kB) loads immediately, unused ops are **tree-shaken out of the build entirely**, and used-but-deferred ops/drivers are **code-split behind dynamic `import()`** and fetched on first call. `probe()` pulls only kernel + probe + the matching parser (D3/D4). The ~500 kB budget covers **JS glue only**.
- `[DECIDED]` **WASM/worker binaries are NOT inlined into the JS bundle.** They ship inside the npm package and are emitted as **same-origin hashed assets by the dev's bundler** via `new URL('./x.wasm', import.meta.url)` + `WebAssembly.instantiateStreaming`, fetched **only on a hardware miss** -- so heavy codecs sit *outside* the JS budget and download only when actually used. No CDN, no manual copy step.
- `[DECIDED]` The capability/plugin builder is **retired as a bundle mechanism**; kept only as an optional hook to inject custom / third-party drivers.
- `[DECIDED]` Primary surface = the `createMedia()` instance; bare named-function sugar (`import { probe, convert } from '@aibrush/media'`, backed by a default instance) is also shipped.
- `[DECIDED]` WASM/worker delivery = **self-hosted, same-origin, no CDN.** *Why not a CDN:* browsers now partition the HTTP cache by top-level site, so cross-site CDN cache-sharing (its one real benefit) is gone -- leaving only its costs (third-party runtime dependency, CORS/CSP/COEP friction, JS/wasm version skew, privacy, offline breakage). Same-origin `import.meta.url` assets are bundler-native, version-pinned, offline-safe, and get `instantiateStreaming`. **Escape hatches (not defaults):** `inline: true` base64s a *small* module into its lazy chunk (+~33%, no streaming compile -- single-file / strict-CSP only, never the heavy tail); a prebuilt self-contained `dist/` covers no-bundler `<script>` users (who may put *that* on their own CDN if they wish). An `assetBaseUrl` override exists for custom asset paths. Either way: compiling wasm needs CSP `script-src 'wasm-unsafe-eval'`; wasm **threads** need COOP/COEP.
- `[DECIDED]` Warmup API = variadic `media.preload(...specs)`; each spec is a bare op string or `{ op, video?, audio?, container?, level? }`, where `level` is `'chunks' | 'compile' | 'ready'` (default `'compile'`). It prefetches the op/driver JS chunks, compiles the predicted wasm, and warms the capability probes so the first real call is near-instant. Returns a fire-and-forget `Promise`, accepts `{ signal }`, idempotent, best-effort (never throws). Explicit only -- no auto-warm in v1. Examples: `media.preload('probe')` · `media.preload({ op: 'convert', video: 'h264', container: 'mp4' }, { op: 'probe' })`.

**1.2 Function Calls (syntax for invoking core operations)**

- `[DECIDED]` Primary API = flat task functions: `media.probe / convert / remux / trim / mux / demux / decode / encode`. All async; all accept `{ signal, onProgress }`; all return a cancellable handle.
- `[DECIDED]` Backend selection is invisible to the call: each op runs the capability ladder internally (see Reference). A capability miss throws a typed `CapabilityError` -- never a silent degrade.
- `[DECIDED]` Low-level graph (`source/demux/decode/filter/encode/mux`) is the documented escape hatch; the declarative job spec is the worker/serialization boundary (internal).
- `[DECIDED]` Options are flat typed objects (e.g. `{ video: { codec } }`), not a string DSL.
- `[DECIDED]` Keep a hidden `{ strategy }` override (e.g. force a tier) for power users/tests -- not in the primary signature.
- `[DECIDED]` Fluent chain (`.load().trim().to()`) = **post-v1 additive sugar**, built as a thin façade over the declarative job (one execution path). Deferred because it is non-breaking to add later; v1 ships flat tasks + low-level graph + declarative job, which already cover all capability. Build trigger: flat-task API + naming validated, job schema stable, real multi-step usage observed.
- `[DECIDED]` Naming: primary verbs are **`convert`** (produce output / re-encode) and **`probe`** (read media info). `convert` *auto-routes copy-vs-re-encode* (remux when the source already matches the target, else re-encode) -- it expresses intent, not mechanism, which is why it beats `transcode`; `remux` stays as the explicit copy-only op, and `transcode` is accepted as an alias of `convert`. Rejected `inspect`/`metadata` for the read op (`probe` is the established media term; `metadata` is a noun, `inspect` is overloaded).

**1.3 Data Handling (passing file bytes or HTML tags)**

- `[DECIDED]` Operations accept media directly: bytes (`ArrayBuffer`/`TypedArray`), `Blob`/`File`, URL string, `ReadableStream`, `MediaStream`, `HTMLMediaElement`.
- `[DECIDED]` `from(input, opts?)` universal normalizer ships (verdict: achievable) over canonical `fromBytes / fromBlob / fromURL / fromElement / fromStream / fromOPFS`; web-streams used internally for bounded memory on large files.
- `[DECIDED]` `<video>`/`<audio>` input defaults to **bytes** mode (read `currentSrc`); probe never uses `loadedmetadata` (600-7000x slower) [data].
- `[DECIDED]` Bare-string `from('...')` = URL by precedence (`http(s) | blob | data | file` -> URL; other relative -> URL via `fetch`); OPFS paths must use `fromOPFS()`; otherwise throw `InputError`.
- `[DECIDED]` Output defaults: element sink = **Blob URL** for a whole-file result, **MSE** `SourceBuffer` append when the sink is a streaming target; stream sinks are **lazy** (pull-based, produced on demand for bounded memory). Overridable per call via `toElement(el, { via })`.
- `[DECIDED]` Output-sink names = `toBlob / toFile / toStream / toElement / toOPFS` (mirrors the `fromX` source set).

#### 2. Framework Architecture (internal structure)

- `[DECIDED]` Core = **ARCH-1** layered capability router + drivers; drivers are lazily imported **by the router**, not registered by the developer.
- `[DECIDED]` Runtime = **ARCH-4** worker-first for heavy ops, with a main-thread fast path for cheap probes; a small **ARCH-2** graph is the internal executor for multi-stage jobs.
- `[DECIDED]` **ARCH-3** monolith is the acceptable Phase-1 MVP; refactor into ARCH-1 once a 2nd/3rd driver lands -- the public DX does not change.
- `[DECIDED]` The capability ladder is seeded from the 558-feature benchmark (see Reference) and refined later by telemetry.
- `[DECIDED]` `determinism` default = `'auto'` (hardware allowed); `'force-software'` for cross-machine goldens [data: hardware decode is platform-specific].
- `[DECIDED]` Worker default = on for heavy ops, off for probe/metadata.
- `[DECIDED]` Driver-interface contracts (`CodecDriver` / `ContainerDriver` / `FilterDriver`) + supporting streaming/lifecycle/error types and a `DRIVER_API_VERSION` semver policy for third-party drivers -- drafted as **v1** (see Reference: *Driver-interface contracts (v1)*).
- `[OPEN]` Cost-aware tier thresholds (skip worker/wasm spin-up for tiny inputs) -- defer to telemetry after Phase-1.

#### Cross-cutting (applies to all of the above)

- `[DECIDED]` Every op is cancellable via `AbortSignal` and streams `onProgress`.
- `[DECIDED]` Strict internal validation: gate ourselves with bit-exact / structural self-tests; do **not** emulate the 3 SUSPECT shortcut "wins" or trust the 206 WEAK-GATE oracles [data].
- `[DECIDED]` Implementation language = **TypeScript** (strict mode), shipped as **ESM JS + `.d.ts`** declarations; only the codec cores are C/Rust -> wasm (with TS bindings). The public API uses options objects, not positional/keyword args -- JS/TS has no named arguments.

---

#### Reference (kept from analysis -- backs the decisions above)

**Capability ladder (seeded from the benchmark; top = tried first):**

| Operation | Strategy ladder | Capability probe |
|---|---|---|
| probe / metadata | TS header reader (range/bytes) | always -- never `<video>` [data] |
| demux | TS streaming demuxer -> lazy wasm demuxer | container recognized? |
| mux / remux / trim (copy) | TS muxer / packet-copy -> lazy wasm | container supported? |
| decode (video/audio) | WebCodecs hw -> WebCodecs sw -> lazy wasm decoder | `*Decoder.isConfigSupported` |
| encode (video/audio) | WebCodecs hw -> WebCodecs sw -> lazy wasm encoder | `*Encoder.isConfigSupported` |
| video filter (resize/crop/rotate/pad/flip/colorspace/tonemap) | WebGPU -> WebGL -> Canvas2D -> lazy wasm libavfilter | `navigator.gpu` / WebGL ctx |
| audio convert (format/endianness/gain/mix/downmix/fade) | TS / AudioWorklet | always (cheap) |
| audio resample | WebAudio `OfflineAudioContext` -> lazy wasm soxr | target rate supported? |
| decrypt (CENC/HLS) | WebCrypto + TS box parse | `SubtleCrypto` present |

**Public surface (final shape):**

```ts
import { createMedia } from '@aibrush/media'   // tiny kernel only
const media = createMedia()                    // zero backend config, ever

const info = await media.probe(input)          // loads only: kernel + probe + matching parser
const out  = await media.convert(input, {    // router: WebCodecs -> ... -> wasm, all internal
  to: 'mp4', video: { codec: 'h264', width: 1280 }, audio: { codec: 'aac' },
}, { signal, onProgress })                      // every op: cancellable + progress
```

**Internal flow:**

```text
media.convert(input, opts)
  -> kernel: normalize(from) -> plan stages
     -> router.pick(stage): walk ladder -> first capability-probe pass
        -> await import(driver)   // op chunk + chosen backend, miss-only wasm
           -> execute in Worker (heavy) | main thread (cheap) -> Source/Sink
```

---

##### Driver-interface contracts (v1) -- the kernel/backend boundary

All backends implement one of three contracts so the router can treat them uniformly (try hardware, fall back to wasm, etc.). Streaming uses web `TransformStream`s, so backpressure, cancellation (via `signal`), and error propagation come for free -- and the stream *is* the decoder/demuxer lifecycle (configure on start, flush on close). Encoded units and raw frames are the native WebCodecs types, so a demuxer's output feeds a decoder directly.

**Versioning / semver policy (for third-party drivers):**

- The driver API has its **own integer major** (`DRIVER_API_VERSION`), decoupled from the library's public semver. Each driver declares the version it targets; on registration the core verifies compatibility and otherwise refuses with `MediaError{ code: 'driver-incompatible' }` (a clear error, not a later crash).
- **Major (breaking):** remove/rename a method, change a signature, narrow a type, or change the lifecycle/ordering contract -- third-party drivers must update.
- **Minor (additive):** a new *optional* method/field, a new `Tier`/substrate value, a new `FilterSpec` variant -- old drivers keep working.
- **Patch:** behavioral clarification, no shape change.
- The core supports the current and previous major (`N`, `N-1`) via an internal shim for a 2-minor deprecation window. First-party drivers move in lockstep with the core; this policy exists for third parties.

```ts
// ---- versioning ----
export const DRIVER_API_VERSION = 1 as const

// ---- shared ----
export type Tier = 'hardware' | 'gpu' | 'native' | 'wasm'   // ranking order, best first
export type MediaType = 'video' | 'audio'

export interface StageOptions {
  signal?: AbortSignal
  onProgress?: (p: Progress) => void
  determinism?: 'auto' | 'force-software'      // force-software drops the hardware/gpu tiers
}
export interface Progress { done: number; total?: number; stage: string }

// WebCodecs-native units flow across the seams:
export type EncodedChunk = EncodedVideoChunk | EncodedAudioChunk   // container <-> codec
export type RawFrame     = VideoFrame | AudioData                  // codec <-> filter

export interface DriverBase {
  readonly id: string          // unique, e.g. 'webcodecs-video', 'wasm-flac', 'mp4'
  readonly apiVersion: number  // = DRIVER_API_VERSION it was built against
}

// ---- error model ----
export type MediaErrorCode =
  | 'capability-miss'     // no eligible driver for op + codec + env
  | 'unsupported-input'   // garbled / empty / unknown source
  | 'decode-error' | 'encode-error' | 'demux-error' | 'mux-error'
  | 'aborted'             // signal aborted
  | 'driver-incompatible' // apiVersion mismatch at registration
export class MediaError extends Error {
  constructor(readonly code: MediaErrorCode, message: string, readonly detail?: unknown) { super(message) }
}
export class CapabilityError extends MediaError {}   // 'capability-miss'; detail carries { op, tried[] }
export class InputError extends MediaError {}        // 'unsupported-input'

// ---- 1) CodecDriver: decode/encode one codec ----
export type DecoderConfig = VideoDecoderConfig | AudioDecoderConfig   // WebCodecs-native
export type EncoderConfig = VideoEncoderConfig | AudioEncoderConfig
export interface CodecQuery { mediaType: MediaType; direction: 'decode' | 'encode'; config: DecoderConfig | EncoderConfig }
export interface CodecSupport { supported: boolean; hardwareAccelerated?: boolean; reason?: string }

export interface CodecDriver extends DriverBase {
  readonly kind: 'codec'
  readonly tier: Tier
  supports(q: CodecQuery): Promise<CodecSupport>                                  // wraps isConfigSupported
  createDecoder(c: DecoderConfig, o?: StageOptions): TransformStream<EncodedChunk, RawFrame>
  createEncoder(c: EncoderConfig, o?: StageOptions): TransformStream<RawFrame, EncodedChunk>
}

// ---- 2) ContainerDriver: demux/mux one container family ----
export interface ByteSource { stream(): ReadableStream<Uint8Array>; size?: number; range?(start: number, end: number): Promise<Uint8Array> }
export interface ContainerQuery { direction: 'demux' | 'mux'; mime?: string; extension?: string; head?: Uint8Array /* magic bytes */ }
export interface TrackInfo {
  id: number; mediaType: MediaType; codec: string; durationSec?: number
  config?: DecoderConfig            // video: coded dims/rotation/fps; audio: sampleRate/channels
}
export interface Demuxer {
  readonly tracks: readonly TrackInfo[]
  packets(trackId: number): ReadableStream<EncodedChunk>   // lazy, per-track
  close(): Promise<void>
}
export interface MuxOptions { faststart?: boolean; fragmented?: boolean }
export interface Muxer {
  readonly output: ReadableStream<Uint8Array>
  addTrack(info: TrackInfo): number
  write(trackId: number, chunk: EncodedChunk): Promise<void>
  finalize(): Promise<void>
}
export interface ContainerDriver extends DriverBase {
  readonly kind: 'container'
  readonly formats: readonly string[]                      // e.g. ['mp4','mov']
  supports(q: ContainerQuery): boolean                     // sync: mime / extension / magic
  demux(src: ByteSource, o?: StageOptions): Promise<Demuxer>
  createMuxer(o?: MuxOptions): Muxer
}

// ---- 3) FilterDriver: transform frames ----
export type FilterSpec =
  | { mediaType: 'video'; type: 'resize'; width: number; height: number; fit?: 'contain' | 'cover' | 'fill' }
  | { mediaType: 'video'; type: 'crop'; x: number; y: number; width: number; height: number }
  | { mediaType: 'video'; type: 'rotate'; degrees: 0 | 90 | 180 | 270 }
  | { mediaType: 'video'; type: 'flip'; axis: 'h' | 'v' }
  | { mediaType: 'video'; type: 'colorspace'; to: string }
  | { mediaType: 'video'; type: 'tonemap'; to: 'sdr' }
  | { mediaType: 'audio'; type: 'resample'; sampleRate: number }
  | { mediaType: 'audio'; type: 'remix'; channels: number }
  | { mediaType: 'audio'; type: 'gain'; db: number }
export interface FilterDriver extends DriverBase {
  readonly kind: 'filter'
  readonly substrate: 'webgpu' | 'webgl' | 'canvas2d' | 'wasm'
  supports(f: FilterSpec): boolean
  createFilter(f: FilterSpec, o?: StageOptions):           // matches the spec's mediaType
    | TransformStream<VideoFrame, VideoFrame>
    | TransformStream<AudioData, AudioData>
}

// ---- registration (how the router lazy-loads a driver module) ----
export interface Registry {
  addCodec(d: CodecDriver): void
  addContainer(d: ContainerDriver): void
  addFilter(d: FilterDriver): void
}
export interface DriverModule {
  readonly apiVersion: number   // checked against DRIVER_API_VERSION at registration
  register(reg: Registry): void // adds this module's drivers
}
// A lazily-imported driver chunk default-exports a DriverModule.
```

- **Router behavior:** rank `CodecDriver`s by `tier` (hardware -> gpu -> native -> wasm), call `supports()` top-down, pick the first `supported`, cache the verdict, and lazy-import that driver's module; `determinism: 'force-software'` removes the hardware/gpu tiers. Container drivers match synchronously by mime/extension/magic; filter drivers by `FilterSpec`.
- **Lifecycle / cancellation / errors ride the streams:** aborting `signal` cancels the readable/writable; failures reject as `MediaError`; closing the writable flushes (encoder/muxer `finalize`).
- This is **v1** of the contract; it evolves only under the semver policy above.
