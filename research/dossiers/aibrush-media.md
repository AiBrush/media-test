# Dossier — `aibrush-media` (PLACEHOLDER / stub adapter)

> **Status: PLACEHOLDER. No public package, no public docs, no shipped browser engine.**
> `aibrush-media` is the **internal future candidate** the whole suite exists to evaluate (the
> "optimize / adopt / skip" decision). It does **not** exist as a browser media engine today.
> This dossier is intentionally a stub: it records that the library is not yet real, declares
> **zero capabilities**, and does **not invent an API**. When the real library ships, replace this
> dossier (and the adapter) with researched, version-pinned facts exactly like any other engine.

- **Engine id (current):** `aibrush-media@dev`
- **Latest version:** n/a — not published. There is no npm package, no GitHub repo, and no
  documentation for a browser media-processing library named `aibrush-media`, `@aibrush/media`, or
  `aibrush/media` (verified June 2026, see Research log below).
- **Kind (orientation only, per `test-instructions.md` §1):** "future candidate — placeholder
  adapter today; no capabilities until built."
- **Adapter file in the repo:** `src/engines/aibrush-media/adapter.ts` (already present as a stub;
  `capabilities()` returns all-empty, every operation method throws `NOT_IMPLEMENTED`, and
  `registerAibrushMedia()` is called by app wiring so the placeholder appears in the matrix as
  explicit `NA_ENGINE` coverage instead of being silently omitted).
- **Researched on:** 2026-06-17.

---

## 0. Why this dossier is a stub (and what that means for the suite)

`test-instructions.md` is explicit and consistent on three points:

- §1 framework table: `aibrush-media` → *"placeholder adapter today; no capabilities until built."*
- §13 Definition of done: *"…aibrush-media (stub) — each with honest `capabilities()`."*
- §15 research-first rule: *"Do not code a framework's API from memory"* and *"the honest limits
  (what it genuinely cannot do → declare `NA`, render `-`)."*

Because nothing about the library is published, the **only honest research output** is: the library
does not exist yet as a browser engine, so it supports **nothing** and every Appendix A row resolves
to `NA(engine)` → rendered `-` in the report. Declaring any operation, container, codec, or
fast-path here would be **fabrication** (forbidden by §0.6 "Never fabricate" and §14). Therefore the
adapter declares an empty `CapabilitySet`, the runner negotiates `NA(engine)` for every scenario, and
no method is ever invoked.

This is a *deliberate, valuable* state: the placeholder appears in the matrix as a **real,
not-yet-capable engine** (a visible, honest gap) rather than a silent omission. When the real
implementation lands, flipping capabilities on (with oracle-validated functionality) makes the entire
existing scenario battery + report machinery measure it with **zero scenario changes** (§4
"Adding a framework").

---

## 1. Latest version

**n/a (unpublished).** No release exists to pin. The repo's stub uses the sentinel id
`aibrush-media@dev` (see `src/engines/aibrush-media/adapter.ts`, constant `ENGINE_ID`). When the
library ships, bump this to a real semver such as `aibrush-media@0.1.0` and re-run the §15 research
pass against its actual README / API reference / changelog.

---

## 2. Recommended API per operation

**No API is documented or invented.** Every operation is **undeclared** today; the adapter throws
`"aibrush-media@dev: aibrush-media not yet implemented (placeholder adapter)"` if called (it never is,
because `capabilities().operations` is empty and the runner gates on declaration).

| Operation (`engine.ts` `Operation` union) | Recommended API today | Resolves to |
| --- | --- | --- |
| probe        | **NA** — not implemented | `NA(engine)` → `-` |
| demux        | **NA** — not implemented | `NA(engine)` → `-` |
| decode (`decodeFrames`) | **NA** — not implemented | `NA(engine)` → `-` |
| encode (via `transcode`/`mux`) | **NA** — not implemented | `NA(engine)` → `-` |
| remux        | **NA** — not implemented | `NA(engine)` → `-` |
| transcode    | **NA** — not implemented | `NA(engine)` → `-` |
| trim         | **NA** — not implemented | `NA(engine)` → `-` |
| mux          | **NA** — not implemented | `NA(engine)` → `-` |
| decrypt      | **NA** — not implemented | `NA(engine)` → `-` |
| seek         | **NA** — not implemented | `NA(engine)` → `-` |

> When real: research each op against the library's own docs and record the exact recommended call,
> mirroring the `MediaEngine` contract in `src/core/engine.ts`
> (`probe / demux / remux / transcode / decodeFrames / seek / trim / mux? / decrypt?`).

---

## 3. Documented BEST-PERFORMANCE path (§0.9)

