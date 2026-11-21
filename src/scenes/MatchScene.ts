import * as Phaser from 'phaser';

import { getAccountService } from '../game/account';
import { getHeroAbilityKit, type AbilityProjectileSpec } from '../game/abilities';
import { playUiHoverSound } from '../game/core/audio';
import { getBackgroundMusic } from '../game/fightMusic';
import { Fighter, NEUTRAL_FIGHTER_INPUT, type FighterInput } from '../game/fighter';
import { getCharacterDefinition } from '../game/hero';
import { MatchHud } from '../game/matchHud';
import { spawnBurstSparks } from '../game/menuFx';
import { resolveFighterPushboxes } from '../game/pushbox';
import { getSessionRecordStore } from '../game/sessionRecord';
import { getStageDefinition } from '../game/stageConfig';
import { playSuperCutIn } from '../game/superCutIn';
import { SCENE_KEYS, type MatchConfig } from '../game/types';
import {
  spawnHeroDomainVfx,
  spawnHitSpark,
  spawnImpactFlash,
  spawnM1Vfx,
  spawnSlashVfx,
  type VfxColor
} from '../game/vfx';
import { BaseScene } from './BaseScene';

const GROUND_FRACTION = 0.82;
const EDGE_MARGIN = 170;
const DEPTH_FRONT = 8;
const DEPTH_BACK = 5;

// Fraction of the gap from the screen centre each fighter occupies at spawn.
const SPAWN_OFFSET_FRACTION = 0.18;
// How quickly the camera eases toward the fighters' midpoint (0..1 per frame).
const CAMERA_LERP = 0.14;

const ROUNDS_TO_WIN = 2;
// Seconds on the round clock. When it expires the fighter with more health wins
// (a tie is a draw and replays the round).
const ROUND_SECONDS = 60;
const HUD_DEPTH = 100;
const BANNER_DEPTH = 200;
const OVERLAY_DEPTH = 300;

/** The match's high-level state, driving input gating and the HUD. */
type MatchPhase = 'intro' | 'fighting' | 'roundEnd' | 'matchOver';

interface PlayerKeys {
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
  crouch: Phaser.Input.Keyboard.Key;
  block: Phaser.Input.Keyboard.Key;
  jump: Phaser.Input.Keyboard.Key;
  light: Phaser.Input.Keyboard.Key;
  heavy: Phaser.Input.Keyboard.Key;
  special: Phaser.Input.Keyboard.Key;
  ability1: Phaser.Input.Keyboard.Key;
  ability1Alt: Phaser.Input.Keyboard.Key;
  ability2: Phaser.Input.Keyboard.Key;
  ability2Alt: Phaser.Input.Keyboard.Key;
  ability3: Phaser.Input.Keyboard.Key;
  ability3Alt: Phaser.Input.Keyboard.Key;
  ability4: Phaser.Input.Keyboard.Key;
  ability4Alt: Phaser.Input.Keyboard.Key;
}

interface ActiveProjectile {
  owner: Fighter;
  target: Fighter;
  x: number;
  y: number;
  vx: number;
  facing: 1 | -1;
  damage: number;
  knockback: number;
  hitstun: number;
  color: number;
  vfxColor: VfxColor;
  spinSpeed: number;
  hitRadius: number;
  container: Phaser.GameObjects.Container;
  trailTimer: number;
}

/**
 * The versus match: two fighters spawn facing each other and fight a best-of-3
 * (first to {@link ROUNDS_TO_WIN} rounds). Each round runs a "ROUND n / FIGHT!"
 * intro, then live combat — attack boxes vs hurtboxes drive damage, hitstun,
 * knockback, and a knockdown on KO. When the match is decided a game-over
 * overlay offers a rematch or a return to the main menu. P1 is always human;
 * P2 is human in 1v1 or a simple CPU in 1vCPU.
 */
export class MatchScene extends BaseScene {
  private config: MatchConfig = {
    mode: '1v1',
    stageId: 'rooftop-twilight',
    p1CharacterId: '',
    p2CharacterId: ''
  };

  private p1!: Fighter;
  private p2!: Fighter;
  private p1Keys!: PlayerKeys;
  private p2Keys!: PlayerKeys;
  private cpu?: CpuController;

  private phase: MatchPhase = 'intro';
  private roundNumber = 1;
  private p1Wins = 0;
  private p2Wins = 0;

  private spawnX1 = 0;
  private spawnX2 = 0;

  private stageWorldWidth = 0;
  private maxScroll = 0;

  private hud!: MatchHud;
  private banner!: Phaser.GameObjects.Text;
  private roundTimeMs = ROUND_SECONDS * 1000;
  private overlay: Phaser.GameObjects.GameObject[] = [];
  private projectiles: ActiveProjectile[] = [];
  private moveListPanel: Phaser.GameObjects.Container | null = null;
  private moveListVisible = false;
  private queuedP1Ability: 1 | 2 | 3 | 4 | null = null;
  private queuedP1M1 = false;
  private p1ComboCount = 0;
  private p2ComboCount = 0;
  private p1ComboText: Phaser.GameObjects.Text | null = null;
  private p2ComboText: Phaser.GameObjects.Text | null = null;
  private lastRelativeSide: 1 | -1 = 1;

  constructor() {
    super(SCENE_KEYS.Match);
  }

  init(data: MatchConfig): void {
    if (data) {
      this.config = data;
    }
  }

