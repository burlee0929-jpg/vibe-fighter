import * as Phaser from 'phaser';

import { getAppContext } from '../game/context';
import type { AppContext } from '../game/context';
import { syncSceneBackgroundMusic } from '../game/fightMusic';
import { createMenuAmbientFx } from '../game/menuFx';
import { SCENE_KEYS, type SceneKey } from '../game/types';

export abstract class BaseScene extends Phaser.Scene {
  protected get app(): AppContext {
    return getAppContext();
  }

  protected markActiveScene(sceneKey: SceneKey): void {
    this.app.debugStore.patchState({ activeScene: sceneKey });
    syncSceneBackgroundMusic(sceneKey, this.app.settingsStore);
  }

  protected startSceneTransition(
    options: { withMenuFx?: boolean; fxIntensity?: 'splash' | 'menu' } = {}
  ): void {
    this.cameras.main.fadeIn(240, 2, 6, 23);

    if (options.withMenuFx) {
      createMenuAmbientFx(this, { intensity: options.fxIntensity ?? 'menu', depth: 1 });
    }
  }

  protected createHeading(title: string, subtitle: string): void {
    const { centerX } = this.cameras.main;

    const heading = this.add
      .text(centerX, 42, title.toUpperCase(), {
        color: '#fef08a',
        fontFamily: '"Press Start 2P", "Silkscreen", monospace',
        fontSize: '26px',
        stroke: '#090d16',
        strokeThickness: 6
      })
      .setOrigin(0.5)
      .setDepth(5)
      .setAlpha(0);

    this.tweens.add({
      targets: heading,
      y: 56,
      alpha: 1,
      duration: 280,
      ease: 'Back.easeOut'
    });

    const accentRule = this.add
      .rectangle(centerX, 76, Math.min(540, Math.max(240, heading.width + 48)), 2, 0xfbbf24, 0.78)
      .setDepth(5)
      .setScale(0, 1);

    this.tweens.add({
      targets: accentRule,
      scaleX: 1,
      duration: 340,
      delay: 60,
      ease: 'Cubic.easeOut'
    });

    if (subtitle) {
      const sub = this.add
        .text(centerX, 108, subtitle, {
          color: '#7dd3fc',
          fontFamily: '"Silkscreen", monospace',
          fontSize: '14px',
          stroke: '#090d16',
          strokeThickness: 4
        })
        .setOrigin(0.5)
        .setDepth(5)
        .setAlpha(0);

      this.tweens.add({
        targets: sub,
        y: 96,
        alpha: 1,
        duration: 280,
        delay: 90,
        ease: 'Cubic.easeOut'
      });
    }
  }

  protected createFooterHint(text: string): void {
    const { centerX, height } = this.cameras.main;

    const hint = this.add
      .text(centerX, height - 28, text, {
        color: '#e2e8f0',
        fontFamily: '"Silkscreen", monospace',
        fontSize: '13px',
        stroke: '#090d16',
        strokeThickness: 4
      })
      .setOrigin(0.5)
      .setDepth(100)
      .setAlpha(0);

    this.tweens.add({
      targets: hint,
      alpha: 1,
      duration: 320,
      delay: 140,
      ease: 'Quad.easeOut'
    });
  }

  protected goToMenu(): void {
    this.scene.start(SCENE_KEYS.MainMenu);
  }
}
