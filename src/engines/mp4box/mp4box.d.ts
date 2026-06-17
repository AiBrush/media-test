/**
 * src/engines/mp4box/mp4box.d.ts — minimal ambient typings for mp4box@0.5.4.
 *
 * mp4box.js ships NO TypeScript declarations (package.json has no `types`; `main` is the UMD bundle
 * `dist/mp4box.all.js` which exports CommonJS `exports.createFile`). These declarations cover ONLY
 * the surface this adapter actually uses — probing (`onReady`/`getInfo`) and sample extraction
 * (`setExtractionOptions`/`onSamples`) — typed against the real runtime shapes verified by reading
 * `node_modules/mp4box/dist/mp4box.all.js` (ISOFile.getInfo @6901, buildSampleLists @7940,
 * addSample/getSample sample fields @7589). It is intentionally NOT a complete typing of the library.
 */
declare module 'mp4box' {
  /** Audio-specific media-header info (getInfo → track.audio). */
  export interface MP4AudioTrackInfo {
    sample_rate: number;
    channel_count: number;
    sample_size: number;
  }

  /** Video-specific media-header info (getInfo → track.video). */
  export interface MP4VideoTrackInfo {
    width: number;
    height: number;
  }

  /**
   * Per-track info from {@link MP4Info.tracks}. `type` is mp4box's handler-derived string
   * ('video' | 'audio' | 'subtitles' | 'metadata' | ...). `codec` is the MIME codecs token
   * (e.g. 'avc1.640028', 'mp4a.40.2'). Durations are in the track `timescale`.
   */
  export interface MP4Track {
    id: number;
    name?: string;
    type?: string;
    codec: string;
    language?: string;
    /** track media timescale (ticks/sec) */
    timescale: number;
    /** track duration in `timescale` ticks */
    duration: number;
    /** total duration of all samples in `timescale` ticks */
    samples_duration?: number;
    movie_duration?: number;
    movie_timescale?: number;
    nb_samples: number;
    /** sum of sample sizes in bytes */
    size?: number;
    /** bits/second (size*8*timescale / samples_duration) */
    bitrate?: number;
    /** display dimensions from the track header (pixels) */
    track_width?: number;
    track_height?: number;
    /** 3x3 transform matrix from tkhd (fixed-point), present for video tracks */
    matrix?: Int32Array | number[];
    video?: MP4VideoTrackInfo;
    audio?: MP4AudioTrackInfo;
  }

  /** Result of {@link ISOFile.getInfo} / passed to {@link ISOFile.onReady}. */
  export interface MP4Info {
    hasMoov: boolean;
    /** movie duration in `timescale` ticks */
    duration: number;
    /** movie timescale (ticks/sec) */
    timescale: number;
    isFragmented: boolean;
    isProgressive: boolean;
    hasIOD: boolean;
    brands: string[];
    created?: Date;
    modified?: Date;
    /** duration of the fragmented part in `timescale` ticks (fragmented files only) */
    fragment_duration?: number;
    tracks: MP4Track[];
    videoTracks: MP4Track[];
    audioTracks: MP4Track[];
    subtitleTracks: MP4Track[];
    metadataTracks: MP4Track[];
    hintTracks: MP4Track[];
    otherTracks: MP4Track[];
  }

  /**
   * A demuxed sample delivered to {@link ISOFile.onSamples}. `cts`/`dts`/`duration` are in
   * `timescale` ticks; `is_sync` is the keyframe flag (true for RAP samples — from `stss` for video,
   * always true for tracks without an `stss`, e.g. audio). `data` is the encoded sample bytes.
   */
  export interface MP4Sample {
    number: number;
    track_id: number;
    timescale: number;
    /** composition (presentation) timestamp in `timescale` ticks */
    cts: number;
    /** decode timestamp in `timescale` ticks */
    dts: number;
    duration: number;
    size: number;
    /** keyframe / random-access-point flag */
    is_sync: boolean;
    /** byte offset of the sample in the original file */
    offset?: number;
    data: Uint8Array;
  }

  /** Options for {@link ISOFile.setExtractionOptions}. */
  export interface ExtractionOptions {
    /** samples per onSamples callback (default 1000) */
    nbSamples?: number;
    /** require sample arrays to start at a RAP (default true) */
    rapAlignement?: boolean;
  }

  /**
   * An ArrayBuffer carrying its absolute byte offset in the source file. `appendBuffer` requires this
   * `fileStart` property; for whole-file appends it is 0.
   */
  export interface MP4ArrayBuffer extends ArrayBuffer {
    fileStart: number;
  }

  /** The progressive MP4 parser/demuxer returned by {@link createFile}. */
  export interface ISOFile {
    onReady: ((info: MP4Info) => void) | null;
    onError: ((e: string) => void) | null;
    onMoovStart: (() => void) | null;
    onSamples: ((id: number, user: unknown, samples: MP4Sample[]) => void) | null;

    /** Feed bytes; `ab.fileStart` must be set. Returns the next expected fileStart. */
    appendBuffer(ab: MP4ArrayBuffer, last?: boolean): number;
    /** Begin sample processing (extraction/segmentation). */
    start(): void;
    /** Stop sample processing. */
    stop(): void;
    /** Signal end of input; flush remaining samples. */
    flush(): void;
    /** Parse `moov` and return the file info (or undefined if `moov` not yet seen). */
    getInfo(): MP4Info;
    /** Mark a track for sample extraction; samples arrive via {@link onSamples}. */
    setExtractionOptions(id: number, user?: unknown, options?: ExtractionOptions): void;
    unsetExtractionOptions(id: number): void;
    /** Release sample memory up to (excluding) sampleNumber for a track. */
    releaseUsedSamples(id: number, sampleNumber: number): void;
    /** Seek to time (seconds); returns file offset of the next needed bytes. */
    seek(time: number, useRap?: boolean): { offset: number };
  }

  /** Create a fresh ISOFile parser. */
  export function createFile(keepMdatData?: boolean, stream?: unknown): ISOFile;

  const MP4Box: { createFile: typeof createFile };
  export default MP4Box;
}
