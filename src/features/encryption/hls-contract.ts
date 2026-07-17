import type { OracleVerdict } from '../../core/scenario.ts';
import type {
  HlsEncryptionContract,
  HlsExpectedTransition,
  HlsIvMode,
  HlsKeyMethod,
} from './contracts.ts';

export interface HlsObservedTransition {
  readonly firstSequence: number;
  readonly method: HlsKeyMethod;
  readonly keyRef?: string;
  readonly ivMode?: HlsIvMode;
  readonly ivHex?: string;
}

export interface HlsEncryptionTimeline {
  readonly mediaSequence: number;
  readonly segmentCount: number;
  readonly transitions: readonly HlsObservedTransition[];
}

export type HlsContractDecision =
  | {
      readonly state: 'VERDICT';
      readonly verdict: OracleVerdict;
      readonly reasonCode: string;
      readonly detail: string;
    }
  | {
      readonly state: 'ERROR';
      readonly reasonCode: string;
      readonly detail: string;
    };

/** RFC 8216 media-sequence fallback: 128-bit big-endian unsigned sequence number. */
export function hlsMediaSequenceIv(sequence: number): string {
  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    throw new TypeError('HLS media sequence must be a non-negative safe integer');
  }
  return sequence.toString(16).padStart(32, '0');
}

/** Parse only the encryption timeline needed by the conformance contract; malformed tags throw. */
export function inspectHlsEncryptionTimeline(playlist: string): HlsEncryptionTimeline {
  if (typeof playlist !== 'string' || !playlist.startsWith('#EXTM3U')) {
    throw new TypeError('HLS playlist must begin with #EXTM3U');
  }
  const lines = playlist.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const sequenceLine = lines.find((line) => line.startsWith('#EXT-X-MEDIA-SEQUENCE:'));
  const mediaSequence = sequenceLine
    ? parseNonNegativeInteger(sequenceLine.slice('#EXT-X-MEDIA-SEQUENCE:'.length), 'media sequence')
    : 0;
  let nextSequence = mediaSequence;
  let segmentCount = 0;
  const transitions: HlsObservedTransition[] = [];

  for (const line of lines) {
    if (line.startsWith('#EXT-X-KEY:')) {
      const attributes = parseAttributeList(line.slice('#EXT-X-KEY:'.length));
      const method = attributes.METHOD;
      if (method !== 'AES-128' && method !== 'SAMPLE-AES' && method !== 'NONE') {
        throw new TypeError(`unsupported HLS METHOD ${JSON.stringify(method)}`);
      }
      if (method === 'NONE') {
        if (attributes.URI !== undefined || attributes.IV !== undefined) {
          throw new TypeError('METHOD=NONE must not carry URI or IV');
        }
        transitions.push(Object.freeze({ firstSequence: nextSequence, method }));
        continue;
      }
      const keyRef = unquote(attributes.URI);
      if (!keyRef) throw new TypeError(`${method} EXT-X-KEY requires URI`);
      const explicitIv = attributes.IV === undefined ? undefined : normalizeIv(attributes.IV);
      transitions.push(Object.freeze({
        firstSequence: nextSequence,
        method,
        keyRef,
        ivMode: explicitIv ? 'explicit' : 'media-sequence',
        ivHex: explicitIv ?? hlsMediaSequenceIv(nextSequence),
      }));
      continue;
    }
    if (!line.startsWith('#')) {
      segmentCount++;
      nextSequence++;
    }
  }
  if (segmentCount === 0) throw new TypeError('HLS playlist has no media segments');
  return Object.freeze({ mediaSequence, segmentCount, transitions: Object.freeze(transitions) });
}

/** Exact method/IV/key-transition matrix validation used before decrypt correctness is scored. */
export function validateHlsEncryptionContract(
  playlist: string,
  contract: HlsEncryptionContract,
): HlsContractDecision {
  let observed: HlsEncryptionTimeline;
  try {
    observed = inspectHlsEncryptionTimeline(playlist);
  } catch (error) {
    return errorDecision('HLS_ENCRYPTION_TIMELINE_MALFORMED', errorMessage(error));
  }
  if (observed.mediaSequence !== contract.mediaSequence) {
    return fail(
      'HLS_MEDIA_SEQUENCE_MISMATCH',
      `playlist sequence ${observed.mediaSequence} != contract ${contract.mediaSequence}`,
    );
  }
  if (observed.transitions.length !== contract.transitions.length) {
    return fail(
      'HLS_KEY_TRANSITION_CARDINALITY_MISMATCH',
      `playlist has ${observed.transitions.length} key transition(s), contract has ${contract.transitions.length}`,
    );
  }
  for (let index = 0; index < contract.transitions.length; index++) {
    const expected = contract.transitions[index]!;
    const actual = observed.transitions[index]!;
    const mismatch = compareTransition(actual, expected);
    if (mismatch) return fail('HLS_KEY_TRANSITION_MISMATCH', `transition ${index}: ${mismatch}`);
  }
  return pass(
    'HLS_ENCRYPTION_TIMELINE_MATCH',
    `${observed.segmentCount} segment(s), ${observed.transitions.length} exact method/key/IV transition(s)`,
  );
}

