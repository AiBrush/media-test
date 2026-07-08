# Download real per‑scenario test media

**Goal:** give each test scenario **multiple real, internet‑sourced media files** so the
benchmark stops being overfit to one baked fixture per case.

Read this whole document before touching anything. Work is resumable and idempotent — you
are expected to run for a long time, in batches, and pick up where you left off.

---

## 1. Why we are doing this

Today every scenario runs against exactly **one** fixture (`ScenarioSpec.input` → one asset in
`fixtures/manifest.json` → one file under `fixtures/media/<id>`). A framework can look good or bad
purely because of the quirks of that single file. That is overfitting.

We want each scenario to run against **several independent real files that are natively in the
format the scenario requires**. Then a later change (out of scope here — do **not** build it) will
have the runner pick a file at random per run. If the frameworks are honest, the pass/fail verdict
and the performance metrics should be *stable across the different files* for a given scenario. If a
framework only handles our one baked file, the extra files will expose it.

Your job in this task is **only the download + placement + provenance**. Do not change the runner,
the scenario specs, the oracles, or the manifest schema. (See §9 for the downstream implications you
should record but must not implement.)

---

## 2. The one hard rule: no local format manipulation

A file placed for a scenario must **already be, as downloaded from the internet, in the exact
container + codec the scenario requires.** You may **not** create the fit by transcoding,
remuxing, re‑encoding, re‑wrapping, trimming, editing headers, encrypting, or corrupting bytes
locally. If the internet does not have the file in that exact shape, that scenario does not get a
downloaded file — see §5.

What you **may** do locally:

- **Download** a file as‑is.
- **Copy** one downloaded file into multiple scenarios (reuse is encouraged — see §6).
- **Probe / read** a file (ffprobe, `mediainfo`, byte inspection) to *verify* its real format and to
  record metadata. Probing is read‑only and always allowed.
- **Hash** a file (sha256) and record its size.
- **Rename** a file (renaming does not change bytes or format).

If you ever feel the urge to run `ffmpeg -i in … out`, stop: that is manipulation and is forbidden
for producing a scenario file.

**One carve‑out — the `encryption` family only.** Encryption is the single transformation that
*cannot* exist as an honest download (a real file is not natively encrypted with our known keys), so
for the `encryption` family — and **only** that family — you **may** manipulate locally: take a
**real downloaded cleartext** file and encrypt it locally to produce the fixture (see §5d). This
carve‑out does **not** extend to the `robustness` family or to any other corruption / fuzz /
re‑encode / remux: those stay strictly no‑manipulation.

---

## 3. Ground truth: how a scenario declares what it needs

Scenarios are pure declarations in `src/scenarios/**`, flattened into one authoritative array.

- **Enumerate every scenario** by importing the registry, not by scraping. Write a small throwaway
  Bun/TS script (delete it when done, or keep it under `scripts/` if useful) that does:

  ```ts
  import allScenarios from '../src/scenarios/index.ts'; // default export = Scenario[]
  // each s: { id: 'family/name', op, input: string | string[], requires, family, options, ... }
  ```

  This is the single source of truth for the scenario list (~558 scenarios today). Do **not** derive
  the list from `docs/report/_scenarios.ndjson` — that file has ids but not the `requires`/`input`
  you need.

- **What each scenario requires** lives in `s.requires` (`src/core/scenario.ts` → `interface
  Requires`): `operations`, `containersIn`, `containersOut`, `videoCodecs(In/Out)`,
  `audioCodecs(In/Out)`, `encryption`, `features`. For a *download* you care about the **input/read
  side**: `containersIn`, `videoCodecsIn ?? videoCodecs`, `audioCodecsIn ?? audioCodecs`,
  `encryption`, and relevant `features`.

- **The concrete shape of the current file** is in `fixtures/manifest.json`. Join
  `s.input` (an asset **id**, which is also the filename under `fixtures/media/`) to its manifest
  entry to read `container`, `codecs[]`, `sizeBucket`, `source`, and `notes`. The manifest entry is
  the most precise description of what "a file that fits this scenario" means — match it.

