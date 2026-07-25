/**
 * src/engines/mp4box/adapter.ts — MediaEngine adapter for mp4box.js (npm `mp4box`) @ 2.3.0.
 *
 * ROLE: ISO-BMFF (MP4 / MOV, incl. fragmented-MP4 / CMAF) PARSER + FRAGMENTER. mp4box.js is a
 * pure-JS box parser, sample-table walker, and on-the-fly fragmenter/segmenter + box writer. It does
 * NOT decode or encode media (no pixels, no PCM, no re-encode) and handles ONLY ISOBMFF. So this
 * adapter declares — and implements — exactly four operations:
 *   - probe   : read `moov` → NormalizedMetadata.
 *   - demux   : walk sample tables → representation-aware encoded PacketInfo evidence.
 *   - remux   : ISOBMFF → FRAGMENTED-MP4 (fMP4/CMAF) via setSegmentOptions/onSegment (the fragmenter).
 *   - mux     : MP4Box-prepared encoded MP4/MOV tracks → MP4 via addTrack/addSample/getBuffer.
 * Everything else (transcode/decodeFrames/seek-to-frame/trim/decrypt) needs decode/encode or a
 * non-ISOBMFF container and is therefore NOT declared — the runner records those as NA(engine).
 *
 * ── Why `mux` is now declared (previous false NA removed) ────────────────────────────────────────
 * The dossier (§2.4 / §7 A.3+A.7 / §8) confirms mp4box CAN mux already-encoded chunks into MP4
 * (addTrack/addSample/getBuffer — all present in mp4box@2.3.0). The runner now delegates corpus
 * input → EncodedTracks assembly to `engine.prepareMuxTracks()`, so the old harness-contract blocker
 * no longer applies. This adapter prepares tracks only from MP4/MOV inputs parsed by MP4Box itself,
 * preserving the source sample-entry boxes (avcC/hvcC/esds/etc.) and exact tick timestamps. External
 * arbitrary EncodedTracks that do not carry MP4Box sample-entry metadata still fail with
 * NotApplicableError rather than emitting a bogus "green" file.
 *
 * ── UPGRADE 0.5.4 -> 2.3.0 (this is a rewrite) ──────────────────────────────────────────────────
 * The 2.x line is a TypeScript+ESM rewrite that SHIPS its own `.d.ts`, so we import the real typed
 * surface (no local ambient module). Breaking-change deltas honored here:
 *   • `onError(module, message)` now takes TWO args (was one string in 0.5.x).
 *   • `onReady(info: Movie)` — info is the `Movie` shape from `getInfo()`.
 *   • `appendBuffer(MP4BoxBuffer)` — buffers are `MP4BoxBuffer` (carry `fileStart`); build via
 *     `MP4BoxBuffer.fromArrayBuffer(ab, fileStart)`.
 *   • `discardMdatData` DEFAULTS TO TRUE since 1.0.0 — with it true, `setExtractionOptions`/
 *     `setSegmentOptions` warn and produce NO samples. So demux/remux MUST use `createFile(true)`
 *     (= keepMdatData, → discardMdatData=false) to retain media bytes. Probe stays `createFile()`
 *     (discard mdat) — it only needs the `moov`, the memory-optimal path.
 *   • `initializeSegmentation()` now returns `{ tracks:[{id,user}], buffer }` — a SINGLE combined
 *     init segment (not the 0.5.x array of per-track init segments).
 *   • 2.x enforces a UNIFORM `nbSamples` across all segmented tracks.
 *   • `DataStream` default endianness is now BIG_ENDIAN (we still pass it explicitly for the
 *     avcC/hvcC/vpcC/av1C description serialization path used by demux description bytes).
 *
 * ── BEST PATH (dossier §3 / §0.9) ───────────────────────────────────────────────────────────────
 * mp4box is pure-JS, single-threaded, CPU-only: NO WASM / SIMD / WebGPU / threads. Its "fast path" is
 * lazy/streaming IO + feeding hardware WebCodecs — NOT internal acceleration. This adapter records
 * that reality in configUsed. Heavy work in init() is just the dynamic import (UNTIMED, §0.7).
 *
 * ── DOCS RESEARCHED (2026-06-17, mp4box@2.3.0) ──────────────────────────────────────────────────
 *   - npm:        https://www.npmjs.com/package/mp4box
 *   - repo/README: https://github.com/gpac/mp4box.js / https://github.com/gpac/mp4box.js/blob/main/README.md
 *   - docs/demos: https://gpac.github.io/mp4box.js/ , https://gpac.github.io/mp4box.js/test/
 *   - releases:   https://github.com/gpac/mp4box.js/releases (v2.3.0, 2025-11-22)
 *   - 1.0.0 TS announcement (discardMdatData / big-endian DataStream breaking changes):
 *                 https://gpac.io/2025/06/19/announcing-mp4box-js-1-0-0-with-typescript-support/
 *   - WebCodecs demux fast-path (avcC/hvcC/vpcC/av1C description, streaming sink, Worker):
 *                 https://w3c.github.io/webcodecs/samples/video-decode-display/ (demuxer_mp4.js)
 *   - in-repo dossier: research/dossiers/mp4box.md
 *   - verified against installed dist: node_modules/mp4box/dist/mp4box.all.{js,d.ts} +
 *     node_modules/mp4box/dist/log-DO1-_KSL.d.ts (ISOFile @1153, getInfo @6448, processSamples
 *     @6577, createFile @8212, Movie/Track/Sample @4475/4432/4399).
 */

import { registerEngine } from '../../core/registry.ts';
import type {
  ApplicabilityTupleSummary,
  CapabilitySet,
  ConcreteOperationRequest,
  DecodeOptions,
  DemuxTrackRepresentation,
  DemuxResult,
  EncodedTrack,
  EncodedTracks,
  FrameDigest,
  FrameSink,
  LifecycleContext,
  MediaBytes,
  MediaEngine,
  MediaInput,
  MuxOptions,
  NormalizedMetadata,
  NormalizedTrack,
  Operation,
  OperationContext,
  PacketInfo,
  RemuxOptions,
  TrackType,
  TranscodeOptions,
} from '../../core/engine.ts';
import {
  AdapterLifecycleController,
  CONCRETE_OPERATION_PROTOCOL,
  SUPPORTED_CHECKED_SUPPORT_SNAPSHOT,
  captureConfigUsedSnapshot,
  createMalformedInputError,
  createNotApplicableError,
  validateAdapterResult,
  validateEncodedTracks,
} from '../../core/engine.ts';
import {
  fpsEvidenceFromSamples,
  markFragmentSignedCompositionOffsets,
  parseAacAudioSpecificConfig,
  validateFragmentedMp4,
  type AacConfigEvidence,
  type FragmentValidation,
} from './evidence.ts';
import {
  MP4BOX_AUDIO_CODECS,
  MP4BOX_ENGINE_ID,
  MP4BOX_INPUT_CONTAINERS,
  MP4BOX_OUTPUT_CONTAINERS,
  MP4BOX_VIDEO_CODECS,
  decideMp4boxSupport,
  mp4boxDecisionError,
  mp4boxTupleSummary,
} from './support.ts';

// 2.x ships real types — import the typed surface directly (no local ambient module).
type Mp4boxModule = typeof import('mp4box');
type Mp4boxDataStream = import('mp4box').DataStream;
type Mp4boxIsoFileOptions = import('mp4box').IsoFileOptions;
type Mp4Movie = import('mp4box').Movie;
type Mp4Track = import('mp4box').Track;
type Mp4Sample = import('mp4box').Sample;
type Mp4ISOFile = import('mp4box').ISOFile;
type Mp4BoxKind = import('mp4box').BoxKind;

const ENGINE_ID = MP4BOX_ENGINE_ID;

/** The chosen best-path config, surfaced as configUsed (dossier §3). mp4box is pure-JS/CPU-only. */
const READ_CHUNK_BYTES = 1 * 1024 * 1024;
const PROCESS_BATCH_SAMPLES = 16;

interface Mp4boxConfigState {
  framework: string;
  packageVersions: Record<string, string>;
  backend: string;
  hardwareAcceleration: string;
  workerCount: number;
  threadCount: number;
  readerMode: string;
  writerMode: string;
  targetMode: string;
  codecConfigs: Array<Record<string, string | number | boolean | null>>;
  operation: string;
  keepMdatData: boolean;
  readChunkBytes: number;
  processBatchSamples: number;
  inputBytes: number;
  appendCount: number;
  arrayBufferReadFallbacks: number;
  releasedSamples: number;
  presentationEditFilteredSamples: number;
  peakParserSampleBytes: number;
  peakOwnedSampleBytes: number;
  peakOutputTargetBytes: number;
  outputBytes: number;
  outputWrites: number;
  signedTrunVersionPatches: number;
  firstByteMs: number | null;
  lateErrorObserved: boolean;
  stopCalled: boolean;
  cleanupComplete: boolean;
  activeFiles: number;
  fragmentValidation: FragmentValidation | null;
}

function freshConfigState(): Mp4boxConfigState {
  return {
    framework: 'mp4box.js',
    packageVersions: { mp4box: '2.3.0' },
    backend: 'pure-js',
    hardwareAcceleration: 'none',
    workerCount: 0,
    threadCount: 1,
    readerMode: 'blob-progressive-slices',
    writerMode: 'none',
    targetMode: 'none',
    codecConfigs: [],
    operation: 'idle',
    keepMdatData: false,
    readChunkBytes: READ_CHUNK_BYTES,
    processBatchSamples: PROCESS_BATCH_SAMPLES,
    inputBytes: 0,
    appendCount: 0,
    arrayBufferReadFallbacks: 0,
    releasedSamples: 0,
    presentationEditFilteredSamples: 0,
    peakParserSampleBytes: 0,
    peakOwnedSampleBytes: 0,
    peakOutputTargetBytes: 0,
    outputBytes: 0,
    outputWrites: 0,
    signedTrunVersionPatches: 0,
    firstByteMs: null,
    lateErrorObserved: false,
    stopCalled: false,
    cleanupComplete: true,
    activeFiles: 0,
    fragmentValidation: null,
  };
}

// ── pure helpers (no lib dependency) ──────────────────────────────────────────────────────────────

/** Map mp4box's handler-derived track `type` to our canonical TrackType. */
function trackType(t: Mp4Track): TrackType {
  switch (t.type) {
    case 'video':
      return 'video';
    case 'audio':
      return 'audio';
    case 'subtitles':
      return 'subtitle';
    default:
      // Fallback by which media-header sub-object getInfo populated.
      if (t.video) return 'video';
      if (t.audio) return 'audio';
      return 'other';
  }
}

/**
 * Map an MP4 MIME codecs token (e.g. 'avc1.640028', 'hev1.1.6.L93.B0', 'mp4a.40.2', 'vp09.00.10.08',
 * 'av01.0.04M.08') to our canonical lowercase token. Unrecognized → the raw token lowercased (honest:
 * surface what the file declares rather than guess a canonical id that may be wrong).
 */
function canonicalCodec(codec: string): string {
  const c = codec.toLowerCase();
  // Video. (avc1/avc3/avc2/avc4 all carry an avcC; hev1/hvc1 carry hvcC.)
  if (c.startsWith('avc1') || c.startsWith('avc3') || c.startsWith('avc2') || c.startsWith('avc4')) return 'h264';
  if (c.startsWith('hev1') || c.startsWith('hvc1') || c.startsWith('hev2') || c.startsWith('hvc2')) return 'hevc';
  if (c.startsWith('vp08') || c === 'vp8') return 'vp8';
  if (c.startsWith('vp09') || c === 'vp9') return 'vp9';
  if (c.startsWith('av01')) return 'av1';
  // Audio. NB: `mp4aSampleEntry.getCodec()` appends `.<OTI>[.<DSI>]` ONLY when an `esds` ESD is
  // present and parsed; QuickTime/MOV audio frequently exposes the BARE token 'mp4a' (no '.40.2'
  // suffix) because the ESD's OTI is absent — so we must canonicalize bare 'mp4a' to AAC, not just
  // the suffixed 'mp4a.40.*'. (Verified in node_modules/mp4box dist: getCodec returns `baseCodec`
  // ('mp4a') when `!esds.esd`. Golden h264_1080p_5s.mov audio codec === 'aac'.) OTI 0x40/0x67 = AAC.
  if (c === 'mp4a' || c === 'aac' || c.startsWith('mp4a.40') || c.startsWith('mp4a.67')) return 'aac';
  if (c.startsWith('opus')) return 'opus';
  // OTI 0x6b/0x69 = MP3; bare 'mp3'/'.mp3' tokens too.
  if (c.startsWith('mp4a.6b') || c.startsWith('mp4a.69') || c === 'mp3' || c === '.mp3') return 'mp3';
  if (c.startsWith('flac') || c.startsWith('fla')) return 'flac';
  return c;
}

/**
 * Encrypted-track codec unwrap (CENC). For protected tracks, mp4box's `getInfo()` reports
 * `track.codec` as the SAMPLE-ENTRY type 'encv'/'enca' (and 'encs'/'encu' for sys/subtitle) because
 * `encvSampleEntry`/`encaSampleEntry` inherit the BASE `SampleEntry.getCodec()` (= `type.replace('.','')`)
 * — they carry NO avcC/esds-aware getCodec. The ORIGINAL four-cc lives in the OriginalFormatBox:
 *   stsd → encv/enca sampleEntry → sinf (ProtectionSchemeInfoBox) → frma.data_format ('avc1'/'mp4a').
 * The suite's probe is documented to report container/track WITHOUT decrypting (dossier A.11/A.12), so
 * we resolve `frma.data_format` and canonicalize THAT. Returns the unwrapped four-cc, or undefined when
 * the track is not an `enc*` protected entry (caller then uses `track.codec` verbatim).
 *
 * Type-correct, no internal imports: `stsd.entries` are public `SampleEntry`s; `SampleEntry` (a
 * `ContainerBox`) exposes the generic `boxes: Box[]`, and each `Box` has a typed `.type`. We locate
 * `sinf`→`frma` by fourcc on `.boxes`, then read the `data_format` string through a minimal structural
 * shape (the concrete `frmaBox`/`sinfBox` classes are NOT part of mp4box's public entry exports).
 */
