import * as Phaser from 'phaser';

import { getHeroAbilityKit } from './abilities';
import { getAppContext } from './context';
import { playUiHoverSound } from './core/audio';
import type { FighterAbilityState, FighterM1State } from './fighter';
import { FIGHTING_UI_ATLAS_TEXTURE_KEY, getFightingUiAtlasFrame } from './fightingUiAtlas';
import { getCharacterDefinition } from './hero';
import type { MatchMode } from './types';

const KEY = FIGHTING_UI_ATLAS_TEXTURE_KEY;

// Display sizing (screen pixels) for each atlas element.
const PAD = 20;
const TOP = 16;
const PORTRAIT_DISP = 96;
const HEALTH_DISP_W = 468;
const HEALTH_DISP_H = 88;
const NAME_DISP_W = 300;
const NAME_DISP_H = 33;
const TIMER_DISP_W = 96;
const TIMER_DISP_H = 94;
const PIP_DISP_H = 20;

// Special-meter bar (drawn below the win pips).
const METER_DISP_W = 280;
const METER_DISP_H = 12;
const METER_TRACK_COLOR = 0x0b1120;
const METER_FILL_COLOR = 0x38bdf8;
const METER_READY_COLOR = 0xfacc15;

// Ability + M1 bar geometry (anchored at the bottom foreground strip).
const ABILITY_CARD_W = 106;
const ABILITY_CARD_H = 54;
const ABILITY_CARD_GAP = 6;
const ABILITY_BOTTOM_OFFSET = 64;

// Health colour thresholds (fraction of max).
const HEALTH_WARN = 0.5;
const HEALTH_DANGER = 0.25;

// How far above its resting position the HUD starts before the intro slide.
const SLIDE_OFFSET = 170;

/** Geometry of a health-fill region in screen space, plus its drain anchor. */
interface FillGeometry {
  anchorX: number;
  topY: number;
  width: number;
  height: number;
  originX: 0 | 1;
}

/** Geometry of a special-meter fill region in screen space. */
interface MeterGeometry {
  anchorX: number;
  topY: number;
  width: number;
  height: number;
  originX: 0 | 1;
}

interface AbilityCardWidget {
  slot: 0 | 1 | 2 | 3 | 4;
  themeColor: number;
  bg: Phaser.GameObjects.Rectangle;
  barFill: Phaser.GameObjects.Rectangle;
  keyBadge: Phaser.GameObjects.Text;
  notationText: Phaser.GameObjects.Text;
  nameText: Phaser.GameObjects.Text;
  statusText: Phaser.GameObjects.Text;
}

export interface MatchHudConfig {
  mode: MatchMode;
  p1CharacterId: string;
  p2CharacterId: string;
  roundsToWin: number;
  depth: number;
  onAbilityClick?: (slot: 1 | 2 | 3 | 4) => void;
  onM1Click?: () => void;
}

/**
 * The in-match heads-up display built from the fighting UI atlas: portrait
 * frames, color-coded health bars, a centre timer, name plates, and round-win
 * pips. The whole HUD slides in and the health bars fill on round start; bars
 * recolor (green/yellow/red) and blink when low.
 */
export class MatchHud {
  private readonly scene: Phaser.Scene;
  private readonly config: MatchHudConfig;
  private readonly root: Phaser.GameObjects.Container;
  private readonly abilitiesRoot: Phaser.GameObjects.Container;
  private p1AbilityCards: AbilityCardWidget[] = [];
  private p2AbilityCards: AbilityCardWidget[] = [];
  private p1M1Card!: AbilityCardWidget;
  private p2M1Card!: AbilityCardWidget;

  private p1Fill!: Phaser.GameObjects.Image;
  private p2Fill!: Phaser.GameObjects.Image;
  private p1FillGeom!: FillGeometry;
  private p2FillGeom!: FillGeometry;
  private timerText!: Phaser.GameObjects.Text;
  private p1Pips: Phaser.GameObjects.Image[] = [];
  private p2Pips: Phaser.GameObjects.Image[] = [];

