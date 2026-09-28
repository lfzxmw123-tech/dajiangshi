# First standards upgrade — evidence

## Implemented

- Regular waves use the 1.4 MB animated female infected asset.
- The 97.8 MB / 925-joint Doom asset is reserved for the final boss.
- Boss loading begins during wave four and falls back to an elite regular enemy.
- Enemy chase, crowd separation, attack windup, timed damage, hit, death, and
  player-body separation are wired to gameplay state.
- Attack telegraph and boss health HUD communicate danger and progress.
- Seeded gameplay/effect randomness and runtime diagnostics were added.
- Warm muzzle lighting now reacts to each shot; the viewmodel has dedicated fill.

## Verification

- URL: `http://localhost:8097/LCC-Web-0.6.2/game/`
- Headless Edge loaded the real module and LCC SDK without JavaScript exceptions.
- GPU reported by the SDK: NVIDIA GeForce RTX 3060 / Direct3D 11.
- Regular GLB: HTTP 200, 1,424,460 bytes, `model/gltf-binary`.
- Boss GLB: HTTP 200, 97,791,132 bytes, `model/gltf-binary`.
- Smoke screenshots: `artifacts/active-play.png`,
  `artifacts/active-play-pass2.png`.
- Browser logs: `artifacts/edge-game.log`, `artifacts/edge-game-pass2.log`.

## Remaining risks

- The smoke screenshot was captured during LCC streaming, not active combat.
- Boss motion is procedural because the supplied Doom GLB contains no clips.
- There is no collision/nav mesh for the scanned environment; the current pass
  uses arena bounds, player/enemy blocking, and crowd separation only.
- The custom PowerShell server is suitable for local preview, not deployment.
- Visual regression baselines are deferred until active-play captures can be made
  after the complete 3DGS stream in a controllable browser session.
