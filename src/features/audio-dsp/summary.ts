import type { Scenario } from '../../core/scenario.ts';
import type { AudioFixtureManifestRecord, AudioScenarioSummary } from './types.ts';

export function deriveAudioScenarioSummary(
  scenario: Pick<Scenario, 'id' | 'op' | 'input' | 'options' | 'oracles'>,
  manifest: readonly AudioFixtureManifestRecord[],
  extraMissingEvidence: readonly string[] = [],
): AudioScenarioSummary {
  const byId = new Map(manifest.map((entry) => [entry.id, entry]));
  const inputIds = Array.isArray(scenario.input) ? scenario.input : [scenario.input];
  const assets = inputIds.map((id) => {
    const entry = byId.get(id);
    const available = Boolean(entry && typeof entry.sha256 === 'string' && entry.sha256.length === 64 &&
      typeof entry.sizeBytes === 'number' && entry.sizeBytes >= 0);
    return {
      id,
      declared: entry != null,
      available,
      ...(typeof entry?.sha256 === 'string' ? { sha256: entry.sha256 } : {}),
      ...(typeof entry?.sizeBytes === 'number' ? { sizeBytes: entry.sizeBytes } : {}),
      ...(entry?.container ? { container: entry.container } : {}),
      ...(entry?.codecs ? { codecs: [...entry.codecs] } : {}),
    };
  });
  const missingEvidence = [
    ...assets.filter((asset) => !asset.declared).map((asset) => `manifest:${asset.id}`),
    ...assets.filter((asset) => asset.declared && !asset.available).map((asset) => `content-identity:${asset.id}`),
    ...extraMissingEvidence,
  ].sort();
  const requestedTransform = describeTransform(scenario.options as Record<string, unknown> | undefined);
  const activeOracles = [...scenario.oracles];
  const assetText = assets.map((asset) => `${asset.id} (${asset.available ? 'available' : asset.declared ? 'identity missing' : 'not declared'})`).join(', ');
  const text = [
    `${scenario.id}: ${scenario.op}`,
    `asset${assets.length === 1 ? '' : 's'} ${assetText}`,
    `transform ${requestedTransform}`,
    `oracle${activeOracles.length === 1 ? '' : 's'} ${activeOracles.join(', ')}`,
    `missing evidence ${missingEvidence.length ? missingEvidence.join(', ') : 'none'}`,
  ].join('; ');
  return { scenarioId: scenario.id, operation: scenario.op, assets, requestedTransform, activeOracles, missingEvidence, text };
}

function describeTransform(options: Record<string, unknown> | undefined): string {
  if (!options) return 'none';
  const audio = isRecord(options.audio) ? options.audio : undefined;
  const parts: string[] = [];
  if (typeof options.container === 'string') parts.push(`container=${options.container}`);
  if (audio) {
    if (typeof audio.codec === 'string') parts.push(`codec=${audio.codec}`);
    if (typeof audio.sampleRate === 'number') parts.push(`rate=${audio.sampleRate}Hz`);
    if (typeof audio.channels === 'number') parts.push(`channels=${audio.channels}`);
    if (typeof audio.gainLinear === 'number') parts.push(`gain=${audio.gainLinear}x`);
    else if (typeof audio.gainDb === 'number') parts.push(`gain=${audio.gainDb}dB`);
    if (isRecord(audio.fade)) {
      const fade = audio.fade;
      parts.push(`fade=${String(fade.curve ?? 'unspecified')} in:${String(fade.inSec ?? '?')}s out:${String(fade.outSec ?? '?')}s`);
    }
    if (typeof audio.roundtrip === 'string') parts.push(`roundtrip-via=${audio.roundtrip}`);
  }
  if (typeof options.startUs === 'number' || typeof options.endUs === 'number') {
    parts.push(`range=${String(options.startUs ?? '?')}..${String(options.endUs ?? '?')}us`);
  }
  return parts.length ? parts.join(', ') : 'none';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}
