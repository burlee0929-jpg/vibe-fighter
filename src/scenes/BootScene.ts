import { preloadStarterAssets, registerStarterAnimations } from '../game/assets';
import { registerGeneratedAssets } from '../game/generatedAssets';
import { prepareCustomHeroes } from '../game/customHeroes';
import { prepareMyFighters } from '../game/myFighterLoader';
import { prepareSukunaCharacter } from '../game/sukuna';
import { registerTileAtlasFrames } from '../game/tileAtlas';
import { registerQuestUiAtlasFrames } from '../game/uiAtlas';
import { registerFightingUiAtlasFrames } from '../game/fightingUiAtlas';
import { SCENE_KEYS } from '../game/types';
import { BaseScene } from './BaseScene';

export class BootScene extends BaseScene {
  constructor() {
    super(SCENE_KEYS.Boot);
  }

  preload(): void {
    preloadStarterAssets(this);
  }

  create(): void {
    this.cameras.main.setBackgroundColor('rgba(0, 0, 0, 0)');
    this.markActiveScene(SCENE_KEYS.Boot);
    registerGeneratedAssets(this);
    registerTileAtlasFrames(this);
    registerQuestUiAtlasFrames(this);
    registerFightingUiAtlasFrames(this);

    // Fighters sliced from raw sheets are prepared before animations register.
    void Promise.all([prepareSukunaCharacter(this), prepareCustomHeroes(this), prepareMyFighters(this)])
      .catch((error) => console.error('[boot] could not prepare sliced fighters', error))
      .then(() => {
        registerStarterAnimations(this);
        this.scene.start(SCENE_KEYS.Splash);
      });
  }
}