  private p1Meter!: Phaser.GameObjects.Rectangle;
  private p2Meter!: Phaser.GameObjects.Rectangle;
  private p1MeterGeom!: MeterGeometry;
  private p2MeterGeom!: MeterGeometry;
  private p1MeterReady = false;
  private p2MeterReady = false;
  private p1MeterGlow: Phaser.Tweens.Tween | null = null;
  private p2MeterGlow: Phaser.Tweens.Tween | null = null;

  private p1Frac = 1;
  private p2Frac = 1;
  private p1Blink: Phaser.Tweens.Tween | null = null;
  private p2Blink: Phaser.Tweens.Tween | null = null;

  /**
   * @param scene - The owning match scene.
   * @param config - Roster, mode, rounds, and render depth for the HUD.
   */
  constructor(scene: Phaser.Scene, config: MatchHudConfig) {
    this.scene = scene;
    this.config = config;
    this.root = scene.add.container(0, 0).setDepth(config.depth).setScrollFactor(0);
    this.abilitiesRoot = scene.add.container(0, 0).setDepth(config.depth).setScrollFactor(0);

    this.build();
  }

  /** Constructs every HUD element into the root container. */
  private build(): void {
    const camWidth = this.scene.cameras.main.width;

    // --- Player 1 (left) ---
    const p1HealthX = PAD + PORTRAIT_DISP + 6;
    const healthY = TOP + 8;
    this.buildHealth('left', p1HealthX, healthY);
    this.buildPortrait('portrait-frame-gold-left', this.config.p1CharacterId, PAD + PORTRAIT_DISP / 2, true);
    this.buildNameplate('nameplate-gold-left', this.config.p1CharacterId, p1HealthX, healthY, false);
    const pipsY = healthY + HEALTH_DISP_H + NAME_DISP_H + 8;
    this.p1Pips = this.buildPips(p1HealthX, pipsY, false);

    // --- Player 2 (right) ---
    const p2HealthX = camWidth - PAD - PORTRAIT_DISP - 6 - HEALTH_DISP_W;
    this.buildHealth('right', p2HealthX, healthY);
    this.buildPortrait('portrait-frame-blue-right', this.config.p2CharacterId, camWidth - PAD - PORTRAIT_DISP / 2, false);
    this.buildNameplate('nameplate-gold-right', this.config.p2CharacterId, p2HealthX, healthY, true);
    this.p2Pips = this.buildPips(p2HealthX + HEALTH_DISP_W, pipsY, true);

    // --- Special meters (below the win pips) ---
    const meterY = pipsY + PIP_DISP_H + 8;
    this.buildMeter('left', p1HealthX, meterY);
    this.buildMeter('right', p2HealthX + HEALTH_DISP_W, meterY);

    // --- Timer (centre) ---
    this.buildTimer(camWidth / 2);

    // --- Abilities Bar (bottom foreground) ---
    this.buildAbilityBars();

    this.applyHealth(1, 1);
    this.setMeter(0, 0);
    this.updateWins(0, 0);
  }

