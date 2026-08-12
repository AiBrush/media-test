import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'bun:test';

import {
  CENS_DECRYPT_REAUTHOR_FILES,
  buildCensDecryptReauthorCommands,
} from '../fixtures/reauthor-cens-decrypt-candidates.mjs';

describe('deterministic CENS decrypt candidate authoring', () => {
  test('all candidates use strict CENS and six distinct seed-derived track IV domains', () => {
    const seedHex = JSON.parse(readFileSync('fixtures/fixture-seed.json', 'utf8')).seedHex as string;
    const ivs: string[] = [];
    for (const file of CENS_DECRYPT_REAUTHOR_FILES) {
      const options = {
        file,
        keyHex: '00112233445566778899aabbccddeeff',
        kidHex: '11223344556677889900aabbccddeeff',
        seedHex,
        cleartextPath: `${file}.clear.mp4`,
        fragmentedPath: `${file}.fragmented.mp4`,
        videoEditsPath: `${file}.video-edts.atom`,
        audioEditsPath: `${file}.audio-edts.atom`,
        editedFragmentedPath: `${file}.fragmented-edits.mp4`,
        outputPath: `${file}.output.mp4`,
      };
      const first = buildCensDecryptReauthorCommands(options);
      const second = buildCensDecryptReauthorCommands(options);
      expect(second).toEqual(first);
      expect(first.encryptArgs.slice(0, 3)).toEqual(['--method', 'MPEG-CENS', '--strict']);
      expect(first.ivHexByTrack[1]).toMatch(/^[0-9a-f]{16}$/);
      expect(first.ivHexByTrack[2]).toMatch(/^[0-9a-f]{16}$/);
      expect(first.ivHexByTrack[1]).not.toBe(first.ivHexByTrack[2]);
      ivs.push(first.ivHexByTrack[1], first.ivHexByTrack[2]);
    }
    expect(new Set(ivs).size).toBe(6);
  });
});
