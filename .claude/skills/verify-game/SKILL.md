---
name: verify-game
description: Run the full verification for Đảo Đèn Lồng and save evidence for the current phase. Use before tagging a phase, after changing src/sim, src/sim/maps.js or game.contract.json, or when asked for proof that the game works.
---

# Verify game and save proof

1. `npm test` — all suites must pass (sim, features, cli, scenarios). If red: fix the code, or the test if a ticket changed the rule (write why in `docs/notes/phase-N.md`). Never weaken an assertion just to pass.
2. Every new feature in the ticket needs ≥1 case in `tests/scenarios/phase<N>.json` (`night`, `snapshot_every`, `expect.events/no_events/snapshots/end`). Prove the checker is not vacuous: break one expectation temporarily and see it FAIL.
3. `npm run proof -- <N>` — runs all scenario cases through the CLI, the determinism double-run, full-night performance for nights 1–3 (≤ 30 s) and `npm test`; writes `docs/proof/phase-<N>/SUMMARY.md`. Every row must be PASS; a FAIL is a real bug — report it, never edit the file.
4. Browser (only when `web/` changed): `npm start`, Playwright at 1280×720:
   - `?night=K&fps` to reach a night directly; `window.__fps.avg` is the rolling FPS (DoD ≥ 30).
   - Drive keys with `dispatchEvent(new KeyboardEvent('keydown', {code}))`; end each evaluate with `Escape` so the game is paused before the screenshot (tool calls are slow; the game keeps running otherwise).
   - Save screenshots to `docs/proof/phase-<N>/screenshots/` and say which requirement each one shows.
5. Update the requirement → evidence table in `docs/notes/phase-<N>.md` (PASS / chưa đạt + lý do).