**None — there is nothing to optimize and nothing to measure.** Per §0.7/§8.4 the timed window only
ever wraps an operation; since no operation is implemented, there is no `configUsed` to record. A
placeholder is **never benchmarked** (§0.1: correctness gates the number; with no PASS there is no
admissible value). The structured `bestPath` field below is therefore an all-empty/`n/a` object, not
a guess.

> When real: research and record the framework's *own-docs-endorsed* fastest configuration —
> hardware WebCodecs over software, WebGPU > WebGL > 2D-canvas/CPU for scale/color/pixel work,
> multi-threaded WASM (if it ships one), streaming/pipelined over batch, Worker offload, tuned
> `encodeQueueSize`/`decodeQueueSize`, transferable/zero-copy buffers, progressive HTTP-Range reads —
> then surface it as `configUsed` (§8.5). It must be a path the docs sanction (§0.9 guard-rail a) and
> still pass the same oracle (guard-rail b).

---

## 4. Required headers / flags / Worker setup

**None today.** The stub needs no `init()` (nothing to load), spawns no Worker, requires no
COOP/COEP, `SharedArrayBuffer`, or browser flags. The suite-wide dev-server headers
(COOP: same-origin + COEP: require-corp, per §8.5, which unlock cross-origin isolation and
`SharedArrayBuffer` for the mt-WASM engines) are set uniformly for all engines and cost this
placeholder nothing.

> When real: record exactly which of these the library *requires* for its best path (e.g. needs
> `SharedArrayBuffer`/COOP+COEP for a multi-threaded WASM core, runs in a Worker, needs a browser
> flag for an experimental codec). Per §8.5 such requirements are *recorded honestly*, never hidden.

---

## 5. How to VENDOR it locally (§0.8)

**Nothing to vendor.** There is no package to `bun add`, no `.js`/`.wasm` core to copy into a
`vendor/` dir, and no run-time fetch of any kind. The placeholder is pure local TypeScript
(`src/engines/aibrush-media/adapter.ts`) with no external bytes — it is already fully hermetic and
offline.

> When real: install via `bun add <real-pkg>` (bun-only, §0.5), then serve every runtime artifact
> (its bundle, any `.wasm`/worker `.js`) from the **local origin** out of `node_modules/` or a
> committed-by-reference `src/engines/aibrush-media/vendor/` directory. **No CDN/unpkg/`toBlobURL`
> from the internet at run time** (§0.8). Pin + record the vendored paths in each run's `env`.

---

## 6. Honest limits (these become `NA(engine)` → `-`)

The library cannot do **anything** in the browser today. Concretely, every Appendix A capability is
unavailable:

- Cannot probe / extract metadata.
- Cannot demux / iterate packets.
- Cannot decode frames; cannot seek.
- Cannot encode / transcode / remux / trim / mux.
- Cannot decrypt (CENC ctr/cbcs, HLS AES-128, ClearKey).
- Cannot read or write any container (in or out).
- Cannot decode or encode any video or audio codec.
- No metadata read/write, no subtitles/data tracks.
- No streaming/fragmented/CMAF/fastStart output modes.
- No video/audio transforms (resize/rotate/flip/crop/fps/color/HDR/alpha/fan-out/resample/ch-mix).
- No edge-case handling claims (it is never invoked, so it neither passes nor crashes — it is `NA`).

Distinction (§0.6): every cell is `NA(engine)` ("the framework can't"), **never** `NA(browser)`.
The browser is irrelevant here because the engine itself declares no capability to gate.

---

## 7. Appendix A coverage (A.1–A.16)

**Supported rows: none.** Every row resolves to `NA(engine)` → `-` because `capabilities()` declares
nothing and the runner never invokes a stub method. Listed per-row so the assessment is exhaustive
and explicit:

| Appendix A row | Coverage | Note |
| --- | --- | --- |
| A.1 Input sources & reading modes | `-` NA(engine) | no probe/demux to exercise any source/reading mode |
| A.2 Containers — READ (demux/probe) | `-` NA(engine) | `containersIn: []` |
| A.3 Containers — WRITE (mux) | `-` NA(engine) | `containersOut: []` |
| A.4 Video codecs — DECODE | `-` NA(engine) | `videoCodecs: []`; no `decodeFrames` |
| A.5 Video codecs — ENCODE | `-` NA(engine) | `videoCodecs: []`; no `transcode`/`mux` |
| A.6 Audio codecs — DECODE & ENCODE | `-` NA(engine) | `audioCodecs: []` |
| A.7 Core operations (probe/demux/decode/seek/remux/transcode/trim/mux/extract-audio/decrypt/thumbnail/fragmentation) | `-` NA(engine) | `operations: {}` — every core op undeclared |
| A.8 Video transforms (resize/rotate/flip/crop/fps/color/HDR/alpha/fan-out) | `-` NA(engine) | no `transcode`; `features: []` (no resize/rotate/alpha/fanout) |
| A.9 Audio transforms / DSP (resample/ch-mix/PCM convert/gain/fade) | `-` NA(engine) | no audio op declared |
| A.10 Output / streaming modes (buffer/streaming/CMAF/fastStart/tiny-chunk/MSE) | `-` NA(engine) | no output op; `features: []` (no fragmented/fastStart:reserve) |
| A.11 Metadata / tags / structure (read + write tags, rotation, chapters, edit lists, track select) | `-` NA(engine) | no probe; `features: []` (no metadata:write) |
| A.12 Encryption / DRM (CENC ctr/cbcs, HLS AES-128, ClearKey, untouched-negative) | `-` NA(engine) | `encryption: []`; no `decrypt` |
| A.13 Subtitles / text / data tracks | `-` NA(engine) | no read/write text or data-track op |
| A.14 Performance dimensions (ops/s, packets/s, fps, seek ms, ttf, load/init, peak-mem, longtask, bundle-size, range-fetches) | `-` NA(engine) | never benchmarked; no PASS, so no admissible perf number (§0.1). Even `load/init time` is ~0 (nothing to load) but a placeholder does not contest the case. |
| A.15 Developer / platform aspects (TS types, zero-deps, tree-shakeable, Worker, SAB/COOP+COEP, hw-accel, WebGPU/WebGL, license) | unknown / not-yet-applicable | the stub is TS with zero deps and needs no Worker/SAB, but these describe the *placeholder*, not a real product; record real values when the library ships |
| A.16 Deep edge cases + metamorphic invariants | `-` NA(engine) | never invoked → neither graceful nor crash; `NA`, not a robustness data point |

---

## 8. Research log (sources)

Verified that no public browser media library by this name exists (June 2026):

- npm/web search for `aibrush-media` (WebCodecs/browser media library): **no package by that exact
  name**; results were unrelated libraries (mediabunny, web-demuxer, libav.js-webcodecs, etc.).
- Web search for `"aibrush/media"` / `"@aibrush/media"` JavaScript library: **no matching npm
  package, GitHub repo, or library docs.** The only `aibrush.co` hit is **AiBrush Studio**
  documentation (`https://docs.aibrush.co/`), an AI media-*creation product* — **not** a browser
  media-processing/demux/transcode library — so it does not provide an API to adapt.
- Local install check: no `node_modules/aibrush-media` and no `@aibrush` scope installed; `bun pm ls`
  shows no aibrush dependency.

Reference doc URLs (for context only; none describe a usable browser engine API):

- AiBrush Studio docs (product, not a library): <https://docs.aibrush.co/>
- MDN WebCodecs (the API a future real engine would build on): <https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API>
- Mediabunny (the suite's reference engine, for comparison of what a real dossier contains): <https://mediabunny.dev/>

Internal references in this repo (authoritative for the placeholder's intended shape):

- `test-instructions.md` §1 (framework table), §13 (DoD), §15 (research-first), Appendix A.1–A.16.
- `src/engines/aibrush-media/adapter.ts` (existing stub: empty `capabilities()`, throwing methods,
  opt-in `registerAibrushMedia()`).
- `src/core/engine.ts` (the `MediaEngine` / `CapabilitySet` contract a real version must implement).

---

## 9. When the library becomes real — the upgrade checklist

1. Re-run the §15 research pass against the library's **current** README / API reference / changelog;
   pin the **latest version** and replace `aibrush-media@dev` with the real semver id.
2. Fill `capabilities()` **honestly** with canonical tokens (`engine.ts` `CANONICAL_*`) — only for
   operations/containers/codecs/features that pass an oracle.
3. Implement `init()`/`dispose()` for any one-time load (WASM compile, Worker spawn, encoder warmup)
   so it stays **outside** the timed window (§0.7).
4. Vendor every runtime artifact locally (§0.8); no run-time CDN.
5. Determine and record the **own-docs-endorsed fastest path** as `configUsed` (§0.9/§8.5).
6. Note honest limits → they remain `NA(engine)`.
7. Update **this dossier** and the structured object with real, cited facts; rewrite Appendix A
   coverage from `-` to measured `PASS`/value where earned.
8. Call `registerAibrushMedia()` (or wire it into `src/app/register.ts`) so it enters runs, then let
   the existing battery + report machinery measure it with zero scenario changes.
