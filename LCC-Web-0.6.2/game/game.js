import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { playerController } from 'three-player-controller';
import { LCCRender } from '../sdk/lcc-sdk-three.js';
import {
  DATA_PATH, REGULAR_MODEL_PATH, EXTRA_ZOMBIE_MODEL_PATH, FEMALE_ZOMBIE_MODEL_PATH,
  SOLDIER_MODEL_PATH, SOLDIER_RIFLE_PATH, HERO_MODEL_PATH, BOSS_MODEL_PATH,
  MODEL_MATRIX, QUALITY, SPAWNS, ZOMBIE_SPAWN_CLUSTERS,
  SOLDIER_ENGAGE_RANGE_M, SOLDIER_MAX_FIRE_RANGE_M,
  SOLDIER_REACTION_MIN_MS, SOLDIER_REACTION_MAX_MS, SOLDIER_BURST_SHOTS,
  SOLDIER_SHOT_INTERVAL_MS, SOLDIER_BURST_COOLDOWN_MS, SOLDIER_RELOAD_MS,
  SOLDIER_SHOTS_PER_MAGAZINE, SOLDIER_BASE_ACCURACY, SOLDIER_ACCURACY_PER_ROUND,
  SOLDIER_MOVING_TARGET_PENALTY, SOLDIER_FAR_ACCURACY_FACTOR, SOLDIER_DAMAGE_BODY,
  SOLDIER_MAX_SIMULTANEOUS_ATTACKERS, SOLDIER_REPOSITION_MS, SOLDIER_HEIGHT_M,
  SOLDIER_EYE_HEIGHT_M, SOLDIER_FACING_YAW_RAD, SOLDIER_RIFLE_LENGTH_M,
  SOLDIER_RIFLE_ROTATION_RAD, SOLDIER_RIFLE_OFFSET_M, TRACER_POOL_SIZE,
  TRACER_LIFE_S, CORPSE_MAX_HOLD_MS
} from './game-config.js';

const $ = (s) => document.querySelector(s);
const canvas = $('#game-canvas');
const query = new URLSearchParams(location.search);
let testMode = query.has('testmode');
// Two independent mission profiles. `zombie` keeps the original melee horde.
// `cs` is a round-based firefight against ranged SWAT bots.
const GAME_MODES = {
  zombie: {
    label: '感染禁区',
    roundLabel: '波次',
    counts: [3, 5, 7, 9, 1],
    countRanges: [[3, 6], [5, 9], [7, 12], [9, 15], [1, 1]],
    // Spawn infected one by one. The model pack contains four appearances,
    // but each spawn independently samples one and repeats are allowed.
    spawnInterval: (round) => Math.max(.65, 1.35 - round * .12),
    intermissionMs: 3500,
    replenishOnRoundEnd: false
  },
  cs: {
    label: '黑影对战',
    roundLabel: '回合',
    counts: [2, 3, 4, 5, 6],
    spawnInterval: () => .9,
    intermissionMs: 4200,
    replenishOnRoundEnd: true
  }
};
let gameMode = 'zombie';
let primaryFireHeld = false;
const modeConfig = () => GAME_MODES[gameMode];
const isCsMode = () => gameMode === 'cs';

// Without an attacker cap the whole squad reaches the engage ring together and
// deletes the player in one volley. Keeping a queue is what makes the fight
// readable: measured at 3 bots / 10 m this was 66 HP lost in 4 s before the cap.
// Yaw applied to the soldier mesh inside its lookAt-oriented group. Set to
// Math.PI if the bots turn out to run backwards; verify visually, not by rig name.
// Rifle prop transform in right-hand bone space. These were fitted by eye and
// are the first thing to adjust if the weapon looks detached.
const roundCount = () => modeConfig().counts.length;
// Zombies arrive as readable groups instead of an even ring around the map.
// Soldiers keep the wider tactical spawn list above.
let rngState = globalThis.crypto?.getRandomValues
  ? globalThis.crypto.getRandomValues(new Uint32Array(1))[0] || 0x13d1a1
  : (Date.now() >>> 0) || 0x13d1a1;
function random() {
  rngState ^= rngState << 13; rngState ^= rngState >>> 17; rngState ^= rngState << 5;
  return (rngState >>> 0) / 4294967296;
}

function randomWaveCount(range, round) {
  const [min, max] = range;
  if (min >= max) return min;
  const span = max - min + 1;
  const cryptoValue = globalThis.crypto?.getRandomValues
    ? globalThis.crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296
    : random();
  let value = min + Math.floor(cryptoValue * span);
  try {
    const key = `zombie-wave-count-${round}`;
    const previous = Number(sessionStorage.getItem(key));
    // Random values may legitimately repeat. For development, force a visible
    // change after refresh so it is obvious that the new wave was regenerated.
    if (Number.isFinite(previous) && previous === value) {
      value = min + ((value - min + 1 + Math.floor(random() * (span - 1))) % span);
    }
    sessionStorage.setItem(key, String(value));
  } catch {}
  return value;
}

const ui = {
  start: $('#start-screen'), pause: $('#pause-screen'), result: $('#result-screen'), loading: $('#loading'),
  loadingLabel: $('#loading span'), loadingPercent: $('#loading-percent'), loadingBar: $('#loading-bar'),
  health: $('#health-value'), healthBar: $('#health-bar'), ammo: $('#ammo'), reserve: $('#reserve'),
  wave: $('#wave'), alive: $('#alive'), kills: $('#kills'), score: $('#score'), crosshair: $('#crosshair'),
  bossPanel: $('#boss-panel'), bossHealth: $('#boss-health'),
  hitmarker: $('#hitmarker'), damage: $('#damage-flash'), toast: $('#toast'), quality: $('#quality'),
  muzzle: $('#muzzle-flash'), weaponName: $('#weapon-name'),
  mode: $('#mode'), roundLabel: $('#round-label'), vehiclePrompt: $('#vehicle-prompt')
};

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setClearColor(0x020504);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.28;
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x06100c, .006);
const viewmodelScene = new THREE.Scene();
const viewmodelRoot = new THREE.Group();
viewmodelScene.add(viewmodelRoot);
viewmodelScene.add(new THREE.HemisphereLight(0xf2fff8, 0x303830, 2.5));
// PBR metal on the viewmodel (AK metallicRoughness texture, G36C metalness .9)
// reflects the environment rather than the hemisphere light; without one it
// renders near-black next to the dielectric arms. Viewmodel pass only.
const VIEWMODEL_ENV_INTENSITY = .9;
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  viewmodelScene.environment = pmrem.fromScene(room, .04).texture;
  viewmodelScene.environmentIntensity = VIEWMODEL_ENV_INTENSITY;
  room.dispose();
  pmrem.dispose();
}
const camera = new THREE.PerspectiveCamera(66, innerWidth / innerHeight, .08, 500);
camera.position.set(-34.86, 1.90, -1.40);
camera.rotation.order = 'YXZ';
scene.add(camera);

const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const keys = new Set();
const enemies = [];
const casings = [];
const impactParticles = [];
const velocity = new THREE.Vector3();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const vehicleImpactLocal = new THREE.Vector3();
const vehicleImpactNormal = new THREE.Vector3();
const vehicleImpactVelocity = new THREE.Vector3();
const vehicleImpactQuat = new THREE.Quaternion();
const vehicleBoardingLocal = new THREE.Vector3();
const vehicleBoardingDoor = new THREE.Vector3();
const vehicleBoardingSide = new THREE.Vector3();
const VEHICLE_BOARDING_DISTANCE = 1.65;
let lccObject;
let worldCollisionMesh;
const enemyGroundRaycaster = new THREE.Raycaster();
enemyGroundRaycaster.firstHitOnly = true;
const enemyGroundOrigin = new THREE.Vector3();
const enemyGroundDown = new THREE.Vector3(0, -1, 0);
let sceneReady = false;
let running = false;
let paused = false;
let gameOver = false;
let yaw = 0, pitch = 0;
let health = 100, magazine = 30, reserve = 90, kills = 0, score = 0;
let wave = 0, remainingToSpawn = 0, currentWaveTotal = 0, spawnCooldown = 0, betweenWaves = false;
let currentZombieAliveCap = 1;
let reloading = false, reloadEnd = 0, lastShot = 0, gunKick = 0, shake = 0;
let gunSlideKick = 0;
let recoilPitch = 0, recoilYaw = 0, recoilVelocity = 0;
let audioContext;
let zombieTemplate;
let zombieTemplates = [];
let bossTemplate;
let zombieAnimations = {};
let zombieAnimationVariants = [];
let zombieAnimatedHeight = 0;
let zombieAnimatedHeights = [];
let bossModelPromise;
let bossLoadComplete = false;
let playerPhysics;
let playerPhysicsReady = false;
let carModel;
let carVehicle;
let thirdPersonRifle;
let thirdPersonMuzzle;
const thirdPersonMuzzlePosition = new THREE.Vector3();
let vehicleCameraYawOffset = 0;
let vehicleCameraPitch = .34;
let vehicleCameraInitialized = false;
let vehicleCameraDragging = false;
const vehicleCameraForward = new THREE.Vector3();
const vehicleCameraTarget = new THREE.Vector3();
const vehicleCameraDesired = new THREE.Vector3();
const PLAYER_EYE_HEIGHT = 1.65;
let soldierTemplate;
let soldierRifleTemplate;
let soldierAnimations = {};
let soldierModelPromise;
let soldierLoadFailed = false;

// Every deferred game-state transition is registered so a restart can cancel it.
// Without this a pending round timer keeps firing into the new session.
const pendingTimers = new Set();
function later(callback, ms) {
  const id = setTimeout(() => { pendingTimers.delete(id); callback(); }, ms);
  pendingTimers.add(id);
  return id;
}
function clearPendingTimers() {
  for (const id of pendingTimers) clearTimeout(id);
  pendingTimers.clear();
}

function makeArenaCollider() {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ visible: false });
  const addBox = (size, position) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position); group.add(mesh);
  };
  // Temporary collision proxy matching the current playable bounds. Replace
  // this group with the plaza's authored collision GLB when it is available.
  addBox([112, 1, 73], [0, -.5, -23.5]);
  addBox([1, 6, 73], [-56.5, 3, -23.5]);
  addBox([1, 6, 73], [56.5, 3, -23.5]);
  addBox([112, 6, 1], [0, 3, -60.5]);
  addBox([112, 6, 1], [0, 3, 13.5]);
  group.updateMatrixWorld(true);
  return group;
}

function rigSemanticName(name) {
  return name.replace(/^mixamorig:?/, '').replace(/_\d+$/, '');
}

function retargetRotationClip(sourceClip, heroRoot, clipName) {
  const heroBones = new Map();
  heroRoot.traverse(object => heroBones.set(rigSemanticName(object.name), object.name));
  const tracks = [];
  for (const sourceTrack of sourceClip.tracks) {
    const dot = sourceTrack.name.lastIndexOf('.');
    if (dot < 0 || sourceTrack.name.slice(dot + 1) !== 'quaternion') continue;
    const sourceNode = sourceTrack.name.slice(0, dot);
    const targetNode = heroBones.get(rigSemanticName(sourceNode));
    if (!targetNode) continue;
    const track = sourceTrack.clone();
    track.name = `${targetNode}.quaternion`;
    tracks.push(track);
  }
  return new THREE.AnimationClip(clipName, sourceClip.duration, tracks);
}

async function loadHeroControllerAssets() {
  const loader = new GLTFLoader();
  const [hero, motion] = await Promise.all([
    loader.loadAsync(HERO_MODEL_PATH),
    loader.loadAsync(SOLDIER_MODEL_PATH)
  ]);
  const model = hero.scene;
  model.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    object.frustumCulled = true;
    if (object.material) object.material = object.material.clone();
  });
  const sourceByName = new Map(motion.animations.map(clip => [clip.name, clip]));
  const definitions = [
    ['HeroIdle', 'rifle_idle'],
    ['HeroWalk', 'rifle_walk'],
    ['HeroRun', 'rifle_run'],
    ['HeroJump', 'rifle_jump']
  ];
  const animations = definitions
    .map(([name, source]) => sourceByName.has(source)
      ? retargetRotationClip(sourceByName.get(source), model, name)
      : null)
    .filter(Boolean);
  return { model, animations };
}