  private buildAbilityBars(): void {
    const cam = this.scene.cameras.main;
    const centerY = cam.height - ABILITY_BOTTOM_OFFSET;

    const p1Theme = getHeroAbilityKit(this.config.p1CharacterId).themeColor;
    const p2Theme = getHeroAbilityKit(this.config.p2CharacterId).themeColor;

    const p1Slots: Array<{ slot: 0 | 1 | 2 | 3 | 4; keyLabel: string }> = [
      { slot: 0, keyLabel: 'M1/F' },
      { slot: 1, keyLabel: '1/Q' },
      { slot: 2, keyLabel: '2/E' },
      { slot: 3, keyLabel: '3/R' },
      { slot: 4, keyLabel: '4/T' }
    ];

    const p1Widgets = p1Slots.map((entry, idx) => {
      const cx = PAD + ABILITY_CARD_W / 2 + idx * (ABILITY_CARD_W + ABILITY_CARD_GAP);
      return this.createAbilityCard(cx, centerY, entry.slot, entry.keyLabel, true, p1Theme);
    });
    this.p1M1Card = p1Widgets[0];
    this.p1AbilityCards = p1Widgets.slice(1);

    const p2Slots: Array<{ slot: 0 | 1 | 2 | 3 | 4; keyLabel: string }> = [
      { slot: 0, keyLabel: this.config.mode === '1vcpu' ? 'CPU' : 'M1/,' },
      { slot: 1, keyLabel: this.config.mode === '1vcpu' ? 'CPU' : '7/U' },
      { slot: 2, keyLabel: this.config.mode === '1vcpu' ? 'CPU' : '8/I' },
      { slot: 3, keyLabel: this.config.mode === '1vcpu' ? 'CPU' : '9/O' },
      { slot: 4, keyLabel: this.config.mode === '1vcpu' ? 'CPU' : '0/P' }
    ];

    const totalW = p2Slots.length * ABILITY_CARD_W + (p2Slots.length - 1) * ABILITY_CARD_GAP;
    const startX = cam.width - PAD - totalW + ABILITY_CARD_W / 2;

    const p2Widgets = p2Slots.map((entry, idx) => {
      const cx = startX + idx * (ABILITY_CARD_W + ABILITY_CARD_GAP);
      return this.createAbilityCard(cx, centerY, entry.slot, entry.keyLabel, false, p2Theme);
    });
    this.p2M1Card = p2Widgets[0];
    this.p2AbilityCards = p2Widgets.slice(1);
  }

  private createAbilityCard(
    cx: number,
    cy: number,
    slot: 0 | 1 | 2 | 3 | 4,
    keyLabel: string,
    clickable: boolean,
    themeColor: number
  ): AbilityCardWidget {
    const bg = this.scene.add
      .rectangle(cx, cy, ABILITY_CARD_W, ABILITY_CARD_H, 0x090d1c, 0.86)
      .setStrokeStyle(2, 0x334155, 1);

    if (clickable) {
      if (slot === 0 && this.config.onM1Click) {
        bg.setInteractive({ useHandCursor: true });
        bg.on('pointerover', () => playUiHoverSound(getAppContext().settingsStore.getState()));
        bg.on('pointerdown', () => this.config.onM1Click?.());
      } else if (slot !== 0 && this.config.onAbilityClick) {
        bg.setInteractive({ useHandCursor: true });
        bg.on('pointerover', () => playUiHoverSound(getAppContext().settingsStore.getState()));
        bg.on('pointerdown', () => this.config.onAbilityClick?.(slot));
      }
    }

    const barTrack = this.scene.add
      .rectangle(cx - ABILITY_CARD_W / 2 + 5, cy + ABILITY_CARD_H / 2 - 5, ABILITY_CARD_W - 10, 4, 0x1e293b, 1)
      .setOrigin(0, 0.5);

    const barFill = this.scene.add
      .rectangle(cx - ABILITY_CARD_W / 2 + 5, cy + ABILITY_CARD_H / 2 - 5, ABILITY_CARD_W - 10, 4, themeColor, 1)
      .setOrigin(0, 0.5);

    const keyBadge = this.scene.add
      .text(cx - ABILITY_CARD_W / 2 + 5, cy - ABILITY_CARD_H / 2 + 5, keyLabel, {
        color: '#facc15',
        fontFamily: 'monospace',
        fontSize: '9.5px',
        fontStyle: 'bold'
      })
      .setOrigin(0, 0);

    const notationText = this.scene.add
      .text(cx + ABILITY_CARD_W / 2 - 5, cy - ABILITY_CARD_H / 2 + 5, '', {
        color: '#94a3b8',
        fontFamily: 'monospace',
        fontSize: '9.5px'
      })
      .setOrigin(1, 0);

    const nameText = this.scene.add
      .text(cx, cy - 1, '', {
        color: '#f8fafc',
        fontFamily: 'monospace',
        fontSize: '10.5px',
        fontStyle: 'bold'
      })
      .setOrigin(0.5);

    const statusText = this.scene.add
      .text(cx, cy + 13, '', {
        color: '#86efac',
        fontFamily: 'monospace',
        fontSize: '9.5px',
        fontStyle: 'bold'
      })
      .setOrigin(0.5);

    this.abilitiesRoot.add([bg, barTrack, barFill, keyBadge, notationText, nameText, statusText]);

    return { slot, themeColor, bg, barFill, keyBadge, notationText, nameText, statusText };
  }

