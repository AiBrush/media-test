import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, expect, test } from 'bun:test';

import {
  CENC_CTR_REAUTHOR_FILES,
  CENC_CTR_REAUTHOR_OUTPUT_SCENARIO_ID,
  CENC_CTR_REAUTHOR_PROBED_WITH,
  CENC_CTR_REAUTHOR_SCENARIO_ID,
  assertCencCtrProtectedOutput,
  buildCencCtrReauthorCommands,
  cencCtrReauthorIvLabel,
  compareFullAvFrameMd5,
  reauthorCencCtrCandidates,
} from '../fixtures/reauthor-cenc-ctr-candidates.mjs';
import {
  PROTECTED_PROBE_DERIVATIONS,
  assertProtectedProbeCandidate,
  curateProtectedProbeCandidates,
} from '../fixtures/curate-protected-probe-candidates.mjs';

interface Identity {
  sha256: string;
  sizeBytes: number;
}

interface CatalogFile extends Identity {
  file: string;
  container: string;
  videoCodecs: string[];
  audioCodecs: string[];
  derivation: string;
  probedWith: string;
  cleartextBase: Identity & { poolPath: string };
  keys: { keyHex: string; kid: string; scheme: string };
  evidence: {
    sourceSha256: string;
    available: string[];
    requiredOracles: string[];
    sufficientOracleSets: string[][];
  };
}

interface CatalogRow {
  scenarioId: string;
  class: string;
  requires: { encryption?: string[] };
  files: CatalogFile[];
}

const FIXTURE_SEED = JSON.parse(readFileSync('fixtures/fixture-seed.json', 'utf8')).seedHex as string;
const EXPECTED_IVS: Record<string, Record<1 | 2, string>> = {
  '01.mp4': { 1: 'f7c28fc5f11646dd', 2: '36454e179c011bee' },
  '02.mp4': { 1: '1499862407d271b3', 2: '48bc750261a205bd' },
  '03.mp4': { 1: '4ed23dcd6b7c6e3e', 2: '764dfa21c86bcf17' },
};