async function attachHeroRifle() {
  const rightHand = playerPhysics.playerModel?.getObjectByName('RightHand_42');
  if (!rightHand) return;
  const rifleGltf = await new GLTFLoader().loadAsync('./assets/models/fps-ak74m/scene.gltf');
  const rifle = rifleGltf.scene;
  const armMeshes = [];
  rifle.traverse(object => {
    if (!object.isMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (materials.some(material => material?.name?.toLowerCase().includes('arms'))) {
      armMeshes.push(object);
      return;
    }
    object.castShadow = true;
    object.receiveShadow = true;
    object.frustumCulled = false;
    for (const material of materials) {
      if (!material) continue;
      material.side = THREE.DoubleSide;
      material.needsUpdate = true;
    }
  });
  for (const mesh of armMeshes) mesh.removeFromParent();
  rifle.updateMatrixWorld(true);
  const rifleBox = new THREE.Box3().setFromObject(rifle);
  const rifleCenter = rifleBox.getCenter(new THREE.Vector3());
  const muzzle = new THREE.Object3D();
  muzzle.name = 'third-person-muzzle';
  muzzle.position.set(rifleCenter.x, rifleCenter.y, rifleBox.max.z + .025);
  rifle.add(muzzle);
  const rifleLength = Math.max(...rifleBox.getSize(new THREE.Vector3()).toArray(), .001);
  const handScale = rightHand.getWorldScale(new THREE.Vector3());
  rifle.scale.setScalar(SOLDIER_RIFLE_LENGTH_M / rifleLength / Math.max(handScale.x, .0001));
  rifle.position.set(.025, .005, -.07);
  // The extracted AK barrel already follows local +Z. A Y quarter-turn puts
  // it along the hand/aim axis; the previous additional Z quarter-turn made
  // the whole rifle stand vertically through the character's chest.
  rifle.rotation.set(0, Math.PI / 2, 0);
  rightHand.add(rifle);
  thirdPersonRifle = rifle;
  thirdPersonMuzzle = muzzle;
}

async function initPlayerPhysics() {
  const heroAssets = await loadHeroControllerAssets();
  const collider = makeArenaCollider();
  scene.add(collider);
  worldCollisionMesh = collider;
  const orbit = new OrbitControls(camera, canvas);
  orbit.enabled = false;
  playerPhysics = new playerController();
  await playerPhysics.init({
    scene, camera, controls: orbit,
    playerModelConfig: {
      model: heroAssets.model, animations: heroAssets.animations, scale: .01,
      idleAnim: 'HeroIdle', walkAnim: 'HeroWalk', runAnim: 'HeroRun', jumpAnim: 'HeroJump',
      speed: 510, runSpeed: 850, gravity: -2400, jumpHeight: 720,
      capsuleRadiusRatio: 1,
      rotateY: Math.PI,
      firstPersonCameraOffset: [0, 40, 0]
    },
    initPos: new THREE.Vector3(-34.86, 1.50, -1.40),
    colliders: [{ motion: 'static', shape: { kind: 'mesh', source: collider } }],
    isFirstPerson: true,
    enableOverShoulderView: true,
    isShowMobileControls: false,
    keyMap: { toggleView: null, toggleFly: null, toggleVehicle: null }
  });
  // The FPS already owns pointer-lock and view rotation. Feed movement into
  // the controller programmatically and keep only its capsule physics.
  playerPhysics.input.unbindEvents();
  playerPhysics.isupdate = true;
  playerPhysics.enableToward = false;
  scene.attach(camera);
  playerPhysics.playerModel.visible = false;
  playerPhysicsReady = true;
  try {
    await attachHeroRifle();
  } catch (error) {
    console.warn('Third-person rifle failed to load', error);
  }
  await loadSceneCar();
  toast('广场碰撞与跳跃系统已启用');
}

initPlayerPhysics().catch(error => {
  console.error('Player controller init failed', error);
  toast('玩家物理初始化失败，已使用基础移动');
});

async function loadSceneCar() {
  if (!playerPhysicsReady || carVehicle) return;
  try {
    carVehicle = await playerPhysics.loadVehicleModel({
      url: './assets/models/subaru_impreza.glb',
      position: new THREE.Vector3(-34.86, -0.42, -7.40),
      // The Gaussian scene is slightly oversized compared with metric Three.js
      // assets, so use a visibly larger gameplay scale (about 6.9 m long).
      scale: 1.15,
      wheelsNames: ['WheelFL', 'wheelFR', 'wheelBL', 'wheelBR'],
      driverSeatPosition: new THREE.Vector3(.15, .35, .42),
      driverSeatRotation: 0,
      // The vehicle controller drives along local X and uses local Z as the
      // wheel axle. This Subaru asset is authored facing local Z, so without
      // this quarter-turn W/S applies force across the car instead of along it.
      modelRotation: Math.PI / 2,
      chassis: { clearance: .16, sizeScale: { x: .92, y: .78, z: .9 } },
      power: { maxSpeed: 78, acceleration: 11, deceleration: 18 }
    });
    if (!carVehicle) throw new Error('vehicle controller rejected the model');
    // Make boarding forgiving. The stock controller otherwise uses a tight
    // radius around the chassis centre, which can reject E beside the door.
    playerPhysics.vehicle.boardingPadding = 3.2;
    carModel = carVehicle.vehicleGroup;
    carModel.name = 'subaru-impreza';
    carModel.traverse(object => {
      if (!object.isMesh) return;
      object.castShadow = false; object.receiveShadow = false;
      object.frustumCulled = true;
      if (object.material) {
        object.material = object.material.clone();
        object.material.envMapIntensity = .72;
        // Prevent rear body/tail surfaces from z-fighting with the vehicle shell.
        object.material.polygonOffset = true;
        object.material.polygonOffsetFactor = 1;
        object.material.polygonOffsetUnits = 1;
      }
    });
    toast('车辆已就绪 · 靠近驾驶门按 E 上车');
  } catch (error) {
    console.error('Car model load failed', error);
    toast('汽车模型加载失败');
  }
}

const zombieModelReady = new Promise((resolve, reject) => {
  new GLTFLoader().load(REGULAR_MODEL_PATH, (gltf) => {
    const variantNames = ['Zombie Walk_241', 'Zombie Walk (4)_243', 'Zombie Walk (3)_245', 'Zombie Walk (2)_250'];
    zombieTemplates = variantNames.map(name => gltf.scene.getObjectByName(name)).filter(Boolean);
    if (!zombieTemplates.length) zombieTemplates = [gltf.scene];
    for (const template of zombieTemplates) {
      template.removeFromParent();
      template.traverse(object => {
        if (!object.isMesh) return;
        object.castShadow = true;
        object.receiveShadow = true;
        object.frustumCulled = true;
        if (object.material) object.material = object.material.clone();
      });
    }
    zombieTemplate = zombieTemplates[0];
    const source = gltf.animations[0];
    if (source && gltf.animations.length === 1 && source.name === 'Take 001') {
      // Sketchfab concatenates the original animation set into one
      // 12.3-second/369-frame take. Restore gameplay-sized clips.
      const clip = (name, first, last) => THREE.AnimationUtils.subclip(source, name, first, last, 30);
      zombieAnimations = {
        Idle: clip('Idle', 0, 36),
        Walk: clip('Walk', 36, 76),
        Run: clip('Run', 76, 106),
        Shamble: clip('Shamble', 106, 151),
        Punch: clip('Punch', 151, 181),
        Attack: clip('Attack', 181, 211),
        HitReact: clip('HitReact', 211, 231),
        Fall: clip('Fall', 231, 271),
        Crawl: clip('Crawl', 271, 321),
        Death: clip('Death', 321, 369)
      };
    } else if (source && gltf.animations.length === 1) {
      zombieAnimationVariants = zombieTemplates.map(template => {
        const nodeNames = new Set();
        template.traverse(object => nodeNames.add(object.name));
        const tracks = source.tracks.filter(track => {
          const parsed = THREE.PropertyBinding.parseTrackName(track.name);
          return nodeNames.has(parsed.nodeName);
        }).map(track => track.clone());
        return {
          Walk: new THREE.AnimationClip('Walk', source.duration, tracks),
          Run: new THREE.AnimationClip('Run', source.duration, tracks.map(track => track.clone()))
        };
      });
      zombieAnimations = zombieAnimationVariants[0];
    } else {
      zombieAnimations = Object.fromEntries(gltf.animations.map(clip => [clip.name, clip]));
    }
    // Static bounds are wrong for this Mixamo export. Pose the skeleton once
    // and calculate bounds from the actually skinned vertices.
    if (source) {
      zombieAnimatedHeights = zombieTemplates.map((template, variantIndex) => {
        const measureMixer = new THREE.AnimationMixer(template);
        const measureClip = zombieAnimationVariants[variantIndex]?.Walk || source;
        measureMixer.clipAction(measureClip).play();
        measureMixer.update(0);
        template.updateMatrixWorld(true);
        template.traverse(object => {
          if (object.isSkinnedMesh) {
            object.computeBoundingBox();
            object.computeBoundingSphere();
          }
        });
        const height = new THREE.Box3().setFromObject(template).getSize(new THREE.Vector3()).y;
        measureMixer.stopAllAction();
        measureMixer.uncacheRoot(template);
        return height;
      });
      zombieAnimatedHeight = zombieAnimatedHeights[0] || 0;
    }
    const finishZombiePool = () => {
      new GLTFLoader().load(FEMALE_ZOMBIE_MODEL_PATH, female => {
        const template = female.scene;
        template.traverse(object => {
          if (!object.isMesh) return;
          object.castShadow = true;
          object.receiveShadow = true;
          object.frustumCulled = true;
          if (object.material) object.material = object.material.clone();
        });
        const sourceClip = female.animations[0];
        const clip = (name, first, last) => sourceClip
          ? THREE.AnimationUtils.subclip(sourceClip, name, first, last, 30)
          : null;
        const variantAnimations = sourceClip ? {
          Idle: clip('Idle', 0, 36), Walk: clip('Walk', 36, 76), Run: clip('Run', 76, 106),
          Punch: clip('Punch', 151, 181), HitReact: clip('HitReact', 211, 231),
          Death: clip('Death', 321, 369)
        } : {};
        template.updateMatrixWorld(true);
        template.traverse(object => {
          if (object.isSkinnedMesh) {
            object.computeBoundingBox();
            object.computeBoundingSphere();
          }
        });
        zombieTemplates.push(template);
        zombieAnimationVariants.push(variantAnimations);
        zombieAnimatedHeights.push(new THREE.Box3().setFromObject(template).getSize(new THREE.Vector3()).y);
        resolve(gltf);
      }, undefined, error => {
        console.warn('Female zombie failed to load', error);
        resolve(gltf);
      });
    };
    // Add the previously verified standalone zombie as a fifth independent
    // appearance. Failure here does not disable the four-character pack.
    new GLTFLoader().load(EXTRA_ZOMBIE_MODEL_PATH, extra => {
      const template = extra.scene;
      template.traverse(object => {
        if (!object.isMesh) return;
        object.castShadow = true;
        object.receiveShadow = true;
        object.frustumCulled = true;
        if (object.material) object.material = object.material.clone();
      });
      const sourceClip = extra.animations[0];
      const variantAnimations = sourceClip ? {
        Walk: sourceClip.clone(),
        Run: sourceClip.clone()
      } : {};
      if (variantAnimations.Walk) variantAnimations.Walk.name = 'Walk';
      if (variantAnimations.Run) variantAnimations.Run.name = 'Run';
      template.updateMatrixWorld(true);
      template.traverse(object => {
        if (object.isSkinnedMesh) {
          object.computeBoundingBox();
          object.computeBoundingSphere();
        }
      });
      zombieTemplates.push(template);
      zombieAnimationVariants.push(variantAnimations);
      zombieAnimatedHeights.push(new THREE.Box3().setFromObject(template).getSize(new THREE.Vector3()).y);
      finishZombiePool();
    }, undefined, error => {
      console.warn('Extra standalone zombie failed to load', error);
      finishZombiePool();
    });
  }, undefined, primaryError => {
    console.warn('Primary infected model failed; loading bundled fallback', primaryError);
    new GLTFLoader().load('./assets/models/Zombie_Basic.gltf', gltf => {
      zombieTemplate = gltf.scene;
      zombieTemplates = [zombieTemplate];
      zombieTemplate.traverse(object => {
        if (!object.isMesh) return;
        object.castShadow = false; object.receiveShadow = false; object.frustumCulled = true;
        if (object.material) object.material = object.material.clone();
      });
      zombieAnimations = Object.fromEntries(gltf.animations.map(clip => [clip.name, clip]));
      zombieAnimationVariants = [zombieAnimations];
      toast('感染体模型已切换为兼容版本'); resolve(gltf);
    }, undefined, reject);
  });
});
zombieModelReady.catch(error => console.error('Zombie model load failed', error));

function ensureBossModel() {
  if (bossTemplate) return Promise.resolve(bossTemplate);
  if (bossModelPromise) return bossModelPromise;
  bossModelPromise = new Promise(resolve => {
    new GLTFLoader().load(BOSS_MODEL_PATH, gltf => {
      bossTemplate = gltf.scene;
      bossTemplate.traverse(object => {
        if (!object.isMesh) return;
        object.castShadow = false;
        object.receiveShadow = false;
        object.frustumCulled = true;
        if (object.material) object.material = object.material.clone();
      });
      bossLoadComplete = true;
      resolve(bossTemplate);
    }, progress => {
      if (!progress.total) return;
      const percent = Math.round(progress.loaded / progress.total * 100);
      if (wave >= 4) toast(`重型感染体载入 ${percent}%`);
    }, error => {
      console.error('Boss model load failed; using elite infected fallback', error);
      toast('重型感染体资源失败 · 已启用精英感染体');
      bossLoadComplete = true;
      resolve(null);
    });
  });
  return bossModelPromise;
}

// The SWAT asset ships 31 authored clips covering the full rifle state set, so
// ranged bots need no procedural bone layer at all.
const SOLDIER_CLIPS = {
  Idle: 'rifle_idle',
  Aim: 'rifle_idle_aim',
  Walk: 'rifle_walk',
  Run: 'rifle_run',
  Shoot: 'rifle_shoot',
  Reload: 'reload',
  Death: 'death'
};

function ensureSoldierModel() {
  if (soldierTemplate) return Promise.resolve(soldierTemplate);
  if (soldierModelPromise) return soldierModelPromise;
  const loader = new GLTFLoader();
  soldierModelPromise = loader.loadAsync(SOLDIER_MODEL_PATH).then(gltf => {
    soldierTemplate = gltf.scene;
    soldierTemplate.traverse(object => {
      if (!object.isMesh) return;
      object.castShadow = false;
      object.receiveShadow = false;
      object.frustumCulled = true;
      if (object.material) object.material = object.material.clone();
    });
    const byName = new Map(gltf.animations.map(clip => [clip.name, clip]));
    soldierAnimations = {};
    for (const [key, clipName] of Object.entries(SOLDIER_CLIPS)) {
      const clip = byName.get(clipName);
      if (clip) soldierAnimations[key] = clip;
    }
    // Measure the skinned height in the rifle idle pose. The static bounds of
    // this export include the T-pose arm span and read far too tall.
    const reference = soldierAnimations.Idle || gltf.animations[0];
    if (reference) {
      const measureMixer = new THREE.AnimationMixer(soldierTemplate);
      measureMixer.clipAction(reference).play();
      measureMixer.update(0);
      soldierTemplate.updateMatrixWorld(true);
      soldierTemplate.traverse(object => {
        if (object.isSkinnedMesh) { object.computeBoundingBox(); object.computeBoundingSphere(); }
      });
      soldierTemplate.userData.posedHeight = new THREE.Box3()
        .setFromObject(soldierTemplate).getSize(new THREE.Vector3()).y;
      measureMixer.stopAllAction();
      measureMixer.uncacheRoot(soldierTemplate);
    }
    return loader.loadAsync(SOLDIER_RIFLE_PATH)
      .then(rifle => {
        soldierRifleTemplate = rifle.scene;
        soldierRifleTemplate.traverse(object => {
          if (!object.isMesh) return;
          object.castShadow = false; object.receiveShadow = false;
          if (object.material) object.material = object.material.clone();
        });
      })
      .catch(error => console.warn('Soldier rifle prop failed; bots stay unarmed visually', error))
      .then(() => soldierTemplate);
  }).catch(error => {
    console.error('Soldier model load failed', error);
    soldierLoadFailed = true;
    toast('特警模型加载失败 · CS 模式不可用');
    return null;
  });
  return soldierModelPromise;
}

function makeGun() {
  const gun = new THREE.Group();
  gun.name = 'weapon';
  gun.position.set(.31, -.31, -.58);
  gun.rotation.set(-.07, -.035, -.015);

  const steel = new THREE.MeshStandardMaterial({ color: 0x181b1d, metalness: .88, roughness: .23 });
  const steelEdge = new THREE.MeshStandardMaterial({ color: 0x34383a, metalness: .78, roughness: .3 });
  const polymer = new THREE.MeshStandardMaterial({ color: 0x111313, metalness: .08, roughness: .55 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x090a0a, metalness: 0, roughness: .82 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xa96c4f, metalness: 0, roughness: .68 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xa87527, metalness: .9, roughness: .25 });
  const addBox = (parent, size, position, material, bevel = false) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position); parent.add(mesh); return mesh;
  };

  // Frame, trigger guard and textured grip.
  addBox(gun, [.115, .105, .35], [0, -.035, -.045], polymer);
  const grip = addBox(gun, [.12, .30, .17], [0, -.19, .045], rubber);
  grip.rotation.x = -.20;
  for (let y = -.30; y < -.08; y += .035) {
    const rib = addBox(gun, [.124, .009, .145], [0, y, .065 + (y + .19) * .20], polymer);
    rib.rotation.x = -.20;
  }
  const triggerGuard = new THREE.Mesh(new THREE.TorusGeometry(.066, .011, 7, 18, Math.PI), polymer);
  triggerGuard.rotation.set(Math.PI / 2, 0, Math.PI); triggerGuard.position.set(0, -.105, -.10); gun.add(triggerGuard);
  const trigger = addBox(gun, [.015, .075, .015], [0, -.10, -.085], steelEdge); trigger.rotation.x = -.28;

  // Moving metal slide, barrel, ejection port and sights.
  const slide = new THREE.Group(); slide.name = 'slide'; gun.add(slide);
  addBox(slide, [.13, .13, .43], [0, .055, -.075], steel);
  addBox(slide, [.105, .018, .30], [0, .125, -.115], steelEdge);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.027, .027, .29, 16), steelEdge);
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, .058, -.275); gun.add(barrel);
  const bore = new THREE.Mesh(new THREE.CylinderGeometry(.018, .018, .012, 16), rubber);
  bore.rotation.x = Math.PI / 2; bore.position.set(0, .058, -.425); gun.add(bore);
  const muzzleFlash = new THREE.Mesh(
    new THREE.OctahedronGeometry(.075, 0),
    new THREE.MeshBasicMaterial({ color: 0xffd26a, transparent: true, opacity: .95, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  muzzleFlash.scale.set(.6, .6, 1.8); muzzleFlash.position.set(0, .058, -.50); muzzleFlash.visible = false; gun.add(muzzleFlash);
  addBox(slide, [.078, .004, .095], [0, .121, -.035], rubber);
  for (let z = .035; z < .15; z += .022) addBox(slide, [.134, .075, .009], [0, .055, z], steelEdge);
  addBox(slide, [.05, .035, .025], [0, .145, .112], steel); // rear sight
  addBox(slide, [.022, .025, .018], [0, .142, -.273], steel); // front sight
  const sightDot = new THREE.Mesh(new THREE.SphereGeometry(.006, 6, 4), new THREE.MeshBasicMaterial({ color: 0xe9efdf }));
  sightDot.position.set(0, .154, -.281); slide.add(sightDot);

  const magazine = addBox(gun, [.09, .265, .115], [0, -.23, .055], steelEdge); magazine.rotation.x = -.20;
  addBox(magazine, [.095, .018, .125], [0, -.14, 0], polymer);
  const round = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, .04, 8), brass);
  round.rotation.x = Math.PI / 2; round.position.set(0, .14, -.04); magazine.add(round);

  // First-person hands and forearms anchor the weapon in the view.
  const rightHand = new THREE.Mesh(new THREE.CapsuleGeometry(.085, .22, 7, 10), skin);
  rightHand.position.set(.02, -.28, .17); rightHand.rotation.set(-.52, 0, -.04); gun.add(rightHand);
  const leftHand = new THREE.Mesh(new THREE.CapsuleGeometry(.078, .20, 7, 10), skin);
  leftHand.position.set(-.105, -.245, .025); leftHand.rotation.set(-.72, .18, .48); gun.add(leftHand);
  const sleeveMat = new THREE.MeshStandardMaterial({ color: 0x263229, roughness: .92 });
  const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(.095, .38, 6, 10), sleeveMat);
  forearm.position.set(.17, -.46, .31); forearm.rotation.set(-.72, .10, -.16); gun.add(forearm);

  gun.userData.slide = slide;
  gun.userData.magazine = magazine;
  gun.userData.baseMagPosition = magazine.position.clone();
  gun.userData.muzzleFlash = muzzleFlash;
  camera.add(gun);
  return gun;
}
const gun = makeGun();
const weaponMount = new THREE.Group();
weaponMount.name = 'rifle-mount';
weaponMount.position.set(0, .02, -.2);
gun.add(weaponMount);
const proceduralGunParts = gun.children.filter(child => child !== weaponMount);
const weaponModels = new Map();
const weaponAnimationSets = new Map();
let weaponModelReady = false;
const VIEWMODEL_POSITION = new THREE.Vector3();
const VIEWMODEL_QUATERNION = new THREE.Quaternion();
const VIEWMODEL_SCALE = new THREE.Vector3(1, 1, 1);
const VIEWMODEL_WORLD_POSITION = new THREE.Vector3();
const VIEWMODEL_WORLD_QUATERNION = new THREE.Quaternion();
const WEAPONS = {
  ak47: {
    name: 'AK-74M', url: './assets/models/fps-ak74m/scene.gltf',
    position: [.02, -.045, -.31], rotation: [0, Math.PI, 0], fixedRotation: true,
    integratedArms: true
  },
  // G36C.fbx ships without arms; it borrows the AK-74M arm rig and animations.
  g36c: { name: 'G36C', url: './assets/models/G36C.fbx', position: [.02, -.035, -.3], rotation: [0, 0, 0], armsRig: 'ak47' },
  // Procedural mesh built in code (no asset file); melee on the same arm rig.
  knife: { name: '战术刀', procedural: true, melee: true, armsRig: 'ak47', hint: '左键挥砍' }
};
let activeWeapon = 'ak47';
// Bone in the AK-74M rig that carries the rifle body (follows recoil/reload).
const SHARED_ARMS_RIFLE_BONE = 'Rif_059';
// Knife viewmodel (procedural mesh on the AK arm rig's right hand).
const KNIFE_HAND_BONE = 'Hand_R_037';
const KNIFE_SHOULDER_BONE = 'UpArm_R_09';
// Left-arm roots collapsed while the knife is out (the rig is two-handed).
const KNIFE_HIDDEN_BONES = ['Arm_L_02', 'IK_Hand_Cntrl_L_015'];
const AK74M_LENGTH_M = .943;          // real rifle length, sets viewmodel metre scale
const KNIFE_BLADE_LENGTH_M = .165;
const KNIFE_HANDLE_LENGTH_M = .116;
const KNIFE_GRIP_FORWARD_BLEND = .55; // 0 = along the AK grip axis, 1 = straight ahead
const KNIFE_SWING_MS = 460;
const KNIFE_COOLDOWN_MS = 540;
const KNIFE_HIT_FRACTION = .42;       // point in the swing where the hit resolves
const KNIFE_RANGE_M = 1.9;
const KNIFE_CONE_HALF_ANGLE_RAD = THREE.MathUtils.degToRad(38);
const KNIFE_BODY_DAMAGE = 55;
const KNIFE_HEAD_DAMAGE = 100;
const ENEMY_BODY_CENTER_HEIGHT_M = .9;
const KNIFE_MAX_DROP_M = 2.6;         // eye-to-enemy-feet height the swing still reaches
let knifeModel = null;
let knifeLastResult = null;
let knifeSwingStart = -Infinity;
let knifeHitPending = false;
let knifeLeftArmCollapsed = false;
const knifeHiddenBoneScales = new Map();
// Captured once from the AK-74M idle pose; null when the rig is unavailable.
let sharedArmsRig = null;

// Id of the model that owns the arms/animations for a weapon.
const rigHostId = id => (weaponModels.has(WEAPONS[id]?.armsRig) ? WEAPONS[id].armsRig : id);
const usesArmsRig = id => Boolean(WEAPONS[rigHostId(id)]?.integratedArms);

function captureSharedArmsRig(host) {
  const bone = host.getObjectByName(SHARED_ARMS_RIFLE_BONE);
  if (!bone) return null;
  host.updateMatrixWorld(true);
  const toViewmodel = new THREE.Matrix4().copy(viewmodelRoot.matrixWorld).invert();
  const gunMeshes = [];
  const gunBox = new THREE.Box3();
  const vertex = new THREE.Vector3();
  host.traverse(object => {
    if (!object.isMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (materials.some(material => material?.name?.toLowerCase().includes('arms'))) return;
    gunMeshes.push(object);
    const positions = object.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      object.getVertexPosition(i, vertex); // includes skinning
      gunBox.expandByPoint(vertex.applyMatrix4(object.matrixWorld).applyMatrix4(toViewmodel));
    }
  });
  if (!gunMeshes.length || gunBox.isEmpty()) return null;
  const boneInViewmodel = new THREE.Matrix4().multiplyMatrices(toViewmodel, bone.matrixWorld);
  return { host, bone, gunMeshes, gunBox, boneInViewmodel, knifeGrip: captureKnifeGrip(host, toViewmodel) };
}

// Right-hand fist frame in viewmodel space, captured from the idle pose.
// Finger chains are the Hand_R children; the thumb is the one whose root sits
// away from the wrist, and the knuckle nearest the thumb is the index finger.
function captureKnifeGrip(host, toViewmodel) {
  const hand = host.getObjectByName(KNIFE_HAND_BONE);
  const shoulder = host.getObjectByName(KNIFE_SHOULDER_BONE);
  if (!hand || !shoulder) return null;
  const toView = object => object.getWorldPosition(new THREE.Vector3()).applyMatrix4(toViewmodel);
  const chains = hand.children.filter(child => child.isBone).map(root => {
    const joints = [];
    root.traverse(object => { if (object.isBone && !/_end/.test(object.name)) joints.push(object); });
    return { root, joints };
  });
  if (chains.length < 3) return null;
  const thumb = chains.reduce((a, b) => (b.root.position.lengthSq() > a.root.position.lengthSq() ? b : a));
  const fingers = chains.filter(chain => chain !== thumb && chain.joints.length >= 2);
  const thumbTip = toView(thumb.joints[thumb.joints.length - 1]);
  const knuckles = fingers.map(chain => toView(chain.joints[1]));
  const byThumb = knuckles.map((point, i) => ({ i, d: point.distanceTo(thumbTip) })).sort((a, b) => a.d - b.d);
  const index = knuckles[byThumb[0].i];
  const pinky = knuckles[byThumb[byThumb.length - 1].i];
  const fistCenter = new THREE.Vector3();
  let count = 0;
  for (const chain of fingers) for (const joint of chain.joints) { fistCenter.add(toView(joint)); count++; }
  fistCenter.multiplyScalar(1 / count);
  return {
    hand,
    handInViewmodel: new THREE.Matrix4().multiplyMatrices(toViewmodel, hand.matrixWorld),
    fistCenter,
    gripAxis: index.clone().sub(pinky).normalize(), // pinky -> index, blade exits here
    shoulderPivot: toView(shoulder)
  };
}

