import * as Phaser from 'phaser';

import { getAppContext } from './context';
import { playUiHoverSound } from './core/audio';
import { spawnBurstSparks } from './menuFx';

export interface TextButton {
  group: Phaser.GameObjects.Container;
  setSelected(selected: boolean): void;
  destroy(): void;
}

interface TextButtonConfig {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  entranceDelay?: number;
  onClick(): void;
  onHover?(): void;
}

export function createTextButton(scene: Phaser.Scene, config: TextButtonConfig): TextButton {
  const background = scene.add.image(0, 0, 'ui-button');
  const label = scene.add.text(0, 0, config.label, {
    color: '#e2e8f0',
    fontFamily: '"Silkscreen", "Press Start 2P", monospace',
    fontSize: '20px',
    stroke: '#090d16',
    strokeThickness: 5
  });

  background.setDisplaySize(config.width, config.height);
  background.setInteractive({ useHandCursor: true });
  label.setOrigin(0.5);

  const group = scene.add.container(config.x, config.y, [background, label]).setDepth(5);
  let isSelected = false;
  let scaleTween: Phaser.Tweens.Tween | null = null;

  group.setScale(0.84).setAlpha(0);
  scene.tweens.add({
    targets: group,
    scale: isSelected ? 1.05 : 1,
    alpha: 1,
    duration: 280,
    delay: config.entranceDelay ?? 0,
    ease: 'Back.easeOut'
  });

  const setSelected = (selected: boolean): void => {
    const changed = isSelected !== selected;
    isSelected = selected;
    background.setTexture(selected ? 'ui-button-active' : 'ui-button');
    label.setColor(selected ? '#fef08a' : '#e2e8f0');

    if (changed && group.scene && group.alpha > 0.2) {
      scaleTween?.stop();
      scaleTween = scene.tweens.add({
        targets: group,
        scale: selected ? 1.05 : 1,
        duration: 150,
        ease: 'Back.easeOut'
      });
    }
  };

  background.on('pointerover', () => {
    playUiHoverSound(getAppContext().settingsStore.getState());
    config.onHover?.();
  });
  background.on('pointerdown', () => {
    scaleTween?.stop();
    group.setScale(0.95);
    scaleTween = scene.tweens.add({
      targets: group,
      scale: isSelected ? 1.05 : 1,
      duration: 140,
      ease: 'Back.easeOut'
    });
    config.onClick();
  });

  setSelected(false);

  return {
    group,
    setSelected,
    destroy: () => {
      scaleTween?.stop();
      group.destroy(true);
    }
  };
}

export interface SelectionCard {
  container: Phaser.GameObjects.Container;
  setSelected(selected: boolean, accent?: number): void;
  setDimmed(dimmed: boolean): void;
  flashLock(onComplete: () => void): void;
  destroy(): void;
}

export interface SelectionCardConfig {
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  subtitle?: string;
  texture?: string;
  /** Max width/height (px) for the card image; defaults to fitting the card. */
  imageMaxSize?: number;
  /** Vertical offset of the image centre from the card centre. */
  imageOffsetY?: number;
  /** Optional font size for the card title (defaults to '20px'). */
  titleFontSize?: string;
  entranceDelay?: number;
  onClick?: () => void;
  onHover?: () => void;
}

const CARD_BASE_STROKE = 0x334155;

/**
 * Create a selectable card: a framed panel with an optional image, a title and
 * subtitle, plus selection highlighting and a lock-in flash. Used by the level
 * and character select screens.
 * @param scene - The owning scene.
 * @param config - Card geometry, labels, optional image, and callbacks.
 * @returns A {@link SelectionCard} handle.
 */
