# Farm FPS — Idea Collection

Captured 2026-10-25 from a brainstorming session. This document is the unfiltered
backlog: every idea gets a home here, whether or not it is ever built. Nothing in
it is a commitment.

`ROADMAP.md` is the companion document. It takes the ideas that are worth building
and puts them in an order. If the two disagree, the roadmap wins — this file is the
superset.

## How to read an entry

Each idea carries a stable `IDEA-n` id so the roadmap, commits and later discussion
can point at it without restating it. Ids are never reused and never renumbered.

Entries also carry a **size**, which is a rough implementation estimate, not a
promise:

| Size | Meaning                                                            |
|------|--------------------------------------------------------------------|
| S    | A few hours. Touches one or two modules, no new system.            |
| M    | A day. A new module, or a change that ripples through a few others. |
| L    | Several days. A new subsystem other code has to learn about.        |
| XL   | A different game. Weeks, and a decision to make before starting.    |

Where an entry says what the current code does, that was read from the source on
2026-10-25 and the file and line are given. Where it estimates, it says so.

---

## 1. Atmosphere and environment

The theme of this group: the farm currently looks the same for the whole match.
Everything here makes the world change while you are in it. Per unit of work this
is the highest-value group in the document, because the data these features need
mostly exists already.

### IDEA-1 — Continuous day cycle · size S

**What.** Instead of picking one lighting condition in the menu and keeping it for
the whole match, the sun moves: morning → midday → golden hour → night → morning.
A three-minute match could run through a compressed day, or the cycle could be slow
enough that one match sits inside one part of it.

**Why it is interesting.** It changes how a match *plays*, not just how it looks.
Sightlines close down as the light goes, so a position that was safe at midday is
exposed at golden hour and blind at night. That is a free source of variety: the
same map plays differently at minute three than at minute one.

**Code reality.** Cheaper than it sounds. All four lighting conditions already
exist as complete value sets in `src/config/tunables.js:460` (`DAY_CYCLES`), each
one defining sky colour, fog colour and distances, sun colour, intensity, elevation
and azimuth, and the hemisphere light. The work is interpolating between adjacent
presets and pushing the result into the live objects.

`createLighting` (`src/world/lighting.js:42`) currently applies a cycle once at
creation and returns `{ sun, hemisphere }`. It needs a sibling that re-applies a
blended cycle to `scene.background`, `scene.fog`, the hemisphere light and the sun.
Every one of those is mutable, so there is no architectural obstacle. The weapon
view model already learned this trick in 0.4.0 and has a `setDayCycle`.

**Open question.** How fast? A full cycle inside a three-minute match is novel but
may feel like a gimmick; a slow cycle across several matches is more natural but
most players will never see night. Worth trying the fast version first because it
is the one that changes a single match.

### IDEA-2 — Weather: rain · size M

**What.** Rain falls, the ground and surfaces read as wet, visibility drops, and
the sound bed changes.

**Why it is interesting.** Rain is the weather effect players notice most, and it
can carry real gameplay weight rather than being decoration: heavy rain shortens
sightlines, which favours the shotgun and the knife over the sniper, and it masks
footsteps, which favours flanking. That is a round-to-round shift in which weapon
is good — the same thing the day cycle does, from a second direction.

**Code reality.** The particle side fits the existing pattern well. `EffectSystem`
(`src/weapons/effects.js:51`) already runs the entire tracer, impact, muzzle-flash
and blood system on two `InstancedMesh` objects, for two draw calls total, with a
pool and an `update(deltaSeconds)`. Rain is a third instanced mesh of the same
shape, or a `Points` cloud, kept in a box that follows the camera so only the
visible volume is simulated. The draw-call budget is 150 (DEC-23), so one or two
more is not a concern.

The visibility part is free: fog already exists and is already per-cycle (see
IDEA-3). Wet surfaces are the expensive part — doing it properly means touching
material roughness across the material library, which is why this is M and not S.

### IDEA-3 — Weather: fog as a condition, not a constant · size S

**What.** Fog that rolls in and out during a match, rather than being a fixed
property of the time of day.

**Why it is interesting.** Fog is the single cheapest way to change the character
of a fight, because it directly sets the engagement range. A foggy minute turns a
long-range map into a close-quarters one and makes the sniper nearly useless, which
is exactly the kind of pressure that stops a match settling into one pattern.

**Code reality.** Fog is already in the scene — `src/world/lighting.js:47` creates
`new THREE.Fog(cycle.fogColor, cycle.fogNear, cycle.fogFar)`, and every day cycle
already supplies all three values. Night is the thickest at 35/120 and midday the
clearest at 85/220 (`src/config/tunables.js:460`). So this feature is animating
three numbers that are already being set, which makes it the cheapest idea in this
document.

