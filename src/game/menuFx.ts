import * as Phaser from 'phaser';

interface EmberParticle {
  node: Phaser.GameObjects.Arc;
  vx: number;
  vy: number;
  phase: number;
  baseAlpha: number;
}

interface StreakLine {
  node: Phaser.GameObjects.Rectangle;
  speed: number;
  baseAlpha: number;
}

const EMBER_COLORS = [0xfbbf24, 0xff3c78, 0x38bdf8, 0xfef08a];

/**
 * Spawns rising glowing arcade embers and subtle diagonal speed streaks behind menu UI.
 * Automatically cleans up on scene SHUTDOWN.
 */
export function createMenuAmbientFx(
  scene: Phaser.Scene,
  options: { intensity?: 'splash' | 'menu'; depth?: number } = {}
): { destroy: () => void } {
  const { intensity = 'menu', depth = 1 } = options;
  const { width, height } = scene.cameras.main;
  const emberCount = intensity === 'splash' ? 28 : 18;
  const streakCount = intensity === 'splash' ? 6 : 4;

  const embers: EmberParticle[] = [];
  const streaks: StreakLine[] = [];

  for (let i = 0; i < streakCount; i += 1) {
    const lineW = Phaser.Math.Between(180, 380);
    const lineH = Phaser.Math.Between(1, 2);
    const color = i % 2 === 0 ? 0xfbbf24 : 0x38bdf8;
    const baseAlpha = intensity === 'splash' ? 0.14 : 0.08;
    const node = scene.add
      .rectangle(
        Phaser.Math.Between(-150, width + 150),
        Phaser.Math.Between(40, height - 40),
        lineW,
        lineH,
        color,
        baseAlpha
      )
      .setRotation(-0.18)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(depth);

    streaks.push({
      node,
      speed: Phaser.Math.FloatBetween(110, 220),
      baseAlpha
    });
  }

  for (let i = 0; i < emberCount; i += 1) {
    const radius = Phaser.Math.FloatBetween(1.6, intensity === 'splash' ? 3.8 : 3.0);
    const color = EMBER_COLORS[i % EMBER_COLORS.length];
    const baseAlpha =
      intensity === 'splash'
        ? Phaser.Math.FloatBetween(0.28, 0.72)
        : Phaser.Math.FloatBetween(0.16, 0.45);
    const node = scene.add
      .circle(
        Phaser.Math.Between(20, width - 20),
        Phaser.Math.Between(20, height - 10),
        radius,
        color,
        baseAlpha
      )
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(depth);

    embers.push({
      node,
      vx: Phaser.Math.FloatBetween(-16, 16),
      vy: Phaser.Math.FloatBetween(-58, -22),
      phase: Phaser.Math.FloatBetween(0, Math.PI * 2),
      baseAlpha
    });
  }

  const onUpdate = (time: number, delta: number): void => {
    const dt = Math.min(0.05, delta * 0.001);
    const seconds = time * 0.001;

    for (const ember of embers) {
      ember.node.x += (ember.vx + Math.sin(seconds * 2.2 + ember.phase) * 18) * dt;
      ember.node.y += ember.vy * dt;
      ember.node.setAlpha(ember.baseAlpha * (0.65 + 0.35 * Math.sin(seconds * 3.5 + ember.phase)));

      if (ember.node.y < -16) {
        ember.node.y = height + 14;
        ember.node.x = Phaser.Math.Between(20, width - 20);
      }
      if (ember.node.x < -16) {
        ember.node.x = width + 12;
      } else if (ember.node.x > width + 16) {
        ember.node.x = -12;
      }
    }

    for (const streak of streaks) {
      streak.node.x += streak.speed * dt;
      streak.node.y -= streak.speed * 0.18 * dt;
      streak.node.setAlpha(streak.baseAlpha * (0.7 + 0.3 * Math.sin(seconds * 2.8 + streak.node.y * 0.01)));
      if (streak.node.x > width + 260) {
        streak.node.x = -260;
        streak.node.y = Phaser.Math.Between(50, height - 30);
      }
    }
  };

  scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);

  const destroy = (): void => {
    scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate);
    embers.forEach((e) => {
      if (e.node.scene) e.node.destroy();
    });
    streaks.forEach((s) => {
      if (s.node.scene) s.node.destroy();
    });
  };

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, destroy);

  return { destroy };
}

/**
 * Spawns an expanding shockwave ring and radial energy sparks at (x, y).
 */
export function spawnBurstSparks(
  scene: Phaser.Scene,
  x: number,
  y: number,
  color = 0xfbbf24,
  count = 10,
  depth = 50,
  scrollFactor = 1
): void {
  const ring = scene.add
    .circle(x, y, 24, color, 0)
    .setStrokeStyle(3, color, 0.9)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(depth)
    .setScrollFactor(scrollFactor)
    .setScale(0.4);

  scene.tweens.add({
    targets: ring,
    scale: 3.1,
    alpha: 0,
    duration: 360,
    ease: 'Cubic.Out',
    onComplete: () => ring.destroy()
  });

  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.2, 0.2);
    const dist = Phaser.Math.Between(42, 115);
    const sparkColor = i % 2 === 0 ? color : 0xffffff;
    const spark = scene.add
      .rectangle(x, y, Phaser.Math.Between(8, 16), 3, sparkColor, 0.95)
      .setRotation(angle)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(depth + 1)
      .setScrollFactor(scrollFactor);

    scene.tweens.add({
      targets: spark,
      x: x + Math.cos(angle) * dist,
      y: y + Math.sin(angle) * dist,
      scaleX: 0.2,
      alpha: 0,
      duration: Phaser.Math.Between(240, 380),
      ease: 'Cubic.Out',
      onComplete: () => spark.destroy()
    });
  }
}
