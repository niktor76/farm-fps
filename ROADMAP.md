# Farm FPS — Roadmap

Drafted 2026-10-25 from the backlog in `IDEAS.md`. That document holds every idea
and the reasoning behind each; this one proposes an order and says why.

**Nothing here is approved.** It is a proposal to argue with.

## How this order was chosen

Four rules, in priority order:

1. **Fix what is broken before building what is new.** One weapon currently does not
   work as designed.
2. **Prefer work that makes later work cheaper.** The lighting machinery in PH-2 is
   what weather, the ambient sound bed and the night-wave gate all run on.
3. **Prefer high fun per unit of effort.** Two findings from the research drive
   this: immediate legible feedback on an action beats adding another mechanic, and
   a rule that recombines with existing state beats more hand-authored content
   (`IDEAS.md` sections 7.3 and 7.6).
4. **Push the expensive, identity-changing work behind a decision gate.** The
   farming direction is a different game and should be entered deliberately.

Every phase ships on its own and leaves the game playable. Sizes come from
`IDEAS.md` and are **not** padded; the standard correction is two to three times
once bugs, audio, interface and playtesting are counted.

---

## PH-1 — Fix what is broken · size S

Nothing new. Three open items cleared so later work starts from a clean base.

| Item | What |
|---|---|
| IDEA-9 | The sniper scope does not improve accuracy. `weapons.js:166` floors spread at `baseSpread`, which cancels every optic's `spreadMultiplier`. Affects all five weapons; the sniper is where it is visible. |
| — | The revolver view model renders near-black in daylight. Confirmed pre-existing, probably the `darkMetal` material in the view scene rather than the revolver, so it likely affects several guns. |
| REQ-6 | Read the real frame rate with ten bots. Backtick opens the debug overlay. Only the owner can do this; headless rendering is software-only. |

**Why first.** The scope bug means a weapon the game advertises does not do what it
says. It is also a one-line change with a balance pass behind it, so it is cheap.

**Why REQ-6 belongs here.** It gates PH-2 and PH-3. If there is no frame-rate
headroom, the weather work has to be scoped down, and finding that out after
building it is the expensive order.

**Done when.** Scoped shots group measurably tighter than unscoped, with a
time-to-kill pass confirming the weapons are still balanced. The revolver reads
correctly in daylight. A real frame-rate number exists.

---

## PH-2 — A sky that moves · size S–M

**Ships:** IDEA-1 (continuous day cycle) and IDEA-3 (fog as a condition rather than
a constant), built together.

**Why together.** Both are "drive the lighting values over time", so the machinery
is written once. All four lighting presets already exist complete in
`tunables.js:460`, and `createLighting` (`lighting.js:42`) currently applies one at
creation and returns mutable objects. The work is a blend function and a setter.

**Why this is the first new thing.** It is the cheapest change in the document that
alters how a match plays rather than how it looks — sightlines close as the light
goes, so the same map is a different map at minute three. It is also the foundation
for three later things: the weather in PH-3, the ambient sound bed, and the night
wave gate the defence modes want.

**Design test it must pass** (CON-6): name the decision the player makes
differently because of it. If the answer is "none", it is decoration and should be
labelled as such. The current answer is engagement range, which is a real one.

**Done when.** A match visibly passes through the day, fog thickens and thins, and
the weapon view model tracks it (it already has `setDayCycle` from 0.4.0).

---

## PH-3 — Weather · size M

**Ships:** IDEA-2 (rain) and IDEA-4 (storm), on PH-2's machinery.

**Why here.** Rain and storm are the content multiplier the research names
explicitly — one weather state altering visibility and sound gives variety without
new hand-authored content. The particle side fits the existing pattern: the whole
effect system runs on two instanced meshes for two draw calls
(`weapons/effects.js:51`), and rain is a third in the same shape.

**Scope note.** Wet surfaces are the expensive part and are the thing to cut if
PH-1's frame-rate number comes back tight. Rain that falls, obscures and sounds
right is most of the value; rain that makes the barn glisten is the rest of the
budget.

**Hold back deliberately:** the ambient sound bed (IDEA-5). It wants a looping audio
layer the engine does not have today — every sound in `audio.js` is a one-shot — and
it is better built once there are several conditions for it to react to. Either late
in this phase or early in PH-4.

**Done when.** Rain and a storm run as states, each changing something the player
acts on, and the frame rate still holds.

