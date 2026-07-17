import { isRecord } from './types.ts';

export const DECODE_PROVENANCE_SCHEMA = 'media-test/decode-provenance@1' as const;

export type DecodeSizeBucket = 'empty' | 'micro' | 'tiny' | 'small' | 'medium' | 'large' | 'huge';

export interface DecodeScenarioProvenance {
  readonly schema: typeof DECODE_PROVENANCE_SCHEMA;
  readonly assetId: string;
  readonly sizeBucket: DecodeSizeBucket;
  readonly resolution: Readonly<{ width: number; height: number }>;
  readonly codec: string;
  readonly heavyBake: boolean;
}

export interface DecodeResultProvenance extends DecodeScenarioProvenance {
  readonly selectedAssetId: string;
  readonly actualInputBytes: number;
  readonly inputSha256?: string;
}

export type DecodeProvenanceAdmission =
  | { readonly state: 'AVAILABLE'; readonly value: DecodeResultProvenance }
  | { readonly state: 'ERROR'; readonly reasonCode: string; readonly detail: string };

const SIZE_BUCKETS = new Set<DecodeSizeBucket>([
  'empty', 'micro', 'tiny', 'small', 'medium', 'large', 'huge',
]);

type CatalogEntry = Readonly<{
  sizeBucket: DecodeSizeBucket;
  width: number;
  height: number;
  codec: string;
  heavyBake?: boolean;
}>;

/** Scenario-owned facts; exact selected bytes/digest are materialized later from verified input. */
export const DECODE_PROVENANCE_CATALOG: Readonly<Record<string, CatalogEntry>> = Object.freeze({
  'h264_1080p_30s.mp4': { sizeBucket: 'medium', width: 1920, height: 1080, codec: 'h264' },
  'h264_bframes_1080p.mp4': { sizeBucket: 'medium', width: 1920, height: 1080, codec: 'h264' },
  'h264_vfr.mp4': { sizeBucket: 'small', width: 1280, height: 720, codec: 'h264' },
  'hevc_1080p_10s.mp4': { sizeBucket: 'medium', width: 1920, height: 1080, codec: 'hevc' },
  'vp9_1080p_10s.webm': { sizeBucket: 'medium', width: 1920, height: 1080, codec: 'vp9' },
  'vp8_720p_10s.webm': { sizeBucket: 'small', width: 1280, height: 720, codec: 'vp8' },
  'av1_720p_5s.webm': { sizeBucket: 'small', width: 1280, height: 720, codec: 'av1' },
  'vp9_alpha.webm': { sizeBucket: 'tiny', width: 640, height: 480, codec: 'vp9' },
  'image.jpg': { sizeBucket: 'micro', width: 640, height: 480, codec: 'mjpeg' },
  'image.png': { sizeBucket: 'micro', width: 640, height: 480, codec: 'png' },
  'image.webp': { sizeBucket: 'micro', width: 640, height: 480, codec: 'webp' },
  'h264_1080p_5s.mov': { sizeBucket: 'small', width: 1920, height: 1080, codec: 'h264' },
  'h264_in_mkv.mkv': { sizeBucket: 'small', width: 1280, height: 720, codec: 'h264' },
  'h264_4k_10s.mp4': { sizeBucket: 'large', width: 3840, height: 2160, codec: 'h264' },
  'h264_rotated90.mp4': { sizeBucket: 'small', width: 720, height: 1280, codec: 'h264' },
  'h264_multitrack.mp4': { sizeBucket: 'small', width: 1280, height: 720, codec: 'h264' },
  'h264_two_video_tracks.mp4': { sizeBucket: 'small', width: 1280, height: 720, codec: 'h264' },
  'h264_10bit_1080p_5s.mp4': { sizeBucket: 'small', width: 1920, height: 1080, codec: 'h264' },
  'h264_open_gop_1080p.mp4': { sizeBucket: 'small', width: 1920, height: 1080, codec: 'h264' },
  'h264_1fps_30s.mp4': { sizeBucket: 'micro', width: 320, height: 240, codec: 'h264' },
  'video_240fps.mp4': { sizeBucket: 'micro', width: 320, height: 240, codec: 'h264' },
  'video_1x1.webm': { sizeBucket: 'micro', width: 1, height: 1, codec: 'vp9' },
  'video_2x2_h264.mp4': { sizeBucket: 'micro', width: 2, height: 2, codec: 'h264' },
  'micro_h264_1frame.mp4': { sizeBucket: 'micro', width: 320, height: 240, codec: 'h264' },
  'tiny_h264_360p_2s.mp4': { sizeBucket: 'tiny', width: 640, height: 360, codec: 'h264' },
  'tiny_vp9_360p_2s.webm': { sizeBucket: 'tiny', width: 640, height: 360, codec: 'vp9' },
  'large_h264_1080p_120s.mp4': {
    sizeBucket: 'large', width: 1920, height: 1080, codec: 'h264', heavyBake: true,
  },
  'large_vp9_1080p_120s.webm': {
    sizeBucket: 'large', width: 1920, height: 1080, codec: 'vp9', heavyBake: true,
  },
  'huge_h264_1080p_600s.mov': {
    sizeBucket: 'huge', width: 1920, height: 1080, codec: 'h264', heavyBake: true,
  },
});

