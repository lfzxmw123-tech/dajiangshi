import * as THREE from 'three';

// Runtime assets. Keeping every external path here makes missing resources
// easy to audit without searching through the gameplay loop.
export const DATA_PATH = new URL('../../religious_center_L2_P/meta.lcc2', location.href).href;
export const REGULAR_MODEL_PATH = './assets/models/animated_zombie_walking.glb';
export const EXTRA_ZOMBIE_MODEL_PATH = './assets/models/zombie.glb';
export const FEMALE_ZOMBIE_MODEL_PATH = './assets/models/animated_female_zombie.glb';
export const SOLDIER_MODEL_PATH = './assets/models/swat.glb';
export const SOLDIER_RIFLE_PATH = './assets/models/akm.glb';
export const HERO_MODEL_PATH = './assets/models/male_hero_character.glb';
export const BOSS_MODEL_PATH = new URL('../../doom_slayer_-_doom__the_dark_ages_-_rigged.glb', location.href).href;

export const MODEL_MATRIX = new THREE.Matrix4(
  -1, 0, 0, 0,
  0, 0, 1, 0,
  0, 1, 0, 0,
  0, 0, 0, 1
);

export const QUALITY = {
  high: { dpr: Math.min(devicePixelRatio, 2), splats: 8000000, node: 4000000, lod: 0, distance: 240 },
  balanced: { dpr: Math.min(devicePixelRatio, 1.35), splats: 2200000, node: 1000000, lod: 1, distance: 200 },
  low: { dpr: Math.min(devicePixelRatio, .9), splats: 900000, node: 400000, lod: 2, distance: 100 }
};

// Ranged-bot tuning. Distances are metres and durations are milliseconds.
export const SOLDIER_ENGAGE_RANGE_M = 17;
export const SOLDIER_MAX_FIRE_RANGE_M = 46;
export const SOLDIER_REACTION_MIN_MS = 460;
export const SOLDIER_REACTION_MAX_MS = 820;
export const SOLDIER_BURST_SHOTS = 2;
export const SOLDIER_SHOT_INTERVAL_MS = 145;
export const SOLDIER_BURST_COOLDOWN_MS = 3800;
export const SOLDIER_RELOAD_MS = 1900;
export const SOLDIER_SHOTS_PER_MAGAZINE = 12;
export const SOLDIER_BASE_ACCURACY = .28;
export const SOLDIER_ACCURACY_PER_ROUND = .02;
export const SOLDIER_MOVING_TARGET_PENALTY = .62;
export const SOLDIER_FAR_ACCURACY_FACTOR = .38;
export const SOLDIER_DAMAGE_BODY = 8;
export const SOLDIER_MAX_SIMULTANEOUS_ATTACKERS = 2;
export const SOLDIER_REPOSITION_MS = 1400;
export const SOLDIER_HEIGHT_M = 1.78;
export const SOLDIER_EYE_HEIGHT_M = 1.55;
export const SOLDIER_FACING_YAW_RAD = 0;
export const SOLDIER_RIFLE_LENGTH_M = .72;
export const SOLDIER_RIFLE_ROTATION_RAD = [0, Math.PI / 2, Math.PI / 2];
export const SOLDIER_RIFLE_OFFSET_M = [.02, .01, -.06];
export const TRACER_POOL_SIZE = 14;
export const TRACER_LIFE_S = .07;
export const CORPSE_MAX_HOLD_MS = 3600;

export const SPAWNS = [
  [-12, -10], [12, -10], [16, 0], [-16, 0],
  [10, -18], [-10, -18], [18, 10], [-18, 10], [10, 18], [-10, 18]
];

export const ZOMBIE_SPAWN_CLUSTERS = [
  [-8, -10], [-4, -12],
  [8, -10], [4, -12],
  [-8, 8], [8, 8]
];