---

## PH-4 — Ordnance · size M

**Ships:** IDEA-10 (grenades) and IDEA-11 (mines).

**Why here, before the defence modes.** Three reasons. It is the answer to a problem
the game now has — the seed bag lets a player create concealment, and there is no
area weapon to dig them out of it. It introduces the first moving projectile, since
every gun is hitscan by decision (DEC-7), and that is better done in the mode that
already exists than inside a new one. And it is the thing that makes wave defence
work, so building it first means PH-6 inherits it rather than paying for it.

**Order inside the phase.** Grenades first; mines are then mostly the same damage
code with a different trigger, which is why IDEA-11 drops from M to S once grenades
exist. Mine placement can follow the seed bag's, which already handles "where you
are looking, within range, not through a wall".

**Done when.** Both work in deathmatch with a measured damage falloff, and a
time-to-kill pass says the weapon balance survived.

---

## PH-5 — Ground with shape · size L

**Ships:** IDEA-8 (slopes, a hill, a brook) and IDEA-7 (more maps, starting by
exposing the map seed).

**Why here and not earlier.** It is the largest change to the existing game and the
only one that touches a core assumption, so it should come after the cheap wins and
before the new modes — the modes will be built on whatever terrain exists, and
building them twice is the thing to avoid.

**The cheap experiment to run first.** Ground height is asked for through exactly one
function, `groundHeightAt` (`collision.js:103`), which starts from the constant
`WORLD.groundLevel`. Make it return a slope and see what visibly breaks. That is an
afternoon and it converts the estimate from a guess into a list. There is precedent:
a stored assumption that a rising platform needed new collision code turned out to
be wrong, and the same cheap test is what settled it.

**What the estimate is really covering:** not the heightfield, but the audit of
everything assuming flatness — bot waypoints, spawn placement, wheat placement, the
clearance checks, the balloon's rise.

**Why maps ride along.** The map is already procedural from a seed, so exposing the
seed is nearly free and gives map variety without anybody authoring a map. Try that
before hand-building anything.

**Done when.** The field has shape, bots navigate it, and nothing that worked on
flat ground is broken.

---

## PH-6 — Modes, and the farm defended · size L

**Ships:** IDEA-15 (the mode framework) and IDEA-12 (Farm Defence — waves of armed
attackers, you hold the farm).

**Why this mode first.** It reuses nearly everything: the bots, their AI, the
weapons, the map, the buildings, and PH-4's ordnance. What it adds is a wave
structure and an objective. It changes the feel completely — deathmatch is symmetric
and frantic, defence is asymmetric and tense with pauses between waves — for very
little new machinery.

**The framework is called out separately on purpose.** There is no concept of a game
mode today; the match is a hard-coded free-for-all. The cheap path is to bolt mode
two onto mode one with conditionals, and the bill arrives at mode three. Building it
as a framework is a decision, not an accident, and the first mode pays for it.

**Use night as the wave gate** (QST-7). The research calls this the "day/night as
mode switch" pattern — day builds, dusk prepares, night attacks. It is
well-precedented, it makes PH-2 structural rather than cosmetic, and it costs almost
nothing on top of work already done.

**Settle before starting** (QST-3): what exactly is defended, and do attackers come
from fixed directions? Fixed directions are what make mines and prepared positions
meaningful; random spawns make them pointless. The map may need a focal point it
does not currently have.

**Known limitation to revisit.** Bots prune elevated waypoints, which is why none of
them uses the balloon. Acceptable in deathmatch; more visible in a defence mode.

**Done when.** Two modes are selectable, the shooter is untouched by the change, and
a defence match has a win and a loss condition.

---

## PH-7 — Pests · size L

**Ships:** IDEA-13 (coyotes, foxes, groundhogs).

**Why after PH-6.** It reuses the wave framework that mode had to build, and it needs
livestock to exist before anything can steal them — so it depends on the first slice
of PH-8 rather than being fully independent.

**Why it is worth doing at all.** It is the first genuinely different *game* on the
list, because the enemies are not trying to kill you. A coyote wants a chicken and
wants to leave. That turns aiming into interception, which is a different and much
less twitchy skill, and it makes the project approachable to someone who does not
want a shooter.

**The research gives three distinct deterrent shapes** — a barrier (fencing), a
guardian (a dog that patrols and barks rather than fights, about 75% effective), and
burrow-proofing (buried L-shaped mesh). Three pests wanting three different answers
is a real decision space rather than three sizes of the same answer. Details in
`IDEAS.md` 7.2.