  /** Updates the on-screen ability cards and M1 combo indicator for both fighters every frame. */
  updateAbilities(
    p1Abilities: FighterAbilityState[],
    p2Abilities: FighterAbilityState[],
    p1M1?: FighterM1State,
    p2M1?: FighterM1State
  ): void {
    this.renderAbilitySet(this.p1AbilityCards, p1Abilities);
    this.renderAbilitySet(this.p2AbilityCards, p2Abilities);
    if (p1M1) {
      this.renderM1Card(this.p1M1Card, p1M1);
    }
    if (p2M1) {
      this.renderM1Card(this.p2M1Card, p2M1);
    }
  }

  private renderM1Card(widget: AbilityCardWidget, state: FighterM1State): void {
    const barMaxW = ABILITY_CARD_W - 10;
    const step = state.step;
    const frac = step > 0 ? step / 4 : 1;

    widget.notationText.setText(step > 0 ? `${step}/4` : '4-HIT');
    widget.nameText.setText(state.moveName.length > 13 ? `${state.moveName.slice(0, 12)}.` : state.moveName);

    if (step === 4) {
      widget.barFill.setDisplaySize(barMaxW, 4).setFillStyle(0xfacc15, 1).setVisible(true);
      widget.bg.setStrokeStyle(3, 0xfacc15, 1);
      widget.statusText.setText('FINISHER!').setColor('#fde047');
      widget.nameText.setColor('#fef08a');
    } else if (step > 0) {
      widget.barFill.setDisplaySize(Math.max(4, barMaxW * frac), 4).setFillStyle(0x38bdf8, 1).setVisible(true);
      widget.bg.setStrokeStyle(2.5, 0x38bdf8, 1);
      widget.statusText.setText(`HIT ${step}/4`).setColor('#7dd3fc');
      widget.nameText.setColor('#ffffff');
    } else {
      widget.barFill.setDisplaySize(barMaxW, 4).setFillStyle(widget.themeColor, 1).setVisible(true);
      widget.bg.setStrokeStyle(2, widget.themeColor, 1);
      widget.statusText.setText('M1 COMBO').setColor('#86efac');
      widget.nameText.setColor('#f8fafc');
    }
  }

  private renderAbilitySet(widgets: AbilityCardWidget[], states: FighterAbilityState[]): void {
    const barMaxW = ABILITY_CARD_W - 10;

    for (const widget of widgets) {
      const state = states.find((candidate) => candidate.slot === widget.slot);
      if (!state) {
        continue;
      }

      widget.nameText.setText(state.name);
      widget.notationText.setText(state.notation);

      if (state.isSuper) {
        const pct = Math.round(state.meterFrac * 100);
        widget.barFill.setDisplaySize(Math.max(1, barMaxW * state.meterFrac), 4);
        widget.barFill.setFillStyle(state.ready ? 0xfacc15 : 0x38bdf8, 1);
        widget.barFill.setVisible(state.meterFrac > 0);
        widget.bg.setStrokeStyle(state.ready ? 2.5 : 2, state.ready ? 0xfacc15 : 0x334155, 1);
        widget.statusText.setText(state.ready ? 'READY!' : `${pct}%`).setColor(state.ready ? '#fde047' : '#7dd3fc');
        widget.nameText.setColor(state.ready ? '#fef08a' : '#cbd5e1');
        continue;
      }

      if (state.highlighted) {
        widget.barFill.setDisplaySize(barMaxW, 4).setFillStyle(0xfacc15, 1).setVisible(true);
        widget.bg.setStrokeStyle(3, 0xfacc15, 1);
        widget.statusText.setText('CHAIN!').setColor('#fde047');
        widget.nameText.setColor('#fef08a');
        continue;
      }

      if (state.ready) {
        widget.barFill.setDisplaySize(barMaxW, 4).setFillStyle(widget.themeColor, 1).setVisible(true);
        widget.bg.setStrokeStyle(2, widget.themeColor, 1);
        widget.statusText.setText('READY').setColor('#86efac');
        widget.nameText.setColor('#f8fafc');
      } else {
        const frac =
          state.cooldownTotal > 0 ? Phaser.Math.Clamp(1 - state.cooldownRemaining / state.cooldownTotal, 0, 1) : 0;
        widget.barFill.setDisplaySize(Math.max(1, barMaxW * frac), 4).setFillStyle(0x64748b, 1).setVisible(frac > 0);
        widget.bg.setStrokeStyle(2, 0x334155, 1);
        widget.statusText.setText(`${state.cooldownRemaining.toFixed(1)}s`).setColor('#94a3b8');
        widget.nameText.setColor('#94a3b8');
      }
    }
  }