It should be built together with IDEA-1, because both are "drive the lighting
values over time" and sharing that machinery means writing it once.

### IDEA-4 — Weather: storm · size M

**What.** Wind picks up, the wheat lies over, distant thunder, lightning flashes
that briefly light the whole field.

**Why it is interesting.** A lightning flash is a moment of total visibility in an
otherwise dark field, which is a genuinely interesting tactical event — everybody
sees everybody for a quarter of a second. It is also the most dramatic thing on
this list for the least rendering work, because a flash is one light intensity
spike rather than any new geometry.

**Code reality.** The wheat already moves in the wind via a shader (REQ-17), and
`gotchas.md` records that `materials.wheat` carries that wind shader. Driving its
strength from a weather state is the natural hook. The lightning flash is a short
intensity and colour ramp on the existing sun or a temporary extra light, which the
lighting module can already express.

### IDEA-5 — Ambient sound bed · size M

**What.** The farm has a background sound that matches the conditions: crickets and
an owl at night, birdsong and a distant tractor in the morning, rain on the barn
roof during a shower, wind through the wheat during a storm.

**Why it is interesting.** This is the single biggest perceived-quality jump
available. A silent world reads as a tech demo; an ambient bed reads as a place.
It also doubles as an information channel — if the crickets stop, something changed.

**Code reality.** This one needs a genuinely new capability, which is why it is M.
Every sound in the game today is a one-shot: `src/audio/audio.js` holds a recipe
table of short synthesised events (`gunshot`, `whoosh`, `blip` and noise kinds), and
there is no looping or continuously-playing layer anywhere in the module. An ambient
bed needs a sustained source whose gain and content cross-fade as conditions change.

The constraint that everything is generated in code (REQ-2) still holds, so crickets
are a synthesised chirp scheduled at randomised intervals rather than a sample.
Rain is filtered noise, which the existing noise generator can already produce; it
is the sustain and the cross-fade that are new.

**Note on scope.** The sound bed is wired to the condition system, so it should come
after IDEA-1 and IDEA-3 rather than before — otherwise there is nothing for it to
react to.

### IDEA-6 — Seasons · size L

**What.** Spring, summer, autumn, winter change the ground colour, the wheat's
state, the tree canopies and the light. Winter has snow cover and bare fields.

**Why it is interesting.** Seasons are the strongest visual variety per asset,
because they re-skin the entire map without a single new model. For a deathmatch
mode they are mostly cosmetic. For the farming mode (IDEA-20) they are structural —
the whole point of making hay is surviving a winter, so the season *is* the game
loop there.

**Code reality.** In deathmatch this is a palette and material swap plus a snow
particle layer, which reuses IDEA-2's work. Classed as L rather than M because the
material library is shared with everything else and a season has to touch most of
it coherently, and because snow on the ground interacts with the terrain work in
IDEA-8.

**Dependency note.** Seasons only pay for themselves in the farming mode. Building
them for deathmatch alone is the weakest value-per-effort trade in this group.

---

## 2. Maps and terrain

### IDEA-7 — More maps · size M each

**What.** Additional farm layouts beyond the current one, selectable in the menu.

**Why it is interesting.** Map variety is the classic answer to a game getting
stale, and the generator already exists, so a second map is largely a matter of a
different arrangement rather than new technology.

**Code reality.** The map is built procedurally from a seed, so the cheapest version
of this idea is exposing the seed rather than authoring maps by hand. That is close
to free and should be tried before anybody hand-builds anything. Note that the
balloon currently resolves to (24, 16) by picking the first clear pad from a
candidate list, so it already handles a changing map.

### IDEA-8 — Non-flat ground: slopes, hills, a brook · size L

**What.** The ground gets shape. A gentle overall slope, a low hill to fight over,
a brook cut into the terrain.

**Why it is interesting.** This is the biggest *gameplay* change in the document
that is not a new mode. Flat ground means every position is equivalent and every
sightline is the full length of the map. Height makes positions unequal, which is
what creates places worth taking and holding — the single most reliable source of
tactical interest in a shooter map. A brook adds a line you cannot cross casually,
which does the same job in the opposite direction.

**Code reality.** This is the one idea in the document that changes a core
assumption, so the estimate deserves detail.

The ground today is a flat `THREE.PlaneGeometry` at a constant height
(`src/world/map.js:97`, positioned at `WORLD.groundLevel`). Collision asks for
ground height through one function — `groundHeightAt(x, z, radius, ceilingY)` at
`src/world/collision.js:103` — which starts from the constant `WORLD.groundLevel`
and only ever raises it for a box the circle overlaps.

That single function is the chokepoint, and that is the good news: a heightfield
sampled there gives every fighter, bot and the balloon correct ground height with
one change. The visual side is a displaced plane, also contained.