/** Feeding one HLS method to the other primitive is never a PASS. */
export function assessHlsRequestedMethod(
  playlist: string,
  requested: 'hls-aes128' | 'hls-sample-aes',
): HlsContractDecision {
  let timeline: HlsEncryptionTimeline;
  try {
    timeline = inspectHlsEncryptionTimeline(playlist);
  } catch (error) {
    return errorDecision('HLS_ENCRYPTION_TIMELINE_MALFORMED', errorMessage(error));
  }
  const expectedMethod: HlsKeyMethod = requested === 'hls-aes128' ? 'AES-128' : 'SAMPLE-AES';
  const incompatible = timeline.transitions.find(
    (transition) => transition.method !== expectedMethod && transition.method !== 'NONE',
  );
  return incompatible
    ? fail(
        'HLS_METHOD_MISMATCH',
        `requested ${expectedMethod}, playlist declares ${incompatible.method} at sequence ${incompatible.firstSequence}`,
      )
    : pass('HLS_METHOD_MATCH', `playlist protection method is ${expectedMethod}`);
}

function compareTransition(actual: HlsObservedTransition, expected: HlsExpectedTransition): string | undefined {
  if (actual.firstSequence !== expected.firstSequence) {
    return `firstSequence ${actual.firstSequence} != ${expected.firstSequence}`;
  }
  if (actual.method !== expected.method) return `method ${actual.method} != ${expected.method}`;
  if (actual.method === 'NONE') return undefined;
  if (actual.keyRef !== expected.keyRef) return `key URI ${actual.keyRef} != ${expected.keyRef}`;
  if (actual.ivMode !== expected.ivMode) return `IV mode ${actual.ivMode} != ${expected.ivMode}`;
  const expectedIv = expected.ivMode === 'explicit'
    ? expected.explicitIvHex
    : hlsMediaSequenceIv(expected.firstSequence);
  if (actual.ivHex !== expectedIv) return `IV ${actual.ivHex} != ${expectedIv}`;
  return undefined;
}

function parseAttributeList(value: string): Record<string, string> {
  const out: Record<string, string> = {};
  let token = '';
  let quoted = false;
  const flush = (): void => {
    if (!token) return;
    const equals = token.indexOf('=');
    if (equals <= 0) throw new TypeError(`malformed HLS attribute ${JSON.stringify(token)}`);
    const key = token.slice(0, equals).trim();
    const item = token.slice(equals + 1).trim();
    if (!key || item === '') throw new TypeError(`malformed HLS attribute ${JSON.stringify(token)}`);
    if (out[key] !== undefined) throw new TypeError(`duplicate HLS attribute ${key}`);
    out[key] = item;
    token = '';
  };
  for (const character of value) {
    if (character === '"') quoted = !quoted;
    if (character === ',' && !quoted) flush();
    else token += character;
  }
  if (quoted) throw new TypeError('unterminated quoted HLS attribute');
  flush();
  return out;
}

function unquote(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (value.startsWith('"') !== value.endsWith('"')) throw new TypeError('malformed quoted HLS URI');
  const result = value.startsWith('"') ? value.slice(1, -1) : value;
  return result || undefined;
}

function normalizeIv(value: string): string {
  const normalized = value.toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]{32}$/.test(normalized)) throw new TypeError('HLS IV must contain exactly 16 bytes');
  return normalized;
}

function parseNonNegativeInteger(value: string, label: string): number {
  if (!/^(?:0|[1-9][0-9]*)$/.test(value)) throw new TypeError(`${label} is not a canonical integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new TypeError(`${label} exceeds the safe integer range`);
  return parsed;
}

function pass(reasonCode: string, detail: string): HlsContractDecision {
  return Object.freeze({ state: 'VERDICT', verdict: 'PASS', reasonCode, detail });
}

function fail(reasonCode: string, detail: string): HlsContractDecision {
  return Object.freeze({ state: 'VERDICT', verdict: 'FAIL', reasonCode, detail });
}

function errorDecision(reasonCode: string, detail: string): HlsContractDecision {
  return Object.freeze({ state: 'ERROR', reasonCode, detail });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
