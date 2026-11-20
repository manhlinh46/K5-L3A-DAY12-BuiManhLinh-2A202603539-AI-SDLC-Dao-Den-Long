# Changelog

## [1.0.0 / phase-4] — Ticket-04 "Bình minh: phát hành v1.0.0" · Test Contract v1.3

### Added
- **Benchmark** `node scripts/bench.js --seed 42 --duration 30 --out bench.json`: Chromium 1280×720 via puppeteer with vsync off; standard scene with 200 wandering shades, 100 motes and L1–L3 lit; orbit camera; reports avg_fps, p1_low_fps, frame_ms_p95, frames, load_ms and peak_mem_mb (RSS of the browser process tree).
- **Soak** `scripts/soak.js`: 10 nights in one process with seeded random input; reports crashes and RSS start/end.
- **Local leaderboard:** top 10 on disk (`data/leaderboard.json`), screen in the main menu, name entry after Dawn or a loss (3–12 characters, Vietnamese accepted), `node server.js --export-leaderboard out.json`. The static build falls back to localStorage.
- **Accessibility:** rebind every action (duplicate detection, reset to defaults, saved); captions for shade spawn (with an edge arrow), incoming wind, last 10 s and low fuel; reduced motion (no camera shake or screen flash); UI text ≥ 18 px; large text ×1.25.
- Static web release (`npm run build:web`), retro, Phase 4 notes and proof.

### Changed
- Shades and motes render with `InstancedMesh` / `Points` (bench on the dev machine: avg 75 → 633 FPS, p1 low 3 → 378). Render only; headless output is unchanged.
- `game.contract.json`: `contract_version` "1.3", new `bench_cmd` and `soak_cmd`. `run_cmd` is now `node server.js` so that `--export-leaderboard` can be passed directly (`npm start` still works).
- Sim: optional `bench` flag in `createGame`. It is never set by the headless CLI, so contract outputs are identical.
- `server.js` exports `startServer()` and serves the `/api/leaderboard` endpoints. It prints a clear message when the port is in use.

### Breaking changes
- None for the headless contract (v1.0–v1.2 behaviour kept). `run_cmd` changed from `npm start` to `node server.js` (same server).

## [phase-3] — Ticket-03 "Đèn cạn dầu" · Test Contract v1.2

### ⚠ Breaking changes
- **Win rule:** no more early win when every lantern is lit. A night only ends at dawn (win `dawn_survived` if lit lanterns ≥ ceil(0.6 × total): 3/5, 4/6, 5/7) or when the flames run out. `game_over.reason: "all_lit"` is no longer emitted.
- **Night durations:** 300/330/360 s → **240/270/300 s** (`night{1,2,3}_duration_s`).
- **Lanterns can go out:** fuel 100 on light, −1/s, out at 0 (`lantern_out`, `deposited` reset to 0). Lit lanterns now accept motes as **refuel** (previously ignored).
- **Interact target selection:** candidates are unlit lanterns **or** lit lanterns that are not full (was: unlit only).
- **Safe zone:** only lanterns that are lit with fuel ≥ 30 (was: any lit lantern).
- **Scoring replaced:** +5 per mote deposited (was +10), +100 first light, +40 relight, pulse +5 per shade (+15 if it was draining), dawn bonus Σ(50 + floor(fuel)) + 50 × flames. Time bonus removed.
- **Capacity:** 10 + 2 × successful lights (max 20), was a fixed 10.
- **Shade states:** new `drain`. A stun now ends in `wander` (was `chase` when Mây was within 12 m). A wandering shade drifts towards the nearest unlit lantern instead of roaming at random.
- **Snapshot:** lanterns gain `fuel`, `ever_lit`, `relit_count`. The player gains `capacity` (and `successful_lights`). Shades gain `target_lantern_id`.
- **Events:** new `refuel`, `lantern_out`, `fuel_drain`. `lantern_lit` gains `relight`.
- **Scenario:** lanterns accept `fuel`, `ever_lit`, `relit_count`. `player.successful_lights` and `shades[].target_lantern_id` are new.
- **Tuning:** new keys `fuel_max, fuel_decay_per_s, fuel_per_mote, relight_cost, win_ratio, drain_per_s, low_fuel_threshold, capacity_max`. `score` gains `per_relight, per_stun_drain, per_lit_at_dawn`, and `per_mote` changes to 5.

### Added
- Fuel bar over lit lanterns; lanterns and bars blink at 1 Hz when fuel < 30. Unlit lanterns are squashed 20 % and show a torn-paper mark.
- Colour-blind setting "Bảng màu dễ phân biệt" (saved): shade rim and eyes `#00B3FF`, UI warning colour white with ⚠.
- HUD: carried/capacity (up to 20 slots), "Đèn k/n (cần m)", refuel hint "E — Châm dầu".
- ADR 0001 (lantern state model and win rule), Phase 3 tests (`tests/phase3.test.js`) and 7 headless scenarios.

## [phase-2] — Ticket-02 "Ba hòn đảo" · Test Contract v1.1
- Standard numbers, 3 nights, dash, fall/respawn, pause, Wind Charm, Lost Wind drifters, contract v1.1 fields; CI on Node 20/22.

## [phase-1] — PRD-0 · Test Contract v1.0
- Night 1 playable, deterministic headless sim, contract v1.0.
