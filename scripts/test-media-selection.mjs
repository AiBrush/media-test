#!/usr/bin/env bun
/**
 * scripts/test-media-selection.mjs — Bun unit tests for src/core/media-selection.ts (per-scenario
 * media-file rotation, scenario-media-test-update-instructions §6). Run: `bun scripts/test-media-selection.mjs`.
 *
 * Pure + in-memory (no dev server, no corpus on disk) except one graceful-fallback probe of
 * loadScenarioSources against an unreachable URL. Covers: seeded determinism + that rotation touches
 * BOTH the baked fixture and real files; the §6.3 input-shape gate (drop + warn, never selected);
 * fixture-bound policy and contract-gated robustness variants (plus streaming-output / multi-input /
 * SYNTHETIC / STREAMING / HLS-DERIVED exclusions);
 * §6.4 id/url decoupling; DERIVED-CENC option + oracle surgery; and the checksum / cache-tag helpers.
 *
 * Assertions throw on failure; a clean run prints "ALL <n> ASSERTIONS PASSED".
 */

import {
  loadScenarioSources,
  selectForRun,
  selectionCacheTag,
  computeCorpusChecksum,
  DECRYPT_METAMORPHIC_INVARIANT,
  sha256Hex,
} from '../src/core/media-selection.ts';

let passed = 0;
function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  passed++;
}
function section(name) {
  console.log(`\n# ${name}`);
}
function ok(msg) {
  console.log(`  ok — ${msg}`);
}
const digest = (label) => sha256Hex(label);

/** Map builder from row objects. */
function sourcesOf(...rows) {
  return new Map(rows.map((r) => [r.scenarioId, r]));
}