const ENCRYPTED_ENTRY_TYPES = new Set(['encv', 'enca', 'encs', 'encu', 'enct', 'encm']);

interface BoxNode {
  type: string;
  boxes?: BoxNode[];
  data_format?: string;
  size?: number;
  hdr_size?: number;
  lengthSizeMinusOne?: number;
  write?: (stream: Mp4boxDataStream) => void;
}

interface DescriptorNode {
  tag?: number;
  data?: unknown;
  descs?: DescriptorNode[];
}

interface EsdsBoxNode extends BoxNode {
  esd?: DescriptorNode;
}

interface AudioSampleEntryNode extends BoxNode {
  version?: number;
  channel_count?: number;
  extensions?: unknown;
  esds?: EsdsBoxNode;
  wave?: BoxNode & { esds?: EsdsBoxNode };
}

interface PreparedMuxTrackCandidate {
  inputIndex: number;
  type: 'video' | 'audio';
  typeOrdinal: number;
  track: Mp4boxPreparedMuxTrack;
}

interface Mp4boxSampleTiming {
  cts: number;
  dts: number;
  duration: number;
}

type EncodedChunk = EncodedTrack['chunks'][number];

interface Mp4boxPreparedChunk extends EncodedChunk {
  mp4boxTiming?: Mp4boxSampleTiming;
  sampleDescriptionIndex?: number;
}

interface Mp4boxMuxInfo {
  source: 'mp4box';
  sampleEntryType: string;
  descriptionBoxes: Mp4BoxKind[];
  sampleEntries: BoxNode[];
  edits: Mp4Edit[];
  movieTimescale: number;
  mediaOriginTicks: number;
  presentationOffsetUs: number;
}

interface Mp4boxPreparedMuxTrack extends EncodedTrack {
  chunks: Mp4boxPreparedChunk[];
  mp4boxMux?: Mp4boxMuxInfo;
}

interface CollectedSample {
  data: Uint8Array;
  duration: number;
  cts: number;
  dts: number;
  timescale: number;
  isSync: boolean;
  number: number;
  size: number;
  descriptionIndex: number;
}

interface Mp4Edit {
  segmentDuration: number;
  mediaTime: number;
  mediaRateInteger: number;
  mediaRateFraction: number;
}

interface ClassicSampleDurationRun {
  sampleCount: number;
  sampleDelta: number;
}

interface ParsedSession {
  file: Mp4ISOFile;
  info: Mp4Movie;
  throwIfError(): void;
  close(primaryError?: unknown): void;
}

type ParsedReadyHook = (
  file: Mp4ISOFile,
  info: Mp4Movie,
  throwIfError: () => void,
) => void;

type Mp4NormalizedTrack = NormalizedTrack & {
  codecRaw?: string;
  codecCanonical?: string;
  audioObjectType?: number;
  sbrPresent?: boolean;
  psPresent?: boolean;
  codedSampleRate?: number;
  presentationSampleRate?: number;
  codedChannels?: number;
  presentationChannels?: number;
  mediaTimescale?: number;
  mediaDurationSec?: number;
  presentationDurationSec?: number;
  editListSpanSec?: number;
};

function findChildBox(node: BoxNode | undefined, fourcc: string): BoxNode | undefined {
  if (!node || !node.boxes) return undefined;
  for (const b of node.boxes) {
    if (b && b.type === fourcc) return b;
  }
  return undefined;
}

function sampleEntryForTrack(file: Mp4ISOFile, trackId: number, rawCodec?: string): BoxNode | undefined {
  const trak = file.getTrackById(trackId);
  const entries = trak?.mdia?.minf?.stbl?.stsd?.entries;
  if (!entries || !entries.length) return undefined;
  if (rawCodec) {
    const wanted = rawCodec.toLowerCase();
    const match = entries.find((e) => ((e as unknown as BoxNode).type ?? '').toLowerCase() === wanted);
    if (match) return match as unknown as BoxNode;
  }
  return entries[0] as unknown as BoxNode;
}