// Fits a normalized (view-aligned, barrel along -Z) weapon onto the AK rifle
// bone so it occupies the same space the AK body does in the idle pose.
function mountOnSharedArms(model, rig) {
  model.position.set(0, 0, 0);
  model.updateMatrixWorld(true);
  const ownBox = new THREE.Box3().setFromObject(model);
  const ownSize = ownBox.getSize(new THREE.Vector3());
  const ownCenter = ownBox.getCenter(new THREE.Vector3());
  model.position.copy(ownCenter).negate();
  const rigSize = rig.gunBox.getSize(new THREE.Vector3());
  const rigCenter = rig.gunBox.getCenter(new THREE.Vector3());
  const fitScale = rigSize.z / Math.max(ownSize.z, .001);
  const pivot = new THREE.Group();
  pivot.name = 'shared-arms-weapon';
  pivot.add(model);
  const placement = new THREE.Matrix4().compose(rigCenter, new THREE.Quaternion(), new THREE.Vector3(fitScale, fitScale, fitScale));
  new THREE.Matrix4().copy(rig.boneInViewmodel).invert().multiply(placement)
    .decompose(pivot.position, pivot.quaternion, pivot.scale);
  pivot.traverse(object => {
    if (!object.isMesh) return;
    object.frustumCulled = false; object.renderOrder = 20;
  });
  rig.bone.add(pivot);
  return pivot;
}

// Procedural tactical knife in metres. Origin = handle centre, blade toward
// -Z, cutting edge toward -Y.
function makeCombatKnife() {
  const knife = new THREE.Group();
  knife.name = 'combat-knife';
  const bladeCoat = new THREE.MeshStandardMaterial({ color: 0x3b4044, metalness: .72, roughness: .42 });
  const bladeEdge = new THREE.MeshStandardMaterial({ color: 0xd3d8dc, metalness: 1, roughness: .16 });
  const guardMetal = new THREE.MeshStandardMaterial({ color: 0x22262a, metalness: .85, roughness: .34 });
  const gripPolymer = new THREE.MeshStandardMaterial({ color: 0x2c3326, metalness: 0, roughness: .78 });
  const cord = new THREE.MeshStandardMaterial({ color: 0x14170f, metalness: 0, roughness: .92 });
  const halfHandle = KNIFE_HANDLE_LENGTH_M / 2;
  const guardThickness = .008;
  const bladeStart = halfHandle + guardThickness;

  // Clip-point blade profile: x = distance from the guard, y = height.
  const L = KNIFE_BLADE_LENGTH_M;
  const profile = new THREE.Shape();
  profile.moveTo(0, -.012);
  profile.lineTo(L * .62, -.0135);
  profile.quadraticCurveTo(L * .93, -.012, L, .005);
  profile.lineTo(L * .72, .0135);
  profile.lineTo(0, .015);
  profile.closePath();
  const bladeThickness = .0034;
  // Extrude groups: 0 = flats (coated), 1 = bevel ring (polished grind).
  const bladeGeometry = new THREE.ExtrudeGeometry(profile, {
    depth: bladeThickness, curveSegments: 10,
    bevelEnabled: true, bevelThickness: .0011, bevelSize: .0021, bevelSegments: 2
  });
  bladeGeometry.translate(0, 0, -bladeThickness / 2);
  bladeGeometry.rotateY(Math.PI / 2); // profile +X -> knife -Z
  bladeGeometry.translate(0, 0, -bladeStart);
  bladeGeometry.computeVertexNormals();
  knife.add(new THREE.Mesh(bladeGeometry, [bladeCoat, bladeEdge]));

  // Fuller: a dark groove slightly proud of both flats.
  const fuller = new THREE.Mesh(new THREE.BoxGeometry(bladeThickness + .0026, .0035, L * .5), cord);
  fuller.position.set(0, .006, -(bladeStart + L * .3));
  knife.add(fuller);

  const guard = new THREE.Mesh(new THREE.BoxGeometry(.013, .046, guardThickness), guardMetal);
  guard.position.set(0, .001, -(halfHandle + guardThickness / 2));
  knife.add(guard);

  // Lathe handle with gentle finger swells, flattened to an oval section.
  const handlePoints = [];
  const HANDLE_SEGMENTS = 24;
  for (let i = 0; i <= HANDLE_SEGMENTS; i++) {
    const t = i / HANDLE_SEGMENTS;
    const radius = .0118 + .0017 * Math.sin(t * Math.PI) + .0009 * Math.cos(t * Math.PI * 8);
    handlePoints.push(new THREE.Vector2(radius, t * KNIFE_HANDLE_LENGTH_M));
  }
  const handleGeometry = new THREE.LatheGeometry(handlePoints, 20);
  handleGeometry.rotateX(-Math.PI / 2); // +Y -> -Z
  handleGeometry.translate(0, 0, halfHandle);
  handleGeometry.scale(.8, 1, 1);
  knife.add(new THREE.Mesh(handleGeometry, gripPolymer));

  const CORD_WRAPS = 5;
  const cordGeometry = new THREE.TorusGeometry(.0132, .0015, 6, 20);
  cordGeometry.scale(.8, 1, 1);
  for (let i = 0; i < CORD_WRAPS; i++) {
    const wrap = new THREE.Mesh(cordGeometry, cord);
    wrap.position.z = -halfHandle * .7 + (i / (CORD_WRAPS - 1)) * halfHandle * 1.4;
    knife.add(wrap);
  }

  const pommel = new THREE.Mesh(new THREE.CylinderGeometry(.0105, .0128, .013, 16), guardMetal);
  pommel.rotation.x = Math.PI / 2;
  pommel.position.z = halfHandle + .0065;
  pommel.scale.x = .85;
  knife.add(pommel);

  knife.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = false; object.receiveShadow = false;
    object.frustumCulled = false; object.renderOrder = 20;
  });
  return knife;
}

// Places the knife handle through the captured fist, blade leaning from the
// AK grip axis toward the view direction, spine up.
function mountKnifeOnSharedArms(rig) {
  const grip = rig.knifeGrip;
  if (!grip) return null;
  const knife = makeCombatKnife();
  const unitsPerMetre = rig.gunBox.getSize(new THREE.Vector3()).z / AK74M_LENGTH_M;
  const bladeDir = grip.gripAxis.clone()
    .lerp(new THREE.Vector3(0, 0, -1), KNIFE_GRIP_FORWARD_BLEND).normalize();
  const spineDir = new THREE.Vector3(0, 1, 0).addScaledVector(bladeDir, -bladeDir.y).normalize();
  const sideDir = new THREE.Vector3().crossVectors(spineDir, bladeDir.clone().negate()).normalize();
  // Knife basis: +X side, +Y spine, +Z toward the pommel.
  const basis = new THREE.Matrix4().makeBasis(sideDir, spineDir, bladeDir.clone().negate());
  const placement = new THREE.Matrix4().compose(
    grip.fistCenter,
    new THREE.Quaternion().setFromRotationMatrix(basis),
    new THREE.Vector3(unitsPerMetre, unitsPerMetre, unitsPerMetre)
  );
  new THREE.Matrix4().copy(grip.handInViewmodel).invert().multiply(placement)
    .decompose(knife.position, knife.quaternion, knife.scale);
  grip.hand.add(knife);
  return knife;
}

// Swing curve in viewmodel space around the right shoulder:
// [time fraction, yaw, pitch, roll (rad), dx, dy, dz (viewmodel units)].
// Windup up-right, slash down-left across the screen, recover.
// +yaw turns left, +pitch raises, +roll tilts the top to the left.
const KNIFE_SWING_KEYS = [
  [0, 0, 0, 0, 0, 0, 0],
  [.24, -.32, .34, -.34, .05, .045, .02],
  [.52, .58, -.38, .52, -.13, -.06, -.09],
  [1, 0, 0, 0, 0, 0, 0]
];
const KNIFE_SWING_CHANNELS = 6;
const knifeSwingEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const knifeSwingQuat = new THREE.Quaternion();
const knifeSwingOffset = new THREE.Vector3();

function sampleKnifeSwing(t, out) {
  for (let i = 1; i < KNIFE_SWING_KEYS.length; i++) {
    const a = KNIFE_SWING_KEYS[i - 1]; const b = KNIFE_SWING_KEYS[i];
    if (t > b[0]) continue;
    const k = THREE.MathUtils.smoothstep(t, a[0], b[0]);
    for (let j = 1; j <= KNIFE_SWING_CHANNELS; j++) out[j - 1] = a[j] + (b[j] - a[j]) * k;
    return out;
  }
  out.fill(0);
  return out;
}
const knifeSwingSample = new Array(KNIFE_SWING_CHANNELS).fill(0);

// Runs after the weapon mixers so it overrides the rifle clips.
function applyKnifeViewmodelPose(now) {
  const host = sharedArmsRig?.host;
  if (!host) return;
  const knifeActive = activeWeapon === 'knife' && Boolean(knifeModel);
  if (knifeActive !== knifeLeftArmCollapsed) {
    for (const name of KNIFE_HIDDEN_BONES) {
      const bone = host.getObjectByName(name);
      if (!bone) continue;
      if (knifeActive) { knifeHiddenBoneScales.set(name, bone.scale.clone()); }
      else if (knifeHiddenBoneScales.has(name)) bone.scale.copy(knifeHiddenBoneScales.get(name));
    }
    knifeLeftArmCollapsed = knifeActive;
  }
  if (!knifeActive) return;
  // Re-apply every frame: rifle clips may key these bones' scale.
  for (const name of KNIFE_HIDDEN_BONES) host.getObjectByName(name)?.scale.setScalar(1e-4);
  const t = (now - knifeSwingStart) / KNIFE_SWING_MS;
  if (t < 0 || t >= 1) return;
  const [yaw, pitch, roll, dx, dy, dz] = sampleKnifeSwing(t, knifeSwingSample);
  knifeSwingQuat.setFromEuler(knifeSwingEuler.set(pitch, yaw, roll));
  const pivot = sharedArmsRig.knifeGrip.shoulderPivot;
  // model = pivot + R * (base - pivot) + offset, in viewmodelRoot space.
  knifeSwingOffset.copy(host.position).sub(pivot).applyQuaternion(knifeSwingQuat).add(pivot);
  host.position.set(knifeSwingOffset.x + dx, knifeSwingOffset.y + dy, knifeSwingOffset.z + dz);
  host.quaternion.premultiply(knifeSwingQuat);
}

function knifeAttack() {
  const now = performance.now();
  const driving = playerPhysics?.controllerMode === 1;
  if (!running || paused || gameOver || driving || now - knifeSwingStart < KNIFE_COOLDOWN_MS) return;
  knifeSwingStart = now;
  knifeHitPending = true;
  shake = .01;
  knifeSwingSound();
}

const knifeForward = new THREE.Vector3();
const knifeOrigin = new THREE.Vector3();
const knifeToEnemy = new THREE.Vector3();
const knifeHitPoint = new THREE.Vector3();

function updateKnife(now) {
  if (!knifeHitPending || now - knifeSwingStart < KNIFE_SWING_MS * KNIFE_HIT_FRACTION) return;
  knifeHitPending = false;
  camera.getWorldPosition(knifeOrigin);
  camera.getWorldDirection(knifeForward);
  if (playerPhysicsReady && !playerPhysics.isFirstPerson) {
    const body = playerPhysics.getPosition();
    if (body) knifeOrigin.set(body.x, body.y + .4, body.z);
  }
  // Precise pass: crosshair ray against enemy hit volumes and walls.
  collectShotTargets();
  raycaster.set(knifeOrigin, knifeForward);
  raycaster.far = KNIFE_RANGE_M;
  const hit = raycaster.intersectObjects(shotTargets, true)[0];
  raycaster.far = Infinity;
  let enemy = hit?.object.userData.enemy;
  let headshot = hit?.object.userData.part === 'head';
  if (hit) knifeHitPoint.copy(hit.point);
  let method = enemy && !enemy.userData.dead ? 'ray' : null;
  // Forgiving pass: nearest enemy inside the horizontal swing cone. Close
  // enemies sit well below eye level, so the cone ignores pitch and a height
  // band keeps the swing from reaching targets far above or below.
  if (!method) {
    enemy = null; headshot = false;
    const minCos = Math.cos(KNIFE_CONE_HALF_ANGLE_RAD);
    const flatForward = knifeForward.clone().setY(0).normalize();
    let best = Infinity;
    for (const candidate of enemies) {
      if (candidate.userData.dead) continue;
      knifeToEnemy.subVectors(candidate.position, knifeOrigin);
      const heightGap = knifeToEnemy.y;
      knifeToEnemy.y = 0;
      const distance = knifeToEnemy.length();
      const reach = KNIFE_RANGE_M + (candidate.userData.isBoss ? .6 : .25);
      if (distance > reach || distance >= best || heightGap > .5 || heightGap < -KNIFE_MAX_DROP_M) continue;
      if (distance > .001 && knifeToEnemy.multiplyScalar(1 / distance).dot(flatForward) < minCos) continue;
      best = distance; enemy = candidate;
    }
    if (enemy) {
      method = 'cone';
      knifeHitPoint.copy(enemy.position).setY(enemy.position.y + ENEMY_BODY_CENTER_HEIGHT_M);
    }
  }
  knifeLastResult = { method, rayObject: hit?.object.userData.part ?? hit?.object.name ?? null, rayDistance: hit ? +hit.distance.toFixed(2) : null };
  if (!enemy) {
    if (hit) { createImpact(hit.point, hit.face?.normal, 0xe7d8a8); tone(1400, .03, 'square'); }
    return;
  }
  createImpact(knifeHitPoint, undefined, enemy.userData.kind === 'soldier' ? 0xc23a26 : 0xa61f18);
  tone(170, .07, 'triangle');
  shake = .022;
  damageEnemy(enemy, headshot ? KNIFE_HEAD_DAMAGE : KNIFE_BODY_DAMAGE, headshot, knifeHitPoint);
}

function knifeSwingSound() {
  try {
    audioContext ||= new AudioContext();
    const now = audioContext.currentTime;
    const DURATION_S = .22;
    const buffer = audioContext.createBuffer(1, Math.floor(audioContext.sampleRate * DURATION_S), audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / data.length;
      data[i] = (random() * 2 - 1) * Math.sin(t * Math.PI);
    }
    const noise = audioContext.createBufferSource(); noise.buffer = buffer;
    const band = audioContext.createBiquadFilter(); band.type = 'bandpass'; band.Q.value = 1.4;
    band.frequency.setValueAtTime(700, now); band.frequency.exponentialRampToValueAtTime(2800, now + DURATION_S);
    const gain = audioContext.createGain(); gain.gain.value = .22;
    noise.connect(band).connect(gain).connect(audioContext.destination);
    noise.start(now);
  } catch {}
}

function normalizeWeaponModel(model, config) {
  model.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const longestAxis = size.x >= size.y && size.x >= size.z ? 'x' : size.y >= size.z ? 'y' : 'z';
  if (!config.fixedRotation) {
    if (longestAxis === 'x') model.rotation.y = -Math.PI / 2;
    else if (longestAxis === 'y') model.rotation.x = Math.PI / 2;
  } else {
    model.rotation.set(0, 0, 0);
  }
  model.rotation.x += config.rotation[0]; model.rotation.y += config.rotation[1]; model.rotation.z += config.rotation[2];
  model.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(model);
  const normalizedSize = box.getSize(new THREE.Vector3());
  model.scale.setScalar(.76 / Math.max(normalizedSize.z, normalizedSize.x, normalizedSize.y, .001));
  model.updateMatrixWorld(true);
  box.setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.set(-center.x, -center.y, -center.z);
  model.position.add(new THREE.Vector3(...config.position));
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x171a1c, metalness: .9, roughness: .24 });
  const wornMetal = new THREE.MeshStandardMaterial({ color: 0x303337, metalness: .78, roughness: .36 });
  const polymer = new THREE.MeshStandardMaterial({ color: 0x111312, metalness: .08, roughness: .62 });
  model.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = false; object.receiveShadow = false;
    if (config.integratedArms) {
      object.frustumCulled = false; object.renderOrder = 20;
      if (object.material) {
        object.material = object.material.clone();
        object.material.depthTest = false; object.material.depthWrite = false;
      }
    }
    if (!object.material || !object.material.map) {
      const part = `${object.name} ${object.material?.name || ''}`.toLowerCase();
      object.material = part.includes('magazine') || part.includes('trigger') ? polymer
        : part.includes('high') || part.includes('ejection') ? darkMetal : wornMetal;
    }
  });
}

function configureIntegratedWeapon(model) {
  // Exact transform from the author's Godot Sketchfab_Scene2 node.
  const sourceTransform = new THREE.Matrix4().set(
    -.211046,  .001840, -.009105,  .040,
     .001295,  .210870,  .012596, -.160,
     .009198,  .012496, -.210677, -.18,
     0,          0,          0,         1
  );
  sourceTransform.decompose(VIEWMODEL_POSITION, VIEWMODEL_QUATERNION, VIEWMODEL_SCALE);
  model.position.copy(VIEWMODEL_POSITION);
  model.quaternion.copy(VIEWMODEL_QUATERNION);
  model.scale.copy(VIEWMODEL_SCALE);
  model.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = false; object.receiveShadow = false;
    object.frustumCulled = false; object.renderOrder = 20;
    if (object.material) {
      object.material = object.material.clone();
      object.material.side = THREE.DoubleSide;
      object.material.depthTest = true; object.material.depthWrite = true;
    }
  });
  viewmodelRoot.add(model);
  model.updateMatrixWorld(true);
}

async function loadWeaponModels() {
  const fbxLoader = new FBXLoader();
  const gltfLoader = new GLTFLoader();
  for (const [id, config] of Object.entries(WEAPONS)) {
    if (config.procedural) continue;
    try {
      const loaded = /\.gl(?:b|tf)$/i.test(config.url)
        ? await gltfLoader.loadAsync(config.url)
        : await fbxLoader.loadAsync(config.url);
      const model = loaded.scene || loaded;
      if (loaded.animations?.length) {
        const mixer = new THREE.AnimationMixer(model);
        mixer.timeScale = 1.58;
        const actions = new Map(loaded.animations.map(clip => [clip.name, mixer.clipAction(clip)]));
        const idle = actions.get('Rig|AK_Idle');
        if (idle) { idle.setLoop(THREE.LoopRepeat, Infinity); idle.play(); mixer.update(0); }
        weaponAnimationSets.set(id, { mixer, actions, current: idle || null });
      }
      let mounted = model;
      if (config.integratedArms) {
        configureIntegratedWeapon(model);
        // Idle pose at t=0 is applied above, before the draw animation starts.
        if (id === 'ak47') sharedArmsRig = captureSharedArmsRig(model);
      } else {
        normalizeWeaponModel(model, config);
        if (config.armsRig === 'ak47' && sharedArmsRig) mounted = mountOnSharedArms(model, sharedArmsRig);
        else weaponMount.add(model);
      }
      mounted.visible = id === activeWeapon; weaponModels.set(id, mounted);
      if (id === activeWeapon) {
        proceduralGunParts.forEach(child => { child.visible = false; });
        ui.weaponName.textContent = `${config.name} · R 换弹`;
      }
      if (id === 'ak47') {
        weaponModelReady = true;
        toast('AK-74M 手臂与动画已加载');
        playWeaponAnimation('Rig|AK_Draw', false);
      }
    } catch (error) {
      console.error(`${config.name} load failed`, error);
      if (id === 'ak47') toast(`AK-74M 加载失败：${error.message || error}`);
    }
  }
  if (sharedArmsRig) {
    knifeModel = mountKnifeOnSharedArms(sharedArmsRig);
    if (knifeModel) { knifeModel.visible = false; weaponModels.set('knife', knifeModel); }
  }
  switchWeapon(activeWeapon);
}

