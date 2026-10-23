# Farm FPS — Implementation Plan

## Context

Build a complete, playable browser first-person shooter from scratch: one human player against AI
bots, free-for-all deathmatch, set on a fenced farm. Three.js plus plain JavaScript ES modules,
Vite dev server, no paid or downloaded assets — all geometry, textures and sound generated in code.

**Why a plan rather than straight to code.** The brief is detailed but leaves the two things that
decide whether the game is worth playing undecided: how movement feels, and how long a kill takes.
Both have well-documented ranges in shipped shooters and are easy to get badly wrong by guessing.
Three research passes gathered real numbers (Counter-Strike, Valorant, Quake III, Call of Duty,
Halo, Apex) and the current three.js API surface. Every gameplay constant below traces to one of
those sources rather than to invention.

**Repository state.** `/Users/steck/projects/farm-fps` is a git repo on `main` with zero commits.
It contains only `.gitignore`, an empty `src/`, and `specs/farm-fps-implementation-plan.md` (a
draft of this plan). Four scaffold files written before planning were moved to Trash. Nothing
pre-existing belongs to the user, so there is nothing to preserve or integrate with.

**Intended outcome.** A game that holds 60 fps with ten bots, reads as a deliberate low-poly farm
rather than untextured placeholder boxes, and whose bots are beatable on Medium by an average
player.

## Decisions

Settled with the user across four interview rounds.

| ID | Decision | Rationale |
|----|----------|-----------|
| DEC-1 | Play area 80x80 m fenced; 120x120 m visual extent beyond the fence | 582 m2 per fighter at 11 fighters — within 1% of de_dust2's measured ~580 |
| DEC-2 | Buildings clustered centrally, fields and crop rows in the outer ring | Concentrates engagements; outer ring becomes flanking routes, not dead space |
| DEC-3 | Barn and garage enterable; house and sheds solid | Interiors are where bot AI fails — prove doorways on two buildings before opening more |
| DEC-4 | Match length 3 minutes, fixed | User decision |
| DEC-5 | Feel is a menu choice — Arcade / Balanced / Tactical, default Balanced | Presets, not raw sliders: a bad slider combination reads as a broken game |
| DEC-6 | Difficulty Easy / Medium / Hard; Medium is beatable by an average player | The default tier decides whether the first match feels fun or broken |
| DEC-7 | Hitscan for all three guns, tracers cosmetic only | Makes bot accuracy a single error-cone number instead of a lead-prediction problem |
| DEC-8 | Low-poly geometry, naturalistic materials and lighting | User decision: "more realistic, but lowpoly style" |
| DEC-9 | three.js pinned to exactly `0.186.1` | Verified current on npm this session (`npm view three version`) |
| DEC-10 | `WebGLRenderer`, not `WebGPURenderer` | three.js manual still labels WebGPU experimental and names WebGL the recommended path |
| DEC-11 | Hand-written circle-vs-box collision; no physics engine | ~10 movers and ~100 static boxes; a physics library adds bundle weight and takes away control of step-up |
| DEC-12 | `Ray.intersectBox` against a `Box3[]`, not `Raycaster.intersectObjects` | Avoids scene-graph traversal entirely; a reported case had Raycaster drop a scene to 2 fps |
| DEC-13 | Bot AI written here: waypoint graph + steering + state machine | Yuka is unmaintained (last release 2022, OpenSSF maintenance 0/10); navmesh pipelines and GOAP are documented overkill at this scale |
| DEC-14 | Bot aim = reaction delay + shrinking aim-error cone + periodic re-aim | The model Counter-Strike ships in its public `botprofile.db` |
| DEC-15 | Instanced meshes for fence, crop rows, trees | Measured r186 benchmark: 10k separate meshes 10.3 ms/frame vs 0.16 ms instanced |
| DEC-16 | Nametags as `Sprite`, not CSS overlay labels | Sprites respect the depth buffer, so a name hides when its bot ducks behind cover |
| DEC-17 | Fixed-timestep physics with an accumulator, substepped | Identical play at 60 and 144 fps; prevents tunnelling through walls at sprint speed |
| DEC-18 | In: viewmodel, nametags, hitmarkers, headshots. Out: minimap | The first four are feedback the game feels broken without; a minimap is real UI work with little payoff at 80 m |

## Requirements

- **REQ-1** — holds 60 fps with 10 bots. Measured and reported at every milestone, never assumed.
- **REQ-2** — looks good: procedural textures, soft shadows, distance fog, readable silhouettes.
- **REQ-3** — no downloaded assets of any kind.
- **REQ-4** — code split into the modules the brief names: player, weapons, bots, map, UI, audio.
- **REQ-5** — README explaining how to install and run.

## Tunables

PH-0 writes these into `src/config/tunables.js`; every other slice imports from there and no slice
hardcodes a gameplay number.

### Feel presets

