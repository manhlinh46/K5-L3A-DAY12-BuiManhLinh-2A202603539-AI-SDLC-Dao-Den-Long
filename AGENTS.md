# AGENTS.md — Đảo Đèn Lồng

3D web game (Three.js) + deterministic headless sim. Requirements: lab board PRD/tickets; rules: LAB.md, RULES.md.

## Commands
- Install: `npm install` · Play: `npm start` → http://localhost:5173
- Test (must be green before finishing): `npm test`
- Headless: `node src/headless.js --seed 1 --night 1 --ticks 600 --out out/run.jsonl [--scenario f] [--inputs f]`
- Regenerate proof: `npm run proof` (writes `docs/proof/phase-N/`)

## Layout
- `src/sim/` pure game logic (no DOM, no Math.random, no Date). `game.js` step/snapshot, `run.js` tick loop, `validate.js` file checks.
- `src/headless.js` CLI (exit 0 ok / 1 error / 2 malformed file). `web/` renderer only: reads sim state, never changes rules.
- `game.contract.json` is the single source of tuning — the sim reads it; never duplicate numbers in code.
- `tests/` node:test. `docs/notes/` assumptions + AI log + retro. `docs/proof/` evidence.

## Rules
- Contract output is graded automatically: do not rename events/fields; coordinates rounded to 3 dp; events before same-tick snapshot; `end` line last.
- Any randomness goes through `g.rng` (seeded). Creative/visual extras live in `web/` and must not change headless output.
- New rule or tuning change ⇒ update test + `docs/notes/phase-N.md` assumption in the same commit.
- Tests derive expectations from tuning; never paste program output into a test as the expected value. Never hand-edit files in `docs/proof/`.
- Small commits, one concern each. Do not delete harness files (AGENTS.md, .claude/).
