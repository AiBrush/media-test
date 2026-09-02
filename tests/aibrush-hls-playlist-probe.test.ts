import { afterEach, describe, expect, it } from 'bun:test';
import {
  hlsPlaylistBaseUrl,
  hlsPlaylistEvidence,
  hlsPlaylistEvidenceFacts,
  hlsVodProbePlan,
  isHlsAsset,
  isPlaylistOnlyProbeRequest,
  playlistOnlyHlsProbeMetadata,
} from '../src/engines/aibrush-media/hls-playlist-probe.ts';
import {
  captureLoadedAibrushWasmArtifacts,
  watchAibrushWasmArtifactLoads,
  type AibrushBundledWasmArtifact,
} from '../src/engines/aibrush-media/provenance.ts';
import type { MediaInput } from '../src/core/engine.ts';

/**
 * All playlists here are synthetic and parameterized by content only — no fixture names, hashes,
 * or scenario identities. The shared helpers mirror what the adapter consumes on the
 * playlist-only probe tier and the once-per-cell WASM provenance capture.
 */

const restored: Array<() => void> = [];
afterEach(() => {
  while (restored.length > 0) restored.shift()!();
});

function patchGlobal(key: string, value: unknown): void {
  const target = globalThis as Record<string, unknown>;
  const had = key in target;
  const previous = target[key];
  target[key] = value;
  restored.push(() => {
    if (had) target[key] = previous;
    else delete target[key];
  });
}

function fakeInput(playlistText: string, url = 'https://cdn.invalid/any/path/index.m3u8'): MediaInput {
  const bytes = new TextEncoder().encode(playlistText);
  return {
    id: 'synthetic.m3u8',
    url,
    mime: 'application/vnd.apple.mpegurl',
    mutated: false,
    calls: 0,
    async arrayBuffer() {
      (this as { calls: number }).calls += 1;
      return bytes.buffer;
    },
  } as unknown as MediaInput;
}

function seededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── 1. unit ───────────────────────────────────────────────────────────────────

describe('hlsVodProbePlan (unit)', () => {
  it('sums EXTINF durations and picks the first media segment', () => {
    const plan = hlsVodProbePlan([
      '#EXTM3U',
      '#EXT-X-TARGETDURATION:6',
      '#EXTINF:4.5,',
      'alpha.ts',
      '#EXTINF:3.25,Title with comma',
      'beta.ts',
      '#EXT-X-ENDLIST',
    ].join('\n'));
    expect(plan).toBeDefined();
    expect(plan!.durationSec).toBeCloseTo(7.75, 9);
    expect(plan!.firstSegmentUri).toBe('alpha.ts');
  });

  it('master playlists (no EXTINF) yield no plan', () => {
    expect(hlsVodProbePlan('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100\nlow/index.m3u8\n')).toBeUndefined();
  });

  it('detects AES-128 keying and computes the base URL', () => {
    const facts = hlsPlaylistEvidenceFacts(
      '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="k.bin"\n#EXTINF:2,\na.ts\n',
      'https://cdn.invalid/hls/index.m3u8',
    );
    expect(facts.aes128Keyed).toBe(true);
    const none = hlsPlaylistEvidenceFacts('#EXTM3U\n#EXT-X-KEY:METHOD=NONE\n#EXTINF:2,\na.ts\n', 'x');
    expect(none.aes128Keyed).toBe(false);
    expect(hlsPlaylistBaseUrl('https://a.example/b/index.m3u8')).toBe('https://a.example/b/index.m3u8');
  });

  it('isHlsAsset recognizes .m3u8/.m3u urls and ids only', () => {
    expect(isHlsAsset({ id: 'a.m3u8', url: 'https://x/a.m3u8' } as MediaInput)).toBe(true);
    expect(isHlsAsset({ id: 'anything', url: 'https://x/a.m3u8?token=1' } as MediaInput)).toBe(true);
    expect(isHlsAsset({ id: 'a.mp4', url: 'https://x/a.mp4' } as MediaInput)).toBe(false);
  });

  it('isPlaylistOnlyProbeRequest reads only the contract schema', () => {
    expect(isPlaylistOnlyProbeRequest(undefined)).toBe(false);
    const wrap = (schema: unknown) => ({
      request: { options: { robustness: { probe: { probeContract: { schema } } } } },
    });
    expect(isPlaylistOnlyProbeRequest(wrap('media-test/hls-playlist-only-probe@1') as never)).toBe(true);
    expect(isPlaylistOnlyProbeRequest(wrap('media-test/hls-protected-segment-probe@1') as never)).toBe(false);
    expect(isPlaylistOnlyProbeRequest({ request: { options: { robustness: 'not-an-object' } } } as never)).toBe(false);
  });
});

