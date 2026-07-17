import type { MediaBytes, MediaInput, RemuxOptions } from '../../core/engine.ts';
import { canonicalContainer } from './binary.ts';

export const REMUX_ROUND_TRIP_LEG_ROLE = 'remux-roundtrip-leg-1' as const;

export interface RemuxRoundTripContract {
  readonly schema: 'media-test/remux-roundtrip@1';
  readonly via: string;
  readonly backTo: string;
}

export type RemuxLeg = 'outbound' | 'return';

export type RemuxLegExecutor = (
  input: MediaInput,
  options: RemuxOptions,
  leg: RemuxLeg,
) => Promise<MediaBytes>;

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

/** Parse the existing JSON-only scenario option without accepting an ambiguous/partial chain. */
export function remuxRoundTripContractFromOptions(options: unknown): RemuxRoundTripContract | undefined {
  const source = record(options);
  if (!source || source.roundTrip === undefined) return undefined;
  const chain = source.roundTrip;
  if (!Array.isArray(chain) || chain.length !== 2 || !chain.every((item) => typeof item === 'string' && item.trim())) {
    throw new TypeError('remux roundTrip must be exactly [viaContainer, returnContainer]');
  }
  const via = canonicalContainer(chain[0]);
  const backTo = canonicalContainer(chain[1]);
  const declared = typeof source.container === 'string' ? canonicalContainer(source.container) : '';
  if (!via || !backTo || declared !== via) {
    throw new TypeError(`remux roundTrip outbound '${via}' must equal options.container '${declared}'`);
  }
  if (via === backTo) throw new TypeError('remux roundTrip must traverse two distinct containers');
  return Object.freeze({ schema: 'media-test/remux-roundtrip@1', via, backTo });
}

function inMemoryInput(source: MediaInput, first: MediaBytes): { input: MediaInput; revoke(): void } {
  const bytes = first.bytes.slice();
  const blob = new Blob([bytes.slice().buffer], { type: first.mime });
  const canObjectUrl = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function';
  const url = canObjectUrl ? URL.createObjectURL(blob) : `memory:remux-roundtrip/${encodeURIComponent(source.id)}`;
  return {
    input: {
      id: `${source.id}#${REMUX_ROUND_TRIP_LEG_ROLE}`,
      url,
      mime: first.mime,
      sizeBytes: bytes.byteLength,
      async arrayBuffer(): Promise<ArrayBuffer> { return bytes.slice().buffer as ArrayBuffer; },
      async blob(): Promise<Blob> { return blob; },
    },
    revoke(): void {
      if (canObjectUrl) URL.revokeObjectURL(url);
    },
  };
}

/**
 * Execute the property the scenario names: x -> via -> backTo through the same candidate adapter.
 * The injected executor lets the runner validate and instrument both calls independently. The first
 * leg is retained as observable evidence and the final bytes remain the scored output.
 */
export async function executeRemuxRoundTrip(
  input: MediaInput,
  contract: RemuxRoundTripContract,
  execute: RemuxLegExecutor,
): Promise<MediaBytes> {
  const first = await execute(input, { container: contract.via }, 'outbound');
  if (canonicalContainer(first.container) !== canonicalContainer(contract.via)) {
    throw new TypeError(`round-trip outbound returned '${first.container}', expected '${contract.via}'`);
  }
  const memory = inMemoryInput(input, first);
  let final: MediaBytes;
  try {
    final = await execute(memory.input, { container: contract.backTo }, 'return');
  } finally {
    memory.revoke();
  }
  if (canonicalContainer(final.container) !== canonicalContainer(contract.backTo)) {
    throw new TypeError(`round-trip return returned '${final.container}', expected '${contract.backTo}'`);
  }
  return {
    ...final,
    intermediates: [
      ...(final.intermediates ?? []),
      {
        role: REMUX_ROUND_TRIP_LEG_ROLE,
        bytes: first.bytes.slice(),
        mime: first.mime,
        container: first.container,
      },
    ],
  };
}