function switchWeapon(id) {
  if (!WEAPONS[id] || (weaponModels.size && !weaponModels.has(id))) return;
  activeWeapon = id;
  const hostId = rigHostId(id);
  for (const [key, model] of weaponModels) model.visible = key === id || key === hostId;
  // The rig host stays visible for its arms; hide its own rifle when borrowed.
  if (sharedArmsRig) for (const mesh of sharedArmsRig.gunMeshes) mesh.visible = hostId === id;
  const loaded = weaponModels.has(id);
  proceduralGunParts.forEach(child => { child.visible = !loaded; });
  ui.weaponName.textContent = `${WEAPONS[id].name} · ${WEAPONS[id].hint ?? 'R 换弹'}`;
  toast(`${WEAPONS[id].name} 已装备`);
  if (usesArmsRig(id)) playWeaponAnimation('Rig|AK_Draw', false);
}

function playWeaponAnimation(name, loop = false, fade = .08) {
  const set = weaponAnimationSets.get(rigHostId(activeWeapon));
  const next = set?.actions.get(name);
  if (!set || !next) return null;
  const previous = set.current;
  next.reset().setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
  next.clampWhenFinished = !loop;
  next.play();
  if (previous && previous !== next) previous.crossFadeTo(next, fade, true);
  set.current = next;
  if (!loop) {
    const onFinished = event => {
      if (event.action !== next) return;
      set.mixer.removeEventListener('finished', onFinished);
      const idle = set.actions.get('Rig|AK_Idle');
      if (!idle) return;
      idle.reset().setLoop(THREE.LoopRepeat, Infinity).play();
      next.crossFadeTo(idle, .1, true); set.current = idle;
    };
    set.mixer.addEventListener('finished', onFinished);
  }
  return next;
}

function updateWeaponLocomotion() {
  const set = weaponAnimationSets.get(rigHostId(activeWeapon));
  if (!set || reloading) return;
  const currentName = set.current?.getClip().name;
  const locomotion = ['Rig|AK_Idle', 'Rig|AK_Walk', 'Rig|AK_Run'];
  if (currentName && !locomotion.includes(currentName)) return;
  const moving = keys.has('KeyW') || keys.has('KeyS') || keys.has('KeyA') || keys.has('KeyD');
  const nextName = !moving ? 'Rig|AK_Idle'
    : (keys.has('ShiftLeft') || keys.has('ShiftRight')) ? 'Rig|AK_Run' : 'Rig|AK_Walk';
  if (currentName === nextName) return;
  const next = set.actions.get(nextName);
  if (!next) return;
  next.reset().setLoop(THREE.LoopRepeat, Infinity).play();
  set.current?.crossFadeTo(next, .14, true); set.current = next;
}

function keepViewmodelVisible() {
  const hostId = rigHostId(activeWeapon);
  const model = weaponModels.get(hostId);
  if (!model) return;
  model.visible = true;
  const borrowed = hostId !== activeWeapon ? weaponModels.get(activeWeapon) : null;
  if (borrowed) borrowed.visible = true;
  if (WEAPONS[hostId]?.integratedArms) {
    if (model.parent !== viewmodelRoot) viewmodelRoot.attach(model);
    camera.getWorldPosition(VIEWMODEL_WORLD_POSITION);
    camera.getWorldQuaternion(VIEWMODEL_WORLD_QUATERNION);
    viewmodelRoot.position.copy(VIEWMODEL_WORLD_POSITION);
    viewmodelRoot.quaternion.copy(VIEWMODEL_WORLD_QUATERNION);
    model.position.copy(VIEWMODEL_POSITION);
    model.quaternion.copy(VIEWMODEL_QUATERNION);
    model.scale.copy(VIEWMODEL_SCALE);
  }
}

loadWeaponModels();
scene.add(new THREE.HemisphereLight(0xe1fff0, 0x29352d, 2.15));
scene.add(new THREE.AmbientLight(0xffffff, .55));
const infectedKeyLight = new THREE.DirectionalLight(0xfff3df, 1.15);
infectedKeyLight.position.set(24, 38, 18);
infectedKeyLight.castShadow = true;
infectedKeyLight.shadow.mapSize.set(2048, 2048);
infectedKeyLight.shadow.camera.left = -65;
infectedKeyLight.shadow.camera.right = 65;
infectedKeyLight.shadow.camera.top = 65;
infectedKeyLight.shadow.camera.bottom = -65;
infectedKeyLight.shadow.camera.near = 1;
infectedKeyLight.shadow.camera.far = 120;
infectedKeyLight.shadow.bias = -.00025;
infectedKeyLight.shadow.normalBias = .025;
scene.add(infectedKeyLight);
scene.add(infectedKeyLight.target);
const viewLight = new THREE.PointLight(0xf1fff8, 3.4, 3.2); viewLight.position.set(-.35, .35, -.15); camera.add(viewLight);
const gunLight = new THREE.PointLight(0xffb45a, 0, 4.5); gunLight.position.set(0, .03, -.58); camera.add(gunLight);

const MODE_CHROME = {
  zombie: {
    hero: '感染禁区',
    lead: '未知感染席卷广场。守住阵地，在五轮尸潮中存活下来。弹药有限——瞄准头部。',
    roundLabel: '波次',
    aliveLabel: '存活感染体'
  },
  cs: {
    hero: '反恐战术',
    lead: '敌方特警小队已占据广场。五个回合，双方都用枪说话——他们会走位、点射、换弹。移动中更难被命中，静步时更容易命中。',
    roundLabel: '回合',
    aliveLabel: '存活敌人'
  }
};

function applyModeChrome() {
  const selected = GAME_MODES[ui.mode?.value] ? ui.mode.value : 'zombie';
  const chrome = MODE_CHROME[selected];
  const heroMode = $('#hero-mode');
  const heroLead = $('#hero-lead');
  const aliveLabel = $('#alive-label');
  if (heroMode) heroMode.textContent = chrome.hero;
  if (heroLead) heroLead.textContent = chrome.lead;
  if (ui.roundLabel) ui.roundLabel.textContent = chrome.roundLabel;
  if (aliveLabel) aliveLabel.textContent = chrome.aliveLabel;
  // Preload the 15 MB SWAT asset as soon as the mode is picked so the first
  // round does not stall waiting on it.
  if (selected === 'cs') ensureSoldierModel();
}

function applyQuality() {
  const q = QUALITY[ui.quality.value];
  renderer.setPixelRatio(q.dpr); renderer.setSize(innerWidth, innerHeight, false);
  if (lccObject) {
    lccObject.setStartLod(q.lod); lccObject.setMaxSplats(q.splats);
    lccObject.setMaxNodeSplats(q.node); lccObject.setMaxDistance(q.distance);
    lccObject.setLodAutoLevelUp(ui.quality.value !== 'low');
  }
}

function alignVehicleToGround() {
  if (!carModel || !worldCollisionMesh) return;
  const ground = findEnemyGroundY(carModel.position.x, carModel.position.z, 12);
  if (Number.isFinite(ground)) carModel.position.y = ground - 0.42;
}

function loadWorld() {
  if (lccObject) return;
  ui.loading.classList.remove('hidden');
  try {
    lccObject = LCCRender.load({
      camera, scene, dataPath: DATA_PATH, renderLib: THREE, canvas, renderer,
      useEnv: true, useIndexDB: true, useLoadingEffect: true,
      loadingEffectCenterType: 'sceneBox', modelMatrix: MODEL_MATRIX, appKey: null
    }, () => {
      sceneReady = true; ui.loading.classList.add('hidden'); applyQuality();
      alignVehicleToGround();
      toast('区域同步完成'); startWave();
    }, (p) => {
      const n = Math.round(p * 100); ui.loadingPercent.textContent = `${n}%`; ui.loadingBar.style.width = `${n}%`;
    }, () => {
      ui.loadingLabel.textContent = '场景数据加载失败'; ui.loadingPercent.textContent = '重试';
    });
    applyQuality();
  } catch (error) {
    ui.loadingLabel.textContent = error.message; ui.loadingPercent.textContent = '初始化失败';
  }
}

function createZombie(index) {
  if (!zombieTemplate) return false;
  const wantsBoss = wave === roundCount();
  if (wantsBoss && !bossTemplate && !bossLoadComplete && !bossModelPromise) {
    ensureBossModel();
    return false;
  }
  if (wantsBoss && bossModelPromise && !bossTemplate && !bossLoadComplete) {
    return false;
  }
  const isBoss = wantsBoss;
  const hasBossModel = isBoss && Boolean(bossTemplate);
  const group = new THREE.Group();
  const variantIndex = hasBossModel ? 0 : Math.floor(random() * Math.max(1, zombieTemplates.length));
  const selectedTemplate = hasBossModel ? bossTemplate : (zombieTemplates[variantIndex] || zombieTemplate);
  const selectedAnimations = hasBossModel ? zombieAnimations : (zombieAnimationVariants[variantIndex] || zombieAnimations);
  const model = SkeletonUtils.clone(selectedTemplate);
  const bodyVariation = isBoss ? 1 : .86 + random() * .3;
  const colorHue = (random() - .5) * .055;
  const colorLight = (random() - .5) * .14;
  model.traverse(object => {
    if (!object.isMesh || !object.material) return;
    const varyMaterial = material => {
      const clone = material.clone();
      if (clone.color) {
        clone.color.offsetHSL(colorHue, (random() - .5) * .08, colorLight);
        // Some variants contain plain white placeholder materials. Give those
        // untextured surfaces a muted corpse tone instead of glowing white.
        if (!clone.map && clone.color.r > .78 && clone.color.g > .78 && clone.color.b > .78) {
          const corpsePalette = [0x78806d, 0x706b61, 0x687569, 0x81746b];
          clone.color.setHex(corpsePalette[Math.floor(random() * corpsePalette.length)]);
        }
      }
      if ('roughness' in clone) clone.roughness = Math.max(.68, clone.roughness ?? .68);
      if ('metalness' in clone) clone.metalness = 0;
      return clone;
    };
    object.material = Array.isArray(object.material)
      ? object.material.map(varyMaterial)
      : varyMaterial(object.material);
  });
  const sourceBox = new THREE.Box3().setFromObject(model);
  const sourceSize = sourceBox.getSize(new THREE.Vector3());
  // This asset has an Armature scale of 0.200729 that is reflected in its
  // static bounds but not consistently in the animated skinned result.
  const variantHeight = zombieAnimatedHeights[variantIndex] || zombieAnimatedHeight;
  const measuredHeight = !isBoss && variantHeight > .001 ? variantHeight : sourceSize.y;
  const targetHeight = (isBoss ? 2.15 : 1.65) * bodyVariation;
  const scale = targetHeight / Math.max(measuredHeight, .001);
  model.scale.setScalar(scale);
  const fittedBox = new THREE.Box3().setFromObject(model);
  model.position.y -= fittedBox.min.y;
  // Quaternius characters face local +Z. Object3D.lookAt() also points the
  // group's +Z axis at the player, so no extra 180-degree flip is required.
  model.rotation.y = hasBossModel ? Math.PI : 0;
  model.traverse(object => { if (object.isMesh) object.raycast = () => {}; });
  group.add(model);

  const hitMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const body = new THREE.Mesh(new THREE.BoxGeometry(isBoss ? .92 : .68, isBoss ? 1.42 : 1.15, isBoss ? .58 : .38), hitMaterial); body.position.y = isBoss ? 1.05 : .88; body.userData.part = 'body';
  const head = new THREE.Mesh(new THREE.SphereGeometry(isBoss ? .31 : .25, 8, 6), hitMaterial); head.position.y = isBoss ? 2.02 : 1.73; head.userData.part = 'head';
  const telegraph = new THREE.Mesh(
    new THREE.RingGeometry(isBoss ? .72 : .46, isBoss ? .82 : .54, 28),
    new THREE.MeshBasicMaterial({ color: 0xff3b22, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })
  );
  telegraph.rotation.x = -Math.PI / 2; telegraph.position.y = .035; telegraph.visible = false;
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 128;
  const shadowContext = shadowCanvas.getContext('2d');
  const shadowGradient = shadowContext.createRadialGradient(64, 64, 4, 64, 64, 62);
  shadowGradient.addColorStop(0, 'rgba(0,0,0,.78)');
  shadowGradient.addColorStop(.42, 'rgba(0,0,0,.46)');
  shadowGradient.addColorStop(1, 'rgba(0,0,0,0)');
  shadowContext.fillStyle = shadowGradient;
  shadowContext.fillRect(0, 0, 128, 128);
  const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
  const contactShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(isBoss ? 1.9 : 1.15, isBoss ? 1.25 : .72),
    new THREE.MeshBasicMaterial({
      map: shadowTexture, transparent: true, opacity: isBoss ? .58 : .48,
      depthWrite: false, side: THREE.DoubleSide, toneMapped: false
    })
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = .018;
  contactShadow.renderOrder = 2;
  contactShadow.raycast = () => {};
  group.add(body, head, telegraph, contactShadow);
  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const name of ['Idle', 'Walk', 'Run', 'Punch', 'HitReact', 'Death']) {
    const clip = hasBossModel ? null : selectedAnimations[name];
    if (clip) actions[name] = mixer.clipAction(clip);
  }
  if (actions.Walk) {
    actions.Walk.play();
    actions.Walk.time = random() * Math.max(.01, actions.Walk.getClip().duration);
  }
  const semanticBones = {
    Hips: 'hips', Spine: 'spine', Spine2: 'chest', Neck: 'neck', Head: 'head',
    LeftUpLeg: 'thighL', LeftLeg: 'calfL', LeftFoot: 'footL',
    RightUpLeg: 'thighR', RightLeg: 'calfR', RightFoot: 'footR',
    LeftArm: 'upperL', LeftForeArm: 'lowerL', LeftHand: 'handL',
    RightArm: 'upperR', RightForeArm: 'lowerR', RightHand: 'handR'
  };
  const bones = {};
  model.traverse(object => {
    const normalized = object.name.replace(/^mixamorig:/, '').replace(/_\d+$/, '');
    const key = semanticBones[normalized];
    if (key) bones[key] = { object, rest: object.quaternion.clone() };
  });
  group.userData = {
    hp: isBoss ? 850 : 100 + wave * 12,
    maxHp: isBoss ? 850 : 100 + wave * 12,
    speed: isBoss ? 1.05 : 1.15 + random() * .5 + wave * .06,
    attackAt: 0,
    state: 'chase',
    attackWindupAt: 0,
    attackDamageAt: 0,
    dead: false,
    isBoss,
    model,
    mixer,
    actions,
    activeAction: actions.Walk,
    body,
    head,
    hitMaterial,
    bodyBaseY: isBoss ? 1.05 : .88,
    headBaseY: isBoss ? 2.02 : 1.73,
    telegraph,
    gaitPhase: random() * Math.PI * 2,
    gaitRate: 4.1 + random() * 4.4,
    lean: (random() - .5) * .10,
    strideSide: random() > .5 ? 1 : -1,
    motionStyle: Math.floor(random() * 4),
    strideStrength: .72 + random() * .62,
    hunchVariation: (random() - .5) * .24,
    headTiltVariation: (random() - .5) * .34,
    armVariation: (random() - .5) * .42,
    animationRate: .72 + random() * .62,
    collisionRadius: (isBoss ? .72 : .48) * bodyVariation,
    modelBaseY: model.position.y,
    deathSide: random() > .5 ? 1 : -1,
    separation: new THREE.Vector3(),
    away: new THREE.Vector3(),
    bones,
    contactShadow,
    groundY: 0,
    nextGroundProbeAt: 0,
    perspectiveScale: isBoss ? 2.9 : 2.7
  };
  group.userData.variantIndex = variantIndex;
  group.userData.kind = isBoss ? 'boss' : 'zombie';
  group.traverse(o => { if (o.isMesh) o.userData.enemy = group; });
  const clusterOffset = Math.floor(random() * 2);
  const pos = ZOMBIE_SPAWN_CLUSTERS[(index + clusterOffset) % ZOMBIE_SPAWN_CLUSTERS.length];
  group.position.set(pos[0] + (random() - .5) * 3.2, 0, pos[1] + (random() - .5) * 3.2);
  group.userData.groundY = findEnemyGroundY(group.position.x, group.position.z, camera.position.y + 3);
  group.position.y = group.userData.groundY;
  scene.add(group); enemies.push(group); return true;
}

function findEnemyGroundY(x, z, startY) {
  if (!worldCollisionMesh) return camera.position.y - PLAYER_EYE_HEIGHT;
  enemyGroundOrigin.set(x, Math.max(startY, camera.position.y + 2), z);
  enemyGroundRaycaster.set(enemyGroundOrigin, enemyGroundDown);
  enemyGroundRaycaster.near = 0;
  enemyGroundRaycaster.far = 18;
  const hit = enemyGroundRaycaster.intersectObject(worldCollisionMesh, true)[0];
  return hit ? hit.point.y : camera.position.y - PLAYER_EYE_HEIGHT;
}

// Shared tracer visuals. Allocating a geometry per shot would rebuild GPU
// buffers on a hot path, so a fixed pool is reused instead.
const tracerGeometry = new THREE.CylinderGeometry(.012, .012, 1, 4, 1, true);
const tracerMaterial = new THREE.MeshBasicMaterial({
  color: 0xffd9a0, transparent: true, opacity: .85,
  blending: THREE.AdditiveBlending, depthWrite: false
});
const tracerPool = [];
const TRACER_AXIS = new THREE.Vector3(0, 1, 0);
const tracerDirection = new THREE.Vector3();
const tracerMidpoint = new THREE.Vector3();
for (let i = 0; i < TRACER_POOL_SIZE; i++) {
  const tracer = new THREE.Mesh(tracerGeometry, tracerMaterial);
  tracer.visible = false;
  tracer.frustumCulled = false;
  tracer.userData.life = 0;
  scene.add(tracer);
  tracerPool.push(tracer);
}

function spawnTracer(from, to) {
  const tracer = tracerPool.find(candidate => candidate.userData.life <= 0);
  if (!tracer) return;
  tracerDirection.copy(to).sub(from);
  const length = tracerDirection.length();
  if (length < .001) return;
  tracerMidpoint.copy(from).addScaledVector(tracerDirection, .5);
  tracer.position.copy(tracerMidpoint);
  tracer.quaternion.setFromUnitVectors(TRACER_AXIS, tracerDirection.normalize());
  tracer.scale.set(1, length, 1);
  tracer.userData.life = TRACER_LIFE_S;
  tracer.visible = true;
}

function updateTracers(delta) {
  for (const tracer of tracerPool) {
    if (tracer.userData.life <= 0) continue;
    tracer.userData.life -= delta;
    if (tracer.userData.life <= 0) { tracer.visible = false; tracer.userData.life = 0; }
  }
}

// The soldier group is oriented by lookAt(), so its local +Z points at the
// player and the muzzle sits on the positive Z side.
const SOLDIER_MUZZLE_OFFSET = new THREE.Vector3(.20, SOLDIER_EYE_HEIGHT_M - .18, .42);