- **Where files are served from at runtime:** `src/core/runner.ts` fetches assets from
  `/fixtures/media/<id>` (`FIXTURES_MEDIA_BASE = '/fixtures/media'`). Your new files live under
  `fixtures/media/scenarios/…` (see §7); the runner does not read them yet, and wiring that up is
  out of scope.

**Build a join table first.** Before downloading anything, produce
`fixtures/media/scenarios/_plan.ndjson`, one row per scenario:

```json
{"id":"probe/aac_adts_probe","family":"probe","input":"aac_adts.aac",
 "container":"aac","videoCodecs":[],"audioCodecs":["aac"],
 "encryption":null,"features":[],"sizeBucket":"tiny","source":"generated",
 "class":"REAL","target":3,"reason":"standard ADTS AAC exists in the wild"}
```

The `class`/`target`/`reason` fields come from §5. This plan is your worklist and your resume
ledger.

---

## 4. What "a fitting file" means (matching rules)

A downloaded candidate **fits** a scenario only if a read‑only probe confirms **all** of:

1. **Container** equals the required container (`containersIn` / manifest `container`). `mp4` and
   `mov` are distinct — match the one declared. `m4a` is the audio‑only MP4 brand; do not substitute
   a video MP4.
2. **Every required codec is present** and **no forbidden extra stream** violates the scenario
   intent. If the scenario is audio‑only (`aac_audio_only`, `*.m4a`, `*.wav`, `*.mp3`, `*.flac`,
   `opus.ogg`), the file must have **no video track**. If it is video, the declared video codec must
   match (`h264`/`avc`, `hevc`/`h265`, `vp8`, `vp9`, `av1`) and the audio codec (if the scenario
   declares one) must match.
3. **Profile/feature constraints**, when the scenario is *about* them, must hold **natively**:
   e.g. `h264_10bit_*` → the download must genuinely be 10‑bit; `h264_bframes_*` → must contain
   B‑frames; `h264_open_gop_*` → open GOP; `*_rotated90` → real rotation matrix; `video_240fps` →
   real 240 fps; HDR/PQ, VP9 alpha, VFR, gapless, multitrack, 5.1/6ch, s24/f32 PCM, etc. If you
   cannot verify the feature by probe, the candidate does **not** fit (see §5 — most of these end up
   NON‑DOWNLOADABLE).
4. **Size band**, when the scenario is size‑sensitive (`sizeBucket` of `large`/`huge`/`massive`, or
   families `performance`/size‑ladder cases), should land in the same bucket order of magnitude as
   the manifest entry. For `micro`/`tiny`/`small` probe/demux cases, size is not critical — favor
   small files to keep the corpus lean.
5. **Duration**, when the scenario name encodes it (`*_5s`, `*_30s`, `*_120s`, `longform_1h`,
   `*_2h`), should be in the same ballpark. Do not fabricate duration by trimming — find a real file
   of roughly that length, or treat as NON‑DOWNLOADABLE if none exists.

If a candidate fails any check, discard it. **Never** "fix" it locally.

---

## 5. Scenario classification (the realistic scope)

Not every scenario can have honest real downloads. Classify **every** scenario in `_plan.ndjson`
into exactly one class. Default policy (override only if the repo owner tells you otherwise — see the
banner in §11):

### 5a. `REAL` — download 3 real files

The format occurs naturally on the internet and can be verified by probe. Target **3 distinct**
files (different provenance/source, ideally different creators/scenes so they are genuinely
independent, not three encodes of the same clip). Families/inputs typically here:

- `probe`, `demux`, `metadata`, `audio-dsp`, most `decode-seek`, most `performance` on standard
  inputs.
- Standard containers/codecs: MP4 (h264/aac), MOV (h264/aac), WebM (vp8/vp9/av1 + opus/vorbis),
  MP3, WAV (PCM s16/s24/f32, mono/stereo/5.1), FLAC, Ogg/Opus, ADTS AAC, m4a (aac), TS (h264).
