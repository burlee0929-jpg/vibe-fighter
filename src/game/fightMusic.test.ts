import { describe, expect, it } from 'vitest';

import {
  BGM_LOOP_DURATION_SECONDS,
  BGM_LOOP_HOURS,
  BGM_YOUTUBE_LIST_ID,
  BGM_YOUTUBE_VIDEO_ID,
  BackgroundMusicEngine,
  formatDurationHms
} from './fightMusic';
import type { GameSettings } from './types';

const DEFAULT_TEST_SETTINGS: GameSettings = {
  sfxVolume: 0.8,
  musicVolume: 0.7,
  muted: false
};

describe('BackgroundMusicEngine (YouTube 24H BGM)', () => {
  it('targets the requested YouTube video and 24-hour duration', () => {
    expect(BGM_YOUTUBE_VIDEO_ID).toBe('LQw-a8sApLQ');
    expect(BGM_YOUTUBE_LIST_ID).toBe('PL7D6CF7B0A10F2FC6');
    expect(BGM_LOOP_HOURS).toBe(24);
    expect(BGM_LOOP_DURATION_SECONDS).toBe(86400);
    expect(formatDurationHms(BGM_LOOP_DURATION_SECONDS)).toBe('24:00:00');
  });

  it('tracks active 24-hour playback time and stops cleanly when 24 hours complete', () => {
    const engine = new BackgroundMusicEngine();
    engine.start(DEFAULT_TEST_SETTINGS, 'menu');

    expect(engine.getStatus().running).toBe(true);
    expect(engine.getStatus().remainingSeconds).toBe(86400);

    engine.tickPlaybackClock(3600 * 1000);
    expect(engine.getStatus().elapsedSeconds).toBe(3600);
    expect(engine.getStatus().remainingSeconds).toBe(82800);

    engine.setPaused(true);
    engine.tickPlaybackClock(120 * 1000);
    expect(engine.getStatus().elapsedSeconds).toBe(3600);

    engine.setPaused(false);
    engine.tickPlaybackClock(23 * 3600 * 1000);
    expect(engine.getStatus().elapsedSeconds).toBe(86400);
    expect(engine.getStatus().remainingSeconds).toBe(0);
    expect(engine.getStatus().running).toBe(false);

    engine.destroy();
  });
});