  create(): void {
    this.cpu = undefined;
    this.phase = 'intro';
    this.roundNumber = 1;
    this.p1Wins = 0;
    this.p2Wins = 0;
    this.overlay = [];

    this.markActiveScene(SCENE_KEYS.Match);
    this.cameras.main.setBackgroundColor(0x05070d);
    this.cameras.main.fadeIn(260, 2, 6, 23);

    this.buildStage();
    this.spawnFighters();
    this.registerKeys();
    this.createControlsLegend();

    this.hud = new MatchHud(this, {
      mode: this.config.mode,
      p1CharacterId: this.config.p1CharacterId,
      p2CharacterId: this.config.p2CharacterId,
      roundsToWin: ROUNDS_TO_WIN,
      depth: HUD_DEPTH,
      onAbilityClick: (slot) => {
        if (this.phase === 'fighting') {
          this.queuedP1Ability = slot;
        }
      },
      onM1Click: () => {
        if (this.phase === 'fighting') {
          this.queuedP1M1 = true;
        }
      }
    });
    this.hud.slideIn();

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[]) => {
      if (this.phase !== 'fighting') {
        return;
      }
      if (pointer.leftButtonDown() && currentlyOver.length === 0) {
        this.queuedP1M1 = true;
      }
    });

    this.banner = this.add
      .text(this.cameras.main.centerX, this.cameras.main.centerY - 40, '', {
        color: '#f8fafc',
        fontFamily: '"Press Start 2P", "Silkscreen", monospace',
        fontStyle: 'italic bold',
        fontSize: '50px',
        stroke: '#020617',
        strokeThickness: 10
      })
      .setOrigin(0.5)
      .setDepth(BANNER_DEPTH)
      .setScrollFactor(0)
      .setAlpha(0);

    if (this.config.mode === '1vcpu') {
      this.cpu = new CpuController();
    }

    this.startRound();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.time.timeScale = 1;
      this.tweens.timeScale = 1;
      getBackgroundMusic().setIntensity(false);
      this.clearProjectiles();
      this.moveListPanel?.destroy(true);
      this.moveListPanel = null;
      this.p1?.destroy();
      this.p2?.destroy();
      this.hud?.destroy();
    });
  }

  /**
   * Per-frame loop: feeds both fighters their input (only while fighting),
   * keeps them facing each other, resolves hits, checks for a KO, and redraws
   * the HUD.
   * @param time - Phaser clock time in ms.
   * @param delta - Milliseconds since the previous frame.
   */
  update(time: number, delta: number): void {
    const seconds = delta / 1000;
    const fighting = this.phase === 'fighting';

    const p1Input = fighting ? this.readKeys(this.p1Keys) : { ...NEUTRAL_FIGHTER_INPUT };
    if (fighting && this.queuedP1M1) {
      p1Input.m1 = true;
      this.queuedP1M1 = false;
    }
    if (fighting && this.queuedP1Ability !== null) {
      if (this.queuedP1Ability === 1) p1Input.ability1 = true;
      if (this.queuedP1Ability === 2) p1Input.ability2 = true;
      if (this.queuedP1Ability === 3) p1Input.ability3 = true;
      if (this.queuedP1Ability === 4) p1Input.ability4 = true;
      this.queuedP1Ability = null;
    }

    const p2Input = fighting
      ? this.cpu
        ? this.cpu.update(time)
        : this.readKeys(this.p2Keys)
      : { ...NEUTRAL_FIGHTER_INPUT };

    // CPU occasionally unleashes custom abilities, meter Super Art, or slides under jumps.
    if (fighting && this.cpu) {
      const dist = Math.abs(this.p2.x - this.p1.x);
      if (!this.p1.isGrounded && this.p2.isGrounded && dist < 175 && Phaser.Math.Between(0, 32) === 0) {
        this.cpu.triggerSlideToward(time, this.p1.x >= this.p2.x ? 1 : -1);
      } else if (this.p2.isMeterReady && Phaser.Math.Between(0, 120) === 0) {
        p2Input.ability4 = true;
      } else if (Phaser.Math.Between(0, 155) === 0) {
        if (dist > 250) {
          p2Input.ability3 = true;
        } else if (Math.random() < 0.55) {
          p2Input.ability1 = true;
        } else {
          p2Input.ability2 = true;
        }
      }
    }

    if (Math.abs(this.p2.x - this.p1.x) > 8) {
      this.lastRelativeSide = this.p2.x >= this.p1.x ? 1 : -1;
    }

    this.p1.faceToward(this.p2.x);
    this.p2.faceToward(this.p1.x);

    if (fighting) {
      if (isActing(p1Input)) {
        this.p1.setDepthBase(DEPTH_FRONT);
        this.p2.setDepthBase(DEPTH_BACK);
      } else if (isActing(p2Input)) {
        this.p2.setDepthBase(DEPTH_FRONT);
        this.p1.setDepthBase(DEPTH_BACK);
      }
    }

    this.p1.update(seconds, p1Input);
    this.p2.update(seconds, p2Input);

    this.resolveFighterCollision();
    this.updateCamera(false);

    if (fighting) {
      this.resolveCombat();
      this.updateProjectiles(seconds);
      this.checkForKnockout();

      if (this.phase === 'fighting') {
        this.tickRoundTimer(delta);
        this.hud.applyHealth(this.p1.health01, this.p2.health01);
      }
    }

    const clutch =
      this.p1.health01 <= 0.38 ||
      this.p2.health01 <= 0.38 ||
      (this.p1Wins === ROUNDS_TO_WIN - 1 && this.p2Wins === ROUNDS_TO_WIN - 1);
    getBackgroundMusic().setIntensity(clutch);

    this.hud.setMeter(this.p1.meter01, this.p2.meter01);
    this.hud.updateAbilities(
      this.p1.getAbilityStates(),
      this.p2.getAbilityStates(),
      this.p1.getM1State(),
      this.p2.getM1State()
    );
    this.hud.setTime(Math.ceil(this.roundTimeMs / 1000));
    this.hud.updateWins(this.p1Wins, this.p2Wins);
  }

  /**
   * Prevents grounded/overlapping fighters from passing through each other while
   * allowing fighters to jump over or slide underneath airborne opponents.
   */
  private resolveFighterCollision(): void {
    if (this.p1.isDefeated || this.p2.isDefeated) {
      return;
    }

    const resolved = resolveFighterPushboxes(
      this.p1.getPushBox(),
      this.p2.getPushBox(),
      this.lastRelativeSide
    );
    if (resolved.collided) {
      this.p1.setResolvedX(resolved.aX);
      this.p2.setResolvedX(resolved.bX);
    }
  }

  /**
   * Checks both directions for a connecting hit and applies damage/block this
   * frame. A swing only lands once thanks to the attacker's connect flag.
   */
  private resolveCombat(): void {
    this.tryHit(this.p1, this.p2);
    this.tryHit(this.p2, this.p1);
  }

  /**
   * Resolves a single attacker -> defender interaction for the current frame.
   * Blocking is purely geometric: the hit is guarded when the attack box
   * overlaps the defender's active guard box (from its block pose).
   * @param attacker - The fighter whose attack box is tested.
   * @param defender - The fighter whose hurtbox is tested.
   */
  private tryHit(attacker: Fighter, defender: Fighter): void {
    if (defender.isDefeated) {
      return;
    }

    const attack = attacker.getActiveAttack();
    if (!attack) {
      return;
    }

    const hurt = defender.getHurtRect();
    if (!hurt || !Phaser.Geom.Intersects.RectangleToRectangle(attack.rect, hurt)) {
      return;
    }

    if (defender.isImmune) {
      attacker.markAttackConnected();
      const sparkX = (Phaser.Geom.Rectangle.GetCenter(attack.rect).x + Phaser.Geom.Rectangle.GetCenter(hurt).x) / 2;
      const sparkY = (Phaser.Geom.Rectangle.GetCenter(attack.rect).y + Phaser.Geom.Rectangle.GetCenter(hurt).y) / 2;
      spawnHitSpark(this, sparkX, sparkY, 'blue', 1.1);
      spawnImpactFlash(this, sparkX, sparkY, 'blue', 44);
      this.spawnCallout(defender, 'IMMUNE!', 0x38bdf8);
      return;
    }

    const guard = defender.getGuardRect();
    const blocked = guard !== null && Phaser.Geom.Intersects.RectangleToRectangle(attack.rect, guard);
    const isSpecial = attack.profile.kind === 'special';
    const finisher = attack.finisher && !blocked;

    // The combo finisher launches harder and stuns longer than a regular hit.
    const profile = finisher
      ? { ...attack.profile, knockback: attack.profile.knockback * 1.9, hitstun: attack.profile.hitstun * 1.4 }
      : attack.profile;

    const wasInHitstun = defender.inHitstun;
    defender.applyHit(profile, attacker.facingDirection, blocked);
    defender.flashHit(blocked);
    attacker.markAttackConnected();
    attacker.registerOffense(blocked, attack.isSuper);
    defender.registerDefense(blocked);

    if (!blocked) {
      this.registerComboHit(attacker, wasInHitstun);
    }

    this.spawnHitFx(attack.rect, hurt, blocked, isSpecial, finisher);
  }

  private registerComboHit(attacker: Fighter, defenderWasStunned: boolean): void {
    const isP1 = attacker === this.p1;
    const next = (defenderWasStunned ? (isP1 ? this.p1ComboCount : this.p2ComboCount) : 0) + 1;
    if (isP1) {
      this.p1ComboCount = next;
    } else {
      this.p2ComboCount = next;
    }

    if (next < 2) {
      return;
    }

    const x = isP1 ? 120 : this.cameras.main.width - 120;
    const y = 232;
    const existing = isP1 ? this.p1ComboText : this.p2ComboText;
    existing?.destroy();

    const text = this.add
      .text(x, y, `${next} HIT COMBO!`, {
        color: next >= 4 ? '#facc15' : '#fca5a5',
        fontFamily: 'monospace',
        fontSize: next >= 4 ? '24px' : '20px',
        fontStyle: 'bold',
        stroke: '#020617',
        strokeThickness: 5
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH + 5)
      .setScale(1.25);

    if (isP1) {
      this.p1ComboText = text;
    } else {
      this.p2ComboText = text;
    }

    this.tweens.add({
      targets: text,
      scale: 1,
      duration: 140,
      ease: 'Back.Out'
    });
    this.tweens.add({
      targets: text,
      alpha: 0,
      delay: 750,
      duration: 280,
      onComplete: () => {
        if ((isP1 ? this.p1ComboText : this.p2ComboText) === text) {
          if (isP1) this.p1ComboText = null;
          else this.p2ComboText = null;
        }
        text.destroy();
      }
    });
  }

  /**
   * Spawns the impact spark and camera shake for a connecting hit, scaled up for
   * special hits and the combo finisher.
   * @param attackRect - The attacker's attack box (world space).
   * @param hurtRect - The defender's hurtbox (world space).
   * @param blocked - Whether the hit was guarded.
   * @param isSpecial - Whether the attack was a special move.
   * @param finisher - Whether this is the special's finishing hit.
   */
  private spawnHitFx(
    attackRect: Phaser.Geom.Rectangle,
    hurtRect: Phaser.Geom.Rectangle,
    blocked: boolean,
    isSpecial: boolean,
    finisher: boolean
  ): void {
    const sparkX = (Phaser.Geom.Rectangle.GetCenter(attackRect).x + Phaser.Geom.Rectangle.GetCenter(hurtRect).x) / 2;
    const sparkY = (Phaser.Geom.Rectangle.GetCenter(attackRect).y + Phaser.Geom.Rectangle.GetCenter(hurtRect).y) / 2;

    const color: VfxColor = blocked ? 'blue' : finisher ? 'gold' : 'red';
    const sparkScale = finisher ? 1.7 : isSpecial ? 1.1 : 0.9;
    spawnHitSpark(this, sparkX, sparkY, color, sparkScale);

    if (finisher) {
      this.cameras.main.shake(220, 0.012);
    } else if (isSpecial) {
      this.cameras.main.shake(blocked ? 60 : 90, blocked ? 0.003 : 0.005);
    } else {
      this.cameras.main.shake(blocked ? 60 : 120, blocked ? 0.003 : 0.006);
    }
  }

  /** Ends the round when either fighter is knocked out. */
  private checkForKnockout(): void {
    if (this.p1.isDefeated) {
      this.endRound(2);
    } else if (this.p2.isDefeated) {
      this.endRound(1);
    }
  }

  /**
   * Counts the round clock down while fighting. When it reaches zero the round
   * is decided on remaining health (a tie replays the round as a draw).
   * @param delta - Milliseconds since the previous frame.
   */
  private tickRoundTimer(delta: number): void {
    this.roundTimeMs = Math.max(0, this.roundTimeMs - delta);

    if (this.roundTimeMs <= 0) {
      this.resolveTimeOut();
    }
  }

  /** Decides a timed-out round by comparing remaining health. */
  private resolveTimeOut(): void {
    const p1 = this.p1.health01;
    const p2 = this.p2.health01;

    if (p1 > p2) {
      this.endRound(1, 'TIME UP', '#facc15');
    } else if (p2 > p1) {
      this.endRound(2, 'TIME UP', '#facc15');
    } else {
      this.drawRound();
    }
  }

  /** Handles a drawn round (timeout with equal health): replays the round. */
  private drawRound(): void {
    if (this.phase !== 'fighting') {
      return;
    }

    this.phase = 'roundEnd';
    this.showBanner('DRAW', '#e2e8f0', 1.1);
    this.time.delayedCall(1100, () => this.startRound());
  }

  /**
   * Places the chosen stage fit to the viewport height, anchored at world x=0,
   * and sets up the scrollable world. The stage's on-screen width becomes the
   * world width; the camera is bounded to it so it can scroll horizontally and
   * stop at the stage ends (producing corners).
   */
  private buildStage(): void {
    const cam = this.cameras.main;
    const stage = getStageDefinition(this.config.stageId);
    const source = this.textures.get(stage.key).getSourceImage();
    const scale = cam.height / (source.height || stage.height);
    this.stageWorldWidth = (source.width || stage.width) * scale;
    this.maxScroll = Math.max(0, this.stageWorldWidth - cam.width);

    this.add.image(0, 0, stage.key).setOrigin(0, 0).setScale(scale).setDepth(0);
    cam.setBounds(0, 0, this.stageWorldWidth, cam.height);
  }

  /** Spawns P1 (left, facing right) and P2 (right, facing left). */
  private spawnFighters(): void {
    const cam = this.cameras.main;
    const groundY = Math.round(cam.height * GROUND_FRACTION);
    const minX = EDGE_MARGIN;
    const maxX = this.stageWorldWidth - EDGE_MARGIN;
    const center = this.stageWorldWidth / 2;
    this.spawnX1 = Math.round(center - cam.width * SPAWN_OFFSET_FRACTION);
    this.spawnX2 = Math.round(center + cam.width * SPAWN_OFFSET_FRACTION);

    const hooksFor = (side: 'left' | 'right', getTarget: () => Fighter) => ({
      onSpecialStart: (fighter: Fighter) => {
        const kit = getHeroAbilityKit(fighter.characterId);
        playSuperCutIn(this, {
          characterId: fighter.characterId,
          side,
          color: kit.cutInColor
        });
      },
      onSuperExecute: (fighter: Fighter) => {
        const kit = getHeroAbilityKit(fighter.characterId);
        const target = getTarget();
        spawnHeroDomainVfx(this, (fighter.x + target.x) / 2, groundY, kit.domainStyle, kit.vfxColor, 950);
        this.spawnCallout(fighter, kit.ability4.callout, kit.themeColor);
        this.cameras.main.shake(450, 0.008);
      },
      onProjectile: (fighter: Fighter) => {
        const kit = getHeroAbilityKit(fighter.characterId);
        this.spawnAbilityProjectile(fighter, getTarget(), kit.ability3.projectile, kit.cutInColor);
      },
      onAttackVfx: (
        fighter: Fighter,
        animKey: string,
        abilitySlot: 0 | 1 | 2 | 3 | 4,
        m1Step: 0 | 1 | 2 | 3 | 4
      ) => {
        const kit = getHeroAbilityKit(fighter.characterId);
        const x = fighter.x + fighter.facingDirection * 95;
        const y = fighter.y - fighter.displayHeight * 0.52;
        if (m1Step !== 0) {
          spawnM1Vfx(this, x, y, fighter.facingDirection, kit.m1.style, m1Step, kit.m1.color);
          return;
        }
        const variant =
          abilitySlot === 1 || abilitySlot === 2 || abilitySlot === 4
            ? 'cross'
            : animKey.includes('heavy')
              ? 'heavy'
              : 'single';
        spawnSlashVfx(this, x, y, fighter.facingDirection, variant, kit.vfxColor);
      },
      onMoveCallout: (fighter: Fighter, moveName: string) => {
        const kit = getHeroAbilityKit(fighter.characterId);
        this.spawnCallout(fighter, moveName, kit.themeColor);
      }
    });

    this.p1 = new Fighter({
      scene: this,
      app: this.app,
      characterId: this.config.p1CharacterId,
      x: this.spawnX1,
      groundY,
      facing: 1,
      minX,
      maxX,
      depth: DEPTH_FRONT,
      ...hooksFor('left', () => this.p2)
    });

    this.p2 = new Fighter({
      scene: this,
      app: this.app,
      characterId: this.config.p2CharacterId,
      x: this.spawnX2,
      groundY,
      facing: -1,
      minX,
      maxX,
      depth: DEPTH_BACK,
      ...hooksFor('right', () => this.p1)
    });
  }

  private spawnCallout(fighter: Fighter, text: string, themeColor = 0xfca5a5): void {
    const colorHex = `#${themeColor.toString(16).padStart(6, '0')}`;
    const label = this.add
      .text(fighter.x, fighter.y - fighter.displayHeight - 14, text, {
        color: colorHex,
        fontFamily: 'monospace',
        fontSize: '15px',
        fontStyle: 'bold',
        stroke: '#020617',
        strokeThickness: 4
      })
      .setOrigin(0.5)
      .setDepth(BANNER_DEPTH - 10);

    this.tweens.add({
      targets: label,
      y: label.y - 34,
      alpha: 0,
      duration: 760,
      ease: 'Cubic.Out',
      onComplete: () => label.destroy()
    });
  }

  private spawnAbilityProjectile(
    owner: Fighter,
    target: Fighter,
    spec: AbilityProjectileSpec,
    vfxColor: VfxColor
  ): void {
    const facing = owner.facingDirection;
    const startX = owner.x + facing * 74;
    const startY = owner.y - owner.displayHeight * 0.52;
    const container = this.add.container(startX, startY).setDepth(92);

    const s = spec.size;
    let spinSpeed = 0;

    if (spec.shape === 'arrow') {
      const glow = this.add.ellipse(0, 0, s * 2.9, s * 0.82, spec.color, 0.55);
      const core = this.add.rectangle(0, 0, s * 2.3, 8, spec.coreColor, 1);
      const tip = this.add.triangle(
        s * 1.35 * facing,
        0,
        -10 * facing,
        -10,
        -10 * facing,
        10,
        12 * facing,
        0,
        spec.color,
        1
      );
      container.add([glow, core, tip]);
    } else if (spec.shape === 'orb') {
      const aura = this.add.circle(0, 0, s * 0.95, spec.color, 0.45);
      const ring = this.add.circle(0, 0, s * 0.68, spec.color, 0).setStrokeStyle(3, spec.coreColor, 0.95);
      const core = this.add.circle(0, 0, s * 0.42, spec.coreColor, 1);
      container.add([aura, ring, core]);
      spinSpeed = 6 * facing;
    } else if (spec.shape === 'shuriken') {
      const aura = this.add.circle(0, 0, s * 0.95, spec.color, 0.38);
      const blades = this.add.graphics();
      blades.fillStyle(spec.coreColor, 0.92);
      blades.lineStyle(2, spec.color, 1);
      for (let i = 0; i < 4; i += 1) {
        const angle = (i * Math.PI) / 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const tipX = cos * s * 1.15;
        const tipY = sin * s * 1.15;
        const leftX = -sin * s * 0.28;
        const leftY = cos * s * 0.28;
        blades.fillTriangle(0, 0, leftX, leftY, tipX, tipY);
        blades.strokeTriangle(0, 0, leftX, leftY, tipX, tipY);
      }
      const core = this.add.circle(0, 0, s * 0.34, spec.color, 1);
      container.add([aura, blades, core]);
      spinSpeed = 14 * facing;
    } else if (spec.shape === 'crescent') {
      const arc = this.add.graphics();
      arc.fillStyle(spec.color, 0.65);
      arc.lineStyle(4, spec.coreColor, 1);
      arc.beginPath();
      arc.arc(0, 0, s * 0.95, facing === 1 ? -1.15 : Math.PI - 1.15, facing === 1 ? 1.15 : Math.PI + 1.15, false);
      arc.strokePath();
      const slash = this.add.ellipse(6 * facing, 0, s * 0.65, s * 1.7, spec.color, 0.45);
      const core = this.add.ellipse(10 * facing, 0, s * 0.28, s * 1.35, spec.coreColor, 0.95);
      container.add([slash, core, arc]);
    } else if (spec.shape === 'beam') {
      const glow = this.add.ellipse(0, 0, s * 3.1, s * 1.05, spec.color, 0.5);
      const shaft = this.add.rectangle(-8 * facing, 0, s * 2.5, s * 0.56, spec.color, 0.9);
      const core = this.add.rectangle(0, 0, s * 2.6, s * 0.26, spec.coreColor, 1);
      const head = this.add.circle(s * 1.25 * facing, 0, s * 0.44, spec.coreColor, 0.95);
      container.add([glow, shaft, core, head]);
    } else {
      // 'spear'
      const glow = this.add.ellipse(0, 0, s * 2.7, s * 0.72, spec.color, 0.48);
      const lance = this.add.triangle(
        8 * facing,
        0,
        -s * 1.2 * facing,
        -s * 0.34,
        -s * 1.2 * facing,
        s * 0.34,
        s * 1.45 * facing,
        0,
        spec.coreColor,
        1
      );
      lance.setStrokeStyle(2, spec.color, 1);
      container.add([glow, lance]);
    }

    spawnImpactFlash(this, startX, startY, vfxColor, 38);

    this.projectiles.push({
      owner,
      target,
      x: startX,
      y: startY,
      vx: spec.speed * facing,
      facing,
      damage: spec.damage,
      knockback: spec.knockback,
      hitstun: spec.hitstun,
      color: spec.color,
      vfxColor,
      spinSpeed,
      hitRadius: Math.max(24, spec.size),
      container,
      trailTimer: 0
    });
  }

  private updateProjectiles(seconds: number): void {
    const cam = this.cameras.main;
    const minWorldX = cam.scrollX - 120;
    const maxWorldX = cam.scrollX + cam.width + 120;

    for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
      const proj = this.projectiles[i];
      proj.x += proj.vx * seconds;
      proj.container.setPosition(proj.x, proj.y);
      if (proj.spinSpeed !== 0) {
        proj.container.rotation += proj.spinSpeed * seconds;
      }
      proj.trailTimer += seconds;

      if (proj.trailTimer >= 0.045) {
        proj.trailTimer = 0;
        const ember = this.add
          .circle(proj.x - proj.facing * 26, proj.y + Phaser.Math.Between(-8, 8), 5, proj.color, 0.8)
          .setDepth(91);
        this.tweens.add({
          targets: ember,
          alpha: 0,
          scale: 0.2,
          duration: 180,
          onComplete: () => ember.destroy()
        });
      }

      if (proj.x < minWorldX || proj.x > maxWorldX) {
        proj.container.destroy(true);
        this.projectiles.splice(i, 1);
        continue;
      }

      if (proj.target.isDefeated) {
        continue;
      }

      const hurt = proj.target.getHurtRect();
      const arrowRect = new Phaser.Geom.Rectangle(
        proj.x - proj.hitRadius,
        proj.y - proj.hitRadius * 0.55,
        proj.hitRadius * 2,
        proj.hitRadius * 1.1
      );

      if (hurt && Phaser.Geom.Intersects.RectangleToRectangle(arrowRect, hurt)) {
        if (proj.target.isImmune) {
          spawnHitSpark(this, proj.x, proj.y, 'blue', 1.2);
          spawnImpactFlash(this, proj.x, proj.y, 'blue', 48);
          this.spawnCallout(proj.target, 'IMMUNE!', 0x38bdf8);
          proj.container.destroy(true);
          this.projectiles.splice(i, 1);
          continue;
        }

        const guard = proj.target.getGuardRect();
        const blocked = guard !== null && Phaser.Geom.Intersects.RectangleToRectangle(arrowRect, guard);

        const wasInHitstun = proj.target.inHitstun;
        proj.target.applyHit(
          { kind: 'special', height: 'high', damage: proj.damage, knockback: proj.knockback, hitstun: proj.hitstun },
          proj.facing,
          blocked
        );
        proj.target.flashHit(blocked);
        proj.owner.registerOffense(blocked, false);
        proj.target.registerDefense(blocked);
        if (!blocked) {
          this.registerComboHit(proj.owner, wasInHitstun);
        }

        spawnHitSpark(this, proj.x, proj.y, blocked ? 'blue' : proj.vfxColor, 1.45);
        spawnImpactFlash(this, proj.x, proj.y, blocked ? 'blue' : proj.vfxColor, 64);
        this.cameras.main.shake(170, 0.01);

        proj.container.destroy(true);
        this.projectiles.splice(i, 1);
      }
    }
  }

  private clearProjectiles(): void {
    this.projectiles.forEach((proj) => proj.container.destroy(true));
    this.projectiles = [];
  }

  /**
   * Group-camera tracking: scrolls horizontally to keep both fighters framed
   * around their midpoint, clamped to the stage ends (so it stops at corners),
   * then turns the visible screen edges into movement walls for both fighters.
   * This is what produces the "camera locks until one fighter relents" feel —
   * neither fighter can walk off-screen, so they can only separate as far as the
   * screen is wide.
   * @param snap - When true, jumps to the target scroll instantly (round start)
   *   instead of easing toward it.
   */
  private updateCamera(snap: boolean): void {
    const cam = this.cameras.main;
    const viewWidth = cam.width;
    const midpoint = (this.p1.x + this.p2.x) / 2;
    const targetScroll = Phaser.Math.Clamp(midpoint - viewWidth / 2, 0, this.maxScroll);
    const scrollX = snap ? targetScroll : Phaser.Math.Linear(cam.scrollX, targetScroll, CAMERA_LERP);

    cam.setScroll(scrollX, 0);

    const leftWall = scrollX + EDGE_MARGIN;
    const rightWall = scrollX + viewWidth - EDGE_MARGIN;
    this.p1.setHorizontalBounds(leftWall, rightWall);
    this.p2.setHorizontalBounds(leftWall, rightWall);
  }

  /** Registers the two keyboard control schemes plus the menu shortcut. */
  private registerKeys(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      throw new Error('MatchScene requires keyboard input');
    }

    const codes = Phaser.Input.Keyboard.KeyCodes;
    this.p1Keys = {
      left: keyboard.addKey(codes.A),
      right: keyboard.addKey(codes.D),
      crouch: keyboard.addKey(codes.S),
      block: keyboard.addKey(codes.C),
      jump: keyboard.addKey(codes.W),
      light: keyboard.addKey(codes.F),
      heavy: keyboard.addKey(codes.G),
      special: keyboard.addKey(codes.V),
      ability1: keyboard.addKey(codes.Q),
      ability1Alt: keyboard.addKey(codes.ONE),
      ability2: keyboard.addKey(codes.E),
      ability2Alt: keyboard.addKey(codes.TWO),
      ability3: keyboard.addKey(codes.R),
      ability3Alt: keyboard.addKey(codes.THREE),
      ability4: keyboard.addKey(codes.T),
      ability4Alt: keyboard.addKey(codes.FOUR)
    };

    this.p2Keys = {
      left: keyboard.addKey(codes.LEFT),
      right: keyboard.addKey(codes.RIGHT),
      crouch: keyboard.addKey(codes.DOWN),
      block: keyboard.addKey(codes.FORWARD_SLASH),
      jump: keyboard.addKey(codes.UP),
      light: keyboard.addKey(codes.COMMA),
      heavy: keyboard.addKey(codes.PERIOD),
      special: keyboard.addKey(codes.L),
      ability1: keyboard.addKey(codes.U),
      ability1Alt: keyboard.addKey(codes.SEVEN),
      ability2: keyboard.addKey(codes.I),
      ability2Alt: keyboard.addKey(codes.EIGHT),
      ability3: keyboard.addKey(codes.O),
      ability3Alt: keyboard.addKey(codes.NINE),
      ability4: keyboard.addKey(codes.P),
      ability4Alt: keyboard.addKey(codes.ZERO)
    };

    keyboard.on('keydown-ESC', () => this.goToMenu());
    keyboard.on('keydown-BACKSPACE', () => this.goToMenu());
    keyboard.on('keydown-M', () => this.toggleMoveList());
    keyboard.on('keydown-N', () => this.toggleMusic());
    keyboard.on('keydown-R', () => {
      if (this.phase === 'matchOver') {
        this.rematch();
      }
    });
  }

  private toggleMusic(): void {
    const music = getBackgroundMusic();
    music.setPaused(!music.isPaused());
  }

  /**
   * Reads a control scheme into a fighter input snapshot. Held keys map to held
   * inputs; jump/light/heavy use edge detection so they fire once per press.
   * @param keys - The player's resolved keys.
   */
  private readKeys(keys: PlayerKeys): FighterInput {
    return {
      left: keys.left.isDown,
      right: keys.right.isDown,
      crouch: keys.crouch.isDown,
      block: keys.block.isDown,
      jump: Phaser.Input.Keyboard.JustDown(keys.jump),
      light: Phaser.Input.Keyboard.JustDown(keys.light),
      heavy: Phaser.Input.Keyboard.JustDown(keys.heavy),
      special: Phaser.Input.Keyboard.JustDown(keys.special),
      ability1: Phaser.Input.Keyboard.JustDown(keys.ability1) || Phaser.Input.Keyboard.JustDown(keys.ability1Alt),
      ability2: Phaser.Input.Keyboard.JustDown(keys.ability2) || Phaser.Input.Keyboard.JustDown(keys.ability2Alt),
      ability3: Phaser.Input.Keyboard.JustDown(keys.ability3) || Phaser.Input.Keyboard.JustDown(keys.ability3Alt),
      ability4: Phaser.Input.Keyboard.JustDown(keys.ability4) || Phaser.Input.Keyboard.JustDown(keys.ability4Alt)
    };
  }

  /** Draws the control legend at the bottom of the screen. */
  private createControlsLegend(): void {
    const { centerX, height } = this.cameras.main;
    const p1 = 'P1: WASD (S+A/D Slide) • M1 (Click/F) 4-hit • G heavy • C block • Q/E/R/T';
    const p2 = this.config.mode === '1vcpu' ? 'P2: CPU' : 'P2: Arrows (Down+L/R Slide) • , (M1)/. • U/I/O/P';

    this.add
      .text(centerX, height - 16, `${p1}   |   ${p2}   |   M Moves   N Music   Esc Menu`, {
        color: '#cbd5f5',
        fontFamily: 'monospace',
        fontSize: '11px',
        backgroundColor: 'rgba(2, 6, 23, 0.72)',
        padding: { x: 10, y: 4 }
      })
      .setOrigin(0.5)
      .setDepth(HUD_DEPTH)
      .setScrollFactor(0);
  }

  private toggleMoveList(): void {
    this.moveListVisible = !this.moveListVisible;

    if (!this.moveListPanel) {
      const { centerX, centerY } = this.cameras.main;
      const panel = this.add.container(centerX, centerY).setDepth(OVERLAY_DEPTH + 10).setScrollFactor(0);
      const p1Def = getCharacterDefinition(this.config.p1CharacterId);
      const p2Def = getCharacterDefinition(this.config.p2CharacterId);
      const p1Kit = getHeroAbilityKit(this.config.p1CharacterId);
      const p2Kit = getHeroAbilityKit(this.config.p2CharacterId);

      const bg = this.add
        .rectangle(0, 0, 820, 440, 0x05070d, 0.94)
        .setStrokeStyle(3, p1Kit.themeColor, 1);

      const title = this.add
        .text(0, -190, `${p1Def.label.toUpperCase()} — M1 COMBO & ABILITIES`, {
          color: `#${p1Kit.themeColor.toString(16).padStart(6, '0')}`,
          fontFamily: 'monospace',
          fontSize: '20px',
          fontStyle: 'bold'
        })
        .setOrigin(0.5);

      const bodyLines = [
        `M1 HERO COMBO (Left Click or F x4):`,
        `  ${p1Kit.m1.moves.join(' -> ')}   |   Air M1: ${p1Kit.m1.airMove}`,
        '  Movement: Jump [W] over foes • Slide [S + A/D] underneath jumping foes',
        '  Chain M1 hits into Ability 1 [Q/1] -> Follow-up [E/2] -> Super [T/4]',
        '',
        `P1 ${p1Def.label.toUpperCase()} ABILITIES (Click HUD cards or press Q / E / R / T):`,
        `  • [1/Q] ${p1Kit.ability1.name.padEnd(14)} (${p1Kit.ability1.notation}) : Lunge strike / press E to chain`,
        `  • [2/E] ${p1Kit.ability2.name.padEnd(14)} (${p1Kit.ability2.notation}) : Heavy follow-up finisher`,
        `  • [3/R] ${p1Kit.ability3.name.padEnd(14)} (${p1Kit.ability3.notation}) : Launches ${p1Kit.ability3.projectile.name}`,
        `  • [4/T] ${p1Kit.ability4.name.padEnd(14)} (${p1Kit.ability4.notation}) : Super Art at 100% Meter`,
        '',
        `P2 ${p2Def.label.toUpperCase()} M1 & ABILITIES (${this.config.mode === '1vcpu' ? 'CPU' : 'Keys , + U / I / O / P'}):`,
        `  [M1] ${p2Kit.m1.moves[3]}  •  [1] ${p2Kit.ability1.name}  •  [2] ${p2Kit.ability2.name}  •  [3] ${p2Kit.ability3.name}  •  [4] ${p2Kit.ability4.name}`
      ];

      const body = this.add
        .text(-378, -152, bodyLines.join('\n'), {
          color: '#e2e8f0',
          fontFamily: 'monospace',
          fontSize: '13px',
          lineSpacing: 6
        })
        .setOrigin(0, 0);

      const hint = this.add
        .text(0, 192, 'Press M to close', {
          color: '#94a3b8',
          fontFamily: 'monospace',
          fontSize: '12px'
        })
        .setOrigin(0.5);

      panel.add([bg, title, body, hint]);
      this.moveListPanel = panel;
    }

    this.moveListPanel.setVisible(this.moveListVisible);
  }

  /** Resets both fighters to their corners and runs the round intro. */
  private startRound(): void {
    this.time.timeScale = 1;
    this.tweens.timeScale = 1;
    this.phase = 'intro';
    this.roundTimeMs = ROUND_SECONDS * 1000;
    this.queuedP1Ability = null;
    this.queuedP1M1 = false;
    this.p1ComboCount = 0;
    this.p2ComboCount = 0;
    this.lastRelativeSide = 1;
    this.clearProjectiles();

    const fullMin = EDGE_MARGIN;
    const fullMax = this.stageWorldWidth - EDGE_MARGIN;
    this.p1.setHorizontalBounds(fullMin, fullMax);
    this.p2.setHorizontalBounds(fullMin, fullMax);

    this.p1.resetForRound(this.spawnX1, 1);
    this.p2.resetForRound(this.spawnX2, -1);
    this.p1.setDepthBase(DEPTH_FRONT);
    this.p2.setDepthBase(DEPTH_BACK);
    this.updateCamera(true);
    this.hud.animateFill();
    this.hud.updateWins(this.p1Wins, this.p2Wins);

    this.showBanner(`ROUND ${this.roundNumber}`, '#f8fafc');

    this.time.delayedCall(900, () => {
      if (this.phase !== 'intro') {
        return;
      }

      this.showBanner('FIGHT!', '#facc15', 1.15);
      this.phase = 'fighting';
      this.p1.setFrozen(false);
      this.p2.setFrozen(false);

      this.time.delayedCall(650, () => this.hideBanner());
    });
  }

  /**
   * Concludes the current round, tallies the win, and either advances to the
   * next round or ends the match.
   * @param winner - Which player won (1 or 2).
   * @param bannerText - The banner to show (defaults to a knockout).
   * @param bannerColor - The banner colour.
   */
  private endRound(winner: 1 | 2, bannerText = 'K.O.', bannerColor = '#f43f5e'): void {
    if (this.phase !== 'fighting') {
      return;
    }

    this.phase = 'roundEnd';

    if (winner === 1) {
      this.p1Wins += 1;
    } else {
      this.p2Wins += 1;
    }

    const winnerName =
      winner === 1
        ? `P1 ${getCharacterDefinition(this.config.p1CharacterId).label}`
        : `${this.config.mode === '1vcpu' ? 'CPU' : 'P2'} ${getCharacterDefinition(this.config.p2CharacterId).label}`;

    // Brief dramatic K.O. slow-mo + impact flash/shake
    this.cameras.main.flash(220, 255, 65, 90, false);
    this.cameras.main.shake(280, 0.011);
    this.time.timeScale = 0.48;
    this.tweens.timeScale = 0.72;
    this.showBanner(bannerText, bannerColor, 1.25);

    this.time.delayedCall(220, () => {
      this.time.timeScale = 1;
      this.tweens.timeScale = 1;
    });

    this.time.delayedCall(1100, () => {
      this.time.timeScale = 1;
      this.tweens.timeScale = 1;
      const matchOver = this.p1Wins >= ROUNDS_TO_WIN || this.p2Wins >= ROUNDS_TO_WIN;

      if (matchOver) {
        this.endMatch(winnerName, winner);
      } else {
        this.roundNumber += 1;
        this.startRound();
      }
    });
  }

  /**
   * Shows the game-over overlay with the match winner and rematch / menu options.
   * @param winnerName - The display name of the match winner.
   * @param winner - Winning side (1 or 2).
   */
  private endMatch(winnerName: string, winner: 1 | 2): void {
    this.phase = 'matchOver';
    this.hideBanner();
    getSessionRecordStore().recordMatch(winner === 1);
    void getAccountService().recordMatchOutcome(winner === 1, this.config.p1CharacterId).catch(() => {});

    const { centerX, centerY, width, height } = this.cameras.main;

    const dim = this.add
      .rectangle(centerX, centerY, width, height, 0x020617, 0)
      .setDepth(OVERLAY_DEPTH)
      .setScrollFactor(0);
    this.tweens.add({ targets: dim, alpha: 0.68, duration: 280, ease: 'Quad.Out' });

    const title = this.add
      .text(centerX, centerY - 90, `${winnerName}  WINS!`, {
        color: '#facc15',
        fontFamily: '"Press Start 2P", "Silkscreen", monospace',
        fontStyle: 'italic bold',
        fontSize: '34px',
        stroke: '#020617',
        strokeThickness: 8,
        align: 'center'
      })
      .setOrigin(0.5)
      .setDepth(OVERLAY_DEPTH + 1)
      .setScrollFactor(0)
      .setScale(1.8)
      .setAlpha(0);

    this.tweens.add({
      targets: title,
      scale: 1,
      alpha: 1,
      duration: 320,
      ease: 'Back.easeOut',
      onComplete: () => {
        spawnBurstSparks(this, centerX, centerY - 90, 0xfacc15, 16, OVERLAY_DEPTH, 0);
      }
    });

    const score = this.add
      .text(centerX, centerY - 26, `${this.p1Wins} - ${this.p2Wins}`, {
        color: '#e2e8f0',
        fontFamily: '"Silkscreen", monospace',
        fontSize: '28px',
        stroke: '#020617',
        strokeThickness: 5
      })
      .setOrigin(0.5)
      .setDepth(OVERLAY_DEPTH + 1)
      .setScrollFactor(0)
      .setScale(0.6)
      .setAlpha(0);

    this.tweens.add({
      targets: score,
      scale: 1,
      alpha: 1,
      delay: 140,
      duration: 240,
      ease: 'Back.easeOut'
    });

    const rematch = this.makeOverlayButton(centerX, centerY + 42, 'REMATCH  (R)', 200, () => this.rematch());
    const menu = this.makeOverlayButton(centerX, centerY + 100, 'MAIN MENU  (ESC)', 260, () => this.goToMenu());

    this.overlay = [dim, title, score, rematch, menu];
  }

  /**
   * Builds a clickable overlay button with hover and entrance animation feedback.
   * @param x - Centre x.
   * @param y - Centre y.
   * @param label - Button text.
   * @param delay - Entrance delay in ms.
   * @param onClick - Click handler.
   */
  private makeOverlayButton(
    x: number,
    y: number,
    label: string,
    delay: number,
    onClick: () => void
  ): Phaser.GameObjects.Text {
    const button = this.add
      .text(x, y + 12, label, {
        color: '#e2e8f0',
        fontFamily: '"Silkscreen", monospace',
        fontSize: '20px',
        backgroundColor: 'rgba(15, 23, 42, 0.92)',
        padding: { x: 20, y: 10 }
      })
      .setOrigin(0.5)
      .setDepth(OVERLAY_DEPTH + 1)
      .setScrollFactor(0)
      .setAlpha(0)
      .setInteractive({ useHandCursor: true });

    this.tweens.add({
      targets: button,
      y,
      alpha: 1,
      delay,
      duration: 240,
      ease: 'Back.easeOut'
    });

    button.on('pointerover', () => {
      playUiHoverSound(this.app.settingsStore.getState());
      button.setColor('#facc15');
      this.tweens.add({ targets: button, scale: 1.07, duration: 110, ease: 'Back.easeOut' });
    });
    button.on('pointerout', () => {
      button.setColor('#e2e8f0');
      this.tweens.add({ targets: button, scale: 1, duration: 110, ease: 'Quad.easeOut' });
    });
    button.on('pointerdown', onClick);

    return button;
  }

  /** Restarts the match from round 1 with the same configuration. */
  private rematch(): void {
    this.overlay.forEach((object) => object.destroy());
    this.overlay = [];
    this.roundNumber = 1;
    this.p1Wins = 0;
    this.p2Wins = 0;
    this.cpu = this.config.mode === '1vcpu' ? new CpuController() : undefined;
    this.startRound();
  }

  /**
   * Shows the centre banner with a dramatic arcade slam-in tween and spark burst.
   * @param text - The banner text.
   * @param color - The text colour.
   * @param peakScale - The scale to settle at (default 1).
   */
  private showBanner(text: string, color: string, peakScale = 1): void {
    const colorNum = Phaser.Display.Color.HexStringToColor(color).color;
    this.banner.setText(text).setColor(color).setScale(peakScale * 2.05).setAlpha(0);
    this.tweens.add({
      targets: this.banner,
      alpha: 1,
      scale: peakScale,
      duration: 240,
      ease: 'Back.easeOut'
    });
    spawnBurstSparks(
      this,
      this.cameras.main.centerX,
      this.cameras.main.centerY - 40,
      colorNum,
      10,
      BANNER_DEPTH - 1,
      0
    );
  }

  /** Fades the centre banner out. */
  private hideBanner(): void {
    this.tweens.add({ targets: this.banner, alpha: 0, scale: 1.15, duration: 260, ease: 'Quad.easeOut' });
  }
}

