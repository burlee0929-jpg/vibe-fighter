import { createAnimatedArcadeTitle, createAnimatedPrompt } from '../game/animatedTitle';
import { AUDIO_KEYS, playAudioCue } from '../game/core/audio';
import { GAME_TAGLINE, GAME_TITLE } from '../game/constants';
import { SCENE_KEYS } from '../game/types';
import { BaseScene } from './BaseScene';

export class SplashScene extends BaseScene {
  private hasAdvanced = false;

  constructor() {
    super(SCENE_KEYS.Splash);
  }

  create(): void {
    this.hasAdvanced = false;
    this.markActiveScene(SCENE_KEYS.Splash);
    this.startSceneTransition({ withMenuFx: true, fxIntensity: 'splash' });

    const camera = this.cameras.main;
    camera.setBackgroundColor('rgba(0, 0, 0, 0)');

    createAnimatedArcadeTitle(this, {
      x: camera.centerX,
      y: 108,
      title: GAME_TITLE,
      tagline: GAME_TAGLINE,
      fontSize: 50,
      taglineOffsetY: 58,
      depth: 4
    });

    createAnimatedPrompt(this, {
      x: camera.centerX,
      y: camera.height - 40,
      label: this.app.isMobileShell ? 'Tap screen to begin' : 'Press any key to begin',
      depth: 100
    });

    const advanceToMenu = (): void => {
      if (this.hasAdvanced) {
        return;
      }

      this.hasAdvanced = true;
      playAudioCue(this, AUDIO_KEYS.uiConfirm, this.app.settingsStore.getState());
      this.scene.start(SCENE_KEYS.MainMenu);
    };

    this.input.once('pointerup', advanceToMenu);
    this.input.keyboard?.once('keydown', advanceToMenu);
  }
}
