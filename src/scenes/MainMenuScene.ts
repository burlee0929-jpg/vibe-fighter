import * as Phaser from 'phaser';

import { createAnimatedArcadeTitle } from '../game/animatedTitle';
import { AUDIO_KEYS, playAudioCue } from '../game/core/audio';
import { GAME_TAGLINE, GAME_TITLE } from '../game/constants';
import { createTextButton, type TextButton } from '../game/ui';
import { SCENE_KEYS } from '../game/types';
import { BaseScene } from './BaseScene';

interface MenuOption {
  label: string;
  action: () => void;
}

export class MainMenuScene extends BaseScene {
  private selectedIndex = 0;

  private buttons: TextButton[] = [];

  private dividers: Phaser.GameObjects.Text[] = [];

  private options: MenuOption[] = [];

  constructor() {
    super(SCENE_KEYS.MainMenu);
  }

  create(): void {
    this.buttons = [];
    this.dividers = [];
    this.selectedIndex = 0;
    this.options = [];

    this.markActiveScene(SCENE_KEYS.MainMenu);
    this.startSceneTransition({ withMenuFx: true, fxIntensity: 'menu' });
    this.cameras.main.setBackgroundColor('rgba(0, 0, 0, 0)');
    createAnimatedArcadeTitle(this, {
      x: this.cameras.main.centerX,
      y: 54,
      title: GAME_TITLE,
      tagline: GAME_TAGLINE,
      fontSize: 34,
      taglineOffsetY: 44,
      depth: 4,
      compact: true
    });

    this.renderMenu();

    const keyUp = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    const keyDown = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN);
    const keyW = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    const keyS = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    const keyEnter = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    const keySpace = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    keyUp?.on('down', () => this.moveSelection(-1));
    keyW?.on('down', () => this.moveSelection(-1));
    keyDown?.on('down', () => this.moveSelection(1));
    keyS?.on('down', () => this.moveSelection(1));
    keyEnter?.on('down', () => this.confirmOption(this.options[this.selectedIndex]));
    keySpace?.on('down', () => this.confirmOption(this.options[this.selectedIndex]));

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.clearButtons();
      this.selectedIndex = 0;
      this.options = [];
    });

    this.createFooterHint('Arrow keys / WASD to navigate • Enter / Space to confirm');
  }

  private moveSelection(direction: number): void {
    const next = Phaser.Math.Wrap(this.selectedIndex + direction, 0, this.buttons.length);
    this.setSelection(next);
  }

  private setSelection(index: number): void {
    this.selectedIndex = index;
    this.buttons.forEach((button, buttonIndex) => {
      button.setSelected(buttonIndex === index);
    });
  }

  private renderMenu(): void {
    this.clearButtons();

    const playOption: MenuOption = { label: 'PLAY', action: () => this.scene.start(SCENE_KEYS.ModeSelect) };
    const settingsOption: MenuOption = { label: 'SETTINGS', action: () => this.scene.start(SCENE_KEYS.Settings) };
    this.options = [playOption, settingsOption];

    const startY = 268;
    const spacing = 82;
    let row = 0;

    const layoutButton = (option: MenuOption, optionIndex: number): void => {
      const button = createTextButton(this, {
        x: this.cameras.main.centerX,
        y: startY + row * spacing,
        width: 380,
        height: 62,
        label: option.label,
        entranceDelay: 120 + row * 90,
        onClick: () => this.confirmOption(option),
        onHover: () => this.setSelection(optionIndex)
      });

      this.buttons.push(button);
      row += 1;
    };

    layoutButton(playOption, 0);
    layoutButton(settingsOption, 1);

    this.setSelection(0);
  }


  private clearButtons(): void {
    this.buttons.forEach((button) => {
      button.destroy();
    });
    this.buttons = [];
    this.dividers.forEach((divider) => {
      divider.destroy();
    });
    this.dividers = [];
  }

  private confirmOption(option?: MenuOption): void {
    if (!option) {
      return;
    }

    playAudioCue(this, AUDIO_KEYS.uiConfirm, this.app.settingsStore.getState());
    option.action();
  }
}