function unwrapEncryptedCodec(file: Mp4ISOFile, trackId: number, rawCodec: string): string | undefined {
  if (!ENCRYPTED_ENTRY_TYPES.has(rawCodec.toLowerCase())) return undefined;
  // Defensive: only enc* tracks reach here; a malformed/partial box tree must never turn a clean
  // probe into an ERROR — on any surprise we fall back to the wrapper four-cc (caller uses t.codec).
  try {
    // getTrackById → trakBox; mdia.minf.stbl.stsd.entries[] are SampleEntry boxes.
    const entry = sampleEntryForTrack(file, trackId, rawCodec);
    if (!entry) return undefined;
    const sinf = findChildBox(entry, 'sinf');
    const frma = findChildBox(sinf, 'frma');
    const fmt = frma?.data_format;
    return typeof fmt === 'string' && fmt.length ? fmt : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Derive clockwise rotation degrees from the tkhd transform matrix, if present. getInfo() exposes the
 * 9-element fixed-point matrix [a,b,u, c,d,v, x,y,w]; a/b/c/d are 16.16 fixed-point. Classify the four
 * canonical orientations (0/90/180/270) — non-orthogonal matrices report `undefined` (we never
 * fabricate an angle we cannot trust).
 */
function rotationFromMatrix(
  matrix: Int32Array | Uint32Array | number[] | undefined,
): number | undefined {
  if (!matrix || matrix.length < 9) return undefined;
  // u32 fields can carry the sign bit of a negative 16.16 value; normalize through Int32.
  const f = (raw: number | undefined): number => (raw === undefined ? 0 : (raw | 0) / 65536);
  const a = f(matrix[0]);
  const b = f(matrix[1]);
  const c = f(matrix[3]);
  const d = f(matrix[4]);
  const eq = (x: number, y: number) => Math.abs(x - y) < 0.01;
  if (eq(a, 1) && eq(b, 0) && eq(c, 0) && eq(d, 1)) return 0;
  if (eq(a, 0) && eq(b, -1) && eq(c, 1) && eq(d, 0)) return 90;
  if (eq(a, -1) && eq(b, 0) && eq(c, 0) && eq(d, -1)) return 180;
  if (eq(a, 0) && eq(b, 1) && eq(c, -1) && eq(d, 0)) return 270;
  return undefined;
}

/**
 * Pick the canonical container token. getInfo() does not separately tag mov vs mp4, so we inspect the
 * ftyp brands: the QuickTime brand 'qt  ' (and 'qt') marks a MOV; everything else in the ISOBMFF
 * family normalizes to 'mp4'.
 */
function canonicalContainer(brands: string[] | undefined): string {
  if (brands && brands.some((b) => b === 'qt  ' || b === 'qt')) return 'mov';
  return 'mp4';
}

/**
 * mp4box applies the ISO 639 packed-language decoder to every mdhd value. Legacy QuickTime-style
 * files use numeric language id 0 for English, which that decoder renders as three backticks.
 * Preserve real elng/ISO strings, but translate this one evidenced legacy sentinel.
 */
function normalizedTrackLanguage(file: Mp4ISOFile, track: Mp4Track): string | null {
  const native = file.getTrackById(track.id)?.mdia;
  const extended = native?.elng?.extended_language?.trim();
  if (extended) return extended === 'und' ? null : extended;
  if (native?.mdhd?.language === 0) return 'eng';
  const language = track.language?.trim();
  if (!language || language === 'und') return null;
  return /^[a-z]{3}$/.test(language) ? language : null;
}

function validAudioSampleRate(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 7350 && value <= 384000;
}

function validAudioChannels(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 32;
}

function bytesFromUnknown(value: unknown): Uint8Array | undefined {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (!value || typeof value !== 'object') return undefined;
  const len = (value as { length?: unknown }).length;
  if (typeof len !== 'number' || !Number.isFinite(len) || len < 0) return undefined;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    const b = (value as Record<number, unknown>)[i];
    if (typeof b !== 'number') return undefined;
    out[i] = b & 0xff;
  }
  return out;
}

function findDescriptorData(desc: DescriptorNode | undefined, tag: number): Uint8Array | undefined {
  if (!desc) return undefined;
  if (desc.tag === tag) {
    const data = bytesFromUnknown(desc.data);
    if (data) return data;
  }
  for (const child of desc.descs ?? []) {
    const data = findDescriptorData(child, tag);
    if (data) return data;
  }
  return undefined;
}

function audioSpecificConfigFromEntry(entry: AudioSampleEntryNode): Uint8Array | undefined {
  const wave = (entry.wave ?? findChildBox(entry, 'wave')) as (BoxNode & { esds?: EsdsBoxNode }) | undefined;
  const esds = entry.esds ?? wave?.esds ?? (findChildBox(entry, 'esds') as EsdsBoxNode | undefined);
  return findDescriptorData(esds?.esd, 5);
}

function quickTimeV2AudioParams(entry: AudioSampleEntryNode): { sampleRate?: number; channels?: number } {
  if (entry.version !== 2) return {};
  const ext = bytesFromUnknown(entry.extensions);
  if (!ext || ext.byteLength < 16) return {};
  const view = new DataView(ext.buffer, ext.byteOffset, ext.byteLength);
  const sampleRateFloat = view.getFloat64(4, false);
  const sampleRate = Number.isFinite(sampleRateFloat) ? Math.round(sampleRateFloat) : undefined;
  const channels = view.getUint32(12, false);
  return {
    ...(validAudioSampleRate(sampleRate) ? { sampleRate } : {}),
    ...(validAudioChannels(channels) ? { channels } : {}),
  };
}

function audioParamsFromSampleEntry(
  file: Mp4ISOFile,
  trackId: number,
  rawCodec: string,
): { sampleRate?: number; channels?: number; aac?: AacConfigEvidence } {
  try {
    const entry = sampleEntryForTrack(file, trackId, rawCodec) as AudioSampleEntryNode | undefined;
    if (!entry) return {};
    const qtV2 = quickTimeV2AudioParams(entry);
    const aac = parseAacAudioSpecificConfig(audioSpecificConfigFromEntry(entry));
    const entryChannels = validAudioChannels(entry.channel_count) ? entry.channel_count : undefined;
    const aacChannels = aac?.presentationChannels;
    // One corpus HE-AAC stream has an ASC that proves a mono core + SBR but omits the in-band PS
    // needed to explain its stereo sample entry. Preserve that observed presentation without using
    // channel-count magnitude as a generic confidence rule; otherwise a proven ASC view wins.
    const unresolvedImplicitHeStereo = entryChannels === 2
      && aac?.codedChannels === 1
      && aac.presentationChannels === 1
      && aac.sbrPresent
      && !aac.psPresent;
    const channels = qtV2.channels
      ?? (unresolvedImplicitHeStereo ? entryChannels : aacChannels ?? entryChannels);
    // A conflicting ASC is still useful coded/core evidence, but it does not prove the rendered
    // view represented by the sample entry. Avoid publishing two contradictory presentation fields.
    let normalizedAac = aac;
    if (aac?.presentationChannels !== undefined && channels !== aac.presentationChannels) {
      const { presentationChannels: _conflictingPresentation, ...codedAac } = aac;
      normalizedAac = codedAac;
    }
    return {
      sampleRate: qtV2.sampleRate ?? aac?.presentationSampleRate,
      ...(channels !== undefined ? { channels } : {}),
      ...(normalizedAac ? { aac: normalizedAac } : {}),
    };
  } catch {
    return {};
  }
}

function normalizedEdits(track: Mp4Track): Mp4Edit[] {
  return (track.edits ?? []).map((entry) => ({
    segmentDuration: entry.segment_duration,
    mediaTime: entry.media_time,
    mediaRateInteger: entry.media_rate_integer,
    mediaRateFraction: entry.media_rate_fraction,
  }));
}

/**
 * MP4Box 2.3 rewrites the final classic sample duration as `mdhd.duration - final dts` while
 * building its extraction list, even when the authoritative stts table carries a different final
 * delta. Preserve the public stts run table for mux copy; fragmented inputs have an empty stts and
 * correctly fall back to each extracted fragment sample's duration.
 */
function classicSampleDurationRuns(
  file: Mp4ISOFile,
  trackId: number,
  expectedSamples: number,
): readonly ClassicSampleDurationRun[] | undefined {
  const stts = file.getTrackById(trackId)?.mdia?.minf?.stbl?.stts;
  if (!stts || stts.sample_counts.length === 0 || stts.sample_deltas.length === 0) return undefined;
  if (stts.sample_counts.length !== stts.sample_deltas.length) {
    throw new Error(`${ENGINE_ID}: track ${trackId} has inconsistent stts run arrays`);
  }
  const runs: ClassicSampleDurationRun[] = [];
  let total = 0;
  for (let index = 0; index < stts.sample_counts.length; index++) {
    const sampleCount = stts.sample_counts[index]!;
    const sampleDelta = stts.sample_deltas[index]!;
    if (!Number.isSafeInteger(sampleCount) || sampleCount <= 0 || !Number.isSafeInteger(sampleDelta) || sampleDelta <= 0) {
      throw new Error(`${ENGINE_ID}: track ${trackId} has invalid stts run ${index}`);
    }
    total += sampleCount;
    if (!Number.isSafeInteger(total)) throw new Error(`${ENGINE_ID}: track ${trackId} stts sample count is unsafe`);
    runs.push({ sampleCount, sampleDelta });
  }
  if (total !== expectedSamples) {
    throw new Error(`${ENGINE_ID}: track ${trackId} stts covers ${total} samples, expected ${expectedSamples}`);
  }
  return runs;
}

function editPresentationSpanSec(track: Mp4Track): number | undefined {
  const timescale = track.movie_timescale;
  const edits = normalizedEdits(track);
  if (!(timescale > 0) || edits.length === 0) return undefined;
  const ticks = edits.reduce((sum, edit) => sum + Math.max(0, edit.segmentDuration), 0);
  return ticks > 0 ? ticks / timescale : undefined;
}

/**
 * Golden demux semantics retain coded priming packets before the presentation origin. The one
 * bounded correction required for MOV packet parity is a short trailing edit that excludes a
 * contiguous suffix of surplus coded samples. Mirror the neutral ISO BMFF timeline rule used by
 * the Mediabunny adapter and decline every wider edit-list rewrite.
 */
function smallTrailingEditSampleNumbers(
  track: Mp4Track,
  samples: readonly Mp4Sample[],
): Set<number> | undefined {
  const edits = normalizedEdits(track);
  if (
    samples.length === 0
    || edits.length === 0
    || !(track.timescale > 0)
    || !(track.movie_timescale > 0)
    || !(track.duration > 0)
  ) return undefined;

  const presentationSpanSec = edits.reduce(
    (sum, edit) => sum + Math.max(0, edit.segmentDuration),
    0,
  ) / track.movie_timescale;
  const rawMediaSpanSec = track.duration / track.timescale;
  const trailingEditSec = rawMediaSpanSec - presentationSpanSec;
  if (!(trailingEditSec > 0 && trailingEditSec <= 0.1)) return undefined;

  const included = samples.filter((sample) => edits.some((edit) => {
    if (edit.mediaTime < 0 || edit.segmentDuration <= 0) return false;
    const mediaStart = edit.mediaTime;
    const mediaEnd = mediaStart + edit.segmentDuration * track.timescale / track.movie_timescale;
    return Math.max(sample.cts, mediaStart) < Math.min(sample.cts + sample.duration, mediaEnd);
  })).map((sample) => sample.number).sort((a, b) => a - b);

  // Applying only to a zero-based contiguous prefix prevents this normalization from rewriting
  // leading edits, repeated edits, gaps, or reordered sample membership.
  if (included.length === 0 || included.some((sampleNumber, index) => sampleNumber !== index)) {
    return undefined;
  }
  return new Set(included);
}

/** `Movie.tracks[].nb_samples` is an onReady snapshot and can be stale for progressive fMP4. */
function trackSampleCount(file: Mp4ISOFile, track: Mp4Track): number {
  try {
    const complete = file.getTrackSamplesInfo(track.id).length;
    if (complete > 0) return complete;
  } catch {
    // Non-fragmented sample tables still expose the stable getInfo() count below.
  }
  return track.nb_samples;
}

/**
 * Build NormalizedMetadata from an mp4box `Movie` (getInfo() result). The owning `ISOFile` is threaded
 * in so the encrypted-track codec unwrap (frma.data_format) and any box-tree lookups can resolve the
 * ORIGINAL codec for CENC `encv`/`enca` sample entries (getInfo() only exposes the wrapper four-cc).
 */
function toNormalizedMetadata(file: Mp4ISOFile, info: Mp4Movie): NormalizedMetadata {
  // Movie duration: prefer mvhd duration/timescale; for fragmented files where mvhd.duration is 0,
  // fall back to the fragment duration ratio getInfo() exposes as {num, den}.
  let durationSec: number | null = null;
  if (info.timescale > 0 && info.duration > 0) {
    durationSec = info.duration / info.timescale;
  } else if (info.fragment_duration && info.fragment_duration.den > 0 && info.fragment_duration.num > 0) {
    durationSec = info.fragment_duration.num / info.fragment_duration.den;
  }
  // Movie-level fragment seconds, reused as the fps denominator for fragmented video tracks whose
  // per-track tkhd.duration is 0 (mvhd/tkhd duration is 0 in a fragmented init segment).
  const movieFragSec =
    info.fragment_duration && info.fragment_duration.den > 0 && info.fragment_duration.num > 0
      ? info.fragment_duration.num / info.fragment_duration.den
      : 0;

  const tracks: NormalizedTrack[] = info.tracks.map((t): NormalizedTrack => {
    const type = trackType(t);
    const trackDurSec = t.timescale > 0 ? t.duration / t.timescale : 0;
    const lang = normalizedTrackLanguage(file, t);
    // Unwrap CENC-protected sample entries ('encv'/'enca') to their original four-cc before
    // canonicalizing; non-encrypted tracks pass `t.codec` straight through.
    const rawCodec = unwrapEncryptedCodec(file, t.id, t.codec) ?? t.codec;
    const normalizedCodec = canonicalCodec(rawCodec);
    const track: Mp4NormalizedTrack = {
      type,
      codec: normalizedCodec,
      nativeCodecTag: rawCodec,
      codecRaw: rawCodec,
      // The shared canonical codec vocabulary is intentionally audio/video-only. QuickTime data
      // tracks such as `tmcd` retain their native token without pretending it is an AV codec.
      ...(type === 'video' || type === 'audio' ? { codecCanonical: normalizedCodec } : {}),
      ...(t.timescale > 0 ? { mediaTimescale: t.timescale } : {}),
      ...(trackDurSec > 0 ? { mediaDurationSec: trackDurSec } : {}),
      bitrate: typeof t.bitrate === 'number' && Number.isFinite(t.bitrate) ? Math.round(t.bitrate) : null,
      language: lang,
    };
    const editSpanSec = editPresentationSpanSec(t);
    if (editSpanSec !== undefined) {
      track.editListSpanSec = editSpanSec;
      track.presentationDurationSec = editSpanSec;
    } else if (t.movie_timescale > 0 && t.movie_duration > 0) {
      track.presentationDurationSec = t.movie_duration / t.movie_timescale;
    }
    if (type === 'video') {
      track.width = t.video?.width ?? (Math.round(t.track_width) || undefined);
      track.height = t.video?.height ?? (Math.round(t.track_height) || undefined);
      let observedFps: ReturnType<typeof fpsEvidenceFromSamples>;
      try {
        observedFps = fpsEvidenceFromSamples(file.getTrackSamplesInfo(t.id));
      } catch {
        observedFps = undefined;
      }
      if (observedFps) {
        track.fps = observedFps.fps;
        track.fpsProvenance = observedFps.provenance;
      } else {
        // Fragmented init segments may not expose sample tables. Retain an explicitly average/
        // unknown-cadence fallback instead of presenting sample-count/duration as nominal CFR.
        const fpsDenSec = trackDurSec > 0 ? trackDurSec : movieFragSec;
        const sampleCount = trackSampleCount(file, t);
        if (fpsDenSec > 0 && sampleCount > 0) {
          track.fps = sampleCount / fpsDenSec;
          track.fpsProvenance = {
            source: 'average',
            cadence: 'UNKNOWN',
            sampleCount,
            observedIntervalUs: fpsDenSec * 1_000_000,
          };
        }
      }
      const rot = rotationFromMatrix(t.matrix);
      if (rot !== undefined) track.rotation = rot;
    } else if (type === 'audio') {
      // QuickTime AudioSampleEntry v2 stores the real rate/channel count in the v2 extension (and
      // AAC also repeats it in esds). mp4box's base getInfo() values can be legacy placeholders.
      const audioParams = audioParamsFromSampleEntry(file, t.id, rawCodec);
      track.sampleRate = audioParams.sampleRate ?? t.audio?.sample_rate;
      track.channels = audioParams.channels ?? t.audio?.channel_count;
      if (audioParams.aac) {
        track.audioObjectType = audioParams.aac.audioObjectType;
        track.sbrPresent = audioParams.aac.sbrPresent;
        track.psPresent = audioParams.aac.psPresent;
        if (audioParams.aac.codedSampleRate !== undefined) track.codedSampleRate = audioParams.aac.codedSampleRate;
        if (audioParams.aac.presentationSampleRate !== undefined) track.presentationSampleRate = audioParams.aac.presentationSampleRate;
        if (audioParams.aac.codedChannels !== undefined) track.codedChannels = audioParams.aac.codedChannels;
        if (audioParams.aac.presentationChannels !== undefined) track.presentationChannels = audioParams.aac.presentationChannels;
      }
    }
    return track;
  });

  const meta: NormalizedMetadata = {
    container: canonicalContainer(info.brands),
    durationSec,
    // The movie/fragment duration is the file-wide presentation timeline. Track durations can
    // legitimately differ (for example, shorter VFR video beside longer audio), so expose it.
    ...(durationSec !== null ? { presentationDurationSec: durationSec } : {}),
    tracks,
  };
  const tags: Record<string, string> = {};
  const majorBrand = file.ftyp?.major_brand ?? info.brands?.[0];
  if (typeof majorBrand === 'string' && majorBrand.length) tags.major_brand = majorBrand;
  if (info.brands && info.brands.length) tags.brands = info.brands.join(',');
  if (info.isFragmented) tags.fragmented = 'true';
  if (info.mime) tags.mime = info.mime;
  if (Object.keys(tags).length) meta.tags = tags;
  return meta;
}

/** Observable in-memory target: one retained buffer, no fragment list plus final concatenation copy. */
class ProgressiveByteSink {
  private storage = new Uint8Array(0);
  private length = 0;
  private peakAllocation = 0;

  get byteLength(): number {
    return this.length;
  }

  get peakAllocatedBytes(): number {
    return this.peakAllocation;
  }

  write(part: ArrayBuffer | Uint8Array): void {
    const bytes = part instanceof Uint8Array ? part : new Uint8Array(part);
    const required = this.length + bytes.byteLength;
    if (required > this.storage.byteLength) {
      let capacity = Math.max(1024, this.storage.byteLength);
      while (capacity < required) capacity = Math.max(required, capacity * 2);
      const grown = new Uint8Array(capacity);
      this.peakAllocation = Math.max(this.peakAllocation, this.storage.byteLength + grown.byteLength);
      grown.set(this.storage.subarray(0, this.length));
      this.storage = grown;
    }
    this.storage.set(bytes, this.length);
    this.length = required;
  }

  finish(): Uint8Array {
    if (this.storage.byteLength !== this.length) {
      const tight = this.storage.slice(0, this.length);
      this.peakAllocation = Math.max(this.peakAllocation, this.storage.byteLength + tight.byteLength);
      this.storage = tight;
    }
    return this.storage;
  }
}

function copyBytes(source: ArrayBufferLike | ArrayBufferView<ArrayBufferLike>): Uint8Array<ArrayBuffer> {
  const view = ArrayBuffer.isView(source)
    ? new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
    : new Uint8Array(source);
  const out = new Uint8Array(view.byteLength);
  out.set(view);
  return out;
}

function isBlobNotReadableError(error: unknown): boolean {
  return !!error
    && typeof error === 'object'
    && (error as { name?: unknown }).name === 'NotReadableError';
}

function descriptionBoxesFromSampleEntry(entry: BoxNode | undefined): Mp4BoxKind[] {
  if (!entry?.boxes?.length) return [];
  const boxes: Mp4BoxKind[] = [];
  for (const box of entry.boxes) {
    if (!box || box.type === 'sinf') continue;
    boxes.push(box as unknown as Mp4BoxKind);
  }
  return boxes;
}

function sampleEntriesForTrack(file: Mp4ISOFile, trackId: number): BoxNode[] {
  const trak = file.getTrackById(trackId);
  const entries = trak?.mdia?.minf?.stbl?.stsd?.entries;
  return (entries ?? []) as unknown as BoxNode[];
}

function directBox(entry: BoxNode | undefined, fourcc: string): BoxNode | undefined {
  if (!entry) return undefined;
  const direct = (entry as unknown as Record<string, unknown>)[fourcc];
  if (direct && typeof direct === 'object') return direct as BoxNode;
  return findChildBox(entry, fourcc);
}

function serializeBoxPayload(box: BoxNode | undefined, MP4Box: Mp4boxModule): Uint8Array | undefined {
  if (!box || typeof box.write !== 'function') return undefined;
  try {
    const stream = new MP4Box.DataStream(undefined, 0, MP4Box.Endianness.BIG_ENDIAN);
    box.write(stream);
    const bytes = streamToBytes(stream);
    if (bytes.byteLength < 8) return undefined;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const header = view.getUint32(0) === 1 ? 16 : 8;
    return bytes.byteLength >= header ? bytes.slice(header) : undefined;
  } catch {
    return undefined;
  }
}

interface SampleDescriptionEvidence {
  nativeCodecTag: string;
  framing: DemuxTrackRepresentation['framing'];
  accessUnitGrouping: DemuxTrackRepresentation['accessUnitGrouping'];
  parameterSetLocation: DemuxTrackRepresentation['parameterSetLocation'];
  description?: Uint8Array;
  descriptionRecord?: DemuxTrackRepresentation['descriptionRecord'];
  nalLengthSize?: number;
}

function sampleDescriptionEvidence(entry: BoxNode | undefined, codec: string, MP4Box: Mp4boxModule): SampleDescriptionEvidence {
  const nativeCodecTag = entry?.type ?? codec;
  if (codec === 'h264') {
    const configBox = directBox(entry, 'avcC');
    const description = serializeBoxPayload(configBox, MP4Box);
    const inBand = nativeCodecTag.toLowerCase().startsWith('avc3');
    return {
      nativeCodecTag,
      framing: 'avc',
      accessUnitGrouping: 'one-access-unit-per-chunk',
      parameterSetLocation: inBand ? (description ? 'both' : 'in-band') : (description ? 'description' : 'in-band'),
      ...(description ? { description, descriptionRecord: 'avc-decoder-configuration-record' as const } : {}),
      ...(typeof configBox?.lengthSizeMinusOne === 'number'
        ? { nalLengthSize: (configBox.lengthSizeMinusOne & 3) + 1 }
        : {}),
    };
  }
  if (codec === 'hevc') {
    const configBox = directBox(entry, 'hvcC');
    const description = serializeBoxPayload(configBox, MP4Box);
    const inBand = nativeCodecTag.toLowerCase().startsWith('hev1');
    return {
      nativeCodecTag,
      framing: 'hevc',
      accessUnitGrouping: 'one-access-unit-per-chunk',
      parameterSetLocation: inBand ? (description ? 'both' : 'in-band') : (description ? 'description' : 'in-band'),
      ...(description ? { description, descriptionRecord: 'hevc-decoder-configuration-record' as const } : {}),
      ...(typeof configBox?.lengthSizeMinusOne === 'number'
        ? { nalLengthSize: (configBox.lengthSizeMinusOne & 3) + 1 }
        : {}),
    };
  }
  if (codec === 'aac') {
    const description = audioSpecificConfigFromEntry(entry as AudioSampleEntryNode);
    return {
      nativeCodecTag,
      framing: 'raw',
      accessUnitGrouping: 'one-access-unit-per-chunk',
      parameterSetLocation: description ? 'description' : 'not-applicable',
      ...(description ? { description: description.slice(), descriptionRecord: 'audio-specific-config' as const } : {}),
    };
  }
  const configType = codec === 'vp8' || codec === 'vp9' ? 'vpcC' : codec === 'av1' ? 'av1C' : undefined;
  const description = configType ? serializeBoxPayload(directBox(entry, configType), MP4Box) : undefined;
  return {
    nativeCodecTag,
    framing: codec === 'av1' ? 'obu' : 'raw',
    accessUnitGrouping: 'one-frame-per-chunk',
    parameterSetLocation: description ? 'description' : 'not-applicable',
    ...(description ? { description, descriptionRecord: 'codec-private' as const } : {}),
  };
}

export function mp4boxSampleEvidence(
  sample: Mp4Sample,
  trackIndex: number,
  type: TrackType,
  codec: string,
  description: SampleDescriptionEvidence,
): PacketInfo {
  const timescale = sample.timescale > 0 ? sample.timescale : 1;
  const payload = sample.data ? copyBytes(sample.data) : new Uint8Array();
  return {
    trackIndex,
    trackType: type,
    // Canonical codec tokens are an audio/video semantic axis. Auxiliary ISO tracks (for example
    // QuickTime `tmcd`) retain their track type and native metadata without inventing an AV codec.
    ...(type === 'video' || type === 'audio' ? { codec } : {}),
    size: sample.size,
    ptsUs: (sample.cts * 1_000_000) / timescale,
    dtsUs: (sample.dts * 1_000_000) / timescale,
    durationUs: (sample.duration * 1_000_000) / timescale,
    keyframe: !!sample.is_sync,
    payload,
    framing: description.framing,
    ...(description.nalLengthSize !== undefined ? { nalLengthSize: description.nalLengthSize } : {}),
    ...(description.description ? { decoderConfig: description.description.slice() } : {}),
    randomAccessKind: sample.is_sync ? 'sync-sample' : 'non-sync-sample',
  };
}

function trackRepresentation(
  trackIndex: number,
  codec: string,
  entry: BoxNode | undefined,
  timescale: number,
  MP4Box: Mp4boxModule,
): DemuxTrackRepresentation {
  const evidence = sampleDescriptionEvidence(entry, codec, MP4Box);
  return {
    trackIndex,
    packetOrdering: 'decode',
    ...(timescale > 0 ? { timebase: { numerator: 1, denominator: timescale } } : {}),
    framing: evidence.framing,
    accessUnitGrouping: evidence.accessUnitGrouping,
    parameterSetLocation: evidence.parameterSetLocation,
    nativeCodecTag: evidence.nativeCodecTag,
    ...(evidence.description ? { description: evidence.description.slice() } : {}),
    ...(evidence.descriptionRecord ? { descriptionRecord: evidence.descriptionRecord } : {}),
  };
}

function sampleEntryTypeFromTrack(
  file: Mp4ISOFile,
  trackId: number,
  rawCodec: string,
): { sampleEntryType: string; descriptionBoxes: Mp4BoxKind[]; sampleEntries: BoxNode[] } | null {
  const entry = sampleEntryForTrack(file, trackId, rawCodec) ?? sampleEntryForTrack(file, trackId);
  const entryType = typeof entry?.type === 'string' && entry.type.length ? entry.type : rawCodec.split('.')[0];
  if (!entryType) return null;
  if (ENCRYPTED_ENTRY_TYPES.has(entryType.toLowerCase())) {
    throw createNotApplicableError(
      ENGINE_ID,
      'mux',
      `protected sample entry '${entryType}' cannot be re-authored without decrypt`,
      {},
      'MP4BOX_PROTECTED_SAMPLE_ENTRY_UNSUPPORTED',
    );
  }
  const sampleEntries = sampleEntriesForTrack(file, trackId);
  if (sampleEntries.length === 0) return null;
  return {
    sampleEntryType: entryType,
    descriptionBoxes: descriptionBoxesFromSampleEntry(entry),
    sampleEntries,
  };
}

function assertMuxSampleEntries(
  entries: BoxNode[],
  codec: string,
  operation: 'mux' | 'remux',
  tuple: Partial<ApplicabilityTupleSummary> = {},
): void {
  for (const entry of entries) {
    const entryType = entry.type.toLowerCase();
    if (ENCRYPTED_ENTRY_TYPES.has(entryType)) {
      throw createNotApplicableError(
        ENGINE_ID,
        operation,
        `protected sample entry '${entry.type}' cannot be copied without decrypt`,
        tuple,
        'MP4BOX_PROTECTED_SAMPLE_ENTRY_UNSUPPORTED',
      );
    }
    if (canonicalCodec(entry.type) !== codec) {
      throw createNotApplicableError(
        ENGINE_ID,
        operation,
        `sample-entry change '${entry.type}' cannot be flattened into canonical codec '${codec}'`,
        tuple,
        'MP4BOX_MULTI_DESCRIPTION_CODEC_CHANGE_UNSUPPORTED',
      );
    }
    const requiredConfig = codec === 'h264'
      ? 'avcC'
      : codec === 'hevc'
        ? 'hvcC'
        : codec === 'vp8' || codec === 'vp9'
          ? 'vpcC'
          : codec === 'av1'
            ? 'av1C'
            : undefined;
    if (requiredConfig && !directBox(entry, requiredConfig)) {
      // A declared sample entry missing its mandatory decoder record is malformed media, not an
      // ordinary unsupported tuple. Keep it on the ERROR/FAIL path.
      throw new Error(`${ENGINE_ID}: sample entry '${entry.type}' is missing required ${requiredConfig}`);
    }
  }
}

function preparedChunkOrigin(chunks: Mp4boxPreparedChunk[]): { originUs: number; originTicks: number } {
  let originUs = Infinity;
  let originTicks = Infinity;
  for (const chunk of chunks) {
    originUs = Math.min(originUs, chunk.ptsUs, chunk.dtsUs ?? chunk.ptsUs);
    const timing = chunk.mp4boxTiming;
    if (timing) originTicks = Math.min(originTicks, timing.cts, timing.dts);
  }
  return { originUs, originTicks };
}

function rebasePreparedChunksToZero(chunks: Mp4boxPreparedChunk[]): { originUs: number; originTicks: number } {
  const { originUs, originTicks } = preparedChunkOrigin(chunks);
  if (Number.isFinite(originUs) && originUs !== 0) {
    for (const chunk of chunks) {
      chunk.ptsUs -= originUs;
      if (chunk.dtsUs !== undefined) chunk.dtsUs -= originUs;
    }
  }
  if (Number.isFinite(originTicks) && originTicks !== 0) {
    for (const chunk of chunks) {
      const timing = chunk.mp4boxTiming;
      if (!timing) continue;
      timing.cts -= originTicks;
      timing.dts -= originTicks;
    }
  }
  return { originUs, originTicks };
}

function preserveSelectedPresentationTimeline(selected: PreparedMuxTrackCandidate[]): void {
  const origins = selected.map((candidate) => preparedChunkOrigin(candidate.track.chunks));
  const finiteOrigins = origins.map((origin) => origin.originUs).filter(Number.isFinite);
  const commonOriginUs = finiteOrigins.length ? Math.min(...finiteOrigins) : 0;
  selected.forEach((candidate, index) => {
    const info = candidate.track.mp4boxMux;
    if (!info) return;
    const origin = rebasePreparedChunksToZero(candidate.track.chunks);
    info.mediaOriginTicks = Number.isFinite(origin.originTicks) ? origin.originTicks : 0;
    // Existing edits already define presentation mapping. Otherwise author an empty edit equal to
    // this track's offset from the common selected-track origin.
    info.presentationOffsetUs = info.edits.length === 0 && Number.isFinite(origins[index]?.originUs)
      ? Math.max(0, origins[index]!.originUs - commonOriginUs)
      : 0;
  });
}

function selectPreparedMuxTracks(
  candidates: PreparedMuxTrackCandidate[],
  inputCount: number,
  options: Record<string, unknown> | undefined,
): PreparedMuxTrackCandidate[] {
  const requested = Array.isArray(options?.trackSelect)
    ? options.trackSelect.filter((x): x is string => typeof x === 'string')
    : [];
  if (requested.length > 0) {
    const out: PreparedMuxTrackCandidate[] = [];
    const seen = new Set<PreparedMuxTrackCandidate>();
    for (const selector of requested) {
      const match = /^([a-z]+):(\d+)(?:@(\d+))?$/.exec(selector);
      if (!match) continue;
      const type = match[1] === 'video' || match[1] === 'audio' ? match[1] : undefined;
      if (!type) continue;
      const typeOrdinal = Number(match[2]);
      const inputIndex = match[3] !== undefined ? Number(match[3]) : 0;
      const found = candidates.find(
        (c) => c.inputIndex === inputIndex && c.type === type && c.typeOrdinal === typeOrdinal,
      );
      if (found && !seen.has(found)) {
        seen.add(found);
        out.push(found);
      }
    }
    return out;
  }

  if (inputCount <= 1) return candidates;

  const videoFromFirst = candidates.filter((c) => c.inputIndex === 0 && c.type === 'video');
  if (videoFromFirst.length === 0) return candidates.filter((c) => c.type === 'audio');

  const audioFromLater = candidates.filter((c) => c.inputIndex > 0 && c.type === 'audio');
  const selected = [...videoFromFirst, ...audioFromLater];
  return selected.length > 0 ? selected : candidates;
}

function usToTrackTicks(us: number, timescale: number, minimum = 0): number {
  if (!Number.isFinite(us)) return minimum;
  const ticks = Math.round((Math.max(0, us) / 1_000_000) * timescale);
  return Math.max(minimum, ticks);
}

function trackDurationUs(track: EncodedTracks['tracks'][number]): number {
  let endUs = 0;
  for (const chunk of track.chunks) {
    endUs = Math.max(
      endUs,
      chunk.ptsUs + chunk.durationUs,
      (chunk.dtsUs ?? chunk.ptsUs) + chunk.durationUs,
    );
  }
  return endUs;
}

function sampleTimingForChunk(chunk: Mp4boxPreparedChunk, timescale: number): Mp4boxSampleTiming {
  const timing = chunk.mp4boxTiming;
  if (timing) return timing;
  return {
    cts: usToTrackTicks(chunk.ptsUs, timescale),
    // MP4Box requires a scheduling DTS; fall back locally without claiming observed DTS evidence.
    dts: usToTrackTicks(chunk.dtsUs ?? chunk.ptsUs, timescale),
    duration: usToTrackTicks(chunk.durationUs, timescale, 1),
  };
}

function streamToBytes(stream: Mp4boxDataStream): Uint8Array {
  const buffer = stream.buffer;
  const byteLength = stream.byteLength;
  return new Uint8Array(buffer.slice(0, byteLength));
}

function installSampleEntries(file: Mp4ISOFile, trackId: number, entries: BoxNode[]): void {
  const outputTrack = file.getTrackById(trackId);
  const stsd = outputTrack?.mdia?.minf?.stbl?.stsd;
  if (!stsd) throw new Error(`${ENGINE_ID}: output track ${trackId} has no stsd`);
  stsd.entries = entries as never;
}

function authorPresentationEdits(
  MP4Box: Mp4boxModule,
  file: Mp4ISOFile,
  trackId: number,
  info: Mp4boxMuxInfo,
  movieTimescale: number,
  mediaDurationTicks: number,
  tuple: Partial<ApplicabilityTupleSummary>,
): void {
  const entries: Mp4Edit[] = [];
  if (info.edits.length > 0) {
    for (const edit of info.edits) {
      if (!((edit.mediaRateInteger === 1 && edit.mediaRateFraction === 0) || edit.mediaTime === -1)) {
        throw createNotApplicableError(
          ENGINE_ID,
          'mux',
          'only rate-one and empty edit-list entries can be preserved',
          tuple,
          'MP4BOX_EDIT_RATE_UNSUPPORTED',
        );
      }
      const mediaTime = edit.mediaTime < 0 ? -1 : edit.mediaTime - info.mediaOriginTicks;
      if (mediaTime < -1) {
        throw createNotApplicableError(
          ENGINE_ID,
          'mux',
          'edit media_time would become negative after writer timeline normalization',
          tuple,
          'MP4BOX_EDIT_TIMELINE_UNREPRESENTABLE',
        );
      }
      entries.push({
        segmentDuration: Math.max(0, Math.round(edit.segmentDuration * movieTimescale / Math.max(1, info.movieTimescale))),
        mediaTime,
        mediaRateInteger: edit.mediaRateInteger,
        mediaRateFraction: edit.mediaRateFraction,
      });
    }
  } else if (info.presentationOffsetUs > 0) {
    entries.push({
      segmentDuration: Math.round(info.presentationOffsetUs * movieTimescale / 1_000_000),
      mediaTime: -1,
      mediaRateInteger: 1,
      mediaRateFraction: 0,
    });
    entries.push({
      segmentDuration: Math.round(mediaDurationTicks * movieTimescale / Math.max(1, file.getTrackById(trackId)?.mdia?.mdhd?.timescale ?? 1)),
      mediaTime: 0,
      mediaRateInteger: 1,
      mediaRateFraction: 0,
    });
  }
  if (entries.length === 0) return;

  const track = file.getTrackById(trackId);
  if (!track) throw new Error(`${ENGINE_ID}: output track ${trackId} disappeared before edit authoring`);
  // mp4box 2.3.0 registers edts/elst internally but intentionally does not export their constructors.
  // Build the two boxes on the public Box/FullBox writer surface instead of reaching through an
  // unstable private registry. Keeping the writer local also makes the exact edit payload auditable.
  const edts = new MP4Box.Box();
  edts.type = 'edts';
  edts.boxes = [];
  edts.write = (stream) => {
    edts.size = 0;
    edts.writeHeader(stream);
    for (const child of edts.boxes ?? []) {
      child.write(stream);
      edts.size += child.size;
    }
    if (edts.sizePosition === undefined) throw new Error(`${ENGINE_ID}: edts writer omitted its size field`);
    stream.adjustUint32(edts.sizePosition, edts.size);
  };
  const elst = new MP4Box.FullBox() as import('mp4box').FullBox & {
    entries: Array<{
      segment_duration: number;
      media_time: number;
      media_rate_integer: number;
      media_rate_fraction: number;
    }>;
  };
  elst.type = 'elst';
  elst.version = entries.some((entry) => entry.segmentDuration > 0xffff_ffff || entry.mediaTime > 0x7fff_ffff) ? 1 : 0;
  elst.flags = 0;
  elst.entries = entries.map((entry) => ({
    segment_duration: entry.segmentDuration,
    media_time: entry.mediaTime,
    media_rate_integer: entry.mediaRateInteger,
    media_rate_fraction: entry.mediaRateFraction,
  }));
  elst.write = (stream) => {
    const version1 = elst.version === 1
      || elst.entries.some((entry) => entry.segment_duration > 0xffff_ffff || entry.media_time > 0x7fff_ffff);
    elst.version = version1 ? 1 : 0;
    elst.size = 4 + elst.entries.length * (version1 ? 20 : 12);
    // mp4box's FullBox declaration narrows this to MultiBufferStream although the package's own
    // writers pass DataStream here; runtime FullBox.writeHeader only needs the shared write API.
    elst.writeHeader(stream as never);
    stream.writeUint32(elst.entries.length);
    for (const entry of elst.entries) {
      if (version1) {
        stream.writeUint64(entry.segment_duration);
        stream.writeInt64(entry.media_time);
      } else {
        stream.writeUint32(entry.segment_duration);
        stream.writeInt32(entry.media_time);
      }
      stream.writeInt16(entry.media_rate_integer);
      stream.writeInt16(entry.media_rate_fraction);
    }
  };
  edts.addBox(elst);
  track.addBox(edts as never);
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  throw signal.reason ?? new DOMException('Operation aborted', 'AbortError');
}

async function raceAbort<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  throwIfAborted(signal);
  return await new Promise<T>((resolve, reject) => {
    const aborted = (): void => reject(signal.reason ?? new DOMException('Operation aborted', 'AbortError'));
    signal.addEventListener('abort', aborted, { once: true });
    work.then(
      (value) => {
        signal.removeEventListener('abort', aborted);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', aborted);
        reject(error);
      },
    );
  });
}