  /**
   * Builds one side's special-meter track and its fill bar.
   * @param side - Which side the meter belongs to.
   * @param edgeX - The outer-edge anchor x in screen pixels.
   * @param topY - The bar's top y in screen pixels.
   */
  private buildMeter(side: 'left' | 'right', edgeX: number, topY: number): void {
    const originX: 0 | 1 = side === 'left' ? 0 : 1;
    const geometry: MeterGeometry = { anchorX: edgeX, topY, width: METER_DISP_W, height: METER_DISP_H, originX };

    const track = this.scene.add
      .rectangle(edgeX, topY, METER_DISP_W, METER_DISP_H, METER_TRACK_COLOR, 0.85)
      .setOrigin(originX, 0)
      .setStrokeStyle(1, 0x1e293b, 1);
    this.root.add(track);

    const fill = this.scene.add
      .rectangle(edgeX, topY, METER_DISP_W, METER_DISP_H, METER_FILL_COLOR, 1)
      .setOrigin(originX, 0);
    this.root.add(fill);

    if (side === 'left') {
      this.p1Meter = fill;
      this.p1MeterGeom = geometry;
    } else {
      this.p2Meter = fill;
      this.p2MeterGeom = geometry;
    }
  }

  /**
   * Builds one side's health frame and its drainable fill underneath.
   * @param side - Which side this bar belongs to.
   * @param frameX - Frame top-left x in screen pixels.
   * @param frameY - Frame top-left y in screen pixels.
   */
  private buildHealth(side: 'left' | 'right', frameX: number, frameY: number): void {
    const frameName = side === 'left' ? 'health-frame-left' : 'health-frame-right';
    const meta = getFightingUiAtlasFrame(frameName);
    const slot = meta.fillSlot ?? meta.bounds;
    const sx = HEALTH_DISP_W / meta.bounds.width;
    const sy = HEALTH_DISP_H / meta.bounds.height;

    const slotLeft = frameX + slot.x * sx;
    const slotTop = frameY + slot.y * sy;
    const slotWidth = slot.width * sx;
    const slotHeight = slot.height * sy;

    const geometry: FillGeometry =
      side === 'left'
        ? { anchorX: slotLeft, topY: slotTop, width: slotWidth, height: slotHeight, originX: 0 }
        : { anchorX: slotLeft + slotWidth, topY: slotTop, width: slotWidth, height: slotHeight, originX: 1 };

    const fill = this.scene.add
      .image(geometry.anchorX, geometry.topY, KEY, 'health-fill-green-left')
      .setOrigin(geometry.originX, 0);
    this.root.add(fill);

    const frame = this.scene.add
      .image(frameX, frameY, KEY, frameName)
      .setOrigin(0, 0)
      .setDisplaySize(HEALTH_DISP_W, HEALTH_DISP_H);
    this.root.add(frame);

    if (side === 'left') {
      this.p1Fill = fill;
      this.p1FillGeom = geometry;
    } else {
      this.p2Fill = fill;
      this.p2FillGeom = geometry;
    }
  }