| | Arcade | Balanced (default) | Tactical |
|---|---|---|---|
| Walk / sprint / crouch (m/s) | 4.0 / 7.0 / 2.8 | 3.2 / 6.0 / 2.5 | 2.5 / 4.8 / 1.7 |
| Jump peak height (m) | 1.1 | 0.9 | 0.75 |
| Gravity (m/s2) | 20 | 18 | 16 |
| Rifle damage / rounds per min | 14 / 700 | 24 / 700 | 36 / 600 |
| Rifle shots to kill (time) | 8 (~600 ms) | 5 (~343 ms) | 3 (~200 ms) |
| Pistol damage / rounds per min | 18 / 350 | 26 / 350 | 35 / 300 |
| Shotgun pellets x damage | 8 x 11 | 8 x 15 | 8 x 20 |
| Karambit / pitchfork damage | 35 / 55 | 45 / 70 | 55 / 90 |
| Headshot multiplier | 2.5x | 3.0x | 4.0x |

Shared across all presets: 100 HP; eye height 1.7 m standing, 1.1 m crouched; collider height
1.8 m, radius 0.4 m; ground acceleration 40 m/s2, deceleration 50 m/s2, air control 25%; pitch
clamp +/-89 degrees; rifle damage falloff from 15 m to 40 m with a 70% floor; shotgun 6-degree
cone effective to ~6 m; magazines 12 / 30 / 6; reloads 1.8 s / 2.5 s / 0.6 s per shell; karambit
reach 1.5 m at 0.4 s per swing; pitchfork reach 2.5 m at 0.9 s.

Balanced is the default and the only preset tuned in depth; the other two reuse the same code
paths with swapped numbers.

### Difficulty tiers

| | Easy | Medium | Hard |
|---|---|---|---|
| Reaction delay (s) | 0.55 | 0.35 | 0.20 |
| Initial aim-error cone (degrees) | 25 | 14 | 7 |
| Cone decay per second | 0.35 | 0.8 | 1.6 |
| Re-aim interval (s) | 1.2 | 0.8 | 0.5 |
| Movement speed factor | 0.70 | 0.90 | 1.00 |
| Target prediction | none | linear | leading |

Reaction values bracket the researched human range (simple visual reaction ~0.19–0.22 s,
friend-or-foe discrimination ~0.38 s). Easy sits deliberately slower than a human.

## File layout

