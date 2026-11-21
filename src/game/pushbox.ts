export interface FighterPushBox {
  x: number;
  width: number;
  top: number;
  bottom: number;
  minX: number;
  maxX: number;
}

export interface ResolvedPushPositions {
  aX: number;
  bX: number;
  collided: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Resolves solid horizontal pushbox separation between two fighters.
 * - Fighters cannot walk, lunge, or slide through each other when their
 *   vertical pushboxes overlap.
 * - If one fighter jumps high enough so their feet clear the other's pushbox
 *   top (or the grounded fighter crouches/slides to lower their pushbox top),
 *   they pass cleanly over/under without horizontal blocking.
 * - Handles stage/camera wall pinning so a cornered fighter still keeps the
 *   other fighter outside their body width.
 */
export function resolveFighterPushboxes(
  a: FighterPushBox,
  b: FighterPushBox,
  preferredSide: 1 | -1 = 1
): ResolvedPushPositions {
  // No collision if one fighter is vertically clear of the other (jumping over / sliding under).
  if (a.bottom <= b.top || b.bottom <= a.top) {
    return { aX: a.x, bX: b.x, collided: false };
  }

  const minSeparation = Math.max(1, (a.width + b.width) * 0.5);
  const dx = b.x - a.x;
  const absDx = Math.abs(dx);

  if (absDx >= minSeparation) {
    return { aX: a.x, bX: b.x, collided: false };
  }

  // Side sign: +1 means b stays to the right of a; -1 means b stays to the left of a.
  const sign: 1 | -1 = absDx > 0.001 ? (dx > 0 ? 1 : -1) : preferredSide;
  const overlap = minSeparation - absDx;

  let aX = clamp(a.x - sign * overlap * 0.5, a.minX, a.maxX);
  let bX = clamp(b.x + sign * overlap * 0.5, b.minX, b.maxX);

  // If either fighter hit a corner wall, transfer the remaining push to the other fighter.
  const remaining = minSeparation - (bX - aX) * sign;
  if (remaining > 0.001) {
    const aAfter = clamp(aX - sign * remaining, a.minX, a.maxX);
    const aMoved = Math.abs(aAfter - aX);
    aX = aAfter;
    const stillLeft = Math.max(0, remaining - aMoved);
    if (stillLeft > 0.001) {
      bX = clamp(bX + sign * stillLeft, b.minX, b.maxX);
    }
  }

  return { aX, bX, collided: true };
}