function createSoldier(index) {
  if (soldierLoadFailed) return false;
  if (!soldierTemplate) { ensureSoldierModel(); return false; }
  const group = new THREE.Group();
  const model = SkeletonUtils.clone(soldierTemplate);
  const posedHeight = soldierTemplate.userData.posedHeight;
  const measuredHeight = posedHeight > .001
    ? posedHeight
    : new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).y;
  model.scale.setScalar(SOLDIER_HEIGHT_M / Math.max(measuredHeight, .001));
  model.updateMatrixWorld(true);
  model.position.y -= new THREE.Box3().setFromObject(model).min.y;
  // Mixamo rigs in this project face local +Z, which is also the axis
  // Object3D.lookAt() aims at the target, so no half turn is needed. This
  // matches the verified mixamorig branch in createZombie().
  model.rotation.y = SOLDIER_FACING_YAW_RAD;
  model.traverse(object => { if (object.isMesh) object.raycast = () => {}; });
  group.add(model);

  let heldRifle = null;
  const rightHand = model.getObjectByName('mixamorigRightHand');
  if (soldierRifleTemplate && rightHand) {
    const rifle = SkeletonUtils.clone(soldierRifleTemplate);
    const rifleBox = new THREE.Box3().setFromObject(rifle);
    const rifleLength = Math.max(...rifleBox.getSize(new THREE.Vector3()).toArray(), .001);
    // Bone space is scaled by the armature, so normalise against the bone.
    const boneScale = new THREE.Vector3();
    rightHand.getWorldScale(boneScale);
    rifle.scale.setScalar(SOLDIER_RIFLE_LENGTH_M / rifleLength / Math.max(boneScale.x, .0001));
    rifle.position.set(...SOLDIER_RIFLE_OFFSET_M);
    rifle.rotation.set(...SOLDIER_RIFLE_ROTATION_RAD);
    rightHand.add(rifle);
    heldRifle = rifle;
  }

  const hitMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const body = new THREE.Mesh(new THREE.BoxGeometry(.62, 1.18, .40), hitMaterial);
  body.position.y = .95; body.userData.part = 'body';
  const head = new THREE.Mesh(new THREE.SphereGeometry(.22, 8, 6), hitMaterial);
  head.position.y = SOLDIER_EYE_HEIGHT_M + .12; head.userData.part = 'head';
  group.add(body, head);

  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const name of Object.keys(SOLDIER_CLIPS)) {
    const clip = soldierAnimations[name];
    if (clip) actions[name] = mixer.clipAction(clip);
  }
  if (actions.Idle) actions.Idle.play();

  const hp = 100 + wave * 10;
  group.userData = {
    kind: 'soldier',
    hp, maxHp: hp,
    speed: 2.3 + random() * .7,
    dead: false,
    isBoss: false,
    model, mixer, actions,
    activeAction: actions.Idle,
    body, head,
    hitMaterial,
    bones: null,
    rifle: heldRifle,
    state: 'advance',
    reactionUntil: 0,
    nextBurstAt: 0,
    nextShotAt: 0,
    burstLeft: 0,
    magazine: SOLDIER_SHOTS_PER_MAGAZINE,
    reloadUntil: 0,
    repositionUntil: 0,
    strafeSign: random() > .5 ? 1 : -1,
    muzzle: new THREE.Vector3(),
    toPlayer: new THREE.Vector3(),
    desired: new THREE.Vector3(),
    separation: new THREE.Vector3(),
    away: new THREE.Vector3()
  };
  group.traverse(object => { if (object.isMesh) object.userData.enemy = group; });
  const pos = SPAWNS[(index + Math.floor(random() * SPAWNS.length)) % SPAWNS.length];
  group.position.set(pos[0] + (random() - .5) * 6, 0, pos[1] + (random() - .5) * 6);
  scene.add(group); enemies.push(group); return true;
}

function spawnEnemy(index) {
  return isCsMode() ? createSoldier(index) : createZombie(index);
}

// `scene.remove()` does not free GPU memory, and leaving corpses in `enemies`
// keeps paying mixer and separation cost every frame. Release both here.
//
// Ownership note: SkeletonUtils.clone() shares materials, textures and skinned
// geometry with the template, so those must never be disposed per enemy. Only
// the hitboxes and telegraph created in the spawn functions are owned here.
function disposeEnemy(enemy) {
  scene.remove(enemy);
  const data = enemy.userData;
  data.mixer?.stopAllAction();
  if (data.model) data.mixer?.uncacheRoot(data.model);
  data.body?.geometry.dispose();
  data.head?.geometry.dispose();
  data.hitMaterial?.dispose();
  if (data.telegraph) {
    data.telegraph.geometry.dispose();
    data.telegraph.material.dispose();
  }
}

function removeEnemy(enemy) {
  const index = enemies.indexOf(enemy);
  if (index !== -1) enemies.splice(index, 1);
  disposeEnemy(enemy);
}

function clearEnemies() {
  for (const enemy of enemies) disposeEnemy(enemy);
  enemies.length = 0;
}

function livingEnemies() {
  let count = 0;
  for (const enemy of enemies) if (!enemy.userData.dead) count++;
  return count;
}

function startWave() {
  if (!sceneReady || gameOver) return;
  const config = modeConfig();
  wave += 1;
  if (wave > config.counts.length) return finish(true);
  const range = config.countRanges?.[wave - 1];
  currentWaveTotal = range ? randomWaveCount(range, wave) : config.counts[wave - 1];
  currentZombieAliveCap = isCsMode()
    ? Infinity
    : (wave === config.counts.length ? 1 : Math.min(6, 2 + wave));
  remainingToSpawn = currentWaveTotal; spawnCooldown = .4; betweenWaves = false;
  if (isCsMode()) {
    // Round-based play refills the loadout so a round is lost on aim, not attrition.
    magazine = 30; reserve = 90; reloading = false;
    ui.ammo.classList.remove('reloading');
    toast(`第 ${wave} 回合 · ${remainingToSpawn} 名敌方特警`);
  } else {
    if (wave === config.counts.length - 1) ensureBossModel();
    toast(wave === config.counts.length ? '最终波 · 重型感染体正在接近' : `第 ${wave} 波 · ${remainingToSpawn} 个感染体`);
  }
  updateHud();
}

function updateWaves(delta) {
  const config = modeConfig();
  // Without this the spawn retry loop would stall forever on a missing asset.
  if (isCsMode() && soldierLoadFailed) {
    toast('CS 模式资源缺失 · 无法继续');
    return finish(false);
  }
  if (remainingToSpawn > 0) {
    const trackedZombies = isCsMode() ? 0 : enemies.filter(enemy => enemy.userData.kind !== 'soldier').length;
    if (!isCsMode() && trackedZombies >= currentZombieAliveCap) {
      // Feed a progressively larger group as the waves advance while retaining
      // a cap so animation and skinning costs remain predictable.
      spawnCooldown = Math.max(spawnCooldown, .25);
      return;
    }
    spawnCooldown -= delta;
    if (spawnCooldown <= 0) {
      const spawned = spawnEnemy(remainingToSpawn);
      if (spawned) remainingToSpawn--;
      spawnCooldown = spawned ? config.spawnInterval(wave) : .2;
    }
  } else if (!betweenWaves && livingEnemies() === 0) {
    betweenWaves = true;
    if (wave >= config.counts.length) later(() => finish(true), 900);
    else {
      if (config.replenishOnRoundEnd) {
        health = Math.min(100, health + 35);
        updateHud();
        toast(`回合胜利 · 生命恢复至 ${Math.ceil(health)}`);
      } else {
        toast('区域暂时安全 · 下一波即将抵达');
      }
      later(() => { if (!gameOver) startWave(); }, config.intermissionMs);
    }
  }
}

const SCREEN_CENTRE = new THREE.Vector2(0, 0);
const hitTargets = [];
const shotTargets = [];
const cameraAimPoint = new THREE.Vector3();
const shotMuzzlePosition = new THREE.Vector3();
const shotDirection = new THREE.Vector3();
const hitMarkerNdc = new THREE.Vector3();

function collectShotTargets() {
  hitTargets.length = 0;
  shotTargets.length = 0;
  for (const enemy of enemies) {
    if (enemy.userData.dead) continue;
    for (const child of enemy.children) {
      if (child.isMesh && child.userData.part) {
        hitTargets.push(child);
        shotTargets.push(child);
      }
    }
  }
  const colliders = playerPhysicsReady ? playerPhysics.getColliderMeshes() : [];
  for (const collider of colliders) {
    if (collider && !shotTargets.includes(collider)) shotTargets.push(collider);
  }
  if (worldCollisionMesh && !shotTargets.includes(worldCollisionMesh)) shotTargets.push(worldCollisionMesh);
}

function getCameraAimPoint(out) {
  collectShotTargets();
  raycaster.far = 220;
  raycaster.setFromCamera(SCREEN_CENTRE, camera);
  const cameraHit = raycaster.intersectObjects(shotTargets, true)[0];
  if (cameraHit) out.copy(cameraHit.point);
  else raycaster.ray.at(220, out);
  raycaster.far = Infinity;
  return out;
}

function getActiveMuzzlePosition(out) {
  if (playerPhysicsReady && !playerPhysics.isFirstPerson && thirdPersonMuzzle) {
    return thirdPersonMuzzle.getWorldPosition(out);
  }
  return gun.userData.muzzleFlash.getWorldPosition(out);
}

function shoot() {
  if (WEAPONS[activeWeapon]?.melee) { knifeAttack(); return; }
  const now = performance.now();
  const driving = playerPhysics?.controllerMode === 1;
  if (!running || paused || gameOver || reloading || driving || now - lastShot < 165) return;
  if (magazine <= 0) { tone(95, .08); reload(); return; }
  lastShot = now; magazine--; gunKick = 1; gunSlideKick = 1; shake = .018;
  if (!driving) playWeaponAnimation('Rig|AK_Shot', false, .025);
  recoilVelocity -= 1.65; recoilYaw += (random() - .5) * .012;
  gunshotSound();
  if (!driving) {
    ejectCasing();
    ui.muzzle.classList.remove('fire'); void ui.muzzle.offsetWidth; ui.muzzle.classList.add('fire');
    gun.userData.muzzleFlash.visible = true;
    gunLight.intensity = 9;
    gun.userData.muzzleFlash.rotation.z = random() * Math.PI;
    clearTimeout(gun.userData.flashTimer);
    gun.userData.flashTimer = setTimeout(() => { gun.userData.muzzleFlash.visible = false; }, 48);
  }
  updateHud();
  ui.crosshair.classList.remove('fire'); void ui.crosshair.offsetWidth; ui.crosshair.classList.add('fire');
  setTimeout(() => ui.crosshair.classList.remove('fire'), 115);
  // Phase 1: the fixed screen reticle determines the intended world point.
  getCameraAimPoint(cameraAimPoint);
  // Phase 2: the real projectile starts at the muzzle. This second trace is
  // what prevents a shoulder camera from shooting around a nearby wall.
  getActiveMuzzlePosition(shotMuzzlePosition);
  shotDirection.subVectors(cameraAimPoint, shotMuzzlePosition);
  const aimDistance = Math.max(.01, shotDirection.length());
  shotDirection.multiplyScalar(1 / aimDistance);
  raycaster.set(shotMuzzlePosition, shotDirection);
  raycaster.far = aimDistance + .08;
  const hit = raycaster.intersectObjects(shotTargets, true)[0];
  raycaster.far = Infinity;
  if (!hit) return;
  const enemy = hit.object.userData.enemy;
  const isSoldier = enemy?.userData.kind === 'soldier';
  createImpact(hit.point, hit.face?.normal, enemy ? (isSoldier ? 0xc23a26 : 0xa61f18) : 0xe7d8a8);
  if (!enemy || enemy.userData.dead) return;
  const headshot = hit.object.userData.part === 'head';
  // Armoured bots take less body damage, keeping headshots the efficient answer.
  damageEnemy(enemy, headshot ? 100 : (isSoldier ? 30 : 38), headshot, hit.point);
}

// Shared by gun and knife hits.
function damageEnemy(enemy, amount, headshot, point) {
  enemy.userData.hp -= amount;
  showHitmarker(headshot, point); updateHud();
  if (enemy.userData.hp <= 0) killEnemy(enemy, headshot);
  else if (enemy.userData.kind !== 'soldier') {
    setZombieAction(enemy, 'HitReact', true);
    enemy.userData.hitUntil = performance.now() + 360;
    enemy.userData.state = 'hit';
  }
}

function resetCrosshairPosition() {
  ui.crosshair.style.left = '50%';
  ui.crosshair.style.top = '50%';
}

function updateThirdPersonCrosshair() {
  // Reticle stability is intentional: animation/recoil moves the gun and its
  // muzzle, never the player's requested screen-space aim direction.
  resetCrosshairPosition();
  ui.crosshair.classList.remove('hidden');
}

function updateThirdPersonAimPose() {
  // Do not rotate playerCapsule here. CharacterSystem owns that transform and
  // uses it to resolve camera-relative locomotion. Aim yaw/pitch belongs on a
  // separate visual upper-body rig (Aim IK), never on the physics root.
}

function ejectCasing() {
  const geometry = new THREE.CylinderGeometry(.018, .018, .055, 8);
  const material = new THREE.MeshStandardMaterial({ color: 0xb88732, metalness: .9, roughness: .28 });
  const casing = new THREE.Mesh(geometry, material);
  casing.rotation.z = Math.PI / 2;
  const origin = new THREE.Vector3(.19, -.10, -.42); camera.localToWorld(origin); casing.position.copy(origin);
  const rightward = new THREE.Vector3(1, .45, .15).applyQuaternion(camera.quaternion).normalize();
  casing.userData.velocity = rightward.multiplyScalar(2.5 + random() * 1.4);
  casing.userData.spin = new THREE.Vector3(random() * 12, random() * 18, random() * 14);
  casing.userData.life = 1.1; scene.add(casing); casings.push(casing);
}

function createImpact(point, normal = new THREE.Vector3(0, 1, 0), color = 0xe7d8a8) {
  for (let i = 0; i < 7; i++) {
    const particle = new THREE.Mesh(
      new THREE.SphereGeometry(.012 + random() * .013, 4, 3),
      new THREE.MeshBasicMaterial({ color, transparent: true })
    );
    particle.position.copy(point);
    const spread = new THREE.Vector3((random() - .5) * 1.4, random() * 1.1, (random() - .5) * 1.4);
    particle.userData.velocity = spread.add(normal.clone().multiplyScalar(.8 + random())).multiplyScalar(1.5);
    particle.userData.life = .18 + random() * .18; scene.add(particle); impactParticles.push(particle);
  }
}

function showHitmarker(headshot, worldPoint) {
  if (worldPoint) {
    hitMarkerNdc.copy(worldPoint).project(camera);
    ui.hitmarker.style.left = `${(hitMarkerNdc.x * .5 + .5) * 100}%`;
    ui.hitmarker.style.top = `${(-hitMarkerNdc.y * .5 + .5) * 100}%`;
  } else {
    ui.hitmarker.style.left = '50%';
    ui.hitmarker.style.top = '50%';
  }
  ui.hitmarker.classList.remove('hidden', 'headshot');
  if (headshot) ui.hitmarker.classList.add('headshot');
  clearTimeout(showHitmarker.timer); showHitmarker.timer = setTimeout(() => ui.hitmarker.classList.add('hidden'), 90);
  tone(headshot ? 920 : 700, .035);
}

function killEnemy(enemy, headshot) {
  const data = enemy.userData;
  data.dead = true; data.deathAt = performance.now(); kills++; score += headshot ? 175 : 100;
  if (data.kind === 'soldier') {
    restartEnemyAction(enemy, 'Death');
    data.body.visible = false; data.head.visible = false;
  } else {
    setZombieAction(enemy, 'Death', true);
  }
  // Corpses are released rather than only removed from the scene, and they are
  // taken out of `enemies` so they stop costing per-frame work. The hold time
  // follows the actual death clip (SWAT death is 4.3s, the zombie one 1.6s)
  // instead of a single guessed constant, capped so corpses cannot pile up.
  const deathClip = data.actions.Death?.getClip();
  const holdMs = deathClip
    ? THREE.MathUtils.clamp(deathClip.duration * 1000 + 250, 1200, CORPSE_MAX_HOLD_MS)
    : 2400;
  later(() => removeEnemy(enemy), holdMs);
  if (headshot) toast('爆头 +175');
  if (kills % 5 === 0) reserve += 12;
  updateHud();
}

const poseEuler = new THREE.Euler();
const poseQuat = new THREE.Quaternion();
function animateEnemyRig(zombie, phase, moving, attacking, hit, deathProgress = 0) {
  const bones = zombie.userData.bones;
  if (!bones || !Object.keys(bones).length) return;
  const pose = (key, x = 0, y = 0, z = 0) => {
    const bone = bones[key]; if (!bone) return;
    poseEuler.set(x, y, z, 'XYZ'); poseQuat.setFromEuler(poseEuler);
    bone.object.quaternion.copy(bone.rest).multiply(poseQuat);
  };
  const style = zombie.userData.motionStyle || 0;
  const styleStride = [1, .62, .78, 1.22][style] * zombie.userData.strideStrength;
  const step = moving ? Math.sin(phase) * styleStride : 0;
  const breathe = Math.sin(phase * .34) * .025;
  const hunch = [-.08, -.2, -.14, -.27][style] + zombie.userData.hunchVariation;
  const headTilt = ([0, -.1, .16, -.04][style] + zombie.userData.headTiltVariation) * zombie.userData.strideSide;
  pose('hips', breathe, 0, step * .045);
  pose('spine', moving ? hunch : breathe + hunch * .35, step * .025, -step * .035 + headTilt * .25);
  pose('chest', moving ? hunch * 1.15 : -breathe, 0, step * .045);
  pose('neck', .05 - breathe, 0, headTilt * .55 - step * .025);
  pose('head', -.04 + breathe, Math.sin(phase * .21) * .025, headTilt + step * .018);
  pose('thighL', step * .86, 0, 0); pose('thighR', -step * .86, 0, 0);
  pose('calfL', Math.max(0, -step) * 1.05, 0, 0); pose('calfR', Math.max(0, step) * 1.05, 0, 0);
  pose('footL', -Math.max(0, -step) * .46, 0, 0); pose('footR', -Math.max(0, step) * .46, 0, 0);
  const armsForward = Math.max(-.12, [0, .48, .24, .68][style] + zombie.userData.armVariation);
  pose('upperL', -step * .42 - armsForward, 0, -.10 - headTilt * .3);
  pose('upperR', step * .42 - armsForward * (style === 2 ? .35 : 1), 0, .10 + headTilt * .3);
  pose('lowerL', -.24 - armsForward * .5 - Math.max(0, step) * .16, 0, 0);
  pose('lowerR', -.24 - armsForward * .42 - Math.max(0, -step) * .16, 0, 0);
  if (attacking) {
    const strike = Math.sin(Math.min(1, ((performance.now() % 850) / 850)) * Math.PI);
    pose('upperL', -1.05 * strike, 0, -.28); pose('upperR', -1.18 * strike, 0, .28);
    pose('lowerL', -.75 * strike, 0, 0); pose('lowerR', -.82 * strike, 0, 0);
    pose('chest', -.22 * strike, 0, 0);
  }
  if (hit) { pose('spine', .32, 0, -.14); pose('head', -.28, 0, .18); }
  if (deathProgress > 0) {
    const fall = THREE.MathUtils.smoothstep(deathProgress, 0, 1);
    pose('hips', .25 * fall, 0, 1.35 * fall); pose('spine', .45 * fall, 0, .25 * fall);
    pose('upperL', -.35, 0, -.75 * fall); pose('upperR', .25, 0, .72 * fall);
  }
}

function reload() {
  if (WEAPONS[activeWeapon]?.melee) return;
  if (reloading || magazine === 30 || reserve === 0 || gameOver) return;
  reloading = true;
  const reloadAction = playWeaponAnimation('Rig|AK_Reload_full', false, .1);
  const animationMs = reloadAction ? reloadAction.getClip().duration / 1.58 * 1000 : 1350;
  reloadEnd = performance.now() + Math.max(1350, animationMs);
  ui.ammo.classList.add('reloading'); toast('换弹中…');
  reloadSound();
}

function finish(won) {
  if (gameOver) return;
  gameOver = true; running = false; document.exitPointerLock?.();
  const cs = isCsMode();
  $('#result-label').textContent = won ? (cs ? '广场已夺回' : '隔离区肃清') : (cs ? '小队被歼灭' : '生命信号中断');
  $('#result-mark').textContent = won ? '✓' : '×';
  $('#result-title').textContent = won ? (cs ? '全回合胜利' : '你活下来了') : (cs ? '你被击倒了' : '你已被感染');
  $('#result-copy').textContent = won
    ? (cs ? '敌方特警小队已全部被清除。' : '日晷广场的感染体已全部清除。')
    : (cs ? '交火中保持移动、利用反应延迟先手开枪。' : '保持距离、瞄准头部，再试一次。');
  $('#result-score').textContent = score.toLocaleString(); $('#result-time').textContent = `${kills} 击杀`;
  ui.result.classList.add('visible'); tone(won ? 620 : 70, .6);
}

function damage(amount) {
  health = Math.max(0, health - amount); shake = .06;
  ui.damage.classList.remove('pulse'); void ui.damage.offsetWidth; ui.damage.classList.add('pulse');
  tone(62, .13, 'sawtooth'); updateHud(); if (health <= 0) finish(false);
}