The cost is everything that currently assumes flatness and would need auditing:
bot waypoints and their traversal, the spawn placement, wheat patch placement, the
clearance checks that decide where a patch or the balloon may sit, and the balloon's
own rise maths. None of those is hard individually; together they are why this is L.

**Worth noting.** `decisions.md` records a case where a stored assumption about the
collision system turned out to be wrong in the project's favour — a rising platform
needed no new collision code at all. The same may be true here, and the question is
cheap to settle: make `groundHeightAt` return a slope and see what visibly breaks.

---

## 3. Combat

### IDEA-9 — The sniper scope does nothing for accuracy · BUG · size S

**This is not an idea, it is a confirmed defect**, and it is the reason Ben's
observation was right. It is written up here because that is where the observation
was made; it belongs at the top of the roadmap.

**The symptom.** Looking through the sniper scope does not make you meaningfully
more precise. Only the zoom works.

**The root cause**, read from the source on 2026-10-25:

`src/weapons/weapons.js:166` computes the shot's cone as

```js
const spread = Math.max(weapon.baseSpread, fighter.effectiveSpread);
```

`effectiveSpread` (`src/entities/fighter.js:125`) is where the optic is applied: it
multiplies the accumulated spread by the optic's `spreadMultiplier`, ramped in by
how far you are scoped. But the `Math.max` then raises the result back to the
weapon's `baseSpread`, and every optic's multiplier only ever pulls spread *below*
that floor. So the floor cancels the optic entirely.

The sniper shows it worst because its numbers are the most extreme. `baseSpread` is
0.14 radians and the scope's `spreadMultiplier` is 0.02
(`src/config/tunables.js:243` and `:623`), so scoped it should fire a 0.0028 radian
cone. `spreadDirection` (`src/weapons/hitscan.js:165`) treats that value as a cone
half-angle, which at 50 metres means:

| State                  | Cone half-angle | Spread radius at 50 m |
|------------------------|-----------------|-----------------------|
| Unscoped (what you get) | 0.14 rad (8.0°) | 7.0 m                 |
| Scoped (intended)       | 0.0028 rad      | 0.14 m                |

A factor of fifty, and none of it reaches the player. The scoped sniper is firing
into a fourteen-metre-wide circle at fifty metres.

**It affects every weapon, not just the sniper.** All five optics set a
`spreadMultiplier` below 1 (`src/config/tunables.js:586`), and all five are
cancelled by the same floor. The sniper is simply the one where the gap is large
enough to notice.

**Caveat on the fix.** Removing the floor is a one-line change, but it is not
obviously the whole answer: the floor may also be what stops spread going to zero
in cases nobody wants, and the sniper's 0.14 base was presumably chosen *knowing*
the scope existed. The fix needs a measured time-to-kill pass afterwards, the way
the weapons were balanced originally.

### IDEA-10 — Grenades · size M

**What.** A thrown explosive with a fuse, area damage falling off with distance,
and a physical arc you have to lead.

**Why it is interesting.** Grenades are the standard answer to a defender who will
not leave cover, and this map now has concealment the player can create (the seed
bag). Without an area weapon, a crouched player in wheat is a problem with no
solution other than walking into their sightline. Grenades also carry directly into
the defence modes below, where holding a doorway against a wave is the core problem.

**Code reality.** Needs a projectile with an arc, which the game does not have —
every gun is hitscan by deliberate decision (DEC-7, tracers are cosmetic). So this
introduces the first genuinely moving projectile. The collision world can already
answer the queries a bouncing grenade needs. Area damage is a radius query against
the fighter list plus a line-of-sight check, which reuses the existing raycast.

Explosions want screen shake, a light flash and a sound — all of which the effect
and audio systems can already express.

### IDEA-11 — Mines · size S if grenades exist

**What.** A placed charge that arms after a delay and detonates on proximity.

**Why it is interesting.** Mines are the defensive counterpart to grenades, and they
are the natural fit for this game specifically: the seed bag already established
"place a thing on the ground that changes the map", so a mine reuses a pattern the
player has already learned.

**Code reality.** Once grenades exist, a mine is mostly the same damage code with a
different trigger, which is why the estimate drops to S. On its own it would be M.
The placement logic can follow the seed bag's, which already handles "where you are
looking, within range, not through a wall" — including the wall case, which was a
review finding fixed in 0.4.0.

---

## 4. Game modes

Everything above improves the game that exists. This section proposes different
games inside the same project. They are ordered by how much of the current code
they reuse, which is also roughly their cost order.

A prerequisite applies to all of them: **there is no concept of a game mode today.**
The match is a single hard-coded free-for-all. The first mode built has to pay for
a small framework — mode selection in the menu, mode-specific win conditions, and a
mode-specific heads-up display. That is a real but one-time cost, and it should be
counted against the first mode rather than pretended away.