export function createSelectionCard(scene: Phaser.Scene, config: SelectionCardConfig): SelectionCard {
  const glow = scene.add
    .rectangle(0, 0, config.width + 10, config.height + 10, 0x38bdf8, 0)
    .setBlendMode(Phaser.BlendModes.ADD);

  const background = scene.add
    .rectangle(0, 0, config.width, config.height, 0x0f172a, 0.92)
    .setStrokeStyle(2, CARD_BASE_STROKE, 1);

  const children: Phaser.GameObjects.GameObject[] = [glow, background];

  if (config.texture) {
    const image = scene.add.image(0, config.imageOffsetY ?? -18, config.texture).setOrigin(0.5);
    const maxSize = config.imageMaxSize ?? Math.min(config.width - 24, config.height - 80);
    const sourceSize = Math.max(image.width, image.height) || maxSize;
    image.setScale(maxSize / sourceSize);
    children.push(image);
  }

  const subtitleY = config.height / 2 - 18;
  const titleY = config.subtitle ? subtitleY - 22 : subtitleY;

  const title = scene.add
    .text(0, titleY, config.title, {
      color: '#f8fafc',
      fontFamily: '"Silkscreen", monospace',
      fontSize: config.titleFontSize ?? '19px',
      stroke: '#090d16',
      strokeThickness: 4,
      align: 'center'
    })
    .setOrigin(0.5);
  children.push(title);

  if (config.subtitle) {
    const subtitle = scene.add
      .text(0, subtitleY, config.subtitle, {
        color: '#94a3b8',
        fontFamily: '"Silkscreen", monospace',
        fontSize: '12px',
        align: 'center'
      })
      .setOrigin(0.5);
    children.push(subtitle);
  }

  const flash = scene.add
    .rectangle(0, 0, config.width, config.height, 0xffffff, 0)
    .setOrigin(0.5);
  children.push(flash);

  const container = scene.add.container(config.x, config.y + 18, children).setDepth(5);
  let isSelected = false;
  let scaleTween: Phaser.Tweens.Tween | null = null;
  let entered = false;

  container.setScale(0.88).setAlpha(0);
  scene.tweens.add({
    targets: container,
    y: config.y,
    scale: isSelected ? 1.06 : 1,
    alpha: 1,
    duration: 280,
    delay: config.entranceDelay ?? 0,
    ease: 'Back.easeOut',
    onComplete: () => {
      entered = true;
    }
  });

  background.setInteractive({ useHandCursor: true });
  background.on('pointerover', () => {
    playUiHoverSound(getAppContext().settingsStore.getState());
    config.onHover?.();
  });
  background.on('pointerdown', () => config.onClick?.());

  const setSelected = (selected: boolean, accent: number = 0x38bdf8): void => {
    const changed = isSelected !== selected;
    isSelected = selected;
    background.setStrokeStyle(selected ? 4 : 2, selected ? accent : CARD_BASE_STROKE, 1);
    glow.setFillStyle(accent, selected ? 0.16 : 0);
    title.setColor(selected ? '#fef08a' : '#f8fafc');

    if (changed && entered && container.scene) {
      scaleTween?.stop();
      scaleTween = scene.tweens.add({
        targets: container,
        scale: selected ? 1.06 : 1,
        duration: 160,
        ease: 'Back.easeOut'
      });
    }
  };

  const setDimmed = (dimmed: boolean): void => {
    container.setAlpha(dimmed ? 0.4 : 1);
  };

  const flashLock = (onComplete: () => void): void => {
    spawnBurstSparks(scene, container.x, container.y, 0xfef08a, 12, 25, 1);
    scene.tweens.add({
      targets: container,
      scale: 1.12,
      duration: 120,
      yoyo: true,
      ease: 'Quad.easeOut'
    });
    scene.tweens.add({
      targets: flash,
      alpha: { from: 0, to: 0.85 },
      duration: 90,
      yoyo: true,
      repeat: 3,
      onComplete: () => {
        flash.setAlpha(0);
        onComplete();
      }
    });
  };

  setSelected(false);

  return {
    container,
    setSelected,
    setDimmed,
    flashLock,
    destroy: () => {
      scaleTween?.stop();
      container.destroy(true);
    }
  };
}