function updateZombies(delta, time) {
  // In vehicle mode the camera is several metres behind the car. Using the
  // camera as the chase target makes infected run toward an empty point, so
  // track the active vehicle's world position instead.
  const driving = playerPhysicsReady && playerPhysics.controllerMode === 1 && carVehicle;
  const chasePosition = driving ? carVehicle.vehicleGroup.position : camera.position;
  const target = new THREE.Vector3(chasePosition.x, 0, chasePosition.z);
  enemies.forEach(z => {
    z.userData.mixer.update(delta);
    if (z.userData.dead) {
      if (z.userData.vehicleImpactVelocity) {
        z.position.addScaledVector(z.userData.vehicleImpactVelocity, delta);
        z.userData.vehicleImpactVelocity.multiplyScalar(Math.exp(-3.4 * delta));
        z.rotation.y += (z.userData.vehicleImpactSpin || 0) * delta;
        z.userData.vehicleImpactLiftVelocity -= 9.8 * delta;
        z.userData.vehicleImpactLift = Math.max(0,
          z.userData.vehicleImpactLift + z.userData.vehicleImpactLiftVelocity * delta);
      }
      const deathProgress = Math.min(1, (performance.now() - z.userData.deathAt) / 780);
      animateEnemyRig(z, 0, false, false, false, deathProgress);
      const fall = THREE.MathUtils.smoothstep(deathProgress, 0, 1);
      const model = z.userData.model;
      model.rotation.x = fall * .18;
      model.rotation.z = z.userData.lean + fall * 1.48 * z.userData.deathSide;
      model.position.y = z.userData.modelBaseY - fall * .12;
      z.position.y = z.userData.groundY - deathProgress * .34 + (z.userData.vehicleImpactLift || 0);
      return;
    }
    const hit = time < (z.userData.hitUntil || 0);
    const toPlayer = target.clone().sub(z.position); const distance = toPlayer.length();
    // The model was already normalized to a real-world height in
    // createZombie(). Do not multiply the whole enemy by a distance-based
    // factor here: the perspective camera already makes distant enemies look
    // smaller, and this extra scale caused noticeable size popping.
    z.userData.perspectiveScale = 1;
    z.scale.setScalar(1);
    z.lookAt(target.x, z.position.y + 1, target.z);
    const attackRange = z.userData.isBoss ? 1.85 : 1.45;
    const moving = distance > attackRange;
    const phase = time * .001 * z.userData.gaitRate + z.userData.gaitPhase;
    const step = Math.sin(phase);
    const plant = Math.abs(Math.cos(phase));
    const model = z.userData.model;

    if (moving && !hit) {
      z.userData.state = 'chase';
      z.userData.telegraph.visible = false;
      const direction = toPlayer.normalize();
      const separation = z.userData.separation.set(0, 0, 0);
      for (const other of enemies) {
        if (other === z || other.userData.dead) continue;
        const away = z.userData.away.copy(z.position).sub(other.position); const gap = away.length();
        const desired = z.userData.collisionRadius * z.userData.perspectiveScale
          + other.userData.collisionRadius * other.userData.perspectiveScale;
        if (gap < desired) {
          if (gap > .001) {
            const overlap = desired - gap;
            separation.addScaledVector(away, overlap / desired / gap);
            // Hard positional correction prevents two animated bodies from
            // occupying the same space; steering alone was not sufficient.
            z.position.addScaledVector(away, overlap * .52 / gap);
          } else {
            const angle = random() * Math.PI * 2;
            z.position.x += Math.cos(angle) * desired * .3;
            z.position.z += Math.sin(angle) * desired * .3;
          }
        }
      }
      if (separation.lengthSq()) direction.addScaledVector(separation.normalize(), .72).normalize();
      z.position.addScaledVector(direction, z.userData.speed * delta);
      setZombieAction(z, distance > 12 && z.userData.actions.Run ? 'Run' : 'Walk');
      if (z.userData.activeAction) {
        const styleRate = [.92, .68, .8, 1.28][z.userData.motionStyle || 0];
        z.userData.activeAction.timeScale = (distance > 12 ? 1.1 : .88 + z.userData.speed * .12)
          * styleRate * z.userData.animationRate;
      }
      model.rotation.z = z.userData.lean + step * .012;
      model.rotation.x = step * .05;
      model.position.y = z.userData.modelBaseY + plant * .07;
      z.userData.body.position.y = z.userData.bodyBaseY + plant * .018;
      z.userData.head.position.y = z.userData.headBaseY + plant * .025;
    } else if (!hit) {
      model.rotation.x = THREE.MathUtils.damp(model.rotation.x, 0, 8, delta);
      model.position.y = THREE.MathUtils.damp(model.position.y, z.userData.modelBaseY, 10, delta);
      if (z.userData.state !== 'windup' && time >= z.userData.attackAt) {
        z.userData.state = 'windup';
        z.userData.attackDamageAt = time + (z.userData.isBoss ? 560 : 390);
        z.userData.attackAt = time + (z.userData.isBoss ? 1450 : 1050);
        z.userData.attackDealt = false;
        setZombieAction(z, 'Punch', true);
      }
      if (z.userData.state === 'windup') {
        z.userData.telegraph.visible = true;
        z.userData.telegraph.material.opacity = .25 + Math.sin(time * .025) * .18;
        if (!z.userData.attackDealt && time >= z.userData.attackDamageAt) {
          z.userData.attackDealt = true;
          damage(z.userData.isBoss ? 22 : 8 + wave);
        }
        if (time >= z.userData.attackAt) { z.userData.state = 'recovery'; z.userData.telegraph.visible = false; }
      }
    }

    if (hit) z.userData.telegraph.visible = false;
    animateEnemyRig(z, phase, moving && !hit, z.userData.state === 'windup' && !hit, hit);

    // Probe the authored station collision at a modest interval. This keeps
    // enemies on floors and stairs without raycasting the 747k-face mesh on
    // every frame. A tiny gait bounce is added after grounding.
    if (time >= z.userData.nextGroundProbeAt) {
      z.userData.groundY = findEnemyGroundY(z.position.x, z.position.z, z.position.y + 3);
      z.userData.nextGroundProbeAt = time + 180 + random() * 90;
    }
    z.position.y = z.userData.groundY + (moving ? plant * .012 : 0);
    z.userData.contactShadow.material.opacity = THREE.MathUtils.lerp(.5, .22, Math.min(distance / 45, 1));
  });
}

const soldierPlayerGround = new THREE.Vector3();
const soldierMuzzleWorld = new THREE.Vector3();
const soldierPlayerChest = new THREE.Vector3();

function countFiringSoldiers() {
  let count = 0;
  for (const enemy of enemies) {
    if (!enemy.userData.dead && enemy.userData.burstLeft > 0) count++;
  }
  return count;
}

function soldierHitChance(distance, playerMoving) {
  const roundBonus = (wave - 1) * SOLDIER_ACCURACY_PER_ROUND;
  const range = THREE.MathUtils.clamp(
    (distance - SOLDIER_ENGAGE_RANGE_M) / (SOLDIER_MAX_FIRE_RANGE_M - SOLDIER_ENGAGE_RANGE_M), 0, 1
  );
  const falloff = THREE.MathUtils.lerp(1, SOLDIER_FAR_ACCURACY_FACTOR, range);
  const movement = playerMoving ? SOLDIER_MOVING_TARGET_PENALTY : 1;
  return THREE.MathUtils.clamp((SOLDIER_BASE_ACCURACY + roundBonus) * falloff * movement, .05, .82);
}

// Observable fire statistics. Incoming damage is the product of shot volume and
// hit chance, and guessing which one is wrong wastes tuning passes.
const soldierFireStats = { shots: 0, hits: 0, damage: 0, chanceSum: 0 };

function fireSoldierShot(soldier, distance, playerMoving) {
  const data = soldier.userData;
  soldierMuzzleWorld.copy(SOLDIER_MUZZLE_OFFSET).applyQuaternion(soldier.quaternion).add(soldier.position);
  soldierPlayerChest.set(camera.position.x, camera.position.y - .15, camera.position.z);
  spawnTracer(soldierMuzzleWorld, soldierPlayerChest);
  restartEnemyAction(soldier, 'Shoot');
  enemyGunshotSound(distance);
  data.magazine--;
  const chance = soldierHitChance(distance, playerMoving);
  soldierFireStats.shots++;
  soldierFireStats.chanceSum += chance;
  if (random() < chance) {
    // Per-shot damage stays flat. Round difficulty comes from squad size and a
    // small accuracy ramp; scaling damage as well stacked into a ~13 HP/s spike.
    soldierFireStats.hits++;
    soldierFireStats.damage += SOLDIER_DAMAGE_BODY;
    damage(SOLDIER_DAMAGE_BODY);
  }
}

function updateSoldiers(delta, time) {
  soldierPlayerGround.set(camera.position.x, 0, camera.position.z);
  const playerMoving = keys.has('KeyW') || keys.has('KeyS') || keys.has('KeyA') || keys.has('KeyD');
  for (const soldier of enemies) {
    const data = soldier.userData;
    data.mixer.update(delta);
    if (data.dead) continue;

    const toPlayer = data.toPlayer.copy(soldierPlayerGround).sub(soldier.position);
    const distance = toPlayer.length();
    soldier.lookAt(soldierPlayerGround.x, soldier.position.y, soldierPlayerGround.z);

    if (data.state === 'reload') {
      if (time >= data.reloadUntil) {
        data.magazine = SOLDIER_SHOTS_PER_MAGAZINE;
        data.state = 'advance';
      }
      continue;
    }

    if (data.burstLeft > 0) {
      if (time >= data.nextShotAt) {
        fireSoldierShot(soldier, distance, playerMoving);
        data.burstLeft--;
        data.nextShotAt = time + SOLDIER_SHOT_INTERVAL_MS;
        if (data.burstLeft === 0) {
          data.nextBurstAt = time + SOLDIER_BURST_COOLDOWN_MS;
          // Break contact after a burst so the player gets a window to answer.
          data.state = 'reposition';
          data.repositionUntil = time + SOLDIER_REPOSITION_MS;
          data.strafeSign = random() > .5 ? 1 : -1;
        }
      }
      continue;
    }

    if (data.magazine <= 0) {
      data.state = 'reload';
      data.reloadUntil = time + SOLDIER_RELOAD_MS;
      setEnemyAction(soldier, 'Reload', true);
      continue;
    }

    const wantsCloser = distance > SOLDIER_ENGAGE_RANGE_M;

    if (data.state === 'reposition') {
      // Strafe perpendicular to the player line instead of standing still.
      const strafe = data.desired.set(-toPlayer.z, 0, toPlayer.x).normalize().multiplyScalar(data.strafeSign);
      if (wantsCloser) strafe.addScaledVector(toPlayer.normalize(), .85);
      applyEnemySeparation(soldier, strafe);
      soldier.position.addScaledVector(strafe.normalize(), data.speed * .8 * delta);
      setEnemyAction(soldier, 'Walk');
      if (time >= data.repositionUntil) data.state = wantsCloser ? 'advance' : 'engage';
      continue;
    }

    if (wantsCloser) {
      data.state = 'advance';
      const direction = data.desired.copy(toPlayer).normalize();
      applyEnemySeparation(soldier, direction);
      soldier.position.addScaledVector(direction.normalize(), data.speed * delta);
      setEnemyAction(soldier, distance > 26 ? 'Run' : 'Walk');
      data.reactionUntil = 0;
      continue;
    }

    // In range: hold position, telegraph the aim, then fire a burst.
    setEnemyAction(soldier, 'Aim');
    if (!data.reactionUntil) {
      data.reactionUntil = time + SOLDIER_REACTION_MIN_MS
        + random() * (SOLDIER_REACTION_MAX_MS - SOLDIER_REACTION_MIN_MS);
      data.state = 'engage';
      continue;
    }
    if (time >= data.reactionUntil && time >= data.nextBurstAt) {
      // Queue behind the active attackers instead of joining a simultaneous volley.
      if (countFiringSoldiers() >= SOLDIER_MAX_SIMULTANEOUS_ATTACKERS) continue;
      data.burstLeft = Math.min(SOLDIER_BURST_SHOTS, data.magazine);
      data.nextShotAt = time;
      data.state = 'fire';
    }
  }
}

function applyEnemySeparation(enemy, direction) {
  const separation = enemy.userData.separation.set(0, 0, 0);
  for (const other of enemies) {
    if (other === enemy || other.userData.dead) continue;
    const away = enemy.userData.away.copy(enemy.position).sub(other.position);
    const gap = away.length();
    const desired = 1.35;
    if (gap > .001 && gap < desired) separation.addScaledVector(away, (desired - gap) / desired / gap);
  }
  if (separation.lengthSq()) direction.addScaledVector(separation.normalize(), .7);
  return direction;
}

// Each shot in a burst must replay the same clip, so the "already active"
// early-out in setEnemyAction cannot be used for the fire animation.
function restartEnemyAction(enemy, name) {
  const action = enemy.userData.actions[name];
  if (!action) return;
  const previous = enemy.userData.activeAction;
  if (previous && previous !== action) previous.fadeOut(.06);
  action.reset().setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.setEffectiveWeight(1).fadeIn(.02).play();
  enemy.userData.activeAction = action;
}

function setEnemyAction(enemy, name, once = false) {
  const next = enemy.userData.actions[name];
  if (!next || enemy.userData.activeAction === next) return;
  const previous = enemy.userData.activeAction;
  next.reset();
  next.enabled = true;
  next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
  next.clampWhenFinished = once;
  next.play();
  if (previous) previous.crossFadeTo(next, .14, true);
  enemy.userData.activeAction = next;
}

function setZombieAction(zombie, name, once = false) {
  const next = zombie.userData.actions[name];
  if (!next || zombie.userData.activeAction === next) return;
  const previous = zombie.userData.activeAction;
  next.reset();
  next.enabled = true;
  next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
  next.clampWhenFinished = once;
  next.play();
  if (previous) previous.crossFadeTo(next, .16, true);
  zombie.userData.activeAction = next;
}

function updatePlayer(delta) {
  const driving = playerPhysicsReady && playerPhysics.controllerMode === 1;
  if (!driving) updateWeaponLocomotion();
  // Keep keyboard movement usable while the optional physics controller is
  // still loading (or when its model assets fail). The old code silently
  // ignored WASD until playerPhysicsReady became true, which made the game
  // look frozen during a slow scene load.
  if (!playerPhysicsReady) {
    const moveX = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
    const moveZ = Number(keys.has('KeyS')) - Number(keys.has('KeyW'));
    if (moveX || moveZ) {
      forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      right.set(Math.cos(yaw), 0, -Math.sin(yaw));
      velocity.set(0, 0, 0);
      velocity.addScaledVector(right, moveX).addScaledVector(forward, -moveZ);
      velocity.normalize().multiplyScalar((keys.has('ShiftLeft') || keys.has('ShiftRight') ? 8.5 : 5.1) * delta);
      camera.position.add(velocity);
      camera.position.x = THREE.MathUtils.clamp(camera.position.x, -56, 56);
      camera.position.z = THREE.MathUtils.clamp(camera.position.z, -60, 13);
      camera.position.y = PLAYER_EYE_HEIGHT;
    }
    return;
  }
  if (playerPhysicsReady) {
    const moveX = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
    const forwardInput = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
    // This model's wheel ordering reports its local forward vector opposite to
    // the visible bonnet. Reverse throttle only while driving: W stays visual
    // forward, while on-foot movement keeps its existing direction.
    const moveY = driving ? -forwardInput : forwardInput;
    const handbrake = driving && keys.has('Space');
    playerPhysics.input.setInput({
      moveX,
      moveY,
      shift: driving ? handbrake : (keys.has('ShiftLeft') || keys.has('ShiftRight'))
    });
    // InputSystem's DOM listeners are intentionally disabled because this FPS
    // owns the keyboard. Vehicle braking reads `space` directly, so mirror it
    // here as well as `shift` (rear-wheel handbrake).
    playerPhysics.input.space = handbrake;
    const physicsPositionBefore = playerPhysics.getPosition()?.clone();
    playerPhysics.update(delta);
    if (!driving && isCsMode() && physicsPositionBefore) {
      const physicsPositionAfter = playerPhysics.getPosition();
      const requestedMovement = moveX !== 0 || forwardInput !== 0;
      if (requestedMovement) {
        physicsPositionAfter.x = camera.position.x;
        physicsPositionAfter.z = camera.position.z;
        forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
        right.set(Math.cos(yaw), 0, -Math.sin(yaw));
        velocity.set(0, 0, 0);
        if (forwardInput) velocity.addScaledVector(forward, forwardInput);
        if (moveX) velocity.addScaledVector(right, moveX);
        const directSpeed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 8.5 : 5.1;
        physicsPositionAfter.addScaledVector(velocity.normalize(), directSpeed * delta);
        physicsPositionAfter.x = THREE.MathUtils.clamp(physicsPositionAfter.x, -56, 56);
        physicsPositionAfter.z = THREE.MathUtils.clamp(physicsPositionAfter.z, -60, 13);
        playerPhysics.reset(physicsPositionAfter);
      }
    }
    if (driving) {
      updateVehicleCamera(delta);
      viewmodelRoot.visible = false;
      resetCrosshairPosition();
      ui.crosshair.classList.add('hidden');
      if (ui.vehiclePrompt) ui.vehiclePrompt.textContent = 'E 下车 · WASD 驾驶 · 右键拖动视角';
      updateVehicleImpacts();
      return;
    }
    const firstPerson = playerPhysics.isFirstPerson;
    viewmodelRoot.visible = firstPerson;
    playerPhysics.playerModel.visible = !firstPerson;
    ui.crosshair.classList.remove('hidden');
    if (firstPerson) resetCrosshairPosition();
    else { updateThirdPersonCrosshair(); updateThirdPersonAimPose(); }
    const position = playerPhysics.getPosition();
    for (const enemy of enemies) {
      if (enemy.userData.dead) continue;
      const dx = position.x - enemy.position.x;
      const dz = position.z - enemy.position.z;
      const minDistance = enemy.userData.isBoss ? 1.35 : .72;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq > .0001 && distanceSq < minDistance * minDistance) {
        const distance = Math.sqrt(distanceSq);
        const push = minDistance - distance;
        position.x += dx / distance * push;
        position.z += dz / distance * push;
      }
    }
    if (firstPerson) {
      // The controller's setFirstPerson() (deferred via setCamPos's rAF, and
      // again on every changeView) parents the camera to the rotated capsule.
      // This FPS writes camera.position/rotation in world space, so a capsule
      // parent cancels out the movement. Re-own the camera only when needed.
      if (camera.parent !== scene) scene.attach(camera);
      camera.position.set(position.x, position.y + .4, position.z);
    }
    const moving = keys.has('KeyW') || keys.has('KeyS') || keys.has('KeyA') || keys.has('KeyD');
    gun.position.y = -.31 + (moving && playerPhysics.getIsOnGround() ? Math.sin(performance.now() * .012) * .012 : 0);
  } else {
  forward.set(-Math.sin(yaw), 0, -Math.cos(yaw)); right.set(Math.cos(yaw), 0, -Math.sin(yaw)); velocity.set(0,0,0);
  if (keys.has('KeyW')) velocity.add(forward); if (keys.has('KeyS')) velocity.sub(forward);
  if (keys.has('KeyD')) velocity.add(right); if (keys.has('KeyA')) velocity.sub(right);
  if (velocity.lengthSq()) {
    const speed = keys.has('ShiftLeft') ? 8.5 : 5.1; velocity.normalize().multiplyScalar(speed * delta); camera.position.add(velocity);
    gun.position.y = -.31 + Math.sin(performance.now() * .012) * .012;
  }
  for (const enemy of enemies) {
    if (enemy.userData.dead) continue;
    const dx = camera.position.x - enemy.position.x; const dz = camera.position.z - enemy.position.z;
    const minDistance = enemy.userData.isBoss ? 1.35 : .72; const distanceSq = dx * dx + dz * dz;
    if (distanceSq > .0001 && distanceSq < minDistance * minDistance) {
      const distance = Math.sqrt(distanceSq); const push = minDistance - distance;
      camera.position.x += dx / distance * push; camera.position.z += dz / distance * push;
    }
  }
  camera.position.x = THREE.MathUtils.clamp(camera.position.x, -56, 56);
  camera.position.z = THREE.MathUtils.clamp(camera.position.z, -60, 13); camera.position.y = 1.65;
  }
  const s = shake; shake *= .82;
  recoilPitch += recoilVelocity * delta;
  recoilVelocity = THREE.MathUtils.damp(recoilVelocity, 0, 24, delta);
  recoilPitch = THREE.MathUtils.damp(recoilPitch, 0, 13, delta);
  recoilYaw = THREE.MathUtils.damp(recoilYaw, 0, 16, delta);
  if (!playerPhysicsReady || playerPhysics.isFirstPerson) {
    camera.rotation.set(pitch + recoilPitch + (random() - .5) * s, yaw + recoilYaw + (random() - .5) * s, 0);
  }
  gunKick *= .72; gunSlideKick *= .42;
  gunLight.intensity = THREE.MathUtils.damp(gunLight.intensity, 0, 34, delta);
  const reloadProgress = reloading ? 1 - Math.max(0, reloadEnd - performance.now()) / 1350 : 0;
  let reloadDrop = 0;
  if (reloadProgress > .24 && reloadProgress < .72) {
    const phase = (reloadProgress - .24) / .48;
    reloadDrop = Math.sin(phase * Math.PI) * .34;
  }
  gun.rotation.x = -.07 + gunKick * .20 + (reloading ? Math.sin(reloadProgress * Math.PI) * .42 : 0);
  gun.rotation.z = -.015 + (reloading ? Math.sin(reloadProgress * Math.PI) * .33 : 0);
  gun.position.z = -.58 + gunKick * .085;
  gun.userData.slide.position.z = gunSlideKick * .105;
  gun.userData.magazine.position.copy(gun.userData.baseMagPosition);
  gun.userData.magazine.position.y -= reloadDrop;
}

