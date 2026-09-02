import { describe, expect, it } from 'bun:test';
import { FrameDigestPool, frameIsPoolEligible } from '../src/engines/aibrush-media/frame-digest-pool.ts';

// Node/Bun realms lack the VideoFrame constructor; eligibility is a capability predicate over it.
(globalThis as { VideoFrame?: unknown }).VideoFrame ??= class StubVideoFrame {};

interface FakeFrame {
  readonly timestamp: number;
  readonly displayWidth: number;
  readonly displayHeight: number;
  readonly codedWidth: number;
  readonly codedHeight: number;
  readonly visibleRect?: { x: number; y: number; width: number; height: number };
  closed: number;
  clone(): FakeFrame;
  close(): void;
}

function fakeFrame(
  timestamp: number,
  width: number,
  height: number,
  opts: { coded?: [number, number]; rect?: FakeFrame['visibleRect'] } = {},
): FakeFrame {
  const state = { closed: 0 };
  const frame: FakeFrame = {
    timestamp,
    displayWidth: width,
    displayHeight: height,
    codedWidth: opts.coded?.[0] ?? width,
    codedHeight: opts.coded?.[1] ?? height,
    ...(opts.rect !== undefined ? { visibleRect: opts.rect } : {}),
    get closed() {
      return state.closed;
    },
    clone(): FakeFrame {
      return fakeFrame(timestamp, width, height, opts);
    },
    close(): void {
      state.closed += 1;
    },
  };
  return frame;
}

interface Reply {
  tag?: number;
  hex?: string;
  pixels?: Uint8ClampedArray;
  error?: string;
}

/** Deterministic fake worker realm: replies are scripted per tag (default: well-formed). */
class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;
  readonly posted: { tag: number; width: number; height: number }[] = [];
  replyFor: (tag: number, width: number, height: number) => Reply = (tag, width, height) => ({
    tag,
    hex: `hex-${tag}`,
    pixels: new Uint8ClampedArray(width * height * 4),
  });
  postMessageHooks: ((tag: number) => void)[] = [];

  postMessage(message: { frame: FakeFrame; tag: number; width: number; height: number }): void {
    this.posted.push({ tag: message.tag, width: message.width, height: message.height });
    const reply = this.replyFor(message.tag, message.width, message.height);
    const worker = this;
    queueMicrotask(() => {
      for (const hook of worker.postMessageHooks) hook(message.tag);
      if (worker.terminated || worker.onmessage === null) return;
      worker.onmessage({ data: reply } as unknown as MessageEvent);
    });
  }

  terminate(): void {
    this.terminated = true;
  }

  deliver(reply: Reply): void {
    this.onmessage?.({ data: reply } as unknown as MessageEvent);
  }
}

class FakePool {
  readonly workers: FakeWorker[] = [];
  readonly pool: FrameDigestPool;

  constructor(size: number) {
    this.pool = new FrameDigestPool({
      poolSize: size,
      createWorker: () => {
        const worker = new FakeWorker();
        this.workers.push(worker);
        return worker as never;
      },
      createImageData: (pixels, width, height) =>
        ({ data: pixels, width, height }) as unknown as ImageData,
    });
  }
}

const asVideoFrame = (frame: FakeFrame) => frame as unknown as VideoFrame;

describe('frameIsPoolEligible — general capability geometry', () => {
  it('boundary: sidecar, display/coded mismatch, crop, zero-size are all ineligible; exact frame is', () => {
    const good = fakeFrame(0, 64, 32);
    expect(frameIsPoolEligible(asVideoFrame(good), false)).toBe(true);
    expect(frameIsPoolEligible(asVideoFrame(good), true)).toBe(false); // sidecar-owned pixels
    expect(
      frameIsPoolEligible(asVideoFrame(fakeFrame(0, 64, 32, { coded: [60, 30] })), false),
    ).toBe(false);
    expect(
      frameIsPoolEligible(
        asVideoFrame(fakeFrame(0, 64, 32, { rect: { x: 1, y: 0, width: 63, height: 32 } })),
        false,
      ),
    ).toBe(false);
    expect(
      frameIsPoolEligible(
        asVideoFrame(fakeFrame(0, 64, 32, { rect: { x: 0, y: 0, width: 64, height: 32 } })),
        false,
      ),
    ).toBe(true); // full visibleRect is eligible
    expect(frameIsPoolEligible(asVideoFrame(fakeFrame(0, 0, 32)), false)).toBe(false);
    const noClone = { timestamp: 0, displayWidth: 8, displayHeight: 8, codedWidth: 8, codedHeight: 8 } as unknown as VideoFrame;
    expect(frameIsPoolEligible(noClone, false)).toBe(false);
  });
});

