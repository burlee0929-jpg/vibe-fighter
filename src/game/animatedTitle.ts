import * as Phaser from 'phaser';

import { spawnBurstSparks } from './menuFx';

export interface AnimatedTitleOptions {
  x: number;
  y: number;
  title: string;
  tagline?: string;
  fontSize?: number;
  taglineOffsetY?: number;
  depth?: number;
  compact?: boolean;
}

export interface AnimatedPromptOptions {
  x: number;
  y: number;
  label: string;
  depth?: number;
}

interface TitleGlyph {
  text: Phaser.GameObjects.Text;
  baseX: number;
  baseY: number;
  index: number;
  wordIndex: number;
  entered: boolean;
}

function lerpChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function lerpColor(from: number, to: number, t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  const ar = (from >> 16) & 0xff;
  const ag = (from >> 8) & 0xff;
  const ab = from & 0xff;
  const br = (to >> 16) & 0xff;
  const bg = (to >> 8) & 0xff;
  const bb = to & 0xff;
  const r = lerpChannel(ar, br, clamped);
  const g = lerpChannel(ag, bg, clamped);
  const b = lerpChannel(ab, bb, clamped);
  return (r << 16) | (g << 8) | b;
}

/**
 * Renders a multi-layered, kinetic arcade fighting game title with per-letter
 * drop-in impact, floating wave motion, glowing backdrop aura, speed lines,
 * and a traveling metallic sheen sweep across glyphs.
 */
