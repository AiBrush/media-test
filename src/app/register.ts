/**
 * src/app/register.ts — wire every engine adapter + scenario family into the registry (registry.ts).
 *
 * Each engine adapter exports a `register*()` that calls `registerEngine(id, factory, …)`; each
 * scenario family exports a `Scenario[]`. We register them all here so the app (and, transitively,
 * the runner) sees the full matrix. Heavy libraries are dynamically imported inside each engine's
 * `init()`, so importing the thin `register*()` functions up front stays cheap.
 *
 * DEFENSIVE BY DESIGN: adapters / scenario families are authored by parallel agents and may be
 * absent, half-finished, or throw at registration. A single broken module must never blank the whole
 * suite — every registration is wrapped, and what failed is reported back to the UI rather than
 * thrown. This is the one place that knows the concrete module paths; the rest of the app is generic.
 */

import { listEngines, listScenarios, registerEngine, registerScenarios } from '../core/registry.ts';
import type { Scenario } from '../core/scenario.ts';

export interface RegistrationReport {
  engines: { id: string; ok: boolean; reason?: string }[];
  scenarioFamilies: { family: string; count: number; ok: boolean; reason?: string }[];
  /** total distinct engines / scenarios actually in the registry after wiring. */
  engineCount: number;
  scenarioCount: number;
}

/** An engine module to load: a label + a lazy import that resolves its `register*()` and calls it. */
interface EngineWiring {
  label: string;
  register: () => Promise<void>;
}

/**
 * Engine wirings. Dynamic imports keep a single broken adapter from breaking module evaluation of
 * the others (a static `import { x } from` would fail the whole bundle if `x` is missing). Every
 * engine here is a plain scored candidate; mediabunny is wired via its own register helper.
 */
const ENGINE_WIRINGS: EngineWiring[] = [
  {
    label: 'mediabunny',
    register: async () => {
      const mod = await import('../engines/mediabunny/register.ts');
      mod.registerMediabunny();
    },
  },
  {
    label: 'platform',
    register: async () => {
      const mod = await import('../engines/platform/adapter.ts');
      mod.registerPlatform();
    },
  },
  {
    label: 'ffmpeg.wasm',
    register: async () => {
      // ffmpeg-wasm exposes its register helper from register.ts (not adapter.ts).
      const mod = await import('../engines/ffmpeg-wasm/register.ts');
      mod.registerFfmpegWasm();
    },
  },
  {
    label: 'mp4box',
    register: async () => {
      const mod = await import('../engines/mp4box/adapter.ts');
      mod.registerMp4box();
    },
  },
  {
    label: 'remotion-media-parser',
    register: async () => {
      const mod = await import('../engines/remotion-media-parser/adapter.ts');
      mod.registerRemotionMediaParser();
    },
  },
  {
    label: 'web-demuxer',
    register: async () => {
      const mod = await import('../engines/web-demuxer/adapter.ts');
      mod.registerWebDemuxer();
    },
  },
  {
    label: 'remotion-webcodecs',
    register: async () => {
      // No register helper exported — wire the engine class directly via a fresh-per-iteration factory.
      const mod = await import('../engines/remotion-webcodecs/adapter.ts');
      registerEngine(new mod.RemotionWebcodecsEngine().id, () => new mod.RemotionWebcodecsEngine());
    },
  },
  {
    label: 'aibrush-media',
    register: async () => {
      // Placeholder candidate adapter — may not exist yet; tolerate its absence.
      const mod = (await import('../engines/aibrush-media/adapter.ts')) as {
        registerAibrushMedia?: () => void;
      };
      if (typeof mod.registerAibrushMedia === 'function') mod.registerAibrushMedia();
      else throw new Error('adapter present but exports no registerAibrushMedia()');
    },
  },
];

/** Scenario family modules: label + lazy import resolving the family's `Scenario[]` export. */
interface ScenarioWiring {
  family: string;
  load: () => Promise<Scenario[]>;
}

const SCENARIO_WIRINGS: ScenarioWiring[] = [
  { family: 'probe', load: async () => (await import('../scenarios/probe/index.ts')).probeScenarios },
  { family: 'demux', load: async () => (await import('../scenarios/demux/index.ts')).demuxScenarios },
  { family: 'remux', load: async () => (await import('../scenarios/remux/index.ts')).remuxScenarios },
  {
    family: 'transcode',
    load: async () => (await import('../scenarios/transcode/index.ts')).transcodeScenarios,
  },
  {
    family: 'decode-seek',
    load: async () => (await import('../scenarios/decode-seek/index.ts')).decodeSeekScenarios,
  },
  { family: 'trim', load: async () => (await import('../scenarios/trim/index.ts')).trimScenarios },
  { family: 'mux', load: async () => (await import('../scenarios/mux/index.ts')).muxScenarios },
  {
    family: 'encryption',
    load: async () => (await import('../scenarios/encryption/index.ts')).encryptionScenarios,
  },
  {
    family: 'metadata',
    load: async () => (await import('../scenarios/metadata/index.ts')).metadataScenarios,
  },
  {
    family: 'streaming-output',
    load: async () =>
      (await import('../scenarios/streaming-output/index.ts')).streamingOutputScenarios,
  },
  {
    family: 'audio-dsp',
    load: async () => (await import('../scenarios/audio-dsp/index.ts')).audioDspScenarios,
  },
  {
    family: 'performance',
    load: async () => (await import('../scenarios/performance/index.ts')).performanceScenarios,
  },
  {
    // Robustness family is appended last; its index export name is tolerated flexibly below.
    family: 'robustness',
    load: async () => {
      const mod = (await import('../scenarios/robustness/index.ts')) as Record<string, unknown>;
      const arr =
        (mod.robustnessScenarios as Scenario[] | undefined) ??
        (mod.default as Scenario[] | undefined);
      if (!Array.isArray(arr)) throw new Error('robustness/index.ts exports no robustnessScenarios[]');
      return arr;
    },
  },
];

/**
 * Register every engine and scenario family, tolerating individual failures. Idempotent-ish: the
 * registry throws on duplicate ids, so we guard so a re-entry (HMR / double init) does not abort.
 * Returns a report the UI surfaces so missing/broken modules are visible, not silently dropped.
 */
export async function registerAll(): Promise<RegistrationReport> {
  const engines: RegistrationReport['engines'] = [];
  for (const w of ENGINE_WIRINGS) {
    try {
      await w.register();
      engines.push({ id: w.label, ok: true });
    } catch (err) {
      engines.push({ id: w.label, ok: false, reason: errText(err) });
    }
  }

  const scenarioFamilies: RegistrationReport['scenarioFamilies'] = [];
  for (const w of SCENARIO_WIRINGS) {
    try {
      const list = await w.load();
      registerScenarios(list);
      scenarioFamilies.push({ family: w.family, count: list.length, ok: true });
    } catch (err) {
      scenarioFamilies.push({ family: w.family, count: 0, ok: false, reason: errText(err) });
    }
  }

  return {
    engines,
    scenarioFamilies,
    engineCount: listEngines().length,
    scenarioCount: listScenarios().length,
  };
}

function errText(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return String(err);
  } catch {
    return 'unknown error';
  }
}
