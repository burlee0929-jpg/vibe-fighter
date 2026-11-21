import * as Phaser from 'phaser';

import { getHeroAbilityKit } from '../game/abilities';
import { AUDIO_KEYS, playAudioCue } from '../game/core/audio';
import { FIGHTER_CHARACTER_DEFINITIONS } from '../game/hero';
import { MY_FIGHTER_IDS } from '../game/myFighterLoader';
import { createSelectionCard, type SelectionCard } from '../game/ui';
import { SCENE_KEYS, type MatchMode } from '../game/types';
import { BaseScene } from './BaseScene';

interface CharacterSelectData {
  mode: MatchMode;
  stageId: string;
}

const P1_COLOR = 0x38bdf8;
const P2_COLOR = 0xf43f5e;

const SELECTABLE_FIGHTER_IDS = [
  ...MY_FIGHTER_IDS,
  'vessel-yuji',
  'restless-gambler',
  'hero-hunter',
  'sukuna',
  'gojo',
  'naruto',
  'cyber-ronin',
  'goku',
  'frost-queen',
  'red-brawler',
  'green-boxer',
  'jiujitsu-fighter',
  'bayasaa'
];
const SELECTABLE_ROSTER = SELECTABLE_FIGHTER_IDS.flatMap((id) =>
  FIGHTER_CHARACTER_DEFINITIONS.filter((character) => character.id === id)
);

const GRID_COLS = 5;
const CARD_WIDTH = 166;
const CARD_HEIGHT = 136;
const COL_GAP = 22;
const ROW_GAP = 26;
const FIRST_ROW_Y = 200;

interface PlayerCursor {
  index: number;
  locked: boolean;
  outline: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
}

/**
 * Final step of the Play flow: pick fighters from the full roster grid. In 1v1
 * both players drive their own cursor (P1 = WASD + Space, P2 = Arrows + Enter)
 * and cannot land on the other's pick. In 1vCPU the player picks freely and the
 * CPU auto-selects a different fighter.
 */
export class CharacterSelectScene extends BaseScene {
  private mode: MatchMode = '1v1';
  private stageId = '';
  private cards: SelectionCard[] = [];
  private cardPositions: Array<{ x: number; y: number }> = [];
  private p1!: PlayerCursor;
  private p2!: PlayerCursor;
  private previewBg!: Phaser.GameObjects.Rectangle;
  private previewText!: Phaser.GameObjects.Text;
  private transitioning = false;

  constructor() {
    super(SCENE_KEYS.CharacterSelect);
  }

  init(data: CharacterSelectData): void {
    this.mode = data?.mode ?? '1v1';
    this.stageId = data?.stageId ?? '';
  }