export function createAnimatedArcadeTitle(
  scene: Phaser.Scene,
  options: AnimatedTitleOptions
): { destroy: () => void } {
  const {
    x,
    y,
    title,
    tagline = '',
    fontSize = 48,
    taglineOffsetY = 54,
    depth = 4,
    compact = false
  } = options;

  const upperTitle = title.toUpperCase();
  const createdObjects: Phaser.GameObjects.GameObject[] = [];
  const activeTweens: Phaser.Tweens.Tween[] = [];

  // Glowing energy aura behind title
  const auraOuter = scene.add
    .ellipse(x, y, compact ? 520 : 760, compact ? 74 : 112, 0xff3c78, 0.22)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(depth - 2);
  const auraInner = scene.add
    .ellipse(x, y + 4, compact ? 420 : 620, compact ? 44 : 68, 0xfbbf24, 0.24)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(depth - 1);
  createdObjects.push(auraOuter, auraInner);

  // Kinetic arcade accent bars behind the title
  const slashWidth = compact ? 500 : 720;
  const topSlash = scene.add
    .rectangle(x, y - fontSize * 0.62, slashWidth, 2, 0xfbbf24, 0.72)
    .setDepth(depth - 1);
  const bottomSlash = scene.add
    .rectangle(x, y + fontSize * 0.64, slashWidth * 0.86, 2, 0x38bdf8, 0.72)
    .setDepth(depth - 1);
  createdObjects.push(topSlash, bottomSlash);

  topSlash.setScale(0, 1);
  bottomSlash.setScale(0, 1);
  activeTweens.push(
    scene.tweens.add({
      targets: topSlash,
      scaleX: 1,
      duration: 420,
      ease: 'Cubic.easeOut'
    }),
    scene.tweens.add({
      targets: bottomSlash,
      scaleX: 1,
      duration: 460,
      delay: 90,
      ease: 'Cubic.easeOut'
    })
  );

  // Measure glyph widths so spacing is crisp even with custom arcade font
  const glyphStyle: Phaser.Types.GameObjects.Text.TextStyle = {
    color: '#ffffff',
    fontFamily: '"Press Start 2P", "Silkscreen", monospace',
    fontStyle: 'italic bold',
    fontSize: `${fontSize}px`,
    stroke: '#090d16',
    strokeThickness: compact ? 8 : 10,
    shadow: {
      offsetX: 4,
      offsetY: 5,
      color: '#1e1b4b',
      blur: 0,
      stroke: true,
      fill: true
    }
  };

  const maxWidth = scene.cameras.main.width * 0.88;
  const letterGap = compact ? 3 : 5;
  const spaceGap = Math.round(fontSize * 0.42);
  const chars = Array.from(upperTitle);

  const measuredWidths = chars.map((ch) => {
    if (ch === ' ') {
      return spaceGap;
    }
    const probe = scene.add.text(-2000, -2000, ch, glyphStyle);
    const width = probe.width;
    probe.destroy();
    return width;
  });

  const rawTotalWidth =
    measuredWidths.reduce((sum, w) => sum + w, 0) +
    Math.max(0, chars.length - 1) * letterGap;
  const fitScale = rawTotalWidth > maxWidth ? maxWidth / rawTotalWidth : 1;
  const scaledGap = letterGap * fitScale;
  const scaledWidths = measuredWidths.map((w) => w * fitScale);
  const totalWidth =
    scaledWidths.reduce((sum, w) => sum + w, 0) +
    Math.max(0, chars.length - 1) * scaledGap;

  let cursorX = x - totalWidth / 2;
  let wordIndex = 0;
  let visibleIndex = 0;
  const glyphs: TitleGlyph[] = [];

  chars.forEach((ch, idx) => {
    const width = scaledWidths[idx];
    if (ch === ' ') {
      wordIndex += 1;
      cursorX += width + scaledGap;
      return;
    }

    const glyphCenterX = cursorX + width / 2;
    cursorX += width + scaledGap;

    const glyphText = scene.add
      .text(glyphCenterX, y - 56, ch, glyphStyle)
      .setOrigin(0.5)
      .setDepth(depth)
      .setAlpha(0)
      .setScale(1.45 * fitScale, 0.72 * fitScale);

    createdObjects.push(glyphText);

    const glyph: TitleGlyph = {
      text: glyphText,
      baseX: glyphCenterX,
      baseY: y,
      index: visibleIndex,
      wordIndex,
      entered: false
    };
    glyphs.push(glyph);

    const delay = visibleIndex * 28;
    visibleIndex += 1;

    activeTweens.push(
      scene.tweens.add({
        targets: glyphText,
        y,
        alpha: 1,
        scaleX: fitScale,
        scaleY: fitScale,
        duration: 320,
        delay,
        ease: 'Back.easeOut',
        onComplete: () => {
          glyph.entered = true;
          if (glyph.index === glyphs.length - 1 && !compact) {
            // Impact pulse + spark burst on final letter landing
            spawnBurstSparks(scene, x, y, 0xfbbf24, 14, depth - 1, 1);
            scene.tweens.add({
              targets: auraInner,
              scaleX: 1.24,
              scaleY: 1.42,
              alpha: 0.54,
              duration: 210,
              yoyo: true,
              ease: 'Quad.easeOut'
            });
          }
        }
      })
    );
  });

  // Animated tagline underneath title
  let taglineText: Phaser.GameObjects.Text | null = null;
  let taglineLeftLine: Phaser.GameObjects.Rectangle | null = null;
  let taglineRightLine: Phaser.GameObjects.Rectangle | null = null;

  if (tagline) {
    const tagY = y + taglineOffsetY;
    taglineText = scene.add
      .text(x, tagY + 14, tagline.toUpperCase(), {
        color: '#e0f2fe',
        fontFamily: '"Silkscreen", "Press Start 2P", monospace',
        fontSize: compact ? '13px' : '15px',
        letterSpacing: 3,
        stroke: '#090d16',
        strokeThickness: 6
      })
      .setOrigin(0.5)
      .setDepth(depth)
      .setAlpha(0);
    createdObjects.push(taglineText);

    const lineOffset = Math.min(340, taglineText.width / 2 + 26);
    taglineLeftLine = scene.add
      .rectangle(x - lineOffset, tagY, 26, 2, 0x38bdf8, 0.85)
      .setDepth(depth)
      .setAlpha(0);
    taglineRightLine = scene.add
      .rectangle(x + lineOffset, tagY, 26, 2, 0x38bdf8, 0.85)
      .setDepth(depth)
      .setAlpha(0);
    createdObjects.push(taglineLeftLine, taglineRightLine);

    activeTweens.push(
      scene.tweens.add({
        targets: taglineText,
        y: tagY,
        alpha: 1,
        duration: 360,
        delay: 280,
        ease: 'Cubic.easeOut'
      }),
      scene.tweens.add({
        targets: [taglineLeftLine, taglineRightLine],
        alpha: 0.9,
        scaleX: 1.25,
        duration: 360,
        delay: 320,
        ease: 'Cubic.easeOut'
      })
    );
  }

  const onUpdate = (time: number): void => {
    const seconds = time * 0.001;

    // Aura breathing
    const auraPulse = 0.5 + 0.5 * Math.sin(seconds * 2.6);
    auraOuter.setScale(1 + auraPulse * 0.08, 1 + auraPulse * 0.12);
    auraOuter.setAlpha(0.16 + auraPulse * 0.1);
    auraInner.setAlpha(0.18 + (1 - auraPulse) * 0.1);

    // Traveling sheen sweep position across glyphs (-2 .. glyphs.length + 2)
    const sweepCycle = (seconds * 0.48) % 1;
    const sweepPos = -2 + sweepCycle * (glyphs.length + 6);

    glyphs.forEach((glyph) => {
      if (!glyph.entered) {
        return;
      }

      const wave = Math.sin(seconds * 3.8 - glyph.index * 0.52);
      const bobY = wave * (compact ? 2.6 : 4.2);
      const tilt = Math.cos(seconds * 2.6 - glyph.index * 0.45) * 0.032;

      const distToSweep = Math.abs(glyph.index - sweepPos);
      const sheen = Math.max(0, 1 - distToSweep / 1.9);
      const scaleBump = fitScale * (1 + sheen * 0.09);

      glyph.text.setPosition(glyph.baseX, glyph.baseY + bobY);
      glyph.text.setRotation(tilt);
      glyph.text.setScale(scaleBump);

      // Word 0 ("STREET") = fiery arcade gold-amber; Word 1 ("FIGHTER") = electric crimson-flame
      const baseTop = glyph.wordIndex === 0 ? 0xfffbeb : 0xffe4e6;
      const baseBottom = glyph.wordIndex === 0 ? 0xf59e0b : 0xff2a6d;
      const topColor = lerpColor(baseTop, 0xffffff, sheen);
      const bottomColor = lerpColor(baseBottom, 0xfef08a, sheen * 0.85);
      glyph.text.setTint(topColor, topColor, bottomColor, bottomColor);
    });

    if (taglineText && taglineText.alpha > 0.5) {
      const tagPulse = 0.84 + 0.16 * Math.sin(seconds * 3.1);
      taglineText.setAlpha(tagPulse);
    }
    if (taglineLeftLine && taglineRightLine) {
      const barPulse = 0.9 + 0.35 * Math.sin(seconds * 3.1);
      taglineLeftLine.setScale(barPulse, 1);
      taglineRightLine.setScale(barPulse, 1);
    }
  };

  scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);

  const destroy = (): void => {
    scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate);
    activeTweens.forEach((tween) => {
      tween.stop();
    });
    createdObjects.forEach((obj) => {
      if (obj.scene) {
        obj.destroy();
      }
    });
  };

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, destroy);

  return { destroy };
}