/** Scan seeds until one yields a selection matching `pred`; returns { seed, sel }. */
function firstSeedWhere(scenarios, sources, scenarioId, pred, opts) {
  for (let i = 0; i < 5000; i++) {
    const seed = `seed-${i}`;
    const sel = selectForRun(scenarios, seed, sources, opts).get(scenarioId);
    if (sel && pred(sel)) return { seed, sel };
  }
  throw new Error(`no seed found matching predicate for ${scenarioId} within 5000 tries`);
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
section('determinism + rotation touches baked AND real');
{
  const scenario = {
    id: 'probe/rot',
    family: 'probe',
    op: 'probe',
    input: 'baked_rot.mp4',
    options: {},
    oracles: ['golden-metadata'],
    metrics: ['wall'],
  };
  const sources = sourcesOf({
    scenarioId: 'probe/rot',
    class: 'REAL',
    requires: { container: 'mp4', video: true, videoCodecs: ['h264'], audioCodecs: ['aac'] },
    files: [
      { file: '01.mp4', container: 'mp4', videoCodecs: ['h264'], audioCodecs: ['aac'], sha256: digest('rot-01'), sizeBytes: 100 },
      { file: '02.mp4', container: 'mp4', videoCodecs: ['h264'], audioCodecs: ['aac'], sha256: digest('rot-02'), sizeBytes: 200 },
    ],
  });

  // determinism: same seed → same pick, twice.
  const a = selectForRun([scenario], 'seedX', sources).get('probe/rot');
  const b = selectForRun([scenario], 'seedX', sources).get('probe/rot');
  assert(a.selectedFile === b.selectedFile, 'same seed yields same selectedFile');
  assert(a.candidateCount === 3, `candidateCount is baked+2 real = 3 (got ${a.candidateCount})`);
  ok(`deterministic; candidateCount=${a.candidateCount}`);

  // distribution over 256 seeds touches baked AND ≥1 real file.
  let baked = 0;
  const realFiles = new Set();
  for (let i = 0; i < 256; i++) {
    const sel = selectForRun([scenario], `seed-${i}`, sources).get('probe/rot');
    if (sel.isBaked) {
      baked++;
      assert(sel.selectedFile === 'baked_rot.mp4', 'baked pick reports the flat baked name');
    } else {
      realFiles.add(sel.selectedFile);
    }
  }
  assert(baked > 0, `baked fixture selected at least once (got ${baked})`);
  assert(realFiles.size >= 1, `≥1 distinct real file selected (got ${realFiles.size}: ${[...realFiles]})`);
  ok(`over 256 seeds: baked=${baked}, real picks=${256 - baked}, distinct real files=${[...realFiles].join(',')}`);
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
section('§6.3 shape gate: wrong-container real file dropped + warned + never selected');
{
  const scenario = {
    id: 'probe/shape',
    family: 'probe',
    op: 'probe',
    input: 'baked_shape.mp4',
    options: {},
    oracles: ['golden-metadata'],
    metrics: ['wall'],
  };
  const sources = sourcesOf({
    scenarioId: 'probe/shape',
    class: 'REAL',
    requires: { container: 'mp4', video: true, videoCodecs: ['h264'], audioCodecs: ['aac'] },
    files: [
      { file: '01.mp4', container: 'mp4', videoCodecs: ['h264'], audioCodecs: ['aac'], sha256: digest('shape-good'), sizeBytes: 50 },
      { file: '02.webm', container: 'webm', videoCodecs: ['vp9'], audioCodecs: ['opus'], sha256: digest('shape-bad'), sizeBytes: 60 },
    ],
  });

  const sel = selectForRun([scenario], 'seedShape', sources).get('probe/shape');
  assert(sel.shapeWarnings.length === 1, `exactly one shape warning (got ${sel.shapeWarnings.length})`);
  assert(sel.shapeWarnings[0].includes('02.webm'), 'warning names the dropped file 02.webm');
  assert(sel.shapeWarnings[0].includes('container'), 'warning explains the container mismatch');
  assert(sel.candidateCount === 2, `candidateCount = baked + 1 shape-passing real (got ${sel.candidateCount})`);
  ok(`warning: ${sel.shapeWarnings[0]}`);

  // 02.webm must never be selected across many seeds.
  const picks = new Set();
  for (let i = 0; i < 300; i++) picks.add(selectForRun([scenario], `s${i}`, sources).get('probe/shape').selectedFile);
  assert(!picks.has('02.webm'), 'dropped 02.webm is never selected');
  assert(picks.has('baked_shape.mp4') && picks.has('01.mp4'), 'both surviving candidates are reachable');
  ok(`reachable picks: ${[...picks].join(', ')}`);
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
section('contract/policy exclusions: undeclared robustness / streaming-output / multi-input / SYNTHETIC / STREAMING / HLS-DERIVED / rotate:false');
{
  // All have REAL/DERIVED-shaped rows with files. Robustness lacks the required same-contract evidence;
  // the remaining cases exercise their explicit fixture-bound policy rule.
  const cases = [
    {
      name: 'robustness family',
      scn: { id: 'robustness/fuzz', family: 'robustness', op: 'probe', input: 'r.mp4', options: {}, oracles: ['graceful-failure'], metrics: ['wall'] },
      row: { scenarioId: 'robustness/fuzz', class: 'REAL', requires: { container: 'mp4', video: true, videoCodecs: ['h264'], audioCodecs: ['aac'] }, files: [{ file: '01.mp4', container: 'mp4', videoCodecs: ['h264'], audioCodecs: ['aac'], sha256: digest('r1'), sizeBytes: 10 }] },
    },
    {
      name: 'streaming-output family',
      scn: { id: 'streaming-output/live', family: 'streaming-output', op: 'remux', input: 's.webm', options: {}, oracles: ['webm-live-layout'], metrics: ['wall'] },
      row: { scenarioId: 'streaming-output/live', class: 'REAL', requires: { container: 'webm', video: true, videoCodecs: ['vp9'], audioCodecs: ['opus'] }, files: [{ file: '01.webm', container: 'webm', videoCodecs: ['vp9'], audioCodecs: ['opus'], sha256: digest('s1'), sizeBytes: 10 }] },
    },
    {
      name: 'SYNTHETIC class (with a file present → class rule, not empty-files rule)',
      scn: { id: 'demux/syn', family: 'demux', op: 'demux', input: 'syn.mp4', options: {}, oracles: ['golden-packets'], metrics: ['wall'] },
      row: { scenarioId: 'demux/syn', class: 'SYNTHETIC', requires: { container: 'mp4', video: true, videoCodecs: ['h264'], audioCodecs: ['aac'] }, files: [{ file: '01.mp4', container: 'mp4', videoCodecs: ['h264'], audioCodecs: ['aac'], sha256: digest('y1'), sizeBytes: 10 }] },
    },
    {
      name: 'STREAMING class (with a file present → class rule)',
      scn: { id: 'demux/str', family: 'demux', op: 'demux', input: 'str.m3u8', options: {}, oracles: ['golden-packets'], metrics: ['wall'] },
      row: { scenarioId: 'demux/str', class: 'STREAMING', requires: { container: 'hls', video: true, videoCodecs: ['h264'], audioCodecs: ['aac'] }, files: [{ file: '01.m3u8', container: 'hls', videoCodecs: ['h264'], audioCodecs: ['aac'], sha256: digest('t1'), sizeBytes: 10 }] },
    },
    {
      name: 'HLS-scheme DERIVED (stays baked in v1)',
      scn: { id: 'encryption/hls_aes128_decrypt', family: 'encryption', op: 'decrypt', input: 'hls_aes128.m3u8', options: { scheme: 'hls-aes128', key: { keyHex: 'base' } }, oracles: ['decrypt-bitexact', 'playback-smoke'], metrics: ['wall'] },
      row: { scenarioId: 'encryption/hls_aes128_decrypt', class: 'DERIVED', requires: { container: 'hls', video: true, videoCodecs: ['h264'], audioCodecs: ['aac'], encryption: ['hls-aes128'] }, files: [{ file: '01.m3u8', container: 'hls', videoCodecs: ['h264'], audioCodecs: ['aac'], sha256: digest('hls1'), sizeBytes: 10, keys: { keyHex: '00', ivHex: '00', scheme: 'hls-aes128' } }] },
    },
  ];

  for (const c of cases) {
    const sources = sourcesOf(c.row);
    let allBaked = true;
    let cc = 0;
    for (let i = 0; i < 128; i++) {
      const sel = selectForRun([c.scn], `p${i}`, sources).get(c.scn.id);
      cc = sel.candidateCount;
      if (!sel.isBaked) { allBaked = false; break; }
    }
    assert(allBaked, `${c.name}: always baked`);
    assert(cc === 1, `${c.name}: candidateCount === 1 (got ${cc})`);
    ok(`${c.name}: candidate rejected by contract/policy, candidateCount=1`);
  }

  // multi-input mux: baked-only + one ResolvedInput per input, ids are the flat names.
  const mux = { id: 'mux/two', family: 'mux', op: 'mux', input: ['a.mp4', 'b.mp4'], options: {}, oracles: ['reference-reimport'], metrics: ['wall'] };
  const muxRow = { scenarioId: 'mux/two', class: 'REAL', requires: { container: 'mp4', video: true, videoCodecs: ['h264'], audioCodecs: ['aac'] }, files: [{ file: '01.mp4', container: 'mp4', videoCodecs: ['h264'], audioCodecs: ['aac'], sha256: digest('m1'), sizeBytes: 10 }] };
  const msel = selectForRun([mux], 'seedMux', sourcesOf(muxRow)).get('mux/two');
  assert(msel.isBaked === true, 'multi-input mux stays baked');
  assert(msel.resolvedInputs.length === 2, 'multi-input yields 2 resolved inputs');
  assert(msel.resolvedInputs[0].id === 'a.mp4' && msel.resolvedInputs[1].id === 'b.mp4', 'resolved ids are the flat names');
  assert(msel.resolvedInputs[0].urlAssetPath === 'scenarios/mux/two/a.mp4', 'multi-input url points into the scenario dir');
  assert(msel.selectedFile === 'a.mp4+b.mp4', `multi-input selectedFile joins names (got ${msel.selectedFile})`);
  ok(`multi-input mux: 2 resolved inputs, ids [${msel.resolvedInputs.map((r) => r.id).join(', ')}]`);

  // rotate:false forces baked even for a rotatable REAL row.
  const rotScn = { id: 'probe/rot', family: 'probe', op: 'probe', input: 'baked_rot.mp4', options: {}, oracles: ['golden-metadata'], metrics: ['wall'] };
  const rotRow = { scenarioId: 'probe/rot', class: 'REAL', requires: { container: 'mp4', video: true, videoCodecs: ['h264'], audioCodecs: ['aac'] }, files: [{ file: '01.mp4', container: 'mp4', videoCodecs: ['h264'], audioCodecs: ['aac'], sha256: digest('z1'), sizeBytes: 10 }] };
  let forcedBaked = true;
  for (let i = 0; i < 64; i++) if (!selectForRun([rotScn], `f${i}`, sourcesOf(rotRow), { rotate: false }).get('probe/rot').isBaked) { forcedBaked = false; break; }
  assert(forcedBaked, 'rotate:false forces baked for every seed');
  ok('rotate:false → always baked');
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
section('§6.4 id/url decoupling: baked id = flat asset id (url into scenario dir); real id = scenarios path');
{
  const scenario = { id: 'probe/rot', family: 'probe', op: 'probe', input: 'baked_rot.mp4', options: {}, oracles: ['golden-metadata'], metrics: ['wall'] };
  const sources = sourcesOf({
    scenarioId: 'probe/rot',
    class: 'REAL',
    requires: { container: 'mp4', video: true, videoCodecs: ['h264'], audioCodecs: ['aac'] },
    files: [{ file: '01.mp4', container: 'mp4', videoCodecs: ['h264'], audioCodecs: ['aac'], sha256: digest('decafbad0001'), sizeBytes: 77 }],
  });

  // baked (forced): id is the FLAT asset id, url points into the scenario dir.
  const bakedSel = selectForRun([scenario], 'anything', sources, { rotate: false }).get('probe/rot');
  const bi = bakedSel.resolvedInputs[0];
  assert(bi.id === 'baked_rot.mp4', `baked ResolvedInput.id is the flat asset id (got ${bi.id})`);
  assert(bi.urlAssetPath === 'scenarios/probe/rot/baked_rot.mp4', `baked url points into the scenario dir (got ${bi.urlAssetPath})`);
  assert(/^[0-9a-f]{64}$/.test(bi.sha256), 'baked resolved input carries a full canonical content identity');
  assert(bi.sizeBytes === 0, 'legacy baked selection is explicitly unverified until a baked manifest supplies its byte size');
  ok(`baked: id='${bi.id}', url='${bi.urlAssetPath}', sha=${bi.sha256}`);

  // real: id starts 'scenarios/', equals url, carries sha+size from the catalog.
  const { sel: realSel } = firstSeedWhere([scenario], sources, 'probe/rot', (s) => !s.isBaked);
  const ri = realSel.resolvedInputs[0];
  assert(ri.id.startsWith('scenarios/'), `real ResolvedInput.id starts 'scenarios/' (got ${ri.id})`);
  assert(ri.id === 'scenarios/probe/rot/01.mp4', `real id is the scenario-dir path (got ${ri.id})`);
  assert(ri.urlAssetPath === ri.id, 'real url === id');
  assert(ri.sha256 === digest('decafbad0001') && ri.sizeBytes === 77, 'real resolved input carries sha256 + sizeBytes');
  assert(realSel.effectiveScenario.input === 'scenarios/probe/rot/01.mp4', 'effectiveScenario.input repointed to the real file');
  ok(`real: id='${ri.id}', sha=${ri.sha256}`);
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
section('DERIVED CENC-MP4 surgery: exact key/base-bound invariant only');
{
  const scenario = {
    id: 'encryption/cenc_ctr_decrypt',
    family: 'encryption',
    op: 'decrypt',
    input: 'cenc_ctr.mp4',
    // Baked options intentionally carry the BAKED key + a cleartextAsset pointer that MUST be severed.
    options: {
      scheme: 'cenc-ctr',
      key: {
        keyHex: '00112233445566778899aabbccddeeff',
        kid: '11223344556677889900aabbccddeeff',
        provenance: {
          schema: 'media-test/encryption-key-provenance@1',
          sourceRecord: '/fixtures/golden/cenc_ctr.mp4.keys.json',
          assetId: 'cenc_ctr.mp4',
          scheme: 'cenc-ctr',
          use: 'authoritative-positive',
          rotationPolicy: 'positive-source-equivalence',
        },
      },
      cleartextAsset: 'cenc_ctr_clear.mp4',
    },
    oracles: ['decrypt-bitexact', 'reference-reimport', 'playback-smoke'],
    metrics: ['wall'],
  };
  const realKeys = { keyHex: 'aa502fb722feb52a53ed0983442d7504', kid: '77e939c815ded81e9289eae62fe82a43', ivHex: '321981242f7d659846fc3270b975d543', scheme: 'cenc-ctr' };
  const derivedSha = digest('derived0001');
  const baseSha = digest('deadbeefcafe');
  const sources = sourcesOf({
    scenarioId: 'encryption/cenc_ctr_decrypt',
    class: 'DERIVED',
    requires: { container: 'mp4', video: true, videoCodecs: ['h264'], audioCodecs: ['aac'], encryption: ['cenc-ctr'] },
    files: [{
      file: '01.mp4', container: 'mp4', videoCodecs: ['h264'], audioCodecs: ['aac'],
      sha256: derivedSha, sizeBytes: 1000, keys: realKeys,
      cleartextBase: { poolPath: '_derived_cleartext/deadbeefcafe.mp4', sha256: baseSha },
      evidence: {
        sourceSha256: derivedSha,
        available: ['METAMORPHIC_PEER'],
        requiredOracles: ['property-invariant'],
        sufficientOracleSets: [['property-invariant']],
        metamorphicSurvivor: {
          oracle: 'property-invariant',
          invariant: DECRYPT_METAMORPHIC_INVARIANT,
          cleartextBaseSha256: baseSha,
        },
      },
    }],
  });

  // --- when the REAL derived file is picked: full surgery ---
  const { sel: realSel } = firstSeedWhere([scenario], sources, 'encryption/cenc_ctr_decrypt', (s) => !s.isBaked);
  const eff = realSel.effectiveScenario;
  assert(eff.options.key.keyHex === realKeys.keyHex, `options.key.keyHex ← real file key (got ${eff.options.key.keyHex})`);
  assert(eff.options.key.kid === realKeys.kid, 'options.key.kid ← real file kid');
  assert(eff.options.key.ivHex === realKeys.ivHex, 'options.key.ivHex ← real file iv');
  assert(eff.options.scheme === 'cenc-ctr', 'options.scheme ← real file scheme');
  assert(eff.options.invariant === DECRYPT_METAMORPHIC_INVARIANT, `options.invariant === '${DECRYPT_METAMORPHIC_INVARIANT}'`);
  assert(eff.options.cleartextBaseAsset === 'scenarios/_derived_cleartext/deadbeefcafe.mp4', `options.cleartextBaseAsset served path (got ${eff.options.cleartextBaseAsset})`);
  assert(eff.options.cleartextAsset === undefined, 'options.cleartextAsset REMOVED (no wrong-golden scoring)');
  assert(eff.options.cleartextAssetId === undefined && eff.options.goldenAsset === undefined, 'other golden-twin pointers removed');
  assert(!eff.oracles.includes('decrypt-bitexact'), "oracles EXCLUDE 'decrypt-bitexact'");
  assert(eff.oracles.length === 1 && eff.oracles[0] === 'property-invariant', "only the source/base-bound property invariant survives");
  assert(eff.input === 'scenarios/encryption/cenc_ctr_decrypt/01.mp4', 'input repointed to real file');
  assert(realSel.selectedSha256 === derivedSha, 'selectedSha256 is the derived file sha');
  // scenario object not mutated in place
  assert(scenario.options.cleartextAsset === 'cenc_ctr_clear.mp4', 'original scenario.options left intact (shallow clone)');
  assert(scenario.oracles.includes('decrypt-bitexact'), 'original scenario.oracles left intact');
  ok(`real derived: re-keyed, invariant='${eff.options.invariant}', oracles=[${eff.oracles.join(', ')}]`);

  // --- when the BAKED twin is picked: options + oracles untouched ---
  const { sel: bakedSel } = firstSeedWhere([scenario], sources, 'encryption/cenc_ctr_decrypt', (s) => s.isBaked);
  const beff = bakedSel.effectiveScenario;
  assert(beff.options.cleartextAsset === 'cenc_ctr_clear.mp4', 'baked keeps cleartextAsset');
  assert(beff.options.key.keyHex === '00112233445566778899aabbccddeeff', 'baked keeps the baked key');
  assert(beff.options.invariant === undefined, 'baked does NOT get the metamorphic invariant injected');
  assert(beff.oracles.includes('decrypt-bitexact'), 'baked keeps decrypt-bitexact');
  assert(beff.input === 'cenc_ctr.mp4', 'baked input unchanged (flat asset id)');
  ok('baked derived twin: options + oracles untouched');
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
section('computeCorpusChecksum (stable + order-independent) & selectionCacheTag (baked vs real)');
{
  const s1 = { scenarioId: 'a/x', selectedFile: '01.mp4', selectedSha256: digest('sha_a'), isBaked: false };
  const s2 = { scenarioId: 'b/y', selectedFile: 'baked.mp4', selectedSha256: undefined, isBaked: true };
  const s3 = { scenarioId: 'c/z', selectedFile: '07.webm', selectedSha256: digest('sha_c'), isBaked: false };

  const chkA = computeCorpusChecksum([s1, s2, s3]);
  const chkB = computeCorpusChecksum([s3, s1, s2]); // reordered
  assert(chkA === chkB, `order-independent checksum (got ${chkA} vs ${chkB})`);
  assert(/^[0-9a-f]+$/.test(chkA), `checksum is lowercase hex (got ${chkA})`);

  const s3b = { ...s3, selectedSha256: digest('sha_c_CHANGED') };
  const chkC = computeCorpusChecksum([s1, s2, s3b]);
  assert(chkC !== chkA, 'changed selection sha ⇒ changed checksum');
  ok(`checksum stable=${chkA}, changed=${chkC}`);

  const bakedTag = selectionCacheTag(s2);
  const full = digest('full-cache-tag');
  assert(/^sha256:[0-9a-f]{64}$/.test(bakedTag), 'baked cache tag is a full canonical SHA-256 identity');
  assert(selectionCacheTag({ scenarioId: 'a/x', isBaked: false, selectedFile: '01.mp4', selectedSha256: full }) === `sha256:${full}`, 'real cache tag keeps the full SHA-256');
  assert(/^sha256:[0-9a-f]{64}$/.test(selectionCacheTag({ scenarioId: 'a/x', isBaked: false, selectedFile: '01.mp4' })), 'unverified legacy identity remains full-width and explicit');
  ok('cache tags: full SHA-256 for baked, real, and legacy identity');
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
section('§6.3 duration gate: trim drops real files too short for the range target');
{
  // trim [0, 7s]: a real file must be ≥ ~7s to contain the range, else it does not fit the scenario.
  const trim = {
    id: 'trim/copy', family: 'trim', op: 'trim',
    input: 'baked_trim.mp4', options: { range: { startUs: 0, endUs: 7_000_000 } },
    oracles: ['trim-boundaries'], metrics: ['wall'],
  };
  const sources = sourcesOf({
    scenarioId: 'trim/copy', class: 'REAL',
    requires: { container: 'mp4', video: true, videoCodecs: ['h264'], audioCodecs: ['aac'] },
    files: [
      { file: '01.mp4', container: 'mp4', videoCodecs: ['h264'], audioCodecs: ['aac'], sha256: digest('short111'), sizeBytes: 100, durationSec: 1.0 },
      { file: '02.mp4', container: 'mp4', videoCodecs: ['h264'], audioCodecs: ['aac'], sha256: digest('longg222'), sizeBytes: 900, durationSec: 10.0 },
    ],
  });
  // The 1.0s file is dropped with a duration warning; the 10.0s file survives.
  const anySel = selectForRun([trim], 'seed-0', sources).get('trim/copy');
  assert(anySel.shapeWarnings.some((w) => w.includes('01.mp4') && /too short/.test(w)), 'too-short 01.mp4 dropped with a duration warning');
  assert(anySel.candidateCount === 2, `candidateCount = baked + 1 long-enough real (got ${anySel.candidateCount})`);
  const picks = new Set();
  for (let i = 0; i < 256; i++) picks.add(selectForRun([trim], `s-${i}`, sources).get('trim/copy').selectedFile);
  assert(!picks.has('01.mp4'), 'the too-short file is NEVER selected');
  assert(picks.has('02.mp4') && picks.has('baked_trim.mp4'), 'baked and the long-enough real file are both reachable');
  ok('trim duration gate drops too-short files, keeps long-enough + baked');
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
section('§8 "seek: Caution" — seek scenarios never rotate (baked-only)');
{
  const seek = {
    id: 'decode-seek/seek_kf', family: 'decode-seek', op: 'seek',
    input: 'baked_seek.mp4', options: { tUs: 5_000_000 },
    oracles: ['seek-accuracy'], metrics: ['wall'],
  };
  const sources = sourcesOf({
    scenarioId: 'decode-seek/seek_kf', class: 'REAL',
    requires: { container: 'mp4', video: true, videoCodecs: ['h264'], audioCodecs: ['aac'] },
    files: [
      { file: '01.mp4', container: 'mp4', videoCodecs: ['h264'], audioCodecs: ['aac'], sha256: digest('seekf111'), sizeBytes: 500, durationSec: 30.0 },
      { file: '02.mp4', container: 'mp4', videoCodecs: ['h264'], audioCodecs: ['aac'], sha256: digest('seekf222'), sizeBytes: 600, durationSec: 30.0 },
    ],
  });
  let allBaked = true;
  for (let i = 0; i < 256; i++) {
    const sel = selectForRun([seek], `sk-${i}`, sources).get('decode-seek/seek_kf');
    if (!sel.isBaked || sel.candidateCount !== 1) allBaked = false;
  }
  assert(allBaked, 'op=seek is baked-only for every seed (candidateCount === 1), despite long-enough real files');
  ok('seek scenarios stay baked (no signal on real + spurious op errors avoided)');
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
section('loadScenarioSources never throws (unreachable URL → empty map)');
{
  const map = await loadScenarioSources('http://127.0.0.1:1/definitely-not-here.ndjson');
  assert(map instanceof Map && map.size === 0, 'unreachable URL yields an empty map, no throw (warn above is expected)');
  ok('graceful baked-only fallback on load failure');
}

console.log(`\nALL ${passed} ASSERTIONS PASSED`);
