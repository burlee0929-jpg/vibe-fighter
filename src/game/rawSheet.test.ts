import { describe, expect, it } from 'vitest';

import { computePoseScales, detectSheetPoses } from './rawSheet';

function makeMask(width: number, height: number): Uint8Array {
  return new Uint8Array(width * height);
}

function fillRect(
  mask: Uint8Array,
  maskWidth: number,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  for (let py = y; py < y + h; py += 1) {
    for (let px = x; px < x + w; px += 1) {
      mask[py * maskWidth + px] = 1;
    }
  }
}

describe('computePoseScales', () => {
  it('prevents wide lying-down poses from shrinking standing poses in uniform mode', () => {
    const scales = computePoseScales(
      [
        { width: 220, height: 460 },
        { width: 280, height: 450 },
        { width: 260, height: 440 },
        { width: 620, height: 120 }
      ],
      { scaleMode: 'uniform' }
    );

    // Standing poses should use 200 / 460 (~0.435), NOT 250 / 620 (~0.403).
    expect(scales[0]).toBeCloseTo(200 / 460, 4);
    expect(scales[1]).toBeCloseTo(200 / 460, 4);
    expect(scales[2]).toBeCloseTo(200 / 460, 4);
    // Lying pose keeps its proportional height (~52px, not enlarged).
    expect(Math.round(120 * scales[3])).toBeLessThan(65);
  });

  it('keeps every action/ability pose full-sized in per-pose mode even with tall jump/kick frames', () => {
    const poses = [
      { width: 300, height: 363 },
      { width: 358, height: 383 },
      { width: 256, height: 526 },
      { width: 327, height: 312 }
    ];
    const scales = computePoseScales(poses, { scaleMode: 'per-pose' });

    expect(Math.round(poses[0].height * scales[0])).toBe(200);
    expect(Math.round(poses[1].height * scales[1])).toBe(200);
    expect(Math.round(poses[2].height * scales[2])).toBe(200);
    expect(Math.round(poses[3].height * scales[3])).toBe(200);
  });

  it('keeps flat knockdown pose un-enlarged even in per-pose mode', () => {
    const poses = [
      { width: 176, height: 474 },
      { width: 349, height: 457 },
      { width: 376, height: 449 },
      { width: 422, height: 125 }
    ];
    const scales = computePoseScales(poses, { scaleMode: 'per-pose' });

    expect(Math.round(poses[0].height * scales[0])).toBe(200);
    expect(Math.round(poses[1].height * scales[1])).toBe(200);
    expect(Math.round(poses[2].height * scales[2])).toBe(200);
    expect(Math.round(poses[3].height * scales[3])).toBeLessThan(65);
  });
});

describe('detectSheetPoses', () => {
  it('separates horizontally overlapping poses cleanly via 2D connected components', () => {
    const width = 400;
    const height = 200;
    const mask = makeMask(width, height);

    // Pose 0
    fillRect(mask, width, 20, 40, 50, 120);
    // Pose 1
    fillRect(mask, width, 110, 40, 50, 120);
    // Pose 2 with outstretched arm reaching x=275 at y=70..85
    fillRect(mask, width, 200, 40, 50, 120);
    fillRect(mask, width, 250, 70, 25, 15);
    // Pose 3 lying knockdown starting at x=265 at y=135..165 (overlaps Pose 2 arm in X!)
    fillRect(mask, width, 265, 135, 110, 30);

    const { poses, labelMap } = detectSheetPoses(mask, width, height, 4);

    expect(poses).toHaveLength(4);
    expect(labelMap).not.toBeNull();
    expect(poses[2].width).toBe(75);
    expect(poses[2].height).toBe(120);
    expect(poses[3].width).toBe(110);
    expect(poses[3].height).toBe(30);
  });

  it('attaches detached slash/effect fragments to their nearest pose seed', () => {
    const width = 400;
    const height = 200;
    const mask = makeMask(width, height);

    fillRect(mask, width, 20, 40, 50, 120);
    fillRect(mask, width, 110, 40, 50, 120);
    fillRect(mask, width, 200, 40, 50, 120);
    // Pose 3 body + nearby detached slash wave 12px ahead
    fillRect(mask, width, 290, 40, 50, 120);
    fillRect(mask, width, 352, 70, 24, 30);

    const { poses } = detectSheetPoses(mask, width, height, 4);

    expect(poses).toHaveLength(4);
    expect(poses[3].width).toBe(86);
    expect(poses[3].height).toBe(120);
  });
});