export function defineDecodeScenarioProvenance(
  input: Omit<DecodeScenarioProvenance, 'schema'>,
): DecodeScenarioProvenance {
  if (!input.assetId.trim()) throw new TypeError('decode provenance assetId is empty');
  if (!SIZE_BUCKETS.has(input.sizeBucket)) throw new TypeError(`decode size bucket is invalid: ${input.sizeBucket}`);
  if (!Number.isSafeInteger(input.resolution.width) || input.resolution.width <= 0 ||
      !Number.isSafeInteger(input.resolution.height) || input.resolution.height <= 0) {
    throw new TypeError('decode provenance resolution must be positive integer dimensions');
  }
  if (!input.codec.trim()) throw new TypeError('decode provenance codec is empty');
  return Object.freeze({
    schema: DECODE_PROVENANCE_SCHEMA,
    assetId: input.assetId,
    sizeBucket: input.sizeBucket,
    resolution: Object.freeze({ ...input.resolution }),
    codec: input.codec,
    heavyBake: input.heavyBake,
  });
}

export function decodeScenarioProvenanceForAsset(assetId: string): DecodeScenarioProvenance {
  const entry = DECODE_PROVENANCE_CATALOG[assetId];
  if (!entry) throw new TypeError(`decode provenance catalog has no entry for '${assetId}'`);
  return defineDecodeScenarioProvenance({
    assetId,
    sizeBucket: entry.sizeBucket,
    resolution: { width: entry.width, height: entry.height },
    codec: entry.codec,
    heavyBake: entry.heavyBake === true,
  });
}

export function decodeScenarioProvenanceFromOptions(options: unknown): DecodeScenarioProvenance | undefined {
  if (!isRecord(options) || !isRecord(options.decodeProvenance)) return undefined;
  const raw = options.decodeProvenance;
  if (raw.schema !== DECODE_PROVENANCE_SCHEMA || !isRecord(raw.resolution)) return undefined;
  try {
    return defineDecodeScenarioProvenance({
      assetId: raw.assetId as string,
      sizeBucket: raw.sizeBucket as DecodeSizeBucket,
      resolution: {
        width: raw.resolution.width as number,
        height: raw.resolution.height as number,
      },
      codec: raw.codec as string,
      heavyBake: raw.heavyBake === true,
    });
  } catch {
    return undefined;
  }
}

/** Materialize selected-byte identity at execution time so rotated real inputs cannot inherit baked size. */
export function materializeDecodeResultProvenance(
  declared: DecodeScenarioProvenance,
  selected: { readonly id: string; readonly sizeBytes?: number; readonly sha256?: string },
): DecodeProvenanceAdmission {
  if (!selected.id.trim()) {
    return { state: 'ERROR', reasonCode: 'DECODE_PROVENANCE_SELECTED_ASSET_MISSING', detail: 'selected asset id is empty' };
  }
  if (!Number.isSafeInteger(selected.sizeBytes) || Number(selected.sizeBytes) < 0) {
    return {
      state: 'ERROR',
      reasonCode: 'DECODE_PROVENANCE_INPUT_BYTES_MISSING',
      detail: `selected asset '${selected.id}' has no exact non-negative byte length`,
    };
  }
  if (selected.sha256 !== undefined && !/^[0-9a-f]{64}$/.test(selected.sha256)) {
    return {
      state: 'ERROR',
      reasonCode: 'DECODE_PROVENANCE_INPUT_DIGEST_INVALID',
      detail: `selected asset '${selected.id}' has an invalid SHA-256 identity`,
    };
  }
  return {
    state: 'AVAILABLE',
    value: Object.freeze({
      ...declared,
      selectedAssetId: selected.id,
      actualInputBytes: Number(selected.sizeBytes),
      ...(selected.sha256 ? { inputSha256: selected.sha256 } : {}),
    }),
  };
}