```
farm-fps/
  package.json  vite.config.js  index.html  README.md  .gitignore
  specs/farm-fps-implementation-plan.md
  src/
    main.js            bootstrap; menu <-> match <-> results state machine
    game.js            match rules, scoring, kill feed, fixed-timestep loop
    input.js           keyboard, mouse, pointer lock
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

## Key technical approaches

**Collision** (`src/world/collision.js`, written in PH-0). A registry of `THREE.Box3`. Fighters are
a circle of radius 0.4 m in the ground plane. Per substep: move horizontally, resolve penetration
against every box whose vertical span overlaps the fighter's, then resolve vertically and snap to
the highest box top beneath the fighter. Boxes shorter than a 0.5 m step threshold do not block
horizontally, which gives free step-up onto hay bales and door sills. Brute force over ~100 boxes
is trivial at 60 fps; no spatial structure needed.

**Hitscan** (`src/weapons/hitscan.js`). One `THREE.Ray` tested with `intersectBox` against the
static `Box3[]` and against a per-fighter body box and head box recomputed each frame. Nearest hit
wins. The same routine, with an early exit on first hit, serves as the bots' line-of-sight check.

**Loop** (`src/core/loop.js`). Accumulator draining fixed 1/60 s steps, clamped at 250 ms to avoid
a death spiral after a slow frame, with the movement/collision step substepped 5x following the
official `games_fps.html` pattern so a sprinting fighter cannot tunnel through a wall.

**Camera.** Pointer Lock with `unadjustedMovement: true` (feature-detected, falling back on
`NotSupportedError`), `YXZ` Euler order, pitch clamped to +/-89 degrees. Re-lock requires a fresh
click — Chrome 131+ rejects an automatic re-lock right after the user presses Escape.

**Bots** (`src/entities/bot.js`). State machine: roam, chase, attack, take cover, reload, dead.
Movement by steering toward a waypoint with raycast obstacle avoidance and separation from other
bots. Thinking runs at 10 Hz (the Quake III bot rate), movement every physics step.

**Rendering.** One directional sun with its shadow camera fitted tightly to the 80 m play area,
`mapSize` 2048, `normalBias` as the primary anti-acne control. `shadowMap.type = PCFShadowMap` —
`PCFSoftShadowMap` was removed in r186, the exact version being pinned. `outputColorSpace =
SRGBColorSpace`. Fence, crop rows and trees as `InstancedMesh`.

**Audio** (`src/audio/`). Pure Web Audio: noise burst into a gain envelope into a biquad filter per
gunshot, swept bandpass for melee whooshes, oscillator blips for hitmarkers, a procedurally
generated noise-decay buffer in a `ConvolverNode` for reverb. A fresh `AudioBufferSourceNode` per
shot over one shared noise `AudioBuffer`, 4–8 pooled voices per sound type, master
`DynamicsCompressorNode` so overlapping shots do not clip. `resume()` on the first click.

## Parallel execution groups

What makes parallelism safe is PH-0: it writes every shared constant and the full implementation of
the two modules everything depends on (`collision.js`, `fighter.js`), plus signature-only stubs for
every other module. After that each slice owns a disjoint file set and never edits another slice's
files.

Model per `rules/heavy-task-routing.md`: `opus` for all gameplay implementation, `sonnet` only for
mechanical DOM and CSS work.

### PH-0 — Foundation (SERIAL, inline, blocks everything)

Files: `package.json`, `vite.config.js`, `index.html`, `src/style.css`, `src/config/*`,
`src/core/*`, `src/world/collision.js`, `src/entities/fighter.js`, plus signature stubs for every
other module. Runs `npm install` and confirms a blank Vite page renders. Done inline rather than
delegated, because it is the contract every other slice reads.

### M1 — "walk the farm"

Parallel after PH-0; disjoint files, no input dependency between them.

| Slice | Files | Model |
|---|---|---|
| PH-1-world | `world/{map,buildings,props,materials,lighting}.js` | opus |
| PH-2-player | `entities/{player,models}.js`, `input.js` | opus |
| PH-3-audio | `audio/{audio,synth}.js` | opus |
| PH-4-ui-shell | `ui/{menu,hud}.js`, `style.css` | sonnet |

Then SERIAL integration in `game.js` and `main.js`.
**Playtest gate** — movement feel, map scale, frame rate with the full farm built.

### M2 — "shoot things"

| Slice | Files | Model |
|---|---|---|
| PH-5-weapons | `weapons/{weapons,hitscan,viewmodel}.js` | opus |
| PH-6-effects | `weapons/effects.js`, `world/spawns.js` | opus |

Then SERIAL: damage, death and respawn wired into `game.js`.
**Playtest gate** — weapon feel, measured time-to-kill against a stationary dummy, hitmarker and
audio feedback.

### M3 — "bots"

| Slice | Files | Model |
|---|---|---|
| PH-7-navigation | `world/waypoints.js` | opus |
| PH-8-bot-ai | `entities/bot.js` | opus |

PH-8 depends on PH-7's graph API, which PH-0 has already stubbed — so both start together, PH-8
building against the stub and binding the real graph when PH-7 lands.
**Playtest gate** — do Medium bots lose to an average player, and do bots handle the barn and
garage doorways.

### M4 — "the game"

| Slice | Files | Model |
|---|---|---|
| PH-9-match | `game.js` — rules, timer, kill feed | opus |
| PH-10-scoreboard | `ui/{scoreboard,results}.js` | sonnet |
| PH-11-menu | `ui/{menu,debug}.js` — full settings | sonnet |
| PH-12-readme | `README.md` | sonnet |

Then SERIAL: performance pass, tuning pass, final integration.

### Dependency graph

```
PH-0 ─┬─ PH-1 ─┐
      ├─ PH-2 ─┤
      ├─ PH-3 ─┼─ [M1 gate] ─┬─ PH-5 ─┬─ [M2 gate] ─┬─ PH-7 ─┐
      └─ PH-4 ─┘             └─ PH-6 ─┘             └─ PH-8 ─┴─ [M3 gate] ─┬─ PH-9  ─┐
                                                                            ├─ PH-10 ─┤
                                                                            ├─ PH-11 ─┼─ [M4 gate]
                                                                            └─ PH-12 ─┘
```

## Acceptance criteria

- **AC-1** — 60 fps with 10 bots on Hard, verified against an on-screen frame-time and draw-call readout.
- **AC-2** — under 100 draw calls with the full farm built.
- **AC-3** — no fighter can leave the fence, pass through a building, or fall through the ground.
- **AC-4** — bots enter and leave the barn and garage without sticking in a doorway.
- **AC-5** — Medium bots lose to an average player; Hard bots win.
- **AC-6** — every weapon's measured time-to-kill is within 15% of the tunables table.
- **AC-7** — a full match runs menu to results to replay without a page reload.
- **AC-8** — console clean: no errors, no three.js deprecation warnings.

## Verification

Run at every milestone gate, not only at the end.

1. `npm run dev`, open the page, play it. Movement and weapon feel cannot be unit-tested.
2. Dev-only debug overlay (backtick key): frame time, draw calls, triangle count, bot states,
   plus waypoint graph and collision boxes as wireframes.
3. Frame rate at 1, 5 and 10 bots on each difficulty — real numbers reported, not "feels smooth".
4. Time-to-kill measured in-game against a dummy and compared against the tunables table.
5. Collision sweep: walk the full fence perimeter, every building, every roof reachable by jump.
6. Browser console checked clean on load and after a complete match.

## Out of scope

Minimap, multiplayer or networking, mobile or touch controls, save files, weapon pickups,
vehicles, destructible geometry.

## Post-approval housekeeping

Rename this plan to a descriptive filename and keep the project copy at
`/Users/steck/projects/farm-fps/specs/farm-fps-implementation-plan.md` as the single source of
truth. Nothing gets committed without explicit permission.