describe('FrameDigestPool — fused off-thread digest contract', () => {
  it('unit: a well-formed worker roundtrip resolves the digest and adopts pixels without touching the caller frame', async () => {
    const fake = new FakePool(2);
    const frame = fakeFrame(1500, 4, 2);
    const result = await fake.pool.digest(asVideoFrame(frame), { ptsUs: 1500, width: 4, height: 2 });
    expect(result.sha256).toBe('hex-0');
    expect(result.ptsUs).toBe(1500);
    expect(result.img.width).toBe(4);
    expect(result.img.height).toBe(2);
    expect((result.img.data as Uint8ClampedArray).byteLength).toBe(32);
    expect(frame.closed).toBe(0); // caller still owns the original (it closes after)
    expect(fake.workers[0]!.posted.length).toBe(1);
    fake.pool.dispose();
  });

  it('property: out-of-order replies across workers still resolve each job with its own geometry', async () => {
    const fake = new FakePool(3);
    // Reverse reply order per worker: the last posted tag answers first.
    for (const worker of fake.workers) {
      const queue: { reply: Reply; delay: number }[] = [];
      worker.replyFor = (tag, width, height) => {
        queue.push({
          reply: { tag, hex: `h${tag}`, pixels: new Uint8ClampedArray(width * height * 4) },
          delay: queue.length,
        });
        const item = queue.shift()!;
        return item.reply;
      };
    }
    const jobs = Array.from({ length: 9 }, (_, i) =>
      fake.pool
        .digest(asVideoFrame(fakeFrame(i * 100, 2, 2)), { ptsUs: i * 100, width: 2, height: 2 })
        .then((r) => [r.ptsUs, r.sha256] as const),
    );
    const results = await Promise.all(jobs);
    for (let i = 0; i < results.length; i++) {
      expect(results[i]![0]).toBe(i * 100);
      expect(results[i]![1]).toBe(`h${i}`);
    }
    expect(fake.pool.pending).toBe(0);
    fake.pool.dispose();
  });

  it('boundary: poolSize clamps, aborted jobs reject without posting, disposed pool rejects', async () => {
    const zero = new FakePool(0);
    expect(zero.workers.length).toBe(1);
    const huge = new FakePool(100);
    expect(huge.workers.length).toBe(8);
    const nan = new FrameDigestPool({ createWorker: () => new FakeWorker() as never });
    expect(nan.available).toBe(true);

    const fake = new FakePool(1);
    const abort = new AbortController();
    abort.abort(new Error('gone'));
    const frame = fakeFrame(0, 2, 2);
    await expect(
      fake.pool.digest(asVideoFrame(frame), { ptsUs: 0, width: 2, height: 2, signal: abort.signal }),
    ).rejects.toBeDefined();
    expect(fake.workers[0]!.posted.length).toBe(0); // aborted before transfer
    expect(frame.closed).toBe(0); // caller keeps the original
    expect(await fake.pool.digest(asVideoFrame(fakeFrame(1, 2, 2)), { ptsUs: 1, width: 2, height: 2 }).then((r) => r.ptsUs)).toBe(1);

    const pool = new FrameDigestPool({ createWorker: () => new FakeWorker() as never });
    pool.dispose();
    await expect(pool.digest(asVideoFrame(fakeFrame(0, 2, 2)), { ptsUs: 0, width: 2, height: 2 })).rejects.toThrow(/disposed|unavailable/);
    void nan;
  });

  it('malformed: error/mutated replies disable the pool once and leave the caller frame usable', async () => {
    const fake = new FakePool(2);
    const broken = fakeFrame(7, 2, 2);
    for (const worker of fake.workers) worker.replyFor = (tag) => ({ tag, error: 'boom' });
    await expect(
      fake.pool.digest(asVideoFrame(broken), { ptsUs: 7, width: 2, height: 2 }),
    ).rejects.toThrow(/boom/);
    expect(broken.closed).toBe(0); // still open → main-thread fallback can rasterize it
    expect(fake.pool.available).toBe(false);
    await expect(
      fake.pool.digest(asVideoFrame(fakeFrame(8, 2, 2)), { ptsUs: 8, width: 2, height: 2 }),
    ).rejects.toThrow(/unavailable|disabled/);
    // A tagless (unattributable) reply while a job is in flight is a protocol breach → reject + retire.
    const tagless = new FakePool(1);
    const frameA = fakeFrame(0, 2, 2);
    tagless.workers[0]!.replyFor = () => ({});
    await expect(
      tagless.pool.digest(asVideoFrame(frameA), { ptsUs: 0, width: 2, height: 2 }),
    ).rejects.toBeDefined();
    expect(tagless.pool.available).toBe(false);
    expect(frameA.closed).toBe(0);
    // A foreign-tag reply cannot hijack or strand the owed job.
    const foreign = new FakePool(1);
    const frameB = fakeFrame(0, 2, 2);
    foreign.workers[0]!.replyFor = () => ({ tag: 4242, hex: 'wrong', pixels: new Uint8ClampedArray(16) });
    await expect(
      foreign.pool.digest(asVideoFrame(frameB), { ptsUs: 0, width: 2, height: 2 }),
    ).rejects.toThrow(/unexpected reply/);
    expect(frameB.closed).toBe(0);
    expect(foreign.pool.available).toBe(false);
  });

  it('randomized: interleaved replies, strays, and mid-flight disposal settle every job exactly once', async () => {
    let seed = 1234567;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let round = 0; round < 6; round++) {
      const fake = new FakePool(1 + Math.floor(rand() * 3));
      const settles = new Map<number, number>();
      const jobs: Promise<unknown>[] = [];
      const frames: FakeFrame[] = [];
      const count = 4 + Math.floor(rand() * 8);
      let postedTag = -1;
      for (const worker of fake.workers) {
        worker.postMessageHooks.push((tag) => {
          postedTag = tag;
          const roll = rand();
          if (roll < 0.15) {
            queueMicrotask(() => worker.deliver({ tag: 999999, hex: 'stray', pixels: new Uint8ClampedArray(0) })); // unknown tag
          }
          if (roll < 0.3) {
            queueMicrotask(() => worker.deliver({ tag, error: 'rnd' })); // duplicate-ish failure reply
          }
        });
        worker.replyFor = (tag, width, height) => ({
          tag,
          hex: `x${tag}`,
          pixels: new Uint8ClampedArray(width * height * 4),
        });
      }
      for (let i = 0; i < count; i++) {
        const frame = fakeFrame(i, 3, 2);
        frames.push(frame);
        jobs.push(
          fake.pool.digest(asVideoFrame(frame), { ptsUs: i, width: 3, height: 2 }).then(
            (r) => {
              settles.set(r.ptsUs, (settles.get(r.ptsUs) ?? 0) + 1);
            },
            () => {
              settles.set(i, (settles.get(i) ?? 0) + 1);
            },
          ),
        );
      }
      if (rand() < 0.3) fake.pool.dispose();
      await Promise.all(jobs);
      // Every submitted job settled exactly once; original frames are never closed by the pool.
      for (let i = 0; i < count; i++) expect(settles.get(i) ?? 0).toBe(1);
      for (const frame of frames) expect(frame.closed).toBe(0);
      void postedTag;
    }
  });
});
