import { describe, expect, test } from 'bun:test';
import type { TranscodeOptions } from '../src/core/engine.ts';
import { h264AbrLadderFrom } from '../src/engines/aibrush-media/adapter.ts';
import { transcodeScenarios } from '../src/scenarios/transcode/index.ts';

describe('aibrush-media H.264 ABR quality mapping', () => {
  test('forwards the authored maximum and objective without inflating either rate', () => {
    const options: TranscodeOptions = {
      container: 'mp4',
      variants: [
        {
          codec: 'h264',
          width: 854,
          height: 480,
          bitrate: 1_400_000,
          maxAverageBitrate: 1_820_000,
          quality: { metric: 'ssim-luma-v1', minimumMean: 0.95, samples: 8 },
        },
      ],
    };

    expect(h264AbrLadderFrom(options)).toEqual([
      {
        name: '480p-0',
        width: 854,
        height: 480,
        bitrate: 1_400_000,
        maxAverageBitrate: 1_820_000,
        quality: { metric: 'ssim-luma-v1', minimumMean: 0.95, samples: 8 },
      },
    ]);
  });

  test('keeps a legacy bitrate-only rung free of implicit maximum or quality fields', () => {
    expect(
      h264AbrLadderFrom({
        container: 'mp4',
        variants: [{ codec: 'h264', width: 640, height: 360, bitrate: 800_000 }],
      }),
    ).toEqual([{ name: '360p-0', width: 640, height: 360, bitrate: 800_000 }]);
  });

  test('defensively rejects partial tuples and a maximum below the preferred rate', () => {
    expect(() => h264AbrLadderFrom({
      container: 'mp4',
      variants: [{
        codec: 'h264', width: 640, height: 360, bitrate: 800_000,
        maxAverageBitrate: 1_040_000,
      }],
    })).toThrow(/maxAverageBitrate and quality together/);
    expect(() => h264AbrLadderFrom({
      container: 'mp4',
      variants: [{
        codec: 'h264', width: 640, height: 360, bitrate: 800_000,
        maxAverageBitrate: 799_999,
        quality: { metric: 'ssim-luma-v1', minimumMean: 0.95 },
      }],
    })).toThrow(/greater than or equal to bitrate/);
  });

  test('authors every conformance rung with an explicit 1.3x ceiling and SSIM objective', () => {
    const scenario = transcodeScenarios.find(
      (candidate) => candidate.id === 'transcode/fanout_h264_abr_ladder',
    );
    expect(scenario).toBeDefined();
    expect(scenario?.revision).toBe(3);
    expect(scenario?.requires.features).toContain('quality-constrained-rate');

    const options = scenario?.options as TranscodeOptions;
    expect(options.variants).toEqual([
      {
        codec: 'h264',
        width: 1_920,
        height: 1_080,
        bitrate: 5_000_000,
        maxAverageBitrate: 6_500_000,
        quality: { metric: 'ssim-luma-v1', minimumMean: 0.95, samples: 8 },
      },
      {
        codec: 'h264',
        width: 1_280,
        height: 720,
        bitrate: 2_800_000,
        maxAverageBitrate: 3_640_000,
        quality: { metric: 'ssim-luma-v1', minimumMean: 0.95, samples: 8 },
      },
      {
        codec: 'h264',
        width: 854,
        height: 480,
        bitrate: 1_400_000,
        maxAverageBitrate: 1_820_000,
        quality: { metric: 'ssim-luma-v1', minimumMean: 0.95, samples: 8 },
      },
      {
        codec: 'h264',
        width: 640,
        height: 360,
        bitrate: 800_000,
        maxAverageBitrate: 1_040_000,
        quality: { metric: 'ssim-luma-v1', minimumMean: 0.95, samples: 8 },
      },
    ]);
  });
});
