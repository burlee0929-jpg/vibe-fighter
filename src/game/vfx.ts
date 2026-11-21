import * as Phaser from 'phaser';

import { FIGHTING_UI_ATLAS_TEXTURE_KEY } from './fightingUiAtlas';

/** Render depth for combat VFX: above fighters, below the HUD. */
const VFX_DEPTH = 90;

/** Tint/spark colour keyed to the kind of impact. */
export type VfxColor = 'red' | 'gold' | 'blue';

const SPARK_FRAME: Record<VfxColor, string> = {
  red: 'icon-hit-red',
  gold: 'icon-hit-gold',
  blue: 'icon-hit-blue'
};

const FLASH_TINT: Record<VfxColor, number> = {
  red: 0xff5a5a,
  gold: 0xffd24a,
  blue: 0x7ec8ff
};

/**
 * Spawns a short-lived hit spark (an atlas impact icon) at a contact point that
 * pops in, scales up, and fades out. Used when an attack connects.
 * @param scene - The owning scene.
 * @param x - World x of the contact point.
 * @param y - World y of the contact point.
 * @param color - Spark colour (red clean hit, blue blocked, gold finisher).
 * @param scale - Peak display scale of the spark (default 1).
 */
export function spawnHitSpark(
  scene: Phaser.Scene,
  x: number,
  y: number,
  color: VfxColor = 'red',
  scale = 1
): void {
  const frame = SPARK_FRAME[color];
  if (!scene.textures.exists(FIGHTING_UI_ATLAS_TEXTURE_KEY)) {
    spawnImpactFlash(scene, x, y, color, 40 * scale);
    return;
  }

  const spark = scene.add
    .image(x, y, FIGHTING_UI_ATLAS_TEXTURE_KEY, frame)
    .setDepth(VFX_DEPTH)
    .setScrollFactor(1)
    .setScale(0.2 * scale)
    .setAngle(Phaser.Math.Between(-30, 30))
    .setAlpha(1);

  scene.tweens.add({
    targets: spark,
    scale: scale,
    alpha: 0,
    duration: 220,
    ease: 'Cubic.Out',
    onComplete: () => spark.destroy()
  });

  const shardTint = FLASH_TINT[color];
  for (let i = 0; i < 5; i += 1) {
    const angle = (i / 5) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.35, 0.35);
    const dist = Phaser.Math.Between(34, 74) * scale;
    const shard = scene.add
      .rectangle(x, y, Phaser.Math.Between(9, 16) * scale, 3, i % 2 === 0 ? shardTint : 0xffffff, 0.95)
      .setRotation(angle)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(VFX_DEPTH + 1)
      .setScrollFactor(1);

    scene.tweens.add({
      targets: shard,
      x: x + Math.cos(angle) * dist,
      y: y + Math.sin(angle) * dist,
      scaleX: 0.2,
      alpha: 0,
      duration: Phaser.Math.Between(160, 250),
      ease: 'Cubic.Out',
      onComplete: () => shard.destroy()
    });
  }

  spawnImpactFlash(scene, x, y, color, 34 * scale);
}

/**
 * Spawns an expanding ring flash at a point that fades as it grows.
 * @param scene - The owning scene.
 * @param x - World x of the flash centre.
 * @param y - World y of the flash centre.
 * @param color - Flash tint.
 * @param radius - Peak radius in world pixels.
 */
export function spawnImpactFlash(
  scene: Phaser.Scene,
  x: number,
  y: number,
  color: VfxColor,
  radius = 40
): void {
  const ring = scene.add
    .circle(x, y, radius * 0.3, FLASH_TINT[color], 0.55)
    .setDepth(VFX_DEPTH - 1)
    .setScrollFactor(1);

  scene.tweens.add({
    targets: ring,
    scale: 2.4,
    alpha: 0,
    duration: 260,
    ease: 'Cubic.Out',
    onComplete: () => ring.destroy()
  });
}

/**
 * Spawns a special-move charge burst around a fighter: concentric rings that
 * expand outward and fade, telegraphing the wind-up before the move executes.
 * @param scene - The owning scene.
 * @param x - World x of the fighter's centre.
 * @param y - World y of the fighter's centre (roughly mid-body).
 * @param color - Aura colour.
 */