function updateVehicleCamera(delta) {
  if (!carVehicle) return;
  const rotation = carVehicle.chassisBody.rotation();
  vehicleImpactQuat.set(rotation.x, rotation.y, rotation.z, rotation.w);
  vehicleCameraForward.copy(carVehicle.forwardLocal).applyQuaternion(vehicleImpactQuat).setY(0).normalize();

  // Orbit angles are relative to the car, so the camera naturally follows a
  // turn while preserving the player's chosen side/rear viewing angle.
  const behindYaw = Math.atan2(-vehicleCameraForward.x, -vehicleCameraForward.z);
  const yawAngle = behindYaw + vehicleCameraYawOffset;
  const distance = Math.max(7.2, carVehicle.size.l * 1.18);
  const horizontalDistance = Math.cos(vehicleCameraPitch) * distance;
  vehicleCameraTarget.copy(carVehicle.vehicleGroup.position);
  vehicleCameraTarget.y += Math.max(.85, carVehicle.size.h * .42);
  vehicleCameraDesired.set(
    vehicleCameraTarget.x + Math.sin(yawAngle) * horizontalDistance,
    vehicleCameraTarget.y + Math.sin(vehicleCameraPitch) * distance,
    vehicleCameraTarget.z + Math.cos(yawAngle) * horizontalDistance
  );

  if (!vehicleCameraInitialized) {
    camera.position.copy(vehicleCameraDesired);
    vehicleCameraInitialized = true;
  } else {
    const follow = 1 - Math.exp(-7.5 * delta);
    camera.position.lerp(vehicleCameraDesired, follow);
  }
  playerPhysics.controls.target.lerp(vehicleCameraTarget, 1 - Math.exp(-11 * delta));
  camera.lookAt(playerPhysics.controls.target);
}

function updateVehiclePrompt() {
  if (!ui.vehiclePrompt || !playerPhysicsReady || !carVehicle) return;
  if (playerPhysics.controllerMode === 1) {
    ui.vehiclePrompt.classList.remove('hidden');
    return;
  }
  const near = getVehicleBoardingDistance() <= VEHICLE_BOARDING_DISTANCE;
  ui.vehiclePrompt.textContent = 'E 上车';
  ui.vehiclePrompt.classList.toggle('hidden', !near);
}

function getVehicleBoardingDistance() {
  if (!playerPhysicsReady || !carVehicle) return Infinity;
  carVehicle.vehicleGroup.updateMatrixWorld(true);
  vehicleBoardingLocal.copy(playerPhysics.getPosition());
  carVehicle.vehicleGroup.worldToLocal(vehicleBoardingLocal);

  // Build the driver-door interaction point from the vehicle's actual local
  // forward vector. This remains correct even when the imported model needed
  // a 90-degree rotation and local X/Z no longer mean length/width directly.
  const forwardLocal = carVehicle.forwardLocal;
  vehicleBoardingSide.set(-forwardLocal.z, 0, forwardLocal.x).normalize();
  const seat = carVehicle.driverSeatPosition;
  const seatLongitudinal = (seat.x * forwardLocal.x + seat.z * forwardLocal.z) * carVehicle.scale;
  const seatSide = seat.x * vehicleBoardingSide.x + seat.z * vehicleBoardingSide.z;
  const driverSideSign = Math.sign(seatSide) || 1;
  const sideExtent = Math.abs(vehicleBoardingSide.x) * carVehicle.halfExtents.x
    + Math.abs(vehicleBoardingSide.z) * carVehicle.halfExtents.z;
  vehicleBoardingDoor.copy(forwardLocal).multiplyScalar(seatLongitudinal);
  vehicleBoardingDoor.addScaledVector(vehicleBoardingSide, driverSideSign * (sideExtent + .38));
  return Math.hypot(
    vehicleBoardingLocal.x - vehicleBoardingDoor.x,
    vehicleBoardingLocal.z - vehicleBoardingDoor.z
  );
}

function toggleVehicleMode() {
  if (!playerPhysicsReady || !carVehicle) {
    toast('车辆仍在加载，请稍候');
    return;
  }
  if (playerPhysics.controllerMode === 1) {
    playerPhysics.input.resetKeys();
    keys.delete('KeyW'); keys.delete('KeyA');
    keys.delete('KeyS'); keys.delete('KeyD'); keys.delete('Space');
    playerPhysics.vehicle.exit();
    vehicleCameraInitialized = false;
    vehicleCameraDragging = false;
    // Walking always uses the FPS camera. VehicleSystem changes controller
    // mode but does not restore the original view by itself.
    if (!playerPhysics.isFirstPerson) playerPhysics.cam.changeView();
    toast('已下车');
    return;
  }
  const boardingDistance = getVehicleBoardingDistance();
  if (boardingDistance > VEHICLE_BOARDING_DISTANCE) {
    toast(`距离车辆太远 · 还需靠近 ${Math.ceil(boardingDistance - VEHICLE_BOARDING_DISTANCE)} 米`);
    return;
  }
  // Entry is now tied to the computed driver-door point, not the car centre or
  // the nearest arbitrary body panel.
  const vehicleSystem = playerPhysics.vehicle;
  playerPhysics.input.resetKeys();
  keys.delete('KeyW'); keys.delete('KeyA');
  keys.delete('KeyS'); keys.delete('KeyD'); keys.delete('Space');
  vehicleSystem.releaseParkingBrake(carVehicle);
  vehicleSystem.active = carVehicle;
  playerPhysics.controllerMode = 1;
  playerPhysics.playerVelocity.set(0, 0, 0);
  playerPhysics.activeDynamicBody = null;
  playerPhysics.cam.setOverShoulder(false);
  playerPhysics.animation.playByName('driving');
  playerPhysics.syncMountedPlayer(carVehicle);
  playerPhysics.syncDebugVisibility();
  playerPhysics.onVehicleEnter?.(carVehicle);
  vehicleCameraYawOffset = 0;
  vehicleCameraPitch = .34;
  vehicleCameraInitialized = false;
  // CameraSystem only runs its chase-camera update in third-person mode.
  // Switch after mounting so its look target is the active car.
  if (playerPhysics.isFirstPerson) playerPhysics.cam.changeView();
  if (playerPhysics.controllerMode === 1) toast('已上车 · WASD 驾驶 · Space 手刹');
  else toast('请靠近驾驶门后再按 E');
}

function updateVehicleImpacts() {
  if (!carVehicle) return;
  const bodyVelocity = carVehicle.chassisBody.linvel();
  const speed = Math.hypot(bodyVelocity.x, bodyVelocity.z);
  if (speed < .35) return;
  const carPos = carVehicle.vehicleGroup.position;
  const rotation = carVehicle.chassisBody.rotation();
  vehicleImpactQuat.set(rotation.x, rotation.y, rotation.z, rotation.w);
  const inverseRotation = vehicleImpactQuat.clone().invert();
  const halfX = carVehicle.halfExtents.x;
  const halfZ = carVehicle.halfExtents.z;
  const now = performance.now();
  for (const enemy of enemies) {
    if (enemy.userData.dead || now - (enemy.userData.lastVehicleHit || 0) < 420) continue;
    const radius = Math.max(.32, enemy.userData.collisionRadius * enemy.userData.perspectiveScale * .72);
    vehicleImpactLocal.copy(enemy.position).sub(carPos).applyQuaternion(inverseRotation);
    if (Math.abs(vehicleImpactLocal.x) > halfX + radius || Math.abs(vehicleImpactLocal.z) > halfZ + radius) continue;

    // Resolve against the nearest face of the oriented chassis instead of a
    // centre-radius test. This distinguishes bumper hits from side swipes.
    const penetrationX = halfX + radius - Math.abs(vehicleImpactLocal.x);
    const penetrationZ = halfZ + radius - Math.abs(vehicleImpactLocal.z);
    if (penetrationX < penetrationZ) {
      vehicleImpactNormal.set(Math.sign(vehicleImpactLocal.x) || 1, 0, 0);
      vehicleImpactLocal.x += vehicleImpactNormal.x * penetrationX;
    } else {
      vehicleImpactNormal.set(0, 0, Math.sign(vehicleImpactLocal.z) || 1);
      vehicleImpactLocal.z += vehicleImpactNormal.z * penetrationZ;
    }
    vehicleImpactNormal.applyQuaternion(vehicleImpactQuat).setY(0).normalize();
    enemy.position.copy(vehicleImpactLocal.applyQuaternion(vehicleImpactQuat).add(carPos));

    enemy.userData.lastVehicleHit = now;
    const closingSpeed = Math.max(Math.abs(bodyVelocity.x * vehicleImpactNormal.x + bodyVelocity.z * vehicleImpactNormal.z), speed * .32);
    const damageAmount = closingSpeed < 2.2 ? 4 : Math.min(220, 18 + closingSpeed * closingSpeed * 3.2);
    enemy.userData.hp -= damageAmount;
    enemy.userData.hitUntil = now + Math.min(620, 180 + closingSpeed * 42);

    vehicleImpactVelocity.set(bodyVelocity.x, 0, bodyVelocity.z);
    if (vehicleImpactVelocity.lengthSq() < .1) vehicleImpactVelocity.copy(vehicleImpactNormal);
    vehicleImpactVelocity.normalize().multiplyScalar(Math.min(11, 1.5 + closingSpeed * .72));
    vehicleImpactVelocity.addScaledVector(vehicleImpactNormal, Math.min(4, closingSpeed * .28));
    enemy.userData.vehicleImpactVelocity = vehicleImpactVelocity.clone();
    enemy.userData.vehicleImpactSpin = (random() - .5) * Math.min(7, 1.5 + closingSpeed * .45);
    enemy.userData.vehicleImpactLift = 0;
    enemy.userData.vehicleImpactLiftVelocity = Math.min(4.8, .5 + closingSpeed * .28);
    enemy.userData.deathSide = vehicleImpactNormal.x * vehicleImpactNormal.z >= 0 ? 1 : -1;

    const hitPoint = enemy.position.clone();
    hitPoint.y += enemy.userData.isBoss ? 1.7 : 1.05;
    createImpact(hitPoint, vehicleImpactNormal, 0x6f1111);
    if (closingSpeed > 5) createImpact(hitPoint, vehicleImpactNormal, 0x361009);
    shake = Math.max(shake, Math.min(.085, .012 + closingSpeed * .004));
    tone(Math.max(48, 105 - closingSpeed * 3), .08 + Math.min(.1, closingSpeed * .006), 'sawtooth');

    if (enemy.userData.hp <= 0 || closingSpeed > 9.5) {
      enemy.userData.hp = 0;
      killEnemy(enemy, false);
    } else {
      if (enemy.userData.kind === 'soldier') restartEnemyAction(enemy, 'HitReact');
      else setZombieAction(enemy, 'HitReact', true);
      // Low-speed contact pushes the body aside rather than repeatedly
      // damaging it while the bumper remains touching.
      enemy.position.addScaledVector(vehicleImpactNormal, .16 + Math.min(.5, closingSpeed * .035));
    }
  }
}

function updateHud() {
  const total = roundCount();
  ui.health.textContent = Math.ceil(health); ui.healthBar.style.width = `${health}%`;
  ui.ammo.textContent = String(magazine).padStart(2, '0'); ui.reserve.textContent = `/ ${reserve}`;
  ui.wave.textContent = `${Math.min(wave || 1, total)} / ${total}`;
  ui.alive.textContent = livingEnemies() + remainingToSpawn;
  ui.kills.textContent = kills; ui.score.textContent = score.toLocaleString();
  const boss = enemies.find(enemy => enemy.userData.isBoss && !enemy.userData.dead);
  ui.bossPanel.classList.toggle('hidden', !boss);
  if (boss) ui.bossHealth.style.width = `${Math.max(0, boss.userData.hp / boss.userData.maxHp * 100)}%`;
}

function toast(message) {
  ui.toast.textContent = message; ui.toast.classList.remove('hidden');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => ui.toast.classList.add('hidden'), 1600);
}

function tone(freq, duration, type = 'sine') {
  try {
    audioContext ||= new AudioContext(); const osc = audioContext.createOscillator(); const gain = audioContext.createGain();
    osc.type = type; osc.frequency.value = freq; gain.gain.setValueAtTime(.09, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + duration);
    osc.connect(gain).connect(audioContext.destination); osc.start(); osc.stop(audioContext.currentTime + duration);
  } catch {}
}

function gunshotSound() {
  try {
    audioContext ||= new AudioContext();
    const now = audioContext.currentTime;
    const master = audioContext.createGain(); master.gain.setValueAtTime(.42, now); master.gain.exponentialRampToValueAtTime(.001, now + .32); master.connect(audioContext.destination);

    const buffer = audioContext.createBuffer(1, Math.floor(audioContext.sampleRate * .34), audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / audioContext.sampleRate;
      data[i] = (random() * 2 - 1) * Math.exp(-t * 24) + (random() * 2 - 1) * .16 * Math.exp(-t * 5.5);
    }
    const noise = audioContext.createBufferSource(); noise.buffer = buffer;
    const highpass = audioContext.createBiquadFilter(); highpass.type = 'highpass'; highpass.frequency.value = 90;
    noise.connect(highpass).connect(master); noise.start(now);

    const punch = audioContext.createOscillator(); const punchGain = audioContext.createGain();
    punch.type = 'triangle'; punch.frequency.setValueAtTime(150, now); punch.frequency.exponentialRampToValueAtTime(48, now + .09);
    punchGain.gain.setValueAtTime(.5, now); punchGain.gain.exponentialRampToValueAtTime(.001, now + .11);
    punch.connect(punchGain).connect(master); punch.start(now); punch.stop(now + .12);

    const crack = audioContext.createOscillator(); const crackGain = audioContext.createGain();
    crack.type = 'square'; crack.frequency.value = 1180; crackGain.gain.setValueAtTime(.08, now); crackGain.gain.exponentialRampToValueAtTime(.001, now + .018);
    crack.connect(crackGain).connect(master); crack.start(now); crack.stop(now + .02);
  } catch {}
}

// Distance-attenuated crack so the player can tell incoming fire from their own.
function enemyGunshotSound(distance) {
  try {
    audioContext ||= new AudioContext();
    const now = audioContext.currentTime;
    const attenuation = THREE.MathUtils.clamp(1 - distance / SOLDIER_MAX_FIRE_RANGE_M, .12, 1);
    const master = audioContext.createGain();
    master.gain.setValueAtTime(.2 * attenuation, now);
    master.gain.exponentialRampToValueAtTime(.001, now + .26);
    master.connect(audioContext.destination);

    const crack = audioContext.createOscillator();
    const crackGain = audioContext.createGain();
    crack.type = 'square';
    crack.frequency.setValueAtTime(760, now);
    crack.frequency.exponentialRampToValueAtTime(190, now + .05);
    crackGain.gain.setValueAtTime(.32, now);
    crackGain.gain.exponentialRampToValueAtTime(.001, now + .07);
    crack.connect(crackGain).connect(master);
    crack.start(now); crack.stop(now + .08);

    const tail = audioContext.createOscillator();
    const tailGain = audioContext.createGain();
    tail.type = 'triangle';
    tail.frequency.setValueAtTime(120, now);
    tailGain.gain.setValueAtTime(.18, now);
    tailGain.gain.exponentialRampToValueAtTime(.001, now + .2);
    tail.connect(tailGain).connect(master);
    tail.start(now); tail.stop(now + .21);
  } catch {}
}

function reloadSound() {
  tone(210, .045, 'square');
  setTimeout(() => tone(135, .075, 'triangle'), 430);
  setTimeout(() => tone(360, .055, 'square'), 980);
  setTimeout(() => tone(190, .04, 'square'), 1220);
}

function begin() {
  gameMode = GAME_MODES[ui.mode?.value] ? ui.mode.value : 'zombie';
  document.body.dataset.mode = gameMode;
  if (isCsMode()) ensureSoldierModel();
  ui.start.classList.remove('visible'); running = true; paused = false;
  updateHud();
  keepViewmodelVisible();
  canvas.requestPointerLock?.().catch?.(() => {}); if (!lccObject) setTimeout(loadWorld, 0); clock.getDelta();
}

function restart() {
  // Cancel deferred round transitions first; otherwise a pending startWave from
  // the previous session advances the wave counter twice.
  clearPendingTimers();
  clearEnemies();
  soldierFireStats.shots = soldierFireStats.hits = soldierFireStats.damage = soldierFireStats.chanceSum = 0;
  health = 100; magazine = 30; reserve = 90; kills = 0; score = 0; wave = 0; gameOver = false;
  remainingToSpawn = 0; currentWaveTotal = 0; betweenWaves = false; reloading = false; camera.position.set(-34.86, 1.90, -1.40); yaw = pitch = 0;
  ui.ammo.classList.remove('reloading');
  if (playerPhysicsReady) playerPhysics.reset(new THREE.Vector3(-34.86, 1.50, -1.40));
  ui.result.classList.remove('visible'); ui.pause.classList.remove('visible'); running = true; paused = false;
  canvas.requestPointerLock?.().catch?.(() => {}); updateHud(); startWave();
}