  create(): void {
    this.cards = [];
    this.cardPositions = [];
    this.transitioning = false;

    this.markActiveScene(SCENE_KEYS.CharacterSelect);
    this.startSceneTransition({ withMenuFx: true, fxIntensity: 'menu' });
    this.cameras.main.setBackgroundColor('rgba(0, 0, 0, 0)');
    this.createHeading(
      'Select Fighter',
      this.mode === '1v1' ? 'P1 = WASD + Space   •   P2 = Arrows + Enter' : 'WASD / Arrows to choose • Enter or Click to confirm'
    );

    this.buildCards();
    this.buildPreviewBar();
    this.buildCursors();
    this.registerInput();

    this.createFooterHint('Esc to go back');

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.cards.forEach((card) => card.destroy());
      this.cards = [];
    });
  }

  private buildCards(): void {
    const { centerX } = this.cameras.main;
    const roster = SELECTABLE_ROSTER;
    const cols = Math.min(GRID_COLS, Math.max(1, roster.length));

    roster.forEach((character, index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;
      const itemsInRow = Math.min(cols, roster.length - row * cols);
      const rowWidth = CARD_WIDTH * itemsInRow + COL_GAP * (itemsInRow - 1);
      const startX = centerX - rowWidth / 2 + CARD_WIDTH / 2;
      const x = startX + col * (CARD_WIDTH + COL_GAP);
      const y = FIRST_ROW_Y + row * (CARD_HEIGHT + ROW_GAP);

      this.cardPositions.push({ x, y });
      const kit = getHeroAbilityKit(character.id);

      const card = createSelectionCard(this, {
        x,
        y,
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        title: character.label,
        subtitle: kit.ability4.name,
        titleFontSize: '14px',
        texture: this.textures.exists(character.portrait.key) ? character.portrait.key : undefined,
        imageMaxSize: 70,
        imageOffsetY: -22,
        entranceDelay: index * 24,
        onHover: () => this.hoverCard(index),
        onClick: () => this.clickCard(index)
      });

      this.cards.push(card);
    });
  }

  private buildPreviewBar(): void {
    const { centerX } = this.cameras.main;
    this.previewBg = this.add
      .rectangle(centerX, 636, 1140, 48, 0x0f172a, 0.92)
      .setStrokeStyle(2, 0x334155, 1)
      .setDepth(15);

    this.previewText = this.add
      .text(centerX, 636, '', {
        color: '#f8fafc',
        fontFamily: 'monospace',
        fontSize: '13px',
        align: 'center',
        lineSpacing: 4
      })
      .setOrigin(0.5)
      .setDepth(16);
  }

  private updatePreview(): void {
    const p1Char = SELECTABLE_ROSTER[this.p1.index];
    if (!p1Char || !this.previewText) {
      return;
    }

    const formatKit = (prefix: string, id: string, label: string): string => {
      const kit = getHeroAbilityKit(id);
      return `${prefix} ${label.toUpperCase()}:  [M1] ${kit.m1.moves[3]}  •  [1/Q] ${kit.ability1.name}  •  [2/E] ${kit.ability2.name}  •  [3/R] ${kit.ability3.name}  •  [4/T] ${kit.ability4.name}`;
    };

    const p1Kit = getHeroAbilityKit(p1Char.id);
    this.previewBg.setStrokeStyle(2, p1Kit.themeColor, 1);

    if (this.mode === '1v1') {
      const p2Char = SELECTABLE_ROSTER[this.p2.index];
      const line1 = formatKit('P1', p1Char.id, p1Char.label);
      const line2 = p2Char ? formatKit('P2', p2Char.id, p2Char.label) : '';
      this.previewText.setText(line2 ? `${line1}\n${line2}` : line1);
      this.previewText.setFontSize('12px');
    } else {
      this.previewText.setText(formatKit('ABILITIES —', p1Char.id, p1Char.label));
      this.previewText.setFontSize('13.5px');
    }

    this.previewText.setScale(0.96);
    this.tweens.add({ targets: this.previewText, scale: 1, duration: 130, ease: 'Back.easeOut' });
  }

  private buildCursors(): void {
    this.p1 = this.createCursor('P1', P1_COLOR, 0);
    const p2Start = this.mode === '1v1' ? Math.min(1, this.cards.length - 1) : 0;
    this.p2 = this.createCursor('P2', P2_COLOR, p2Start);

    if (this.mode === '1vcpu') {
      this.p2.outline.setVisible(false);
      this.p2.label.setVisible(false);
    }

    this.refreshCursor(this.p1, true);
    this.refreshCursor(this.p2, true);
    this.updatePreview();

    const onUpdate = (time: number): void => {
      const s = time * 0.001;
      const pulseScale = 1.05 + 0.03 * Math.sin(s * 6);
      const bob = Math.sin(s * 5) * 3;
      const pos1 = this.cardPositions[this.p1.index];
      if (pos1) {
        this.p1.outline.setScale(this.p1.locked ? 1.08 : pulseScale);
        this.p1.label.setY(pos1.y - CARD_HEIGHT / 2 - 15 + (this.p1.locked ? 0 : bob));
      }
      const pos2 = this.cardPositions[this.p2.index];
      if (pos2 && this.p2.outline.visible) {
        this.p2.outline.setScale(this.p2.locked ? 1.08 : pulseScale);
        this.p2.label.setY(pos2.y - CARD_HEIGHT / 2 - 15 + (this.p2.locked ? 0 : -bob));
      }
    };

    this.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.UPDATE, onUpdate);
    });
  }

  private createCursor(label: string, color: number, index: number): PlayerCursor {
    const outline = this.add
      .rectangle(0, 0, CARD_WIDTH + 14, CARD_HEIGHT + 14, color, 0)
      .setStrokeStyle(4, color, 1)
      .setDepth(20);

    const text = this.add
      .text(0, 0, label, {
        color: '#020617',
        backgroundColor: colorToCss(color),
        fontFamily: '"Silkscreen", monospace',
        fontSize: '14px',
        fontStyle: 'bold',
        padding: { x: 8, y: 2 }
      })
      .setOrigin(0.5)
      .setDepth(21);

    return { index, locked: false, outline, label: text };
  }

  private refreshCursor(cursor: PlayerCursor, instant = false): void {
    const position = this.cardPositions[cursor.index];
    if (!position) {
      return;
    }

    cursor.outline.setStrokeStyle(cursor.locked ? 7 : 4, cursor.outline.strokeColor, 1);
    if (instant) {
      cursor.outline.setPosition(position.x, position.y);
      cursor.label.setPosition(position.x, position.y - CARD_HEIGHT / 2 - 15);
      return;
    }

    this.tweens.add({
      targets: cursor.outline,
      x: position.x,
      y: position.y,
      duration: 110,
      ease: 'Cubic.easeOut'
    });
    this.tweens.add({
      targets: cursor.label,
      x: position.x,
      duration: 110,
      ease: 'Cubic.easeOut'
    });
  }

  private registerInput(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      return;
    }

    if (this.mode === '1v1') {
      keyboard.on('keydown-A', () => this.movePlayer(this.p1, -1));
      keyboard.on('keydown-D', () => this.movePlayer(this.p1, 1));
      keyboard.on('keydown-W', () => this.movePlayer(this.p1, -GRID_COLS));
      keyboard.on('keydown-S', () => this.movePlayer(this.p1, GRID_COLS));
      keyboard.on('keydown-LEFT', () => this.movePlayer(this.p2, -1));
      keyboard.on('keydown-RIGHT', () => this.movePlayer(this.p2, 1));
      keyboard.on('keydown-UP', () => this.movePlayer(this.p2, -GRID_COLS));
      keyboard.on('keydown-DOWN', () => this.movePlayer(this.p2, GRID_COLS));
      keyboard.on('keydown-SPACE', () => this.confirmPlayer(this.p1));
      keyboard.on('keydown-F', () => this.confirmPlayer(this.p1));
      keyboard.on('keydown-ENTER', () => this.confirmPlayer(this.p2));
    } else {
      const moveLeft = (): void => this.movePlayer(this.p1, -1);
      const moveRight = (): void => this.movePlayer(this.p1, 1);
      const moveUp = (): void => this.movePlayer(this.p1, -GRID_COLS);
      const moveDown = (): void => this.movePlayer(this.p1, GRID_COLS);
      keyboard.on('keydown-A', moveLeft);
      keyboard.on('keydown-LEFT', moveLeft);
      keyboard.on('keydown-D', moveRight);
      keyboard.on('keydown-RIGHT', moveRight);
      keyboard.on('keydown-W', moveUp);
      keyboard.on('keydown-UP', moveUp);
      keyboard.on('keydown-S', moveDown);
      keyboard.on('keydown-DOWN', moveDown);
      keyboard.on('keydown-SPACE', () => this.confirmPlayer(this.p1));
      keyboard.on('keydown-F', () => this.confirmPlayer(this.p1));
      keyboard.on('keydown-ENTER', () => this.confirmPlayer(this.p1));
    }

    keyboard.on('keydown-ESC', () => this.goBack());
    keyboard.on('keydown-BACKSPACE', () => this.goBack());
  }

  /**
   * Moves a player's cursor by `delta` steps in the roster grid. In 1v1 the two
   * cursors never occupy the same card: if the target slot holds the opponent,
   * the cursor hops over it (or swaps if both are unlocked).
   */
  private movePlayer(cursor: PlayerCursor, delta: number): void {
    if (this.transitioning || cursor.locked) {
      return;
    }

    const count = this.cards.length;
    const other = this.otherCursor(cursor);
    let next = Phaser.Math.Wrap(cursor.index + delta, 0, count);

    if (this.mode === '1v1' && next === other.index) {
      const skip = Phaser.Math.Wrap(next + delta, 0, count);

      if (skip !== cursor.index) {
        next = skip;
      } else if (!other.locked) {
        other.index = cursor.index;
        cursor.index = next;
        this.refreshCursor(cursor);
        this.refreshCursor(other);
        this.updatePreview();
        return;
      } else {
        return;
      }
    }

    cursor.index = next;
    this.refreshCursor(cursor);
    this.updatePreview();
  }

  private otherCursor(cursor: PlayerCursor): PlayerCursor {
    return cursor === this.p1 ? this.p2 : this.p1;
  }

  private hoverCard(index: number): void {
    if (this.transitioning || this.mode !== '1vcpu' || this.p1.locked) {
      return;
    }

    this.p1.index = index;
    this.refreshCursor(this.p1);
    this.updatePreview();
  }

  private clickCard(index: number): void {
    if (this.transitioning) {
      return;
    }

    if (this.mode === '1vcpu') {
      this.p1.index = index;
      this.refreshCursor(this.p1);
      this.updatePreview();
      this.confirmPlayer(this.p1);
    }
  }

  /**
   * Locks a player's current pick with a flash. In 1v1 the match starts once
   * both players have locked; in 1vCPU locking the player triggers the CPU pick.
   */
  private confirmPlayer(cursor: PlayerCursor): void {
    if (this.transitioning || cursor.locked) {
      return;
    }

    cursor.locked = true;
    this.refreshCursor(cursor);
    playAudioCue(this, AUDIO_KEYS.uiConfirm, this.app.settingsStore.getState());

    this.cards[cursor.index].flashLock(() => {
      if (this.mode === '1vcpu') {
        this.runCpuSelection();
        return;
      }

      if (this.p1.locked && this.p2.locked) {
        this.startMatch();
      }
    });
  }

  private runCpuSelection(): void {
    if (this.transitioning) {
      return;
    }

    this.transitioning = true;

    const choices = this.cards.map((_, index) => index).filter((index) => index !== this.p1.index);
    const cpuIndex = choices.length > 0 ? Phaser.Math.RND.pick(choices) : this.p1.index;

    this.p2.index = cpuIndex;
    this.p2.outline.setVisible(true);
    this.p2.label.setVisible(true);
    this.p2.label.setText('CPU');
    this.refreshCursor(this.p2);

    this.time.delayedCall(450, () => {
      this.p2.locked = true;
      this.refreshCursor(this.p2);
      playAudioCue(this, AUDIO_KEYS.uiConfirm, this.app.settingsStore.getState());
      this.cards[cpuIndex].flashLock(() => this.startMatch());
    });
  }

  private startMatch(): void {
    if (this.transitioning && this.mode === '1v1') {
      return;
    }

    this.transitioning = true;
    const roster = SELECTABLE_ROSTER;

    this.scene.start(SCENE_KEYS.Match, {
      mode: this.mode,
      stageId: this.stageId,
      p1CharacterId: roster[this.p1.index].id,
      p2CharacterId: roster[this.p2.index].id
    });
  }

  private goBack(): void {
    if (this.transitioning) {
      return;
    }

    this.scene.start(SCENE_KEYS.LevelSelect, { mode: this.mode });
  }
}

/**
 * Convert a 24-bit colour integer to a CSS hex string.
 * @param color - The colour as 0xRRGGBB.
 */
function colorToCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