**Done when.** Pests raid on a schedule, at least two deterrents work differently
from each other, and losing an animal costs something the player feels.

---

## PH-8 — The farm itself · size XL · **behind a decision gate**

**Ships, in slices:** IDEA-20 (the interaction framework), IDEA-16 (chores),
IDEA-17 (livestock), IDEA-14 (termites), IDEA-18 (seasons as a survival
constraint), IDEA-6 (seasons), IDEA-19 (the tractor), IDEA-21 (rain drives termite
risk).

**This is where the project stops being one game.** From here on the shared code
between the shooter and the farm is close to zero. The owner's position is that it
can start here and be split out later if it turns out to be fun, which is right and
costs nothing today — but it should be revisited before this phase gets large, not
after.

**Build the smallest proof first, and build it ugly.** The research is blunt about
this: the minimum viable version and the vertical slice are different jobs, and
conflating them is the main cause of scope blowup. The minimum version contains the
whole loop and answers only "is this fun at all".

The proposed first slice, in order:

1. **IDEA-20, the interaction framework** — walk up to a thing, a prompt appears, a
   verb, a duration, a result. Everything else in this phase needs it, it is the
   cheapest piece, and building it alone is a low-cost way to find out whether the
   direction is fun.
2. **One chore, with real juice.** Not a system of chores — one. The research
   finding worth acting on is that immediate legible feedback is what separates a
   satisfying repeated action from a tedious one, and that it buys more than another
   mechanic would. If one well-fed chore is not satisfying, ten will not be either,
   and that is the cheapest possible way to learn it.
3. **Termites (IDEA-14)**, because it is the most distinctive thing in the whole
   document and the one that would make the project memorable rather than competent.
   The real-world process is already a three-stage game — diagnose, treat, repair —
   with a layered defence economy (fast spot treatment, medium perimeter trench,
   slow bait stations), a four-way material trade-off, and one rule that is an
   excellent teaching mechanic: **treat before you repair, or the new wood is just
   the next meal.** All of it is in `IDEAS.md` 7.1 and should be built from there
   rather than invented.
4. Everything else, only if the above is fun.

**Two constraints bind this phase harder than any other.**

- **CON-2, it must stay learnable.** This is the genre most prone to violating it.
  Use progressive disclosure: one verb at a time, introduced when it first matters.
  *Kingdoms and Castles* opens with exactly two problems so the player has room to
  learn the tools. Keep early failure cheap — a lost chicken, not a burned barn.
- **CON-5, it must feed the shooter rather than gate it.** Genre mixing is
  statistically the harder path, and the named failure is a mandatory secondary mode
  blocking the one the player came for. The pattern that works is one shared
  economy: *Deep Rock Galactic* pays for ammo with the ore you mine, so two genres
  are one loop. QST-6 is open — what resource flows from the farm into the shooter?
  It should be answered before this phase starts.

**Gate.** Do not start PH-8 without answering QST-4 (does this stay in this
repository) and QST-6 (what is the shared resource).

---

## Not scheduled

- **IDEA-6, seasons, for deathmatch alone.** The weakest value-per-effort trade in
  the document. Seasons pay for themselves in the farming mode, where surviving a
  winter is the loop; as a re-skin for a three-minute shooter they are not worth L.
  Scheduled inside PH-8 instead.
- **IDEA-5, the ambient sound bed**, floats between PH-3 and PH-4 — it needs a new
  looping audio capability and several conditions to react to, so it is placed
  wherever those are ready rather than pinned.

## Open decisions

These block the phase named, and nothing else:

| Question | Blocks | What it is |
|---|---|---|
| QST-2 | PH-1 | Does removing the spread floor break the measured weapon balance, and what is the right `baseSpread` for a sniper whose scope works? |
| QST-1 | PH-2 | How fast should a day cycle run relative to a three-minute match? |
| QST-5 | PH-3 | Is there frame-rate headroom for weather? Answered by REQ-6 in PH-1. |
| QST-3 | PH-6 | What is being defended, and do attackers come from fixed directions? |
| QST-7 | PH-6 | Is night the wave gate? |
| QST-4 | PH-8 | At what point does the farming direction leave this repository? |
| QST-6 | PH-8 | What resource flows from the farm into the shooter? |