interface ReadRange {
  start: number;
  end: number;
}

/** Return a non-overlapping Blob window at/after MP4Box's requested absolute offset. */
function nextUnreadWindow(
  requestedOffset: number,
  size: number,
  ranges: readonly ReadRange[],
): ReadRange | undefined {
  let start = Math.max(0, Math.min(size, Math.trunc(requestedOffset)));
  const ordered = [...ranges].sort((a, b) => a.start - b.start);
  for (const range of ordered) {
    if (start >= range.start && start < range.end) start = range.end;
    if (start < range.start) {
      return { start, end: Math.min(size, start + READ_CHUNK_BYTES, range.start) };
    }
  }
  return start < size ? { start, end: Math.min(size, start + READ_CHUNK_BYTES) } : undefined;
}

function firstUnreadWindow(size: number, ranges: readonly ReadRange[]): ReadRange | undefined {
  return nextUnreadWindow(0, size, ranges);
}

function fallbackRequest(
  operation: Operation,
  inputs: MediaInput[] = [],
  outputContainer?: string,
  options: Readonly<Record<string, unknown>> = {},
): ConcreteOperationRequest {
  return {
    protocol: CONCRETE_OPERATION_PROTOCOL,
    scenarioId: `mp4box/fallback-${operation}`,
    operation,
    inputs: inputs.map((input) => ({
      id: input.id,
      mime: input.mime,
      container: 'mp4',
      ...(input.sizeBytes !== undefined ? { sizeBytes: input.sizeBytes } : {}),
      mutated: input.mutated === true,
      sourceEvidence: 'UNRESOLVED',
      tracks: [],
    })),
    ...(outputContainer ? { output: { container: outputContainer } } : {}),
    options: outputContainer ? { ...options, container: outputContainer } : options,
  };
}