// ── 2. property ───────────────────────────────────────────────────────────────

describe('playlist-only probe tier (property)', () => {
  it('plan duration equals the sum of positive EXTINFs for random playlists', () => {
    const rng = seededRng(20260831);
    for (let trial = 0; trial < 60; trial++) {
      const segmentCount = 1 + Math.floor(rng() * 12);
      const durations: number[] = [];
      const lines = ['#EXTM3U'];
      for (let index = 0; index < segmentCount; index++) {
        const duration = Math.round(rng() * 9000) / 1000;
        durations.push(duration);
        lines.push(`#EXTINF:${duration.toFixed(3)},`, `seg-${index}.ts`);
      }
      const plan = hlsVodProbePlan(lines.join('\n'))!;
      expect(plan.durationSec).toBeCloseTo(durations.reduce((a, b) => a + b, 0), 6);
      expect(plan.firstSegmentUri).toBe('seg-0.ts');

      const metadata = playlistOnlyHlsProbeMetadata(
        hlsPlaylistEvidenceFacts(lines.join('\n'), 'https://cdn.invalid/index.m3u8'),
      );
      expect(metadata.durationSec).toBeCloseTo(plan.durationSec, 9);
      expect(metadata.tracks).toEqual([]);
      expect(metadata.probeEvidence!.resourceAccesses!.length).toBe(1);
      expect(metadata.probeEvidence!.resourceAccesses![0].role).toBe('playlist');
    }
  });

  it('evidence is memoized per input object (one arrayBuffer read, same record)', async () => {
    const input = fakeInput('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="k"\n#EXTINF:1,\na.ts\n');
    const first = await hlsPlaylistEvidence(input);
    const second = await hlsPlaylistEvidence(input);
    expect(second).toBe(first);
    expect((input as unknown as { calls: number }).calls).toBe(1);
    // Facts are derived from bytes, not identities: an equivalent playlist in a NEW object re-parses.
    const twin = fakeInput('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="k"\n#EXTINF:1,\na.ts\n');
    const twinRecord = await hlsPlaylistEvidence(twin);
    expect(twinRecord).not.toBe(first);
    expect(twinRecord.plan!.durationSec).toBe(first.plan!.durationSec);
    expect(twinRecord.aes128Keyed).toBe(first.aes128Keyed);
  });

  it('the returned metadata object is freshly built per call (no aliasing between ops)', async () => {
    const input = fakeInput('#EXTM3U\n#EXTINF:2,\na.ts\n');
    const evidence = await hlsPlaylistEvidence(input);
    const a = playlistOnlyHlsProbeMetadata(evidence);
    const b = playlistOnlyHlsProbeMetadata(evidence);
    expect(a).not.toBe(b);
    expect(a.probeEvidence).not.toBe(b.probeEvidence);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

// ── 3. boundary ───────────────────────────────────────────────────────────────

describe('playlist-only probe tier (boundary)', () => {
  it('handles CRLF endings, blank lines, and surrounding whitespace', () => {
    const plan = hlsVodProbePlan('\r\n#EXTM3U\r\n\r\n  #EXTINF: 2.5 ,\r\n  a.ts  \r\n#EXT-X-ENDLIST\r\n');
    expect(plan).toBeDefined();
    expect(plan!.durationSec).toBeCloseTo(2.5, 9);
    expect(plan!.firstSegmentUri).toBe('a.ts');
  });

  it('zero and negative EXTINF values never contribute nor anchor a segment', () => {
    expect(hlsVodProbePlan('#EXTM3U\n#EXTINF:0,\nghost.ts\n')).toBeUndefined();
    const plan = hlsVodProbePlan('#EXTM3U\n#EXTINF:-1,\nghost.ts\n#EXTINF:3,\nreal.ts\n')!;
    expect(plan.firstSegmentUri).toBe('real.ts');
    expect(plan.durationSec).toBeCloseTo(3, 9);
  });

  it('a trailing segment without EXTINF never anchors, and the last line needs no newline', () => {
    const plan = hlsVodProbePlan('#EXTM3U\n#EXTINF:1,\na.ts\nstray.ts');
    expect(plan!.firstSegmentUri).toBe('a.ts');
    expect(plan!.durationSec).toBeCloseTo(1, 9);
  });

  it('duration sums stay exact for single-segment playlists and tolerate many tiny segments', () => {
    const single = hlsVodProbePlan('#EXTM3U\n#EXTINF:0.001,\na.ts\n')!;
    expect(single.durationSec).toBeCloseTo(0.001, 9);
    const many = hlsVodProbePlan('#EXTM3U\n' + Array.from({ length: 500 }, () => '#EXTINF:0.5,\ns.ts\n').join(''));
    expect(many!.durationSec).toBeCloseTo(250, 6);
  });
});

// ── 4. malformed ──────────────────────────────────────────────────────────────

describe('playlist-only probe tier (malformed)', () => {
  it('non-playlist garbage yields no plan and no key claim (falls through to the general probe)', () => {
    const facts = hlsPlaylistEvidenceFacts('\u0000\u0001binary\u0000blob', 'https://cdn.invalid/x.m3u8');
    expect(facts.plan).toBeUndefined();
    expect(facts.aes128Keyed).toBe(false);
  });

  it('unparseable EXTINF tokens are skipped, never NaN-poisoned', () => {
    const plan = hlsVodProbePlan('#EXTM3U\n#EXTINF:abc,\nbad.ts\n#EXTINF:,\nempty.ts\n#EXTINF:2,\ngood.ts\n')!;
    expect(plan.durationSec).toBeCloseTo(2, 9);
    expect(plan.firstSegmentUri).toBe('good.ts');
  });

  it('metadata build rejects a plan-less evidence record loudly', () => {
    expect(() =>
      playlistOnlyHlsProbeMetadata({ playlistText: 'x', baseUrl: 'y', plan: undefined, aes128Keyed: false }),
    ).toThrow();
  });

  it('a failing byte read rejects and leaves no cache entry (retry re-reads)', async () => {
    let fail = true;
    const bytes = new TextEncoder().encode('#EXTM3U\n#EXTINF:4,\na.ts\n');
    const input = {
      id: 'flaky.m3u8',
      url: 'https://cdn.invalid/flaky.m3u8',
      async arrayBuffer() {
        if (fail) throw new Error('network');
        return bytes.buffer;
      },
    } as unknown as MediaInput;
    await expect(hlsPlaylistEvidence(input)).rejects.toThrow('network');
    fail = false;
    const recovered = await hlsPlaylistEvidence(input);
    expect(recovered.plan!.durationSec).toBeCloseTo(4, 9);
  });

  it('an AES-128 claim cannot be spoofed by near-miss method text', () => {
    expect(hlsPlaylistEvidenceFacts('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128X,URI="k"\n#EXTINF:1,\na.ts\n', 'b').aes128Keyed)
      .toBe(false);
    expect(hlsPlaylistEvidenceFacts('#EXTM3U\n#EXT-X-KEY:METHOD=SAMPLE-AES,URI="k"\n#EXTINF:1,\na.ts\n', 'b').aes128Keyed)
      .toBe(false);
  });
});

// ── 5. randomized ─────────────────────────────────────────────────────────────

describe('playlist-only probe tier (randomized)', () => {
  it('fuzzed line soup keeps every structural invariant', () => {
    const rng = seededRng(991);
    for (let trial = 0; trial < 200; trial++) {
      const lines: string[] = [];
      let expectedDuration = 0;
      let expectedFirst: string | undefined;
      let expectKeyed = false;
      const tagCount = Math.floor(rng() * 25);
      for (let index = 0; index < tagCount; index++) {
        const roll = rng();
        if (roll < 0.35) {
          const duration = Math.round(rng() * 5000) / 500;
          lines.push(`#EXTINF:${duration},${rng() < 0.3 ? 'title' : ''}`);
          if (duration > 0 && Number.isFinite(duration)) {
            expectedDuration += duration;
            const pending = true;
            const uri = `f${index}.bin`;
            lines.push(uri);
            if (pending && expectedFirst === undefined) expectedFirst = uri;
          } else {
            lines.push(`f${index}.bin`);
          }
        } else if (roll < 0.5) {
          const method = rng() < 0.4 ? 'AES-128' : rng() < 0.5 ? 'NONE' : 'SAMPLE-AES';
          lines.push(`#EXT-X-KEY:METHOD=${method},URI="k${index}"`);
          if (method === 'AES-128') expectKeyed = true;
        } else if (roll < 0.6) {
          lines.push('');
        } else if (roll < 0.7) {
          lines.push('#CARRIAGE');
        } else {
          lines.push(`noise-${index}`);
        }
      }
      const text = lines.join('\n');
      const facts = hlsPlaylistEvidenceFacts(text, 'https://cdn.invalid/p.m3u8');
      if (expectedFirst === undefined || expectedDuration === 0) {
        expect(facts.plan).toBeUndefined();
      } else {
        expect(facts.plan!.durationSec).toBeCloseTo(expectedDuration, 6);
        expect(facts.plan!.firstSegmentUri).toBe(expectedFirst);
      }
      expect(facts.aes128Keyed).toBe(expectKeyed);
    }
  });
});

// ── 6. wasm provenance watch + capture ───────────────────────────────────────

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as unknown as ArrayBuffer));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

describe('wasm load watch (provenance)', () => {
  it('degrades to the legacy scan-until-captured contract without PerformanceObserver', () => {
    patchGlobal('PerformanceObserver', undefined);
    const watch = watchAibrushWasmArtifactLoads([{ path: 'dist/any.wasm', sha256: '0'.repeat(64) }]);
    expect(watch.observerBacked).toBe(false);
    expect(watch.observedUrls()).toBeUndefined();
    expect(watch.captureNow()).toBe(true);
  });

  it('stays quiet until a manifest-matching resource completes, then latches', async () => {
    type Entry = { name: string };
    type Callback = (list: { getEntries(): Entry[] }) => void;
    let disconnected = 0;
    class FakeObserver {
      static instances: FakeObserver[] = [];
      private readonly callback: Callback;
      constructor(callback: Callback) {
        this.callback = callback;
        FakeObserver.instances.push(this);
      }
      observe(options: unknown): void {
        (this as { options?: unknown }).options = options;
      }
      disconnect(): void {
        disconnected += 1;
      }
      emit(...names: string[]): void {
        this.callback({ getEntries: () => names.map((name) => ({ name })) });
      }
    }
    patchGlobal('PerformanceObserver', FakeObserver);
    const bundled: AibrushBundledWasmArtifact[] = [{ path: 'dist/dav1d.wasm', sha256: '0'.repeat(64) }];
    const watch = watchAibrushWasmArtifactLoads(bundled);
    expect(watch.observerBacked).toBe(true);
    expect(watch.captureNow()).toBe(false);
    FakeObserver.instances[0].emit('https://x/assets/stylesheet.css', 'https://x/fixtures/media/clip.mp4');
    expect(watch.captureNow()).toBe(false);
    FakeObserver.instances[0].emit('https://x/dist/dav1d-hash42.wasm');
    expect(watch.captureNow()).toBe(true);
    expect(watch.observedUrls()).toEqual(['https://x/dist/dav1d-hash42.wasm']);
    expect(disconnected).toBe(1); // latched: auto-disconnected on first match
    FakeObserver.instances[0].emit('https://x/dist/dav1d-hash99.wasm');
    expect(disconnected).toBe(1); // teardown happened once; late deliveries are inert
    expect(watch.observedUrls()).toEqual(['https://x/dist/dav1d-hash42.wasm']);
    watch.stop();
    expect(watch.captureNow()).toBe(true); // urls already observed — capture decision stays pending
  });

  it('stop() tears the observer down even before any match', () => {
    class NoopObserver {
      static instances: NoopObserver[] = [];
      disconnected = 0;
      constructor(_callback: unknown) {
        NoopObserver.instances.push(this);
      }
      observe(_options: unknown): void {}
      disconnect(): void {
        this.disconnected += 1;
      }
    }
    patchGlobal('PerformanceObserver', NoopObserver);
    const watch = watchAibrushWasmArtifactLoads([{ path: 'dist/never.wasm', sha256: '0'.repeat(64) }]);
    watch.stop();
    expect(NoopObserver.instances[0].disconnected).toBe(1);
    expect(watch.captureNow()).toBe(false); // observer-backed, nothing matched — never rescan
  });

  it('observe() throwing (unsupported buffered mode) falls back to legacy scanning', () => {
    class ThrowingObserver {
      constructor(_callback: unknown) {}
      observe(_options: unknown): void {
        throw new Error('buffered unsupported');
      }
      disconnect(): void {}
    }
    patchGlobal('PerformanceObserver', ThrowingObserver);
    const watch = watchAibrushWasmArtifactLoads([{ path: 'dist/any.wasm', sha256: '0'.repeat(64) }]);
    expect(watch.observerBacked).toBe(false);
    expect(watch.captureNow()).toBe(true);
    expect(watch.observedUrls()).toBeUndefined();
  });
});

describe('captureLoadedAibrushWasmArtifacts (provenance)', () => {
  it('hashes exactly the observed URLs against the manifest', async () => {
    const payload = new TextEncoder().encode('fake-wasm-bytes-0001');
    const digest = await sha256Hex(payload);
    const bundled: AibrushBundledWasmArtifact[] = [{ path: 'dist/codec.wasm', sha256: digest }];
    let fetched: string[] = [];
    patchGlobal('fetch', async (url: string) => {
      fetched.push(url);
      return { ok: true, arrayBuffer: async () => payload.buffer };
    });
    const observations = await captureLoadedAibrushWasmArtifacts(bundled, undefined, [
      'https://x/dist/codec-build7.wasm',
    ]);
    expect(observations.length).toBe(1);
    expect(observations[0].sha256).toBe(digest);
    expect(fetched).toEqual(['https://x/dist/codec-build7.wasm']);
  });

  it('malformed fetch failures surface as an honest provenance error', async () => {
    const bundled: AibrushBundledWasmArtifact[] = [{ path: 'dist/codec.wasm', sha256: '0'.repeat(64) }];
    patchGlobal('fetch', async () => ({ ok: false, status: 500 }));
    await expect(
      captureLoadedAibrushWasmArtifacts(bundled, undefined, ['https://x/dist/codec-9.wasm']),
    ).rejects.toThrow('AIBRUSH_WASM_RUNTIME_DIGEST_UNAVAILABLE');
  });

  it('randomized: multi-artifact manifests bind only their own digests and stay unique', async () => {
    const rng = seededRng(7);
    const payloads = Array.from({ length: 3 }, (_unused, index) => {
      const bytes = new Uint8Array(64 + Math.floor(rng() * 64));
      for (let at = 0; at < bytes.length; at++) bytes[at] = Math.floor(rng() * 256);
      return { name: `core${index}.wasm`, bytes };
    });
    const digests = await Promise.all(payloads.map((entry) => sha256Hex(entry.bytes)));
    const bundled: AibrushBundledWasmArtifact[] = payloads.map((entry, index) => ({
      path: `dist/${entry.name}`,
      sha256: digests[index],
    }));
    patchGlobal('fetch', async (url: string) => {
      const match = url.includes('-missing')
        ? undefined
        : payloads.find(
          (entry) => url.includes(entry.name) || url.includes(`${entry.name.slice(0, -'.wasm'.length)}-`),
        );
      if (match === undefined) return { ok: false, status: 404 };
      return { ok: true, arrayBuffer: async () => match.bytes.buffer };
    });
    const clean = await captureLoadedAibrushWasmArtifacts(bundled, undefined, [
      'https://x/dist/core1-build7.wasm',
      'https://x/dist/core0.wasm',
      'https://x/dist/core2.wasm',
    ]);
    expect(clean.length).toBe(3);
    expect(new Set(clean.map((entry) => entry.resource)).size).toBe(3);
    expect(new Set(clean.map((entry) => entry.sha256)).size).toBe(3);
    for (let index = 0; index < 3; index++) {
      const entry = clean.find((observation) => observation.resource.includes(`core${index}`))!;
      expect(entry.sha256).toBe(digests[index]);
    }
    // A manifest-matching URL with no resolvable bytes is an honest error, never a silent drop.
    await expect(
      captureLoadedAibrushWasmArtifacts(bundled, undefined, ['https://x/dist/core0-missing.wasm']),
    ).rejects.toThrow('AIBRUSH_WASM_RUNTIME_DIGEST_UNAVAILABLE');
  });

  it('without fetch or subtle crypto the capture honestly reports nothing', async () => {
    const bundled: AibrushBundledWasmArtifact[] = [{ path: 'dist/x.wasm', sha256: '0'.repeat(64) }];
    patchGlobal('fetch', undefined);
    expect(await captureLoadedAibrushWasmArtifacts(bundled, undefined, ['https://x/dist/x.wasm'])).toEqual([]);
  });
});
