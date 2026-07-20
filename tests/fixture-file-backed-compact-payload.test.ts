import { afterEach, describe, expect, test } from 'bun:test';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  normalizeScenarioPacketEvidenceForGolden,
  scenarioPacketEnvelopeForGolden,
} from '../fixtures/bake-scenario-goldens.mjs';
import { inspectCompactGoldenFile } from '../fixtures/lib/compact-golden-file.mjs';
import {
  fileBackedCompactGoldenPacketPayloadIdentity,
  issueFileBackedCompactGoldenPacketPayload,
  spliceFileBackedCompactGoldenPacketPayload,
} from '../fixtures/lib/file-backed-compact-payload.mjs';
import { writePrevalidatedCompactGoldenSource } from '../fixtures/lib/generation-publication.mjs';
import { canonicalJson } from '../fixtures/lib/golden-normalization.mjs';
import { validateCompactGoldenPacketPayload } from '../fixtures/lib/lossless-json-columnar-validator.mjs';
import { readCompactGoldenPacketRows } from '../src/core/lossless-json-columnar.ts';

const roots: string[] = [];
afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('file-backed compact-payload descriptor', () => {
  test('round-trips through provenance, canonical envelope writing, disk inspection, and runtime validation', () => {
    const root = temporaryRoot();
    const mediaPath = join(root, 'asset.mp4');
    writeFileSync(mediaPath, 'hermetic-media');
    const issued = issuePayload(root);
    const payloadIdentity = fileBackedCompactGoldenPacketPayloadIdentity(issued.payload);
    const envelope = scenarioPacketEnvelopeForGolden('asset.mp4', mediaPath, issued.payload);
    expect(envelope.provenance.outputArtifact).toMatchObject({
      digestScope: 'canonical-payload',
      ...payloadIdentity,
    });

    const artifactPath = join(root, 'artifact.packets.json');
    const marker = writePrevalidatedCompactGoldenSource(envelope, artifactPath);
    expect(existsSync(issued.cleanupPath)).toBe(false);
    expect(() => fileBackedCompactGoldenPacketPayloadIdentity(issued.payload)).toThrow(/already consumed/);

    const inspection = inspectCompactGoldenFile(artifactPath);
    expect(inspection).toMatchObject({
      artifactSha256: marker.artifactSha256,
      artifactSizeBytes: marker.artifactSizeBytes,
      payloadSha256: payloadIdentity.sha256,
      payloadSizeBytes: payloadIdentity.sizeBytes,
      envelope: { assetId: 'asset.mp4', artifactKind: 'packets' },
    });
    const document = JSON.parse(readFileSync(artifactPath, 'utf8'));
    expect(validateCompactGoldenPacketPayload(document.payload)).toMatchObject({ packetRowCount: 2 });
    expect(readCompactGoldenPacketRows(document.payload)).toEqual([
      expect.objectContaining({ trackIndex: 0, ptsUs: 0, size: 7, keyframe: true }),
      expect.objectContaining({ trackIndex: 0, ptsUs: 40_000, size: 9, keyframe: false }),
    ]);
  });

  test('rejects forged descriptors, changed payload bytes, and mismatched envelope source fields', () => {
    const root = temporaryRoot();
    const mediaPath = join(root, 'asset.mp4');
    writeFileSync(mediaPath, 'hermetic-media');

    const forgedIssue = issuePayload(root);
    const forged = { ...forgedIssue.payload };
    const forgedEnvelope = scenarioPacketEnvelopeForGolden('asset.mp4', mediaPath, forged);
    const forgedOutput = join(root, 'forged.packets.json');
    expect(() => writePrevalidatedCompactGoldenSource(forgedEnvelope, forgedOutput)).toThrow(/unsupported compact/);
    expect(existsSync(forgedOutput)).toBe(false);
    // The genuine descriptor was never handed to the writer, so consume it separately via a valid
    // envelope and prove that shape cloning did not acquire its private issuance identity.
    writePrevalidatedCompactGoldenSource(
      scenarioPacketEnvelopeForGolden('asset.mp4', mediaPath, forgedIssue.payload),
      join(root, 'genuine-after-forge.packets.json'),
    );

    const changedIssue = issuePayload(root);
    const changedEnvelope = scenarioPacketEnvelopeForGolden('asset.mp4', mediaPath, changedIssue.payload);
    const changedBytes = readFileSync(changedIssue.payloadPath);
    const rowCount = changedBytes.indexOf(Buffer.from('"rowCount":2'));
    expect(rowCount).toBeGreaterThanOrEqual(0);
    changedBytes[rowCount + '"rowCount":'.length] = '3'.charCodeAt(0);
    writeFileSync(changedIssue.payloadPath, changedBytes);
    const changedOutput = join(root, 'changed.packets.json');
    expect(() => writePrevalidatedCompactGoldenSource(changedEnvelope, changedOutput)).toThrow(/source changed/);
    expect(existsSync(changedOutput)).toBe(false);
    expect(existsSync(changedIssue.cleanupPath)).toBe(false);

    const sourceIssue = issuePayload(root);
    const sourceEnvelope = scenarioPacketEnvelopeForGolden('asset.mp4', mediaPath, sourceIssue.payload);
    sourceEnvelope.sourceMedia = { ...sourceEnvelope.sourceMedia, sha256: '0'.repeat(64) };
    const sourceOutput = join(root, 'source-mismatch.packets.json');
    expect(() => writePrevalidatedCompactGoldenSource(sourceEnvelope, sourceOutput)).toThrow(/artifact\/source fields/);
    expect(existsSync(sourceOutput)).toBe(false);
    expect(existsSync(sourceIssue.cleanupPath)).toBe(false);
  });

  test('an invalid standalone payload removes its private temp root before throwing', () => {
    const root = temporaryRoot();
    const cleanupPath = mkdtempSync(join(root, 'media-test-invalid-payload-'));
    const payloadPath = join(cleanupPath, 'payload.json');
    writeFileSync(payloadPath, '{"schema":"not-compact"}');
    expect(() => issueFileBackedCompactGoldenPacketPayload({ sourcePath: payloadPath, cleanupPath }))
      .toThrow(/canonical key|unsupported compact|unexpected end/);
    expect(existsSync(cleanupPath)).toBe(false);
  });

  test('the byte capability is consumed by its first splice attempt', () => {
    const root = temporaryRoot();
    const successful = issuePayload(root);
    const chunks: Uint8Array[] = [];
    spliceFileBackedCompactGoldenPacketPayload(successful.payload, (bytes) => chunks.push(bytes.slice()));
    expect(Buffer.concat(chunks).byteLength).toBeGreaterThan(0);
    expect(existsSync(successful.cleanupPath)).toBe(false);
    expect(() => spliceFileBackedCompactGoldenPacketPayload(successful.payload, () => {}))
      .toThrow(/already consumed/);
    expect(() => fileBackedCompactGoldenPacketPayloadIdentity(successful.payload))
      .toThrow(/already consumed/);

    const failed = issuePayload(root);
    expect(() => spliceFileBackedCompactGoldenPacketPayload(failed.payload, () => {
      throw new Error('injected sink failure');
    })).toThrow(/injected sink failure/);
    expect(existsSync(failed.cleanupPath)).toBe(false);
    expect(() => spliceFileBackedCompactGoldenPacketPayload(failed.payload, () => {}))
      .toThrow(/already consumed/);
  });
});