/**
 * Renders a pulsing arcade "PRESS ANY KEY TO BEGIN" prompt with animated side chevrons.
 */
export function createAnimatedPrompt(
  scene: Phaser.Scene,
  options: AnimatedPromptOptions
): { destroy: () => void } {
  const { x, y, label, depth = 100 } = options;

  const text = scene.add
    .text(x, y, label.toUpperCase(), {
      color: '#fef08a',
      fontFamily: '"Press Start 2P", "Silkscreen", monospace',
      fontSize: '13px',
      stroke: '#090d16',
      strokeThickness: 6
    })
    .setOrigin(0.5)
    .setDepth(depth);

  const plateWidth = Math.max(320, text.width + 88);
  const plate = scene.add
    .rectangle(x, y, plateWidth, 34, 0x070613, 0.72)
    .setStrokeStyle(2, 0xfbbf24, 0.85)
    .setDepth(depth - 1);

  const chevronOffset = text.width / 2 + 22;
  const leftChevron = scene.add
    .text(x - chevronOffset, y, '▸', {
      color: '#39ff7a',
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '14px',
      stroke: '#090d16',
      strokeThickness: 5
    })
    .setOrigin(0.5)
    .setDepth(depth);

  const rightChevron = scene.add
    .text(x + chevronOffset, y, '◂', {
      color: '#39ff7a',
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '14px',
      stroke: '#090d16',
      strokeThickness: 5
    })
    .setOrigin(0.5)
    .setDepth(depth);

  const onUpdate = (time: number): void => {
    const s = time * 0.001;
    const pulse = 0.5 + 0.5 * Math.sin(s * 4.2);
    const bounce = Math.sin(s * 6.0) * 5;

    text.setScale(0.98 + pulse * 0.04);
    text.setAlpha(0.72 + pulse * 0.28);
    plate.setStrokeStyle(2, lerpColor(0xf59e0b, 0x39ff7a, pulse), 0.7 + pulse * 0.3);

    leftChevron.setX(x - chevronOffset + bounce);
    rightChevron.setX(x + chevronOffset - bounce);
  };

  scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);

  const destroy = (): void => {
    scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate);
    [plate, text, leftChevron, rightChevron].forEach((obj) => {
      if (obj.scene) {
        obj.destroy();
      }
    });
  };

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, destroy);

  return { destroy };
}
