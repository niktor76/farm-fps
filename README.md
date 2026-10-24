# Farm FPS

A browser first-person shooter built with Three.js. Free-for-all deathmatch:
one human player against AI bots, on a fenced 80x80 m farm, three-minute
matches. Every geometry, texture and sound is generated in code; there are no
downloaded or paid assets.

## Requirements and running it

Node `^20.19.0 || >=22.12.0` (from `node_modules/vite/package.json`'s
`engines` field, since this project does not pin its own). Vite 7 requires
this range.

```bash
npm install
npm run dev
```

`npm run dev` starts the Vite dev server and opens the page in your default
browser (`server.open: true` in `vite.config.js`). Click the canvas, and the
menu lets you set bot count, difficulty, feel preset and input settings
before you press Play.

```bash
npm run build     # production build to dist/, target es2022
npm run preview   # serve the dist/ build locally
```

## Controls

| Key | Action |
|---|---|
| `W` `A` `S` `D` | Move |
| `Shift` | Sprint (also speeds up keyboard turning) |
| `Control` / `C` | Crouch |
| `Space` | Jump |
| `Mouse button 1` / `F` | Fire |
| `R` | Reload |
| `1`-`5` / mouse wheel | Switch weapon |
| `Arrow keys` / `Q` `E` | Turn and look (keyboard look) |
| `Tab` | Scoreboard |

Source: `src/input.js` (`ACTION_BY_KEY_CODE`, `WEAPON_SLOT_BY_KEY_CODE`).

**Mouse or trackpad is a menu setting, not a detection.** Browsers cannot
reliably tell the two apart under pointer lock, so you choose one in the
Settings section of the menu. The choice changes how pointer movement is
handled: for Mouse the game requests `unadjustedMovement: true`, which turns
off the operating system's pointer acceleration; for Trackpad it does not,
because that acceleration is exactly what lets a short swipe cover a large
turn on a small pad (`src/input.js:requestLock`, `INPUT.devices` in
`src/config/tunables.js`).

Pointer lock engages when you click the canvas, and releases on `Escape`
(the browser's own pointer lock behaviour); re-locking needs a fresh click,
since Chrome rejects an automatic re-lock right after `Escape`.

## Settings

The menu (`src/ui/menu.js`) exposes, persisted to `localStorage`:

- **Bots** — slider, 1 to 10 (`MATCH.minimumBotCount`/`maximumBotCount`).
- **Difficulty** — Easy / Medium / Hard.
- **Feel** — Arcade / Balanced / Tactical.
- **Input device** — Mouse / Trackpad, see above.
- **Look sensitivity** — range depends on the selected device.
- **Keyboard turn speed** — 60 to 300 degrees/second for the arrow/`Q`/`E` look.
- **Volume**.
- **Show bot nametags** — checkbox.

### Feel presets

From `FEEL_PRESETS` in `src/config/tunables.js`:

| | Arcade | Balanced (default) | Tactical |
|---|---|---|---|
| Walk / sprint / crouch (m/s) | 4.0 / 7.0 / 2.8 | 3.2 / 6.0 / 2.5 | 2.5 / 4.8 / 1.7 |
| Jump peak height (m) | 1.1 | 0.9 | 0.75 |
| Gravity (m/s²) | 20 | 18 | 16 |
| Headshot multiplier | 2.5x | 3.0x | 4.0x |

Arcade is faster movement with a longer time to kill; Tactical is slower
movement with a fast, punishing time to kill; Balanced is the middle ground
and the only preset tuned in depth.

## Weapons (Balanced preset)

From `resolveWeapons('balanced')` in `src/config/tunables.js`, merging
`WEAPON_BASE` with `FEEL_PRESETS.balanced`:

| Weapon | Damage | Rate of fire | Magazine | Reload | Shots to kill |
|---|---|---|---|---|---|
| Pistol | 26 | 350 rpm | 12 | 1.8 s | 4 |
| Rifle | 24 | 700 rpm | 30 | 2.5 s | 5 |
| Shotgun | 8 pellets x 15 | 80 rpm | 6 | 0.6 s/shell | 1 (all pellets, close range) |
| Karambit | 45 | n/a, 0.4 s/swing | n/a | n/a | 3 |
| Pitchfork | 70 | n/a, 0.9 s/swing | n/a | n/a | 2 |

Shots-to-kill is `ceil(100 / damage)` against 100 HP, no falloff or
headshots. Measured rifle time-to-kill against 100 HP: Arcade ~600 ms,
Balanced ~343 ms, Tactical ~200 ms.

## How it is built

```
src/
  main.js            bootstrap; menu <-> match <-> results state machine
  game.js             match rules, scoring, kill feed, fixed-timestep loop
  input.js            keyboard, mouse, pointer lock
  style.css
  config/   tunables.js  names.js
  core/     loop.js  pool.js  rng.js  debugStats.js
  world/    map.js  buildings.js  props.js  materials.js  lighting.js
            collision.js  spawns.js  waypoints.js
  entities/ fighter.js  player.js  bot.js  models.js
  weapons/  weapons.js  hitscan.js  viewmodel.js  effects.js
  audio/    audio.js  synth.js
  ui/       menu.js  hud.js  scoreboard.js  results.js  debug.js
```

Decisions worth knowing before reading the code:

- **Hand-written collision, no physics engine** (`world/collision.js`).
  Circle-vs-box against a `THREE.Box3[]` registry; about 10 movers and 100
  static boxes, so brute force is trivial at 60 fps and keeps full control
  of step-up behaviour.
- **Hitscan, not projectiles** (`weapons/hitscan.js`). A `THREE.Ray` tested
  with `intersectBox` against the static boxes and per-fighter body/head
  boxes, nearest hit wins. Keeps bot accuracy a single error-cone number
  instead of a lead-prediction problem.
- **Waypoint graph with doorway reservations** (`world/waypoints.js`,
  `entities/bot.js`). Bots reserve a doorway node while passing through it,
  which prevents two bots deadlocking face to face in a narrow doorway.
- **Instanced meshes for repeated scenery** (fence, crop rows, trees) —
  measured far cheaper per frame than one mesh per object.
- **Procedural Web Audio** (`audio/audio.js`, `audio/synth.js`) — noise
  bursts and oscillators shaped with gain envelopes and filters, no audio
  files.
- **Sprite nametags** (`entities/models.js`), not CSS overlays, so a name
  respects the depth buffer and hides when its bot ducks behind cover.

## Known limitations

- Bots stay at ground level: elevated waypoints get pruned from the
  navigation graph.
- Aim assist is not implemented.
- The view model (weapon in view) uses a depth-clear trick rather than a
  true second render pass.

## Authors

- Ben Staples
- Viktor Steck

## Credits and licence

Three.js (`three@0.186.1`) is the only dependency. No other third-party
assets. This repository has no `LICENSE` file, so no licence is granted.