  /**
   * Builds a portrait frame with the character portrait seated in its socket.
   * Portraits are authored facing left (canonical); the left (P1) socket flips
   * its portrait so both players face inward toward the centre of the screen.
   * @param frameName - The portrait frame atlas name.
   * @param characterId - The character whose portrait is shown.
   * @param centerX - Frame centre x in screen pixels.
   * @param faceRight - When true, flips the portrait to face right (the P1 socket).
   */
  private buildPortrait(frameName: string, characterId: string, centerX: number, faceRight: boolean): void {
    const meta = getFightingUiAtlasFrame(frameName);
    const centerY = TOP + PORTRAIT_DISP / 2;
    const sx = PORTRAIT_DISP / meta.bounds.width;
    const sy = PORTRAIT_DISP / meta.bounds.height;
    const socket = meta.portraitSocket ?? meta.bounds;

    const frameLeft = centerX - PORTRAIT_DISP / 2;
    const frameTop = centerY - PORTRAIT_DISP / 2;
    const socketCx = frameLeft + (socket.x + socket.width / 2) * sx;
    const socketCy = frameTop + (socket.y + socket.height / 2) * sy;

    const portraitKey = getCharacterDefinition(characterId).portrait.key;
    if (this.scene.textures.exists(portraitKey)) {
      const portrait = this.scene.add
        .image(socketCx, socketCy, portraitKey)
        .setDisplaySize(socket.width * sx, socket.height * sy)
        .setFlipX(faceRight);
      this.root.add(portrait);
    }

    const frame = this.scene.add.image(centerX, centerY, KEY, frameName).setDisplaySize(PORTRAIT_DISP, PORTRAIT_DISP);
    this.root.add(frame);
  }

  /**
   * Builds a name plate beneath a health bar with the character's name.
   * @param frameName - The nameplate atlas frame.
   * @param characterId - The character whose name is shown.
   * @param healthX - The health frame's top-left x (for alignment).
   * @param healthY - The health frame's top-left y.
   * @param rightAligned - When true, the plate hugs the bar's right edge.
   */
  private buildNameplate(
    frameName: string,
    characterId: string,
    healthX: number,
    healthY: number,
    rightAligned: boolean
  ): void {
    const meta = getFightingUiAtlasFrame(frameName);
    const plateX = rightAligned ? healthX + HEALTH_DISP_W - NAME_DISP_W : healthX;
    const plateY = healthY + HEALTH_DISP_H + 2;

    const plate = this.scene.add
      .image(plateX, plateY, KEY, frameName)
      .setOrigin(0, 0)
      .setDisplaySize(NAME_DISP_W, NAME_DISP_H);
    this.root.add(plate);

    const sx = NAME_DISP_W / meta.bounds.width;
    const sy = NAME_DISP_H / meta.bounds.height;
    const slot = meta.textSlot ?? meta.bounds;
    const textCx = plateX + (slot.x + slot.width / 2) * sx;
    const textCy = plateY + (slot.y + slot.height / 2) * sy;

    const name = getCharacterDefinition(characterId).label.toUpperCase();
    const label = this.scene.add
      .text(textCx, textCy, name, {
        color: '#fdf6e3',
        fontFamily: 'monospace',
        fontSize: '15px',
        fontStyle: 'bold'
      })
      .setOrigin(0.5);
    this.root.add(label);
  }

  /**
   * Builds the round-win pip row for one side.
   * @param edgeX - The anchor x (outer edge of the row).
   * @param y - The row's top y.
   * @param rightAligned - When true, pips grow leftward from `edgeX`.
   * @returns The created pip images, outermost first.
   */
  private buildPips(edgeX: number, y: number, rightAligned: boolean): Phaser.GameObjects.Image[] {
    const meta = getFightingUiAtlasFrame('meter-pip-empty-1');
    const pipWidth = (PIP_DISP_H * meta.bounds.width) / meta.bounds.height;
    const gap = 6;
    const pips: Phaser.GameObjects.Image[] = [];

    for (let index = 0; index < this.config.roundsToWin; index += 1) {
      const offset = index * (pipWidth + gap);
      const x = rightAligned ? edgeX - offset : edgeX + offset;
      const pip = this.scene.add
        .image(x, y, KEY, 'meter-pip-empty-1')
        .setOrigin(rightAligned ? 1 : 0, 0)
        .setDisplaySize(pipWidth, PIP_DISP_H);
      this.root.add(pip);
      pips.push(pip);
    }

    return pips;
  }