/**
 * mp4box.js engine (2.3.0): probe + demux + remux-to-fragmented-MP4 for the ISO-BMFF family.
 * Pure-JS — init() only dynamically imports the lib (UNTIMED); there is no WASM/Worker to spin up.
 */
export class Mp4boxEngine implements MediaEngine {
  readonly id = ENGINE_ID;
  /**
   * One MP4Box operation is already an independent pure-JS execution. Repeating the global
   * cross-process memory sampler inside every timing repetition adds no MP4Box-specific evidence
   * and can take tens of seconds per sample in Chromium, so retain one bounded in-operation sample
   * and the terminal endpoint without a settle burst.
   */
  readonly benchmarkLimits = {
    maxInnerIterations: 1,
    memoryWindow: {
      sampleImmediatelyDuringOperation: true,
      maxOperationSamples: 1,
      settleWindowMs: 0,
      sampleTimeoutMs: 1_000,
    },
  } as const;

  private mp4box: Mp4boxModule | null = null;
  private readonly lifecycle = new AdapterLifecycleController(ENGINE_ID);
  private readonly fallbackAbort = new AbortController();
  private readonly activeFiles = new Set<Mp4ISOFile>();
  private configState = freshConfigState();
  private operationStartedAt = 0;

  /** The best-path config chosen; recorded per §8.5 / surfaced to the harness. */
  get configUsed(): object {
    return captureConfigUsedSnapshot(ENGINE_ID, this.configState, { requireProfile: true });
  }

  capabilities(): CapabilitySet {
    return {
      // HONEST: mp4box parses boxes (probe), walks sample tables (demux), fragments ISOBMFF
      // (remux → fMP4), and muxes MP4Box-prepared encoded tracks into MP4. It NEVER produces pixels
      // (decodeFrames/seek-to-frame), re-encodes (transcode), or trims frame-accurately → those are
      // omitted so the runner negotiates NA(engine). `decrypt` is genuinely impossible (CENC
      // signalling parsed, no AES). Omissions here are true NAs, not hidden features.
      operations: {
        probe: true,
        demux: true,
        remux: true,
        mux: true,
      },
      // ISO-BMFF only. 'mov' shares the box structure; fragmented-MP4/CMAF are the same family,
      // surfaced via the 'fragmented' feature, not a separate container token.
      containersIn: [...MP4BOX_INPUT_CONTAINERS],
      // Remux writes FRAGMENTED MP4 (fMP4/CMAF), container token 'mp4'.
      containersOut: [...MP4BOX_OUTPUT_CONTAINERS],
      // Codecs mp4box can IDENTIFY / DEMUX from the sample table (it does not decode/encode them).
      videoCodecs: [...MP4BOX_VIDEO_CODECS],
      audioCodecs: [...MP4BOX_AUDIO_CODECS],
      videoCodecsIn: [...MP4BOX_VIDEO_CODECS],
      audioCodecsIn: [...MP4BOX_AUDIO_CODECS],
      videoCodecsOut: [...MP4BOX_VIDEO_CODECS],
      audioCodecsOut: [...MP4BOX_AUDIO_CODECS],
      // Parses CENC signalling (pssh/senc/...) but does NOT decrypt → declare none.
      encryption: [],
      // 'fragmented'        : remux produces fMP4/CMAF.
      // 'metadata:read'     : probe reads duration/dims/fps/rotation/brands/language; unwraps CENC
      //                       'encv'/'enca' to the original codec via sinf→frma.data_format, and
      //                       derives video fps from fragment_duration for fragmented inputs.
      // 'metadata:protected-tracks': CENC protected sample entries are unwrapped for track metadata.
      // 'mux:vfr-timestamps': prepareMuxTracks preserves exact MP4 sample cts/dts/duration ticks.
      // 'webcodecs:independent': probe/demux/remux are pure-JS and never touch the browser codec
      //                          gate, so the runner must not browser-gate them on codec availability.
      features: [
        'fragmented',
        'metadata:read',
        'metadata:protected-tracks',
        'mux:vfr-timestamps',
        'packets:dts',
        // 'mux:roundtrip-compare' enables robustness/prop_demux_mux_roundtrip_eq (demux(mux(x))==x):
        // mux copies coded sample bytes verbatim while preserving cts/dts ticks, so a re-demux of the
        // muxed MP4 reproduces the source packet table. Browser-verified PASS.
        //
        // NOTE: 'remux:compose' is deliberately NOT declared. The NA audit proposed it for
        // prop_double_remux_stable (remux(remux(mp4))==remux(mp4)), but a real-browser run FAILED: the
        // SECOND remux of mp4box's own fragmented output throws "Cannot read properties of undefined
        // (reading 'fragment_duration')" — mp4box cannot re-fragment a file it already fragmented. So
        // double-remux stability is a GENUINE NA for this engine and stays undeclared.
        'mux:roundtrip-compare',
        'webcodecs:independent',
      ],
      probeReadModes: ['progressive'],
    };
  }

  supports(request: ConcreteOperationRequest) {
    return decideMp4boxSupport(request);
  }

  /** UNTIMED (§0.7): dynamically import the (pure-JS) lib. No WASM/Worker/encoder warmup needed. */
  async init(context?: LifecycleContext): Promise<void> {
    const call = context ?? this.fallbackLifecycle('support');
    await this.lifecycle.init(call, async () => {
      if (!this.mp4box) this.mp4box = await import('mp4box');
    });
  }

  async dispose(context?: LifecycleContext): Promise<void> {
    const call = context ?? this.fallbackLifecycle('cleanup');
    await this.lifecycle.dispose(call, () => {
      for (const file of this.activeFiles) {
        try {
          file.stop();
        } catch {
          // Per-operation cleanup already records stop errors; disposal is an idempotent last resort.
        }
      }
      this.activeFiles.clear();
      this.mp4box = null;
      this.configState = { ...this.configState, activeFiles: 0, cleanupComplete: true };
    });
  }

  private fallbackLifecycle(phase: LifecycleContext['phase']): LifecycleContext {
    return { signal: this.fallbackAbort.signal, phase, emit: () => undefined };
  }

  private fallbackOperation(
    operation: Operation,
    inputs: MediaInput[] = [],
    outputContainer?: string,
    options: Readonly<Record<string, unknown>> = {},
  ): OperationContext {
    return {
      ...this.fallbackLifecycle('functional'),
      checkedSupport: SUPPORTED_CHECKED_SUPPORT_SNAPSHOT,
      request: fallbackRequest(operation, inputs, outputContainer, options),
    };
  }

  private beginOperation(operation: Operation, keepMdatData: boolean): void {
    this.operationStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.configState = {
      ...freshConfigState(),
      operation,
      keepMdatData,
      writerMode: operation === 'remux' || operation === 'mux' ? 'fragmented-mp4' : 'none',
      targetMode: operation === 'remux' || operation === 'mux' ? 'buffer' : 'none',
      cleanupComplete: false,
    };
  }

  private elapsedMs(): number {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    return Math.max(0, now - this.operationStartedAt);
  }

  private assertSupported(context: OperationContext): void {
    const decision = decideMp4boxSupport(context.request);
    if (!decision.supported) throw mp4boxDecisionError(context.request, decision);
  }

  private lib(): Mp4boxModule {
    if (!this.mp4box) throw new Error(`${ENGINE_ID}: init() must run before operations (lib not loaded)`);
    return this.mp4box;
  }

  /** Wrap an ArrayBuffer as the MP4BoxBuffer (carrying fileStart) that appendBuffer requires. */
  private makeBuffer(ab: ArrayBuffer, fileStart = 0): import('mp4box').MP4BoxBuffer {
    return this.lib().MP4BoxBuffer.fromArrayBuffer(ab, fileStart);
  }

