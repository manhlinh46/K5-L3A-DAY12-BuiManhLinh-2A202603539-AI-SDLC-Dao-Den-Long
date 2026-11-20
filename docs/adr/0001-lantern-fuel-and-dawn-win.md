# ADR 0001 — Lantern fuel state model and dawn win rule

- Status: accepted (Phase 3, Ticket-03 "Đèn cạn dầu", Contract v1.2)
- Supersedes: Phase 1/2 rules "lit lanterns accept nothing", "shades never enter a lit lantern's safe zone", "win as soon as all lanterns are lit"

## Context

Playtests: good players lit every lantern in ~2 minutes and the night ended early. The designer changed the goal from *light everything* to *keep the island lit until dawn*. Lanterns must be able to go out, be refuelled and relit; shades get a reason to attack lanterns; the night always lasts until dawn.

## Decision

### Lantern state

Before: `{ lit, deposited }` with a one-way transition `unlit → lit`.

After: `{ lit, deposited, fuelU, everLit, relit }`, with transitions:

```
            deposit ≥ cost (10, or 5 if everLit)          fuel ≤ 0 (step 2)
  UNLIT ───────────────────────────────────────▶ LIT ─────────────────────▶ UNLIT (everLit = true, deposited = 0)
                                                 │  ▲
                              refuel (E, used>0) └──┘  fuel = min(100, fuel + 10·used)
  LIT with fuel < 30  = WEAK: no safe zone, target of wandering shades (drain)
```

- **Fuel is stored as an integer number of 1/60 units** (`fuelU`, max 6000). Decay is `1` unit per tick (1.0/s) and drain is `5` units per tick per draining shade, so there is no floating-point drift. The value is rounded only on output (`fuel`, 1 decimal place).
- Decay, drain, `fuel_drain` events and "fuel ≤ 0 → out" all happen in **step 2** of the mandatory tick order, before movement and interaction. A consequence: a lit lantern is never exactly full when E is processed (it already lost 1/60), so pressing E next to a "full" lantern refuels one mote. We keep this literal reading of the spec and test it.
- `isSafe(L) = lit && fuel ≥ 30` replaces `lit` everywhere a safe zone is checked: blocking shades, shade spawn validity and the evict-on-relight logic. When refuelling brings a lantern from < 30 to ≥ 30, the same 30-tick eviction as "just lit" applies.
- Capacity is derived, not stored: `min(20, 10 + 2 × successful_lights)`. `successful_lights` counts every light, including relights, but not lanterns pre-lit by a scenario.

### Shade `drain` state

A new state is added to the shade machine (spawning / wander / chase / recoil / stunned / **drain**):

- `wander`: go to the nearest WEAK lantern (or the scenario `target_lantern_id` if that lantern is weak). If there is none, drift towards the nearest unlit lantern at 2 m/s and roam within 4 m of it ("như trước").
- Within 2 m of the target → `drain`: stand still and drain 5/s.
- `drain` → `chase` when Mây is within 6 m. `drain` → `stunned` when hit by a pulse (worth 15 instead of 5). `drain` → `wander` when the lantern goes out, is refuelled to ≥ 30, or is more than 2 m away.
- Stun now always ends in `wander` (Phase 2 went straight back to chase). The chase check resumes on the next tick.

### Win rule

- No early win. In step 11: no flames → `lost/no_flames` (checked first, even on the dawn tick). Otherwise, at dawn: lit lanterns ≥ `ceil(0.6 × total)` → `won/dawn_survived`, else `lost/dawn`.
- Dawn bonus (win only): Σ over lit lanterns of `50 + floor(fuel)`, plus `50 × flames`. The time bonus is removed (`per_second_left: 0`).

## Consequences

- Rules that the change replaced were removed from tests **with a written reason**. Nothing was skipped. See [docs/notes/phase-3.md](../notes/phase-3.md) §1.
- Headless outputs of old scenarios change (score values, durations, extra lantern fields). They are listed in [CHANGELOG.md](../../CHANGELOG.md).
- Expected scores now depend on fuel at dawn, so tests compute them from tick counts (e.g. 120 ticks of decay → floor(98)).
- Risk: the speed at which a wandering shade approaches a weak lantern (we use the chase speed of 4 m/s) and the "drift to nearest unlit lantern" behaviour are our interpretation, not numbers given by the ticket.