  /**
   * Builds the centre timer frame and its number text.
   * @param centerX - The frame centre x in screen pixels.
   */
  private buildTimer(centerX: number): void {
    const meta = getFightingUiAtlasFrame('timer-frame');
    const centerY = TOP + TIMER_DISP_H / 2;
    const frame = this.scene.add.image(centerX, centerY, KEY, 'timer-frame').setDisplaySize(TIMER_DISP_W, TIMER_DISP_H);
    this.root.add(frame);

    const sx = TIMER_DISP_W / meta.bounds.width;
    const sy = TIMER_DISP_H / meta.bounds.height;
    const slot = meta.numberSlot ?? meta.bounds;
    const numberCx = centerX - TIMER_DISP_W / 2 + (slot.x + slot.width / 2) * sx;
    const numberCy = centerY - TIMER_DISP_H / 2 + (slot.y + slot.height / 2) * sy;

    this.timerText = this.scene.add
      .text(numberCx, numberCy, '0', {
        color: '#f8fafc',
        fontFamily: 'monospace',
        fontSize: '34px',
        fontStyle: 'bold'
      })
      .setOrigin(0.5);
    this.root.add(this.timerText);
  }

  /**
   * Sets both health bars to the given fractions (color + width + blink).
   * @param p1Frac - Player 1's health fraction (0..1).
   * @param p2Frac - Player 2's health fraction (0..1).
   */
  applyHealth(p1Frac: number, p2Frac: number): void {
    this.p1Frac = Phaser.Math.Clamp(p1Frac, 0, 1);
    this.p2Frac = Phaser.Math.Clamp(p2Frac, 0, 1);
    this.renderFill('left');
    this.renderFill('right');
  }

  /**
   * Sets both special meters to the given fractions, recolouring and pulsing
   * the bar when it is full (ready to fire).
   * @param p1Frac - Player 1's meter fraction (0..1).
   * @param p2Frac - Player 2's meter fraction (0..1).
   */
  setMeter(p1Frac: number, p2Frac: number): void {
    this.renderMeter('left', Phaser.Math.Clamp(p1Frac, 0, 1));
    this.renderMeter('right', Phaser.Math.Clamp(p2Frac, 0, 1));
  }

  /**
   * Renders one side's meter: width by fraction, colour + glow when full.
   * @param side - Which meter to render.
   * @param frac - The meter fraction (0..1).
   */
  private renderMeter(side: 'left' | 'right', frac: number): void {
    const fill = side === 'left' ? this.p1Meter : this.p2Meter;
    const geometry = side === 'left' ? this.p1MeterGeom : this.p2MeterGeom;
    const ready = frac >= 1;

    fill.setDisplaySize(Math.max(0, geometry.width * frac), geometry.height);
    fill.setFillStyle(ready ? METER_READY_COLOR : METER_FILL_COLOR, 1);
    fill.setVisible(frac > 0);
    this.setMeterGlow(side, ready);
  }

  /**
   * Starts or stops the "ready" pulse on a full meter bar.
   * @param side - Which meter to manage.
   * @param active - Whether the bar should be pulsing.
   */
  private setMeterGlow(side: 'left' | 'right', active: boolean): void {
    const wasReady = side === 'left' ? this.p1MeterReady : this.p2MeterReady;
    if (active === wasReady) {
      return;
    }

    if (side === 'left') {
      this.p1MeterReady = active;
    } else {
      this.p2MeterReady = active;
    }

    const fill = side === 'left' ? this.p1Meter : this.p2Meter;
    const existing = side === 'left' ? this.p1MeterGlow : this.p2MeterGlow;

    if (active) {
      const tween = this.scene.tweens.add({
        targets: fill,
        alpha: 0.45,
        duration: 320,
        yoyo: true,
        repeat: -1
      });

      if (side === 'left') {
        this.p1MeterGlow = tween;
      } else {
        this.p2MeterGlow = tween;
      }

      return;
    }

    existing?.stop();
    fill.setAlpha(1);

    if (side === 'left') {
      this.p1MeterGlow = null;
    } else {
      this.p2MeterGlow = null;
    }
  }

