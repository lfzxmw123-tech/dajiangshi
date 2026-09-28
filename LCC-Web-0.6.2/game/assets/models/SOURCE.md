# Zombie_Basic model

- Creator: Quaternius
- Pack: Zombie Apocalypse Kit (March 2024)
- Source: https://quaternius.com/packs/zombieapocalypsekit.html
- Original download: https://drive.google.com/drive/folders/1mWP6sCHun7OUMHQeDNZLrXTteXlzWg_t
- License shown on the pack page: CC0 1.0 Universal
- License URL: https://creativecommons.org/publicdomain/zero/1.0/

The downloaded `Zombie_Basic.gltf` is self-contained. It includes its mesh,
skeleton, embedded texture, and the following animation clips: Crawl, Death,
HitReact, Idle, Idle_Attack, Jump, Jump_Idle, Jump_Land, No, Punch, Run,
Run_Arms, Run_Attack, Walk, Wave, and Yes.

# Animated_Female_Zombie model

- Creator: Ali Hasnain
- Source: https://sketchfab.com/3d-models/animated-female-zombie-5990107ff5da4d2ab8a7024f2664f564
- License: Creative Commons Attribution (CC BY)
- License URL: https://creativecommons.org/licenses/by/4.0/

The downloaded GLB is used as the primary infected character. Its converted
`Take 001` timeline is split into gameplay clips at runtime.

# swat model (CS mode enemy)

- Copied from: `three-player-controller-master/example/public/glb/swat.glb`
  in this workspace (the upstream three-player-controller example assets).
- Upstream project license: MIT (see `three-player-controller-master/LICENSE`).
- The upstream repository ships no per-asset attribution file for its `glb/`
  folder, so the original author of this character is not documented there.

Origin evidence found in the file itself: the skeleton uses Mixamo bone names
(`mixamorigHips`, `mixamorigRightHand`, 65 joints) and the materials are named
`Ch35_body`, `Ch35_body1`, `Ch35_body2`, which matches the Adobe Mixamo
"Character 35" naming convention. It contains 31 animation clips including
`rifle_idle`, `rifle_idle_aim`, `rifle_walk`, `rifle_run`, `rifle_shoot`,
`reload` and `death`.

UNRESOLVED LICENSING RISK: Mixamo characters are licensed to the downloading
Adobe account and redistribution of the raw asset is restricted. Confirm the
rights for this specific file before shipping the build publicly. It is used
here only for local development.

The rifle prop attached to the bot's right hand is the existing
`akm.glb` already present in this folder.