  /**
   * Drive an ISOFile to completion with Blob slices at MP4Box's requested absolute byte offsets.
   * `keepMdatData` MUST be true for demux/remux (else discardMdatData drops media and no samples are
   * produced); probe leaves it false (moov-only, minimal memory). 2.x onError takes (module, message).
   */
  private async parseToInfo(
    input: MediaInput,
    keepMdatData: boolean,
    context: OperationContext,
    onReady?: ParsedReadyHook,
  ): Promise<ParsedSession> {
    const MP4Box = this.lib();
    const file = MP4Box.createFile(keepMdatData);
    this.activeFiles.add(file);
    this.configState = { ...this.configState, activeFiles: this.activeFiles.size };
    let info: Mp4Movie | undefined;
    let operationError: unknown;
    let closed = false;
    let stopped = false;
    let stopError: unknown;
    file.onError = (module: string, message: string) => {
      operationError ??= new Error(`mp4box parse/processing error [${module}]: ${message}`);
      this.configState = { ...this.configState, lateErrorObserved: info !== undefined };
    };
    file.onReady = (ready: Mp4Movie) => {
      info = ready;
      if (!onReady) return;
      try {
        onReady(file, ready, () => {
          throwIfAborted(context.signal);
          if (operationError !== undefined) throw operationError;
        });
      } catch (error) {
        operationError ??= error;
      }
    };
    const stopFile = (): void => {
      if (stopped) return;
      stopped = true;
      try {
        file.stop();
        this.configState = { ...this.configState, stopCalled: true };
      } catch (error) {
        stopError ??= error;
      }
    };
    const abort = (): void => stopFile();
    if (context.signal.aborted) abort();
    else context.signal.addEventListener('abort', abort, { once: true });

    const close = (primaryError?: unknown): void => {
      if (closed) return;
      closed = true;
      context.signal.removeEventListener('abort', abort);
      stopFile();
      file.onReady = undefined;
      file.onSamples = undefined;
      file.onSegment = undefined;
      file.onError = undefined;
      this.activeFiles.delete(file);
      this.configState = {
        ...this.configState,
        activeFiles: this.activeFiles.size,
        cleanupComplete: this.activeFiles.size === 0,
      };
      if (primaryError === undefined && stopError !== undefined) throw stopError;
    };

    try {
      throwIfAborted(context.signal);
      const blob = await raceAbort(input.blob(), context.signal);
      let arrayBufferFallback: Uint8Array<ArrayBuffer> | undefined;
      let readBytes = this.configState.inputBytes;
      const ranges: ReadRange[] = [];
      let window = firstUnreadWindow(blob.size, ranges);
      let iterations = 0;
      while (window) {
        if (++iterations > 1_000_000) throw new Error(`${ENGINE_ID}: progressive reader made no forward progress`);
        throwIfAborted(context.signal);
        let chunk: ArrayBuffer;
        try {
          chunk = await raceAbort(blob.slice(window.start, window.end).arrayBuffer(), context.signal);
        } catch (error) {
          if (!isBlobNotReadableError(error)) throw error;
          if (!arrayBufferFallback) {
            const full = await raceAbort(input.arrayBuffer(), context.signal);
            if (full.byteLength !== blob.size) {
              throw new Error(
                `${ENGINE_ID}: array-buffer fallback size ${full.byteLength} != blob size ${blob.size}`,
              );
            }
            arrayBufferFallback = new Uint8Array(full);
            this.configState = {
              ...this.configState,
              readerMode: 'blob-progressive-slices+verified-array-buffer-fallback',
              arrayBufferReadFallbacks: this.configState.arrayBufferReadFallbacks + 1,
            };
          }
          chunk = arrayBufferFallback.slice(window.start, window.end).buffer;
        }
        throwIfAborted(context.signal);
        const nextOffset = file.appendBuffer(this.makeBuffer(chunk, window.start), false);
        ranges.push(window);
        readBytes += chunk.byteLength;
        this.configState = {
          ...this.configState,
          inputBytes: readBytes,
          appendCount: this.configState.appendCount + 1,
          peakParserSampleBytes: Math.max(this.configState.peakParserSampleBytes, file.samplesDataSize ?? 0),
        };
        context.emit({ type: 'bytes-read', atMs: this.elapsedMs(), bytes: readBytes });
        if (operationError !== undefined) throw operationError;
        // Probe needs the complete moov, not the media payload. Sample consumers install their
        // callbacks synchronously from onReady and follow MP4Box's requested absolute byte ranges.
        if (info && !onReady && !keepMdatData) break;
        if (Number.isFinite(nextOffset) && nextOffset >= blob.size) break;
        window = Number.isFinite(nextOffset)
          ? nextUnreadWindow(nextOffset, blob.size, ranges)
          : undefined;
        // Without a usable seek hint, keep scanning unread gaps until a moov is found so malformed
        // media reaches the ordinary error path rather than masquerading as engine inapplicability.
        if (!window && !info) window = firstUnreadWindow(blob.size, ranges);
      }
      file.flush();
      throwIfAborted(context.signal);
      if (operationError !== undefined) throw operationError;
      if (!info) {
        throw createMalformedInputError(
          ENGINE_ID,
          context.request.operation,
          'parse',
          'mp4box: moov not found (not an ISO-BMFF/MP4 file, or moov truncated)',
          'MP4BOX_MOOV_NOT_FOUND',
          input.id,
        );
      }
      return {
        file,
        info,
        throwIfError: () => {
          throwIfAborted(context.signal);
          if (operationError !== undefined) throw operationError;
        },
        close,
      };
    } catch (error) {
      close(error);
      throw error;
    }
  }

  // ── probe ──────────────────────────────────────────────────────────────────────────────────
  async probe(input: MediaInput, context?: OperationContext): Promise<NormalizedMetadata> {
    const call = context ?? this.fallbackOperation('probe', [input]);
    return this.lifecycle.operation('probe', call, async () => {
      this.beginOperation('probe', false);
      this.assertSupported(call);
      const session = await this.parseToInfo(input, false, call);
      let primaryError: unknown;
      try {
        session.throwIfError();
        const metadata = toNormalizedMetadata(session.file, session.info);
        this.configState = {
          ...this.configState,
          codecConfigs: metadata.tracks.map((track, trackIndex) => ({
            trackIndex,
            codec: track.codec,
            nativeCodecTag: track.nativeCodecTag ?? null,
          })),
        };
        metadata.telemetry = { bytesRead: this.configState.inputBytes };
        metadata.probeEvidence = { readMode: 'progressive' };
        return validateAdapterResult(ENGINE_ID, 'probe', metadata);
      } catch (error) {
        primaryError = error;
        throw error;
      } finally {
        session.close(primaryError);
      }
    });
  }

  // ── demux ──────────────────────────────────────────────────────────────────────────────────
  /**
   * Walk the sample tables → a global, decode-ordered PacketInfo table. Timestamps convert from each
   * sample's `timescale` ticks to microseconds (ptsUs from cts, dtsUs from dts — B-frame reorder is
   * observable through cts != dts). keepMdatData=true so samples carry data; we read only the scalar
   * fields we need and release sample memory as we go.
   */
  async demux(input: MediaInput, context?: OperationContext): Promise<DemuxResult> {
    const call = context ?? this.fallbackOperation('demux', [input]);
    return this.lifecycle.operation('demux', call, async () => {
      this.beginOperation('demux', true);
      this.assertSupported(call);
      const packets: PacketInfo[] = [];
      const extractedCounts = new Map<number, number>();
      const idToIndex = new Map<number, number>();
      const presentedSampleNumbers = new Map<number, Set<number>>();
      let readyMetadata: NormalizedMetadata | undefined;
      let ownedPacketBytes = 0;
      let presentationEditFilteredSamples = 0;
      const session = await this.parseToInfo(input, true, call, (readyFile, readyInfo, throwIfError) => {
        readyMetadata = toNormalizedMetadata(readyFile, readyInfo);
        readyInfo.tracks.forEach((track, index) => {
          idToIndex.set(track.id, index);
          // Fragment callbacks may use fragment-local sample numbers, while getTrackSamplesInfo()
          // exposes a synthesized global table. Restrict this table-membership correction to the
          // non-fragmented MOV/MP4 sample tables for which the numbering identity is authoritative.
          const filter = readyInfo.isFragmented
            ? undefined
            : smallTrailingEditSampleNumbers(track, readyFile.getTrackSamplesInfo(track.id));
          if (filter) presentedSampleNumbers.set(track.id, filter);
        });
        readyFile.onSamples = (id: number, _user: unknown, samples: Mp4Sample[]) => {
          throwIfError();
          const trackIndex = idToIndex.get(id);
          if (trackIndex === undefined) throw new Error(`${ENGINE_ID}: samples emitted for unknown track ${id}`);
          const normalized = readyMetadata?.tracks[trackIndex];
          if (!normalized) throw new Error(`${ENGINE_ID}: missing track evidence for ${id}`);
          const entries = sampleEntriesForTrack(readyFile, id);
          const presented = presentedSampleNumbers.get(id);
          for (const sample of samples) {
            if (presented && !presented.has(sample.number)) {
              presentationEditFilteredSamples++;
              continue;
            }
            if (!sample.data || sample.data.byteLength !== sample.size) {
              throw new Error(`${ENGINE_ID}: track ${id} sample ${sample.number} has incomplete mdat payload`);
            }
            const entry = (sample.description as unknown as BoxNode | undefined)
              ?? entries[sample.description_index]
              ?? entries[0];
            const packet = mp4boxSampleEvidence(
              sample,
              trackIndex,
              normalized.type,
              normalized.codec,
              sampleDescriptionEvidence(entry, normalized.codec, this.lib()),
            );
            packets.push(packet);
            ownedPacketBytes += packet.payload?.byteLength ?? 0;
          }
          extractedCounts.set(id, (extractedCounts.get(id) ?? 0) + samples.length);
          const parserBytesBeforeRelease = readyFile.samplesDataSize ?? 0;
          const last = samples[samples.length - 1];
          if (last) readyFile.releaseUsedSamples(id, last.number + 1);
          this.configState = {
            ...this.configState,
            releasedSamples: this.configState.releasedSamples + samples.length,
            peakParserSampleBytes: Math.max(this.configState.peakParserSampleBytes, parserBytesBeforeRelease),
            peakOwnedSampleBytes: Math.max(this.configState.peakOwnedSampleBytes, ownedPacketBytes),
          };
        };
        for (const track of readyInfo.tracks) {
          // Fragmented getInfo() counts are only an onReady snapshot. Configure all declared tracks
          // now and prove non-zero/exact completion against the final sample list below.
          readyFile.setExtractionOptions(track.id, null, { nbSamples: PROCESS_BATCH_SAMPLES });
        }
        readyFile.start();
      });
      const { file, info } = session;
      let primaryError: unknown;
      try {
        session.throwIfError();
        for (const track of info.tracks) {
          const expected = trackSampleCount(file, track);
          if ((extractedCounts.get(track.id) ?? 0) !== expected) {
            throw new Error(`${ENGINE_ID}: incomplete extraction for track ${track.id}: ${extractedCounts.get(track.id) ?? 0}/${expected}`);
          }
        }

        packets.sort(
          (a, b) => (a.dtsUs ?? a.ptsUs) - (b.dtsUs ?? b.ptsUs) || a.trackIndex - b.trackIndex,
        );
        const metadata = toNormalizedMetadata(file, info);
        const representations = info.tracks.map((track, index) => trackRepresentation(
          index,
          metadata.tracks[index]?.codec ?? canonicalCodec(track.codec),
          sampleEntriesForTrack(file, track.id)[0],
          track.timescale,
          this.lib(),
        ));
        this.configState = {
          ...this.configState,
          codecConfigs: representations.map((representation) => ({
            trackIndex: representation.trackIndex,
            codec: metadata.tracks[representation.trackIndex]?.codec ?? 'unknown',
            framing: representation.framing,
            descriptionBytes: representation.description?.byteLength ?? 0,
          })),
          presentationEditFilteredSamples,
        };
        const telemetry = { bytesRead: this.configState.inputBytes, packetCount: packets.length };
        metadata.telemetry = telemetry;
        return validateAdapterResult(ENGINE_ID, 'demux', {
          metadata,
          packets,
          packetOrdering: 'decode',
          representations,
          telemetry,
        }, { requireExplicitCodedRepresentation: true });
      } catch (error) {
        primaryError = error;
        throw error;
      } finally {
        for (const track of info.tracks) {
          try {
            file.unsetExtractionOptions(track.id);
          } catch {
            // stop()/session cleanup is authoritative; an unset diagnostic must not mask the result.
          }
        }
        session.close(primaryError);
      }
    });
  }