export function spawnChargeAura(scene: Phaser.Scene, x: number, y: number, color: VfxColor = 'gold'): void {
  for (let index = 0; index < 3; index += 1) {
    const ring = scene.add
      .circle(x, y, 18, FLASH_TINT[color], 0)
      .setStrokeStyle(4, FLASH_TINT[color], 0.9)
      .setDepth(VFX_DEPTH - 1)
      .setScrollFactor(1)
      .setScale(1.6);

    scene.tweens.add({
      targets: ring,
      scale: 0.2,
      alpha: 0,
      delay: index * 120,
      duration: 420,
      ease: 'Sine.In',
      onComplete: () => ring.destroy()
    });
  }
}

/**
 * Draws razor-sharp cursed slash arcs (Cleave / Dismantle) that flash and fade.
 * @param scene - The owning scene.
 * @param x - World x centre of the slash.
 * @param y - World y centre of the slash.
 * @param facing - Attacker facing (+1 right, -1 left).
 * @param variant - 'single' (light), 'cross' (cleave/followup), or 'heavy'.
 */
export function spawnSlashVfx(
  scene: Phaser.Scene,
  x: number,
  y: number,
  facing: 1 | -1,
  variant: 'single' | 'heavy' | 'cross' = 'single',
  color = 0xdc2626
): void {
  const count = variant === 'cross' ? 3 : variant === 'heavy' ? 2 : 1;

  for (let i = 0; i < count; i += 1) {
    const gfx = scene.add.graphics().setDepth(VFX_DEPTH + 1).setScrollFactor(1);
    const len = variant === 'cross' ? 115 : variant === 'heavy' ? 96 : 68;
    const angle =
      variant === 'cross'
        ? (i === 0 ? -0.65 : i === 1 ? 0.65 : 0.05) * facing
        : (i === 0 ? -0.45 : 0.38) * facing;

    const dx = Math.cos(angle) * len * 0.5;
    const dy = Math.sin(angle) * len * 0.5;
    const ox = (i - (count - 1) / 2) * 14 * facing;
    const oy = (i - (count - 1) / 2) * 16;

    // Outer themed energy aura stroke
    gfx.lineStyle(variant === 'single' ? 7 : 10, color, 0.85);
    gfx.beginPath();
    gfx.moveTo(x + ox - dx, y + oy - dy);
    gfx.lineTo(x + ox + dx, y + oy + dy);
    gfx.strokePath();

    // Inner razor white core
    gfx.lineStyle(variant === 'single' ? 2.5 : 3.5, 0xfef2f2, 1);
    gfx.beginPath();
    gfx.moveTo(x + ox - dx * 0.9, y + oy - dy * 0.9);
    gfx.lineTo(x + ox + dx * 0.9, y + oy + dy * 0.9);
    gfx.strokePath();

    scene.tweens.add({
      targets: gfx,
      alpha: 0,
      scaleX: 1.25,
      scaleY: 1.15,
      duration: variant === 'cross' ? 240 : 180,
      ease: 'Cubic.Out',
      onComplete: () => gfx.destroy()
    });
  }
}

/**
 * Spawns hero-styled M1 combo strike VFX across the 4-hit chain.
 */
