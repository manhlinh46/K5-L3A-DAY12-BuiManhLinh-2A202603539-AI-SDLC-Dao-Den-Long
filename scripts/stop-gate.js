#!/usr/bin/env node
// Claude Code Stop hook: block the agent from finishing while `npm test` is red.
// Exit 2 = blocking error; stderr is fed back to the agent.
import { spawnSync } from 'node:child_process';

const r = spawnSync('npm', ['test', '--silent'], { encoding: 'utf8', shell: true });
if (r.status !== 0) {
  const tail = (r.stdout + r.stderr).split('\n').filter((l) => /✖|not ok|Error|expected|actual/.test(l)).slice(0, 30).join('\n');
  process.stderr.write(`Stop blocked: npm test is failing. Fix before finishing.\n${tail}\n`);
  process.exit(2);
}