### IDEA-12 — Farm Defence: the farmer against armed attackers · size L

**What.** You are the farmer. Waves of armed attackers come for the farm, and you
hold it. The existing bots become the attackers.

**Why it is the right first mode.** It reuses almost everything: the bots, their
AI, the weapons, the map, the buildings. What it adds is a wave structure, an
objective to defend, and a reason to care where you stand. It is also the mode where
grenades and mines pay off most, which makes IDEA-10 and IDEA-11 natural
predecessors rather than separate work.

It also changes the feel without changing the mechanics. Deathmatch is symmetric and
frantic; defence is asymmetric and tense, with pauses between waves. That contrast
comes almost free.

**Design questions worth settling early.**

- What exactly is being defended? A single building, several points, or your own
  survival? The answer decides whether the map needs a focal point it currently
  lacks.
- Do the attackers come from fixed directions, or anywhere? Fixed directions make
  mines and barricades meaningful; random spawns make them pointless.
- Is there any between-wave economy — repairing, re-placing mines, moving cover?
  A pause with something to do in it is what makes wave defence work.

**Code reality.** The bots already navigate the map via a waypoint graph and a state
machine (DEC-13). Giving them an objective instead of "find a player" is a change to
the state machine's goals rather than new navigation. Elevated waypoints are
currently pruned, which is why no bot uses the balloon — in a defence mode that
limitation becomes more visible and may need revisiting.

### IDEA-13 — Pest Defence: the farm against animals · size L

**What.** No human enemies. Coyotes and foxes come for the chickens, groundhogs
burrow and undermine, and the farmer drives them off.

**Why it is interesting.** This is the first idea that is genuinely a different
*game* rather than a different scenario, because the enemies do not fight back the
way a person does. A coyote is not trying to kill you, it is trying to take a
chicken and leave. That turns the problem from aiming into interception — you have
to be in the right place, not just on target — and interception is a different and
less twitchy skill. It is also the most approachable mode on this list for someone
who does not want a shooter.