describe('probe-owned CENC-CTR candidate authoring', () => {
  test('candidate and track domains produce exact distinct 64-bit IVs and strict two-track commands', () => {
    const allIvs = new Set<string>();
    for (const file of CENC_CTR_REAUTHOR_FILES) {
      const commands = buildCencCtrReauthorCommands({
        file,
        keyHex: '00112233445566778899aabbccddeeff',
        kidHex: '11223344556677889900aabbccddeeff',
        seedHex: FIXTURE_SEED,
        cleartextPath: `/clear/${file}`,
        fragmentedPath: `/fragmented/${file}`,
        videoEditsPath: `/edits/video-${file}.atom`,
        audioEditsPath: `/edits/audio-${file}.atom`,
        editedFragmentedPath: `/fragmented-edits/${file}`,
        outputPath: `/encrypted/${file}`,
      });
      expect(cencCtrReauthorIvLabel(file, 1)).toBe(
        `${CENC_CTR_REAUTHOR_SCENARIO_ID}:${file}:bento4:track-1:iv`,
      );
      expect(commands.ivHexByTrack).toEqual(EXPECTED_IVS[file]);
      expect(commands.ivHexByTrack[1]).toHaveLength(16);
      expect(commands.ivHexByTrack[2]).toHaveLength(16);
      allIvs.add(commands.ivHexByTrack[1]);
      allIvs.add(commands.ivHexByTrack[2]);
      expect(commands.fragmentArgs).toEqual([`/clear/${file}`, `/fragmented/${file}`]);
      expect(commands.extractVideoArgs).toEqual([
        'moov/trak[0]/edts', `/clear/${file}`, `/edits/video-${file}.atom`,
      ]);
      expect(commands.extractAudioArgs).toEqual([
        'moov/trak[1]/edts', `/clear/${file}`, `/edits/audio-${file}.atom`,
      ]);
      expect(commands.editArgs).toEqual([
        '--insert', `moov/trak[0]:/edits/video-${file}.atom`,
        '--insert', `moov/trak[1]:/edits/audio-${file}.atom`,
        `/fragmented/${file}`, `/fragmented-edits/${file}`,
      ]);
      expect(commands.encryptArgs).toEqual([
        '--method', 'MPEG-CENC',
        '--strict',
        '--key', `1:00112233445566778899aabbccddeeff:${commands.ivHexByTrack[1]}`,
        '--property', '1:KID:11223344556677889900aabbccddeeff',
        '--key', `2:00112233445566778899aabbccddeeff:${commands.ivHexByTrack[2]}`,
        '--property', '2:KID:11223344556677889900aabbccddeeff',
        `/fragmented-edits/${file}`,
        `/encrypted/${file}`,
      ]);
      expect(commands.derivation).toContain("mp4extract 'moov/trak[0]/edts'");
      expect(commands.derivation).toContain("mp4extract 'moov/trak[1]/edts'");
      expect(commands.derivation).toContain('mp4fragment <cleartextBase> fragmented.mp4');
      expect(commands.derivation).toContain('rebase video elst media_time=<fragment-video-start-pts>');
      expect(commands.derivation).toContain("mp4edit --insert 'moov/trak[0]':video-edts.atom");
      expect(commands.derivation).toContain('mp4encrypt --method MPEG-CENC --strict');
      expect(commands.derivation).toContain(commands.ivHexByTrack[1]);
      expect(commands.derivation).toContain(commands.ivHexByTrack[2]);
      expect(commands.derivation).not.toMatch(/\brandom\b/iu);
    }
    expect(allIvs.size).toBe(6);

    const changedSeed = `${FIXTURE_SEED[0] === '0' ? '1' : '0'}${FIXTURE_SEED.slice(1)}`;
    const changed = buildCencCtrReauthorCommands({
      file: '01.mp4',
      keyHex: '00112233445566778899aabbccddeeff',
      kidHex: '11223344556677889900aabbccddeeff',
      seedHex: changedSeed,
      cleartextPath: '/clear',
      fragmentedPath: '/fragmented',
      videoEditsPath: '/video-edits',
      audioEditsPath: '/audio-edits',
      editedFragmentedPath: '/fragmented-edits',
      outputPath: '/encrypted',
    });
    expect(changed.ivHexByTrack).not.toEqual(EXPECTED_IVS['01.mp4']);
    expect(() => buildCencCtrReauthorCommands({
      file: '04.mp4',
      keyHex: '00112233445566778899aabbccddeeff',
      kidHex: '11223344556677889900aabbccddeeff',
      seedHex: FIXTURE_SEED,
      cleartextPath: '/clear',
      fragmentedPath: '/fragmented',
      videoEditsPath: '/video-edits',
      audioEditsPath: '/audio-edits',
      editedFragmentedPath: '/fragmented-edits',
      outputPath: '/encrypted',
    })).toThrow('unsupported CENC-CTR reauthor candidate');
  });

  test('identity and command failures leave immutable inputs and probe outputs unchanged', () => {
    const temporary = mkdtempSync(join(tmpdir(), 'media-test-cenc-reauthor-fail-'));
    const root = join(temporary, 'checkout');
    try {
      const fixture = createMinimalRoot(root);
      const catalogBefore = readFileSync(fixture.sourcesPath);
      const sourcesBefore = sourceIdentities(root);
      const outputsBefore = outputIdentities(root);
      let commandCount = 0;
      expect(() => reauthorCencCtrCandidates({
        root,
        runCommand(binary: string) {
          commandCount++;
          return { status: 19, stdout: '', stderr: `${binary} deliberately failed` };
        },
      })).toThrow('deliberately failed');
      expect(commandCount).toBe(1);
      expect(readFileSync(fixture.sourcesPath)).toEqual(catalogBefore);
      expect(sourceIdentities(root)).toEqual(sourcesBefore);
      expect(outputIdentities(root)).toEqual(outputsBefore);
      expect(existsSync(transactionPath(root))).toBe(false);

      writeFileSync(fixture.cleartextPaths[0]!, 'mutated cleartext base');
      commandCount = 0;
      expect(() => reauthorCencCtrCandidates({
        root,
        runCommand() {
          commandCount++;
          return { status: 0, stdout: '', stderr: '' };
        },
      })).toThrow('cleartextBase: identity mismatch');
      expect(commandCount).toBe(0);
      expect(readFileSync(fixture.sourcesPath)).toEqual(catalogBefore);
      expect(sourceIdentities(root)).toEqual(sourcesBefore);
      expect(outputIdentities(root)).toEqual(outputsBefore);
      expect(existsSync(transactionPath(root))).toBe(false);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });

  test('an ownerless interrupted transaction is preserved and refused before authoring', () => {
    const temporary = mkdtempSync(join(tmpdir(), 'media-test-cenc-reauthor-ownerless-'));
    const root = join(temporary, 'checkout');
    try {
      const fixture = createMinimalRoot(root);
      const catalogBefore = readFileSync(fixture.sourcesPath);
      const sourcesBefore = sourceIdentities(root);
      const outputsBefore = outputIdentities(root);
      const transaction = transactionPath(root);
      mkdirSync(transaction);
      const marker = join(transaction, 'partial-initialization');
      writeFileSync(marker, 'preserve me');
      let commandCount = 0;
      expect(() => reauthorCencCtrCandidates({
        root,
        runCommand() {
          commandCount++;
          return { status: 0, stdout: '', stderr: '' };
        },
      })).toThrow('transaction owner metadata is missing; preserved for inspection');
      expect(commandCount).toBe(0);
      expect(readFileSync(marker, 'utf8')).toBe('preserve me');
      expect(readFileSync(fixture.sourcesPath)).toEqual(catalogBefore);
      expect(sourceIdentities(root)).toEqual(sourcesBefore);
      expect(outputIdentities(root)).toEqual(outputsBefore);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });

  test('full A/V comparison requires exact presented timestamps, cardinality, and hashes', () => {
    const unit = (streamIndex: number, dts: number, pts: number, duration: number, sha256: string) => ({
      streamIndex,
      dts,
      pts,
      duration,
      size: streamIndex === 0 ? 100 : duration * 4,
      sha256,
    });
    const video = unit(0, 0, 0, 1, '1'.repeat(64));
    const audio = unit(1, 0, 0, 1024, '2'.repeat(64));
    const priming = unit(1, -1024, -1024, 1024, '0'.repeat(64));
    const timebaseByStream = new Map([
      [0, { numerator: 1, denominator: 30 }],
      [1, { numerator: 1, denominator: 48_000 }],
    ]);
    const clear = { rowsByStream: new Map([[0, [video]], [1, [audio]]]), timebaseByStream };
    const exact = { rowsByStream: new Map([[0, [video]], [1, [audio]]]), timebaseByStream };

    expect(compareFullAvFrameMd5(clear, exact)).toMatchObject({
      videoUnits: 1,
      audioUnits: 1,
      runtimeVideoVerdict: { verdict: 'PASS' },
    });
    expect(() => compareFullAvFrameMd5(clear, {
      rowsByStream: new Map([[0, [video]], [1, [priming, audio]]]),
      timebaseByStream,
    })).toThrow('full audio');
    const mutated = {
      rowsByStream: new Map([[0, [video]], [1, [unit(1, 0, 0, 1024, '3'.repeat(64))]]]),
      timebaseByStream,
    };
    expect(() => compareFullAvFrameMd5(clear, mutated)).toThrow('full audio');
    expect(() => compareFullAvFrameMd5(clear, {
      rowsByStream: new Map([[0, [video]], [1, [unit(1, 0, 1, 1024, audio.sha256)]]]),
      timebaseByStream,
    })).toThrow('full audio');
    expect(() => compareFullAvFrameMd5(clear, {
      rowsByStream: new Map([[0, [unit(0, 1, 1, 1, video.sha256)]], [1, [audio]]]),
      timebaseByStream,
    })).toThrow('full video');
    expect(compareFullAvFrameMd5(clear, {
      rowsByStream: exact.rowsByStream,
      timebaseByStream: new Map([
        [0, { numerator: 2, denominator: 60 }],
        [1, { numerator: 2, denominator: 96_000 }],
      ]),
    })).toMatchObject({ videoUnits: 1, audioUnits: 1 });
    expect(() => compareFullAvFrameMd5(clear, {
      rowsByStream: exact.rowsByStream,
      timebaseByStream: new Map([
        [0, { numerator: 1, denominator: 30 }],
        [1, { numerator: 1, denominator: 24_000 }],
      ]),
    })).toThrow('audio timebase 1/24000 does not equal cleartextBase 1/48000');
  });

  const integrationTest = nativeToolsAvailable() ? test : test.skip;
  integrationTest(
    'real pipeline transactionally authors only probe CTR and its curator validates without copying',
    () => {
      const temporary = mkdtempSync(join(tmpdir(), 'media-test-cenc-reauthor-real-'));
      const root = join(temporary, 'checkout');
      const productionBefore = identity('fixtures/media/scenarios/_sources.ndjson');
      try {
        const fixture = createProductionBackedRoot(root);
        const beforeText = readFileSync(fixture.sourcesPath, 'utf8');
        let expectedCatalogBeforeSuccess = beforeText;
        const beforeRows = readRows(fixture.sourcesPath);
        const beforeSource = requiredRow(beforeRows, CENC_CTR_REAUTHOR_SCENARIO_ID);
        const beforeOutput = requiredRow(beforeRows, CENC_CTR_REAUTHOR_OUTPUT_SCENARIO_ID);
        const immutableSourceBytes = sourceIdentities(root);

        const rollbackCatalog = readFileSync(fixture.sourcesPath);
        const rollbackSources = sourceIdentities(root);
        const rollbackOutputs = outputIdentities(root);
        let rejectedCatalogRename = false;
        expect(() => reauthorCencCtrCandidates({
          root,
          renameSync(source: string, destination: string) {
            if (destination === fixture.sourcesPath) {
              rejectedCatalogRename = true;
              throw new Error('injected catalog rename failure');
            }
            renameSync(source, destination);
          },
        })).toThrow('injected catalog rename failure');
        expect(rejectedCatalogRename).toBe(true);
        expect(readFileSync(fixture.sourcesPath)).toEqual(rollbackCatalog);
        expect(sourceIdentities(root)).toEqual(rollbackSources);
        expect(outputIdentities(root)).toEqual(rollbackOutputs);
        expect(existsSync(transactionPath(root))).toBe(false);

        let injectedConcurrentCatalogWrite = false;
        expect(() => reauthorCencCtrCandidates({
          root,
          renameSync(source: string, destination: string) {
            if (!injectedConcurrentCatalogWrite &&
                destination === join(transactionPath(root), 'original', '01.mp4')) {
              injectedConcurrentCatalogWrite = true;
              expectedCatalogBeforeSuccess = addUnrelatedCatalogMarker(
                readFileSync(fixture.sourcesPath, 'utf8'),
              );
              writeFileSync(fixture.sourcesPath, expectedCatalogBeforeSuccess);
            }
            renameSync(source, destination);
          },
        })).toThrow('catalog changed during probe/cenc_ctr commit');
        expect(injectedConcurrentCatalogWrite).toBe(true);
        expect(readFileSync(fixture.sourcesPath, 'utf8')).toBe(expectedCatalogBeforeSuccess);
        expect(sourceIdentities(root)).toEqual(rollbackSources);
        expect(outputIdentities(root)).toEqual(rollbackOutputs);
        expect(existsSync(transactionPath(root))).toBe(false);

        const first = reauthorCencCtrCandidates({ root });
        expect(first.changed).toBe(true);
        expect(first.files.map((file: { file: string }) => file.file).sort()).toEqual(
          [...CENC_CTR_REAUTHOR_FILES].sort(),
        );
        expect(existsSync(transactionPath(root))).toBe(false);

        const afterText = readFileSync(fixture.sourcesPath, 'utf8');
        const afterRows = readRows(fixture.sourcesPath);
        const afterSource = requiredRow(afterRows, CENC_CTR_REAUTHOR_SCENARIO_ID);
        const afterOutput = requiredRow(afterRows, CENC_CTR_REAUTHOR_OUTPUT_SCENARIO_ID);
        expect(afterSource).toEqual(beforeSource);
        expect(sourceIdentities(root)).toEqual(immutableSourceBytes);
        expectUntargetedLinesUnchanged(
          expectedCatalogBeforeSuccess,
          afterText,
          CENC_CTR_REAUTHOR_OUTPUT_SCENARIO_ID,
        );
        expect(afterOutput.note).toContain('Probe-owned deterministic fragmented CENC-CTR');
        for (const [index, file] of afterOutput.files.entries()) {
          const beforeFile = beforeOutput.files[index]!;
          const inputFile = beforeSource.files[index]!;
          expect(omitAuthoredFields(file)).toEqual(omitAuthoredFields(beforeFile));
          expect(file.sha256).not.toBe(beforeFile.sha256);
          expect(file.sizeBytes).not.toBe(beforeFile.sizeBytes);
          expect(file.derivation).toContain(EXPECTED_IVS[file.file]![1]);
          expect(file.derivation).toContain(EXPECTED_IVS[file.file]![2]);
          expect(file.derivation).not.toMatch(/\brandom\b/iu);
          expect(file.probedWith).toBe(CENC_CTR_REAUTHOR_PROBED_WITH);
          expect(file.evidence).toEqual({
            ...beforeFile.evidence,
            sourceSha256: file.sha256,
          });
          expect(file.keys).toEqual(inputFile.keys);
          expect(file.cleartextBase).toEqual(inputFile.cleartextBase);
          expect(identity(join(root, 'fixtures/media/scenarios', CENC_CTR_REAUTHOR_OUTPUT_SCENARIO_ID, file.file)))
            .toEqual({ sha256: file.sha256, sizeBytes: file.sizeBytes });
          expect(file.sha256).not.toBe(file.cleartextBase.sha256);
          expect(file.sha256).not.toBe(inputFile.sha256);

          const contract = PROTECTED_PROBE_DERIVATIONS.find(
            (candidate) => candidate.scenarioId === CENC_CTR_REAUTHOR_OUTPUT_SCENARIO_ID,
          )!;
          const protectedBytes = new Uint8Array(readFileSync(
            join(root, 'fixtures/media/scenarios', CENC_CTR_REAUTHOR_OUTPUT_SCENARIO_ID, file.file),
          ));
          expect(assertCencCtrProtectedOutput(
            protectedBytes,
            file.keys.kid,
            EXPECTED_IVS[file.file],
            file.file,
          ).state).toBe('OK');
          const evidence = assertProtectedProbeCandidate(
            protectedBytes,
            file,
            contract,
          );
          const mediaTracks = evidence.tracks.filter(
            (track: { type: string }) => track.type === 'video' || track.type === 'audio',
          );
          expect(mediaTracks).toHaveLength(2);
          expect(mediaTracks.map((track: { trackId?: number }) => track.trackId).sort()).toEqual([1, 2]);
        }

        const strictFile = afterOutput.files[0]!;
        const strictBytes = new Uint8Array(readFileSync(join(
          root,
          'fixtures/media/scenarios',
          CENC_CTR_REAUTHOR_OUTPUT_SCENARIO_ID,
          strictFile.file,
        )));
        const missingFragments = replaceAsciiToken(strictBytes, 'moof', 'free');
        expect(() => assertCencCtrProtectedOutput(
          missingFragments,
          strictFile.keys.kid,
          EXPECTED_IVS[strictFile.file],
          'missing-moof mutation',
        )).toThrow('contains no top-level moof fragment');
        const missingSampleEncryption = replaceAsciiToken(strictBytes, 'senc', 'free');
        expect(() => assertCencCtrProtectedOutput(
          missingSampleEncryption,
          strictFile.keys.kid,
          EXPECTED_IVS[strictFile.file],
          'missing-senc mutation',
        )).toThrow('must contain exactly one senc box');
        const mutatedIv = strictBytes.slice();
        const expandedIv = Buffer.from(`${EXPECTED_IVS[strictFile.file]![1]}${'0'.repeat(16)}`, 'hex');
        const ivOffset = Buffer.from(mutatedIv).indexOf(expandedIv);
        expect(ivOffset).toBeGreaterThan(0);
        mutatedIv[ivOffset] ^= 0x80;
        expect(() => assertCencCtrProtectedOutput(
          mutatedIv,
          strictFile.keys.kid,
          EXPECTED_IVS[strictFile.file],
          'wrong-IV mutation',
        )).toThrow('does not equal deterministic initial IV');

        const firstCatalog = readFileSync(fixture.sourcesPath);
        const firstSources = sourceIdentities(root);
        const firstOutputs = outputIdentities(root);
        const second = reauthorCencCtrCandidates({ root });
        expect(second.changed).toBe(false);
        expect(readFileSync(fixture.sourcesPath)).toEqual(firstCatalog);
        expect(sourceIdentities(root)).toEqual(firstSources);
        expect(outputIdentities(root)).toEqual(firstOutputs);
        expect(existsSync(transactionPath(root))).toBe(false);

        curateProtectedProbeCandidates({ root });
        const curatedRows = readRows(fixture.sourcesPath);
        expect(requiredRow(curatedRows, CENC_CTR_REAUTHOR_SCENARIO_ID)).toEqual(afterSource);
        const probe = requiredRow(curatedRows, 'probe/cenc_ctr');
        expect(probe).toEqual(afterOutput);
        expect(outputIdentities(root)).toEqual(firstOutputs);
        expect(sourceIdentities(root)).toEqual(firstSources);
        for (const file of probe.files) {
          expect(readFileSync(
            join(root, 'fixtures/media/scenarios/probe/cenc_ctr', file.file),
          )).not.toEqual(readFileSync(
            join(root, 'fixtures/media/scenarios', CENC_CTR_REAUTHOR_SCENARIO_ID, file.file),
          ));
        }
        expect(identity('fixtures/media/scenarios/_sources.ndjson')).toEqual(productionBefore);
      } finally {
        rmSync(temporary, { recursive: true, force: true });
      }
    },
    120_000,
  );
});

function createMinimalRoot(root: string): {
  sourcesPath: string;
  cleartextPaths: string[];
} {
  copyIntoRoot(root, 'fixtures/fixture-seed.json');
  const scenarioRoot = join(root, 'fixtures/media/scenarios');
  const sourceDirectory = join(scenarioRoot, CENC_CTR_REAUTHOR_SCENARIO_ID);
  const outputDirectory = join(scenarioRoot, CENC_CTR_REAUTHOR_OUTPUT_SCENARIO_ID);
  const cleartextDirectory = join(scenarioRoot, '_derived_cleartext');
  mkdirSync(sourceDirectory, { recursive: true });
  mkdirSync(outputDirectory, { recursive: true });
  mkdirSync(cleartextDirectory, { recursive: true });
  const cleartextPaths: string[] = [];
  const files = CENC_CTR_REAUTHOR_FILES.map((file, index) => {
    const clearName = `clear-${index + 1}.mp4`;
    const cleartextPath = join(cleartextDirectory, clearName);
    const sourcePath = join(sourceDirectory, file);
    const outputPath = join(outputDirectory, file);
    writeFileSync(cleartextPath, `clear ${file}`);
    writeFileSync(sourcePath, `old encrypted ${file}`);
    writeFileSync(outputPath, `old probe encrypted ${file}`);
    cleartextPaths.push(cleartextPath);
    return {
      file,
      container: 'mp4',
      videoCodecs: ['h264'],
      audioCodecs: ['aac'],
      ...identity(sourcePath),
      cleartextBase: { poolPath: `_derived_cleartext/${clearName}`, ...identity(cleartextPath) },
      derivation: `legacy ${file}`,
      keys: {
        keyHex: `${index + 1}`.repeat(32),
        kid: `${index + 4}`.repeat(32),
        scheme: 'cenc-ctr',
      },
      probedWith: 'legacy test',
      evidence: {
        sourceSha256: identity(outputPath).sha256,
        available: ['SOURCE_GOLDEN', 'CANDIDATE_DECODE'],
        requiredOracles: ['golden-metadata'],
        sufficientOracleSets: [['golden-metadata']],
      },
    };
  });
  const outputFiles = files.map((file) => {
    const outputIdentity = identity(join(outputDirectory, file.file));
    return {
      ...structuredClone(file),
      ...outputIdentity,
      evidence: { ...file.evidence, sourceSha256: outputIdentity.sha256 },
    };
  });
  const rows = [
    { scenarioId: 'unrelated/test', class: 'REAL', requires: {}, files: [] },
    {
      scenarioId: CENC_CTR_REAUTHOR_SCENARIO_ID,
      class: 'DERIVED',
      requires: { encryption: ['cenc-ctr'] },
      files,
    },
    {
      scenarioId: CENC_CTR_REAUTHOR_OUTPUT_SCENARIO_ID,
      class: 'DERIVED',
      requires: { encryption: ['cenc-ctr'] },
      note: 'legacy probe-owned test row',
      files: outputFiles,
    },
  ];
  const sourcesPath = join(scenarioRoot, '_sources.ndjson');
  writeFileSync(sourcesPath, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);
  return { sourcesPath, cleartextPaths };
}

function createProductionBackedRoot(root: string): { sourcesPath: string } {
  copyIntoRoot(root, 'fixtures/fixture-seed.json');
  const rows = readRows('fixtures/media/scenarios/_sources.ndjson');
  const ctr = requiredRow(rows, CENC_CTR_REAUTHOR_SCENARIO_ID);
  const scenarioRoot = join(root, 'fixtures/media/scenarios');
  for (const file of ctr.files) {
    copyIntoRoot(root, join('fixtures/media/scenarios', file.cleartextBase.poolPath));
    copyIntoRoot(root, join('fixtures/media/scenarios', CENC_CTR_REAUTHOR_SCENARIO_ID, file.file));
  }
  const probe = requiredRow(rows, CENC_CTR_REAUTHOR_OUTPUT_SCENARIO_ID);
  // Always exercise the migration transaction, even after production itself has been authored.
  // Reconstruct the valid legacy probe-owned state from the immutable non-fragmented source row in
  // this isolated root; the author must replace only these outputs and their catalog identities.
  probe.note = 'isolated legacy probe-owned state for transactional migration testing';
  for (const file of probe.files) {
    const source = ctr.files.find((candidate) => candidate.file === file.file)!;
    copyIntoRoot(
      root,
      join('fixtures/media/scenarios', CENC_CTR_REAUTHOR_SCENARIO_ID, source.file),
      join('fixtures/media/scenarios', CENC_CTR_REAUTHOR_OUTPUT_SCENARIO_ID, file.file),
    );
    file.sha256 = source.sha256;
    file.sizeBytes = source.sizeBytes;
    file.derivation = source.derivation;
    file.probedWith = source.probedWith;
    file.evidence = { ...file.evidence, sourceSha256: source.sha256 };
  }

  const cbcs = requiredRow(rows, 'encryption/cenc_cbcs_decrypt');
  for (const file of cbcs.files) {
    copyIntoRoot(root, join('fixtures/media/scenarios', cbcs.scenarioId, file.file));
  }

  const sourcesPath = join(scenarioRoot, '_sources.ndjson');
  mkdirSync(dirname(sourcesPath), { recursive: true });
  writeFileSync(sourcesPath, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);
  return { sourcesPath };
}

function nativeToolsAvailable(): boolean {
  return ['mp4fragment', 'mp4extract', 'mp4edit', 'mp4encrypt', 'mp4decrypt',
    process.env.FFPROBE_PATH || 'ffprobe',
    process.env.FFMPEG_PATH || 'ffmpeg'].every((binary) => {
    const result = spawnSync(binary, [], { encoding: 'utf8', maxBuffer: 1 << 20 });
    return result.error?.code !== 'ENOENT';
  });
}

function omitAuthoredFields(
  file: CatalogFile,
): Omit<CatalogFile, keyof Identity | 'derivation' | 'probedWith' | 'evidence'> {
  const {
    sha256: _sha256,
    sizeBytes: _sizeBytes,
    derivation: _derivation,
    probedWith: _probedWith,
    evidence: _evidence,
    ...unchanged
  } = file;
  return unchanged;
}

function expectUntargetedLinesUnchanged(before: string, after: string, target: string): void {
  const beforeLines = scenarioLines(before);
  const afterLines = scenarioLines(after);
  expect(afterLines.size).toBe(beforeLines.size);
  for (const [scenarioId, line] of beforeLines) {
    if (scenarioId !== target) expect(afterLines.get(scenarioId), scenarioId).toBe(line);
  }
}

function addUnrelatedCatalogMarker(text: string): string {
  const lines = text.split(/\r?\n/u);
  const index = lines.findIndex((line) => {
    if (!line.trim()) return false;
    const row = JSON.parse(line) as CatalogRow;
    return row.scenarioId !== CENC_CTR_REAUTHOR_SCENARIO_ID &&
      row.scenarioId !== CENC_CTR_REAUTHOR_OUTPUT_SCENARIO_ID;
  });
  if (index < 0) throw new Error('test catalog has no unrelated row for race injection');
  const row = JSON.parse(lines[index]!) as CatalogRow & { concurrentWriterMarker?: string };
  row.concurrentWriterMarker = 'must-survive-reauthor-commit';
  lines[index] = JSON.stringify(row);
  return lines.join('\n');
}

function replaceAsciiToken(bytes: Uint8Array, token: string, replacement: string): Uint8Array {
  if (token.length !== replacement.length) throw new Error('test box tokens must have equal length');
  const mutated = Buffer.from(bytes);
  const needle = Buffer.from(token, 'ascii');
  const value = Buffer.from(replacement, 'ascii');
  let offset = 0;
  let replacements = 0;
  for (;;) {
    const found = mutated.indexOf(needle, offset);
    if (found < 0) break;
    value.copy(mutated, found);
    replacements++;
    offset = found + value.length;
  }
  if (replacements === 0) throw new Error(`test fixture contains no '${token}' token`);
  return new Uint8Array(mutated);
}

function scenarioLines(text: string): Map<string, string> {
  return new Map(text.trim().split(/\r?\n/u).map((line) => {
    const row = JSON.parse(line) as CatalogRow;
    return [row.scenarioId, line];
  }));
}

function readRows(path: string): CatalogRow[] {
  return readFileSync(path, 'utf8')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as CatalogRow);
}

function requiredRow(rows: CatalogRow[], scenarioId: string): CatalogRow {
  const row = rows.find((candidate) => candidate.scenarioId === scenarioId);
  if (!row) throw new Error(`${scenarioId}: test catalog row missing`);
  return row;
}

function sourceIdentities(root: string): Record<string, Identity> {
  return Object.fromEntries(CENC_CTR_REAUTHOR_FILES.map((file) => [
    file,
    identity(join(root, 'fixtures/media/scenarios', CENC_CTR_REAUTHOR_SCENARIO_ID, file)),
  ]));
}

function outputIdentities(root: string): Record<string, Identity> {
  return Object.fromEntries(CENC_CTR_REAUTHOR_FILES.map((file) => [
    file,
    identity(join(root, 'fixtures/media/scenarios', CENC_CTR_REAUTHOR_OUTPUT_SCENARIO_ID, file)),
  ]));
}

function transactionPath(root: string): string {
  return join(root, 'fixtures/media/scenarios/probe/.cenc_ctr-author-transaction');
}

function copyIntoRoot(root: string, relativePath: string, destinationPath = relativePath): void {
  const destination = join(root, destinationPath);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(relativePath, destination);
}

function identity(path: string): Identity {
  const bytes = readFileSync(path);
  return {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    sizeBytes: statSync(path).size,
  };
}