  /**
   * Updates the timer readout and its low-time colour.
   * @param seconds - Whole seconds remaining.
   */
  setTime(seconds: number): void {
    this.timerText.setText(String(Math.max(0, seconds))).setColor(seconds <= 10 ? '#f87171' : '#f8fafc');
  }

  /**
   * Lights up won-round pips for both players.
   * @param p1Wins - Player 1's round wins.
   * @param p2Wins - Player 2's round wins.
   */
  updateWins(p1Wins: number, p2Wins: number): void {
    this.p1Pips.forEach((pip, index) => pip.setFrame(index < p1Wins ? 'meter-pip-gold-1' : 'meter-pip-empty-1'));
    this.p2Pips.forEach((pip, index) => pip.setFrame(index < p2Wins ? 'meter-pip-gold-1' : 'meter-pip-empty-1'));
  }

  /** Slides the HUD down into place from above (match start). */
  slideIn(): void {
    this.root.y = -SLIDE_OFFSET;
    this.scene.tweens.add({ targets: this.root, y: 0, duration: 900, ease: 'Back.Out' });

    this.abilitiesRoot.y = 95;
    this.scene.tweens.add({ targets: this.abilitiesRoot, y: 0, duration: 700, ease: 'Cubic.Out' });
  }

  /**
   * Animates both health bars filling from empty to full (round start). The
   * recolor passes through red -> yellow -> green as they fill.
   */
  animateFill(): void {
    this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 950,
      ease: 'Cubic.Out',
      onUpdate: (tween) => {
        const value = tween.getValue() ?? 0;
        this.applyHealth(value, value);
      },
      onComplete: () => this.applyHealth(1, 1)
    });
  }

  /** Removes the HUD and stops its tweens. */
  destroy(): void {
    this.p1Blink?.stop();
    this.p2Blink?.stop();
    this.p1MeterGlow?.stop();
    this.p2MeterGlow?.stop();
    this.root.destroy(true);
    this.abilitiesRoot.destroy(true);
  }

  /**
   * Renders one side's fill: width by fraction, frame by colour, plus low-health
   * blink management.
   * @param side - Which bar to render.
   */
  private renderFill(side: 'left' | 'right'): void {
    const frac = side === 'left' ? this.p1Frac : this.p2Frac;
    const fill = side === 'left' ? this.p1Fill : this.p2Fill;
    const geometry = side === 'left' ? this.p1FillGeom : this.p2FillGeom;

    fill.setFrame(colorFrame(frac));
    fill.setDisplaySize(Math.max(1, geometry.width * frac), geometry.height);
    fill.setVisible(frac > 0);

    const blinking = frac > 0 && frac <= HEALTH_DANGER;
    this.setBlink(side, blinking);
  }

  /**
   * Starts or stops the low-health blink for one side.
   * @param side - Which bar to manage.
   * @param active - Whether the bar should be blinking.
   */
  private setBlink(side: 'left' | 'right', active: boolean): void {
    const fill = side === 'left' ? this.p1Fill : this.p2Fill;
    const existing = side === 'left' ? this.p1Blink : this.p2Blink;

    if (active) {
      if (existing) {
        return;
      }

      const tween = this.scene.tweens.add({
        targets: fill,
        alpha: 0.3,
        duration: 220,
        yoyo: true,
        repeat: -1
      });

      if (side === 'left') {
        this.p1Blink = tween;
      } else {
        this.p2Blink = tween;
      }

      return;
    }

    if (existing) {
      existing.stop();
      fill.setAlpha(1);

      if (side === 'left') {
        this.p1Blink = null;
      } else {
        this.p2Blink = null;
      }
    }
  }
}

/**
 * Picks the health-fill atlas frame for a given fraction. The left-side colour
 * frames are reused for both players (the right side only ships a green fill).
 * @param frac - Health fraction (0..1).
 */
function colorFrame(frac: number): string {
  if (frac > HEALTH_WARN) {
    return 'health-fill-green-left';
  }

  if (frac > HEALTH_DANGER) {
    return 'health-fill-yellow-left';
  }

  return 'health-fill-red-left';
}