export function spawnM1Vfx(
  scene: Phaser.Scene,
  x: number,
  y: number,
  facing: 1 | -1,
  style: 'slash' | 'brawl' | 'energy' | 'frost' | 'martial',
  step: 1 | 2 | 3 | 4,
  color: number
): void {
  const isFinisher = step === 4;

  if (style === 'slash') {
    spawnSlashVfx(scene, x, y, facing, isFinisher ? 'cross' : step === 3 ? 'heavy' : 'single', color);
    return;
  }

  const gfx = scene.add.graphics().setDepth(VFX_DEPTH + 1).setScrollFactor(1);

  if (style === 'brawl') {
    const len = isFinisher ? 92 : 46 + step * 10;
    gfx.lineStyle(isFinisher ? 9 : 5, color, 0.9);
    for (let i = -1; i <= 1; i += 1) {
      const oy = i * (isFinisher ? 18 : 11);
      gfx.beginPath();
      gfx.moveTo(x - 14 * facing, y + oy);
      gfx.lineTo(x + len * facing, y + oy * 0.45);
      gfx.strokePath();
    }
    if (isFinisher) {
      gfx.lineStyle(4, 0xffffff, 0.95);
      gfx.strokeCircle(x + 28 * facing, y, 36);
    }
  } else if (style === 'energy') {
    const r = isFinisher ? 48 : 22 + step * 6;
    gfx.fillStyle(color, isFinisher ? 0.45 : 0.28);
    gfx.fillCircle(x + 12 * facing, y, r);
    gfx.lineStyle(isFinisher ? 6 : 3, 0xffffff, 0.95);
    gfx.strokeCircle(x + 12 * facing, y, r * 0.72);
    gfx.lineStyle(4, color, 0.9);
    gfx.strokeCircle(x + 12 * facing, y, r * 1.15);
  } else if (style === 'frost') {
    const spikes = isFinisher ? 5 : 3;
    gfx.fillStyle(color, 0.55);
    gfx.lineStyle(2.5, 0xf0f9ff, 0.95);
    for (let i = 0; i < spikes; i += 1) {
      const spread = (i - (spikes - 1) / 2) * 0.34;
      const len = (isFinisher ? 86 : 50 + step * 8);
      const tipX = x + Math.cos(spread) * len * facing;
      const tipY = y + Math.sin(spread) * len;
      gfx.fillTriangle(
        x - 8 * facing,
        y - 9,
        x - 8 * facing,
        y + 9,
        tipX,
        tipY
      );
      gfx.strokeTriangle(x - 8 * facing, y - 9, x - 8 * facing, y + 9, tipX, tipY);
    }
  } else {
    // 'martial' sweeping arc wave
    const radius = isFinisher ? 78 : 42 + step * 9;
    const startAngle = facing === 1 ? -1.05 : Math.PI - 1.05;
    const endAngle = facing === 1 ? 1.05 : Math.PI + 1.05;
    gfx.lineStyle(isFinisher ? 10 : 6, color, 0.9);
    gfx.beginPath();
    gfx.arc(x - 10 * facing, y, radius, startAngle, endAngle, false);
    gfx.strokePath();
    gfx.lineStyle(3, 0xffffff, 0.95);
    gfx.beginPath();
    gfx.arc(x - 6 * facing, y, radius * 0.85, startAngle * 0.8, endAngle * 0.8, false);
    gfx.strokePath();
  }

  scene.tweens.add({
    targets: gfx,
    alpha: 0,
    scaleX: isFinisher ? 1.38 : 1.2,
    scaleY: isFinisher ? 1.38 : 1.2,
    duration: isFinisher ? 260 : 170,
    ease: 'Cubic.Out',
    onComplete: () => gfx.destroy()
  });
}

/**
 * Summons Sukuna's Domain Expansion ("Malevolent Shrine") backdrop & slash storm
 * during his Super Art.
 */
export function spawnMalevolentShrineDomain(
  scene: Phaser.Scene,
  focusX: number,
  groundY: number,
  durationMs = 950
): void {
  spawnHeroDomainVfx(scene, focusX, groundY, 'shrine', 0xef4444, durationMs);
}

/**
 * Summons a themed Domain Expansion / Ultimate Aura backdrop & ability barrage
 * tailored to each hero's Super Art.
 */