function issuePayload(root: string): { payload: any; payloadPath: string; cleanupPath: string } {
  const compact = normalizeScenarioPacketEvidenceForGolden(packetProbe(), {
    assetId: 'asset.mp4',
    compactThreshold: 1,
    decodedUnits: [
      { streamIndex: 0, ptsUs: 0, durationUs: 40_000, sha256: 'a'.repeat(64) },
      { streamIndex: 0, ptsUs: 40_000, durationUs: 40_000, sha256: 'b'.repeat(64) },
    ],
    decoderObservation: { state: 'validated' },
  });
  const cleanupPath = mkdtempSync(join(root, 'media-test-compact-payload-'));
  const payloadPath = join(cleanupPath, 'payload.json');
  writeFileSync(payloadPath, canonicalJson(compact));
  return {
    payload: issueFileBackedCompactGoldenPacketPayload({ sourcePath: payloadPath, cleanupPath }),
    payloadPath,
    cleanupPath,
  };
}

function packetProbe(): any {
  return {
    format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2' },
    streams: [{
      index: 0,
      codec_type: 'video',
      codec_name: 'h264',
      codec_tag_string: 'avc1',
      time_base: '1/1000',
      nal_length_size: '4',
      extradata: '00000000: 0164001f ffe10004 6764001f 01000268 ee',
    }],
    packets: [
      { stream_index: 0, size: '7', pts: '0', dts: '0', duration: '40', flags: 'K__' },
      { stream_index: 0, size: '9', pts: '40', dts: '40', duration: '40', flags: '___' },
    ],
    frames: [
      { stream_index: 0, pts_time: '0', key_frame: 1, pict_type: 'I' },
      { stream_index: 0, pts_time: '0.04', key_frame: 0, pict_type: 'P' },
    ],
  };
}

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'media-test-file-backed-payload-'));
  roots.push(root);
  return root;
}
