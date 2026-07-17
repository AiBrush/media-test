import { describe, expect, test } from 'bun:test';

import {
  buildScenarioPickerItems,
  loadScenarioDisplayManifest,
} from '../src/app/scenario-display.ts';
import audioDspScenarios from '../src/scenarios/audio-dsp/index.ts';

describe('REQ-FEAT-67 production manifest-derived scenario display', () => {
  test('the real picker titles state actual operation, asset, transform, oracle, and evidence', async () => {
    const manifestJson = await Bun.file('fixtures/manifest.json').json();
    const manifest = await loadScenarioDisplayManifest(async () => Response.json(manifestJson));
    const items = buildScenarioPickerItems(audioDspScenarios, manifest);

    const caf = items.find((item) => item.id === 'audio-dsp/caf_container_probe')!;
    expect(caf.title).toContain('audio-dsp/caf_container_probe: probe');
    expect(caf.title).toContain('pcm_s16.caf (available)');
    expect(caf.title).toContain('oracle golden-metadata');
    expect(caf.title).toContain('missing evidence none');
    expect(caf.title).not.toContain('until baked');

    const gapless = items.find((item) => item.id === 'audio-dsp/edge_gapless_aac_decode')!;
    expect(gapless.title).toContain('audio-dsp/edge_gapless_aac_decode: trim');
    expect(gapless.title).toContain('gapless_aac.m4a (available)');
    expect(gapless.title).toContain('range=0..1012993us');
    expect(gapless.title).toContain('property-invariant');
  });

  test('manifest load failures remain explicit instead of reviving free-text claims', async () => {
    const manifest = await loadScenarioDisplayManifest(async () => new Response(null, { status: 503 }));
    const caf = buildScenarioPickerItems(audioDspScenarios, manifest)
      .find((item) => item.id === 'audio-dsp/caf_container_probe')!;
    expect(caf.title).toContain('pcm_s16.caf (not declared)');
    expect(caf.title).toContain('manifest:http-503');
    expect(caf.title).not.toContain('until baked');
  });
});
