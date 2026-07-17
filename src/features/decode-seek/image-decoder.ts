import { isRecord } from './types.ts';

export const IMAGE_DECODER_CONTRACT_SCHEMA = 'media-test/image-decoder-contract@1' as const;

export interface ImageDecoderContract {
  readonly schema: typeof IMAGE_DECODER_CONTRACT_SCHEMA;
  readonly mime: 'image/jpeg' | 'image/png' | 'image/webp';
}

export type ImageDecoderProbe =
  | {
      readonly state: 'SUPPORTED';
      readonly contract: ImageDecoderContract;
    }
  | {
      readonly state: 'UNAVAILABLE';
      readonly status: 'NA_BROWSER';
      readonly reasonCode: string;
      readonly detail: string;
      readonly contract: ImageDecoderContract;
    }
  | {
      readonly state: 'ERROR';
      readonly reasonCode: string;
      readonly detail: string;
      readonly contract: ImageDecoderContract;
    };

export interface ImageDecoderSupportApi {
  isTypeSupported(type: string): Promise<boolean> | boolean;
}

export function imageDecoderContract(container: string): ImageDecoderContract {
  const mime = container.toLowerCase() === 'jpeg' || container.toLowerCase() === 'jpg'
    ? 'image/jpeg'
    : container.toLowerCase() === 'png'
      ? 'image/png'
      : container.toLowerCase() === 'webp'
        ? 'image/webp'
        : undefined;
  if (!mime) throw new TypeError(`container '${container}' is not a still-image decode contract`);
  return Object.freeze({ schema: IMAGE_DECODER_CONTRACT_SCHEMA, mime });
}

export function imageDecoderContractFromOptions(options: unknown): ImageDecoderContract | undefined {
  if (!isRecord(options) || !isRecord(options.imageDecoder)) return undefined;
  const raw = options.imageDecoder;
  if (raw.schema !== IMAGE_DECODER_CONTRACT_SCHEMA || typeof raw.mime !== 'string') return undefined;
  try {
    return imageDecoderContract(raw.mime.replace(/^image\//, '').replace('jpeg', 'jpeg'));
  } catch {
    return undefined;
  }
}

/**
 * Probe ImageDecoder.isTypeSupported only. VideoDecoder support is intentionally neither accepted
 * nor consulted: the two WebCodecs interfaces have distinct applicability surfaces.
 */
export async function probeImageDecoder(
  contract: ImageDecoderContract,
  api: ImageDecoderSupportApi | undefined = imageDecoderGlobal(),
): Promise<ImageDecoderProbe> {
  if (!api || typeof api.isTypeSupported !== 'function') {
    return {
      state: 'UNAVAILABLE',
      status: 'NA_BROWSER',
      reasonCode: 'IMAGE_DECODER_API_UNAVAILABLE',
      detail: 'ImageDecoder.isTypeSupported is unavailable in this realm',
      contract,
    };
  }
  try {
    const supported = await api.isTypeSupported(contract.mime);
    return supported === true
      ? { state: 'SUPPORTED', contract }
      : {
          state: 'UNAVAILABLE',
          status: 'NA_BROWSER',
          reasonCode: 'IMAGE_DECODER_TYPE_UNSUPPORTED',
          detail: `ImageDecoder does not support ${contract.mime}`,
          contract,
        };
  } catch (error) {
    const name = errorName(error);
    if (name === 'NotSupportedError') {
      return {
        state: 'UNAVAILABLE',
        status: 'NA_BROWSER',
        reasonCode: 'IMAGE_DECODER_TYPE_UNSUPPORTED',
        detail: `ImageDecoder rejected ${contract.mime} as unsupported`,
        contract,
      };
    }
    return {
      state: 'ERROR',
      reasonCode: name === 'TypeError' ? 'IMAGE_DECODER_CONFIG_INVALID' : 'IMAGE_DECODER_PROBE_ERROR',
      detail: `ImageDecoder support probe failed (${name})`,
      contract,
    };
  }
}

function imageDecoderGlobal(): ImageDecoderSupportApi | undefined {
  const value = (globalThis as typeof globalThis & { ImageDecoder?: unknown }).ImageDecoder;
  return isRecord(value) || typeof value === 'function'
    ? value as unknown as ImageDecoderSupportApi
    : undefined;
}

function errorName(error: unknown): string {
  if (error !== null && typeof error === 'object' && 'name' in error &&
      typeof (error as { name?: unknown }).name === 'string') {
    return (error as { name: string }).name;
  }
  return typeof error;
}
