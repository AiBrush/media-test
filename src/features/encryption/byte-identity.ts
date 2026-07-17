import type { OracleVerdict } from '../../core/scenario.ts';

export interface ByteIdentityDecision {
  readonly state: 'VERDICT';
  readonly verdict: OracleVerdict;
  readonly reasonCode: 'DECRYPT_BYTE_IDENTITY_PASS' | 'DECRYPT_BYTE_IDENTITY_FAIL';
  readonly detail: string;
  readonly measurements: Readonly<{
    inputBytes: number;
    outputBytes: number;
    firstDifferenceOffset: number;
  }>;
}

/** Literal byte-no-op contract: metadata-only rewraps are FAIL, not DIFF. */
export function compareDecryptNoopBytes(
  input: Uint8Array,
  output: Uint8Array,
): ByteIdentityDecision {
  let firstDifferenceOffset = -1;
  const common = Math.min(input.byteLength, output.byteLength);
  for (let index = 0; index < common; index++) {
    if (input[index] !== output[index]) {
      firstDifferenceOffset = index;
      break;
    }
  }
  if (firstDifferenceOffset === -1 && input.byteLength !== output.byteLength) {
    firstDifferenceOffset = common;
  }
  const measurements = Object.freeze({
    inputBytes: input.byteLength,
    outputBytes: output.byteLength,
    firstDifferenceOffset,
  });
  return firstDifferenceOffset === -1
    ? Object.freeze({
        state: 'VERDICT',
        verdict: 'PASS',
        reasonCode: 'DECRYPT_BYTE_IDENTITY_PASS',
        detail: `${input.byteLength} output byte(s) are identical to the clear input`,
        measurements,
      })
    : Object.freeze({
        state: 'VERDICT',
        verdict: 'FAIL',
        reasonCode: 'DECRYPT_BYTE_IDENTITY_FAIL',
        detail: `clear-input decrypt changed bytes at offset ${firstDifferenceOffset} ` +
          `(input ${input.byteLength}, output ${output.byteLength})`,
        measurements,
      });
}