export function spawnHeroDomainVfx(
  scene: Phaser.Scene,
  focusX: number,
  groundY: number,
  style: 'shrine' | 'void' | 'kurama' | 'cyber' | 'cosmic' | 'blizzard' | 'vortex',
  accentColor: number,
  durationMs = 950
): void {
  const cam = scene.cameras.main;
  const veilColor =
    style === 'shrine'
      ? 0x450a0a
      : style === 'void'
        ? 0x1e1b4b
        : style === 'kurama'
          ? 0x431407
          : style === 'cyber'
            ? 0x083344
            : style === 'cosmic'
              ? 0x0c4a6e
              : style === 'blizzard'
                ? 0x082f49
                : 0x0f172a;

  const veil = scene.add
    .rectangle(cam.width / 2, cam.height / 2, cam.width, cam.height, veilColor, 0)
    .setScrollFactor(0)
    .setDepth(2);

  scene.tweens.add({
    targets: veil,
    alpha: 0.52,
    duration: 160,
    ease: 'Quad.Out'
  });
  scene.tweens.add({
    targets: veil,
    alpha: 0,
    delay: Math.max(200, durationMs - 220),
    duration: 240,
    onComplete: () => veil.destroy()
  });

  const backdrop = scene.add.graphics().setDepth(3).setScrollFactor(1).setAlpha(0);
  const sx = focusX;
  const base = groundY;

  if (style === 'shrine') {
    backdrop.fillStyle(0x180408, 0.92);
    backdrop.lineStyle(3, accentColor, 0.8);
    backdrop.fillTriangle(sx - 230, base - 270, sx + 230, base - 270, sx, base - 360);
    backdrop.strokeTriangle(sx - 230, base - 270, sx + 230, base - 270, sx, base - 360);
    backdrop.fillRect(sx - 180, base - 275, 360, 26);
    backdrop.fillRect(sx - 120, base - 250, 28, 250);
    backdrop.fillRect(sx + 92, base - 250, 28, 250);
    backdrop.fillStyle(0x991b1b, 0.55);
    backdrop.fillRect(sx - 72, base - 220, 144, 220);
  } else if (style === 'void' || style === 'cosmic') {
    backdrop.lineStyle(5, accentColor, 0.78);
    backdrop.strokeCircle(sx, base - 160, 165);
    backdrop.lineStyle(2, 0xffffff, 0.65);
    backdrop.strokeCircle(sx, base - 160, 120);
    backdrop.strokeCircle(sx, base - 160, 215);
    backdrop.fillStyle(accentColor, 0.16);
    backdrop.fillCircle(sx, base - 160, 165);
  } else if (style === 'cyber') {
    backdrop.lineStyle(2, accentColor, 0.7);
    for (let x = sx - 260; x <= sx + 260; x += 52) {
      backdrop.lineBetween(x, base - 340, x, base);
    }
    for (let y = base - 320; y <= base; y += 46) {
      backdrop.lineBetween(sx - 260, y, sx + 260, y);
    }
  } else if (style === 'blizzard') {
    backdrop.lineStyle(4, accentColor, 0.85);
    for (let i = -2; i <= 2; i += 1) {
      const px = sx + i * 75;
      const h = 160 + (2 - Math.abs(i)) * 55;
      backdrop.fillStyle(0x7dd3fc, 0.28);
      backdrop.fillTriangle(px - 24, base, px + 24, base, px, base - h);
      backdrop.strokeTriangle(px - 24, base, px + 24, base, px, base - h);
    }
  } else {
    backdrop.lineStyle(5, accentColor, 0.8);
    backdrop.fillStyle(accentColor, 0.18);
    backdrop.fillTriangle(sx - 150, base, sx + 150, base, sx, base - 320);
    backdrop.strokeTriangle(sx - 150, base, sx + 150, base, sx, base - 320);
  }

  scene.tweens.add({ targets: backdrop, alpha: 0.88, duration: 180, ease: 'Cubic.Out' });
  scene.tweens.add({
    targets: backdrop,
    alpha: 0,
    delay: Math.max(200, durationMs - 220),
    duration: 240,
    onComplete: () => backdrop.destroy()
  });

  const stormEvents = 8;
  for (let i = 0; i < stormEvents; i += 1) {
    scene.time.delayedCall(i * Math.floor(durationMs / stormEvents), () => {
      if (!scene.sys.isActive()) {
        return;
      }
      const rx = focusX + Phaser.Math.Between(-95, 95);
      const ry = groundY - Phaser.Math.Between(60, 210);
      spawnSlashVfx(scene, rx, ry, i % 2 === 0 ? 1 : -1, 'cross', accentColor);
    });
  }
}

export function spawnSlideDust(
  scene: Phaser.Scene,
  x: number,
  groundY: number,
  moveDir: number,
  accentColor = 0xe2e8f0
): void {
  const dir = moveDir >= 0 ? 1 : -1;
  const puff = scene.add
    .ellipse(x - dir * 24, groundY - 8, 24, 12, 0xe2e8f0, 0.55)
    .setDepth(VFX_DEPTH - 2)
    .setScrollFactor(1);
  const streak = scene.add
    .rectangle(x - dir * 18, groundY - 18, 34, 4, accentColor, 0.65)
    .setDepth(VFX_DEPTH - 2)
    .setScrollFactor(1);

  scene.tweens.add({
    targets: puff,
    x: puff.x - dir * 28,
    y: puff.y - 8,
    scaleX: 1.5,
    scaleY: 1.35,
    alpha: 0,
    duration: 210,
    ease: 'Cubic.Out',
    onComplete: () => puff.destroy()
  });

  scene.tweens.add({
    targets: streak,
    x: streak.x - dir * 36,
    scaleX: 0.4,
    alpha: 0,
    duration: 170,
    ease: 'Quad.Out',
    onComplete: () => streak.destroy()
  });
}