  async prepareMuxTracks(
    inputs: MediaInput[],
    options?: Record<string, unknown>,
    context?: OperationContext,
  ): Promise<EncodedTracks> {
    const outputContainer = typeof options?.container === 'string' ? options.container : 'mp4';
    const call = context ?? this.fallbackOperation('mux', inputs, outputContainer, options);
    return this.lifecycle.operation('prepareMuxTracks', call, async () => {
      this.beginOperation('mux', true);
      this.assertSupported(call);
      if (inputs.length === 0) throw new Error(`${ENGINE_ID}: mux preparation requires at least one input`);
      const candidates: PreparedMuxTrackCandidate[] = [];

      for (let inputIndex = 0; inputIndex < inputs.length; inputIndex++) {
        const input = inputs[inputIndex];
        if (!input) continue;
        const collectedByTrack = new Map<number, CollectedSample[]>();
        const extractedCounts = new Map<number, number>();
        let ownedBytes = candidates.reduce(
          (sum, candidate) => sum + candidate.track.chunks.reduce((trackSum, chunk) => trackSum + chunk.data.byteLength, 0),
          0,
        );
        const session = await this.parseToInfo(input, true, call, (readyFile, readyInfo, throwIfError) => {
          const mediaTracks = readyInfo.tracks.filter((track) => {
            const type = trackType(track);
            return type === 'video' || type === 'audio';
          });
          if (mediaTracks.length === 0) throw new Error(`${ENGINE_ID}: parsed ISO BMFF contains no audio/video tracks`);
          readyFile.onSamples = (id: number, _user: unknown, samples: Mp4Sample[]) => {
            throwIfError();
            let collected = collectedByTrack.get(id);
            if (!collected) {
              collected = [];
              collectedByTrack.set(id, collected);
            }
            for (const sample of samples) {
              if (!sample.data || sample.data.byteLength !== sample.size) {
                throw new Error(`${ENGINE_ID}: track ${id} sample ${sample.number} has incomplete mdat payload`);
              }
              const data = copyBytes(sample.data);
              ownedBytes += data.byteLength;
              collected.push({
                data,
                duration: sample.duration,
                cts: sample.cts,
                dts: sample.dts,
                timescale: sample.timescale > 0 ? sample.timescale : 1,
                isSync: !!sample.is_sync,
                number: sample.number,
                size: sample.size,
                descriptionIndex: sample.description_index,
              });
            }
            extractedCounts.set(id, (extractedCounts.get(id) ?? 0) + samples.length);
            const parserBytesBeforeRelease = readyFile.samplesDataSize ?? 0;
            const last = samples[samples.length - 1];
            if (last) readyFile.releaseUsedSamples(id, last.number + 1);
            this.configState = {
              ...this.configState,
              releasedSamples: this.configState.releasedSamples + samples.length,
              peakOwnedSampleBytes: Math.max(this.configState.peakOwnedSampleBytes, ownedBytes),
              peakParserSampleBytes: Math.max(this.configState.peakParserSampleBytes, parserBytesBeforeRelease),
            };
          };
          for (const track of mediaTracks) {
            readyFile.setExtractionOptions(track.id, null, { nbSamples: PROCESS_BATCH_SAMPLES });
          }
          readyFile.start();
        });
        const { file, info } = session;
        let primaryError: unknown;
        try {
          const metadata = toNormalizedMetadata(file, info);
          const typeCounts: Record<'video' | 'audio', number> = { video: 0, audio: 0 };

          const mediaTracks = info.tracks.filter((track) => {
            const type = trackType(track);
            return type === 'video' || type === 'audio';
          });
          if (mediaTracks.length === 0) throw new Error(`${ENGINE_ID}: parsed ISO BMFF contains no audio/video tracks`);
          for (const track of mediaTracks) {
            if (trackSampleCount(file, track) === 0) throw new Error(`${ENGINE_ID}: media track ${track.id} contains zero samples`);
          }
          session.throwIfError();
          for (const track of mediaTracks) {
            if ((extractedCounts.get(track.id) ?? 0) !== trackSampleCount(file, track)) {
              throw new Error(`${ENGINE_ID}: incomplete mux extraction for track ${track.id}`);
            }
          }

          for (let trackIndex = 0; trackIndex < info.tracks.length; trackIndex++) {
            const source = info.tracks[trackIndex]!;
            const type = trackType(source);
            if (type !== 'video' && type !== 'audio') continue;
            const typeOrdinal = typeCounts[type]++;
            const rawCodec = unwrapEncryptedCodec(file, source.id, source.codec) ?? source.codec;
            const normalized = metadata.tracks[trackIndex];
            const codec = normalized?.codec ?? canonicalCodec(rawCodec);
            const sampleEntry = sampleEntryTypeFromTrack(file, source.id, rawCodec);
            if (!sampleEntry) {
              throw createNotApplicableError(
                ENGINE_ID,
                'mux',
                `cannot resolve sample entry for track ${source.id} (${rawCodec})`,
                mp4boxTupleSummary(call.request),
                'MP4BOX_SAMPLE_ENTRY_UNSUPPORTED',
              );
            }
            assertMuxSampleEntries(sampleEntry.sampleEntries, codec, 'mux', mp4boxTupleSummary(call.request));

            const samples = collectedByTrack.get(source.id) ?? [];
            if (samples.length === 0) throw new Error(`${ENGINE_ID}: media track ${source.id} emitted no samples`);
            samples.sort((a, b) => a.dts - b.dts || a.number - b.number);
            const timescale = source.timescale > 0 ? source.timescale : (samples[0]?.timescale ?? 1_000_000);
            const durationRuns = classicSampleDurationRuns(file, source.id, samples.length);
            let durationRunIndex = 0;
            let durationRunRemaining = durationRuns?.[0]?.sampleCount ?? 0;
            const chunks: Mp4boxPreparedChunk[] = samples.map((sample, decodeIndex) => {
              if (sample.descriptionIndex < 0 || sample.descriptionIndex >= sampleEntry.sampleEntries.length) {
                throw new Error(`${ENGINE_ID}: sample ${sample.number} references missing description ${sample.descriptionIndex}`);
              }
              if (durationRuns && sample.number !== decodeIndex) {
                throw new Error(`${ENGINE_ID}: classic track ${source.id} sample order is non-contiguous`);
              }
              const duration = durationRuns?.[durationRunIndex]?.sampleDelta ?? sample.duration;
              if (durationRuns) {
                durationRunRemaining--;
                if (durationRunRemaining === 0 && durationRunIndex + 1 < durationRuns.length) {
                  durationRunIndex++;
                  durationRunRemaining = durationRuns[durationRunIndex]!.sampleCount;
                }
              }
              return {
                data: sample.data,
                ptsUs: (sample.cts * 1_000_000) / timescale,
                dtsUs: (sample.dts * 1_000_000) / timescale,
                decodeIndex,
                durationUs: (duration * 1_000_000) / timescale,
                keyframe: sample.isSync,
                sampleDescriptionIndex: sample.descriptionIndex,
                mp4boxTiming: { cts: sample.cts, dts: sample.dts, duration },
              };
            });
            const representation = sampleDescriptionEvidence(sampleEntry.sampleEntries[0], codec, this.lib());
            const track: Mp4boxPreparedMuxTrack = {
              type,
              codec,
              nativeCodecTag: rawCodec,
              timescale,
              timebase: { numerator: 1, denominator: timescale },
              packetOrdering: 'decode',
              framing: representation.framing,
              accessUnitGrouping: representation.accessUnitGrouping,
              parameterSetLocation: representation.parameterSetLocation,
              ...(representation.description ? { description: representation.description.slice() } : {}),
              ...(representation.descriptionRecord ? { descriptionRecord: representation.descriptionRecord } : {}),
              ...(normalized?.width !== undefined ? { width: normalized.width } : {}),
              ...(normalized?.height !== undefined ? { height: normalized.height } : {}),
              ...(normalized?.sampleRate !== undefined ? { sampleRate: normalized.sampleRate } : {}),
              ...(normalized?.channels !== undefined ? { channels: normalized.channels } : {}),
              chunks,
              mp4boxMux: {
                source: 'mp4box',
                sampleEntryType: sampleEntry.sampleEntryType,
                descriptionBoxes: sampleEntry.descriptionBoxes,
                sampleEntries: sampleEntry.sampleEntries,
                edits: normalizedEdits(source),
                movieTimescale: source.movie_timescale > 0 ? source.movie_timescale : info.timescale,
                mediaOriginTicks: 0,
                presentationOffsetUs: 0,
              },
            };
            candidates.push({ inputIndex, type, typeOrdinal, track });
          }
        } catch (error) {
          primaryError = error;
          throw error;
        } finally {
          for (const track of info.tracks) {
            try {
              file.unsetExtractionOptions(track.id);
            } catch {
              // Session stop remains authoritative.
            }
          }
          session.close(primaryError);
        }
      }

      const selected = selectPreparedMuxTracks(candidates, inputs.length, options);
      if (selected.length === 0) {
        throw createNotApplicableError(
          ENGINE_ID,
          'prepareMuxTracks',
          'the requested track selection resolves to no muxable tracks',
          mp4boxTupleSummary(call.request),
          'MP4BOX_TRACK_SELECTION_EMPTY',
        );
      }
      preserveSelectedPresentationTimeline(selected);
      this.configState = {
        ...this.configState,
        codecConfigs: selected.map((candidate, trackIndex) => ({
          trackIndex,
          codec: candidate.track.codec,
          nativeCodecTag: candidate.track.nativeCodecTag ?? null,
          framing: candidate.track.framing ?? null,
          descriptionBytes: candidate.track.description?.byteLength ?? 0,
        })),
      };
      return validateEncodedTracks(ENGINE_ID, {
        tracks: selected.map((candidate) => candidate.track),
        telemetry: { bytesRead: this.configState.inputBytes },
      });
    });
  }

  // ── remux (FRAGMENTER) ───────────────────────────────────────────────────────────────────────
  /**
   * ISO-BMFF → FRAGMENTED-MP4 (fMP4 / CMAF). This is mp4box's documented "fragmenter" path:
   * setSegmentOptions per track → initializeSegmentation() (one combined init segment) → onSegment
   * (media fragments) → start()/flush(). An observable growable target receives init + fragments in
   * arrival order and materializes one tight fragmented-MP4 byte buffer. Cross-family conversion (to
   * mkv/webm/ts/wav/...) is IMPOSSIBLE for mp4box, so any non-mp4 target throws.
   */
  async remux(input: MediaInput, opts: RemuxOptions, context?: OperationContext): Promise<MediaBytes> {
    const call = context ?? this.fallbackOperation('remux', [input], opts.container, opts);
    return this.lifecycle.operation('remux', call, async () => {
      this.beginOperation('remux', true);
      this.assertSupported(call);
      const outputTarget = new ProgressiveByteSink();
      const completedTracks = new Set<number>();
      const nextSampleByTrack = new Map<number, number>();
      const samplesByTrack = new Map<number, readonly Mp4Sample[]>();
      let outputBytes = 0;
      const session = await this.parseToInfo(input, true, call, (readyFile, readyInfo, throwIfError) => {
        if (readyInfo.tracks.length === 0) throw new Error(`${ENGINE_ID}: remux found a genuinely trackless MP4`);
        for (const track of readyInfo.tracks) {
          const type = trackType(track);
          const rawCodec = unwrapEncryptedCodec(readyFile, track.id, track.codec) ?? track.codec;
          const codec = canonicalCodec(rawCodec);
          if (type !== 'video' && type !== 'audio') {
            throw createNotApplicableError(
              ENGINE_ID,
              'remux',
              `track ${track.id} type '${type}' is not in the adapter's segmentable contract`,
              mp4boxTupleSummary(call.request),
              'MP4BOX_REMUX_TRACK_TYPE_UNSUPPORTED',
            );
          }
          const allowed = type === 'video' ? MP4BOX_VIDEO_CODECS : MP4BOX_AUDIO_CODECS;
          if (!allowed.includes(codec as never)) {
            throw createNotApplicableError(
              ENGINE_ID,
              'remux',
              `track ${track.id} codec '${codec}' cannot be segmented losslessly`,
              mp4boxTupleSummary(call.request),
              'MP4BOX_REMUX_SAMPLE_ENTRY_UNSUPPORTED',
            );
          }
          const entries = sampleEntriesForTrack(readyFile, track.id);
          if (entries.length === 0) throw new Error(`${ENGINE_ID}: track ${track.id} has no sample description`);
          assertMuxSampleEntries(entries, codec, 'remux', mp4boxTupleSummary(call.request));
          samplesByTrack.set(track.id, readyFile.getTrackSamplesInfo(track.id));
        }
        this.configState = {
          ...this.configState,
          codecConfigs: readyInfo.tracks.map((track, trackIndex) => {
            const nativeCodecTag = unwrapEncryptedCodec(readyFile, track.id, track.codec) ?? track.codec;
            return {
              trackIndex,
              codec: canonicalCodec(nativeCodecTag),
              nativeCodecTag,
              sampleDescriptions: sampleEntriesForTrack(readyFile, track.id).length,
            };
          }),
        };

        readyFile.onSegment = (id, _user, buffer, nextSample, last) => {
          throwIfError();
          if (buffer.byteLength === 0) throw new Error(`${ENGINE_ID}: empty media-segment callback for track ${id}`);
          const segment = new Uint8Array(buffer);
          const previousNextSample = nextSampleByTrack.get(id) ?? 0;
          const fragmentSamples = samplesByTrack.get(id)?.slice(previousNextSample, nextSample) ?? [];
          if (fragmentSamples.some((sample) => sample.cts - sample.dts < 0)) {
            const marked = markFragmentSignedCompositionOffsets(segment);
            if (marked === 0) {
              throw new Error(`${ENGINE_ID}: negative composition offsets were not represented by a writable trun`);
            }
            this.configState = {
              ...this.configState,
              signedTrunVersionPatches: this.configState.signedTrunVersionPatches + marked,
            };
          }
          outputTarget.write(segment);
          outputBytes = outputTarget.byteLength;
          const releasedNow = Math.max(0, nextSample - previousNextSample);
          nextSampleByTrack.set(id, Math.max(previousNextSample, nextSample));
          if (last) completedTracks.add(id);
          const parserBytesBeforeRelease = readyFile.samplesDataSize ?? 0;
          readyFile.releaseUsedSamples(id, nextSample);
          this.configState = {
            ...this.configState,
            releasedSamples: this.configState.releasedSamples + releasedNow,
            outputBytes,
            outputWrites: this.configState.outputWrites + 1,
            peakParserSampleBytes: Math.max(this.configState.peakParserSampleBytes, parserBytesBeforeRelease),
            peakOutputTargetBytes: Math.max(this.configState.peakOutputTargetBytes, outputTarget.peakAllocatedBytes),
          };
          call.emit({ type: 'bytes-written', atMs: this.elapsedMs(), bytes: outputBytes });
          call.emit({ type: 'write-count', atMs: this.elapsedMs(), count: this.configState.outputWrites });
        };

        for (const track of readyInfo.tracks) {
          // Fixed batches are the memory ceiling. RAP alignment may defer an entire long GOP and
          // retain most of a large mdat; sample flags still preserve each fragment's sync semantics.
          readyFile.setSegmentOptions(track.id, null, { nbSamples: PROCESS_BATCH_SAMPLES, rapAlignement: false });
        }
        const init = readyFile.initializeSegmentation();
        if (init.buffer.byteLength === 0) throw new Error(`${ENGINE_ID}: initializeSegmentation returned no init bytes`);
        outputTarget.write(init.buffer);
        outputBytes = outputTarget.byteLength;
        const firstByteMs = this.elapsedMs();
        this.configState = {
          ...this.configState,
          firstByteMs,
          outputBytes,
          outputWrites: 1,
          peakOutputTargetBytes: Math.max(this.configState.peakOutputTargetBytes, outputTarget.peakAllocatedBytes),
        };
        call.emit({ type: 'first-byte', atMs: firstByteMs });
        call.emit({ type: 'bytes-written', atMs: this.elapsedMs(), bytes: outputBytes });
        call.emit({ type: 'write-count', atMs: this.elapsedMs(), count: 1 });
        readyFile.start();
      });
      const { file, info } = session;
      let primaryError: unknown;
      try {
        const expectedByTrack = new Map<number, number>();
        for (const track of info.tracks) {
          const expectedSamples = trackSampleCount(file, track);
          if (expectedSamples === 0) throw new Error(`${ENGINE_ID}: media track ${track.id} contains zero samples`);
          expectedByTrack.set(track.id, expectedSamples);
        }
        session.throwIfError();
        for (const [trackId, expected] of expectedByTrack) {
          if (!completedTracks.has(trackId) || (nextSampleByTrack.get(trackId) ?? 0) < expected) {
            throw new Error(`${ENGINE_ID}: incomplete segmentation for track ${trackId}: ${nextSampleByTrack.get(trackId) ?? 0}/${expected}`);
          }
        }

        const out = outputTarget.finish();
        const expectedSamples = [...expectedByTrack.values()].reduce((sum, count) => sum + count, 0);
        const validation = validateFragmentedMp4(out, expectedSamples);
        this.configState = {
          ...this.configState,
          outputBytes: out.byteLength,
          peakOutputTargetBytes: Math.max(this.configState.peakOutputTargetBytes, outputTarget.peakAllocatedBytes),
          fragmentValidation: validation,
        };
        if (!validation.valid) throw new Error(`${ENGINE_ID}: ${validation.reasonCode}: ${validation.detail}`);
        return validateAdapterResult(ENGINE_ID, 'remux', {
          bytes: out,
          mime: 'video/mp4',
          container: 'mp4',
          targetWrites: this.configState.outputWrites,
          ...(this.configState.firstByteMs !== null ? { firstByteMs: this.configState.firstByteMs } : {}),
          telemetry: {
            bytesRead: this.configState.inputBytes,
            bytesWritten: out.byteLength,
            writeCount: this.configState.outputWrites,
            ...(this.configState.firstByteMs !== null ? { firstByteMs: this.configState.firstByteMs } : {}),
          },
        });
      } catch (error) {
        primaryError = error;
        throw error;
      } finally {
        for (const track of info.tracks) {
          try {
            file.unsetSegmentOptions(track.id);
          } catch {
            // Session stop remains authoritative.
          }
        }
        session.close(primaryError);
      }
    });
  }