- `remux`/`transcode`/`trim` **input** side (the *input* just needs to be a real file in the input
  format; the operation's output shape is produced by the engine under test at runtime, not by you).

### 5b. `SYNTHETIC` — do **not** download; keep the existing baked fixture

No honest internet download can exist because the file's defining property is something only local
manufacturing produces. Leave these on their current single baked fixture. Record them in the plan
with `class:"SYNTHETIC"`, `target:0`, and a `reason`. This covers:

- **Robustness family** — every bitflip/truncation/zeroed‑span/headerless/fuzz/`mislabeled`/
  `zero_length`/`empty_*` case. These are deliberate corruptions of a known-good file.
- **Crafted exotics baked to hit one property that real media rarely isolates** — only mark these
  SYNTHETIC if §4/§5a search genuinely fails. Try REAL first for: 10‑bit, HDR10/PQ, VP9 alpha,
  `video_1x1`/`video_2x2`, `micro_*_1frame`, `240fps`, open‑GOP, VFR. If after a real search you
  cannot find and *probe‑verify* a native example, downgrade to SYNTHETIC and say so in `reason`.

### 5c. `STREAMING` — special‑case, usually treat as SYNTHETIC

HLS/DASH scenarios (`hls_vod*`, `.m3u8` + `.ts` segment sets, `fragmented_cmaf`) require a
playlist + matching segment set. You may only use one if you can download the **whole** playlist and
its segments unmodified as a coherent set (e.g. an archived test stream). Assembling or renumbering a
playlist locally is manipulation → then it is SYNTHETIC. Default: SYNTHETIC unless a wholesale real
set is downloadable.

### 5d. `DERIVED` — encryption family: download a real cleartext, then encrypt it locally

This is the **only** class where local manipulation is allowed, and it applies to the **`encryption`
family only** (CENC `cenc`/`ctr`/`cbcs`/`cens`, HLS AES‑128, SAMPLE‑AES — asset ids `cenc_*`,
`hls_aes128*`, `hls_sample_aes*`). The de‑overfitting goal still holds: the **plaintext base must be
a real internet download**, not a synthetic clip. You are only permitted to add the encryption layer
locally, because that layer cannot be downloaded.

Per `DERIVED` scenario, `target:3`. For each of the 3:

1. **Get a real cleartext base** in the scenario's required *input* container/codec, using the exact
   §5a `REAL` pipeline (search → probe‑verify → pool). CENC scenarios need a real progressive
   **MP4 (h264/aac)**; HLS AES‑128 / SAMPLE‑AES need real **TS (h264)** (or the source the playlist
   is cut from). Three independent real bases → three genuinely independent encrypted variants.
2. **Encrypt locally**, reproducing the scheme the existing fixture documents. The current fixtures
   were made with ffmpeg — read each asset's `genMethod` in `fixtures/manifest.json` for the exact
   recipe and mirror it. As reference:
   - **CENC AES‑CTR:** `ffmpeg -i <clear> -encryption_scheme cenc-aes-ctr -encryption_key <hex>
     -encryption_kid <hex> -c copy <out.mp4>` (see `cenc_ctr.mp4`'s `genMethod`).
   - **CENC cbcs / cens:** the corresponding `cenc-aes-cbc`/pattern scheme (see `cenc_cbcs.mp4`).
   - **HLS AES‑128:** `ffmpeg … -hls_key_info_file <keyinfo> -f hls …` producing encrypted `.ts`
     segments + `.m3u8` + key (see `hls_aes128.m3u8`'s `genMethod`).
   - Use **known, self‑generated keys/KIDs/IVs** — do not reuse the exact bytes of the existing
     goldens; each derived file gets its own recorded key material.
   Encrypting with `-c copy` (no re‑encode of the elementary streams) is the intent: you add the
   encryption layer, you do not transcode the media. Do **not** apply any *further* mutation
   (bitflip/truncate/zero‑span) — those encrypted‑then‑corrupted variants (`cenc_ctr_senc_bitflip`,
   `cenc_ctr_protection_zeroed`, `cenc_ctr_truncated_mdat`, …) are corruption, so they stay
   `SYNTHETIC` (§5b) on their existing baked fixture.
3. **Record key material** alongside provenance so the decrypt oracle can work. Each derived file
   needs a record in the **exact shape of `fixtures/golden/<asset>.keys.json`** (`keyHex`, `kid`,
   `scheme`, and for HLS the key URI + IV) — store it in the scenario's `sources.json` (§7) under the
   file's entry, e.g. `"keys": { "keyHex": "…", "kid": "…", "scheme": "cenc-aes-ctr" }`.
4. **Retain the cleartext base in `_pool`** and note its sha256 in the record. The `decrypt-bitexact`
   oracle compares the browser's decrypt output against golden frames decoded from the *cleartext*
   (see the `$note` in any `*.keys.json`), so the follow‑up task will need the exact plaintext to
   regenerate goldens — keep it, don't discard it after encrypting.

> The split is roughly half/half today. That is expected and correct — the value of this task is
> concentrated in the REAL scenarios, which are exactly the ones where overfitting would otherwise
> hide. Do not force downloads onto SYNTHETIC scenarios just to hit a file count.

---

## 6. Reuse and de‑duplication

Many REAL scenarios need the *same* shape (e.g. dozens of cases want "a real progressive
H.264/AAC MP4, small"). Download **once per distinct shape**, then reuse:

- Maintain a content pool at `fixtures/media/scenarios/_pool/<sha256><ext>` holding each unique
  downloaded file once.
- Reuse a pooled file for any scenario whose requirements it satisfies (re‑run the §4 checks against
  the *scenario*, not just the shape label — a file can fit several scenarios).
- Place files into scenario directories by **copying from the pool** (simple, and the runner reads
  per‑scenario dirs). Copying is not manipulation. (If disk pressure matters, a hardlink or symlink
  into the pool is acceptable, but copies are the safe default.)
- Aim for genuine independence *within* a scenario's 3 files: prefer 3 different pool entries from
  different sources. Reuse *across* scenarios freely.

The media tree is git‑ignored (see `.gitignore`) — the pool and scenario files are local artifacts.
The **provenance records (§7) and `_plan.ndjson` are the durable outputs** and should be committed.

---

## 7. Directory layout and provenance

Scenario ids are `family/name`. Mirror that as directories (the `/` becomes a real subdirectory):

```
fixtures/media/scenarios/
  _plan.ndjson              # worklist + classification + resume ledger (§3, §5)
  _progress.ndjson          # append-only run log (§8)
  _pool/                    # content-addressed unique downloads (§6)
  <family>/<name>/
      01.<ext>              # file 1  (ext = the true container extension)
      02.<ext>              # file 2
      03.<ext>              # file 3
      sources.json          # provenance for the files in this dir (see below)
```

`sources.json` (one object; `files[]` in the same order as the numbered files):

```json
{
  "scenarioId": "probe/aac_adts_probe",
  "requires": { "container": "aac", "audioCodecs": ["aac"], "video": false },
  "class": "REAL",
  "files": [
    {
      "file": "01.aac",
      "provider": "openverse",
      "sourcePageUrl": "https://…",
      "downloadUrl": "https://…",
      "licenseCode": "cc0",
      "attributionText": "…",
      "container": "aac",
      "videoCodecs": [],
      "audioCodecs": ["aac"],
      "width": null, "height": null, "durationSec": 3.2,
      "sizeBytes": 51234,
      "sha256": "…",
      "probedWith": "ffprobe -v error -show_streams -show_format"
    }
  ]
}
```

Record attribution/license **even though the media is git‑ignored** — we need it to prove the corpus
is redistributable and to regenerate it later. Keep the schema stable across all scenarios so a later
tool can read it.

For `DERIVED` (encryption) scenarios, `sources.json` records **both** layers per file: the real
cleartext base (provider/url/license/sha256, and the pool path where the plaintext is retained) and
the local encryption step. Add a `keys` object in the `fixtures/golden/<asset>.keys.json` shape and
an `encryptedFrom`/`derivation` note, e.g.:

```json
{ "file": "01.mp4", "container": "mp4", "videoCodecs": ["h264"], "audioCodecs": ["aac"],
  "sha256": "<encrypted-file-hash>",
  "cleartextBase": { "poolPath": "_pool/<sha256>.mp4", "sha256": "<clear-hash>",
                     "provider": "internetarchive", "downloadUrl": "https://…", "licenseCode": "publicdomain" },
  "derivation": "ffmpeg -i <clear> -encryption_scheme cenc-aes-ctr -encryption_key <hex> -encryption_kid <hex> -c copy 01.mp4",
  "keys": { "keyHex": "…", "kid": "…", "scheme": "cenc-aes-ctr" } }
```

For `SYNTHETIC`/`STREAMING` scenarios, still write a `sources.json` with `class` set accordingly,
`files: []`, and a `reason` — so the corpus is self‑documenting about *why* a scenario has no
downloads and which existing baked fixture it continues to rely on.

---

## 8. How to actually download (the stock‑media helper)

The sibling repo `../../../aibrush.helpers` (absolute:
`/Users/tarekbadr/Home/software/projects/aibrush/aibrush.helpers`) has a multi‑provider stock‑media
aggregator. **Study it before scripting** — treat the paths below as a map, and confirm against the
code, which is the source of truth.

- **Providers & adapters:** `cf_workers/api/src/stock-media/adapters/*` — `pexels`, `pixabay`,
  `unsplash`, `coverr`, `openverse`, `freesound`, `jamendo`, `nasa`, `wikimedia`, `internetarchive`,
  `met`, `loc`. Provider config + which env var holds each key:
  `cf_workers/api/src/stock-media/config/providers.ts`.
- **Keyless providers** (no API key needed): **Openverse, Wikimedia Commons, Internet Archive, NASA,
  Met, LOC**. These are your primary source — they carry large amounts of **CC0 / public‑domain**
  real audio and video, which is exactly the license posture we want (see §11). Internet Archive and
  Wikimedia are especially good for varied real audio/video containers.
- **Keyed providers** (Pexels, Pixabay, Coverr, Freesound, Jamendo, Unsplash): keys are read from
  `cf_workers/api/.env` (see `.env.example` for the variable names: `PEXELS_KEY`, `PIXABAY_KEY`,
  `COVERR_KEY`, `FREESOUND_KEY`, `JAMENDO_KEY`, …). Use them only if the `.env` already has the key;
  adapters without a key go silent/`degraded` rather than erroring.
- **Result shape** (`shared/src/index.ts` → `StockMediaItemSchema`): each hit has `provider`,
  `type`, `downloadUrl`, `previewUrl`, `width`, `height`, `durationSeconds`, `fileSizeBytes`,
  `licenseCode`, `licenseUrl`, `attributionText`, `sourcePageUrl`, `tags`, … — everything §7 needs.

**Two ways to invoke it locally; pick the simplest that works:**

- **(A, recommended) Direct call in a Bun script.** Import the search/adapter layer
  (`cf_workers/api/src/stock-media/searchService.ts` / `adapters/*`) directly and call it in‑process,
  loading keys with `dotenv` from `cf_workers/api/.env`. This bypasses the HTTP auth/rate‑limit
  middleware entirely and is the least friction for a batch job.
- **(B) Local HTTP server.** `cd ../../../aibrush.helpers && bun run --cwd cf_workers/api dev` starts
  the worker on `:3000`, exposing `POST /api/stock-media/search` (body ≈ `{ query, types:
  ["video"|"audio"|"image"|…], licenseMode: "commercialOnly", filters: { durationMin, durationMax,
  minWidth, … } }`). **Caveat:** these routes sit behind `jwtOrTurnstileAuth()` + rate limiting, so
  you must mint a local dev JWT (`JWT_SECRET_KEY` in `.env`, defaults to a local dev secret) and
  throttle. Prefer (A) unless you specifically need the HTTP surface.

**The stock aggregator is not the only allowed source.** The one rule is §2 — "downloaded from the
internet as‑is." Directly downloading a pinned public sample URL is equally valid and sometimes the
only way to get an exotic-but-real container. Precedent already in the corpus: `realworld_mdn_flower`
is a pinned MDN CC0 sample (`fixtures/manifest.json`, `source:"fetched"` with `sourceUrl` +
verified sha256). Good direct sources for real, redistributable media: MDN sample media, Wikimedia
Commons direct file URLs, archive.org item files, Blender open‑movie mirrors, standards‑body test
files. Always record `downloadUrl` + license in `sources.json`.

**After every download, before accepting it:** probe it (§4), confirm the format truly matches,
compute sha256, dedupe against `_pool` (§6), then place + record. A candidate that does not
probe‑match is discarded, never repaired.

---

## 9. Downstream implications — record, do NOT implement

These are the reasons the "run randomly" follow‑up is a separate task. Note them; leave them alone:

- **Goldens are per‑asset.** Bit‑exact oracles (`golden-metadata`, `golden-packets`,
  `decoded-frames-bitexact`, `decoded-audio-pcm`, `seek-accuracy`, `trim-boundaries`, `decrypt-*`)
  compare against `fixtures/golden/<asset>.*.json`, which is keyed to today's single file. New files
  have no goldens, so those oracles cannot judge them yet. The follow‑up must either derive goldens
  per new file or route multi‑file runs through self‑consistency / `property-invariant` oracles. Do
  not attempt this now — just make sure your `sources.json` captures enough (container, codecs,
  dimensions, duration, sha256) that goldens can be generated later without re‑downloading. For
  `DERIVED` (encryption) files this means keeping the retained cleartext base (§5d) plus the recorded
  key material, so `decrypt-bitexact` goldens can be regenerated from the exact plaintext.
- **The runner reads `/fixtures/media/<id>`, not `scenarios/…`.** Wiring random per‑run selection
  into `runner.ts` is the follow‑up task's job.
- **Performance‑stability expectation.** The whole point: for a REAL scenario, the metrics should be
  consistent across its 3 files. When you spot a scenario whose 3 fitting files differ wildly in
  size/duration in a way that would make metrics incomparable, prefer files of comparable
  size/duration (still 3 independent sources) and note it — don't let the corpus itself introduce
  variance the follow‑up would blame on the frameworks.

---

## 10. Execution loop (resumable, batched)

1. Build `_plan.ndjson` (§3) and classify every scenario (§5). Commit it. This is your worklist.
2. Process REAL scenarios in batches (by shape, to maximize pool reuse — e.g. do all "small h264/aac
   mp4" needs together). For each:
   a. Check `_pool` for existing fitting files before searching.
   b. Search (§8), download candidates, **probe‑verify** (§4), sha256, dedupe into `_pool`.
   c. Copy 3 independent fitting files into `fixtures/media/scenarios/<family>/<name>/`, write
      `sources.json`.
   d. Append a row to `_progress.ndjson`: `{id, class, filesPlaced, status:"done", note}`.
3. Process DERIVED (encryption) scenarios (§5d): reuse the REAL pipeline to obtain 3 real cleartext
   bases (retained in `_pool`), encrypt each locally with fresh known keys, place the 3 encrypted
   files, and write the two‑layer `sources.json` (base + `keys` + `derivation`). Mark done.
4. For SYNTHETIC/STREAMING scenarios, write the `sources.json` stub (§7) and mark done. No downloads.
5. **Resume rule:** on restart, skip any scenario already `done` in `_progress.ndjson`. Never
   re‑download a shape already in `_pool`.
6. Be a good netizen: throttle requests, prefer keyless providers, cache search results, and stop to
   ask if a provider starts erroring or rate‑limiting repeatedly rather than hammering it.

**Definition of done:** every scenario in `_plan.ndjson` has a terminal `_progress.ndjson` row;
every REAL scenario dir has 3 probe‑verified files + `sources.json`; every DERIVED (encryption) dir
has 3 locally‑encrypted files each with recorded keys + retained cleartext base + `sources.json`;
every SYNTHETIC/STREAMING dir has a documented stub; `_plan.ndjson`, `_progress.ndjson`, and all
`sources.json` are committed.

When done, report: counts per class, total unique pool files, total placed files, and any REAL
scenario you had to downgrade to SYNTHETIC (with why) or fill with fewer than 3 files (with why).

---

## 11. Decisions baked into these instructions (override points)

These two policies were chosen as sensible defaults. If the repo owner wants different behavior,
**edit this section and the affected rules** before executing:

- **Non‑downloadable scenarios → classify & skip (§5), except the `encryption` family (§5d).**
  Robustness/fuzz/exotic scenarios keep their existing baked fixture and are documented, rather than
  being force‑fed approximate real files. The `encryption` family is the deliberate exception: it is
  `DERIVED` — download a real cleartext, then encrypt locally — because the owner granted local
  manipulation for that one family. Rationale: honoring §2 (no manipulation) everywhere it can be
  honored, while still de‑overfitting encryption via real plaintext bases.

If either default is wrong for your intent, the cleanest change is: flip the policy here, adjust §5
(class assignment) and/or §8 (license gate), and re‑run — the pipeline is idempotent.
