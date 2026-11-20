# AGENTS.md — Đảo Đèn Lồng

3D web game (Three.js) + deterministic headless sim, Test Contract **v1.3** (3 nights, lantern fuel, bench/soak). Requirements: lab board PRD-0 + Ticket-02/03/04 (copied into `docs/notes/phase-N.md`); lab rules: LAB.md, RULES.md.

## Commands
- Install: `npm install` · Play: `npm start` → http://localhost:5173 (`?night=2` start at a night, `?fps` FPS meter)
- Test (must be green before finishing — Stop hook enforces): `npm test`
- Headless: `node src/headless.js --seed 1 --night 1|2|3 --ticks 600 --out out/run.jsonl [--scenario f] [--inputs f]`
- Regenerate proof: `npm run proof -- <phase>` (writes `docs/proof/phase-N/`)
- Bench (GPU window): `node scripts/bench.js --seed 42 --duration 30 --out bench.json` · Soak: `npm run soak` · Leaderboard export: `node server.js --export-leaderboard out.json` · Static build: `npm run build:web`

## Layout
- `src/sim/` pure logic (no DOM, no Math.random, no Date): `game.js` step/snapshot (mandatory 12-step tick order is commented at the top), `maps.js` standard maps + `groundAt`, `run.js` tick loop, `validate.js` file checks.
- `src/headless.js` CLI (exit 0 ok / 1 error / 2 malformed file). `web/` renderer + flow + audio only — never game rules.
- `game.contract.json` tuning = Ticket-02 standard numbers; the sim reads it. Non-tuning constants live in `WORLD` (game.js) / `MAPS` (maps.js).
- `tests/*.test.js` node:test; `tests/scenarios/phaseN.json` headless cases (≥1 per feature). `docs/notes/` spec + AI log; `docs/proof/` evidence.

## Rules
- Contract output is graded automatically: exact event/field names, shade states `spawning|wander|chase|recoil|stunned|drain`, coords 3 dp, events before same-tick snapshot, `end` last.
- Counters that tick down in step 2 (stun, cooldowns, invuln, charm, TTL) — check off-by-one with a test when adding one.
- Lantern fuel is an integer in 1/60 units (`fuelU`); decay/drain/out happen in step 2. Use `isSafe`/`capacity`/`litNeeded` helpers, never re-derive. Design record: docs/adr/; breaking changes: CHANGELOG.md.
- Render many entities with instancing (`InstancedMesh`/`Points`), never one mesh per entity — bench has 200 shades. Bench mode (`createGame({bench:true})`) must never be reachable from the headless CLI.
- Randomness only through `g.rng`. Visual/creative extras live in `web/` and must not change headless output.
- New rule or tuning change ⇒ update test + `docs/notes/phase-N.md` in the same commit. A test broken by a new ticket: fix or remove it **with the reason** in notes.
- Tests derive expectations from tuning/spec; never paste program output as the expected value. Never hand-edit `docs/proof/`.
- Before asserting at tick N in a test, make sure the player is still alive / not hit by an unrelated shade (lesson from Phase 1 + 2).
- Browser checks via Playwright: finish each evaluate with Esc (pause) — real time keeps running between tool calls.
- Target Node ≥ 20 (CI: ubuntu + macos × Node 20/22) although the dev machine runs Node 24: no newer-only APIs/flags (e.g. `node --test` globs). `npm test` goes through `scripts/run-tests.js`.
- Small commits, one concern each. Do not delete harness files (AGENTS.md, .claude/).
