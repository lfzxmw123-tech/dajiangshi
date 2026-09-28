# Game upgrade progress

## Intent

Turn the existing LCC/Three.js FPS prototype into a stable survival slice without
replacing its LCC scene pipeline.

## Core loop

The player moves and aims to survive five escalating waves while ammunition and
close-range enemy pressure create risk. Accurate hits produce score and ammo
recovery; death gives a fast retry.

## First-pass constraints

- Preserve the existing plain-JavaScript and LCC SDK architecture.
- Desktop keyboard/mouse remains the primary target.
- The 98 MB Doom Slayer asset is a final-wave boss, not a mass-cloned enemy.
- Regular enemies use the lightweight animated female zombie GLB.
- Use custom arcade collision/separation; no physics dependency in this pass.

## Work items

- [x] Split regular-enemy and boss asset pipelines with failure fallback.
- [x] Add enemy state/attack telegraph and crowd separation.
- [x] Add performance and game-state diagnostics.
- [x] Improve muzzle lighting and loading/error feedback.
- [x] Verify model URLs, server range behavior, script execution, and live URL.

## Known risks

- The Doom asset has no authored animation clips; its boss motion is procedural.
- The scanned LCC scene has no supplied collision mesh or navigation mesh.
- Automated browser capture is unavailable until a browser runtime is connected.
- A headless Edge smoke capture works, but the 3DGS scene did not finish streaming
  inside the capture window, so boss motion still needs an interactive play pass.
