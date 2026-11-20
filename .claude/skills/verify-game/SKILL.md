---
name: verify-game
description: Run the full verification for Đảo Đèn Lồng and save evidence for the current phase. Use before tagging a phase, after changing src/sim or game.contract.json, or when asked for proof that the game works.
---

# Verify game and save proof

1. `npm test` — all tests must pass. If red: fix the code (or the test if the requirement changed, and say why in docs/notes). Never weaken an assertion just to pass.
2. `npm run proof -- <phase>` (e.g. `npm run proof -- 1`) — runs every case in `tests/scenarios/`, the determinism double-run and `npm test`, writing real outputs to `docs/proof/phase-<phase>/` plus `SUMMARY.md`.
3. Open `docs/proof/phase-<phase>/SUMMARY.md`; every case must show PASS. A FAIL means a real bug — report it, do not edit the file.
4. Visual check (only when `web/` changed): `npm start`, open http://localhost:5173, screenshot start / playing (HUD visible) / win-or-lose screens into `docs/proof/phase-<phase>/screenshots/`.
5. Update the requirement → evidence table in `docs/notes/phase-<phase>.md` with the result (PASS / chưa đạt + lý do).