function animate(time = 0) {
  requestAnimationFrame(animate); const delta = Math.min(clock.getDelta(), .05);
  const positionHud = document.getElementById('position-hud');
  if (positionHud) positionHud.textContent = `POS X ${camera.position.x.toFixed(2)} | Y ${camera.position.y.toFixed(2)} | Z ${camera.position.z.toFixed(2)}`;
  keepViewmodelVisible();
  for (const set of weaponAnimationSets.values()) set.mixer.update(delta);
  // Pointer lock is only needed for mouse-look. Keep the simulation running
  // when browsers or embedded previews reject pointer lock, so keyboard
  // movement remains usable.
  if (running && !paused && !gameOver) {
    if (reloading && performance.now() >= reloadEnd) {
      const amount = Math.min(30 - magazine, reserve); magazine += amount; reserve -= amount; reloading = false; ui.ammo.classList.remove('reloading'); updateHud();
    }
    updatePlayer(delta);
    if (primaryFireHeld) shoot();
    updateKnife(performance.now());
    updateVehiclePrompt();
    if (isCsMode()) updateSoldiers(delta, performance.now());
    else updateZombies(delta, time);
    updateWaves(delta);
  }
  updateTracers(delta);
  for (let i = casings.length - 1; i >= 0; i--) {
    const c = casings[i]; c.userData.life -= delta; c.userData.velocity.y -= 7.5 * delta; c.position.addScaledVector(c.userData.velocity, delta);
    c.rotation.x += c.userData.spin.x * delta; c.rotation.y += c.userData.spin.y * delta; c.rotation.z += c.userData.spin.z * delta;
    if (c.userData.life <= 0) { scene.remove(c); c.geometry.dispose(); c.material.dispose(); casings.splice(i, 1); }
  }
  for (let i = impactParticles.length - 1; i >= 0; i--) {
    const p = impactParticles[i]; p.userData.life -= delta; p.userData.velocity.y -= 4 * delta; p.position.addScaledVector(p.userData.velocity, delta); p.material.opacity = Math.max(0, p.userData.life * 4);
    if (p.userData.life <= 0) { scene.remove(p); p.geometry.dispose(); p.material.dispose(); impactParticles.splice(i, 1); }
  }
  if (lccObject) LCCRender.update();
  keepViewmodelVisible();
  // After the final viewmodel sync (which resets the host transform) and the
  // mixers (which may key bone scale), so the knife pose reaches the render.
  applyKnifeViewmodelPose(performance.now());
  renderer.render(scene, camera);
  renderer.autoClear = false;
  renderer.clearDepth();
  renderer.render(viewmodelScene, camera);
  renderer.autoClear = true;
}

addEventListener('mousemove', e => {
  if (document.pointerLockElement !== canvas || paused) return;
  if (playerPhysicsReady && playerPhysics.controllerMode === 1 && carVehicle) {
    if (vehicleCameraDragging || (e.buttons & 2)) {
      vehicleCameraYawOffset -= e.movementX * .0035;
      vehicleCameraPitch = THREE.MathUtils.clamp(
        vehicleCameraPitch + e.movementY * .0027,
        .12,
        .82
      );
    }
    return;
  }
  if (playerPhysicsReady && !playerPhysics.isFirstPerson) {
    playerPhysics.cam.orbit(playerPhysics.controls.target, -e.movementX * .0027, e.movementY * .0022);
    return;
  }
  yaw -= e.movementX * .0021; pitch = THREE.MathUtils.clamp(pitch - e.movementY * .0021, -1.35, 1.35);
});
addEventListener('mousedown', e => {
  if (playerPhysicsReady && playerPhysics.controllerMode === 1 && e.button === 2) {
    vehicleCameraDragging = true;
    e.preventDefault();
    return;
  }
  if (e.button === 0) { primaryFireHeld = true; shoot(); }
});
addEventListener('mouseup', e => {
  if (e.button === 0) primaryFireHeld = false;
  if (e.button === 2) vehicleCameraDragging = false;
});
addEventListener('blur', () => { primaryFireHeld = false; });
canvas.addEventListener('contextmenu', e => {
  if (playerPhysicsReady && playerPhysics.controllerMode === 1) e.preventDefault();
});
document.addEventListener('keydown', e => {
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (e.code === 'KeyE' && !e.repeat && playerPhysicsReady) {
    toggleVehicleMode();
  }
  if (e.code === 'KeyV' && !e.repeat && playerPhysicsReady && playerPhysics.controllerMode !== 1) {
    playerPhysics.cam.changeView();
    playerPhysics.playerModel.visible = !playerPhysics.isFirstPerson;
    viewmodelRoot.visible = playerPhysics.isFirstPerson;
    if (playerPhysics.isFirstPerson) resetCrosshairPosition();
    toast(playerPhysics.isFirstPerson ? '第一人称视角' : '第三人称视角');
  }
  if (e.code === 'KeyR') reload();
  if (e.code === 'Digit1') switchWeapon('ak47');
  if (e.code === 'Digit2') switchWeapon('g36c');
  if (e.code === 'Digit3') switchWeapon('knife');
  if (e.code === 'Space' && !e.repeat && playerPhysicsReady && playerPhysics.controllerMode !== 1) {
    playerPhysics.input.setInput({ jump: true });
  }
});
document.addEventListener('keyup', e => {
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].includes(e.code)) e.preventDefault();
  keys.delete(e.code);
  if (e.code === 'Space' && playerPhysicsReady && playerPhysics.controllerMode !== 1) playerPhysics.input.setInput({ jump: false });
});
addEventListener('blur', () => { keys.clear(); vehicleCameraDragging = false; });
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  applyQuality();
});
document.addEventListener('pointerlockchange', () => {
  // Losing pointer lock only disables mouse-look. Keyboard movement remains
  // available, including in browsers that do not support Pointer Lock.
});
canvas.addEventListener('click', () => { if (running && !paused) canvas.requestPointerLock?.().catch?.(() => {}); });
$('#start-button').addEventListener('click', begin);
$('#resume-button').addEventListener('click', () => { paused = false; ui.pause.classList.remove('visible'); canvas.requestPointerLock?.().catch?.(() => {}); });
$('#restart-pause').addEventListener('click', restart); $('#restart-result').addEventListener('click', restart);
ui.quality.addEventListener('change', applyQuality);
ui.mode?.addEventListener('change', applyModeChrome);
addEventListener('beforeunload', () => LCCRender.dispose());

window.__THREE_GAME_DIAGNOSTICS__ = {
  renderer: renderer.info,
  get state() {
    return {
      running, paused, gameOver, sceneReady, wave, health, magazine,
      enemiesAlive: enemies.filter(enemy => !enemy.userData.dead).length,
      enemiesTracked: enemies.length,
      remainingToSpawn,
      gameMode, roundCount: roundCount(),
      regularModelReady: Boolean(zombieTemplate), bossModelReady: Boolean(bossTemplate),
      soldierModelReady: Boolean(soldierTemplate),
      soldierRifleReady: Boolean(soldierRifleTemplate),
      soldierClips: Object.keys(soldierAnimations),
      enemyStates: enemies.filter(e => !e.userData.dead).map(e => e.userData.state),
      zombieVariants: enemies.filter(e => !e.userData.dead && e.userData.kind === 'zombie').map(e => e.userData.variantIndex),
      soldierFire: {
        shots: soldierFireStats.shots,
        hits: soldierFireStats.hits,
        damage: soldierFireStats.damage,
        measuredHitRate: soldierFireStats.shots
          ? Number((soldierFireStats.hits / soldierFireStats.shots).toFixed(3)) : null,
        intendedHitRate: soldierFireStats.shots
          ? Number((soldierFireStats.chanceSum / soldierFireStats.shots).toFixed(3)) : null
      },
      pendingTimers: pendingTimers.size,
      activeTracers: tracerPool.filter(t => t.userData.life > 0).length,
      zombieAnimatedHeight,
      bossLoadComplete, playerPhysicsReady, weaponModelReady,
      activeWeapon, loadedWeaponModels: [...weaponModels.keys()],
      weaponVisible: weaponModels.get(activeWeapon)?.visible ?? false,
      weaponPosition: weaponModels.get(activeWeapon)?.position.toArray() ?? null,
      cameraInScene: camera.parent === scene,
      cameraInViewmodelScene: viewmodelRoot.parent === viewmodelScene,
      cameraParent: camera.parent?.name || camera.parent?.type || null,
      cameraPosition: camera.position.toArray(),
      playerPosition: playerPhysicsReady ? playerPhysics.getPosition()?.toArray() ?? null : null,
      inputKeys: [...keys],
      playerOnGround: playerPhysicsReady ? playerPhysics.getIsOnGround() : null,
      quality: ui.quality.value
    };
  }
};
window.__THREE_GAME_TEST_HOOKS__ = {
  seed(value = 0x13d1a1) { rngState = Number(value) >>> 0 || 1; return { seed: rngState }; },
  async setState(name) {
    if (name !== 'active-play') throw new Error(`Unknown test state: ${name}`);
    testMode = true; if (!running) begin();
    const deadline = performance.now() + 45000;
    while ((!sceneReady || !zombieTemplate) && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
    if (!sceneReady || !zombieTemplate) throw new Error('Active play assets did not become ready');
    return { state: name };
  },
  setReducedMotion(value) { document.documentElement.classList.toggle('reduced-motion', Boolean(value)); },
  hideDebugUi() {},
  setPausedForScreenshot(value) { paused = Boolean(value); return { paused }; },
  // Lets automated checks exercise combat without waiting on the 200 MB
  // 3DGS stream. Only affects the gameplay gate, never the LCC pipeline.
  async setMode(name) {
    if (!GAME_MODES[name]) throw new Error(`Unknown mode: ${name}`);
    if (ui.mode) ui.mode.value = name;
    gameMode = name;
    applyModeChrome();
    if (name === 'cs') await ensureSoldierModel();
    return { gameMode, soldierModelReady: Boolean(soldierTemplate) };
  },
  startCombatWithoutScene() {
    testMode = true;
    sceneReady = true;
    if (!running) { running = true; paused = false; ui.start.classList.remove('visible'); clock.getDelta(); }
    if (wave === 0) startWave();
    return { wave, remainingToSpawn };
  },
  // Jumps straight to a given round so late-round balance can be measured with
  // the real squad size and accuracy ramp.
  startRound(target) {
    testMode = true;
    sceneReady = true;
    clearPendingTimers();
    clearEnemies();
    soldierFireStats.shots = soldierFireStats.hits = soldierFireStats.damage = soldierFireStats.chanceSum = 0;
    // A full reset, otherwise a previous scenario that killed the player leaves
    // gameOver set and startWave() returns silently.
    health = 100; magazine = 30; reserve = 90; kills = 0; score = 0;
    gameOver = false; betweenWaves = false; reloading = false; remainingToSpawn = 0;
    ui.result.classList.remove('visible');
    ui.pause.classList.remove('visible');
    ui.start.classList.remove('visible');
    ui.ammo.classList.remove('reloading');
    running = true; paused = false;
    clock.getDelta();
    wave = Math.max(1, Math.min(target, roundCount())) - 1;
    startWave();
    return { wave, remainingToSpawn, expected: modeConfig().counts[wave - 1], gameOver };
  },
  // Viewmodel-space boxes of the borrowed-arms weapon vs the AK body it replaces.
  weaponRigSnapshot() {
    if (!sharedArmsRig) return { rig: false };
    const host = weaponModels.get('ak47');
    host.updateMatrixWorld(true);
    const toViewmodel = new THREE.Matrix4().copy(viewmodelRoot.matrixWorld).invert();
    const vertex = new THREE.Vector3();
    const boxOf = (root, useSkinning) => {
      const box = new THREE.Box3();
      root.traverse(object => {
        if (!object.isMesh) return;
        const positions = object.geometry.attributes.position;
        for (let i = 0; i < positions.count; i += useSkinning ? 1 : 3) {
          object.getVertexPosition(i, vertex);
          box.expandByPoint(vertex.applyMatrix4(object.matrixWorld).applyMatrix4(toViewmodel));
        }
      });
      return { min: box.min.toArray().map(v => +v.toFixed(3)), max: box.max.toArray().map(v => +v.toFixed(3)) };
    };
    const akBody = { traverse: fn => sharedArmsRig.gunMeshes.forEach(fn) };
    const arms = { traverse: fn => host.traverse(o => { if (o.isMesh && !sharedArmsRig.gunMeshes.includes(o)) fn(o); }) };
    const g36c = weaponModels.get('g36c');
    return {
      rig: true,
      g36cParent: g36c?.parent?.name ?? null,
      g36cVisible: g36c?.visible ?? false,
      akBodyVisible: sharedArmsRig.gunMeshes.map(mesh => mesh.visible),
      armsVisible: host.visible,
      akBody: boxOf(akBody, true),
      g36cBox: g36c ? boxOf(g36c, false) : null,
      armsBox: boxOf(arms, true)
    };
  },
  // Mean on-screen sRGB luminance (0-255) of the viewmodel arms vs active gun,
  // isolated by re-rendering the viewmodel pass with each part hidden.
  measureViewmodelLuminance() {
    if (!sharedArmsRig) return null;
    const host = weaponModels.get('ak47');
    const gunRoot = activeWeapon === 'ak47' ? null : weaponModels.get(activeWeapon);
    const gunMeshes = gunRoot ? [] : sharedArmsRig.gunMeshes;
    if (gunRoot) gunRoot.traverse(o => { if (o.isMesh) gunMeshes.push(o); });
    const armMeshes = [];
    host.traverse(o => { if (o.isMesh && !sharedArmsRig.gunMeshes.includes(o)) armMeshes.push(o); });
    const gl = renderer.getContext();
    const w = gl.drawingBufferWidth; const h = gl.drawingBufferHeight;
    const grab = () => {
      renderer.clear();
      renderer.render(viewmodelScene, camera);
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return px;
    };
    const withHidden = (meshes, fn) => {
      const saved = meshes.map(m => m.visible);
      meshes.forEach(m => { m.visible = false; });
      const out = fn();
      meshes.forEach((m, i) => { m.visible = saved[i]; });
      return out;
    };
    const full = grab();
    const noGun = withHidden(gunMeshes, grab);
    const noArms = withHidden(armMeshes, grab);
    const mean = other => {
      let sum = 0; let count = 0;
      for (let i = 0; i < full.length; i += 4) {
        if (Math.abs(full[i] - other[i]) + Math.abs(full[i + 1] - other[i + 1]) + Math.abs(full[i + 2] - other[i + 2]) < 6) continue;
        sum += .2126 * full[i] + .7152 * full[i + 1] + .0722 * full[i + 2]; count++;
      }
      return { luminance: count ? +(sum / count).toFixed(1) : null, pixels: count };
    };
    return { weapon: activeWeapon, arms: mean(noArms), gun: mean(noGun) };
  },
  // Knife placement in viewmodel space plus swing/hit state.
  knifeSnapshot() {
    if (!knifeModel || !sharedArmsRig) return { mounted: false };
    const host = sharedArmsRig.host;
    host.updateMatrixWorld(true);
    const toViewmodel = new THREE.Matrix4().copy(viewmodelRoot.matrixWorld).invert();
    const knifeInView = new THREE.Matrix4().multiplyMatrices(toViewmodel, knifeModel.matrixWorld);
    const origin = new THREE.Vector3().applyMatrix4(knifeInView);
    const tip = new THREE.Vector3(0, 0, -(KNIFE_HANDLE_LENGTH_M / 2 + .008 + KNIFE_BLADE_LENGTH_M)).applyMatrix4(knifeInView);
    const spine = new THREE.Vector3(0, 1, 0).transformDirection(knifeInView);
    const round = v => v.toArray().map(x => +x.toFixed(3));
    return {
      mounted: true, visible: knifeModel.visible, parent: knifeModel.parent?.name,
      handleCenter: round(origin), tip: round(tip),
      bladeDir: round(tip.clone().sub(origin).normalize()), spineDir: round(spine),
      fistCenter: round(sharedArmsRig.knifeGrip.fistCenter),
      gripAxis: round(sharedArmsRig.knifeGrip.gripAxis),
      leftArmCollapsed: knifeLeftArmCollapsed,
      activeWeapon, running, paused, gameOver, lastHit: knifeLastResult,
      swingAgeMs: Math.round(performance.now() - knifeSwingStart),
      swinging: performance.now() - knifeSwingStart < KNIFE_SWING_MS
    };
  },
  // Knife tip/handle (viewmodel space) frozen at swing fraction t in [0, 1).
  knifePoseAt(t) {
    if (!knifeModel || activeWeapon !== 'knife') return null;
    const now = performance.now();
    const savedStart = knifeSwingStart; const savedPending = knifeHitPending;
    keepViewmodelVisible();
    knifeSwingStart = now - t * KNIFE_SWING_MS; knifeHitPending = false;
    applyKnifeViewmodelPose(now);
    const snapshot = this.knifeSnapshot();
    knifeSwingStart = savedStart; knifeHitPending = savedPending;
    keepViewmodelVisible();
    return { t, tip: snapshot.tip, handle: snapshot.handleCenter };
  },
  // Moves the nearest live enemy onto the crosshair line at `distance` metres.
  placeEnemyInFront(distance = 1.2) {
    const enemy = enemies.find(e => !e.userData.dead);
    if (!enemy) return null;
    const forward = camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
    const eye = camera.getWorldPosition(new THREE.Vector3());
    enemy.position.set(eye.x + forward.x * distance, enemy.position.y, eye.z + forward.z * distance);
    enemy.updateMatrixWorld(true);
    return { hp: enemy.userData.hp, kind: enemy.userData.kind, position: enemy.position.toArray() };
  },
  enemyHp() { return enemies.filter(e => !e.userData.dead).map(e => e.userData.hp); },
  spawnOne(index = 1) { return { spawned: spawnEnemy(index) }; },
  killAllEnemies() {
    let killed = 0;
    for (const enemy of [...enemies]) {
      if (enemy.userData.dead) continue;
      killEnemy(enemy, false); killed++;
    }
    return { killed };
  },
  restartNow() { restart(); return { wave, pendingTimers: pendingTimers.size }; },
  enemySnapshot() {
    return enemies.map(enemy => {
      const data = enemy.userData;
      return {
        kind: data.kind, dead: data.dead, hp: data.hp, state: data.state,
        action: data.activeAction?.getClip().name ?? null,
        hasRifle: Boolean(data.rifle),
        height: new THREE.Box3().setFromObject(data.model).getSize(new THREE.Vector3()).y,
        distance: enemy.position.distanceTo(camera.position)
      };
    });
  },
  // Objective facing test. For an upright humanoid the forward vector is
  // up x shoulderLine (left shoulder -> right shoulder), so a positive dot
  // product against the direction to the player means the bot faces the player
  // rather than running at them backwards.
  facingProbe() {
    const up = new THREE.Vector3(0, 1, 0);
    return enemies.map(enemy => {
      const model = enemy.userData.model;
      const left = model?.getObjectByName('mixamorigLeftShoulder');
      const right = model?.getObjectByName('mixamorigRightShoulder');
      if (!left || !right) return { error: 'shoulder bones not found' };
      const leftPosition = left.getWorldPosition(new THREE.Vector3());
      const rightPosition = right.getWorldPosition(new THREE.Vector3());
      const shoulderLine = rightPosition.sub(leftPosition).setY(0).normalize();
      const facing = up.clone().cross(shoulderLine).normalize();
      const toPlayer = new THREE.Vector3()
        .copy(camera.position).sub(enemy.position).setY(0).normalize();
      const dot = facing.dot(toPlayer);
      return { facingDotToPlayer: Number(dot.toFixed(3)), facesPlayer: dot > .3 };
    });
  },
  // Verifies the rifle prop ended up in the hand at a sane world size. Bone
  // space is scaled by the armature, so a wrong scale divisor is easy to miss.
  rifleProbe() {
    const box = new THREE.Box3();
    const size = new THREE.Vector3();
    const centre = new THREE.Vector3();
    const hand = new THREE.Vector3();
    return enemies.map(enemy => {
      const rifle = enemy.userData.rifle;
      const bone = enemy.userData.model?.getObjectByName('mixamorigRightHand');
      if (!rifle || !bone) return { error: 'rifle or hand bone missing' };
      box.setFromObject(rifle);
      box.getSize(size); box.getCenter(centre);
      bone.getWorldPosition(hand);
      return {
        worldLengthM: Number(Math.max(size.x, size.y, size.z).toFixed(3)),
        distanceToHandM: Number(centre.distanceTo(hand).toFixed(3)),
        attachedToHand: rifle.parent === bone
      };
    });
  },
  teleportEnemiesTo(distance = 10) {
    for (const enemy of enemies) {
      enemy.position.set(camera.position.x, 0, camera.position.z - distance);
    }
    return { moved: enemies.length };
  }
};

// `?mode=cs` allows starting the firefight profile without touching the UI.
const requestedMode = query.get('mode');
if (requestedMode && GAME_MODES[requestedMode] && ui.mode) ui.mode.value = requestedMode;

applyQuality(); applyModeChrome(); updateHud(); animate();
if (query.has('autostart')) begin();