/**
 * Whether an input represents the fighter actively doing something (moving,
 * jumping, or attacking) this frame — used to decide who draws in front.
 * @param input - The fighter input snapshot to test.
 */
function isActing(input: FighterInput): boolean {
  return Boolean(
    input.left ||
      input.right ||
      input.jump ||
      input.light ||
      input.heavy ||
      input.special ||
      input.m1 ||
      input.ability1 ||
      input.ability2 ||
      input.ability3 ||
      input.ability4
  );
}

/**
 * A placeholder CPU opponent: mostly idle, occasionally performing a short
 * random action (an M1 chain, a strike, a hop, or a brief walk/crouch/block).
 */
class CpuController {
  private nextDecisionAt = 0;
  private holdUntil = 0;
  private moveDir = 0;
  private holdCrouch = false;
  private holdBlock = false;
  private m1BurstRemaining = 0;
  private nextM1BurstAt = 0;

  triggerSlideToward(timeMs: number, dir: 1 | -1): void {
    this.moveDir = dir;
    this.holdCrouch = true;
    this.holdBlock = false;
    this.holdUntil = Math.max(this.holdUntil, timeMs + 340);
  }

  /**
   * Produce the CPU's input for this frame.
   * @param timeMs - The current Phaser clock time in ms.
   */
  update(timeMs: number): FighterInput {
    const input: FighterInput = { ...NEUTRAL_FIGHTER_INPUT };

    if (this.m1BurstRemaining > 0 && timeMs >= this.nextM1BurstAt) {
      input.m1 = true;
      this.m1BurstRemaining -= 1;
      this.nextM1BurstAt = timeMs + 175;
    }

    if (timeMs >= this.nextDecisionAt) {
      this.decide(timeMs, input);
      this.nextDecisionAt = timeMs + Phaser.Math.Between(700, 1650);
    }

    if (timeMs < this.holdUntil) {
      if (this.moveDir < 0) {
        input.left = true;
      } else if (this.moveDir > 0) {
        input.right = true;
      }
      input.crouch = input.crouch || this.holdCrouch;
      input.block = input.block || this.holdBlock;
    } else {
      this.moveDir = 0;
      this.holdCrouch = false;
      this.holdBlock = false;
    }

    return input;
  }

  private decide(timeMs: number, input: FighterInput): void {
    const roll = Math.random();

    if (roll < 0.28) {
      return;
    }
    if (roll < 0.5) {
      input.m1 = true;
      this.m1BurstRemaining = Phaser.Math.Between(1, 3);
      this.nextM1BurstAt = timeMs + 175;
      return;
    }
    if (roll < 0.63) {
      input.heavy = true;
      return;
    }
    if (roll < 0.72) {
      input.jump = true;
      return;
    }
    if (roll < 0.9) {
      this.moveDir = Math.random() < 0.5 ? -1 : 1;
      this.holdUntil = timeMs + Phaser.Math.Between(350, 800);
      return;
    }

    if (Math.random() < 0.5) {
      this.holdCrouch = true;
    } else {
      this.holdBlock = true;
    }
    this.holdUntil = timeMs + Phaser.Math.Between(350, 800);
  }
}
