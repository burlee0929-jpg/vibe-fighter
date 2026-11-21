import * as Phaser from 'phaser';

import { AUDIO_KEYS, playAudioCue } from '../game/core/audio';
import { STAGE_DEFINITIONS } from '../game/stageConfig';
import { createSelectionCard, type SelectionCard } from '../game/ui';
import { SCENE_KEYS, type MatchMode } from '../game/types';
import { BaseScene } from './BaseScene';

interface LevelSelectData {
  mode: MatchMode;
}

const DEFAULT_ACCENT = 0xfacc15;
const GRID_COLS = 5;
const CARD_WIDTH = 216;
const CARD_HEIGHT = 186;
const COL_GAP = 22;
const ROW_GAP = 32;
const FIRST_ROW_Y = 236;

/**
 * Second step of the Play flow: pick the stage for the match from the 10-map
 * arcade grid and forward the selection to character select.
 */
export class LevelSelectScene extends BaseScene {
  private mode: MatchMode = '1v1';
  private cards: SelectionCard[] = [];
  private selectedIndex = 0;
  private previewBg!: Phaser.GameObjects.Rectangle;
  private previewText!: Phaser.GameObjects.Text;

  constructor() {
    super(SCENE_KEYS.LevelSelect);
  }

  init(data: LevelSelectData): void {
    this.mode = data?.mode ?? '1v1';
  }

  create(): void {
    this.cards = [];
    this.selectedIndex = 0;

    this.markActiveScene(SCENE_KEYS.LevelSelect);
    this.startSceneTransition({ withMenuFx: true, fxIntensity: 'menu' });
    this.cameras.main.setBackgroundColor('rgba(0, 0, 0, 0)');
    this.createHeading(
      `Select Stage (${STAGE_DEFINITIONS.length} Arenas)`,
      this.mode === '1v1' ? '1 vs 1' : '1 vs CPU'
    );

    this.buildCards();
    this.buildPreviewBar();
    this.registerInput();
    this.setSelection(0);

    this.createFooterHint('WASD / Arrows to choose • Enter / Space or Click to confirm • Esc to go back');

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.cards.forEach((card) => card.destroy());
      this.cards = [];
    });
  }

  private buildCards(): void {
    const { centerX } = this.cameras.main;
    const cols = Math.min(GRID_COLS, Math.max(1, STAGE_DEFINITIONS.length));

    STAGE_DEFINITIONS.forEach((stage, index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;
      const itemsInRow = Math.min(cols, STAGE_DEFINITIONS.length - row * cols);
      const rowWidth = CARD_WIDTH * itemsInRow + COL_GAP * (itemsInRow - 1);
      const startX = centerX - rowWidth / 2 + CARD_WIDTH / 2;
      const x = startX + col * (CARD_WIDTH + COL_GAP);
      const y = FIRST_ROW_Y + row * (CARD_HEIGHT + ROW_GAP);

      const card = createSelectionCard(this, {
        x,
        y,
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        title: stage.label,
        subtitle: stage.subtitle,
        titleFontSize: '15px',
        texture: this.textures.exists(stage.key) ? stage.key : undefined,
        imageMaxSize: CARD_WIDTH - 24,
        imageOffsetY: -28,
        entranceDelay: index * 32,
        onHover: () => this.setSelection(index),
        onClick: () => this.confirm(index)
      });

      this.cards.push(card);
    });
  }

  private buildPreviewBar(): void {
    const { centerX } = this.cameras.main;
    this.previewBg = this.add
      .rectangle(centerX, 616, 1140, 44, 0x0f172a, 0.92)
      .setStrokeStyle(2, DEFAULT_ACCENT, 1)
      .setDepth(15);

    this.previewText = this.add
      .text(centerX, 616, '', {
        color: '#f8fafc',
        fontFamily: 'monospace',
        fontSize: '14px',
        align: 'center'
      })
      .setOrigin(0.5)
      .setDepth(16);
  }

  private registerInput(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      return;
    }

    keyboard.on('keydown-LEFT', () => this.moveSelection(-1));
    keyboard.on('keydown-A', () => this.moveSelection(-1));
    keyboard.on('keydown-RIGHT', () => this.moveSelection(1));
    keyboard.on('keydown-D', () => this.moveSelection(1));
    keyboard.on('keydown-UP', () => this.moveSelection(-GRID_COLS));
    keyboard.on('keydown-W', () => this.moveSelection(-GRID_COLS));
    keyboard.on('keydown-DOWN', () => this.moveSelection(GRID_COLS));
    keyboard.on('keydown-S', () => this.moveSelection(GRID_COLS));
    keyboard.on('keydown-ENTER', () => this.confirm(this.selectedIndex));
    keyboard.on('keydown-SPACE', () => this.confirm(this.selectedIndex));
    keyboard.on('keydown-ESC', () => this.scene.start(SCENE_KEYS.ModeSelect));
    keyboard.on('keydown-BACKSPACE', () => this.scene.start(SCENE_KEYS.ModeSelect));
  }

  private moveSelection(delta: number): void {
    const next = Phaser.Math.Wrap(this.selectedIndex + delta, 0, this.cards.length);
    this.setSelection(next);
  }

  private setSelection(index: number): void {
    this.selectedIndex = index;
    const stage = STAGE_DEFINITIONS[index];
    const accent = stage?.themeColor ?? DEFAULT_ACCENT;
    this.cards.forEach((card, cardIndex) => card.setSelected(cardIndex === index, accent));

    if (stage && this.previewBg && this.previewText) {
      this.previewBg.setStrokeStyle(2, accent, 1);
      const subtitle = stage.subtitle ? ` — ${stage.subtitle}` : '';
      this.previewText.setText(`ARENA ${index + 1}/${STAGE_DEFINITIONS.length}: ${stage.label.toUpperCase()}${subtitle}`);
      this.previewText.setScale(0.95);
      this.tweens.add({ targets: this.previewText, scale: 1, duration: 140, ease: 'Back.easeOut' });
    }
  }

  private confirm(index: number): void {
    this.setSelection(index);
    playAudioCue(this, AUDIO_KEYS.uiConfirm, this.app.settingsStore.getState());
    this.scene.start(SCENE_KEYS.CharacterSelect, {
      mode: this.mode,
      stageId: STAGE_DEFINITIONS[index].id
    });
  }
}