**Code reality.** The main new cost is a non-humanoid creature: a four-legged model,
a different movement profile, and an AI with goals ("reach the coop, take a bird,
flee") rather than combat states. The existing bot state machine is a reasonable
template but not a reusable one.

It should come after IDEA-12 because it reuses the wave framework that mode has to
build, and because it needs the chickens from IDEA-20 to have anything to steal.

**Real-world grounding.** Research on what actually deters these animals is in
section 7, so the mechanics can be built on something real rather than invented.

### IDEA-14 — Termites and the barn · size L

**What.** Termites eat the wooden structures. The farmer spots the signs, treats
the ground and the wood, and replaces boards that are too far gone — which means
going to the barn, choosing the right material from what is stored there, and
fitting it.

**Why it is interesting.** This is the most distinctive idea in the whole document.
Nothing else here is unusual; a shooter with weather and a defence mode is a known
thing. A game about finding mud tubes on a sill plate and deciding whether a beam
can be sistered or has to be replaced is not. It is a slow, diagnostic, satisfying
loop, and it is the one idea that would make this project memorable rather than
competent.

It is also the strongest argument that the farming direction is a separate game,
because it shares nothing with a shooter except the first-person camera.

**Why it needs research, and why that matters.** The whole appeal is that the
process is real. Invented termite mechanics would be exactly as interesting as
invented anything else. The research is in section 7 and the mechanic should be
built from it.

**Code reality.** Needs per-structure damage state on buildings, an inspection
interaction, a material inventory in the barn, and a repair interaction. None of it
is technically hard; it is a lot of new surface, and it needs the interaction
framework from IDEA-20 to exist first.

### IDEA-15 — The modes are selectable, and the game keeps its identity · size M

**What.** A mode framework: the menu offers modes, each mode defines its own setup,
win condition and heads-up display, and the shared systems do not have to know which
one is running.

**Why it is here as its own entry.** Because it is the thing that will be built
badly if it is not planned. The cheap path is to bolt the second mode onto the first
with conditionals, and the cost of that shows up at the third mode. Naming it as its
own piece of work makes it a decision rather than an accident.

---

## 5. Farm life

This group is one coherent idea split into pieces. Together it is a farming game
that happens to live in this repository.

**The decision this group implies.** The owner's position, stated in the session: it
can be built here first, and if it turns out to be fun it can be split into its own
game. That is the right call and it costs nothing today — but it should be revisited
before this group gets large, because from IDEA-20 onward the shared code between
the shooter and the farm is close to zero.

### IDEA-16 — Chores as a game loop · size L

**What.** Feed the chickens, collect the eggs, check the cows, make hay. Tasks that
recur, take time, and have consequences if skipped.

**Why it is interesting, and the risk.** The whole genre runs on this, so it clearly
can work. But a chore is fun only when it is a decision and tedious when it is a
button — and the difference is almost entirely in the design, not the code. The
research in section 7 covers what the genre actually does to stay on the right side
of that line, and this entry should not be built from intuition.

### IDEA-17 — Livestock: chickens and cows · size L

**What.** Animals that are alive in the simulation: they have health, they need
feeding, a cow can calve and the calf needs care.

**Why it is interesting.** Animals are the thing players form an attachment to, and
attachment is what makes a loss matter. A coyote taking a chicken (IDEA-13) is only
a real event if you knew that chicken was there.

**Open question the owner raised.** What does a farmer actually have to do for a
cow, and for a newborn calf? That is an honest gap and it is in the research brief.

### IDEA-18 — Seasons as a survival constraint · size M on top of IDEA-6

**What.** Winter is a resource problem. You make hay through the summer and it has
to last.

**Why it is interesting.** This is what turns a set of chores into a game. A chore
with no deadline is a task list; a chore that feeds a winter you can fail is a plan.
It is the cheapest way to give the farming mode a spine, because it reuses the
seasons from IDEA-6 and adds only a resource balance on top.

### IDEA-19 — Vehicles: the tractor · size L

**What.** A tractor you can get into and drive. Plough a field, mow it, haul things.

**Why it is interesting.** Driving is a change of pace and a change of camera, and
ploughing a field is one of the most reliably satisfying actions in the genre
because the result stays visible. It also connects the farming mode to the terrain
work (IDEA-8) — a field with shape is far more interesting to drive than a plane.

**Code reality.** A vehicle is a new kind of thing the game has no template for: it
moves on its own terms, carries the camera, and the player enters and leaves it. The
collision world is circle-versus-box and hand-written (DEC-11), which is fine for a
person and awkward for a vehicle with a heading. This needs its own design pass; the
estimate is the least reliable in this document.

Ploughing a field means modifying the ground, which is a heightfield or texture
change — another reason it sits after IDEA-8.

### IDEA-20 — The interaction framework · size M

**What.** A general way to walk up to a thing and do something to it: a prompt when
you are in range, a verb, a duration, a result.

**Why it is here.** Every idea in this section needs it, and like IDEA-15 it will be
built badly if it is not built deliberately. It is also the cheapest of the group,
so it is the natural first step into the farming direction and a good place to find
out whether the direction is fun before committing to it.

---

## 6. Constraints

These are not ideas, they are the rules the ideas have to respect. They come from
the session and from the existing project.

**CON-1 — No bought or downloaded assets.** Everything is generated in code
(REQ-2). This applies to every idea above: no sampled cricket sounds, no modelled
tractor. It is a hard constraint and it shapes what is cheap.

**CON-2 — The game must not get complicated to learn.** Stated directly: it should
be fun without the player having to study it first. This is the binding constraint
on the entire farming direction, which is the genre most prone to violating it.
Section 7 covers the established techniques for staying inside it.

**CON-3 — The draw-call budget is 150** (DEC-23, revised against measurement).
Every visual idea above is cheap in draw calls by construction — instanced meshes,
merged models — and new ones have to be too.

**CON-4 — Sixty frames per second with ten bots is still unverified on real
hardware** (REQ-6, open since the project started). Headless rendering is
software-only and cannot answer it. Every estimate above assumes there is headroom;
if there is not, the weather and particle ideas are the first to suffer. This should
be settled before the heavy groups are started.

**CON-5 — A second mode must feed the first, not gate it.** From the research in
section 7.4: the hybrids that work share one resource economy, and the ones that
fail bolt a mandatory secondary mode in front of the thing the player came for. So
no farming mode should ever be required to play the shooter, and wherever possible
its output should flow into something the shooter cares about.

**CON-6 — Weather that changes no decision is atmosphere, and should be labelled
as such.** From section 7.5. Each weather idea above has to name the decision it
changes, or be built as decoration deliberately rather than by accident.

**CON-7 — The sizes in this document are gut estimates and are not padded.** The
standard correction is two to three times, once bugs, audio, interface and
playtesting are counted (section 7.6). Treat an L as "most of a week".

---

## 7. Research

Researched 2026-10-25. Sources are linked where a claim rests on one. Two things
came out of this that change recommendations above rather than merely informing
them; both are marked **finding**.

### 7.1 Termites, for IDEA-14

The process is more game-shaped than expected. It is naturally a three-stage loop
of *diagnose → treat → repair*, each stage with its own tools and its own failure
mode, which is close to an off-the-shelf gameplay structure.

**Which termite.** Subterranean termites are the barn threat. They nest in soil and
must keep contact with it, so they get in either where wood touches the ground
directly — sill plates on wet earth, posts set into dirt — or by building **mud
tubes**, pencil-width tunnels of soil and saliva, up a foundation to bridge the gap.
Drywood termites, the other kind, live inside dry wood with no ground contact and
are a regional problem rather than a general farm one.
([USDA Forest Service](https://www.srs.fs.usda.gov/pubs/misc/misc%5Fhg064.pdf),
[UC IPM](https://ipm.ucanr.edu/home-and-landscape/subterranean-and-other-termites/))

**What fails first.** Sills, joists and headers, because they sit closest to the
ground and are the first wood encountered coming up out of the soil.
([UGA Extension](https://fieldreport.caes.uga.edu/wp-content/uploads/2025/08/B-1241_7.pdf))

**Why it is invisible, which is the whole game.** Subterranean termites eat along
the grain, taking the soft springwood and leaving the hard summerwood, and they
avoid breaking the surface because they will not expose themselves to air. A beam
can be hollowed to a shell and still look perfect. That is what makes the diagnosis
stage a real activity rather than a formality — you cannot see the damage, you have
to go and find it.

**The three diagnostic signs, and what each is good for as a mechanic:**

| Sign | What it tells the player | Mechanic role |
|---|---|---|
| Mud tubes on the foundation | Where they are coming *in* | A spatial clue pointing at the source |
| Hollow sound when tapped, probe sinks in | How bad *this member* is | A manual severity probe the player performs |
| Frass: hard six-sided pellets below a hole | An active infestation right here | A localised "it is happening now" marker (drywood only) |

Also real: discarded wings after a swarm, blistered paint, and visible sag — the
last being the point at which treatment is no longer the answer.

**Treatment, in the order a professional actually does it.** This maps almost
exactly onto a layered defence economy, which is the finding worth acting on:

1. **Inspect** — probe, tap, look for tubes. Decides whether there is anything live
   to treat at all.
2. **Spot treatment with liquid termiticide** — fast, local, applied at the active
   site. *The fast reactive tool.*
3. **Trench the perimeter** — dig a narrow trench against the foundation, at least
   six inches deep, flood it with diluted termiticide, backfill. About four gallons
   of mix per ten linear feet per foot of depth. A good barrier lasts eight to
   twelve years. *The medium-cost perimeter investment.*
   ([Arkansas Extension](https://www.uaex.uada.edu/farm-ranch/pest-management/docs/training-manuals/AG1154%20Termite%20Prevention%20and%20Control%20Methods%20Updated%2005012019.pdf),
   [Mississippi State](https://extension.msstate.edu/insects/termites/methods-termite-control))
4. **Bait stations** — plastic stations in the ground every ten to twenty feet
   around the perimeter, baited with plain cellulose until termites are found, then
   switched to a slow poison the workers carry home and share. Deliberately slow:
   weeks to months, because anything faster would teach the colony to avoid it.
   *The slow passive long game.*
   ([NC State](https://content.ces.ncsu.edu/termite-baiting-systems))
5. **Borate on the wood itself** — brushed or injected into framing that is staying.
   Interior and dry use only, because borate is water-soluble and washes out of
   anything exposed.
   ([CWC](https://cwc.ca/wp-content/uploads/durabilitybytreatment-BorateTreatedWood.pdf))
6. **Break the wood-to-soil contact** — the unglamorous structural fix. Six to eight
   inches of clearance between ground and sill, clear the debris, fix the drainage.

Fast/local, medium/perimeter, slow/passive is a complete tower-defence economy
arriving free from the real world.

**Repair, and the rule that makes it a decision.** Three outcomes, chosen by how
much of the member is gone:

- Under about 30% of the thickness, and not load-bearing: dig out the soft material
  and fill with two-part epoxy. Cured epoxy is stronger than the original wood.
- Load-bearing with roughly two-thirds of the cross-section still sound, damage not
  at a bearing point: **sister** it — bolt a matching new piece alongside so the new
  wood takes the load, extending at least 24 inches past the damage on each side.
- More than half the cross-section gone, or the damage sits at a bearing point:
  **replace**. Cut the bad section out entirely and scab in new lumber with full
  bearing at both ends.

**The best single mechanic in the research:** *treat first, repair second.* Patching
over a colony that is still alive fails within months, because the fresh wood simply
becomes the next meal. That is a rule the player can get wrong in a way that teaches
them something, and it costs nothing to implement — it is a check on a state flag.

**The material choice is already a good game decision**, four ways, with real
trade-offs:

| Material | Not in ground contact | In ground contact | Cost | The catch |
|---|---|---|---|---|
| Untreated pine | 5–10 yr | 1–3 yr | lowest | Cheap now, eaten soon |
| Pressure-treated | 30+ yr | 30+ yr | moderate | Treatment is an outer shell; cut ends must be re-treated |
| Borate-treated | comparable | not usable | small premium | Penetrates all the way through, but leaches outdoors |
| Naturally durable heartwood (cedar, black locust) | 20–50+ yr | 10–20+ yr | premium | Only the heartwood resists; the pale sapwood does not |

([UC ANR](https://ucanr.edu/sites/default/files/2026-04/anrcatalog%20Selecting%20Lumber%20for%20Outdoor%20Exposures%208144.pdf))
A nice piece of authentic friction: copper-based pressure treatment corrodes plain
steel and needs galvanised or stainless fasteners. Borate does not. That is a real
compatibility rule, free of charge.

**Unverified.** A widely-repeated claim that strength is down 80% before damage is
visible traces only to a secondary source. Use it as a plausible game number, not a
fact. Nobody states how long trenching takes in hours.

### 7.2 Farm pests, for IDEA-13

- **Coyotes and foxes.** Electric fencing is the most effective non-lethal deterrent
  — five or more alternating live and ground strands. Non-electric needs to be at
  least 5.5 feet high with a buried apron or a 15-inch outward lip, because they dig
  and they climb. Livestock guardian dogs run about a 75% success rate once bonded
  to the flock, and they work by patrolling, scent-marking and barking rather than
  by fighting. They supplement fencing, they do not replace it.
  ([Mass.gov](https://www.mass.gov/news/protect-your-poultry-from-predators),
  [Alberta Agriculture](https://www1.agric.gov.ab.ca/%24Department/deptdocs.nsf/all/agdex43/%24FILE/684-19.pdf))
- **Groundhogs.** The damage is burrows undermining foundations and holes that
  injure livestock, plus up to 1.5 lb of vegetation a day each. Buried L-shaped wire
  mesh works — down 12 inches, then bent 12 inches outward. Repellents barely work
  once a burrow is established.
  ([Michigan DNR](https://www.michigan.gov/dnr/managing-resources/wildlife/nuisance-wildlife/groundhog-woodchuck))

Three distinct deterrent shapes — barrier, guardian, burrow-proofing — so three
pests can want three different answers rather than three sizes of the same answer.

### 7.3 Keeping it learnable, for CON-2

The owner's constraint has an established body of practice behind it.

**Teach by drip, not by tutorial.** The relevant named technique is **progressive
disclosure**: introduce a system only when it becomes relevant, rather than up
front. *Kingdoms and Castles* opens with exactly **two** problems, homelessness and
hunger, so the player has room to learn the tools before attacks and other needs are
layered on; each building has one obvious purpose.
([Game Developer](https://www.gamedeveloper.com/design/teaching-players-without-tutorials-in-i-kingdoms-and-castles-i-))

**Full diegetic teaching is probably out of budget.** Teaching everything through
the world, as *Inscryption* does, is high-craft and expensive. The recommended
middle ground for a small team is free play plus a prompt that appears only when a
new system first becomes relevant — most of the benefit, a fraction of the cost.
([lonepiggy.com](https://www.lonepiggy.com/blog/onboarding))

**Make early failure cheap rather than impossible.** Onboarding works better when
real mistakes are possible but survivable — a lost chicken, not a burned barn. Risk
is what makes the player pay attention.

**What makes a chore a decision rather than a button.** Sid Meier's test: a decision
is not interesting if the player always picks the same option, or picks at random.
Interesting ones involve a trade-off, depend on the current situation rather than a
fixed rule, and — the part most often skipped — **give clear feedback afterwards**.
He also notes that roughly a third of the mechanics he tries get cut for not being
fun, which is the right expectation to carry into this backlog.
([GDC 2012](https://www.gamedeveloper.com/design/gdc-2012-sid-meier-on-how-to-see-games-as-sets-of-interesting-decisions))

**finding — juice is the cheapest thing on this entire list.** Steve Swink's *Game
Feel* and a 2024 controlled study of 1,699 players agree: immediate, legible
feedback on an action is what separates a satisfying repeated action from a tedious
one, and it works mainly by removing doubt about whether the action succeeded, not
by being spectacular. The study also found that **over-amplified feedback reduces
the player's sense of control** when it is not tightly tied to a legible outcome.
Applied here: a good sound, a particle and a short animation on "patched the board"
or "fed the chickens" buys more than another mechanic would, for far less work.
([Swink](https://www.gamedeveloper.com/design/game-feel-the-secret-ingredient),
[ACM study](https://dl.acm.org/doi/fullHtml/10.1145/3613904.3642656))

**Nested loops are what hold attention.** *Don't Starve* runs four at once: seconds
(harvest a resource), one day (gather, build a fire, survive the night), one season
(stockpile against a seasonal threat), and across runs. Night is the visible,
inevitable deadline that every daytime decision is measured against — which is why
failure there feels like bad preparation rather than bad luck.
([analysis](https://teemo.dev/game-design/dont-starve/systems/core-loop-day-cycle/))

### 7.4 Mixing a shooter with a farm — the risk, and the pattern that works

**finding — genre mixing is the harder path, not a shortcut.** Of the hit games of
2022, only about 11.8% were novel genre mixes; 88.2% were refinements of an
established genre. Three reasons given: balancing two interacting genres is far
harder than balancing one, you risk alienating both audiences instead of adding
them together, and if the genres are stacked rather than integrated you have simply
built two games.
([How To Market A Game](https://howtomarketagame.com/2023/02/22/editorial-maybe-mixing-genres-is-a-bad-idea/))

**The pattern that works is one shared economy.** *Deep Rock Galactic* fuses a
shooter with a mining sim by making the **same resource** fund both: ammo resupply
costs the ore you mine, so the two modes are one economy rather than two. *Stardew
Valley* makes combat the only system with a real loss condition and keeps it
structurally optional — but routes the entire metal economy through it, so it is
optional-but-valuable rather than either mandatory or pointless.
([DRG](https://asidehouse.com/respawn/deep-rock-galactic-the-co-op-loop-that-respects-your-time/),
[Stardew](https://teemo.dev/game-design/stardew-valley/systems/combat-system/))

**The failure mode to avoid by name:** a secondary mode that is mandatory and blocks
access to the one the player actually came for. The rule that falls out of it — a
bolted-on mode should be optional, and should feed resources into the main loop
rather than gate it.

### 7.5 Weather that is a system rather than a sky

The cleanest statement found, and worth adopting as a test: *if the weather changes
nothing the player can act on, cut it or call it atmosphere and stop pretending it
is a system.* ([Hayao Design Codex](https://hayao.dev/docs/codex/system-weather-and-time))

*The Riftbreaker* is cited as the failure case — its day/night cycle darkens the
screen and changes no strategy. Against that, *The Witcher 3* ties monster
difficulty, quest triggers and NPC behaviour to the clock, and *S.T.A.L.K.E.R.*
makes night both more dangerous and more rewarding, which is a trade the player can
actually weigh.

**The pattern that fits this project best is "day/night as a mode switch":** day is
the build-and-repair phase, dusk is the prep window, night is the attack. That is a
tower-defence wave gate wearing a day cycle, it is well-precedented, and it is cheap
on top of a cycle that is being built anyway (IDEA-1).

### 7.6 Scope discipline

- **The minimum viable version and the vertical slice are different jobs.** The
  first is the ugly build that contains the whole loop and answers only "is this fun
  at all". The second is a small part built to shipping quality, answering "how long
  does polish actually take". Conflating them is named as the main cause of scope
  blowup.
- **Multiply gut estimates by two to three** once bugs, audio, interface, and
  playtesting are counted. The sizes in this document are gut estimates and have
  *not* been multiplied.
- **Prefer a content multiplier to more content.** One rule that recombines with
  existing state beats more hand-authored content — and the example the source
  reaches for is literally *"one weather state alters visibility and sound"*.
  ([shipagame.dev](https://shipagame.dev/blog/how-to-scope-a-game))

### IDEA-21 — Rain feeds the termites · size S on top of IDEA-2 and IDEA-14

The research turned up a connection worth building on purpose. Wood below about 20%
moisture is essentially termite- and decay-resistant; a ventilated barn normally
sits at 8–14%. Soil contact and standing water wick moisture into the end grain and
push it past the threshold, and that is what makes the wood vulnerable.

So rain is not decoration in the farming mode — it is the termite risk dial. A wet
season raises moisture, raises the infestation rate, and makes drainage and
clearance worth maintaining. That is exactly the "shared economy" integration that
section 7.4 says is the difference between a hybrid that works and two games in one
binary, and exactly the "weather the player can act on" test from section 7.5.

---

## 8. Open questions

- **QST-1** How fast should a day cycle run relative to a match? (IDEA-1)
- **QST-2** Does removing the spread floor break the weapon balance that was
  measured originally, and what is the right `baseSpread` for a sniper whose scope
  actually works? (IDEA-9)
- **QST-3** What is being defended in Farm Defence, and do attackers come from fixed
  directions? (IDEA-12)
- **QST-4** At what point does the farming direction leave this repository? (section 5)
- **QST-5** Is there frame-rate headroom for weather at all? (CON-4, REQ-6)
- **QST-6** What resource could flow from a farming mode into the shooter, so the
  two share one economy rather than sitting side by side? (CON-5, section 7.4)
- **QST-7** Should the defence modes use night as the wave gate, making the day
  cycle structural rather than cosmetic? (section 7.5, IDEA-12)