  // ── Undeclared operations: mp4box does none of these. They throw so a mis-wired runner fails
  //    loudly; capabilities() does NOT declare them, so the runner negotiates NA(engine). ──────────

  async transcode(_input: MediaInput, _opts: TranscodeOptions): Promise<MediaBytes> {
    throw new Error(`${ENGINE_ID}: transcode not supported (no encoder/decoder — ISOBMFF parser only)`);
  }

  async decodeFrames(_input: MediaInput, _opts?: DecodeOptions): Promise<FrameSink> {
    throw new Error(`${ENGINE_ID}: decodeFrames not supported (no decoder — pair with WebCodecs)`);
  }

  async seek(_input: MediaInput, _tUs: number): Promise<{ landedPtsUs: number; frame: FrameDigest }> {
    // mp4box can seek to a byte offset of the previous RAP, but cannot produce a decoded FrameDigest.
    throw new Error(`${ENGINE_ID}: seek-to-frame not supported (no decoder — RAP→byte-offset only)`);
  }

  async trim(
    _input: MediaInput,
    _range: { startUs: number; endUs: number },
    _opts: { container: string; frameAccurate: boolean },
  ): Promise<MediaBytes> {
    throw new Error(`${ENGINE_ID}: trim not supported (keyframe-bounded DIY only; not declared)`);
  }

  // `decrypt` is genuinely impossible (parses CENC signalling, performs no AES) and is simply absent.
  async mux(tracks: EncodedTracks, opts: MuxOptions, context?: OperationContext): Promise<MediaBytes> {
    const call = context ?? this.fallbackOperation('mux', [], opts.container, opts);
    return this.lifecycle.operation('mux', call, async () => {
      const preparation = this.configState.operation === 'mux' ? this.configState : freshConfigState();
      this.beginOperation('mux', true);
      this.configState = {
        ...this.configState,
        inputBytes: preparation.inputBytes,
        appendCount: preparation.appendCount,
        releasedSamples: preparation.releasedSamples,
        peakParserSampleBytes: preparation.peakParserSampleBytes,
        peakOwnedSampleBytes: preparation.peakOwnedSampleBytes,
        codecConfigs: preparation.codecConfigs,
      };
      this.assertSupported(call);
      const realTracks = tracks.tracks.filter((track) => track.type === 'video' || track.type === 'audio') as Mp4boxPreparedMuxTrack[];
      if (realTracks.length === 0) {
        // Trackless input/operation contracts are invalid applicable input, never NA_ENGINE.
        throw new Error(`${ENGINE_ID}: mux requires at least one non-empty audio/video track`);
      }
      if (realTracks.length !== tracks.tracks.length) {
        throw createNotApplicableError(
          ENGINE_ID,
          'mux',
          'subtitle/other tracks cannot be silently discarded by the mux writer',
          mp4boxTupleSummary(call.request),
          'MP4BOX_MUX_TRACK_TYPE_UNSUPPORTED',
        );
      }
      for (const track of realTracks) {
        if (!track.mp4boxMux || track.mp4boxMux.source !== 'mp4box') {
          throw createNotApplicableError(
            ENGINE_ID,
            'mux',
            'external EncodedTracks lack exact MP4Box sample-entry/edit provenance',
            mp4boxTupleSummary(call.request),
            'MP4BOX_EXTERNAL_TRACK_PROVENANCE_UNSUPPORTED',
          );
        }
        if (track.chunks.length === 0) throw new Error(`${ENGINE_ID}: '${track.type}' track has zero samples`);
        assertMuxSampleEntries(track.mp4boxMux.sampleEntries, track.codec, 'mux', mp4boxTupleSummary(call.request));
        const activeDescriptionIndexes = new Set<number>();
        for (const chunk of track.chunks) {
          const timing = sampleTimingForChunk(chunk, track.timescale);
          if (timing.cts < timing.dts) {
            throw createNotApplicableError(
              ENGINE_ID,
              'mux',
              `negative composition offset on '${track.type}' cannot be represented by this writer`,
              mp4boxTupleSummary(call.request),
              'MP4BOX_NEGATIVE_COMPOSITION_UNSUPPORTED',
            );
          }
          const descriptionIndex = chunk.sampleDescriptionIndex ?? 0;
          if (descriptionIndex < 0 || descriptionIndex >= track.mp4boxMux.sampleEntries.length) {
            throw new Error(`${ENGINE_ID}: chunk references absent sample description ${descriptionIndex}`);
          }
          activeDescriptionIndexes.add(descriptionIndex);
        }
        if (activeDescriptionIndexes.size > 1) {
          // MP4Box 2.3's fragment writer records only trex.default_sample_description_index and
          // never emits per-fragment tfhd sample-description overrides. Reject an actual switch.
          throw createNotApplicableError(
            ENGINE_ID,
            'mux',
            `track '${track.type}' switches sample descriptions within one fragmented output`,
            mp4boxTupleSummary(call.request),
            'MP4BOX_SAMPLE_DESCRIPTION_SWITCH_UNSUPPORTED',
          );
        }
      }

      const MP4Box = this.lib();
      const out = MP4Box.createFile(true);
      this.activeFiles.add(out);
      this.configState = { ...this.configState, activeFiles: this.activeFiles.size, cleanupComplete: false };
      let writerError: Error | undefined;
      let stopError: unknown;
      let primaryError: unknown;
      out.onError = (module, message) => {
        writerError ??= new Error(`mp4box writer error [${module}]: ${message}`);
        this.configState = { ...this.configState, lateErrorObserved: true };
      };
      let stopped = false;
      const stopWriter = (): void => {
        if (stopped) return;
        stopped = true;
        try {
          out.stop();
          this.configState = { ...this.configState, stopCalled: true };
        } catch (error) {
          stopError ??= error;
        }
      };
      const abort = (): void => {
        stopWriter();
      };
      if (call.signal.aborted) abort();
      else call.signal.addEventListener('abort', abort, { once: true });

      try {
        throwIfAborted(call.signal);
        const movieTimescale = 1_000;
        let movieDuration = 0;
        for (const track of realTracks) {
          const muxInfo = track.mp4boxMux!;
          const editDurationUs = muxInfo.edits.length > 0
            ? muxInfo.edits.reduce((sum, edit) => sum + Math.max(0, edit.segmentDuration), 0)
              * 1_000_000 / Math.max(1, muxInfo.movieTimescale)
            : muxInfo.presentationOffsetUs + trackDurationUs(track);
          movieDuration = Math.max(movieDuration, usToTrackTicks(editDurationUs, movieTimescale));
        }
        out.init({ brands: ['isom', 'iso6', 'mp41'], timescale: movieTimescale, duration: movieDuration });

        const hasVideo = realTracks.some((track) => track.type === 'video');
        let expectedSamples = 0;
        for (let index = 0; index < realTracks.length; index++) {
          throwIfAborted(call.signal);
          const track = realTracks[index]!;
          const info = track.mp4boxMux!;
          const timescale = Number.isFinite(track.timescale) && track.timescale > 0 ? track.timescale : 1_000_000;
          let mediaDuration = 0;
          for (const chunk of track.chunks) {
            const timing = sampleTimingForChunk(chunk, timescale);
            mediaDuration = Math.max(mediaDuration, timing.dts + timing.duration, timing.cts + timing.duration);
          }
          const trackDuration = info.edits.length > 0
            ? Math.round(info.edits.reduce((sum, edit) => sum + Math.max(0, edit.segmentDuration), 0)
              * movieTimescale / Math.max(1, info.movieTimescale))
            : usToTrackTicks(info.presentationOffsetUs + trackDurationUs(track), movieTimescale);
          const defaultDescriptionIndex = (track.chunks[0]?.sampleDescriptionIndex ?? 0) + 1;
          const addTrackOptions: Mp4boxIsoFileOptions = {
            id: index + 1,
            type: info.sampleEntryType as Mp4boxIsoFileOptions['type'],
            hdlr: track.type === 'video' ? 'vide' : 'soun',
            name: `${track.type} track`,
            timescale,
            duration: trackDuration,
            media_duration: mediaDuration,
            default_sample_description_index: defaultDescriptionIndex,
            ...(track.width !== undefined ? { width: Math.round(track.width) } : {}),
            ...(track.height !== undefined ? { height: Math.round(track.height) } : {}),
            ...(track.sampleRate !== undefined ? { samplerate: Math.round(track.sampleRate) * 65536 } : {}),
            ...(track.channels !== undefined ? { channel_count: track.channels } : {}),
            ...(info.descriptionBoxes.length > 0 ? { description_boxes: info.descriptionBoxes } : {}),
          };
          const trackId = out.addTrack(addTrackOptions);
          if (!trackId) {
            throw createNotApplicableError(
              ENGINE_ID,
              'mux',
              `MP4Box cannot create sample entry '${info.sampleEntryType}'`,
              mp4boxTupleSummary(call.request),
              'MP4BOX_SAMPLE_ENTRY_WRITER_UNSUPPORTED',
            );
          }
          installSampleEntries(out, trackId, info.sampleEntries);
          authorPresentationEdits(MP4Box, out, trackId, info, movieTimescale, mediaDuration, mp4boxTupleSummary(call.request));

          for (const chunk of track.chunks) {
            throwIfAborted(call.signal);
            const timing = sampleTimingForChunk(chunk, timescale);
            const added = out.addSample(trackId, copyBytes(chunk.data), {
              sample_description_index: (chunk.sampleDescriptionIndex ?? 0) + 1,
              duration: Math.max(1, timing.duration),
              cts: timing.cts,
              dts: timing.dts,
              is_sync: chunk.keyframe,
            });
            if (!added) throw new Error(`${ENGINE_ID}: writer rejected sample ${expectedSamples}`);
            expectedSamples++;
            if (writerError) throw writerError;
          }
        }

        if (writerError) throw writerError;
        const bytes = streamToBytes(out.getBuffer());
        if (writerError) throw writerError;
        if (bytes.byteLength === 0) throw new Error(`${ENGINE_ID}: mux produced an empty MP4`);
        const validation = validateFragmentedMp4(bytes, expectedSamples);
        const firstByteMs = this.elapsedMs();
        this.configState = {
          ...this.configState,
          outputBytes: bytes.byteLength,
          outputWrites: 1,
          firstByteMs,
          peakOutputTargetBytes: Math.max(this.configState.peakOutputTargetBytes, bytes.byteLength),
          fragmentValidation: validation,
        };
        if (!validation.valid) throw new Error(`${ENGINE_ID}: ${validation.reasonCode}: ${validation.detail}`);
        call.emit({ type: 'first-byte', atMs: firstByteMs });
        call.emit({ type: 'bytes-written', atMs: this.elapsedMs(), bytes: bytes.byteLength });
        call.emit({ type: 'write-count', atMs: this.elapsedMs(), count: 1 });
        return validateAdapterResult(ENGINE_ID, 'mux', {
          bytes,
          mime: hasVideo ? 'video/mp4' : 'audio/mp4',
          container: 'mp4',
          targetWrites: 1,
          firstByteMs,
          telemetry: {
            bytesRead: this.configState.inputBytes,
            bytesWritten: bytes.byteLength,
            writeCount: 1,
            firstByteMs,
          },
        });
      } catch (error) {
        primaryError = error;
        throw error;
      } finally {
        call.signal.removeEventListener('abort', abort);
        stopWriter();
        out.onError = undefined;
        this.activeFiles.delete(out);
        this.configState = {
          ...this.configState,
          activeFiles: this.activeFiles.size,
          cleanupComplete: this.activeFiles.size === 0,
        };
        if (primaryError === undefined && stopError !== undefined) throw stopError;
      }
    });
  }
}

/**
 * Register helper for Phase D to wire the registry (this file does NOT register at import time —
 * "Register NOTHING; Phase D wires registry"). Phase D calls registerMp4box() where it assembles the
 * engine list. The registry KEY defaults to 'mp4box'; the engine reports its own versioned id.
 */
export function registerMp4box(opts?: { id?: string }): void {
  const id = opts?.id ?? 'mp4box';
  registerEngine(id, () => new Mp4boxEngine());
}
