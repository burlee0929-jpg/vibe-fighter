import { describe, expect, it } from 'vitest';

import { resolveFighterPushboxes, type FighterPushBox } from './pushbox';

function makeBox(overrides: Partial<FighterPushBox> = {}): FighterPushBox {
  return {
    x: 500,
    width: 76,
    top: 482,
    bottom: 600,
    minX: 80,
    maxX: 1200,
    ...overrides
  };
}

describe('resolveFighterPushboxes', () => {
  it('separates grounded fighters so they cannot pass through each other', () => {
    const p1 = makeBox({ x: 500 });
    const p2 = makeBox({ x: 530 });
    const res = resolveFighterPushboxes(p1, p2, 1);

    expect(res.collided).toBe(true);
    expect(res.bX - res.aX).toBeCloseTo(76, 4);
    expect(res.aX).toBeLessThan(p1.x);
    expect(res.bX).toBeGreaterThan(p2.x);
  });

  it('prevents sliding through a grounded opponent', () => {
    const p1Sliding = makeBox({ x: 520, top: 536, bottom: 600 });
    const p2Standing = makeBox({ x: 550, top: 482, bottom: 600 });
    const res = resolveFighterPushboxes(p1Sliding, p2Standing, 1);

    expect(res.collided).toBe(true);
    expect(res.bX - res.aX).toBeCloseTo(76, 4);
  });

  it('allows a fighter to jump cleanly over a standing opponent', () => {
    const jumper = makeBox({ x: 505, top: 350, bottom: 468 });
    const standing = makeBox({ x: 500, top: 482, bottom: 600 });
    const res = resolveFighterPushboxes(jumper, standing, 1);

    expect(res.collided).toBe(false);
    expect(res.aX).toBe(505);
    expect(res.bX).toBe(500);
  });

  it('allows sliding underneath a jumping opponent even early in their jump', () => {
    // Jumper feet are 75px off the ground (600 - 75 = 525).
    // Standing fighter top is 482 (would collide), but sliding fighter top is 536 (clears!).
    const jumper = makeBox({ x: 510, top: 407, bottom: 525 });
    const slider = makeBox({ x: 500, top: 536, bottom: 600 });
    const res = resolveFighterPushboxes(jumper, slider, -1);

    expect(res.collided).toBe(false);
    expect(res.aX).toBe(510);
    expect(res.bX).toBe(500);
  });

  it('pushes the approaching fighter back when the defender is pinned in a corner', () => {
    const cornered = makeBox({ x: 80, minX: 80, maxX: 1200 });
    const attacker = makeBox({ x: 110, minX: 80, maxX: 1200 });
    const res = resolveFighterPushboxes(cornered, attacker, 1);

    expect(res.collided).toBe(true);
    expect(res.aX).toBe(80);
    expect(res.bX).toBeCloseTo(156, 4);
  });

  it('separates fighters deterministically using preferredSide when landing dead-center', () => {
    const p1 = makeBox({ x: 500 });
    const p2 = makeBox({ x: 500 });
    const res = resolveFighterPushboxes(p1, p2, -1);

    expect(res.collided).toBe(true);
    expect(res.aX - res.bX).toBeCloseTo(76, 4);
  });
});
